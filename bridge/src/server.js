import { randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { basename, extname, isAbsolute, join, relative, sep } from "node:path";
import { readFile, realpath } from "node:fs/promises";
import { spawn } from "node:child_process";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

function parseArguments() {
  const index = process.argv.indexOf("--config");
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error("Uso: node src/server.js --config <archivo.json>");
  }
  return process.argv[index + 1];
}

function execute(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: false,
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => { stdout += data; });
    child.stderr.on("data", (data) => { stderr += data; });
    child.on("error", (error) => resolve({ code: -1, stdout, stderr: error.message }));
    child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

function codexAccountConfig(config) {
  const account = config.codexAccount;
  if (!account?.email || !account?.home) {
    return { error: "Falta codexAccount.email o codexAccount.home en la configuración privada del bridge." };
  }
  if (!isAbsolute(account.home)) {
    return { error: "codexAccount.home debe ser una ruta absoluta." };
  }
  return { email: account.email.toLowerCase(), home: account.home };
}

function emailFromIdToken(idToken) {
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.email === "string" ? payload.email.toLowerCase() : undefined;
  } catch {
    return undefined;
  }
}

async function verifyCodexAccount(config) {
  const account = codexAccountConfig(config);
  if (account.error) return account;

  const authPath = join(account.home, "auth.json");
  let auth;
  try {
    auth = JSON.parse(await readFile(authPath, "utf8"));
  } catch {
    return { error: `No se encontró una sesión de Codex legible en ${authPath}. Inicia sesión con la cuenta universitaria primero.` };
  }
  const actualEmail = emailFromIdToken(auth?.tokens?.id_token);
  if (!actualEmail) return { error: "La sesión de Codex no contiene una identidad verificable. Vuelve a iniciar sesión." };
  if (actualEmail !== account.email) {
    return { error: `La sesión de Codex configurada pertenece a ${actualEmail}, no a ${account.email}.` };
  }

  const env = { ...process.env, CODEX_HOME: account.home };
  const status = await execute("codex", ["login", "status"], { env });
  if (status.code !== 0) return { error: `La sesión universitaria de Codex no está activa: ${status.stderr || status.stdout}`.trim() };
  return { email: actualEmail, home: account.home, env };
}

function text(value, isError = false) {
  return { content: [{ type: "text", text: value }], isError };
}

function requireHerdrContext() {
  if (process.env.HERDR_ENV !== "1") {
    throw new Error("El bridge debe iniciarse desde un panel administrado por Herdr (HERDR_ENV=1).");
  }
}

const IGNORED_DIRECTORIES = new Set([
  ".cache", ".codex", ".config", ".git", ".local", ".npm", ".ssh",
  "node_modules", "vendor", ".venv", "venv", "dist", "build"
]);

function discoverGitProjects(root, maxDepth = 10) {
  const found = [];
  const visit = (directory, depth) => {
    if (!existsSync(directory) || depth > maxDepth) return;
    if (existsSync(join(directory, ".git"))) {
      found.push(directory);
      return;
    }
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || IGNORED_DIRECTORIES.has(entry.name)) continue;
      visit(join(directory, entry.name), depth + 1);
    }
  };
  visit(root, 0);
  return found;
}

function projectsFor(config) {
  const projects = { ...(config.allowedProjects ?? {}) };
  for (const root of config.allowedRoots ?? []) {
    for (const path of discoverGitProjects(root)) {
      const suffix = relative(root, path).replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "").toLowerCase();
      const baseId = `auto_${basename(root).replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase()}_${suffix || "root"}`;
      let id = baseId;
      let duplicate = 2;
      while (projects[id] && projects[id] !== path) id = `${baseId}_${duplicate++}`;
      projects[id] = path;
    }
  }
  return projects;
}

async function resolvePermittedFile(config, requestedPath) {
  if (!isAbsolute(requestedPath)) {
    throw new Error("La ruta debe ser absoluta, por ejemplo /home/deiv/Universidad/software/tarea5.pdf.");
  }

  let target;
  try {
    target = await realpath(requestedPath);
  } catch {
    throw new Error(`El archivo no existe o no se puede resolver: ${requestedPath}`);
  }

  const roots = [...new Set([...(config.allowedRoots ?? []), ...Object.values(config.allowedProjects ?? {})])];
  for (const root of roots) {
    try {
      const resolvedRoot = await realpath(root);
      const pathFromRoot = relative(resolvedRoot, target);
      if (pathFromRoot === "" || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== ".." && !isAbsolute(pathFromRoot))) {
        return target;
      }
    } catch {
      // Una raíz que aún no existe no concede acceso.
    }
  }
  throw new Error("La ruta queda fuera de las raíces autorizadas del bridge.");
}

