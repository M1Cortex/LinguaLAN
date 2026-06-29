const { app, BrowserWindow, globalShortcut, clipboard, ipcMain, screen } = require('electron');
const path = require('path');
const http = require('http');
const net = require('net');
const { spawn, execSync, exec } = require('child_process');
const fs = require('fs');
const os = require('os');

let mainWindow = null;
let popupWindow = null;
let ollamaProcess = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960, height: 700, minWidth: 700, minHeight: 500,
    title: 'LinguaLAN - Local Translation',
    webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, 'preload.js') },
  });
  app.setAppUserModelId('com.lingualan.desktop');
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

function createPopupWindow(text, opts) {
  if (popupWindow && !popupWindow.isDestroyed()) { popupWindow.close(); popupWindow = null; }
  const cursor = screen.getCursorScreenPoint();
  popupWindow = new BrowserWindow({
    width: 400, height: 300, x: Math.max(0, cursor.x - 200), y: Math.max(0, cursor.y + 20),
    alwaysOnTop: true, skipTaskbar: true, frame: false, resizable: false, show: false,
    title: 'LinguaLAN - Translation',
    webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, 'preload.js') },
  });
  popupWindow.loadFile(path.join(__dirname, 'popup.html'));
  popupWindow.once('ready-to-show', () => { popupWindow.show(); popupWindow.focus(); });
  popupWindow.on('blur', () => { setTimeout(() => { if (popupWindow && !popupWindow.isDestroyed() && !popupWindow.pinned) { popupWindow.close(); popupWindow = null; } }, 200); });
  popupWindow.on('closed', () => { popupWindow = null; });
}

function readClipboard() { try { return (clipboard.readText('clipboard') || '').trim(); } catch { return ''; } }

function copySelection() {
  try {
    execSync('powershell -c "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\'^c\')"', { timeout: 1000 });
  } catch {}
}

// ===== IPC Handlers =====

ipcMain.handle('get_clipboard', () => readClipboard());

