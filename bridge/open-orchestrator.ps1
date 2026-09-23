$ErrorActionPreference = 'Stop'

if ($env:HERDR_ENV -ne '1') {
    throw 'Ejecuta este script desde un panel de Herdr.'
}

function New-HerdrPane {
    param(
        [Parameter(Mandatory = $true)][string]$Direction,
        [Parameter(Mandatory = $true)][string]$Command
    )

    $created = (& herdr pane split --current --direction $Direction --cwd $PSScriptRoot --no-focus | ConvertFrom-Json)
    $paneId = $created.result.pane.pane_id
    if ([string]::IsNullOrWhiteSpace($paneId)) {
        throw 'Herdr no devolvió el identificador del panel nuevo.'
    }
    & herdr pane run $paneId $Command | Out-Null
    return $paneId
}

$bridgeCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$PSScriptRoot\start-bridge.ps1`""
$hermesCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$PSScriptRoot\open-hermes.ps1`""

$bridgePane = New-HerdrPane -Direction 'right' -Command $bridgeCommand
$hermesPane = New-HerdrPane -Direction 'down' -Command $hermesCommand

Write-Output "Bridge iniciado en $bridgePane; CLI de Hermes iniciado en $hermesPane."
