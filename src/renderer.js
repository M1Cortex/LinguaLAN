const LANGUAGES = {
  German: "German", English: "English", French: "French",
  Spanish: "Spanish", Italian: "Italian", Portuguese: "Portuguese",
  Dutch: "Dutch", Polish: "Polish", Russian: "Russian",
  "Chinese (Simplified)": "Chinese", Japanese: "Japanese",
  Korean: "Korean", Turkish: "Turkish", Czech: "Czech",
  Swedish: "Swedish", Danish: "Danish", Finnish: "Finnish",
  Greek: "Greek", Romanian: "Romanian", Hungarian: "Hungarian",
};

const SOURCE_LABELS = {};
for (const [de, en] of Object.entries(LANGUAGES)) SOURCE_LABELS[en] = de;

const targetLabels = Object.keys(LANGUAGES);

const $ = (id) => document.getElementById(id);
const sourceLang = $("sourceLang");
const targetLang = $("targetLang");
const swapBtn = $("swapBtn");
const sourceText = $("sourceText");
const targetText = $("targetText");
const charCount = $("charCount");
const statusMsg = $("statusMsg");
const translationInfo = $("translationInfo");
const translateBtn = $("translateBtn");
const explainBtn = $("explainBtn");
const clearBtn = $("clearBtn");
const copyBtn = $("copyBtn");
const settingsBtn = $("settingsBtn");
const settingsModal = $("settingsModal");
const closeSettings = $("closeSettings");
const saveSettings = $("saveSettings");
const ollamaUrl = $("ollamaUrl");
const modelSelect = $("modelSelect");
const refreshModelsBtn = $("refreshModels");
const systemPrompt = $("systemPrompt");
const clipboardWatch = $("clipboardWatch");
const clipboardBadge = $("clipboardBadge");
const hotkeyInput = $("hotkeyInput");
const clearHotkeyBtn = $("clearHotkeyBtn");
const modelDot = $("modelDot");
const modelName = $("modelName");
const connectionStatus = $("connectionStatus");
const sourceLabel = $("sourceLabel");
const targetLabel = $("targetLabel");
const themeToggle = $("themeToggle");

const ollamaStatusText = $("ollamaStatusText");
const ollamaDot = $("ollamaDot");
const ollamaActions = $("ollamaActions");
const startOllamaBtn = $("startOllamaBtn");
const stopOllamaBtn = $("stopOllamaBtn");
const downloadOllamaBtn = $("downloadOllamaBtn");
const installOllamaBtn = $("installOllamaBtn");
const refreshOllamaBtn = $("refreshOllamaBtn");
const ollamaProgress = $("ollamaProgress");
const progressFill = $("progressFill");
const progressText = $("progressText");
const ollamaModelPull = $("ollamaModelPull");
const pullModelSelect = $("pullModelSelect");
const pullModelBtn = $("pullModelBtn");

function applyTheme(isDark) {
  document.body.classList.toggle('dark-mode', isDark);
  localStorage.setItem('dark_mode', isDark ? '1' : '');
  themeToggle.innerHTML = isDark
    ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
    : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
}
themeToggle.addEventListener('click', () => {
  applyTheme(!document.body.classList.contains('dark-mode'));
});
if (localStorage.getItem('dark_mode') === '1') applyTheme(true);

let availableModels = [];
let selectedModel = localStorage.getItem("selected_model") || "";
let ollamaBaseUrl = localStorage.getItem("ollama_url") || "http://localhost:11434";
let isTranslating = false;
let abortController = null;
let clipboardMonitoring = false;
let clipboardMonitorInterval = null;
let lastClipboard = '';

const TAURI = window.__TAURI__;
const invoke = TAURI && TAURI.core ? TAURI.core.invoke : null;
const listen = TAURI && TAURI.event ? TAURI.event.listen : null;

function populateSelects() {
  while (sourceLang.options.length > 0) sourceLang.remove(0);
  while (targetLang.options.length > 0) targetLang.remove(0);

  for (const label of targetLabels) {
    const o = document.createElement("option");
    o.value = LANGUAGES[label];
    o.textContent = label;
    sourceLang.add(o);
  }
  for (const label of targetLabels) {
    const o = document.createElement("option");
    o.value = LANGUAGES[label];
    o.textContent = label;
    targetLang.add(o);
  }
  sourceLang.value = "German";
  targetLang.value = "English";
}
populateSelects();

