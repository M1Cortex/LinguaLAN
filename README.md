# LinguaLAN

**Local machine translation for your desktop.** No cloud, no API keys, your data stays on your computer.

![LinguaLAN Screenshot](assets/icon.png)

LinguaLAN is a portable Windows desktop app that translates text using [Ollama](https://ollama.com) as its local translation engine. Built with [Tauri v2](https://v2.tauri.app), it delivers a full translation UI in a tiny ~5.6 MB binary — no Electron overhead.

> **20+ languages** — German, English, French, Spanish, Italian, Portuguese, Dutch, Polish, Russian, Chinese, Japanese, Korean, Turkish, Czech, Swedish, Danish, Finnish, Greek, Romanian, Hungarian, and more.

---

## Features ✨

- **Fully offline** — everything runs on your machine, no internet needed after setup
- **Popup translator** — press `Ctrl+Shift+T` from any app to translate clipboard content
- **Clipboard monitoring** — auto-translate what you copy
- **Global hotkey** — fully customizable keyboard shortcut
- **Dark / Light mode** — persists across sessions
- **Portable** — single ~5.6 MB `.exe`, runs on any Windows 10/11 (WebView2 built-in)
- **Auto-manage Ollama** — the app can download, install, start and stop Ollama for you

---

## Quick Start 🚀

### 1. Download

Grab the latest release from the [Releases page](https://github.com/M1Cortex/LinguaLAN/releases). Choose either:
- **Portable `.exe`** — run from anywhere, no install
- **NSIS installer** — adds start menu shortcut

### 2. First Run

1. Open LinguaLAN → click the gear icon (⚙️) in the top-right
2. Click **Download** → Ollama installer is fetched automatically
3. Click **Installieren** → Ollama installs silently
4. Click **Starten** → Ollama server starts
5. Pick a model (e.g. `llama3.2:3b`) → click **Modell laden**
6. Done! Start translating.

### 3. Translate

| Action | How |
|---|---|
| Type & translate | Enter text, click **Übersetzen** (or `Ctrl+Enter`) |
| Paste & translate | Paste text, tab to target, click Übersetzen |
| From any app | Copy text → press `Ctrl+Shift+T` → popup appears |
| Auto mode | Enable **Clipboard Monitoring** in settings |

---

## Screenshots

| Main Window | Popup Translator | Settings |
|---|---|---|
| *(screenshot coming soon)* | *(screenshot coming soon)* | *(screenshot coming soon)* |

---

## Build from Source 🔧

### Prerequisites

- [Rust](https://rustup.rs) (MSVC toolchain for Windows)
- [Node.js](https://nodejs.org) v18+

### Build

```bash
git clone https://github.com/M1Cortex/LinguaLAN.git
cd LinguaLAN
npm install
npx tauri build
```

Output: `src-tauri/target/release/bundle/` contains the portable `.exe` + installer.

---

## Architecture 🏗️

```
┌────────────────────────────────────────────────┐
│                  LinguaLAN                      │
│  ┌─────────────┐        ┌───────────────────┐  │
│  │  Frontend    │  IPC   │   Rust Backend    │  │
│  │ (HTML/CSS/JS)│◄─────►│   (Tauri v2)      │  │
│  │             │        │                   │  │
│  │ • Main     │        │ • Clipboard       │  │
│  │ • Popup    │        │ • Hotkey          │  │
│  │ • Settings │        │ • HTTP proxy      │  │
│  └─────────────┘        │ • Process mgmt   │  │
│                         └────────┬──────────┘  │
│                                  │              │
│                         ┌────────▼───────────┐  │
│                         │   Ollama Engine     │  │
│                         │ (localhost:11434)   │  │
│                         │ • LLM translation  │  │
│                         └────────────────────┘  │
└────────────────────────────────────────────────┘
```

### Why Tauri over Electron?

| | LinguaLAN (Tauri) | Electron-based |
|---|---|---|
| **Binary size** | ~5.6 MB | ~75 MB |
| **RAM usage** | ~30 MB | ~150 MB |
| **Build time** | ~90s | ~30s |
| **Language** | Rust + JS | JS only |

### Tech Stack

| Layer | Technology |
|---|---|
| Desktop framework | [Tauri v2](https://v2.tauri.app) |
| Backend language | Rust (no std::net, arboard, tokio) |
| Frontend | Vanilla HTML/CSS/JS |
| Translation engine | [Ollama](https://ollama.com) |
| HTTP (Ollama proxy) | Raw TCP (no reqwest — smaller binary) |
| Installer | NSIS (Tauri built-in) |

---

## Project Structure 📁

```
LinguaLAN/
├── src/                      # Frontend (shared between versions)
│   ├── index.html            # Main translation window
│   ├── popup.html            # Popup translator window
│   ├── popup.js              # Popup logic
│   ├── renderer.js           # Main app logic
│   └── style.css             # Light & dark mode styles
├── src-tauri/                # 🏆 Current: Tauri v2 backend (Rust)
│   ├── src/
│   │   ├── main.rs           # Entry point
│   │   └── lib.rs            # Commands: clipboard, hotkey, Ollama mgmt
│   ├── Cargo.toml            # Rust dependencies
│   ├── tauri.conf.json       # Tauri configuration
│   └── capabilities/         # Permission declarations
├── electron-version/         # 📦 Legacy: Original Electron backend
│   ├── main.js               # Electron main process
│   ├── preload.js            # Electron preload script
│   └── README.md             # How to run the Electron version
├── assets/
│   └── icon.png              # App icon
├── package.json              # Project metadata
├── LICENSE                   # MIT License
└── README.md
```

---

## Settings ⚙️

| Setting | Description | Default |
|---|---|---|
| **Ollama URL** | Ollama API endpoint | `http://localhost:11434` |
| **Translation Model** | Which LLM to use | `llama3.2:3b` |
| **System Prompt** | Prompt template for translation | `Übersetze...` |
| **Clipboard Monitoring** | Auto-translate copied text | Off |
| **Global Hotkey** | Keyboard shortcut for popup | `Ctrl+Shift+T` |
| **Theme** | Dark / Light mode | System |

---

## Version History 📜

| Version | Date | Notes |
|---|---|---|
| **1.0.0** | 2026-06 | Tauri v2 release. Binary 5.6 MB. Ollama auto-management. |
| **0.9.0** | 2026-05 | Electron prototype (legacy, ~75 MB). |

---

## License 📄

MIT — see [LICENSE](LICENSE).

Copyright (c) 2026 [M1Cortex](https://github.com/M1Cortex)

---

## Contributing 🤝

Contributions are welcome! Fork the repo, make your changes, and open a pull request.

---

## Acknowledgements 🙏

- [Ollama](https://ollama.com) — local LLM runtime
- [Tauri](https://v2.tauri.app) — desktop framework
- [Helsinki-NLP OPUS-MT](https://github.com/Helsinki-NLP/Opus-MT) — translation model research
