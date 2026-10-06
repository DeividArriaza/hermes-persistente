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
function hermes-contabo {
    param([string]`$Session = 'control')
    & "`$HOME\hermes-herdr-bridge\open-hermes.ps1" -Session `$Session
}
function hermes-workbench {
    & "`$HOME\hermes-herdr-bridge\open-orchestrator.ps1"
}
$markerEnd
"@

$blockPattern = '(?s)' + [regex]::Escape($markerStart) + '.*?' + [regex]::Escape($markerEnd)
if ($profileText -match $blockPattern) {
    $updatedProfile = [regex]::Replace($profileText, $blockPattern, $block)
    Set-Content -Path $PROFILE.CurrentUserAllHosts -Value $updatedProfile
    Write-Output 'HERMES_SHORTCUT_UPDATED'
} else {
    Add-Content -Path $PROFILE.CurrentUserAllHosts -Value "`n$block"
    Write-Output 'HERMES_SHORTCUT_INSTALLED'
}
