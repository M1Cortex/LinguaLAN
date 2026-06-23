window.onerror = (msg, url, line) => {
  const d = document.getElementById('translationDisplay');
  if (d) d.textContent = `Fehler: ${msg} (Zeile ${line})`;
};

if (localStorage.getItem('dark_mode') === '1') document.body.classList.add('dark-mode');

const TAURI = window.__TAURI__;
const invoke = TAURI && TAURI.core ? TAURI.core.invoke : null;
const listen = TAURI && TAURI.event ? TAURI.event.listen : null;

const sourceDisplay = document.getElementById('sourceDisplay');
const translationDisplay = document.getElementById('translationDisplay');
const modelInfo = document.getElementById('modelInfo');
const closeBtn = document.getElementById('closeBtn');
const copyBtn = document.getElementById('copyBtn');
const pinBtn = document.getElementById('pinBtn');

let isPinned = false;

closeBtn.addEventListener('click', () => { if (invoke) invoke('close_popup').catch(() => {}); });

pinBtn.addEventListener('click', () => {
  isPinned = !isPinned;
  pinBtn.textContent = isPinned ? 'Angheftet 📌' : 'Anheften';
});

copyBtn.addEventListener('click', () => {
  const text = translationDisplay.innerText;
  if (text && text !== 'Übersetzung wird geladen...') {
    navigator.clipboard.writeText(text).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
    });
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !isPinned && invoke) invoke('close_popup').catch(() => {});
});

// Popup-Daten per IPC abholen
(async () => {
  if (!invoke) return;
  try {
    const data = await invoke('get_popup_data');
    if (!data) { translationDisplay.textContent = 'Fehler: Keine Daten'; return; }
    const { text, ollamaUrl, selectedModel, systemPrompt, sourceLang, targetLang } = data;
    sourceDisplay.textContent = text.substring(0, 200) + (text.length > 200 ? '...' : '');
    if (!selectedModel) {
      translationDisplay.textContent = 'Fehler: Kein Modell ausgewählt';
    } else {
      translate(text, ollamaUrl, selectedModel, systemPrompt, sourceLang, targetLang);
    }
  } catch (e) {
    translationDisplay.textContent = 'Fehler: ' + e.message;
  }
})();

async function translate(text, ollamaUrl, selectedModel, systemPrompt, sourceLang, targetLang) {
  translationDisplay.innerHTML = '<div class="placeholder">Übersetzung läuft...</div>';
  const fromLabel = sourceLang || 'unbekannt';
  const toLabel = targetLang || 'Deutsch';
  const prompt = (systemPrompt || '').replace('{source}', fromLabel).replace('{target}', toLabel);

  let fullText = '';
  try {
    if (invoke && listen) {
      const [unlistenChunk] = await Promise.all([
        listen('ollama-chunk', (event) => {
          fullText += event.payload;
          translationDisplay.textContent = fullText;
        }),
      ]);
      await invoke('fetch_ollama', {
        url: `${ollamaUrl}/api/generate`,
        body: JSON.stringify({ model: selectedModel, prompt: `${prompt}\n\n${text}`, stream: true }),
      });
      unlistenChunk();
    } else {
      const res = await fetch(`${ollamaUrl}/api/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedModel, prompt: `${prompt}\n\n${text}`, stream: true }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (!line) continue;
          try {
            const obj = JSON.parse(line);
            if (obj.response) { fullText += obj.response; translationDisplay.textContent = fullText; }
            if (obj.error) throw new Error(obj.error);
            if (obj.done) break;
          } catch (e) { if (!(e instanceof SyntaxError)) throw e; }
        }
      }
      try { reader.releaseLock(); } catch {}
    }
    modelInfo.textContent = `via ${selectedModel}`;
  } catch (e) {
    translationDisplay.textContent = `Fehler: ${e.message}`;
  }
}