function updateLabels() {
  sourceLabel.textContent = SOURCE_LABELS[sourceLang.value] || sourceLang.value;
  targetLabel.textContent = SOURCE_LABELS[targetLang.value] || targetLang.value;
  localStorage.setItem('source_lang', sourceLang.value);
  localStorage.setItem('target_lang', targetLang.value);
  syncPopupSettings();
}
sourceLang.addEventListener("change", updateLabels);
targetLang.addEventListener("change", updateLabels);
updateLabels();

swapBtn.addEventListener("click", () => {
  const tmp = sourceLang.value;
  sourceLang.value = targetLang.value;
  targetLang.value = tmp;
  updateLabels();
});

clearBtn.addEventListener("click", () => {
  sourceText.value = "";
  updateCharCount();
  sourceText.focus();
});

copyBtn.addEventListener("click", () => {
  const text = targetText.innerText;
  if (text && text !== "Translation will appear here...") {
    navigator.clipboard.writeText(text).catch(() => {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    });
  }
});

function updateCharCount() {
  charCount.textContent = sourceText.value.length;
}
sourceText.addEventListener("input", updateCharCount);

let recordingHotkey = false;
const MOD_KEY_MAP = {
  Control: 'CmdOrCtrl', Meta: 'CmdOrCtrl', Shift: 'Shift', Alt: 'Alt',
};

function formatHotkey(mods, key) {
  if (!key) return '';
  const parts = [];
  if (mods.has('CmdOrCtrl')) parts.push('CmdOrCtrl');
  if (mods.has('Shift')) parts.push('Shift');
  if (mods.has('Alt')) parts.push('Alt');
  parts.push(key);
  return parts.join('+');
}

hotkeyInput.addEventListener('focus', () => {
  recordingHotkey = true;
  hotkeyInput.value = '';
  hotkeyInput.select();
});

hotkeyInput.addEventListener('blur', () => {
  recordingHotkey = false;
});

hotkeyInput.addEventListener('keydown', (e) => {
  if (!recordingHotkey) return;
  e.preventDefault();
  e.stopPropagation();

  if (e.key === 'Escape') {
    recordingHotkey = false;
    hotkeyInput.blur();
    return;
  }

  const mods = new Set();
  if (e.ctrlKey || e.metaKey) mods.add('CmdOrCtrl');
  if (e.shiftKey) mods.add('Shift');
  if (e.altKey) mods.add('Alt');

  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

  const keyName = getElectronKeyName(e.key, e.code);
  if (!keyName) return;

  if (mods.size === 0) return;
  if (!mods.has('CmdOrCtrl')) return;

  const combo = formatHotkey(mods, keyName);
  hotkeyInput.value = combo;
  recordingHotkey = false;
  hotkeyInput.blur();
});

function getElectronKeyName(key, code) {
  const special = {
    'F1':'F1','F2':'F2','F3':'F3','F4':'F4','F5':'F5','F6':'F6',
    'F7':'F7','F8':'F8','F9':'F9','F10':'F10','F11':'F11','F12':'F12',
    'Insert':'Insert','Delete':'Delete','Home':'Home','End':'End',
    'PageUp':'PageUp','PageDown':'PageDown','ArrowUp':'Up','ArrowDown':'Down',
    'ArrowLeft':'Left','ArrowRight':'Right','Tab':'Tab','Escape':'Escape',
    'Backspace':'Backspace','Enter':'Enter','Space':'Space',
  };
  if (special[key]) return special[key];

  if (/^[A-Za-z0-9]$/.test(key)) return key.toUpperCase();
  if (/^Digit\d$/.test(code)) return code.replace('Digit', '');
  if (/^Numpad\d$/.test(code)) return code.replace('Numpad', '');

  return null;
}

