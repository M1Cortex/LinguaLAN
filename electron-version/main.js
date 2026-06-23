const { app, BrowserWindow, globalShortcut, clipboard, ipcMain, screen } = require('electron');
const path = require('path');

let mainWindow = null;
let popupWindow = null;
let clipboardMonitor = null;
let lastClipboard = '';

// Popup-Einstellungen (vom Renderer via IPC aktualisiert)
let popupSettings = {
  ollamaUrl: 'http://localhost:11434',
  selectedModel: '',
  systemPrompt: 'Übersetze den folgenden Text von {source} nach {target}. Gib NUR die Übersetzung zurück, ohne Erklärungen oder Zusätze.',
  sourceLang: 'English',
  targetLang: 'German',
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 700,
    minWidth: 700,
    minHeight: 500,
    title: 'Localingo - Lokale Übersetzung',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  app.setAppUserModelId('com.localingo.app');
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
}

function createPopupWindow(text) {
  // Schließe altes Popup
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.close();
    popupWindow = null;
  }

  // Mausposition für Popup-Platzierung
  const cursor = screen.getCursorScreenPoint();

  popupWindow = new BrowserWindow({
    width: 400,
    height: 300,
    x: Math.max(0, cursor.x - 200),
    y: Math.max(0, cursor.y + 20),
    alwaysOnTop: true,
    skipTaskbar: true,
    frame: false,
    resizable: false,
    transparent: false,
    show: false,
    title: 'Localingo - Übersetzung',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  popupWindow.loadFile(path.join(__dirname, 'src', 'popup.html'));

  popupWindow.once('ready-to-show', () => {
    popupWindow.show();
    popupWindow.focus();
    popupWindow.webContents.send('popup-text', {
      text,
      ...popupSettings,
    });
  });

  popupWindow.on('blur', () => {
    // Popup schließen wenn es den Fokus verliert
    setTimeout(() => {
      if (popupWindow && !popupWindow.isDestroyed()) {
        popupWindow.close();
        popupWindow = null;
      }
    }, 200);
  });

  popupWindow.on('closed', () => {
    popupWindow = null;
  });
}

function readClipboardText() {
  try {
    const text = clipboard.readText('clipboard');
    return (text || '').trim();
  } catch {
    return '';
  }
}

function doTranslateClipboard() {
  const text = readClipboardText();
  if (!text) return;
  lastClipboard = text;

  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
    // Hauptfenster sichtbar → dorthin senden
    mainWindow.webContents.send('clipboard-text', text);
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('trigger-translate');
      }
    }, 50);
  } else {
    // Hauptfenster minimiert/versteckt → Popup
    createPopupWindow(text);
  }
}

async function sendClipboardToRenderer() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const text = readClipboardText();
  if (text && text !== lastClipboard) {
    lastClipboard = text;
    mainWindow.webContents.send('clipboard-text', text);
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('trigger-translate');
      }
    }, 50);
  }
}

function startClipboardMonitor() {
  stopClipboardMonitor();
  lastClipboard = readClipboardText();
  clipboardMonitor = setInterval(sendClipboardToRenderer, 800);
}

function stopClipboardMonitor() {
  if (clipboardMonitor) {
    clearInterval(clipboardMonitor);
    clipboardMonitor = null;
  }
}

function registerHotkey(hotkey) {
  globalShortcut.unregisterAll();
  if (!hotkey) return true;
  const registered = globalShortcut.register(hotkey, doTranslateClipboard);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('hotkey-status', {
      ok: registered,
      hotkey,
      error: registered ? null : 'Konflikt oder ungültige Kombination'
    });
  }
  return registered;
}

// IPC handlers
ipcMain.handle('get-clipboard', () => readClipboardText());

ipcMain.handle('start-clipboard-monitor', () => {
  startClipboardMonitor();
  return true;
});
ipcMain.handle('stop-clipboard-monitor', () => {
  stopClipboardMonitor();
  return true;
});

ipcMain.handle('set-hotkey', (_event, hotkey) => {
  registerHotkey(hotkey);
  return true;
});

ipcMain.handle('update-popup-settings', (_event, settings) => {
  popupSettings = { ...popupSettings, ...settings };
  return true;
});

ipcMain.handle('close-popup', () => {
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.close();
    popupWindow = null;
  }
  return true;
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopClipboardMonitor();
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  stopClipboardMonitor();
  globalShortcut.unregisterAll();
});
