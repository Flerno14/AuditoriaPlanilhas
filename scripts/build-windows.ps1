param([switch]$PortableOnly)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$appVersion = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
if ($appVersion -notmatch '^\d+\.\d+\.\d+([+-][0-9A-Za-z.-]+)?$') {
  throw 'Versao invalida em package.json.'
}

$pythonCandidates = @()
if ($env:PYTHON -and (Test-Path -LiteralPath $env:PYTHON -PathType Leaf)) {
  $pythonCandidates += [PSCustomObject]@{ Command = $env:PYTHON; Arguments = @() }
}
if (Get-Command py.exe -ErrorAction SilentlyContinue) {
  $pythonCandidates += [PSCustomObject]@{ Command = 'py.exe'; Arguments = @('-3') }
}
$pythonCommand = Get-Command python.exe -ErrorAction SilentlyContinue
if ($pythonCommand -and $pythonCommand.Source -notlike '*WindowsApps*') {
  $pythonCandidates += [PSCustomObject]@{ Command = $pythonCommand.Source; Arguments = @() }
}

$python = $null
foreach ($candidate in $pythonCandidates) {
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  & $candidate.Command @($candidate.Arguments) -c 'import sys; assert sys.version_info >= (3, 10)' 2>$null
  $ErrorActionPreference = $previousErrorActionPreference
  if ($LASTEXITCODE -eq 0) {
    $python = $candidate
    break
  }
}
if (-not $python) {
  throw 'Python 3.10 ou superior não foi encontrado. Instale-o em https://www.python.org/downloads/windows/ e marque "Add python.exe to PATH". Depois abra um novo PowerShell e execute este comando novamente.'
}
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
  throw 'npm não encontrado. Instale Node.js para compilar o instalador.'
}

& $python.Command @($python.Arguments) -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar as dependências Python.' }
& $python.Command @($python.Arguments) -m pip install pyinstaller
if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar PyInstaller.' }
npm install
if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar as dependências Node.js.' }

& $python.Command @($python.Arguments) -m PyInstaller --clean --noconfirm --onefile --name bridge --distpath dist/python --workpath build/pyinstaller --paths . python/bridge.py
if ($LASTEXITCODE -ne 0) { throw 'Falha ao empacotar a ponte Python.' }

$electronOutput = Join-Path $projectRoot 'release\\win-unpacked'
$electronTemporaryOutput = Join-Path $projectRoot 'release\\win-unpacked.tmp'
$electronBuilt = $false
for ($attempt = 1; $attempt -le 3; $attempt++) {
  foreach ($output in @($electronOutput, $electronTemporaryOutput)) {
    if (Test-Path -LiteralPath $output) {
      $resolvedOutput = (Resolve-Path -LiteralPath $output).Path
      $releaseRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'release')) + '\'
      if (-not $resolvedOutput.StartsWith($releaseRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Diretorio de build fora de release: $resolvedOutput"
      }
      Remove-Item -LiteralPath $output -Recurse -Force
    }
  }

  if ($PortableOnly) {
    npm.cmd run build:electron:dir
  } else {
    npm.cmd run build:electron
  }
  if ($LASTEXITCODE -eq 0) {
    $electronBuilt = $true
    break
  }

  if ($attempt -lt 3) {
    Write-Warning "A tentativa $attempt de empacotar o Electron falhou. Tentando novamente em 3 segundos."
    Start-Sleep -Seconds 3
  }
}
if (-not $electronBuilt) {
  throw 'Falha ao empacotar o aplicativo Electron. Feche o Explorador de Arquivos em release e qualquer aplicativo Auditoria de Planilhas antes de tentar novamente.'
}

# The win-unpacked folder is self-contained; the ZIP distributes a portable copy.
$portableZip = Join-Path $projectRoot "release\AuditoriaDePlanilhas-Portable-$appVersion.zip"
if (Test-Path -LiteralPath $portableZip) {
  Remove-Item -LiteralPath $portableZip -Force
}
Compress-Archive -Path (Join-Path $electronOutput '*') -DestinationPath $portableZip -CompressionLevel Optimal
if (-not (Test-Path -LiteralPath $portableZip -PathType Leaf)) {
  throw 'Failed to create the portable package.'
}
if ($PortableOnly) {
  Write-Host "Portable package created: $portableZip"
  return
}

$installer = Join-Path $projectRoot "release\AuditoriaDePlanilhas-Setup-$appVersion.exe"
foreach ($artifact in @($installer, "$installer.blockmap", (Join-Path $projectRoot 'release\latest.yml'))) {
  if (-not (Test-Path -LiteralPath $artifact -PathType Leaf)) {
    throw "Artefato de distribuicao ausente: $artifact"
  }
}
Write-Host "Instalador NSIS e metadados de atualizacao criados em release. Versao: $appVersion"
