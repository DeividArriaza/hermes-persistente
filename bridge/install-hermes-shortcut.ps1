$ErrorActionPreference = 'Stop'

$profileDirectory = Split-Path -Parent $PROFILE.CurrentUserAllHosts
New-Item -ItemType Directory -Force $profileDirectory | Out-Null
if (-not (Test-Path $PROFILE.CurrentUserAllHosts)) {
    New-Item -ItemType File -Force $PROFILE.CurrentUserAllHosts | Out-Null
}

$markerStart = '# >>> hermes-contabo shortcut >>>'
$markerEnd = '# <<< hermes-contabo shortcut <<<'
$profileText = Get-Content $PROFILE.CurrentUserAllHosts -Raw
$block = @"
$markerStart
function hermes {
    param([string]`$Session = 'control')
    & "`$HOME\hermes-herdr-bridge\open-hermes.ps1" -Session `$Session
}
$markerEnd
"@

if ($profileText -notmatch [regex]::Escape($markerStart)) {
    Add-Content -Path $PROFILE.CurrentUserAllHosts -Value "`n$block"
    Write-Output 'HERMES_SHORTCUT_INSTALLED'
} else {
    Write-Output 'HERMES_SHORTCUT_ALREADY_INSTALLED'
}
