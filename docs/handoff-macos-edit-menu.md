# Handoff — finish the macOS Edit menu

**For:** a Claude Code session running on macOS (Apple Silicon), in this repo.
**Written:** 2026-07-29, from a Windows session that built the table editor and
could not test or complete the macOS half.

Read [CLAUDE.md](../CLAUDE.md) first — especially the ⛔ **never commit** rule,
which applies to you too. Make and stage changes; leave committing to Aiden.

---

## 1. What exists today

A recent change made the session's formatted table a small spreadsheet editor
(range selection, insert/delete/move rows and columns, join cells/columns, cell
shifts, clipboard, undo/redo). Two pieces of that reach into the window's Edit
menu, and **only the Windows/Linux half is wired**.

### The claim mechanism (platform-neutral, done)

[`app/src/lib/editTarget.ts`](../app/src/lib/editTarget.ts) is a module-level
registry answering "who owns the Edit menu's commands right now":

```ts
export type EditCommand = 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll';
export function setEditTarget(target: EditTarget | null): void;   // claimant registers
export function getEditTarget(): EditAvailability | null;         // useSyncExternalStore snapshot
export function runInEditTarget(command: EditCommand): boolean;   // false ⇒ no claimant
```

- [`ExtractionOutputPane.tsx`](../app/src/pages/session/ExtractionOutputPane.tsx)
  claims it while the table is the focused surface (`ownsEditMenu`), releasing
  it otherwise and on unmount.
- [`TitleBar.tsx`](../app/src/components/TitleBar.tsx) exports the dispatcher
  every menu path should use:

  ```ts
  export async function runEditMenuCommand(command: EditCommand): Promise<void> {
      if (runInEditTarget(command)) return;   // the table handled it
      await runEditCommand(command);          // else the focused text field, via execCommand
  }
  ```

**`runEditMenuCommand` is the whole integration point.** Anything that can call
it with an `EditCommand` gets correct behaviour on both surfaces for free.

### The macOS gap

On macOS the in-window bar draws no menus — the system menu bar
([`app/src-tauri/src/menu.rs`](../app/src-tauri/src/menu.rs)) is the only
File/Edit/View there. Its Edit submenu comes from `Menu::default(app)`, i.e.
Tauri's **predefined** Undo/Redo/Cut/Copy/Paste/Select All. Predefined items are
handled by the OS and raise no menu event, so the frontend cannot intercept
them. Consequences on macOS today:

| Symptom | Why |
|---|---|
| Edit ▸ Undo/Redo/Cut/Copy/Paste/Select All do nothing when the table is focused | They act on the focused *text field*; the table isn't one |
| ⌘Z and friends probably never reach the table either | AppKit consumes accelerators owned by menu items before the webview sees the keystroke — **verify this, it's an assumption, not a measurement** |

Windows/Linux are unaffected: their Edit menu is React
([`TitleBarMenu`](../app/src/components/TitleBarMenu.tsx)) and already routes
through `runEditMenuCommand`, including the disabled states.

---

## 2. Task A — route the native Edit items through `runEditMenuCommand`

### The pattern to follow

`menu.rs` already forwards its *navigating* items to the frontend, because the
router lives there. Copy that shape exactly:

```rust
const MENU_COMMAND_EVENT: &str = "menu:command";     // payload: an AppCommand name
fn app_command(id: &str) -> Option<&'static str> { … } // FILE_NEW_ID => "new", …
```

and in `TitleBar.tsx`:

```ts
export const MENU_COMMAND_EVENT = 'menu:command';
// isMac-only effect: listen<AppCommand>(MENU_COMMAND_EVENT, e => runCommand(e.payload))
```

### Recommended design

