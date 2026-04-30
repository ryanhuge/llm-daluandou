import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");
const configPath = path.join(dataDir, "config.json");
const port = Number(process.env.PORT || 4173);
let openRouterModelCache = {
  fetchedAt: 0,
  models: []
};

const defaultConfig = {
  apiKeys: [
    {
      id: "openrouter-key",
      name: "OpenRouter",
      value: ""
    }
  ],
  providers: [
    {
      id: "openai",
      name: "OpenAI GPT-4.1",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "",
      model: "gpt-4.1",
      enabled: false
    },
    {
      id: "openrouter-claude",
      name: "Claude via OpenRouter",
      connectionType: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "",
      model: "anthropic/claude-3.7-sonnet",
      enabled: false
    },
    {
      id: "gemini-compatible",
      name: "Gemini Compatible",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      apiKey: "",
      model: "gemini-2.5-pro",
      enabled: false
    }
  ],
  generation: {
    temperature: 0.7,
    maxTokens: 1200
  }
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

async function ensureConfig() {
  await mkdir(dataDir, { recursive: true });
  if (!existsSync(configPath)) {
    await writeFile(configPath, JSON.stringify(defaultConfig, null, 2));
  }
}

async function readConfig() {
  await ensureConfig();
  return JSON.parse(await readFile(configPath, "utf8"));
}

async function writeConfig(config) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2));
}

function sanitizeConfig(config) {
  return {
    ...config,
    apiKeys: (config.apiKeys || []).map((apiKey) => ({
      ...apiKey,
      value: apiKey.value ? "********" : ""
    })),
    providers: (config.providers || []).map((provider) => ({
      ...provider,
      connectionType: provider.connectionType || inferConnectionType(provider),
      apiKey: provider.apiKey ? "********" : ""
    }))
  };
}

function inferConnectionType(provider) {
  return normalizeBaseUrl(provider?.baseUrl) === "https://openrouter.ai/api/v1" ? "openrouter" : "custom";
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

function notFound(res) {
  json(res, 404, { error: "Not found" });
}

function sseWrite(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || "").replace(/\/+$/, "");
}

function mergeSavedKeys(next, current) {
  const currentById = new Map((current.providers || []).map((item) => [item.id, item]));
  const currentKeyById = new Map((current.apiKeys || []).map((item) => [item.id, item]));
  return {
    ...next,
    apiKeys: (next.apiKeys || []).map((apiKey) => {
      const saved = currentKeyById.get(apiKey.id);
      const value = apiKey.value === "********" ? saved?.value || "" : apiKey.value || "";
      return { ...apiKey, value };
    }),
    providers: (next.providers || []).map((provider) => {
      const saved = currentById.get(provider.id);
      const apiKey = provider.apiKey === "********" ? saved?.apiKey || "" : provider.apiKey || "";
      return { ...provider, apiKey };
    })
  };
}

function validateProvider(provider) {
  return provider?.id && provider?.name && provider?.baseUrl && provider?.model;
}

function hydrateProviderKeys(providers, apiKeys) {
  const keyById = new Map((apiKeys || []).map((apiKey) => [apiKey.id, apiKey.value || ""]));
  return providers.map((provider) => ({
    ...provider,
    apiKey: provider.apiKey || keyById.get(provider.apiKeyRef) || ""
  }));
}

async function getOpenRouterModels() {
  const cacheTtlMs = 1000 * 60 * 30;
  if (openRouterModelCache.models.length && Date.now() - openRouterModelCache.fetchedAt < cacheTtlMs) {
    return openRouterModelCache.models;
  }

  const response = await fetch("https://openrouter.ai/api/v1/models?output_modalities=text", {
    headers: { accept: "application/json" }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter models failed: ${response.status} ${response.statusText}: ${text.slice(0, 300)}`);
  }

  const body = await response.json();
  const models = (body.data || [])
    .map((model) => ({
      id: model.id,
      name: model.name || model.id,
      contextLength: model.context_length || model.top_provider?.context_length || null,
      promptPrice: model.pricing?.prompt || null,
      completionPrice: model.pricing?.completion || null
    }))
    .filter((model) => model.id)
    .sort((a, b) => a.name.localeCompare(b.name));

  openRouterModelCache = { fetchedAt: Date.now(), models };
  return models;
}

async function streamProvider({ res, provider, prompt, generation, startedAt }) {
  const endpoint = `${normalizeBaseUrl(provider.baseUrl)}/chat/completions`;
  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${provider.apiKey}`
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: provider.model,
      messages: [{ role: "user", content: prompt }],
      temperature: Number(generation.temperature ?? 0.7),
      max_tokens: Number(generation.maxTokens ?? 1200),
      stream: true
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 600)}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let usage = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let parsed;
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }
      usage = parsed.usage || usage;
      const delta = parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.message?.content ?? "";
      if (delta) {
        fullText += delta;
        sseWrite(res, "delta", { id: provider.id, text: delta });
      }
    }
  }

  sseWrite(res, "done", {
    id: provider.id,
    elapsedMs: Date.now() - startedAt,
    characters: fullText.length,
    usage
  });
}

async function handleCompare(req, res) {
  const body = await readBody(req);
  const prompt = String(body.prompt || "").trim();
  const selectedIds = Array.isArray(body.providerIds) ? body.providerIds : [];

  if (!prompt) return json(res, 400, { error: "Prompt is required." });

  const config = await readConfig();
  const enabled = hydrateProviderKeys(config.providers || [], config.apiKeys || [])
    .filter((provider) => provider.enabled && selectedIds.includes(provider.id))
    .filter(validateProvider);

  if (!enabled.length) return json(res, 400, { error: "Select at least one enabled model." });
  if (enabled.some((provider) => !provider.apiKey)) {
    return json(res, 400, { error: "Every selected remote provider needs an API key." });
  }

  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no"
  });

  for (const provider of enabled) {
    sseWrite(res, "start", { id: provider.id, name: provider.name, model: provider.model });
  }

  await Promise.allSettled(
    enabled.map(async (provider) => {
      const startedAt = Date.now();
      try {
        await streamProvider({ res, provider, prompt, generation: config.generation || {}, startedAt });
      } catch (error) {
        sseWrite(res, "error", {
          id: provider.id,
          elapsedMs: Date.now() - startedAt,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    })
  );

  sseWrite(res, "complete", { ok: true });
  res.end();
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(publicDir, requested));
  if (!filePath.startsWith(publicDir)) return notFound(res);

  try {
    const content = await readFile(filePath);
    res.writeHead(200, { "content-type": mimeTypes[path.extname(filePath)] || "application/octet-stream" });
    res.end(content);
  } catch {
    notFound(res);
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/api/config") {
      return json(res, 200, sanitizeConfig(await readConfig()));
    }

    if (req.method === "GET" && url.pathname === "/api/openrouter/models") {
      return json(res, 200, { models: await getOpenRouterModels() });
    }

    if (req.method === "POST" && url.pathname === "/api/config") {
      const current = await readConfig();
      const next = mergeSavedKeys(await readBody(req), current);
      if (!Array.isArray(next.providers)) return json(res, 400, { error: "providers must be an array." });
      await writeConfig(next);
      return json(res, 200, sanitizeConfig(next));
    }

    if (req.method === "POST" && url.pathname === "/api/compare") {
      return handleCompare(req, res);
    }

    if (req.method === "GET") return serveStatic(req, res);
    notFound(res);
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

await ensureConfig();
server.listen(port, "127.0.0.1", () => {
  console.log(`LLM 大亂鬥 is running at http://localhost:${port}`);
});
