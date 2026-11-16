$ErrorActionPreference = 'Stop'
$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$fixture = [System.IO.Path]::GetFullPath((Join-Path $tempRoot ('lys-restauracion-' + [guid]::NewGuid().ToString('N'))))
if (-not $fixture.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Ruta temporal invalida.' }
try {
  $repo = Join-Path $fixture 'proyecto'
  $backup = Join-Path $fixture 'respaldo-antes-flujo-atenciones'
  New-Item -ItemType Directory -Path (Join-Path $repo 'scripts'),(Join-Path $backup 'scripts') -Force | Out-Null
  & git init --quiet $repo
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el repositorio temporal de prueba.' }
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'restaurar-antes-atenciones.ps1') -Destination (Join-Path $repo 'scripts/restaurar-antes-atenciones.ps1')
  Set-Content -LiteralPath (Join-Path $repo 'original.txt') -Value 'estado anterior con cambios sin commit' -Encoding UTF8
  Set-Content -LiteralPath (Join-Path $repo '.gitignore') -Value '.env.local' -Encoding UTF8
  $files = @('original.txt','.gitignore','scripts/restaurar-antes-atenciones.ps1')
  foreach ($file in $files) { Copy-Item -LiteralPath (Join-Path $repo $file) -Destination (Join-Path $backup $file) }
  ConvertTo-Json -InputObject $files | Set-Content -LiteralPath (Join-Path $backup 'checkpoint-files.json') -Encoding UTF8
  $hashes = foreach ($file in $files) { [pscustomobject]@{path=$file;sha256=(Get-FileHash -LiteralPath (Join-Path $backup $file)).Hash} }
  ConvertTo-Json -InputObject @($hashes) | Set-Content -LiteralPath (Join-Path $backup 'checkpoint-sha256.json') -Encoding UTF8
  Set-Content -LiteralPath (Join-Path $repo 'original.txt') -Value 'cambio nuevo'
  Set-Content -LiteralPath (Join-Path $repo 'nuevo.txt') -Value 'archivo nuevo'
  Set-Content -LiteralPath (Join-Path $repo '.env.local') -Value 'CREDENCIAL_DE_PRUEBA=no-modificar'
  & (Join-Path $repo 'scripts/restaurar-antes-atenciones.ps1')
  if (-not (Test-Path -LiteralPath (Join-Path $repo 'nuevo.txt'))) { throw 'La vista previa modifico archivos.' }
  & (Join-Path $repo 'scripts/restaurar-antes-atenciones.ps1') -Aplicar
  if (Test-Path -LiteralPath (Join-Path $repo 'nuevo.txt')) { throw 'No se retiro el archivo nuevo.' }
  if ((Get-Content -LiteralPath (Join-Path $repo 'original.txt') -Raw).Trim() -ne 'estado anterior con cambios sin commit') { throw 'No se restauro el contenido original.' }
  if ((Get-Content -LiteralPath (Join-Path $repo '.env.local') -Raw).Trim() -ne 'CREDENCIAL_DE_PRUEBA=no-modificar') { throw 'Se modifico la credencial.' }
  if (-not (Test-Path -LiteralPath (Join-Path $repo '.git'))) { throw 'Se modifico Git.' }
  Write-Output 'PASS: vista previa, restauracion, archivos nuevos, credenciales y Git.'
} finally {
  $resolvedFixture = [System.IO.Path]::GetFullPath($fixture)
  if ($resolvedFixture.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase) -and [System.IO.Path]::GetFileName($resolvedFixture).StartsWith('lys-restauracion-')) {
    if (Test-Path -LiteralPath $resolvedFixture) { Remove-Item -LiteralPath $resolvedFixture -Recurse -Force }
  }
}