clearHotkeyBtn.addEventListener('click', () => {
  hotkeyInput.value = '';
});
function setClipboardMonitoring(enabled) {
  clipboardMonitoring = enabled;
  localStorage.setItem("clipboard_watch", enabled ? "1" : "");
  if (enabled) {
    clipboardMonitoring = true;
    lastClipboard = '';
    clipboardBadge.classList.remove("hidden");
    if (clipboardMonitorInterval) clearInterval(clipboardMonitorInterval);
    clipboardMonitorInterval = setInterval(async () => {
      if (!invoke) return;
      try {
        const text = await invoke('get_clipboard');
        if (text && text !== lastClipboard && text !== sourceText.value) {
          lastClipboard = text;
          sourceText.value = text;
          updateCharCount();
          if (sourceText.value.trim()) translate();
        }
      } catch {}
    }, 800);
  } else {
    clipboardMonitoring = false;
    if (clipboardMonitorInterval) {
      clearInterval(clipboardMonitorInterval);
      clipboardMonitorInterval = null;
    }
    clipboardBadge.classList.add("hidden");
  }
}

if (listen) {
  listen('hotkey-pressed', async () => {
    if (!invoke) return;
    try {
      const text = await invoke('get_clipboard');
      if (!text || !text.trim()) return;
      lastClipboard = text;
      invoke('create_popup', {
        text: text,
        source_lang: sourceLang.value,
        target_lang: targetLang.value,
        ollama_url: ollamaBaseUrl,
        selected_model: selectedModel,
        system_prompt: localStorage.getItem('system_prompt') || 'Translate the following text from {source} to {target}. Return ONLY the translation, without explanations or additions.',
      }).catch(() => {});
    } catch {}
  });
}

function syncPopupSettings() {
  if (invoke) {
    invoke('update_settings', {
      settings: {
        ollamaUrl: ollamaBaseUrl,
        selectedModel: selectedModel,
        systemPrompt: localStorage.getItem('system_prompt') || 'Translate the following text from {source} to {target}. Return ONLY the translation, without explanations or additions.',
        sourceLang: sourceLang.value,
        targetLang: targetLang.value,
      }
    }).catch(() => {});
  }
}

function setOllamaStatus(status, text) {
  ollamaStatusText.textContent = text;
  ollamaDot.className = 'dot';
  if (status === 'running') ollamaDot.classList.add('online');
  else if (status === 'starting') ollamaDot.style.background = '#f59e0b';
  [startOllamaBtn, stopOllamaBtn, downloadOllamaBtn, installOllamaBtn].forEach(b => b.classList.add('hidden'));
  if (status === 'running') {
    stopOllamaBtn.classList.remove('hidden');
    ollamaModelPull.classList.remove('hidden');
  } else if (status === 'installed') {
    startOllamaBtn.classList.remove('hidden');
    ollamaModelPull.classList.add('hidden');
  } else if (status === 'not_installed') {
    downloadOllamaBtn.classList.remove('hidden');
    ollamaModelPull.classList.add('hidden');
  }
  hideProgress();
}

function showProgress(msg) {
  ollamaProgress.classList.remove('hidden');
  progressFill.classList.add('active');
  progressText.textContent = msg;
}

function hideProgress() {
  ollamaProgress.classList.add('hidden');
  progressFill.classList.remove('active');
  progressFill.style.width = '0%';
}

async function updateOllamaStatus() {
  if (!invoke) return;
  try {
    const status = await invoke('get_ollama_status');
    if (status === 'running') {
      setOllamaStatus('running', 'Running');
    } else if (status === 'installed') {
      setOllamaStatus('installed', 'Installed (not running)');
    } else {
      setOllamaStatus('not_installed', 'Not installed');
    }
  } catch (e) {
    setOllamaStatus('not_installed', 'Error: ' + e.message);
  }
}

startOllamaBtn.addEventListener('click', async () => {
  if (!invoke) return;
  setOllamaStatus('starting', 'Starting Ollama...');
  showProgress('Starting Ollama server...');
  let unlistenProgress = null;
  try {
    if (listen) {
      unlistenProgress = await listen('ollama-start-progress', (e) => {
        showProgress(e.payload);
      });
    }
    await invoke('start_ollama');
    setOllamaStatus('running', 'Running');
    hideProgress();
    ollamaModelPull.classList.remove('hidden');
    checkConnection();
  } catch (e) {
    setOllamaStatus('installed', 'Start failed: ' + e.message);
    showProgress('Error: ' + e.message);
  }
  if (unlistenProgress) unlistenProgress();
});