1. **Rust** — in `menu.rs`, replace the Edit submenu's predefined items with
   custom `MenuItem::with_id`s carrying the same labels and accelerators:

   | id | label | accelerator |
   |---|---|---|
   | `edit.undo` | Undo | `CmdOrCtrl+Z` |
   | `edit.redo` | Redo | `CmdOrCtrl+Shift+Z` |
   | `edit.cut` | Cut | `CmdOrCtrl+X` |
   | `edit.copy` | Copy | `CmdOrCtrl+C` |
   | `edit.paste` | Paste | `CmdOrCtrl+V` |
   | `edit.select_all` | Select All | `CmdOrCtrl+A` |

   Keep the existing separator + *Find Extractions…* below them.

2. **Rust** — add a second event alongside the navigation one, so the two
   contracts stay separately typed:

   ```rust
   const MENU_EDIT_EVENT: &str = "menu:edit-command";
   /// Frontend `EditCommand` name for a menu id. These strings are the wire
   /// format — keep them in step with `EditCommand` in lib/editTarget.ts.
   fn edit_command(id: &str) -> Option<&'static str> {
       match id {
           EDIT_UNDO_ID => Some("undo"),
           …
           EDIT_SELECT_ALL_ID => Some("selectAll"),   // note the camelCase
           _ => None,
       }
   }
   ```

   Dispatch it from `on_menu_event` beside `zoom_action` / `app_command`.

3. **Frontend** — in `TitleBar.tsx`'s existing macOS `listen` effect, add a
   second subscription:

   ```ts
   const stopEdit = await listen<EditCommand>(MENU_EDIT_EVENT, (event) =>
       void runEditMenuCommand(event.payload),
   );
   ```

   Nothing else changes: the claimant-first / field-fallback logic is already
   there and already tested.

### Why replacing the predefined items is safe

This is the part that looks scarier than it is. **Windows has never had native
Edit items** — its menu has always driven `document.execCommand` through
`runEditCommand`, and cut/copy/select-all work fine in text fields that way.
Paste already avoids `execCommand('paste')` (Chromium refuses it) by reading the
clipboard and inserting the text as an undoable edit.

So the fallback path you are routing macOS onto is the proven one. What you are
giving up is AppKit's native undo manager for webview text fields, replaced by
the field's own `execCommand` undo stack — the same trade Windows already makes.

### API notes (verify, don't trust)

- Pinned versions: `tauri` **2.11.2**, `@tauri-apps/api` **^2.11.0**.
- `Submenu` in Tauri 2 exposes `items()`, `remove()`, `remove_at()`,
  `append_items()`, `prepend_items()`, `insert_items()`. Confirm against the
  version in `Cargo.lock` before building on it.
- **Enumerate before you delete.** Log `edit.items()` and each `text()?` first —
  Tauri's default Edit submenu may carry more than the six items (macOS
  conventionally adds Speech / Substitutions / Emoji & Symbols). Decide
  deliberately what to keep; do not blanket-remove.
- `menu.rs` is compiled on *every* platform on purpose (only its wiring in
  `run()` is `#[cfg]`-gated), so a Windows `cargo clippy` still checks it. Keep
  it that way — don't `#[cfg]`-gate the module to make something compile.

### Tests

`menu.rs` has unit tests asserting the id→payload mapping is a contract with the
frontend. Extend them the same way:

- `edit_command(EDIT_UNDO_ID) == Some("undo")`, … `Some("selectAll")`.
- Extend `the_two_id_families_do_not_overlap` to three families (zoom / app /
  edit) so no id is claimed twice.
- Add a frontend test in `TitleBar.dom.test.tsx` if you can drive the `listen`
  mock — the existing `Edit menu claims` describe block shows how the claimant
  and fallback are asserted.

### Fallback if removal proves hostile

If the predefined items can't be cleanly removed on this Tauri version, a
narrower version still buys most of the value: replace **Undo/Redo only** and
leave Cut/Copy/Paste/Select All predefined. The table keeps its own
context-menu and toolbar paths for the clipboard. Say so explicitly in your
summary if you take this route — it's a real reduction in scope, not a detail.

---

## 3. Task B — stop the pane double-handling ⌘-keys on macOS

