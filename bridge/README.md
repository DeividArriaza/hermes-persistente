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
