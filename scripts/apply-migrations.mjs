import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
const { values } = parseArgs({ options: { application: { type: 'boolean', default: false }, from: { type: 'string' } } });
if (values.from && !/^[A-Za-z0-9_.-]+$/.test(values.from)) throw new Error('Prefijo de migración inválido.');
const baseUrl = process.env.INSFORGE_BASE_URL?.replace(/\/$/, '');
const apiKey = process.env.INSFORGE_API_KEY;
if (!baseUrl || !apiKey) throw new Error('Define INSFORGE_BASE_URL e INSFORGE_API_KEY. Nunca uses la API key en el frontend.');
async function sql(query) {
  const response = await fetch(`${baseUrl}/api/database/advance/rawsql`, {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }),
  });
  if (!response.ok) throw new Error(`Error SQL HTTP ${response.status}: ${await response.text()}`);
  return response.json();
}
await sql("CREATE TABLE IF NOT EXISTS public.schema_migrations(version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()); ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public.schema_migrations FROM PUBLIC,anon,authenticated;");
const existing = await sql('SELECT version,checksum FROM public.schema_migrations');
const applied = new Map((existing.rows || []).map(row => [row.version,row.checksum]));
const directory = new URL(values.application ? '../migrations/' : '../insforge/migrations/', import.meta.url);
const migrations = [];
for (const file of (await readdir(directory)).filter(name => name.endsWith('.sql') && (!values.from || name >= values.from)).sort()) {
  // Git stores LF; Windows checkout must not change a migration's fingerprint.
  const original = (await readFile(new URL(file, directory), 'utf8')).replace(/\r\n/g, '\n');
  const checksum = createHash('sha256').update(original).digest('hex');
  migrations.push({ file, original, checksum });
  if (applied.has(file) && applied.get(file) !== checksum) {
    throw new Error(`La migración aplicada ${file} fue modificada. Crea una nueva migración.`);
  }
}
// Validate every applied fingerprint before submitting any pending migration.
for (const { file, original, checksum } of migrations) {
  if (applied.has(file)) {
    console.log(`Ya aplicada: ${file}`); continue;
  }
  const body = original.replace(/^BEGIN;\s*/, '').replace(/COMMIT;\s*$/, '');
  if (body.includes('$migration$') || body.includes('$ddl$')) throw new Error('Delimitador SQL reservado en ' + file);
  const query = `DO $migration$ BEGIN
    PERFORM pg_advisory_xact_lock(687242);
    IF EXISTS (SELECT 1 FROM public.schema_migrations WHERE version='${file}') THEN
      IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version='${file}' AND checksum='${checksum}') THEN
        RAISE EXCEPTION 'La migración aplicada fue modificada';
      END IF;
      RETURN;
    END IF;
    EXECUTE $ddl$ ${body} $ddl$;
    INSERT INTO public.schema_migrations(version,checksum) VALUES ('${file}','${checksum}');
  END $migration$;`;
  await sql(query);
  const confirmed = await sql(`SELECT checksum FROM public.schema_migrations WHERE version = '${file}'`);
  if (confirmed.rows?.[0]?.checksum !== checksum) throw new Error(`No se confirmó la migración ${file}; se detiene el ejecutor.`);
  console.log(`Aplicada: ${file}`);
}