async function readPermittedFile(config, requestedPath, maxChars) {
  const path = await resolvePermittedFile(config, requestedPath);
  let content;
  if (extname(path).toLowerCase() === ".pdf") {
    const result = await execute("pdftotext", ["-layout", path, "-"]);
    if (result.code !== 0) throw new Error(`No se pudo extraer el PDF: ${result.stderr || result.stdout}`);
    content = result.stdout;
  } else {
    const buffer = await readFile(path);
    if (buffer.includes(0)) throw new Error("El archivo parece binario; el bridge solo puede leer texto y PDF.");
    content = buffer.toString("utf8");
  }

  return { path, content: content.slice(0, maxChars), truncated: content.length > maxChars };
}

async function readAgentTranscript(agentName, lines = 240) {
  return execute("herdr", [
    "agent", "read", agentName,
    "--source", "recent-unwrapped",
    "--lines", String(lines),
    "--format", "text"
  ]);
}

async function createServer(config) {
  const server = new McpServer({ name: `hermes-herdr-bridge-${config.nodeName}`, version: "0.1.0" });

  server.tool("node_health", "Comprueba el contexto del bridge y el servidor local de Herdr.", {}, async () => {
    const herdrContext = process.env.HERDR_ENV === "1";
    const status = await execute("herdr", ["status", "server"]);
    return text(JSON.stringify({
      node: config.nodeName,
      herdrContext,
      herdrExitCode: status.code,
      herdrStatus: `${status.stdout}${status.stderr}`.trim()
    }, null, 2), !herdrContext || status.code !== 0);
  });

  server.tool("list_projects", "Lista los proyectos autorizados, incluidos los repositorios Git descubiertos bajo las raíces permitidas.", {}, async () => {
    const projects = Object.entries(projectsFor(config)).map(([id, path]) => ({ id, path, available: existsSync(path) }));
    return text(JSON.stringify({ node: config.nodeName, projects }, null, 2));
  });

  server.tool("read_file", "Lee un archivo de texto o extrae texto de un PDF dentro de las raíces autorizadas del nodo.", {
    path: z.string().min(1).describe("Ruta absoluta del archivo dentro de una raíz autorizada"),
    maxChars: z.number().int().min(1000).max(60000).optional().describe("Máximo de caracteres que se devolverán; 30000 por defecto")
  }, async ({ path, maxChars }) => {
    try {
      return text(JSON.stringify(await readPermittedFile(config, path, maxChars ?? 30000), null, 2));
    } catch (error) {
      return text(error.message, true);
    }
  });

  server.tool("start_codex", "Abre Codex en un proyecto autorizado usando un panel nuevo de Herdr.", {
    project: z.string().describe("Identificador de proyecto devuelto por list_projects"),
    agentName: z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/).describe("Nombre único del agente"),
    model: z.literal("gpt-5.6-luna").optional().describe("Modelo permitido para tareas delegadas")
  }, async ({ project, agentName, model }) => {
    try {
      requireHerdrContext();
    } catch (error) {
      return text(error.message, true);
    }
    const projectPath = projectsFor(config)[project];
    if (!projectPath) return text(`Proyecto no autorizado: ${project}`, true);
    if (!existsSync(projectPath)) return text(`El proyecto configurado no existe: ${projectPath}`, true);

    // No abrir agentes con la cuenta accidentalmente heredada por Herdr. La
    // identidad se lee del id_token local, sin exponer tokens ni credenciales.
    const account = await verifyCodexAccount(config);
    if (account.error) return text(`No se iniciará Codex: ${account.error}`, true);

    const split = await execute("herdr", ["pane", "split", "--current", "--direction", "right", "--cwd", projectPath, "--no-focus"], { env: account.env });
    if (split.code !== 0) return text(`No se pudo crear el panel: ${split.stderr || split.stdout}`, true);
    let paneId;
    try {
      paneId = JSON.parse(split.stdout).result.pane.pane_id;
    } catch {
      return text(`Herdr no devolvió el identificador del panel: ${split.stdout}`, true);
    }
    // El daemon compartido de Codex no es compatible con procesos lanzados
    // desde un Herdr/PowerShell elevado en Windows. Ejecutar cada agente de
    // forma autónoma evita depender de ese daemon en todos los nodos.
    const codexArgs = ["--no-daemon"];
    if (model) codexArgs.push("--model", model);
    const startArgs = ["agent", "start", agentName, "--kind", "codex", "--pane", paneId, "--", ...codexArgs];
    const started = await execute("herdr", startArgs, { env: account.env });
    if (started.code !== 0) return text(`No se pudo iniciar Codex: ${started.stderr || started.stdout}`, true);
    return text(JSON.stringify({ node: config.nodeName, project, agentName, paneId, account: account.email, result: started.stdout.trim() }, null, 2));
  });

  server.tool("agent_status", "Consulta los agentes que Herdr reconoce en este nodo.", {}, async () => {
    try {
      requireHerdrContext();
    } catch (error) {
      return text(error.message, true);
    }
    const result = await execute("herdr", ["agent", "list"]);
    return text((result.stdout || result.stderr).trim(), result.code !== 0);
  });

  server.tool("prompt_agent", "Envía una tarea a un agente reconocido por Herdr, espera su estado final y devuelve su transcripción reciente.", {
    agentName: z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/).describe("Nombre del agente Herdr"),
    task: z.string().min(1).max(12000).describe("Instrucción concreta para el agente")
  }, async ({ agentName, task }) => {
    try {
      requireHerdrContext();
    } catch (error) {
      return text(error.message, true);
    }
    const result = await execute("herdr", ["agent", "prompt", agentName, task, "--wait", "--timeout", "120000"]);
    if (result.code !== 0) return text((result.stdout || result.stderr).trim(), true);

    const transcript = await readAgentTranscript(agentName);
    if (transcript.code !== 0) {
      return text(`La tarea terminó, pero no se pudo leer su salida: ${transcript.stderr || transcript.stdout}`, true);
    }
    return text(`Estado de la tarea:\n${(result.stdout || result.stderr).trim()}\n\nTranscripción del agente:\n${(transcript.stdout || transcript.stderr).trim()}`);
  });

  server.tool("read_agent", "Lee la salida reciente de un agente Herdr sin enviarle una nueva tarea.", {
    agentName: z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/).describe("Nombre del agente Herdr"),
    lines: z.number().int().min(20).max(600).optional().describe("Número de líneas recientes; 240 por defecto")
  }, async ({ agentName, lines }) => {
    try {
      requireHerdrContext();
    } catch (error) {
      return text(error.message, true);
    }
    const result = await readAgentTranscript(agentName, lines ?? 240);
    return text((result.stdout || result.stderr).trim(), result.code !== 0);
  });

  return server;
}

