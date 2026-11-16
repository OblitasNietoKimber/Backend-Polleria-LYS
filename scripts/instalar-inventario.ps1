param([switch]$Aplicar)
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
$file=Join-Path $repo 'migrations/inventario/20261116020000_inventario-compartido.sql'
$source=[IO.File]::ReadAllText($file).Replace("`r`n","`n")
$body=$source -replace '(?m)^BEGIN;\s*$','' -replace '(?m)^COMMIT;\s*$',''
$hash=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLower()
$query=@'
DO $install$
DECLARE before_data jsonb; after_data jsonb;
BEGIN
 BEGIN
  LOCK TABLE public.productos,public.pedidos,public.detalles_pedido,public.pagos,public.mesas IN SHARE ROW EXCLUSIVE MODE;
  SELECT jsonb_build_object('pedidos',(SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM public.pedidos t),
   'pagos',(SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM public.pagos t),
   'detalles',(SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM public.detalles_pedido t),
   'mesas',(SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM public.mesas t)) INTO before_data;
  EXECUTE $migration$__MIGRATION__$migration$;
  SELECT jsonb_build_object('pedidos',(SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM public.pedidos t),
   'pagos',(SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM public.pagos t),
   'detalles',(SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM public.detalles_pedido t),
   'mesas',(SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM public.mesas t)) INTO after_data;
  IF before_data IS DISTINCT FROM after_data THEN RAISE EXCEPTION 'Se alteraron datos de negocio'; END IF;
  INSERT INTO public.schema_migrations(version,checksum) VALUES('20261116020000_inventario-compartido.sql','__HASH__');
  __FINISH__
 EXCEPTION WHEN SQLSTATE 'P0099' THEN RAISE NOTICE 'Inventario validado con rollback; no se instalaron cambios';
 END;
END; $install$;
'@
$finish=if($Aplicar){'PERFORM pg_notify(''pgrst'',''reload schema'');'}else{'RAISE EXCEPTION USING ERRCODE=''P0099'',MESSAGE=''Revisión completada'';'}
$query=$query.Replace('__MIGRATION__',$body).Replace('__HASH__',$hash).Replace('__FINISH__',$finish)
Push-Location $repo
$queryFile=Join-Path ([IO.Path]::GetTempPath()) ('inventario-'+[guid]::NewGuid().ToString()+'.sql')
try {
 [IO.File]::WriteAllText($queryFile,$query,[Text.UTF8Encoding]::new($false))
 & npx -y --package '@insforge/cli' -- node scripts/insforge-query-file.cjs $queryFile
 if($LASTEXITCODE -ne 0){throw 'Falló la validación o instalación. No se confirmó la transacción.'}
 if($Aplicar){Write-Output "Inventario instalado. SHA256: $hash"}else{Write-Output 'Validación con rollback completada.'}
}finally{if(Test-Path -LiteralPath $queryFile){Remove-Item -LiteralPath $queryFile};Pop-Location}
