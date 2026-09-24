import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
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
      env: process.env,
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

function text(value, isError = false) {
  return { content: [{ type: "text", text: value }], isError };
}

function requireHerdrContext() {
  if (process.env.HERDR_ENV !== "1") {
    throw new Error("El bridge debe iniciarse desde un panel administrado por Herdr (HERDR_ENV=1).");
  }
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

  server.tool("list_projects", "Lista los proyectos que este nodo permite usar.", {}, async () => {
    const projects = Object.entries(config.allowedProjects).map(([id, path]) => ({ id, path, available: existsSync(path) }));
    return text(JSON.stringify({ node: config.nodeName, projects }, null, 2));
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
    const projectPath = config.allowedProjects[project];
    if (!projectPath) return text(`Proyecto no autorizado: ${project}`, true);
    if (!existsSync(projectPath)) return text(`El proyecto configurado no existe: ${projectPath}`, true);

    const split = await execute("herdr", ["pane", "split", "--current", "--direction", "right", "--cwd", projectPath, "--no-focus"]);
    if (split.code !== 0) return text(`No se pudo crear el panel: ${split.stderr || split.stdout}`, true);
    let paneId;
    try {
      paneId = JSON.parse(split.stdout).result.pane.pane_id;
    } catch {
      return text(`Herdr no devolvió el identificador del panel: ${split.stdout}`, true);
    }
    const startArgs = ["agent", "start", agentName, "--kind", "codex", "--pane", paneId];
    if (model) startArgs.push("--", "--model", model);
    const started = await execute("herdr", startArgs);
    if (started.code !== 0) return text(`No se pudo iniciar Codex: ${started.stderr || started.stdout}`, true);
    return text(JSON.stringify({ node: config.nodeName, project, agentName, paneId, result: started.stdout.trim() }, null, 2));
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

  server.tool("prompt_agent", "Envía una tarea a un agente reconocido por Herdr y espera su estado final.", {
    agentName: z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/).describe("Nombre del agente Herdr"),
    task: z.string().min(1).max(12000).describe("Instrucción concreta para el agente")
  }, async ({ agentName, task }) => {
    try {
      requireHerdrContext();
    } catch (error) {
      return text(error.message, true);
    }
    const result = await execute("herdr", ["agent", "prompt", agentName, task, "--wait", "--timeout", "120000"]);
    return text((result.stdout || result.stderr).trim(), result.code !== 0);
  });

  server.tool("read_agent", "Lee la salida reciente de un agente Herdr sin enviarle una nueva tarea.", {
    agentName: z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/).describe("Nombre del agente Herdr")
  }, async ({ agentName }) => {
    try {
      requireHerdrContext();
    } catch (error) {
      return text(error.message, true);
    }
    const result = await execute("herdr", ["agent", "read", agentName, "--source", "recent-unwrapped", "--lines", "120"]);
    return text((result.stdout || result.stderr).trim(), result.code !== 0);
  });

  return server;
}

async function main() {
  const config = JSON.parse(await readFile(parseArguments(), "utf8"));
  if (!config.nodeName || !config.tokenEnv || !config.allowedProjects) throw new Error("Configuración incompleta.");
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
