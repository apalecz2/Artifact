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
    AppHandle, Emitter, Runtime,
};

use crate::zoom::{self, ZoomAction};

const ZOOM_IN_ID: &str = "view.zoom_in";
const ZOOM_OUT_ID: &str = "view.zoom_out";
const ZOOM_RESET_ID: &str = "view.zoom_reset";
const FILE_NEW_ID: &str = "file.new";
const FILE_OPEN_ID: &str = "file.open";
const APP_SETTINGS_ID: &str = "app.settings";
const EDIT_FIND_ID: &str = "edit.find";
const EDIT_UNDO_ID: &str = "edit.undo";
const EDIT_REDO_ID: &str = "edit.redo";
const EDIT_CUT_ID: &str = "edit.cut";
const EDIT_COPY_ID: &str = "edit.copy";
const EDIT_PASTE_ID: &str = "edit.paste";
const EDIT_SELECT_ALL_ID: &str = "edit.select_all";

/// Event carrying a menu-driven navigation to the frontend. The payload is an
/// `AppCommand` name and the routes live in `TitleBar.tsx`, so the two sides
/// never hold separate copies of the app's URLs — keep the names in step with
/// `APP_COMMAND_ROUTE` there.
const MENU_COMMAND_EVENT: &str = "menu:command";