stopOllamaBtn.addEventListener('click', async () => {
  if (!invoke) return;
  try {
    await invoke('stop_ollama');
    setOllamaStatus('installed', 'Installed (stopped)');
    ollamaModelPull.classList.add('hidden');
  } catch (e) {
    setOllamaStatus('running', 'Stop failed: ' + e.message);
  }
});

downloadOllamaBtn.addEventListener('click', async () => {
  if (!invoke) return;
  downloadOllamaBtn.disabled = true;
  downloadOllamaBtn.textContent = 'Downloading...';
  showProgress('Downloading Ollama installer (~400 MB)...');
  try {
    const path = await invoke('download_ollama');
    hideProgress();
    downloadOllamaBtn.textContent = 'Download';
    downloadOllamaBtn.classList.add('hidden');
    installOllamaBtn.classList.remove('hidden');
    installOllamaBtn.dataset.path = path;
    setOllamaStatus('not_installed', 'Ready to install');
  } catch (e) {
    showProgress('Download failed: ' + e.message);
    downloadOllamaBtn.textContent = 'Download';
  }
  downloadOllamaBtn.disabled = false;
});

installOllamaBtn.addEventListener('click', async () => {
  if (!invoke || !installOllamaBtn.dataset.path) return;
  installOllamaBtn.disabled = true;
  installOllamaBtn.textContent = 'Installing...';
  showProgress('Installing Ollama... (UAC prompt may appear)');
  try {
    await invoke('install_ollama', { path: installOllamaBtn.dataset.path });
    hideProgress();
    installOllamaBtn.textContent = 'Install';
    installOllamaBtn.classList.add('hidden');
    setOllamaStatus('installed', 'Installed. Start now.');
    downloadOllamaBtn.classList.add('hidden');
    startOllamaBtn.classList.remove('hidden');
  } catch (e) {
    showProgress('Installation failed: ' + e.message);
    installOllamaBtn.textContent = 'Install';
  }
  installOllamaBtn.disabled = false;
});

pullModelBtn.addEventListener('click', async () => {
  if (!invoke) return;
  const model = pullModelSelect.value;
  if (!model) return;
  pullModelBtn.disabled = true;
  pullModelBtn.textContent = 'Pulling...';
  showProgress(`Pulling model ${model} (~2 GB)...`);
  let unlistenStatus = null;
  let unlistenProgress = null;
  let unlistenDone = null;
  try {
    if (listen) {
      unlistenStatus = await listen('ollama-pull-status', (e) => {
        showProgress(e.payload);
      });
      unlistenProgress = await listen('ollama-pull-progress', (e) => {
        showProgress(e.payload);
      });
      unlistenDone = await listen('ollama-pull-done', () => {
        showProgress('Model ready!');
      });
    }
    await invoke('pull_ollama_model', { model: model });
    hideProgress();
    setOllamaStatus('running', 'Running (' + model + ')');
    localStorage.setItem('selected_model', model);
    selectedModel = model;
    modelName.textContent = model;
    checkConnection();
  } catch (e) {
    showProgress('Error: ' + e.message);
  }
  pullModelBtn.disabled = false;
  pullModelBtn.textContent = 'Pull model';
  if (unlistenStatus) unlistenStatus();
  if (unlistenProgress) unlistenProgress();
  if (unlistenDone) unlistenDone();
});

refreshOllamaBtn.addEventListener('click', updateOllamaStatus);

settingsBtn.addEventListener("click", () => {
  ollamaUrl.value = ollamaBaseUrl;
  systemPrompt.value = localStorage.getItem("system_prompt") ||
    "Translate the following text from {source} to {target}. Return ONLY the translation, without explanations or additions.";
  clipboardWatch.checked = localStorage.getItem("clipboard_watch") === "1";
  hotkeyInput.value = localStorage.getItem("hotkey") || "CmdOrCtrl+Shift+T";
  settingsModal.classList.remove("hidden");
  settingsModal.classList.add("visible");
  updateOllamaStatus();
  loadModels();
});