ipcMain.handle('fetch_ollama', async (event, args) => {
  const url = args.url.replace(/^http:\/\//, '');
  const [host, ...rest] = url.split('/');
  const addr = host;
  const path = '/' + rest.join('/');
  const body = args.body;
  const sender = event.sender;

  const client = new net.Socket();
  return new Promise((resolve, reject) => {
    client.connect(addr.includes(':') ? parseInt(addr.split(':')[1]) : 80, addr.split(':')[0], () => {
      client.write(`POST ${path} HTTP/1.1\r\nHost: ${addr}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`);
    });
    let buffer = '';
    let headerDone = false;
    client.on('data', (data) => {
      buffer += data.toString();
      if (!headerDone) {
        const idx = buffer.indexOf('\r\n\r\n');
        if (idx !== -1) {
          headerDone = true;
          const bodyData = buffer.slice(idx + 4);
          buffer = '';
          processLines(bodyData, sender);
        }
      } else {
        processLines(buffer, sender);
        buffer = '';
      }
    });
    client.on('close', () => { sender.send('ollama-done', ''); resolve(); });
    client.on('error', (e) => reject(e.message));
  });
});

function processLines(data, sender) {
  if (!sender) return;
  for (const line of data.split('\n').map(l => l.trim()).filter(Boolean)) {
    try {
      const obj = JSON.parse(line);
      if (obj.response) sender.send('ollama-chunk', obj.response);
    } catch {}
  }
}

let pendingPopupData = null;
let popupSettings = null;

ipcMain.handle('fetch_ollama_simple', async (event, args) => {
  const url = args.url.replace(/^http:\/\//, '');
  const [host, ...rest] = url.split('/');
  const addr = host;
  const path = '/' + rest.join('/');
  const client = new net.Socket();
  return new Promise((resolve, reject) => {
    client.connect(addr.includes(':') ? parseInt(addr.split(':')[1]) : 80, addr.split(':')[0], () => {
      client.write(`GET ${path} HTTP/1.1\r\nHost: ${addr}\r\nConnection: close\r\n\r\n`);
    });
    let resp = '';
    client.on('data', (d) => { resp += d.toString(); });
    client.on('close', () => {
      const body = resp.includes('\r\n\r\n') ? resp.split('\r\n\r\n').slice(1).join('\r\n\r\n') : resp;
      resolve(body);
    });
    client.on('error', (e) => reject(e.message));
  });
});

ipcMain.handle('set_hotkey', (event, args) => {
  globalShortcut.unregisterAll();
  if (!args.hotkey) return true;
  const key = args.hotkey.replace(/CmdOrCtrl/g, 'CommandOrControl');
  try {
    globalShortcut.register(key, () => {
      copySelection();
      const text = readClipboard();
      if (!text || !mainWindow || mainWindow.isDestroyed()) return;
      if (mainWindow.isVisible()) {
        mainWindow.webContents.send('hotkey-pressed', '');
      } else {
        pendingPopupData = {
          text: text,
          ollamaUrl: popupSettings?.ollamaUrl || 'http://localhost:11434',
          selectedModel: popupSettings?.selectedModel || '',
          systemPrompt: popupSettings?.systemPrompt || 'Translate the following text from {source} to {target}. Return ONLY the translation, without explanations or additions.',
          sourceLang: popupSettings?.sourceLang || 'German',
          targetLang: popupSettings?.targetLang || 'English',
        };
        createPopupWindow(text, {});
      }
    });
    return true;
  } catch { return false; }
});

ipcMain.handle('create_popup', (event, args) => {
  pendingPopupData = {
    text: args.text,
    ollamaUrl: args.ollama_url,
    selectedModel: args.selected_model,
    systemPrompt: args.system_prompt,
    sourceLang: args.source_lang,
    targetLang: args.target_lang,
  };
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.focus();
  } else {
    createPopupWindow(args.text, args);
  }
  return true;
});

ipcMain.handle('get_popup_data', () => {
  const data = pendingPopupData;
  pendingPopupData = null;
  return data;
});

ipcMain.handle('close_popup', () => {
  if (popupWindow && !popupWindow.isDestroyed()) { popupWindow.close(); popupWindow = null; }
  return true;
});

ipcMain.handle('get_settings', () => popupSettings || {});

ipcMain.handle('update_settings', (event, args) => {
  popupSettings = args.settings;
  return true;
});

// ===== Ollama Management =====

function findOllama() {
  const paths = (process.env.PATH || '').split(path.delimiter);
  for (const p of paths) {
    const exe = path.join(p, 'ollama.exe');
    if (fs.existsSync(exe)) return exe;
  }
  for (const base of [process.env.LOCALAPPDATA, process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)']].filter(Boolean)) {
    for (const p of [path.join(base, 'Programs', 'Ollama', 'ollama.exe'), path.join(base, 'Ollama', 'ollama.exe')]) {
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

function checkOllama() {
  return new Promise((resolve) => {
    const s = new net.Socket();
    s.setTimeout(500);
    s.on('connect', () => { s.destroy(); resolve(true); });
    s.on('error', () => resolve(false));
    s.on('timeout', () => { s.destroy(); resolve(false); });
    s.connect(11434, '127.0.0.1');
  });
}

ipcMain.handle('get_ollama_status', async () => {
  if (await checkOllama()) return 'running';
  return findOllama() ? 'installed' : 'not_installed';
});

ipcMain.handle('find_ollama', () => findOllama() || '');

ipcMain.handle('get_app_data_dir', () => path.join(os.homedir(), 'AppData', 'Roaming', 'com.lingualan.desktop'));

ipcMain.handle('start_ollama', async (event) => {
  const exe = findOllama();
  if (!exe) throw new Error('Ollama not installed');
  if (ollamaProcess) { ollamaProcess.kill(); ollamaProcess = null; }
  ollamaProcess = spawn(exe, ['serve'], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    if (await checkOllama()) { mainWindow?.webContents.send('ollama-status-changed', 'running'); return; }
    if (i % 10 === 0) mainWindow?.webContents.send('ollama-start-progress', `Warte... (${Math.floor(i/2)}s)`);
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('Ollama API not responding after 30s');
});

ipcMain.handle('stop_ollama', () => {
  if (ollamaProcess) { ollamaProcess.kill(); ollamaProcess = null; }
  return true;
});

ipcMain.handle('download_ollama', async () => {
  const dataDir = path.join(os.homedir(), 'AppData', 'Roaming', 'com.lingualan.desktop', 'ollama');
  fs.mkdirSync(dataDir, { recursive: true });
  const outPath = path.join(dataDir, 'OllamaSetup.exe');
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outPath);
    http.get('http://ollama.com/download/OllamaSetup.exe', (res) => {
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(outPath); });
    }).on('error', (e) => { fs.unlinkSync(outPath); reject(e.message); });
  });
});

