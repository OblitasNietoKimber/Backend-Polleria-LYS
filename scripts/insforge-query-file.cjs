// Ejecutar mediante npx --package @insforge/cli -- node ... para evitar el
// límite de 8191 caracteres de cmd.exe al pasar SQL largo como argumento.
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const file = process.argv[2];
if (!file || path.extname(file) !== '.sql') throw new Error('Se requiere un archivo SQL.');
const packageFile = process.env.PATH.split(path.delimiter)
  .map(dir => path.resolve(dir, '../@insforge/cli/package.json')).find(file => fs.existsSync(file));
if (!packageFile) throw new Error('Ejecuta este script mediante npx --package @insforge/cli.');
const metadata = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
const entry = path.resolve(path.dirname(packageFile), metadata.bin.insforge);
process.argv = [process.execPath, entry, 'db', 'query', fs.readFileSync(file, 'utf8'), '--json'];
import(pathToFileURL(entry).href).catch(error => { console.error(error.message); process.exitCode = 1; });
