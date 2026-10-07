$ErrorActionPreference = 'Stop'
if ($env:HERDR_ENV -ne '1') {
    throw 'Ejecuta este reparador dentro de un panel PowerShell de Herdr.'
}
$bridgeDirectory = Join-Path $HOME 'hermes-herdr-bridge'
$configPath = Join-Path $bridgeDirectory 'config.json'
$serverPath = Join-Path $bridgeDirectory 'src\server.js'
$downloadPath = "$serverPath.new"
$config = Get-Content $configPath -Raw | ConvertFrom-Json
$roots = @(Get-CimInstance Win32_LogicalDisk | Where-Object DriveType -eq 3 | ForEach-Object { "$($_.DeviceID)\" })
$config | Add-Member -NotePropertyName allowedRoots -NotePropertyValue $roots -Force
Invoke-WebRequest 'https://raw.githubusercontent.com/DeividArriaza/hermes-persistente/main/bridge/src/server.js' -OutFile $downloadPath
$source = [System.IO.File]::ReadAllText($downloadPath)
if (-not $source.Contains('server.tool("read_file"')) {
    throw 'El archivo descargado no contiene read_file. No se modifico el bridge activo.'
}
# Node requiere extension .js para comprobar modulos ESM.
$checkPath = Join-Path $bridgeDirectory 'src\server-check.js'
Copy-Item $downloadPath $checkPath -Force
try {
    & node --check $checkPath
    if ($LASTEXITCODE -ne 0) { throw 'El nuevo servidor no paso la comprobacion de sintaxis.' }
} finally { Remove-Item $checkPath -ErrorAction SilentlyContinue }
$listeners = @(Get-NetTCPConnection -LocalPort $config.listenPort -State Listen -ErrorAction SilentlyContinue)
foreach ($processId in @($listeners.OwningProcess | Sort-Object -Unique)) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId"
    if ($process.Name -ne 'node.exe' -or $process.CommandLine -notmatch 'server\.js' -or $process.CommandLine -notmatch 'config\.json') {
        throw "El puerto pertenece a otro proceso ($processId). No se cerrara automaticamente."
    }
    Stop-Process -Id $processId
}
Copy-Item $configPath "$configPath.backup" -Force
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json -Depth 20), $utf8)
Move-Item $downloadPath $serverPath -Force
Write-Output ('Raices autorizadas: ' + ($roots -join ', '))
Write-Output 'Servidor actualizado con read_file. Este panel mantendra activo el bridge.'
& (Join-Path $bridgeDirectory 'start-bridge.ps1')
