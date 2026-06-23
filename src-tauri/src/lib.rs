use std::sync::Mutex;
use std::io::{Read, Write};
use std::process::{Child, Command};
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Settings {
    pub ollama_url: String,
    pub selected_model: String,
    pub system_prompt: String,
    pub source_lang: String,
    pub target_lang: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            ollama_url: "http://localhost:11434".into(),
            selected_model: String::new(),
            system_prompt: "Übersetze den folgenden Text von {source} nach {target}. Gib NUR die Übersetzung zurück, ohne Erklärungen oder Zusätze.".into(),
            source_lang: "German".into(),
            target_lang: "English".into(),
        }
    }
}

struct AppState {
    settings: Mutex<Settings>,
}

struct OllamaState {
    process: Mutex<Option<Child>>,
}

fn find_ollama_exe() -> Option<std::path::PathBuf> {
    if let Some(paths) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&paths) {
            let exe = dir.join("ollama.exe");
            if exe.is_file() { return Some(exe); }
        }
    }
    for base in [std::env::var_os("LOCALAPPDATA"), std::env::var_os("PROGRAMFILES"), std::env::var_os("PROGRAMFILES(X86)")].iter().flatten() {
        let exe = std::path::PathBuf::from(base).join("Programs").join("Ollama").join("ollama.exe");
        if exe.is_file() { return Some(exe); }
        let exe2 = std::path::PathBuf::from(base).join("Ollama").join("ollama.exe");
        if exe2.is_file() { return Some(exe2); }
    }
    None
}

fn check_ollama_connect() -> bool {
    std::net::TcpStream::connect_timeout(
        &"127.0.0.1:11434".parse().unwrap(),
        std::time::Duration::from_millis(800),
    ).is_ok()
}

#[tauri::command]
fn get_clipboard() -> Result<String, String> {
    std::thread::spawn(|| {
        arboard::Clipboard::new()
            .ok()
            .and_then(|mut c| c.get_text().ok())
            .unwrap_or_default()
    })
    .join()
    .map_err(|_| "clipboard thread failed".to_string())
}

#[tauri::command]
async fn fetch_ollama(app: tauri::AppHandle, url: String, body: String) -> Result<(), String> {
    use std::io::{Read, Write};
    let url = url.trim_start_matches("http://");
    let (host_port, path) = url.split_once('/').unwrap_or((url, ""));
    let path = format!("/{}", path);
    let host_port = host_port.trim_end_matches('/');
    let addr = host_port.to_string();
    let request = format!(
        "POST {} HTTP/1.1\r\nHost: {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        path, addr, body.len(), body
    );
    
    let app2 = app.clone();
    tokio::task::spawn_blocking(move || {
        let mut stream = std::net::TcpStream::connect(&addr)
            .map_err(|e| format!("TCP connect failed: {}", e))?;
        stream.set_read_timeout(Some(std::time::Duration::from_secs(60)))
            .map_err(|e| format!("set timeout failed: {}", e))?;
        stream.write_all(request.as_bytes())
            .map_err(|e| format!("write failed: {}", e))?;
        
        let mut buf = [0u8; 8192];
        let mut header = Vec::new();
        loop {
            let n = stream.read(&mut buf).map_err(|e| format!("header read: {}", e))?;
            if n == 0 { return Err("connection closed during header".to_string()); }
            header.extend_from_slice(&buf[..n]);
            if header.windows(4).any(|w| w == b"\r\n\r\n") {
                break;
            }
        }
        let header_str = String::from_utf8_lossy(&header);
        let body_start = header_str.find("\r\n\r\n").map(|i| i + 4).unwrap_or(0);
        let remaining = &header[body_start..];
        
        if !remaining.is_empty() {
            process_sse_data(remaining, &app2);
        }
        
        loop {
            let n = stream.read(&mut buf).map_err(|e| format!("body read: {}", e))?;
            if n == 0 { break; }
            process_sse_data(&buf[..n], &app2);
        }
        
        Ok::<_, String>(())
    }).await.map_err(|e| format!("blocking task: {}", e))??;
    
    let _ = app.emit("ollama-done", "");
    Ok(())
}

