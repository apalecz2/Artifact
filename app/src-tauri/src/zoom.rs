//! Webview zoom — the state behind the title bar's View menu on every platform,
//! and behind the native menu bar's View submenu on macOS ([`crate::menu`]).
//!
//! Zooming here scales the whole UI: sidebar, tables, chrome and all. That is a
//! different axis from `DocumentViewer`'s zoom, which scales only the scanned
//! page inside the viewer pane and leaves the UI alone.

use std::sync::Mutex;

use serde::Deserialize;
use tauri::{AppHandle, Manager, Runtime};

/// Discrete zoom stops, browser-style. Stepping through a fixed table rather
/// than multiplying a factor keeps the levels round and makes "back to 100%"
/// land exactly on 1.0 after any sequence of in/out.
const ZOOM_LEVELS: [f64; 9] = [0.5, 0.67, 0.75, 0.9, 1.0, 1.1, 1.25, 1.5, 2.0];

/// Index of `1.0` in [`ZOOM_LEVELS`] — where Actual Size lands.
const DEFAULT_ZOOM: usize = 4;

/// The webview's current zoom stop, as an index into [`ZOOM_LEVELS`].
///
/// `WebviewWindow::set_zoom` is write-only — Tauri exposes no getter — so the
/// step commands can only work from the level we last applied ourselves. That
/// is also why `zoomHotkeysEnabled` is off in `tauri.conf.json`: the webview's
/// built-in Ctrl/Cmd +/- handling would move the real zoom without telling us,
/// and the next step would snap back to whatever we last recorded.
pub struct ZoomState(Mutex<usize>);

impl ZoomState {
    pub fn new() -> Self {
        ZoomState(Mutex::new(DEFAULT_ZOOM))
    }
}

impl Default for ZoomState {
    fn default() -> Self {
        Self::new()
    }
}

/// Which way a View-menu click moves the zoom level.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ZoomAction {
    In,
    Out,
    Reset,
}

/// Steps the zoom and applies it to the main window, returning the zoom factor
/// now in effect. Saturating at either end is a no-op, not an error: the UI
/// disables the button at that point, and a stray keystroke shouldn't fail.
pub fn apply<R: Runtime>(app: &AppHandle<R>, action: ZoomAction) -> f64 {
    let Some(state) = app.try_state::<ZoomState>() else {
        return ZOOM_LEVELS[DEFAULT_ZOOM];
    };
    let Ok(mut level) = state.0.lock() else {
        return ZOOM_LEVELS[DEFAULT_ZOOM];
    };

    let next = next_level(*level, action);
    if next != *level {
        if let Some(window) = app.get_webview_window(crate::MAIN_WINDOW_LABEL) {
            // Only record the new level if the platform actually took it, so a
            // failed call doesn't leave the tracked level lying about the zoom.
            if window.set_zoom(ZOOM_LEVELS[next]).is_ok() {
                *level = next;
            }
        }
    }

    ZOOM_LEVELS[*level]
}

/// Steps a zoom index, saturating at both ends of [`ZOOM_LEVELS`].
fn next_level(current: usize, action: ZoomAction) -> usize {
    match action {
        ZoomAction::In => (current + 1).min(ZOOM_LEVELS.len() - 1),
        ZoomAction::Out => current.saturating_sub(1),
        ZoomAction::Reset => DEFAULT_ZOOM,
    }
}

/// Zoom factor currently applied to the webview.
fn current<R: Runtime>(app: &AppHandle<R>) -> f64 {
    app.try_state::<ZoomState>()
        .and_then(|state| state.0.lock().ok().map(|level| ZOOM_LEVELS[*level]))
        .unwrap_or(ZOOM_LEVELS[DEFAULT_ZOOM])
}

/// Steps the zoom from the title bar's View menu. Returns the new factor so the
/// menu can show it without a second round trip.
#[tauri::command]
pub fn set_app_zoom<R: Runtime>(app: AppHandle<R>, action: ZoomAction) -> f64 {
    apply(&app, action)
}

/// Current zoom factor, for the title bar to render on mount.
#[tauri::command]
pub fn get_app_zoom<R: Runtime>(app: AppHandle<R>) -> f64 {
    current(&app)
}

/// Whether the webview can still zoom further in each direction, so the title
/// bar can disable the ends instead of offering a click that does nothing.
#[tauri::command]
pub fn app_zoom_limits<R: Runtime>(app: AppHandle<R>) -> (bool, bool) {
    let factor = current(&app);
    (
        factor < ZOOM_LEVELS[ZOOM_LEVELS.len() - 1],
        factor > ZOOM_LEVELS[0],
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zoom_in_saturates_at_the_top_level() {
        let top = ZOOM_LEVELS.len() - 1;
        assert_eq!(next_level(top - 1, ZoomAction::In), top);
        assert_eq!(next_level(top, ZoomAction::In), top);
    }

    #[test]
    fn zoom_out_saturates_at_the_bottom_level() {
        assert_eq!(next_level(1, ZoomAction::Out), 0);
        assert_eq!(next_level(0, ZoomAction::Out), 0);
    }

    #[test]
    fn reset_returns_to_exactly_one_hundred_percent() {
        assert_eq!(next_level(0, ZoomAction::Reset), DEFAULT_ZOOM);
        assert_eq!(
            next_level(ZOOM_LEVELS.len() - 1, ZoomAction::Reset),
            DEFAULT_ZOOM
        );
        assert_eq!(ZOOM_LEVELS[DEFAULT_ZOOM], 1.0);
    }

    #[test]
    fn levels_are_sorted_and_bracket_one_hundred_percent() {
        assert!(ZOOM_LEVELS.windows(2).all(|pair| pair[0] < pair[1]));
        assert!(ZOOM_LEVELS[0] < 1.0 && ZOOM_LEVELS[ZOOM_LEVELS.len() - 1] > 1.0);
    }

    /// The title bar sends these strings; a rename on either side breaks zoom
    /// silently, so pin the wire format.
    #[test]
    fn actions_deserialize_from_the_frontend_wire_format() {
        let parse = |s: &str| serde_json::from_str::<ZoomAction>(s).unwrap();
        assert_eq!(parse("\"in\""), ZoomAction::In);
        assert_eq!(parse("\"out\""), ZoomAction::Out);
        assert_eq!(parse("\"reset\""), ZoomAction::Reset);
    }
}
