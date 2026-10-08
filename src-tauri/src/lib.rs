// Context Menu Triage — native desktop shell.
//
// The scanning/registry/GUI logic lives in the existing Node single-file
// executable (bundled here as a Tauri sidecar). This shell launches that
// backend headless (`gui --no-open`), reads the local URL + one-time token it
// prints, and points a native WebView2 window at it. No browser, no console.

use std::sync::Mutex;

use tauri::{Emitter, Manager, RunEvent};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

struct Backend(Mutex<Option<CommandChild>>);

// Pick a free localhost port so multiple instances don't collide.
fn free_port() -> u16 {
    std::net::TcpListener::bind("127.0.0.1:0")
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .unwrap_or(7373)
}

// Pull the first http://127.0.0.1… token URL out of a stdout line.
fn extract_url(line: &str) -> Option<String> {
    let start = line.find("http://127.0.0.1")?;
    let rest = &line[start..];
    let end = rest
        .find(|c: char| c.is_whitespace())
        .unwrap_or(rest.len());
    Some(rest[..end].trim().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(Backend(Mutex::new(None)))
        .setup(|app| {
            let handle = app.handle().clone();

            if let Some(win) = app.get_webview_window("main") {
                // Start maximized; the window stays resizable down to minWidth/
                // minHeight from tauri.conf.json, and the layout shrinks to fit.
                let _ = win.maximize();
            }

            let port = free_port();
            let sidecar = app
                .shell()
                .sidecar("context-menu-triage")?
                .args(["gui", "--no-open", "--port", &port.to_string()]);
            let (mut rx, child) = sidecar.spawn()?;
            app.state::<Backend>().0.lock().unwrap().replace(child);

            tauri::async_runtime::spawn(async move {
                let mut navigated = false;
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes) => {
                            let line = String::from_utf8_lossy(&bytes);
                            // The backend asks us to relaunch the whole app
                            // elevated (the "launch as administrator" action).
                            if line.contains("@@TRIAGE-ELEVATE@@") {
                                if let Ok(exe) = std::env::current_exe() {
                                    let _ = std::process::Command::new("powershell")
                                        .args([
                                            "-NoProfile",
                                            "-WindowStyle",
                                            "Hidden",
                                            "-Command",
                                            &format!(
                                                "Start-Process -FilePath \"{}\" -Verb RunAs",
                                                exe.display()
                                            ),
                                        ])
                                        .spawn();
                                }
                                handle.exit(0);
                                continue;
                            }
                            if navigated {
                                continue;
                            }
                            if let Some(url) = extract_url(&line) {
                                if let (Some(win), Ok(parsed)) =
                                    (handle.get_webview_window("main"), tauri::Url::parse(&url))
                                {
                                    let _ = win.navigate(parsed);
                                    let _ = win.set_focus();
                                    navigated = true;
                                }
                            }
                        }
                        CommandEvent::Error(err) => {
                            let _ = handle.emit("backend-error", err);
                        }
                        CommandEvent::Terminated(_) => break,
                        _ => {}
                    }
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while starting Context Menu Triage")
        .run(|app_handle, event| {
            if let RunEvent::Exit = event {
                if let Some(child) = app_handle.state::<Backend>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        });
}
