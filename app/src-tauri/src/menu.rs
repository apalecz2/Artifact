//! The macOS menu bar.
//!
//! macOS puts an application's menu in the system bar at the top of the screen,
//! so it coexists with the in-window title bar rather than competing with it —
//! a Mac app without one looks broken. Windows draws its menu as a strip inside
//! the window, which is exactly the strip the custom title bar replaces, so no
//! menu is attached there and this module isn't compiled.
//!
//! The items here drive the same [`crate::zoom`] state as the title bar's View
//! menu, so the two can't disagree about the current zoom.

use tauri::{
    menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu, WINDOW_SUBMENU_ID},
    AppHandle, Runtime,
};

use crate::zoom::{self, ZoomAction};

const ZOOM_IN_ID: &str = "view.zoom_in";
const ZOOM_OUT_ID: &str = "view.zoom_out";
const ZOOM_RESET_ID: &str = "view.zoom_reset";

/// Builds the app menu: Tauri's default, plus the View/zoom items.
pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let menu = Menu::default(app)?;

    // `CmdOrCtrl+Equal` rather than `+Plus`: an accelerator matches one physical
    // key, and Equal is the unshifted key users actually press for "zoom in".
    let zoom_in = MenuItem::with_id(app, ZOOM_IN_ID, "Zoom In", true, Some("CmdOrCtrl+Equal"))?;
    let zoom_out = MenuItem::with_id(app, ZOOM_OUT_ID, "Zoom Out", true, Some("CmdOrCtrl+Minus"))?;
    let zoom_reset =
        MenuItem::with_id(app, ZOOM_RESET_ID, "Actual Size", true, Some("CmdOrCtrl+0"))?;

    // macOS' default menu already carries a View submenu (Enter Full Screen).
    // Prepend into it so the menu bar never grows a second "View"; fall back to
    // creating one if a future Tauri drops that default.
    match find_submenu(&menu, "View")? {
        Some(view) => {
            let separator = PredefinedMenuItem::separator(app)?;
            view.prepend_items(&[&zoom_in, &zoom_out, &zoom_reset, &separator])?;
        }
        None => {
            let view = Submenu::with_items(app, "View", true, &[&zoom_in, &zoom_out, &zoom_reset])?;
            match window_submenu_index(&menu)? {
                Some(index) => menu.insert(&view, index)?,
                None => menu.append(&view)?,
            }
        }
    }

    Ok(menu)
}

/// Applies a View-menu zoom click. Ignores every other menu id (the predefined
/// items handle themselves).
pub fn on_menu_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    let action = match event.id().as_ref() {
        ZOOM_IN_ID => ZoomAction::In,
        ZOOM_OUT_ID => ZoomAction::Out,
        ZOOM_RESET_ID => ZoomAction::Reset,
        _ => return,
    };
    zoom::apply(app, action);
}

/// Finds a top-level submenu by its visible label.
fn find_submenu<R: Runtime>(menu: &Menu<R>, text: &str) -> tauri::Result<Option<Submenu<R>>> {
    for item in menu.items()? {
        if let Some(submenu) = item.as_submenu() {
            if submenu.text()? == text {
                return Ok(Some(submenu.clone()));
            }
        }
    }
    Ok(None)
}

/// Position of the default "Window" submenu, so View can be inserted just
/// before it (the conventional slot) instead of after Help.
fn window_submenu_index<R: Runtime>(menu: &Menu<R>) -> tauri::Result<Option<usize>> {
    Ok(menu
        .items()?
        .iter()
        .position(|item| item.id() == WINDOW_SUBMENU_ID))
}
