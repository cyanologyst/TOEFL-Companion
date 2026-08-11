mod reminder_popup;
mod transcription;

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
