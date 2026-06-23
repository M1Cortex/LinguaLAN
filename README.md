# LinguaLAN

**Local machine translation for your desktop.** No cloud, no API keys, your data stays on your computer.

![LinguaLAN](assets/icon.png)

LinguaLAN is a Windows desktop app that translates text locally using [Ollama](https://ollama.com) as its translation engine. Built with Electron.

**20+ languages** — German, English, French, Spanish, Italian, Portuguese, Dutch, Polish, Russian, Chinese, Japanese, Korean, Turkish, Czech, Swedish, Danish, Finnish, Greek, Romanian, Hungarian, and more.

---

## Features

- Fully offline — everything runs on your machine
- Popup translator — press `Ctrl+Shift+T` from any app
- Clipboard monitoring — auto-translate copied text
- Global hotkey — fully customizable
- Dark / Light mode
- Auto-manage Ollama — app can download, install, start and stop Ollama

---

## Quick Start

### 1. Download

Grab the latest release from the [Releases page](https://github.com/M1Cortex/LinguaLAN/releases).

### 2. First Run

1. Open LinguaLAN → click gear icon (⚙️) to open Settings
2. Click **Download** → Ollama installer is fetched automatically
3. Click **Installieren** → Ollama installs silently
4. Click **Starten** → Ollama server starts
5. Pick a model (e.g. `llama3.2:3b`) → click **Modell laden**
6. Done! Start translating.

### 3. Translate

| Action | How |
|---|---|
| Type & translate | Enter text, click **Übersetzen** (or `Ctrl+Enter`) |
| From any app | Copy text → press `Ctrl+Shift+T` → popup appears |
| Auto mode | Enable **Clipboard Monitoring** in settings |

---

## Build from Source

### Prerequisites

- [Node.js](https://nodejs.org) v18+

### Build

```bash
git clone https://github.com/M1Cortex/LinguaLAN.git
cd LinguaLAN
npm install
npm run build
```

Output: `electron-version/dist/LinguaLAN-*-electron-x64.exe`

---

## Project Structure

```
LinguaLAN/
├── src/                       # Frontend (HTML/CSS/JS)
│   ├── index.html             # Main translation window
│   ├── popup.html             # Popup translator window
│   ├── popup.js               # Popup logic
│   ├── renderer.js            # Main app logic
│   └── style.css              # Light & dark mode styles
├── electron-version/          # Electron backend
│   ├── main.js                # Main process (IPC, window mgmt)
│   ├── preload.js             # Tauri API bridge
│   ├── package.json           # Build config
│   └── README.md
├── assets/
│   └── icon.png               # App icon
├── package.json               # Project metadata
├── LICENSE                    # MIT License
└── README.md
```

---

## Settings

| Setting | Description | Default |
|---|---|---|
| Ollama URL | API endpoint | `http://localhost:11434` |
| Translation Model | Which LLM to use | `llama3.2:3b` |
| System Prompt | Prompt template | Übersetze... |
| Clipboard Monitoring | Auto-translate copied text | Off |
| Global Hotkey | Keyboard shortcut | `Ctrl+Shift+T` |
| Theme | Dark / Light mode | System |

---

## License

MIT — see [LICENSE](LICENSE).

Copyright (c) 2026 [M1Cortex](https://github.com/M1Cortex)
