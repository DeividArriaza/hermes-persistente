# Hermes Herdr Bridge

Este proceso se inicia dentro de un panel de Herdr en cada nodo de trabajo.
Expone herramientas MCP para Hermes, pero conserva el control de Herdr en el
equipo local, donde existe `HERDR_ENV=1`.

El bridge escucha únicamente en `127.0.0.1`. Tailscale Serve publica su ruta
`/mcp` de forma privada con HTTPS; no se abre ningún puerto en el router ni en
Internet.

## Primera instalación en Windows

1. Copia este directorio a Windows y abre PowerShell en él.
2. Ejecuta `npm install`.
3. Copia `config.example.json` como `config.json` y registra sólo repositorios
   que Hermes pueda usar.
4. Genera un token aleatorio y guárdalo como variable de entorno de usuario:

   ```powershell
   [Environment]::SetEnvironmentVariable('HERMES_HERDR_BRIDGE_TOKEN', '<token-aleatorio>', 'User')
   ```

5. Abre Herdr dentro de un repositorio autorizado. En un panel propio de
   Herdr, inicia el bridge:

   ```powershell
   $env:HERMES_HERDR_BRIDGE_TOKEN = [Environment]::GetEnvironmentVariable('HERMES_HERDR_BRIDGE_TOKEN', 'User')
   .\start-bridge.ps1
   ```

6. Configura Tailscale Serve para enviar el HTTPS privado al puerto local 8787.
   El endpoint resultante es `https://<nombre-tailnet>/mcp`.

No subas `config.json` ni el token a Git.

## Primera instalación en Linux

Instala Herdr, Codex y Node.js como el usuario que posee los repositorios.
Después copia este directorio a `~/hermes-herdr-bridge`, ejecuta `npm ci` y
crea `config.json` desde el ejemplo. El token vive con permisos `0600` en
`~/.config/hermes-herdr-bridge/bridge.env`; no lo añadas a perfiles de shell ni
a repositorios.

Desde un panel de Herdr inicia el bridge así:

```bash
cd ~/hermes-herdr-bridge
./start-bridge.sh
```

Para levantar el entorno completo desde un panel inicial de Herdr, ejecuta:

```bash
~/hermes-herdr-bridge/open-orchestrator.sh
```

El script abre un panel para el bridge y otro para el CLI de Hermes. Sólo se
ejecuta una vez por arranque del entorno; al desconectar Herdr con `Ctrl+B`,
luego `Q`, los paneles siguen vivos mientras Linux siga encendido.

## Abrir Hermes desde Herdr

Desde cualquier panel de Herdr en Windows puedes abrir la conversación CLI de
Hermes con un único comando:

```powershell
Set-Location $HOME\hermes-herdr-bridge
powershell -ExecutionPolicy Bypass -File .\open-hermes.ps1
```

El script entra por SSH a Contabo y continúa la sesión `control`. Puedes usar
otro nombre seguro para una conversación separada:

```powershell
powershell -ExecutionPolicy Bypass -File .\open-hermes.ps1 -Session arquitectura
```

Para dejar el comando corto `hermes` disponible en nuevos paneles de PowerShell
y Herdr, ejecuta una sola vez:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-hermes-shortcut.ps1
```

Después puedes escribir `hermes` o `hermes arquitectura`.

## Abrir el entorno completo

Desde un panel inicial de Herdr, ejecuta una sola vez por cada arranque del
entorno:

```powershell
Set-Location $HOME\hermes-herdr-bridge
powershell -ExecutionPolicy Bypass -File .\open-orchestrator.ps1
```

El script abre dos paneles sin quitar el foco del panel actual: uno mantiene el
bridge MCP escuchando en el puerto 8787 y el otro abre el CLI persistente de
Hermes en Contabo. No lo ejecutes dos veces en la misma sesión, pues crearía
paneles duplicados. Para conservarlos al salir, desconecta el cliente de Herdr
con `Ctrl+B`, luego `Q`; no detengas el servidor de Herdr.
