param([switch]$Aplicar)
$ErrorActionPreference = 'Stop'
$repo = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$backup = [System.IO.Path]::GetFullPath((Join-Path $repo '..\respaldo-antes-flujo-atenciones'))
$manifest = Join-Path $backup 'checkpoint-files.json'
if (-not (Test-Path -LiteralPath $manifest)) { throw 'No se encuentra el respaldo inicial. No se modifica nada.' }
$original = Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
$integrityFile = Join-Path $backup 'checkpoint-sha256.json'
if (-not (Test-Path -LiteralPath $integrityFile)) { throw 'Falta el archivo de integridad del respaldo.' }
$integrity = @{}
foreach ($entry in (Get-Content -LiteralPath $integrityFile -Raw | ConvertFrom-Json)) { $integrity[$entry.path] = $entry.sha256 }
$current = @(& git -c "safe.directory=$($repo.Replace('\','/'))" -C $repo ls-files --cached --others --exclude-standard)
if ($LASTEXITCODE -ne 0) { throw 'No se pudo enumerar el repositorio.' }
$added = @($current | Where-Object { $_ -notin $original })
foreach ($relative in (@($original) + @($added))) {
  $target = [System.IO.Path]::GetFullPath((Join-Path $repo $relative))
  if (-not $target.StartsWith($repo + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { throw "Ruta fuera del proyecto: $relative" }
  $fileName = [System.IO.Path]::GetFileName($relative)
  if ($relative -match '(^|[\/])\.git([\/]|$)' -or ($fileName -like '.env*' -and $fileName -ne '.env.example')) { throw 'El respaldo no debe modificar Git ni archivos de credenciales.' }
}
foreach ($relative in $original) {
  $source = [System.IO.Path]::GetFullPath((Join-Path $backup $relative))
  if (-not $source.StartsWith($backup + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Respaldo incompleto: $relative" }
  if (-not $integrity.ContainsKey($relative) -or (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne $integrity[$relative]) { throw "Respaldo alterado: $relative" }
}
Write-Output "Respaldo: $backup"
Write-Output "Se restauraran $($original.Count) archivos y se retiraran $($added.Count) archivos nuevos."
Write-Output 'Se conservan Git, credenciales, node_modules y los datos locales de pruebas.'
if (-not $Aplicar) { Write-Output 'Vista previa. Para restaurar, detiene el servidor y ejecuta el mismo comando con -Aplicar.'; exit 0 }
foreach ($relative in $added) { $target = Join-Path $repo $relative; if (Test-Path -LiteralPath $target -PathType Leaf) { Remove-Item -LiteralPath $target -Force } }
foreach ($relative in $original) {
  $source = Join-Path $backup $relative; $target = Join-Path $repo $relative
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Falta el archivo de respaldo: $relative" }
  New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
  Copy-Item -LiteralPath $source -Destination $target -Force
}
Write-Output 'Restaurado el estado anterior, incluidos los cambios que ya estaban sin commit.'
