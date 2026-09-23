$ErrorActionPreference = 'Stop'

if ($env:HERDR_ENV -ne '1') {
    throw 'Abre este script desde un panel administrado por Herdr.'
}

$token = [Environment]::GetEnvironmentVariable('HERMES_HERDR_BRIDGE_TOKEN', 'User')
if ([string]::IsNullOrWhiteSpace($token)) {
    throw 'Falta la variable de usuario HERMES_HERDR_BRIDGE_TOKEN.'
}

$env:HERMES_HERDR_BRIDGE_TOKEN = $token
Set-Location $PSScriptRoot
node .\src\server.js --config .\config.json
