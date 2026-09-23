# Hermes persistente

Infraestructura portable para ejecutar **Hermes Agent** como orquestador
personal en el servidor de Contabo. El propósito es mantener el contexto de
proyectos, coordinar trabajo entre dispositivos y delegar tareas de desarrollo
a sesiones locales de Codex y OpenCode administradas por Herdr.

El servicio ya está preparado para iniciarse con Docker Compose. La imagen es
reemplazable; el estado de Hermes vive en `data/hermes/`, fuera de ella. Esto
permite migrar el proyecto a otro servidor copiando los datos persistentes y
este repositorio.

## Estado actual

- Docker Compose y la configuración de persistencia están definidos.
- El dashboard queda publicado solamente en `127.0.0.1:9119`; se accede desde
  otro equipo mediante túnel SSH o una red privada como Tailscale.
- Hermes está autenticado con Codex y el bot de Discord está operativo.
- Contabo y Windows están unidos al tailnet; Hermes llega al usuario remoto de
  Windows mediante una clave SSH dedicada.
- Herdr 0.9.1 y Codex CLI 0.156.1 están disponibles en Windows. OpenCode aún
  debe instalarse en ese equipo si se quiere usar como agente.
- Falta implementar el puente local de tareas descrito en la arquitectura y
  validarlo sobre un repositorio de prueba.

Lee [la arquitectura](docs/arquitectura.md) antes de otorgar acceso a otros
dispositivos. Para preparar un equipo Windows como nodo de trabajo, usa la
[guía de Windows](docs/guia-windows-hermes-herdr.md).

## Inicio

1. Crea la configuración local, que no se versiona:

   ```bash
   cp .env.example .env
   ```

2. Descarga e inicia Hermes y el dashboard:

   ```bash
   docker compose pull
   docker compose up -d
   ```

3. Ejecuta el asistente inicial de Hermes y configura el proveedor de modelo:

   ```bash
   docker compose exec -it hermes hermes setup
   ```

4. Desde tu computadora, abre un túnel al dashboard:

   ```bash
   ssh -L 9119:127.0.0.1:9119 deiv@<IP_O_HOST_DE_CONTABO>
   ```

   Después visita `http://127.0.0.1:9119`.

Los secretos, OAuth y la configuración resultante del asistente permanecen en
`data/hermes/` y no deben incluirse en Git.

## Operación

```bash
docker compose ps
docker compose logs -f hermes
docker compose logs -f dashboard
docker compose down                 # no borra datos persistentes
docker compose pull && docker compose up -d
```

## Migración y respaldo

Detén los servicios antes de copiar el estado:

```bash
docker compose down
tar -C . -czf hermes-persistente-backup.tgz data/hermes .env
```

En el servidor nuevo, restaura ese archivo dentro de un clon de este repositorio
y ejecuta `docker compose up -d`. La versión de imagen está fijada en
`compose.yaml`, por lo que una actualización debe hacerse de forma deliberada.

No se respaldan repositorios de trabajo ni sesiones Herdr en este directorio:
esas pertenecerán a cada dispositivo y a sus repositorios Git remotos.