/// Event carrying an Edit command to the frontend. Kept separate from
/// [`MENU_COMMAND_EVENT`] so the two contracts stay independently typed: the
/// payload is an `EditCommand` name, dispatched by `TitleBar.tsx` through
/// `runEditMenuCommand` — the session table's editor if it has claimed the menu,
/// otherwise the focused field via `execCommand`. Keep the names in step with
/// `EditCommand` in `lib/editTarget.ts`.
const MENU_EDIT_EVENT: &str = "menu:edit-command";

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

    // Edit — Tauri's default supplies undo/clipboard/select-all as *predefined*
    // native items, which AppKit handles itself and which raise no menu event, so
    // the frontend can't intercept them. That leaves the session's table editor —
    // whose undo history is over the cell grid, whose selection is cells, and
    // whose clipboard format is TSV, none of which a text field owns or
    // `execCommand` can reach — unable to receive Undo/Cut/Copy/… while it is
    // focused. Replace them with custom items carrying the same labels and
    // accelerators, which emit `menu:edit-command`; `TitleBar.tsx` routes that
    // through `runEditMenuCommand`, dispatching to the table's claim if it holds
    // one and otherwise to the focused field via `execCommand` — the same
    // fallback Windows/Linux have always used.
    let edit_undo = MenuItem::with_id(app, EDIT_UNDO_ID, "Undo", true, Some("CmdOrCtrl+Z"))?;
    let edit_redo = MenuItem::with_id(app, EDIT_REDO_ID, "Redo", true, Some("CmdOrCtrl+Shift+Z"))?;
    let edit_cut = MenuItem::with_id(app, EDIT_CUT_ID, "Cut", true, Some("CmdOrCtrl+X"))?;
    let edit_copy = MenuItem::with_id(app, EDIT_COPY_ID, "Copy", true, Some("CmdOrCtrl+C"))?;
    let edit_paste = MenuItem::with_id(app, EDIT_PASTE_ID, "Paste", true, Some("CmdOrCtrl+V"))?;
    let edit_select_all = MenuItem::with_id(
        app,
        EDIT_SELECT_ALL_ID,
        "Select All",
        true,
        Some("CmdOrCtrl+A"),
    )?;
    let find = MenuItem::with_id(
        app,
        EDIT_FIND_ID,
        "Find Extractions…",
        true,
        Some("CmdOrCtrl+F"),
    )?;
    let sep_after_undo = PredefinedMenuItem::separator(app)?;
    let sep_before_find = PredefinedMenuItem::separator(app)?;
    let edit = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &edit_undo,
            &edit_redo,
            &sep_after_undo,
            &edit_cut,
            &edit_copy,
            &edit_paste,
            &edit_select_all,
            &sep_before_find,
            &find,
        ],
    )?;
    // Swap the fresh submenu in for the default one at the same slot. Replacing
    // the whole submenu — rather than picking the six predefined items out — is
    // deliberate: predefined items carry generated ids with nothing stable to
    // match on, so there is no reliable way to remove just them. Dropping macOS'
    // conventional Speech / Substitutions / Emoji & Symbols extras along with
    // them is an accepted trade: none apply to this app's short table cells, and
    // the six commands above plus Find are the whole contract the editor needs.
    if let Some(existing) = find_submenu(&menu, "Edit")? {
        let index = menu
            .items()?
            .iter()
            .position(|item| item.id() == existing.id());
        menu.remove(&existing)?;
        match index {
            Some(index) => menu.insert(&edit, index)?,
            None => menu.append(&edit)?,
        }
    } else {
        // No default Edit submenu (a future Tauri could drop it) — add ours
        // before the Window submenu, the conventional slot.
        match window_submenu_index(&menu)? {
            Some(index) => menu.insert(&edit, index)?,
            None => menu.append(&edit)?,
        }
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

    if let Some(command) = edit_command(id) {
        let _ = app.emit(MENU_EDIT_EVENT, command);
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

/// Frontend `EditCommand` name for a menu id, if it is one of the Edit items.
/// These strings are the wire format of [`MENU_EDIT_EVENT`] — keep them in step
/// with `EditCommand` in `lib/editTarget.ts` (note `selectAll`'s camelCase).
/// `EDIT_FIND_ID` is deliberately absent: Find routes, so it belongs to
/// [`app_command`], not here.
fn edit_command(id: &str) -> Option<&'static str> {
    match id {
        EDIT_UNDO_ID => Some("undo"),
        EDIT_REDO_ID => Some("redo"),
        EDIT_CUT_ID => Some("cut"),
        EDIT_COPY_ID => Some("copy"),
        EDIT_PASTE_ID => Some("paste"),
        EDIT_SELECT_ALL_ID => Some("selectAll"),
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

    /// The payloads are a contract with `EditCommand` in editTarget.ts; the
    /// camelCase `selectAll` in particular has to survive the trip verbatim.
    #[test]
    fn edit_items_map_to_frontend_command_names() {
        assert_eq!(edit_command(EDIT_UNDO_ID), Some("undo"));
        assert_eq!(edit_command(EDIT_REDO_ID), Some("redo"));
        assert_eq!(edit_command(EDIT_CUT_ID), Some("cut"));
        assert_eq!(edit_command(EDIT_COPY_ID), Some("copy"));
        assert_eq!(edit_command(EDIT_PASTE_ID), Some("paste"));
        assert_eq!(edit_command(EDIT_SELECT_ALL_ID), Some("selectAll"));
    }

    #[test]
    fn the_three_id_families_do_not_overlap() {
        for id in [ZOOM_IN_ID, ZOOM_OUT_ID, ZOOM_RESET_ID] {
            assert!(zoom_action(id).is_some());
            assert_eq!(app_command(id), None);
            assert_eq!(edit_command(id), None);
        }
        for id in [FILE_NEW_ID, FILE_OPEN_ID, APP_SETTINGS_ID, EDIT_FIND_ID] {
            assert!(zoom_action(id).is_none());
            assert!(app_command(id).is_some());
            assert_eq!(edit_command(id), None);
        }
        for id in [
            EDIT_UNDO_ID,
            EDIT_REDO_ID,
            EDIT_CUT_ID,
            EDIT_COPY_ID,
            EDIT_PASTE_ID,
            EDIT_SELECT_ALL_ID,
        ] {
            assert!(zoom_action(id).is_none());
            assert_eq!(app_command(id), None);
            assert!(edit_command(id).is_some());
        }
    }

    /// Predefined items (Quit, Minimise…) and anything unknown must fall through
    /// all three dispatchers untouched.
    #[test]
    fn unknown_ids_are_ignored_by_all() {
        assert!(zoom_action("some.other.item").is_none());
        assert_eq!(app_command("some.other.item"), None);
        assert_eq!(edit_command("some.other.item"), None);
    }
}
