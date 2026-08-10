//! The vocabulary reminder as a real desktop window.
//!
//! A card drawn inside the app can only be seen by someone already looking at
//! the app, which is the one moment a reminder is not needed. This puts the
//! same card in its own frameless window at the bottom-left of the screen, over
//! whatever the learner is actually doing.
//!
//! The window deliberately does not take focus and does not appear in the
//! taskbar or Alt-Tab: it is a notification, not a task. Clicking it works,
//! ignoring it costs nothing, and it never steals a keystroke from the app in
//! front of it.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub const REMINDER_LABEL: &str = "vocabulary-reminder";

/// Matches the card's own width in brutal.css. The height starts at the
/// unrevealed card and the page corrects it once it has measured itself.
const POPUP_WIDTH: f64 = 372.0;
const POPUP_HEIGHT: f64 = 330.0;
/// Clear of the screen edge by the same margin the app uses inside its frames.
const SCREEN_MARGIN: f64 = 20.0;
/// The card's offset shadow falls outside its own box and must not be clipped.
const SHADOW_ROOM: f64 = 12.0;

/// Bottom-left of the work area, so the popup sits above the taskbar rather
/// than behind it.
fn bottom_left(app: &AppHandle, height: f64) -> Option<(f64, f64)> {
    let monitor = app.primary_monitor().ok().flatten()?;
    let area = monitor.work_area();
    let scale = monitor.scale_factor();
    let left = f64::from(area.position.x) / scale + SCREEN_MARGIN;
    let bottom = f64::from(area.position.y + area.size.height as i32) / scale - SCREEN_MARGIN;
    Some((left, bottom - height))
}

#[tauri::command]
pub async fn show_reminder_popup(app: AppHandle, word_id: String) -> Result<(), String> {
    // One card at a time. A second reminder replaces the first rather than
    // stacking windows over the desktop.
    if let Some(existing) = app.get_webview_window(REMINDER_LABEL) {
        let _ = existing.close();
    }

    let encoded = urlencoding_lite(&word_id);
    let width = POPUP_WIDTH + SHADOW_ROOM;
    let height = POPUP_HEIGHT + SHADOW_ROOM;

    let mut builder = WebviewWindowBuilder::new(
        &app,
        REMINDER_LABEL,
        WebviewUrl::App(format!("reminder.html?word={encoded}").into()),
    )
    .title("Vocabulary reminder")
    .inner_size(width, height)
    .resizable(false)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .always_on_top(true)
    .skip_taskbar(true)
    // Taking focus would interrupt whatever the learner is typing, which is
    // the opposite of what a gentle reminder should do.
    .focused(false)
    .visible(false);

    if let Some((x, y)) = bottom_left(&app, height) {
        builder = builder.position(x, y);
    }

    let window = builder
        .build()
        .map_err(|error| format!("The reminder window could not be opened. {error}"))?;
    window
        .show()
        .map_err(|error| format!("The reminder window could not be shown. {error}"))?;
    Ok(())
}

/// The page measures its own card and corrects the window, so a revealed card
/// with a long example is not cut off and an empty one leaves no dead space.
#[tauri::command]
pub async fn resize_reminder_popup(app: AppHandle, height: f64) -> Result<(), String> {
    let Some(window) = app.get_webview_window(REMINDER_LABEL) else {
        return Ok(());
    };
    let width = POPUP_WIDTH + SHADOW_ROOM;
    let next = height.clamp(120.0, 700.0) + SHADOW_ROOM;
    window
        .set_size(tauri::LogicalSize::new(width, next))
        .map_err(|error| format!("The reminder window could not be resized. {error}"))?;
    if let Some((x, y)) = bottom_left(&app, next) {
        let _ = window.set_position(tauri::LogicalPosition::new(x, y));
    }
    Ok(())
}

#[tauri::command]
pub async fn close_reminder_popup(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(REMINDER_LABEL) {
        window
            .close()
            .map_err(|error| format!("The reminder window could not be closed. {error}"))?;
    }
    Ok(())
}

/// Word ids are generated locally and are already URL-safe, but a query string
/// should never depend on that holding.
fn urlencoding_lite(value: &str) -> String {
    value
        .bytes()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (byte as char).to_string()
            }
            _ => format!("%{byte:02X}"),
        })
        .collect()
}