fn process_sse_data(data: &[u8], app: &tauri::AppHandle) {
    let s = String::from_utf8_lossy(data);
    for line in s.lines() {
        let line = line.trim();
        if line.is_empty() { continue; }
        if let Ok(obj) = serde_json::from_str::<serde_json::Value>(line) {
            if let Some(response) = obj.get("response").and_then(|v| v.as_str()) {
                let _ = app.emit("ollama-chunk", response);
            }
        }
    }
}

#[tauri::command]
async fn fetch_ollama_simple(url: String) -> Result<String, String> {
    let url = url.trim_start_matches("http://");
    let (host_port, path) = url.split_once('/').unwrap_or((url, ""));
    let path = format!("/{}", path);
    let host_port = host_port.trim_end_matches('/');
    let addr = host_port.to_string();
    let request = format!(
        "GET {} HTTP/1.1\r\nHost: {}\r\nConnection: close\r\n\r\n",
        path, addr
    );
    
    let result = tokio::task::spawn_blocking(move || {
        use std::io::{Read, Write};
        let mut stream = std::net::TcpStream::connect(&addr)
            .map_err(|e| format!("TCP connect failed: {}", e))?;
        stream.set_read_timeout(Some(std::time::Duration::from_secs(10)))
            .map_err(|e| format!("set timeout failed: {}", e))?;
        stream.write_all(request.as_bytes())
            .map_err(|e| format!("write failed: {}", e))?;
        
        let mut response = Vec::new();
        stream.read_to_end(&mut response)
            .map_err(|e| format!("read failed: {}", e))?;
        
        Ok::<Vec<u8>, String>(response)
    }).await.map_err(|e| format!("task failed: {}", e))?;
    
    let data = result?;
    let response = String::from_utf8_lossy(&data);
    let body = response.split("\r\n\r\n").nth(1).unwrap_or("");
    Ok(body.to_string())
}

#[tauri::command]
fn set_hotkey(app: tauri::AppHandle, hotkey: String) -> Result<bool, String> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    let _ = app.global_shortcut().unregister_all();
    if hotkey.is_empty() {
        return Ok(true);
    }
    let (mods, code) = parse_shortcut(&hotkey)?;
    let shortcut = tauri_plugin_global_shortcut::Shortcut::new(Some(mods), code);
    app.global_shortcut().register(shortcut).map_err(|e| e.to_string())?;
    Ok(true)
}

