# Operación y diagnóstico de Hermes y sus bridges

Registro consolidado hasta el 7 de octubre de 2026. Describe la implementación
del repositorio y las comprobaciones realizadas, no una garantía de que los
equipos estén conectados permanentemente.

## Arquitectura y alcance real

Hermes corre en Docker en Contabo. Sus datos persistentes, configuración,
credenciales, memoria y skills viven en `data/hermes/`, excluido de Git. El
modelo predeterminado se cambió a `gpt-6.1-sol`, con proveedor `openai-codex` y
razonamiento `medium`. El gateway atiende Discord; el CLI interactivo es otro
proceso. Reiniciar el contenedor interrumpe ambos tipos de procesos, aunque
las conversaciones guardadas persistan.

```text
PowerShell / Linux -> SSH -> CLI Hermes en Docker Contabo
Hermes -> MCP HTTPS + token -> Tailscale Serve del equipo
       -> bridge 127.0.0.1:8787 -> Herdr local -> Codex
```

Abrir Hermes desde Windows sigue ejecutando Hermes en Linux/Contabo. Eso es
compatible con controlar agentes Windows mediante MCP. No instala Hermes
localmente ni abre automáticamente un bridge.

| Nodo | IP Tailscale registrada | MCP privado |
|---|---|---|
| Contabo, `hermes-contabo` | `100.116.77.50` | Cliente de los bridges |
| Linux, `deiv-linux` | `100.72.100.7` | `https://deiv-linux.tail281cfe.ts.net/mcp` |
| Windows, `deiv` | `100.98.108.124` | `https://deiv.tail281cfe.ts.net/mcp` |

Cada equipo necesita permanecer encendido y despierto, Tailscale conectado,
Herdr activo y el bridge ejecutándose en un panel. Sleep o apagado hacen
indisponible el nodo. El endpoint `/healthz` comprueba el proceso; `/mcp`
requiere además inicialización de protocolo y token. Un HTTP 200 de salud no
demuestra que Codex esté autenticado o que un agente sea controlable.

`allowedProjects` registra nombres y rutas puntuales. `allowedRoots` concede
lectura y descubrimiento Git bajo esas raíces. Linux se autorizó bajo
`/home/deiv`; Windows se amplió a sus discos locales, observándose `C:\` en
la última configuración leída. El bridge actúa como el usuario local, sin
elevarse a administrador. Root en Contabo no concede acceso al disco Windows.

La lectura de documentos no exige Git. `read_file` acepta rutas absolutas,
comprueba la ruta real para evitar escapar mediante enlaces y permite texto
o PDF con `pdftotext`. Windows necesita instalar ese extractor para PDFs;
la prueba Windows hasta ahora fue sobre texto JSON. PDFs escaneados pueden
necesitar OCR, que esta implementación no ofrece. El máximo de salida es
60.000 caracteres y se informa `truncated`; no hay paginación implementada.

## Inicio diario

### Linux

```bash
herdr
# Dentro de un panel Herdr:
hermes-workbench
```

El workbench abre bridge y CLI y ejecuta `tailscale serve --bg --yes 8787`.
Si el bridge ya vive, basta `hermes-cli`, o `hermes-cli tarea5` para otra
conversación. Los comandos son enlaces en `~/.local/bin` hacia los scripts
de `~/hermes-herdr-bridge`. No ejecutes workbench repetidamente: duplica paneles.

### Windows

Abre Herdr desde PowerShell normal, sin administrador. Dentro de sus paneles:

```powershell
# Solo conversar con Hermes de Contabo:
hermes-contabo windows