function closeSettingsModal() {
  settingsModal.classList.remove("visible");
  settingsModal.classList.add("hidden");
}
closeSettings.addEventListener("click", closeSettingsModal);
settingsModal.querySelector(".modal-backdrop").addEventListener("click", closeSettingsModal);

saveSettings.addEventListener("click", () => {
  ollamaBaseUrl = ollamaUrl.value.replace(/\/+$/, "");
  localStorage.setItem("ollama_url", ollamaBaseUrl);
  localStorage.setItem("system_prompt", systemPrompt.value);
  setClipboardMonitoring(clipboardWatch.checked);
  const hotkey = hotkeyInput.value.trim();
  localStorage.setItem("hotkey", hotkey);
  if (invoke) invoke('set_hotkey', { hotkey: hotkey }).catch(() => {});
  if (modelSelect.value) {
    selectedModel = modelSelect.value;
    localStorage.setItem("selected_model", selectedModel);
    modelName.textContent = selectedModel;
  }
  syncPopupSettings();
  closeSettingsModal();
  checkConnection();
});

async function loadModels() {
  try {
    let data;
    if (invoke) {
      const raw = await invoke('fetch_ollama_simple', { url: `${ollamaUrl.value.replace(/\/+$/, "")}/api/tags` });
      data = JSON.parse(raw);
    } else {
      const res = await fetch(`${ollamaUrl.value.replace(/\/+$/, "")}/api/tags`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    }
    availableModels = (data.models || []).map((m) => m.name).sort();
    modelSelect.innerHTML = '<option value="">-- Select a model --</option>';
    for (const m of availableModels) {
      const o = document.createElement("option");
      o.value = m;
      o.textContent = m;
      if (m === selectedModel) o.selected = true;
      modelSelect.appendChild(o);
    }
    connectionStatus.textContent = `Connected (${availableModels.length} models)`;
    connectionStatus.className = "connection-status ok";
    if (!selectedModel && availableModels.length > 0) {
      selectedModel = availableModels[0];
      localStorage.setItem("selected_model", selectedModel);
    }
  } catch (e) {
    connectionStatus.textContent = `Error: ${e.message}`;
    connectionStatus.className = "connection-status error";
  }
}

refreshModelsBtn.addEventListener("click", loadModels);

async function checkConnection() {
  try {
    let data, ok;
    if (invoke) {
      const raw = await invoke('fetch_ollama_simple', { url: `${ollamaBaseUrl}/api/tags` });
      data = JSON.parse(raw);
      ok = true;
    } else {
      const res = await fetch(`${ollamaBaseUrl}/api/tags`);
      ok = res.ok;
      if (ok) data = await res.json();
    }
    if (ok && data) {
      availableModels = (data.models || []).map((m) => m.name);
      const saved = localStorage.getItem("selected_model");
      if (saved && availableModels.includes(saved)) selectedModel = saved;
      else if (availableModels.length > 0) {
        selectedModel = availableModels[0];
        localStorage.setItem("selected_model", selectedModel);
      }
  modelName.textContent = selectedModel || "No model";
  modelDot.className = "dot online";
  setOllamaStatus('running', 'Running');
  ollamaModelPull.classList.remove('hidden');
  return true;
    }
  } catch (e) {
    modelName.textContent = "Error: " + (e.message || e);
    console.error('checkConnection error:', e);
  }
  modelDot.className = "dot";
  if (modelName.textContent !== 'No model' && !modelName.textContent.startsWith('Error')) {
    modelName.textContent = "Offline";
  }
  return false;
}

translateBtn.addEventListener("click", () => translate('translate'));
explainBtn.addEventListener("click", () => translate('explain'));

async function translate(mode, textOverride) {
  const text = textOverride || sourceText.value.trim();
  if (!text) { statusMsg.textContent = "Please enter text"; return; }
  if (!selectedModel) { statusMsg.textContent = "Please select a model in Settings"; return; }

  if (isTranslating && abortController) {
    abortController.abort();
    return;
  }

  const isExplain = mode === 'explain';
  const actionLabel = isExplain ? 'Explanation' : 'Translation';

  isTranslating = true;
  abortController = new AbortController();
  translateBtn.disabled = true;
  explainBtn.disabled = true;
  translateBtn.innerHTML = isExplain ? "Translate" : "⏳ Translating...";
  explainBtn.innerHTML = isExplain ? "⏳ Explaining..." : "Explain";
  statusMsg.textContent = `${actionLabel} in progress...`;
  targetText.innerHTML = "";
  translationInfo.textContent = "";

  if (!textOverride && sourceText.value.trim() !== text) {
    sourceText.value = text;
    updateCharCount();
  }

  let sysPrompt;
  const targetLabel = SOURCE_LABELS[targetLang.value] || targetLang.value;
  if (isExplain) {
    sysPrompt = `Explain the following code step by step. Cover the important concepts, functions and special details. Explain in ${targetLabel}.`;
  } else {
    const fromLabel = SOURCE_LABELS[sourceLang.value] || sourceLang.value;
    sysPrompt = (localStorage.getItem("system_prompt") ||
      "Translate the following text from {source} to {target}. Return ONLY the translation, without explanations or additions.")
      .replace("{source}", fromLabel)
      .replace("{target}", targetLabel);
  }

  let fullText = "";
  let unlistenChunk = null;
  let unlistenDone = null;

  try {
    if (invoke && listen) {
      const [fnChunk, fnDone] = await Promise.all([
        listen('ollama-chunk', (event) => {
          fullText += event.payload;
          targetText.textContent = fullText;
        }),
        listen('ollama-done', () => {}),
      ]);
      unlistenChunk = fnChunk;
      unlistenDone = fnDone;

      await invoke('fetch_ollama', {
        url: `${ollamaBaseUrl}/api/generate`,
        body: JSON.stringify({ model: selectedModel, prompt: `${sysPrompt}\n\n${text}`, stream: true }),
      });
    } else {
      abortController.signal.addEventListener('abort', () => {});
      const res = await fetch(`${ollamaBaseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: selectedModel, prompt: `${sysPrompt}\n\n${text}`, stream: true }),
        signal: abortController.signal,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (!line) continue;
          try {
            const obj = JSON.parse(line);
            if (obj.response) {
              fullText += obj.response;
              targetText.textContent = fullText;
            }
            if (obj.error) throw new Error(obj.error);
            if (obj.done) break;
          } catch (e) {
            if (!(e instanceof SyntaxError)) throw e;
          }
        }
      }
      try { reader.releaseLock(); } catch {}
    }
    const doneLabel = isExplain ? 'Explanation' : 'Translation';
    translationInfo.textContent = `${doneLabel} via ${selectedModel}`;
    statusMsg.textContent = "";
    if (!fullText) targetText.innerHTML = '<div class="placeholder">No response received</div>';
  } catch (e) {
    if (e.name === "AbortError") statusMsg.textContent = "Cancelled";
    else {
      targetText.textContent = `Error: ${e.message}`;
      statusMsg.textContent = `${actionLabel} failed`;
    }
  } finally {
    isTranslating = false;
    abortController = null;
    translateBtn.disabled = false;
    explainBtn.disabled = false;
    translateBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 7 4"/><polyline points="17 4 20 4 20 7"/><polyline points="20 17 20 20 17 20"/><polyline points="7 20 4 20 4 17"/><line x1="12" y1="7" x2="12" y2="17"/><line x1="7" y1="12" x2="17" y2="12"/></svg> Translate`;
    explainBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg> Explain`;
  }
}

sourceText.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    translate();
  }
});

(async () => {
  if (selectedModel) modelName.textContent = selectedModel;
  if (localStorage.getItem("clipboard_watch") === "1") {
    setClipboardMonitoring(true);
  }
  const savedHotkey = localStorage.getItem("hotkey") || "CmdOrCtrl+Shift+T";
  if (invoke) {
    invoke('set_hotkey', { hotkey: savedHotkey }).catch(() => {});
  }
  const connected = await checkConnection();
  if (!connected && invoke) {
    try {
      const status = await invoke('get_ollama_status');
      if (status === 'installed') {
        setOllamaStatus('starting', 'Starting Ollama automatically...');
        try {
          await invoke('start_ollama');
          setOllamaStatus('running', 'Running');
          await checkConnection();
        } catch (e) {
          setOllamaStatus('installed', 'Ollama ready');
        }
      }
    } catch {}
  }
  syncPopupSettings();
})();