ipcMain.handle('install_ollama', async (event, args) => {
  return new Promise((resolve, reject) => {
    const proc = spawn(args.path, ['/S'], { stdio: 'ignore' });
    proc.on('exit', (code) => { code === 0 ? resolve() : reject(`Exit code ${code}`); });
    proc.on('error', (e) => reject(e.message));
  });
});

ipcMain.handle('get_ollama_models', async () => {
  const client = new net.Socket();
  return new Promise((resolve, reject) => {
    client.connect(11434, '127.0.0.1', () => {
      client.write('GET /api/tags HTTP/1.1\r\nHost: 127.0.0.1:11434\r\nConnection: close\r\n\r\n');
    });
    let resp = '';
    client.on('data', (d) => { resp += d.toString(); });
    client.on('close', () => {
      try {
        const body = resp.includes('\r\n\r\n') ? resp.split('\r\n\r\n').slice(1).join('\r\n\r\n') : resp;
        const data = JSON.parse(body);
        resolve((data.models || []).map(m => m.name));
      } catch { reject('Parse error'); }
    });
    client.on('error', reject);
  });
});

ipcMain.handle('pull_ollama_model', async (event, args) => {
  const body = JSON.stringify({ name: args.model, stream: true });
  const client = new net.Socket();
  return new Promise((resolve, reject) => {
    client.connect(11434, '127.0.0.1', () => {
      client.write(`POST /api/pull HTTP/1.1\r\nHost: 127.0.0.1:11434\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`);
    });
    let buf = '';
    let headerDone = false;
    client.on('data', (d) => {
      buf += d.toString();
      if (!headerDone) {
        const idx = buf.indexOf('\r\n\r\n');
        if (idx !== -1) {
          headerDone = true;
          const rest = buf.slice(idx + 4);
          buf = '';
          for (const line of rest.split('\n').map(l => l.trim()).filter(Boolean)) {
            try {
              const obj = JSON.parse(line);
              if (obj.status) mainWindow?.webContents.send('ollama-pull-status', obj.status);
              if (obj.error) reject(obj.error);
            } catch {}
          }
        }
      } else {
        for (const line of buf.split('\n').map(l => l.trim()).filter(Boolean)) {
          try {
            const obj = JSON.parse(line);
            if (obj.status) mainWindow?.webContents.send('ollama-pull-status', obj.status);
            if (obj.error) reject(obj.error);
            if (obj.status && obj.status.includes('success')) mainWindow?.webContents.send('ollama-pull-done', args.model);
          } catch {}
        }
        buf = '';
      }
    });
    client.on('close', () => resolve());
    client.on('error', reject);
  });
});

// ===== App Lifecycle =====

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (ollamaProcess) ollamaProcess.kill(); if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('will-quit', () => { globalShortcut.unregisterAll(); if (ollamaProcess) ollamaProcess.kill(); });
