mod reminder_popup;
mod transcription;

/// Gives the window the large icon Windows draws on the taskbar button.
///
/// `set_icon` reaches tao, which sends `WM_SETICON` for `ICON_SMALL` only, so
/// the title bar gets the icon and the taskbar button is left with nothing and
/// falls back to a blank sheet. The icon tao just built from our PNG is a full
/// 256px one, so read that handle back off the window and set it as the big
/// icon too. tao owns it for as long as the window lives.
#[cfg(windows)]
fn use_icon_on_taskbar(window: &tauri::WebviewWindow) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        ICON_BIG, ICON_SMALL, SendMessageW, WM_GETICON, WM_SETICON,
    };

    let Ok(handle) = window.hwnd() else {
        return;
    };
    let hwnd = handle.0 as isize as *mut core::ffi::c_void;
    unsafe {
        let icon = SendMessageW(hwnd, WM_GETICON, ICON_SMALL as usize, 0);
        if icon != 0 {
            SendMessageW(hwnd, WM_SETICON, ICON_BIG as usize, icon);
        }
    }
}

#[cfg(not(windows))]
fn use_icon_on_taskbar(_window: &tauri::WebviewWindow) {}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use tauri_plugin_window_state::StateFlags;

    let persisted_window_state = StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED;

    tauri::Builder::default()
        .manage(transcription::TranscriptionState::default())
        .invoke_handler(tauri::generate_handler![
            transcription::transcription_models,
            transcription::download_transcription_model,
            transcription::delete_transcription_model,
            transcription::transcribe_speech,
            reminder_popup::show_reminder_popup,
            reminder_popup::resize_reminder_popup,
            reminder_popup::close_reminder_popup,
        ])
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(persisted_window_state)
                .build(),
        )
        .setup(|app| {
            use tauri::Manager;

            // Windows draws a taskbar button from the window's own icon, and a
            // Tauri window is created without one: `bundle.icon` only reaches
            // the installer and the exe resources. That is why the Start Menu
            // shortcut looked right while the taskbar button was blank.
            let icon = tauri::include_image!("icons/128x128@2x.png");
            for (_, window) in app.webview_windows() {
                window.set_icon(icon.clone())?;
                use_icon_on_taskbar(&window);
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