fn parse_shortcut(hotkey: &str) -> Result<(tauri_plugin_global_shortcut::Modifiers, tauri_plugin_global_shortcut::Code), String> {
    use tauri_plugin_global_shortcut::{Code, Modifiers};
    let mut mods = Modifiers::empty();
    let mut key = String::new();
    for part in hotkey.split('+') {
        match part {
            "CmdOrCtrl" | "Ctrl" | "Control" => mods |= Modifiers::CONTROL,
            "Shift" => mods |= Modifiers::SHIFT,
            "Alt" => mods |= Modifiers::ALT,
            "Super" | "Win" | "Meta" => mods |= Modifiers::SUPER,
            _ => key = part.to_string(),
        }
    }
    let code = match key.as_str() {
        "A" => Code::KeyA, "B" => Code::KeyB, "C" => Code::KeyC,
        "D" => Code::KeyD, "E" => Code::KeyE, "F" => Code::KeyF,
        "G" => Code::KeyG, "H" => Code::KeyH, "I" => Code::KeyI,
        "J" => Code::KeyJ, "K" => Code::KeyK, "L" => Code::KeyL,
        "M" => Code::KeyM, "N" => Code::KeyN, "O" => Code::KeyO,
        "P" => Code::KeyP, "Q" => Code::KeyQ, "R" => Code::KeyR,
        "S" => Code::KeyS, "T" => Code::KeyT, "U" => Code::KeyU,
        "V" => Code::KeyV, "W" => Code::KeyW, "X" => Code::KeyX,
        "Y" => Code::KeyY, "Z" => Code::KeyZ,
        "0" => Code::Digit0, "1" => Code::Digit1, "2" => Code::Digit2,
        "3" => Code::Digit3, "4" => Code::Digit4, "5" => Code::Digit5,
        "6" => Code::Digit6, "7" => Code::Digit7, "8" => Code::Digit8,
        "9" => Code::Digit9,
        "F1" => Code::F1, "F2" => Code::F2, "F3" => Code::F3,
        "F4" => Code::F4, "F5" => Code::F5, "F6" => Code::F6,
        "F7" => Code::F7, "F8" => Code::F8, "F9" => Code::F9,
        "F10" => Code::F10, "F11" => Code::F11, "F12" => Code::F12,
        "Up" | "ArrowUp" => Code::ArrowUp,
        "Down" | "ArrowDown" => Code::ArrowDown,
        "Left" | "ArrowLeft" => Code::ArrowLeft,
        "Right" | "ArrowRight" => Code::ArrowRight,
        "Enter" | "Return" => Code::NumpadEnter,
        "Escape" => Code::Escape,
        "Space" => Code::Space,
        "Tab" => Code::Tab,
        "Backspace" => Code::Backspace,
        "Delete" => Code::Delete,
        "Insert" => Code::Insert,
        "Home" => Code::Home,
        "End" => Code::End,
        "PageUp" => Code::PageUp,
        "PageDown" => Code::PageDown,
        _ => return Err(format!("unknown key: {}", key)),
    };
    Ok((mods, code))
}

#[tauri::command]
fn create_popup(app: tauri::AppHandle, text: String, source_lang: String, target_lang: String,
    ollama_url: String, selected_model: String, system_prompt: String) -> Result<(), String>
{
    if let Some(w) = app.get_webview_window("popup") {
        let _ = w.close();
    }
    let data = serde_json::json!({
        "text": text,
        "ollamaUrl": ollama_url,
        "selectedModel": selected_model,
        "systemPrompt": system_prompt,
        "sourceLang": source_lang,
        "targetLang": target_lang,
    });
    let params = format!("?data={}", urlencode(&data.to_string()));
    let url = WebviewUrl::App(format!("popup.html{}", params).into());
    WebviewWindowBuilder::new(&app, "popup", url)
        .title("LinguaLAN - Übersetzung")
        .inner_size(400.0, 300.0)
        .always_on_top(true)
        .decorations(false)
        .resizable(false)
        .skip_taskbar(true)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn close_popup(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("popup") {
        let _ = w.close();
    }
    Ok(())
}

#[tauri::command]
fn get_settings(state: tauri::State<'_, AppState>) -> Result<Settings, String> {
    Ok(state.settings.lock().unwrap().clone())
}

#[tauri::command]
fn update_settings(state: tauri::State<'_, AppState>, settings: Settings) -> Result<(), String> {
    *state.settings.lock().unwrap() = settings;
    Ok(())
}

// ===== Ollama Management Commands =====

#[tauri::command]
async fn get_ollama_status() -> Result<String, String> {
    if check_ollama_connect() {
        return Ok("running".to_string());
    }
    if find_ollama_exe().is_some() {
        return Ok("installed".to_string());
    }
    Ok("not_installed".to_string())
}

#[tauri::command]
async fn find_ollama() -> Result<String, String> {
    find_ollama_exe()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or("Ollama not found".to_string())
}

#[tauri::command]
async fn get_app_data_dir(app: tauri::AppHandle) -> Result<String, String> {
    app.path().app_data_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn start_ollama(app: tauri::AppHandle, state: tauri::State<'_, OllamaState>) -> Result<(), String> {
    {
        let mut proc = state.process.lock().unwrap();
        if let Some(mut child) = proc.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
    let exe = find_ollama_exe().ok_or("Ollama not installed")?;
    let child = Command::new(&exe)
        .arg("serve")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to start: {}", e))?;
    state.process.lock().unwrap().replace(child);
    let _ = app.emit("ollama-status-changed", "starting");
    for i in 0..60 {
        if check_ollama_connect() {
            let _ = app.emit("ollama-status-changed", "running");
            return Ok(());
        }
        if i % 10 == 0 {
            let _ = app.emit("ollama-start-progress", format!("Warte auf Ollama... ({}s)", i / 2));
        }
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }
    Err("Ollama started but API not responding after 30s".to_string())
}

#[tauri::command]
async fn stop_ollama(state: tauri::State<'_, OllamaState>) -> Result<(), String> {
    let mut proc = state.process.lock().unwrap();
    match proc.take() {
        Some(mut child) => {
            let _ = child.kill();
            child.wait().map_err(|e| e.to_string())?;
            Ok(())
        }
        None => Err("No Ollama process running".to_string()),
    }
}

#[tauri::command]
async fn download_ollama(app: tauri::AppHandle) -> Result<String, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let ollama_dir = data_dir.join("ollama");
    std::fs::create_dir_all(&ollama_dir).map_err(|e| format!("create_dir: {}", e))?;
    let output_path = ollama_dir.join("OllamaSetup.exe");
    let out_str = output_path.to_string_lossy().to_string();
    let _ = app.emit("ollama-download-progress", "Downloading Ollama installer...");
    let result = tokio::task::spawn_blocking(move || {
        let output = Command::new("powershell")
            .args(["-NoProfile", "-Command",
                &format!("Invoke-WebRequest -Uri 'https://ollama.com/download/OllamaSetup.exe' -OutFile '{}' -UseBasicParsing", out_str)])
            .output()
            .map_err(|e| format!("PowerShell error: {}", e))?;
        if output.status.success() {
            Ok(out_str)
        } else {
            let err = String::from_utf8_lossy(&output.stderr);
            let out = String::from_utf8_lossy(&output.stdout);
            Err(format!("Download failed: {}\n{}", err, out))
        }
    }).await.map_err(|e| format!("Task panicked: {}", e))?;
    result
}

#[tauri::command]
async fn install_ollama(path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let output = Command::new(&path)
            .arg("/S")
            .output()
            .map_err(|e| format!("Installer error: {}", e))?;
        if output.status.success() {
            Ok(())
        } else {
            Err(format!("Installer failed (code: {:?})", output.status.code()))
        }
    }).await.map_err(|e| format!("Task panicked: {}", e))??;
    Ok(())
}

