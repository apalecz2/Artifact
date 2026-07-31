# Manual test plan — table editor & platform keys

Everything here needs a human at a real machine. It is what's left after the
automated suites: Vitest and `cargo test` cover the logic, but nothing they run
can tell you whether a selection ring is legible, whether AppKit swallowed a
keystroke, or whether a menu opened off the bottom of the screen.

Verified checks are cut from the body and summarised under
[Completed](#completed). What remains below is genuinely outstanding.

**What's left**

| Section | Platform | Why it's open |
|---|---|---|
| [1 — macOS keyboard](#1-macos-keyboard) | macOS | Never run on a Mac |
| [2 — Clipboard permission](#2-clipboard-permission) | macOS | Never run; WKWebView needs its own look |
| [3 — Table editor visuals](#3-table-editor-visuals) | macOS | Windows passed; macOS never run |
| [4 — Menu clearing the title bar](#4-re-test-menu-clearing-the-title-bar) | Windows **and** macOS | Fixed 2026-07-31 after the menu-scroll re-test; unverified |

Tracked as open items in [issues.md](issues.md).

## Setup

From `app/`:

```bash
npm run tauri dev
```

Then: open or create a session → load a document with a real table (a scanned
page or photo, not a screenshot of clean text — you want flagged cells to
review) → **Format as Table** → switch the right pane to the table view.

You need a table with at least a few **flagged** cells (amber/red, or carrying a
`!` / `≈` / `?` badge). If everything comes back green, use a lower-quality
scan — several tests below step through flagged cells and need some to exist.

Keys act on the table only while the last click landed in the output pane. If
nothing responds, click a cell first.

---

## 1. macOS keyboard

The whole of §1 passed on Windows; none of it has been pressed on a Mac. Read
`Ctrl` as `⌘` — the app performs that substitution itself, which is part of what
you're checking.

**The review-nav key differs by platform on purpose** (fixed 2026-07-31): `F3` /
`Shift+F3` on Windows, `⌥←` / `⌥→` on macOS. Off macOS `Alt+arrows` belong to the
app's history nav, and on macOS `F3` is a media key — so neither platform can use
the other's binding.

| # | Press | Expected | ✓ |
|---|---|---|---|
| 1 | `⌥←` / `⌥→` | Steps to the previous/next flagged cell; the document pane scrolls to that cell's source words. `⌘[` / `⌘]` remain history nav | ☐ |
| 2 | `F3` (and `fn+F3`) | Does **nothing** in the table — it's a media key on macOS, so the binding was dropped rather than asking users for `fn` | ☐ |
| 3 | Every shortcut fires **once**. Do three edits, then `⌘Z` once — exactly one is reversed | The specific failure mode is undo jumping two steps | ☐ |
| 4 | `⌘V` and Edit ▸ Paste | Both paste **once**. Two separate code paths: the native paste event is disabled on macOS, so only the menu claim runs | ☐ |
| 5 | Cursor in a **text field** instead (Settings, the OCR word editor) | All six Edit commands act on that field, not the table | ☐ |
| 6 | The rest of §1a/§1b as run on Windows — `Space`, `Enter`, `F2`, type-over, `⌘A`, `Delete`, `⌘C`/`⌘V`, `⌘Z`, arrows, `Shift`+arrows, and the in-edit `Enter`/`Tab`/`Escape` | Same behaviour as Windows (see [Completed](#completed) for what each should do) | ☐ |

### Menu hints on macOS

Right-click a cell, and open toolbar ▸ **Edit table**. Every hint must name the
key that actually works *on this platform*. Press each one — reading the label
is not the test.

| # | Check | Expected on macOS | ✓ |
|---|---|---|---|
| 7 | Cut / Copy / Paste hints | `⌘X` `⌘C` `⌘V` | ☐ |
| 8 | Undo hint | `⌘Z` | ☐ |
| 9 | **Redo hint** | `⌘⇧Z` — *not* `⌘Y`, which nothing handles on macOS | ☐ |
| 10 | Clear contents / Edit value / Mark as checked | `Delete` / `Enter` / `Space` — unchanged from Windows | ☐ |
| 11 | Review-nav chevron tooltips (either side of the "N cells to review" count) | `⌥←` / `⌥→` | ☐ |
| 12 | Help panel's *Review flagged cells* item names the same key as those tooltips | `⌥←/→` | ☐ |
| 13 | Help panel prose uses the same symbols as the menus throughout | `⌘`, not `Ctrl` | ☐ |
| 13a | **Floating toolbar** — hover the Undo and Redo buttons | `Undo (⌘Z)` and `Redo (⌘⇧Z)`. These were hardcoded to `Ctrl+Z`/`Ctrl+Y` until 2026-07-31 and were missed by the Windows hint pass, which only looked at the menus | ☐ |
| 13b | Help panel reads as sentences — no shortcut run into the word after it (`⌘C copies`, not `⌘Ccopies`) | A JSX whitespace trap, fixed 2026-07-31; every hint in that file is one line break from re-breaking | ☐ |

---

## 2. Clipboard permission

macOS only. Reads go through `tauri-plugin-clipboard-manager`
(`readClipboardText` in `utils/clipboard.ts`) rather than
`navigator.clipboard.readText()`, specifically so no permission dialog appears.
That fix was verified on WebView2; WKWebView is a different engine.

| # | Do | Expected | ✓ |
|---|---|---|---|
| 14 | Copy a block of cells from Numbers or Excel, then in the table: **Edit ▸ Paste** | The block pastes. **No** *"wants to see text and images copied to the clipboard"* dialog | ☐ |
| 15 | Same, but press `⌘V` | Same — pastes, no dialog | ☐ |
| 16 | Right-click ▸ Paste | Same — pastes, no dialog | ☐ |

All three are worth doing separately: the menu item and the right-click item
both route through `pasteFromClipboard` (an OS-level read), while `⌘V` arrives
via the Edit-menu claim. A prompt on any one of them fails this group.

**If a prompt appears**, note which path raised it and whether it was a Chromium
dialog or a macOS one — they point at different causes, and the fix differs.

---

## 3. Table editor visuals

macOS only — Windows passed on 2026-07-31. Different rendering engine, and menu
positioning is exactly the kind of thing that differs. **Run twice, in light mode
and dark mode** (Settings ▸ Appearance).

| # | Check | ✓ |
|---|---|---|
| 17 | Row-number and column-letter handles render at a sensible size and don't crowd the cells | ☐ |
| 18 | Clicking a row number selects that whole row; clicking a column letter selects the column | ☐ |
| 19 | **The selection range ring is legible over every trust tint** — green, amber, red, and the grey unverified cells. The likeliest failure: the ring and the tints were designed separately | ☐ |
| 20 | A single selected cell is visually distinct from a multi-cell range | ☐ |
| 21 | The `!` / `≈` / `?` / `✓` badges stay readable inside a selected cell | ☐ |
| 22 | Right-click menu opens **under the pointer** | ☐ |
| 23 | Right-click near the **right** and **bottom** edges — the menu shifts to stay inside the window | ☐ |
| 24 | Toolbar ▸ *Edit table* opens **upward**, not off the bottom of the window | ☐ |
| 25 | Drag across cells to select — it must **not** also drag-select the text inside them | ☐ |
| 26 | Repeat 17–21 at a non-default UI zoom (`⌘ +` twice) | ☐ |
| 27 | Narrow the window to its minimum width — the table and its handles stay usable | ☐ |

---

## 4. Re-test: menu clearing the title bar

The scroll cap added on 2026-07-31 stopped a tall menu overflowing the *bottom*
of the window, but its top was still clamped to the viewport, so the window's
title bar (`z-100`, over the menu's `z-60`) covered the first item. The menu now
starts below the bar and sizes to the space beneath it, measured rather than
assumed — the bar's height differs by platform and moves with the webview zoom.

| # | Check | ✓ |
|---|---|---|
| 28 | Right-click near the **top** of the table with the window short enough to make the menu scroll — the first item is fully visible, not under the title bar | ☐ |
| 29 | The menu still ends a margin clear of the window's bottom edge | ☐ |
| 30 | Repeat at maximum UI zoom (`Ctrl/⌘ +`), where the bar is taller in CSS pixels | ☐ |
| 31 | Repeat on macOS, where the bar is inset for the traffic lights | ☐ |

---

## Recording results

For each check, one of three outcomes:

- **Pass** — move it to [Completed](#completed) with the date and platform, and
  cut it from the body. "Passes on Windows" is not "passes".
- **Fail** — file it under *Open* in [issues.md](issues.md), in the section it
  belongs to, with what you pressed and what happened.
- **Blocked** — say so explicitly rather than leaving the box unticked; an
  unticked box is indistinguishable from "not attempted", which is the ambiguity
  this document exists to remove.

Be precise about what you actually pressed versus what you assumed. The macOS
handoff that preceded this plan existed because an earlier session couldn't tell
those apart, and §1 #3–4 are where the difference bites.

---

---

## Completed

### Verified 2026-07-31 — Windows

**Keyboard, out of edit mode.** `F3` / `Shift+F3` step to the next/previous
flagged cell and the document pane scrolls to its source words. `Alt+←/→`
navigate the app's history and no longer also step cells (the collision fixed
that day). `Space` marks the selected cell — or a whole selected block — as
checked, and unmarks on a second press. `Enter` and `F2` both start editing.
Typing a printable character replaces the value, but only with a single cell
selected. `Ctrl+A` selects the table rather than the page's text. `Delete` and
`Backspace` both clear. `Ctrl+C` / `Ctrl+V` copy and paste a block. `Ctrl+Z`
undoes. Arrows move one cell; `Shift`+arrows extend the selection.

*Undocumented aliases confirmed to work:* `Shift+F3` (step backward),
`F2` (now documented), `Backspace` (clear), `Ctrl+Shift+Z` (redo).

**Keyboard, while editing a cell.** `Enter` saves and moves down. `Tab` saves and
moves right. `Escape` cancels, leaving the original value. `Shift+Tab` saves and
**stays on the cell** — accepted as reasonable behaviour, not filed as a defect,
and the help text needs no change since it doesn't claim otherwise.

**Menu hints (Windows column).** Cut / Copy / Paste read `Ctrl+X` `Ctrl+C`
`Ctrl+V`; Undo `Ctrl+Z`; Redo `Ctrl+Y`; Clear contents `Delete`; Edit value
`Enter`; Mark as checked `Space`. The review-nav chevron tooltips and the help
panel name the same keys as the menus.

*This pass looked at the menus only, so it missed two things a macOS run later
found: the floating toolbar's Undo/Redo tooltips were hardcoded `Ctrl+…`, and the
help panel ran a shortcut into the following word. Both fixed 2026-07-31; §1 #13a
and #13b re-test them.*

**Table editor visuals.** Handles render sanely and click-select their row or
column. The selection ring is legible over every trust tint, in light and dark.
A single cell is distinct from a range, and the badges stay readable inside a
selection. The right-click menu lands under the pointer; *Edit table* opens
upward. Drag-to-select does not also drag-select text. Both hold at non-default
zoom and at the window's minimum width.

*Two exceptions found here and fixed the same day — the menu staying open over a
cleared selection, and the menu overflowing a short window. Both re-tested and
passed; see the next entry.*

### Verified 2026-07-31 — Windows, second pass (the day's fixes)

**Menu left open over a cleared selection.** With the right-click menu open,
clicking off the table to deselect now closes it rather than leaving every row
greyed out. The same holds for toolbar ▸ *Edit table*, which shares that state.

**Menu taller than the window.** A menu that doesn't fit scrolls internally
instead of having its bottom items cut off; scrolling inside it doesn't close it,
while scrolling the pane behind it still does, and the items near the bottom are
reachable and clickable.

*One defect found in this pass: the window title bar covered the menu's first
item, because the scroll cap fixed the bottom overflow but the top was still
clamped to the viewport. Fixed the same day —
[§4](#4-re-test-menu-clearing-the-title-bar) is its re-test.*

**Drag-select auto-scroll.** Dragging past the edge of the grid scrolls the pane
and keeps extending the selection, in all four directions and on both axes, at a
usable speed. It stops cleanly at the ends of the scroll range, and releasing the
mouse outside the window stops it rather than running away.

**Help text.** The *Edit a cell* item mentions `F2` alongside `Enter`.

### Verified 2026-07-30 — Windows and macOS

**Edit-menu commands reach the table.** Undo / Redo / Cut / Copy / Paste /
Select All all reach the session's table editor on both platforms, each firing
exactly once, via the custom native menu items on macOS
([handoff-macos-edit-menu.md](handoff-macos-edit-menu.md)) and the in-window bar
elsewhere.

*This left the rest of that handoff's §4 checklist open — the clipboard prompt
and the table visuals — which is what [§2](#2-clipboard-permission) and
[§3](#3-table-editor-visuals) above now carry.*
