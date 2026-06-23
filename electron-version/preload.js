const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Clipboard
  getClipboard: () => ipcRenderer.invoke('get-clipboard'),
  startClipboardMonitor: () => ipcRenderer.invoke('start-clipboard-monitor'),
  stopClipboardMonitor: () => ipcRenderer.invoke('stop-clipboard-monitor'),
  onClipboardText: (callback) => {
    ipcRenderer.on('clipboard-text', (_event, text) => callback(text));
  },
  onTriggerTranslate: (callback) => {
    ipcRenderer.on('trigger-translate', () => callback());
  },

  // Hotkey
  setHotkey: (hotkey) => ipcRenderer.invoke('set-hotkey', hotkey),
  onHotkeyStatus: (callback) => {
    ipcRenderer.on('hotkey-status', (_event, status) => callback(status));
  },

  // Popup
  onPopupText: (callback) => {
    ipcRenderer.on('popup-text', (_event, data) => callback(data));
  },
  updatePopupSettings: (settings) => ipcRenderer.invoke('update-popup-settings', settings),
  closePopup: () => ipcRenderer.invoke('close-popup'),
});