#[tauri::command]
async fn get_ollama_models() -> Result<Vec<String>, String> {
    if !check_ollama_connect() {
        return Err("Ollama not running".to_string());
    }
    let result = tokio::task::spawn_blocking(move || {
        let mut stream = std::net::TcpStream::connect_timeout(
            &"127.0.0.1:11434".parse().unwrap(),
            std::time::Duration::from_secs(3),
        ).map_err(|e| format!("connect: {}", e))?;
        stream.set_read_timeout(Some(std::time::Duration::from_secs(10)))
            .map_err(|e| format!("timeout: {}", e))?;
        let req = "GET /api/tags HTTP/1.1\r\nHost: 127.0.0.1:11434\r\nConnection: close\r\n\r\n";
        stream.write_all(req.as_bytes()).map_err(|e| format!("write: {}", e))?;
        let mut resp = String::new();
        stream.read_to_string(&mut resp).map_err(|e| format!("read: {}", e))?;
        if let Some(body) = resp.split("\r\n\r\n").nth(1) {
            if let Ok(obj) = serde_json::from_str::<serde_json::Value>(body) {
                let models = obj.get("models").and_then(|v| v.as_array())
                    .map(|arr| arr.iter().filter_map(|m| m.get("name").and_then(|n| n.as_str()).map(|s| s.to_string())).collect())
                    .unwrap_or_default();
                return Ok(models);
            }
        }
        Err("Failed to parse model list".to_string())
    }).await.map_err(|e| format!("Task panicked: {}", e))?;
    result
}