# Bridge y CLI en dos paneles nuevos:
hermes-workbench
```

Si no existen los atajos:

```powershell
powershell.exe -ExecutionPolicy Bypass -File "$HOME\hermes-herdr-bridge\install-hermes-shortcut.ps1"
. $PROFILE.CurrentUserAllHosts
```

Alternativas que no dependen del perfil:

```powershell
powershell.exe -ExecutionPolicy Bypass -File "$HOME\hermes-herdr-bridge\open-hermes.ps1" -Session windows
powershell.exe -ExecutionPolicy Bypass -File "$HOME\hermes-herdr-bridge\open-orchestrator.ps1"
```

`hermes-contabo windows` selecciona una conversación, no un nodo ni una skill
distinta. El nombre `hermes` puede ser otro ejecutable o una función agregada
manualmente: comprobar con `Get-Command hermes -All`. Los perfiles de Windows
PowerShell y PowerShell 7 pueden ser distintos; instalar/cargar el atajo en la
shell que realmente uses. `-NoProfile` no carga funciones del perfil.

Para iniciar únicamente el bridge, dentro de Herdr:

```powershell
powershell.exe -ExecutionPolicy Bypass -File "$HOME\hermes-herdr-bridge\start-bridge.ps1"
```

Windows workbench no configura Serve por sí mismo. Comprobar una vez:

```powershell
tailscale status
tailscale serve status
tailscale serve --bg --yes 8787
```

Mantén abierto el panel bridge. Para desconectar Herdr conservando procesos,
usa `Ctrl+B`, luego `Q`, conforme al atajo usado en esta instalación.

## Orden de diagnóstico

1. Comprueba Tailscale: `tailscale status` y ping al otro nodo.
2. Comprueba el listener local 8787 y `tailscale serve status`.
3. Consulta `node_health` por MCP desde Contabo, no solo desde localhost.
4. Consulta herramientas MCP: deben incluir `read_file` y las de agentes.
5. Consulta `list_projects` o lee una ruta absoluta conocida con `read_file`.
6. Comprueba `node_health.codexAccount.ready` antes de abrir Codex.
7. Inicia un agente y comprueba `agent_status`, `read_agent` y un prompt real.

En Windows el listener se comprueba con:

```powershell
Get-NetTCPConnection -LocalPort 8787 -State Listen
```

En Linux: `ss -lntp | rg ':8787'`. No publiques el token ni `auth.json` para
diagnosticar. La configuración solo guarda el nombre de la variable de token.

## Fallos observados y recuperación

| Síntoma | Causa comprobada o interpretación | Acción |
|---|---|---|
| MCP HTTP 502, pero ping funciona | Serve llega a un puerto sin bridge activo | Abrir `start-bridge` dentro de Herdr y verificar listener |
| Solo aparece `pacifiko-legacy-gt`, sin `read_file` | Proceso Windows seguía usando código/configuración antiguos | Ejecutar reparador y verificar herramientas de nuevo |
| MCP `read_file` existe en bridge pero no en Hermes | Lista `tools.include` o descubrimiento de la sesión | Permitir `read_file`, cerrar CLI y reabrirlo |
| Hermes dice que Linux no controla Windows | Explicación incorrecta del agente; no es incompatibilidad de SO | Consultar herramientas reales `mcp__windows_deiv__*` |
| `hermes-contabo` no se reconoce | Perfil/atajo ausente o sin cargar | Cargar perfil o usar `open-hermes.ps1` directamente |
| Linux `No such file or directory` en ambos paneles | Lanzador por symlink calculaba `~/.local/bin` como directorio del bridge | Versión con `readlink -f`; instalar script actualizado |
| `--current requires HERDR_PANE_ID` | Invocación fuera de un panel real | Ejecutar dentro de Herdr; `HERDR_ENV=1` solo no basta |
| Estado `idle` sin respuesta del agente | Antes `prompt_agent` devolvía solo el estado | Versión que adjunta transcript; consultar `read_agent` |
| JSON inválido al arrancar en Windows | BOM añadido al escribir con PowerShell | UTF-8 sin BOM; servidor ahora elimina BOM al leer config |
| `CODEX_HOME ... path does not exist` | No se creó el directorio del perfil | Crear carpeta y ejecutar `codex login` en ese perfil |
| Error de identidad en `auth.json` | Perfil sin login o correo distinto al configurado | Autenticar cuenta universitaria y consultar salud |
| Codex daemon exige terminal no elevada | Herdr/terminal elevados | PowerShell normal; bridge añade `--no-daemon` |
| Inicio/listado queda esperando al autorizar `C:\` | Recorrido síncrono del disco antes de crear agente | Inicio directo para proyectos puntuales; recorrido limitado y exclusiones |
| Codex abre pero no se controla por nombre | Herdr devolvió panel sin campo `name` | Mapeo persistente nombre → panel, detallado abajo |
| `Connection timed out` SSH mientras MCP funciona | SSH y MCP usan servicios/puertos distintos | Comprobar sshd/firewall; MCP puede seguir operativo |
| Linux falla al cambiar de red | Trabajo/U pueden bloquear Tailscale/DERP/SSH | Probar otra red tras comprobar estado; no regenerar llaves por defecto |
| curl rechaza certificado Fortinet | Inspección TLS observada en la red | Obtener CA legítima del administrador y configurar confianza; no desactivar TLS |

Los registros mostraron MCP `parked`, timeouts y `Server not initialized`
después de reiniciar bridges. Una sesión MCP antigua puede perderse al reiniciar
el servidor. Reabrir el CLI renueva su propio cliente; reiniciar el gateway
solo afecta su proceso, no actualiza mágicamente el catálogo de todos los CLI.
Una conversación nueva puede evitar suposiciones antiguas, pero no repara red,
autenticación o un proceso bridge viejo.

En Contabo, comprobar `docker compose ps` y logs recientes. Reiniciar
`docker compose restart hermes` solo cuando sea necesario: corta CLI activos y
temporalmente Discord. Para una terminal trabada, identificar el proceso
`hermes chat --tui` por fecha y cerrar solo ese árbol, conservando `gateway run`.

## Actualizar y reparar Windows

Un `git push` en Contabo no actualiza los archivos ni procesos Windows. Cambiar
`config.json` tampoco actualiza un bridge que ya lo cargó en memoria.

Dentro de un panel PowerShell de Herdr:

```powershell
$repair = "$HOME\hermes-herdr-bridge\repair-windows-bridge.ps1"
Invoke-WebRequest 'https://raw.githubusercontent.com/DeividArriaza/hermes-persistente/main/bridge/repair-windows-bridge.ps1' -OutFile $repair
powershell.exe -ExecutionPolicy Bypass -File $repair
```

El reparador valida sintaxis, descarga el servidor, conserva las demás claves
de config, autoriza discos locales, escribe UTF-8 sin BOM, respalda config y
detiene el listener si parece el proceso Node del bridge. Finalmente inicia el
bridge en ese panel. No instala dependencias ni autentica Codex ni instala
`pdftotext`. No detener otros procesos Node indiscriminadamente.

Autorizar un disco para lectura y buscar proyectos son operaciones distintas.
El escaneo actual ignora directorios del sistema/dependencias, baja hasta diez
niveles y tiene un límite de ocho segundos por raíz. Por eso `list_projects`
puede ser incompleto en discos grandes. Registrar proyectos frecuentes en
`allowedProjects` evita escaneo al iniciarlos; el acceso por `read_file` sigue
permitido bajo todas las raíces autorizadas.

## Autenticación y dos cuentas Codex

El bridge requiere `codexAccount.email` y `codexAccount.home` en config:

En Linux se verifico posteriormente que la cuenta universitaria ya estaba
autenticada en `/home/deiv/.codex`, pero config seguia sin esos campos desde
septiembre. Fue una migracion incompleta de configuracion, no una perdida
demostrada de credenciales. Se completo el perfil con esa ruta real.

El servidor conserva ahora `config.json.codex-account.json` junto a config,
fuera de Git y con permisos 0600 cuando el sistema los soporta. Contiene solo
correo y ruta, no tokens. Si faltan campos en config, recupera los del respaldo;
los campos declarados explicitamente tienen prioridad. Para cambiar cuenta,
actualizar config y reiniciar. Conservar ambos archivos al migrar o actualizar
el nodo; no reemplazar config con el ejemplo durante una actualizacion.

```json
"codexAccount": {
  "email": "lop24730@uvg.edu.gt",
  "home": "C:\\Users\\dlope\\.codex-universidad"
}
```

Preparar una vez:

```powershell
New-Item -ItemType Directory -Force "$HOME\.codex-universidad" | Out-Null
$env:CODEX_HOME = "$HOME\.codex-universidad"
codex login
codex login status
```

Seleccionar la cuenta indicada en el navegador. `Logged in using ChatGPT`
confirma login; el bridge comprueba además el correo del token y el estado.
No copiar tokens entre perfiles. Para cuenta personal, usar otro `CODEX_HOME`
en otro panel. El bridge actual admite un solo perfil declarado por nodo.
La propagación efectiva del perfil a la terminal recién abierta todavía debe
comprobarse en la prueba final; una variable del cliente Herdr puede no ser
heredada por su servidor persistente.

## Asociación nombre → panel

El 7 de octubre `agent_status` devolvió Codex idle en `wD:pG`, sin `name`.
La corrección guarda cada inicio en `config.json.agents.json`, ignorado por
Git, y traduce nombres a identificadores de panel en prompt y lectura. Estado
añade el nombre cuando encuentra la relación. No es un transcript de Codex.

Para adoptar una sesión antigua, guardar su nombre y panel actual en ese JSON
y reiniciar el bridge. Leer primero el archivo existente y conservar las
relaciones que aún sirvan. El ejemplo `pacifiko → wD:pG` fue válido en la
comprobación citada: no reutilizar ese panel como identificador permanente.
Tras cerrar/recrear una terminal, revisar la relación; el código actual no
depura automáticamente entradas obsoletas. La corrección debe validarse con
lectura y prompt real, no solo por nombre mostrado en el listado.

## Estado verificado y pendientes

| Fecha/contexto | Evidencia |
|---|---|
| Linux, lectura de tarea5 | MCP extrajo 7.600 caracteres de `/home/deiv/Universidad/software/tarea5.pdf` sin truncar |
| Windows tras reparador | Desde Docker se anunciaron siete herramientas y se leyó config.json con raíz `C:\` |
| Windows tras login universitario | `node_health` confirmó `ready: true` y correo universitario |
| Asociación Windows | Codex abierto en panel sin nombre; corrección publicada, validada en sintaxis, control completo aún pendiente |

OpenCode es parte del objetivo de arquitectura, pero el bridge actual no
expone `start_opencode`. Puede abrirse manualmente en Herdr; no afirmar que
Hermes lo automatiza con las herramientas actuales. La skill `jefe-delegador`
conserva arquitectura en Hermes y usa `gpt-5.6-luna` para implementación
acotada; el modelo orquestador y el de los trabajadores son independientes.

La implementación queda validada de extremo a extremo cuando Hermes, desde
su CLI recién abierto, lee un documento Windows, abre Codex con el perfil
correcto, encuentra su relación nombre/panel, envía una tarea de solo lectura
y recupera su respuesta. Esa prueba final es el pendiente principal.

## Cambios que explican la evolución

| Commit | Cambio |
|---|---|
| `1f0148d` | Resolver lanzador Linux por symlink |
| `954be23` | Codex sin daemon |
| `a7e87f5` | Publicación Serve y PATH Linux |
| `6574de6` | Transcript después de prompts |
| `3179733` | Descubrir Git bajo raíces |
| `66a9bef` | Atajos explícitos Windows |
| `8f1fd3e` | Lectura de documentos y perfil Codex |
| `0fcd0a7` | Reparador Windows y BOM |
| `f034262` | Evitar escaneo para proyectos puntuales y diagnosticar cuenta |
| `93642d6` | Persistir asociación agente/panel |

Para migrar, respaldar cifrado datos persistentes Hermes y secretos, y en cada
nodo conservar config, autenticación local y configuración Serve por separado.
Git contiene código e instrucciones; no contiene las copias privadas ni el
estado vivo de Herdr.
