//! The macOS menu bar.
//!
//! macOS puts an application's menu in the system bar at the top of the screen,
//! so it coexists with the in-window title bar rather than competing with it —
//! a Mac app without one looks broken. Windows draws its menu as a strip inside
//! the window, which is exactly the strip the custom title bar replaces, so no
//! menu is attached there and this module isn't compiled.
//!
//! Because this bar is the *only* place a Mac user finds File/Edit/View — the
//! in-window title bar draws no menus there — it carries the app's own commands
//! too, not just Tauri's defaults. The zoom items drive the same [`crate::zoom`]
//! state as the title bar does elsewhere, so the two can't disagree; the
//! navigating items are forwarded to the frontend, which owns the routes.

use tauri::{
    menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu, WINDOW_SUBMENU_ID},
    AppHandle, Emitter, Manager, Runtime,
};

use crate::zoom::{self, ZoomAction};

const ZOOM_IN_ID: &str = "view.zoom_in";
const ZOOM_OUT_ID: &str = "view.zoom_out";
const ZOOM_RESET_ID: &str = "view.zoom_reset";
const FILE_NEW_ID: &str = "file.new";
const FILE_OPEN_ID: &str = "file.open";
const APP_SETTINGS_ID: &str = "app.settings";
const EDIT_FIND_ID: &str = "edit.find";

/// Event carrying a menu-driven navigation to the frontend. The payload is an
/// `AppCommand` name and the routes live in `TitleBar.tsx`, so the two sides
/// never hold separate copies of the app's URLs — keep the names in step with
/// `APP_COMMAND_ROUTE` there.
const MENU_COMMAND_EVENT: &str = "menu:command";

/// Builds the app menu: Tauri's default, plus the app's own File/Edit/View items.
pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let menu = Menu::default(app)?;

    // File — the app's document commands sit above Tauri's Close Window.
    let new_item = MenuItem::with_id(
        app,
        FILE_NEW_ID,
        "New Extraction",
        true,
        Some("CmdOrCtrl+N"),
    )?;
    let open_item = MenuItem::with_id(
        app,
        FILE_OPEN_ID,
        "Open Extraction…",
        true,
        Some("CmdOrCtrl+O"),
    )?;
    if let Some(file) = find_submenu(&menu, "File")? {
        let separator = PredefinedMenuItem::separator(app)?;
        file.prepend_items(&[&new_item, &open_item, &separator])?;
    }

    // Settings belongs in the application menu on macOS, directly under About —
    // not in File, where the in-window bar has to put it for want of one.
    let settings = MenuItem::with_id(app, APP_SETTINGS_ID, "Settings…", true, Some("CmdOrCtrl+,"))?;
    let app_menu_title = app.package_info().name.clone();
    match find_submenu(&menu, &app_menu_title)? {
        Some(app_menu) => {
            let separator = PredefinedMenuItem::separator(app)?;
            app_menu.insert_items(&[&separator, &settings], 1)?;
        }
        None => {
            if let Some(file) = find_submenu(&menu, "File")? {
                file.prepend(&settings)?;
            }
        }
    }

    // Edit — Tauri's default already supplies undo/clipboard/select-all natively,
    // so only the app's own Find is missing.
    let find = MenuItem::with_id(
        app,
        EDIT_FIND_ID,
        "Find Extractions…",
        true,
        Some("CmdOrCtrl+F"),
    )?;
    if let Some(edit) = find_submenu(&menu, "Edit")? {
        let separator = PredefinedMenuItem::separator(app)?;
        edit.append_items(&[&separator, &find])?;
    }

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

/// Handles a click on one of the app's own items. Ignores every other id — the
/// predefined items (clipboard, window, quit) handle themselves.
pub fn on_menu_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    let id = event.id().as_ref();

    if let Some(action) = zoom_action(id) {
        zoom::apply(app, action);
        return;
    }

    if let Some(command) = app_command(id) {
        let _ = app.emit(MENU_COMMAND_EVENT, command);
    }
}

/// Zoom step for a menu id, if it is one of the View items.
fn zoom_action(id: &str) -> Option<ZoomAction> {
    match id {
        ZOOM_IN_ID => Some(ZoomAction::In),
        ZOOM_OUT_ID => Some(ZoomAction::Out),
        ZOOM_RESET_ID => Some(ZoomAction::Reset),
        _ => None,
    }
}

/// Frontend `AppCommand` name for a menu id, if it is one of the navigating
/// items. These strings are the wire format of [`MENU_COMMAND_EVENT`].
fn app_command(id: &str) -> Option<&'static str> {
    match id {
        FILE_NEW_ID => Some("new"),
        FILE_OPEN_ID => Some("open"),
        APP_SETTINGS_ID => Some("settings"),
        EDIT_FIND_ID => Some("find"),
        _ => None,
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    /// The payloads are a contract with `AppCommand` in TitleBar.tsx; a rename on
    /// either side would leave the macOS menu items silently doing nothing.
    #[test]
    fn navigating_items_map_to_frontend_command_names() {
        assert_eq!(app_command(FILE_NEW_ID), Some("new"));
        assert_eq!(app_command(FILE_OPEN_ID), Some("open"));
        assert_eq!(app_command(APP_SETTINGS_ID), Some("settings"));
        assert_eq!(app_command(EDIT_FIND_ID), Some("find"));
    }

    #[test]
    fn the_two_id_families_do_not_overlap() {
        for id in [ZOOM_IN_ID, ZOOM_OUT_ID, ZOOM_RESET_ID] {
            assert!(zoom_action(id).is_some());
            assert_eq!(app_command(id), None);
        }
        for id in [FILE_NEW_ID, FILE_OPEN_ID, APP_SETTINGS_ID, EDIT_FIND_ID] {
            assert!(zoom_action(id).is_none());
        }
    }

    /// Predefined items (Quit, Copy, Minimise…) must fall through untouched.
    #[test]
    fn unknown_ids_are_ignored_by_both() {
        assert!(zoom_action("some.other.item").is_none());
        assert_eq!(app_command("some.other.item"), None);
    }
}
