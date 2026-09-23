param(
    [ValidatePattern('^[a-zA-Z0-9_-]{1,48}$')]
    [string]$Session = 'control'
)

$remoteCommand = "cd /home/deiv/hermes-persistente && docker compose exec -it -u 1001:1001 hermes /opt/hermes/.venv/bin/hermes chat --tui -s orquestar-herdr --continue $Session --create-if-missing"
ssh -tt deiv@hermes-contabo $remoteCommand