async function main() {
  const config = JSON.parse(await readFile(parseArguments(), "utf8"));
  if (!config.nodeName || !config.tokenEnv || (!config.allowedProjects && !config.allowedRoots)) throw new Error("Configuración incompleta.");
  const token = process.env[config.tokenEnv];
  if (!token) throw new Error(`Falta la variable de entorno ${config.tokenEnv}.`);

  const app = express();
  app.use(express.json({ limit: "1mb" }));
  const sessions = new Map();
  const authenticate = (req, res, next) => {
    if (req.headers.authorization !== `Bearer ${token}`) return res.status(401).json({ error: "Unauthorized" });
    next();
  };
  app.get("/healthz", authenticate, (_req, res) => res.json({ node: config.nodeName, herdrContext: process.env.HERDR_ENV === "1" }));
  app.all("/mcp", authenticate, async (req, res) => {
    const sessionId = req.headers["mcp-session-id"];
    let transport = sessionId ? sessions.get(sessionId) : undefined;
    if (!transport) {
      const server = await createServer(config);
      transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
      transport.onclose = () => sessions.delete(transport.sessionId);
      await server.connect(transport);
    }
    await transport.handleRequest(req, res, req.body);
    if (transport.sessionId) sessions.set(transport.sessionId, transport);
  });
  app.listen(config.listenPort, config.listenHost, () => {
    console.log(`Bridge ${config.nodeName} escuchando en http://${config.listenHost}:${config.listenPort}/mcp`);
  });
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