#[tauri::command]
async fn pull_ollama_model(app: tauri::AppHandle, model: String) -> Result<(), String> {
    let body = serde_json::json!({"name": model, "stream": true}).to_string();
    let app2 = app.clone();
    tokio::task::spawn_blocking(move || {
        let mut stream = std::net::TcpStream::connect_timeout(
            &"127.0.0.1:11434".parse().unwrap(),
            std::time::Duration::from_secs(5),
        ).map_err(|e| format!("connect: {}", e))?;
        stream.set_read_timeout(Some(std::time::Duration::from_secs(300)))
            .map_err(|e| format!("timeout: {}", e))?;
        let request = format!(
            "POST /api/pull HTTP/1.1\r\nHost: 127.0.0.1:11434\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(), body
        );
        stream.write_all(request.as_bytes()).map_err(|e| format!("write: {}", e))?;
        let mut buf = [0u8; 8192];
        let mut header = Vec::new();
        loop {
            let n = stream.read(&mut buf).map_err(|e| format!("read: {}", e))?;
            if n == 0 { return Err("connection closed".to_string()); }
            header.extend_from_slice(&buf[..n]);
            if header.windows(4).any(|w| w == b"\r\n\r\n") { break; }
        }
        let header_str = String::from_utf8_lossy(&header);
        let body_start = header_str.find("\r\n\r\n").map(|i| i + 4).unwrap_or(0);
        let remaining = &header[body_start..];
        if !remaining.is_empty() {
            let s = String::from_utf8_lossy(remaining);
            for line in s.lines() {
                let line = line.trim();
                if line.is_empty() { continue; }
                if let Ok(obj) = serde_json::from_str::<serde_json::Value>(line) {
                    if let Some(status) = obj.get("status").and_then(|v| v.as_str()) {
                        let _ = app2.emit("ollama-pull-status", status);
                    }
                    if let Some(err) = obj.get("error").and_then(|v| v.as_str()) {
                        return Err(err.to_string());
                    }
                }
            }
        }
        loop {
            let n = stream.read(&mut buf).map_err(|e| format!("read: {}", e))?;
            if n == 0 { break; }
            let s = String::from_utf8_lossy(&buf[..n]);
            for line in s.lines() {
                let line = line.trim();
                if line.is_empty() { continue; }
                if let Ok(obj) = serde_json::from_str::<serde_json::Value>(line) {
                    if let Some(status) = obj.get("status").and_then(|v| v.as_str()) {
                        let _ = app2.emit("ollama-pull-status", status);
                    }
                    if let Some(err) = obj.get("error").and_then(|v| v.as_str()) {
                        return Err(err.to_string());
                    }
                    if obj.get("completed").is_some() && obj.get("total").is_some() {
                        let c = obj.get("completed").and_then(|v| v.as_u64()).unwrap_or(0);
                        let t = obj.get("total").and_then(|v| v.as_u64()).unwrap_or(1);
                        let _ = app2.emit("ollama-pull-progress", format!("{}/{} MB", c / 1048576, t / 1048576));
                    }
                    if let Some(status) = obj.get("status").and_then(|v| v.as_str()) {
                        if status.contains("success") {
                            let _ = app2.emit("ollama-pull-done", &model);
                        }
                    }
                }
            }
        }
        Ok::<_, String>(())
    }).await.map_err(|e| format!("Task panicked: {}", e))??;
    Ok(())
}

fn urlencode(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 3);
    for &b in s.as_bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, _shortcut, event| {
                    if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        let _ = app.emit("hotkey-pressed", "");
                    }
                })
                .build(),
        )
        .manage(AppState {
            settings: Mutex::new(Settings::default()),
        })
        .manage(OllamaState {
            process: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            get_clipboard,
            fetch_ollama,
            fetch_ollama_simple,
            set_hotkey,
            create_popup,
            close_popup,
            get_settings,
            update_settings,
            get_ollama_status,
            find_ollama,
            get_app_data_dir,
            start_ollama,
            stop_ollama,
            download_ollama,
            install_ollama,
            get_ollama_models,
            pull_ollama_model,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