Once native items own `⌘Z/⌘Y/⌘A/⌘C/⌘X`, the table's own keyboard handler must
not also run them, or every one fires twice.

In [`ExtractionOutputPane.tsx`](../app/src/pages/session/ExtractionOutputPane.tsx),
the table keydown effect currently starts its modifier branch with:

```ts
if (e.ctrlKey || e.metaKey) {
    switch (e.key.toLowerCase()) {
        case 'z': …  case 'y': …  case 'a': …  case 'c': …  case 'x': …
    }
}
```

On macOS that branch should bail and let the menu deliver the command — the same
rule `TitleBar.tsx` already follows for its own accelerators:

> On macOS every remaining accelerator belongs to the system menu bar, which
> handles the keystroke before the webview sees it — binding them here too would
> run each one twice.

**Measure before you change it.** If AppKit really does swallow the keystroke,
the webview handler never fires and no guard is needed; if it doesn't, you need
one. Log both paths in `tauri dev` and find out which is true, then implement
what you measured and write down which it was.

`isMacPlatform(navigator.userAgent)` already exists, exported from
`TitleBar.tsx`. If you need it in the pane, consider lifting it to something
like `lib/platform.ts` rather than importing a helper out of a component — small
extraction, mechanical, and it leaves the caller's behaviour unchanged (a
convention this repo states explicitly).

---

## 4. Verify on real hardware

Things no Windows session could check. Run `npm run tauri dev` from `app/`,
open a session, extract a table, then:

**macOS Edit menu (the work above)**
- [ ] With a table cell selected: Edit ▸ Undo reverses the last table edit;
      Redo replays it.
- [ ] Edit ▸ Copy puts the selected cells on the clipboard as TSV (paste into
      Numbers/Excel → real grid).
- [ ] Edit ▸ Paste writes a copied block back into the table.
- [ ] Edit ▸ Select All selects the whole grid, not the page's text.
- [ ] With the cursor in a text field instead (Settings, the OCR word editor):
      all six still act on that field.
- [ ] Each shortcut fires **once** — the specific failure mode of Task B is
      undo jumping two steps.

**Clipboard permission** — a Windows-side fix that macOS should confirm
- [ ] Edit ▸ Paste raises **no** "wants to see text and images copied to the
      clipboard" prompt. Reads go through `tauri-plugin-clipboard-manager`
      (`readClipboardText` in `utils/clipboard.ts`); WKWebView is a different
      engine from WebView2, so this needs its own look.

**Table editor visuals** — never seen on *any* platform, only unit-tested
- [ ] Row-number / column-letter handles render sanely and click-select.
- [ ] The selection range ring is legible over the green/amber/red trust tints,
      in **both** light and dark mode.
- [ ] Right-click menu lands under the pointer and stays inside the window near
      the edges; toolbar ▸ *Edit table* opens upward.
- [ ] Drag-to-select doesn't also drag-select text.

---

## 5. Ground rules

- **Never `git commit` or `git push`** (CLAUDE.md). Stage freely.
- CI gates you must keep green — run them before you report done:
  ```bash
  cd app        && npx tsc --noEmit && npm run test:cov
  cd app/src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test --lib
  ```
- Test placement: `*.test.ts` → node project (pure logic), `*.dom.test.tsx` →
  jsdom. Fixtures live in `src/test/fixtures.ts`.
- Per-file coverage floors are enforced on the pure-logic core
  (`app/vitest.config.ts`); adding untested code to one of those files fails CI.
- When you're done, add a **Resolved** entry to
  [docs/issues.md](issues.md) ▸ UI / Frontend, next to the existing table-editor
  entry, which already records the macOS gap as open — and correct that sentence
  once it isn't. Update the macOS caveat in the `TitleBar` bullet of
  [CLAUDE.md](../CLAUDE.md) too.
- Report honestly what you verified by *running* it versus what you only
  reasoned about. The whole reason this document exists is that the previous
  session couldn't tell the difference on this platform.
