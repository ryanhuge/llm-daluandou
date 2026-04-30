const state = {
  config: null,
  apiKeys: [],
  providers: [],
  openRouterModels: [],
  openRouterModelsLoading: false,
  running: false
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const els = {
  tabs: $$(".tab"),
  views: $$(".view"),
  prompt: $("#prompt"),
  modelSelect: $("#model-select"),
  run: $("#run"),
  notice: $("#notice"),
  results: $("#results"),
  apiKeys: $("#api-keys"),
  addApiKey: $("#add-api-key"),
  providers: $("#providers"),
  addProvider: $("#add-provider"),
  save: $("#save"),
  saveStatus: $("#save-status"),
  temperature: $("#temperature"),
  maxTokens: $("#max-tokens"),
  providerTemplate: $("#provider-template"),
  apiKeyTemplate: $("#api-key-template")
};

function uid() {
  return `provider-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function setNotice(message, isError = false) {
  els.notice.hidden = !message;
  els.notice.textContent = message || "";
  els.notice.style.borderColor = isError ? "#d99a9a" : "";
  els.notice.style.color = isError ? "#a33131" : "";
}

function showView(viewId) {
  els.tabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.view === viewId));
  els.views.forEach((view) => view.classList.toggle("is-active", view.id === viewId));
}

function enabledProviders() {
  return state.providers.filter((provider) => provider.enabled);
}

function apiKeyLabel(apiKey) {
  return apiKey.name || "Unnamed Key";
}

function defaultApiKeyId() {
  return state.apiKeys[0]?.id || "";
}

function inferConnectionType(provider) {
  return provider.connectionType || (provider.baseUrl === "https://openrouter.ai/api/v1" ? "openrouter" : "custom");
}

function openRouterModelById(id) {
  return state.openRouterModels.find((model) => model.id === id);
}

function formatModelMeta(model) {
  if (!model) return "";
  const parts = [];
  if (model.contextLength) parts.push(`context ${model.contextLength.toLocaleString()}`);
  if (model.promptPrice && model.completionPrice) {
    parts.push(`prompt ${model.promptPrice} / completion ${model.completionPrice}`);
  }
  return parts.join(" · ");
}

function renderModelSelect() {
  els.modelSelect.innerHTML = "";
  for (const provider of enabledProviders()) {
    const option = document.createElement("option");
    option.value = provider.id;
    option.textContent = `${provider.name} (${provider.model})`;
    option.selected = els.modelSelect.selectedOptions.length < 3;
    els.modelSelect.append(option);
  }
}

function readProviderCard(card, existing) {
  const provider = { ...existing };
  $$("[data-field]", card).forEach((input) => {
    const field = input.dataset.field;
    provider[field] = input.type === "checkbox" ? input.checked : input.value.trim();
  });
  provider.connectionType = provider.connectionType || "custom";
  if (provider.connectionType === "openrouter") {
    const modelSelect = $("[data-model-select]", card);
    provider.baseUrl = "https://openrouter.ai/api/v1";
    provider.model = modelSelect?.value || provider.model;
  }
  return provider;
}

function readApiKeyCard(card, existing) {
  const apiKey = { ...existing };
  $$("[data-key-field]", card).forEach((input) => {
    apiKey[input.dataset.keyField] = input.value.trim();
  });
  return apiKey;
}

function syncApiKeysFromCards() {
  state.apiKeys = $$(".api-key-card", els.apiKeys).map((card, index) => {
    const existing = state.apiKeys[index] || { id: uid() };
    return readApiKeyCard(card, existing);
  });
}

function syncProvidersFromCards() {
  state.providers = $$(".provider", els.providers).map((card, index) => {
    const existing = state.providers[index] || { id: uid() };
    return readProviderCard(card, existing);
  });
}

function syncSettingsFromCards() {
  syncApiKeysFromCards();
  syncProvidersFromCards();
}

function populateApiKeySelect(card, provider) {
  const select = $("[data-field='apiKeyRef']", card);
  const current = provider.apiKeyRef || defaultApiKeyId();
  select.innerHTML = "";

  const none = document.createElement("option");
  none.value = "";
  none.textContent = "不使用已儲存 key";
  select.append(none);

  for (const apiKey of state.apiKeys) {
    const option = document.createElement("option");
    option.value = apiKey.id;
    option.textContent = apiKeyLabel(apiKey);
    select.append(option);
  }

  select.value = current;
}

function renderApiKeyCards() {
  els.apiKeys.innerHTML = "";
  state.apiKeys.forEach((apiKey) => {
    const fragment = els.apiKeyTemplate.content.cloneNode(true);
    const card = $(".api-key-card", fragment);
    $$("[data-key-field]", card).forEach((input) => {
      input.value = apiKey[input.dataset.keyField] || "";
      input.addEventListener("input", () => {
        syncApiKeysFromCards();
        renderProviderCards();
        renderModelSelect();
      });
    });
    $("[data-action='remove-key']", card).addEventListener("click", () => {
      syncSettingsFromCards();
      state.apiKeys = state.apiKeys.filter((item) => item.id !== apiKey.id);
      state.providers = state.providers.map((provider) =>
        provider.apiKeyRef === apiKey.id ? { ...provider, apiKeyRef: defaultApiKeyId() } : provider
      );
      renderApiKeyCards();
      renderProviderCards();
      renderModelSelect();
    });
    els.apiKeys.append(fragment);
  });
}

function renderProviderCards() {
  els.providers.innerHTML = "";
  state.providers.forEach((provider) => {
    provider.connectionType = inferConnectionType(provider);
    const fragment = els.providerTemplate.content.cloneNode(true);
    const card = $(".provider", fragment);
    $$("[data-field]", card).forEach((input) => {
      const field = input.dataset.field;
      if (input.type === "checkbox") input.checked = Boolean(provider[field]);
      else input.value = provider[field] || "";
    });
    populateApiKeySelect(card, provider);
    setupProviderCard(card, provider);
    $("[data-action='remove']", card).addEventListener("click", () => {
      syncProvidersFromCards();
      state.providers = state.providers.filter((item) => item.id !== provider.id);
      renderProviderCards();
      renderModelSelect();
    });
    els.providers.append(fragment);
  });
}

function populateOpenRouterSelect(card, provider, query = "") {
  const select = $("[data-model-select]", card);
  const meta = $(".model-meta", card);
  const normalizedQuery = query.trim().toLowerCase();
  select.innerHTML = "";

  if (!state.openRouterModels.length) {
    const option = document.createElement("option");
    option.value = provider.model || "";
    option.textContent = state.openRouterModelsLoading ? "載入模型清單中..." : "無法載入模型清單，可先儲存後重試";
    select.append(option);
    meta.textContent = provider.model ? `目前：${provider.model}` : "";
    return;
  }

  const filteredModels = state.openRouterModels.filter((model) => {
    if (!normalizedQuery) return true;
    return `${model.name} ${model.id}`.toLowerCase().includes(normalizedQuery);
  });

  for (const model of filteredModels) {
    const option = document.createElement("option");
    option.value = model.id;
    option.textContent = `${model.name} (${model.id})`;
    select.append(option);
  }

  if (provider.model && !filteredModels.some((model) => model.id === provider.model)) {
    const option = document.createElement("option");
    option.value = provider.model;
    option.textContent = normalizedQuery ? `${provider.model} (目前選取)` : provider.model;
    select.prepend(option);
  }

  select.value = provider.model || filteredModels[0]?.id || "";
  meta.textContent = formatModelMeta(openRouterModelById(select.value));
}

function applyConnectionType(card) {
  const type = $("[data-field='connectionType']", card).value || "custom";
  const baseUrl = $("[data-field='baseUrl']", card);
  card.classList.toggle("is-openrouter", type === "openrouter");
  card.classList.toggle("is-custom", type !== "openrouter");
  if (type === "openrouter") {
    baseUrl.value = "https://openrouter.ai/api/v1";
    baseUrl.readOnly = true;
  } else {
    baseUrl.readOnly = false;
  }
}

function setupProviderCard(card, provider) {
  const type = $("[data-field='connectionType']", card);
  const modelSelect = $("[data-model-select]", card);
  const modelFilter = $("[data-model-filter]", card);
  const nameInput = $("[data-field='name']", card);
  const modelInput = $("[data-field='model']", card);

  populateOpenRouterSelect(card, provider);
  applyConnectionType(card);

  type.addEventListener("change", () => {
    if (type.value === "openrouter") {
      const selected = openRouterModelById(modelSelect.value);
      modelInput.value = modelSelect.value;
      if (!nameInput.value || nameInput.value === "New Model") nameInput.value = selected?.name || "OpenRouter Model";
    }
    applyConnectionType(card);
    renderModelSelectFromCards();
  });

  modelSelect.addEventListener("change", () => {
    const selected = openRouterModelById(modelSelect.value);
    modelInput.value = modelSelect.value;
    $(".model-meta", card).textContent = formatModelMeta(selected);
    if (!nameInput.value || nameInput.value === "New Model") nameInput.value = selected?.name || modelSelect.value;
    renderModelSelectFromCards();
  });

  modelFilter.addEventListener("input", () => {
    populateOpenRouterSelect(card, readProviderCard(card, provider), modelFilter.value);
  });

  $$("[data-field]", card).forEach((input) => input.addEventListener("input", renderModelSelectFromCards));
}

function renderModelSelectFromCards() {
  syncSettingsFromCards();
  renderModelSelect();
}

function renderConfig() {
  state.apiKeys = structuredClone(state.config.apiKeys || []);
  state.providers = structuredClone(state.config.providers || []);
  els.temperature.value = state.config.generation?.temperature ?? 0.7;
  els.maxTokens.value = state.config.generation?.maxTokens ?? 1200;
  renderApiKeyCards();
  renderProviderCards();
  renderModelSelect();
}

async function loadOpenRouterModels() {
  state.openRouterModelsLoading = true;
  renderProviderCards();
  try {
    const response = await fetch("/api/openrouter/models");
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "無法載入 OpenRouter 模型清單。");
    }
    const body = await response.json();
    state.openRouterModels = body.models || [];
  } catch (error) {
    console.warn(error);
    state.openRouterModels = [];
  } finally {
    state.openRouterModelsLoading = false;
    renderProviderCards();
    renderModelSelect();
  }
}

function selectedProviderIds() {
  return [...els.modelSelect.selectedOptions].map((option) => option.value).slice(0, 3);
}

function createResultCard(provider) {
  const article = document.createElement("article");
  article.className = "result";
  article.dataset.id = provider.id;
  article.innerHTML = `
    <header>
      <div>
        <h3></h3>
        <small></small>
      </div>
      <span class="status">等待中</span>
    </header>
    <div class="answer"></div>
    <footer class="meta">
      <span class="elapsed">0.0s</span>
      <span class="chars">0 字</span>
    </footer>
  `;
  $("h3", article).textContent = provider.name;
  $("small", article).textContent = provider.model;
  return article;
}

function updateCard(id, updater) {
  const card = $(`.result[data-id="${CSS.escape(id)}"]`, els.results);
  if (card) updater(card);
}

function parseSse(buffer, onEvent) {
  const events = buffer.split("\n\n");
  const remainder = events.pop() || "";
  for (const raw of events) {
    const lines = raw.split(/\r?\n/);
    const event = (lines.find((line) => line.startsWith("event:")) || "event: message").slice(6).trim();
    const dataLine = lines.find((line) => line.startsWith("data:"));
    if (!dataLine) continue;
    onEvent(event, JSON.parse(dataLine.slice(5).trim()));
  }
  return remainder;
}

function handleArenaEvent(event, data) {
  if (event === "start") {
    updateCard(data.id, (card) => {
      $(".status", card).textContent = "生成中";
    });
  }
  if (event === "delta") {
    updateCard(data.id, (card) => {
      const answer = $(".answer", card);
      answer.textContent += data.text;
      answer.scrollTop = answer.scrollHeight;
      $(".chars", card).textContent = `${answer.textContent.length} 字`;
    });
  }
  if (event === "done") {
    updateCard(data.id, (card) => {
      $(".status", card).textContent = "完成";
      $(".elapsed", card).textContent = `${(data.elapsedMs / 1000).toFixed(1)}s`;
      $(".chars", card).textContent = `${data.characters} 字`;
    });
  }
  if (event === "error") {
    updateCard(data.id, (card) => {
      card.classList.add("is-error");
      $(".status", card).textContent = "錯誤";
      $(".elapsed", card).textContent = `${(data.elapsedMs / 1000).toFixed(1)}s`;
      $(".answer", card).textContent = data.message;
    });
  }
}

async function runComparison() {
  if (state.running) return;
  const prompt = els.prompt.value.trim();
  const ids = selectedProviderIds();

  if (!prompt) return setNotice("請先輸入問題。", true);
  if (!ids.length) return setNotice("請在後台啟用模型，並在比較頁選擇最多三個模型。", true);

  setNotice("");
  state.running = true;
  els.run.disabled = true;
  els.run.textContent = "比較中";
  els.results.innerHTML = "";

  const providers = state.providers.filter((provider) => ids.includes(provider.id));
  providers.forEach((provider) => els.results.append(createResultCard(provider)));

  try {
    const response = await fetch("/api/compare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt, providerIds: ids })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "比較失敗。");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = parseSse(buffer, handleArenaEvent);
    }
  } catch (error) {
    setNotice(error instanceof Error ? error.message : String(error), true);
  } finally {
    state.running = false;
    els.run.disabled = false;
    els.run.textContent = "開始比較";
  }
}

async function loadConfig() {
  const response = await fetch("/api/config");
  state.config = await response.json();
  renderConfig();
  loadOpenRouterModels();
}

async function saveConfig() {
  syncSettingsFromCards();
  const config = {
    apiKeys: state.apiKeys,
    providers: state.providers,
    generation: {
      temperature: Number(els.temperature.value || 0.7),
      maxTokens: Number(els.maxTokens.value || 1200)
    }
  };

  els.save.disabled = true;
  els.saveStatus.textContent = "儲存中...";
  try {
    const response = await fetch("/api/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(config)
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "儲存失敗。");
    }
    state.config = await response.json();
    renderConfig();
    els.saveStatus.textContent = "已儲存";
  } catch (error) {
    els.saveStatus.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    els.save.disabled = false;
  }
}

els.tabs.forEach((tab) => tab.addEventListener("click", () => showView(tab.dataset.view)));
els.run.addEventListener("click", runComparison);
els.save.addEventListener("click", saveConfig);
els.addApiKey.addEventListener("click", () => {
  syncSettingsFromCards();
  state.apiKeys.push({
    id: uid(),
    name: "New API Key",
    value: ""
  });
  renderApiKeyCards();
  renderProviderCards();
});
els.addProvider.addEventListener("click", () => {
  syncSettingsFromCards();
  state.providers.push({
    id: uid(),
    name: "New Model",
    connectionType: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKeyRef: defaultApiKeyId(),
    apiKey: "",
    model: state.openRouterModels[0]?.id || "",
    enabled: false
  });
  renderProviderCards();
});

loadConfig().catch((error) => setNotice(error instanceof Error ? error.message : String(error), true));
