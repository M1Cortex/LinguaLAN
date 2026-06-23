const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('__TAURI__', {
  core: {
    invoke: (cmd, args) => ipcRenderer.invoke(cmd, args || {}),
  },
  event: {
    listen: (event, callback) => {
      const handler = (_e, data) => callback({ payload: data });
      ipcRenderer.on(event, handler);
      return () => ipcRenderer.removeListener(event, handler);
    },
  },
});
