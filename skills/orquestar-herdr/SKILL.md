---
name: orquestar-herdr
description: Coordina trabajo de desarrollo en nodos Herdr remotos mediante sus MCP privados. Úsala cuando el usuario pida iniciar, revisar o seguir trabajo de Codex/OpenCode en un equipo conectado.
---

# Orquestar nodos Herdr

Los nodos `windows_deiv` y `linux_deiv` son bridges MCP privados hacia los
Herdr de Deiv. Sus herramientas actúan como el usuario local y sólo pueden usar
proyectos listados por su propio `list_projects`.

Selecciona el nodo por disponibilidad y por proyecto: consulta primero
`node_health` y `list_projects` en el nodo candidato. Un equipo apagado o con
el bridge detenido es un nodo no disponible; no lo reintentes en bucle ni
supongas que sus repositorios existen en el otro sistema.

## Flujo obligatorio

1. Ejecuta `node_health` antes de delegar. Si no muestra `herdrContext: true`,
   indica que el bridge debe iniciarse desde un panel Herdr y no intentes
   controlar Herdr por SSH.
2. Ejecuta `list_projects`. Usa sólo un identificador devuelto por esa llamada.
   Nunca inventes una ruta ni pidas al bridge que salga de su lista autorizada.
3. Antes de `start_codex`, explica el proyecto y la tarea concreta al usuario.
   Usa un nombre de agente único y descriptivo, en minúsculas.
4. Después de iniciar, usa `prompt_agent` para enviar una tarea concreta. La
   herramienta espera hasta que el agente termine, quede inactivo o requiera
   atención y devuelve su transcripción reciente. Lee esa transcripción antes
   de responder al usuario: un estado `idle` o `done` no sustituye el resultado
   real del agente.
5. Si el transcript está truncado, el agente siguió trabajando, o necesitas
   comprobar un resultado posterior, llama a `read_agent` con `lines: 600`.
   Usa `agent_status` solo para estado operativo, nunca como sustituto de
   `read_agent`. No repitas una tarea si la espera vence.

## Límites

- El bridge no expone una terminal arbitraria ni acceso a archivos fuera de los
  proyectos registrados.
- No inicies más de un agente para la misma tarea sin que el usuario lo pida.
- No autorices, respondas ni fuerces interacciones bloqueadas de un agente sin
  mostrar primero el estado al usuario.
- Si un proyecto no aparece en `list_projects`, vuelve a consultar la lista:
  los repositorios Git bajo las raíces autorizadas se descubren
  automáticamente. Solo pide intervención si está fuera de esas raíces o no
  es un repositorio Git.
