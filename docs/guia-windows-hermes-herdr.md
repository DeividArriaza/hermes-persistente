# Preparar Windows para Hermes y Herdr

Este equipo Windows será un nodo de trabajo remoto. Hermes vive en Contabo y
usará SSH sobre Tailscale para pedir a Herdr que inicie o supervise sesiones de
Codex y OpenCode en esta computadora.

No abras puertos en el router ni expongas RDP o SSH a Internet.

## 1. Instalar y conectar Tailscale

Abre PowerShell como administrador e instala Tailscale:

```powershell
winget install --id Tailscale.Tailscale -e
```

Abre la aplicación Tailscale desde el menú Inicio e inicia sesión con la misma
cuenta usada por el servidor de Contabo. Verifica que el equipo aparece en el
tailnet:

```powershell
tailscale status
tailscale ip -4
```

No actives `Shields Up`: impediría las conexiones entrantes de Hermes.

## 2. Instalar OpenSSH Server

En PowerShell como administrador:

```powershell
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
Start-Service sshd
Set-Service -Name sshd -StartupType Automatic
Get-Service sshd
```

Debe mostrar el servicio `sshd` como `Running`.

Windows suele crear una regla de firewall para el servidor SSH durante la
instalación. Compruébala:

```powershell
Get-NetFirewallRule -Name OpenSSH-Server-In-TCP -ErrorAction SilentlyContinue
```

No configures reenvío de puertos en el router. Tailscale proporciona la ruta
privada entre Contabo y Windows.

## 3. Preparar el acceso por clave de Hermes

Usa un usuario normal de Windows para los repositorios y los agentes. En una
terminal abierta como ese usuario, crea el directorio SSH si no existe:

```powershell
New-Item -ItemType Directory -Force "$HOME\.ssh"
```

El administrador de Hermes proporcionará una clave pública exclusiva para este
equipo. Añádela exactamente como una línea a este archivo:

```powershell
notepad "$HOME\.ssh\authorized_keys"
```

Guarda el archivo. No pegues tokens, contraseñas ni claves privadas en
`authorized_keys`; solo la clave pública que comienza con `ssh-ed25519`.

## 4. Instalar Herdr

En PowerShell con tu usuario normal:

```powershell
irm https://herdr.dev/install.ps1 | iex
```

Cierra y abre una nueva terminal, luego verifica:

```powershell
herdr --version
```

Herdr debe ejecutarse con el mismo usuario que posee los repositorios. Así
puede restaurar terminales, acceder a las credenciales de Codex/OpenCode y
trabajar en los directorios correctos.

## 5. Instalar los agentes de desarrollo

Instala Codex y/o OpenCode según el método que ya uses en Windows. Comprueba
que los ejecutables están disponibles desde una nueva terminal:

```powershell
codex --version
opencode --version
```

Autentica los agentes localmente. Las credenciales se quedan en Windows; no se
copian al servidor de Contabo.

## 6. Crear una sesión de prueba de Herdr

Ubícate en un repositorio de prueba:

```powershell
Set-Location "C:\ruta\a\tu\repositorio"
herdr
```

En la interfaz de Herdr crea un workspace y abre una sesión Codex u OpenCode.
Después desconéctate de Herdr y vuelve a abrirlo: la sesión debe seguir viva o
ser restaurable en esta computadora.

## 7. Mantener el equipo disponible

Para que Hermes pueda trabajar, Windows debe permanecer encendido y despierto.
No hace falta que la pantalla esté encendida.

Ve a **Configuración → Sistema → Energía y batería → Pantalla y suspensión** y
configura, al menos cuando el equipo esté conectado a corriente:

- Pantalla: según prefieras.
- Suspender el dispositivo: `Nunca`.

## 8. Datos para entregar al administrador de Hermes

Cuando completes los pasos, ejecuta estos comandos en PowerShell y comparte la
salida:

```powershell
tailscale status
tailscale ip -4
whoami
Get-Service sshd
herdr --version
codex --version
opencode --version
```

Con el nombre o IP de Tailscale y el usuario de Windows, el administrador
configurará Hermes para conectarse por SSH y podrá verificar el acceso con una
clave dedicada a este equipo.
