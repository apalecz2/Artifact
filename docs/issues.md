# Issues

## Open

### UI / Frontend

- toolbars should minimize tools to just icons when the width of that side is small
- option to collapse pannels in session
- note on poor quality extractions -- "try fixing the OCR on the left for better results"
- Review claims of what hotkeys exist for table editing (alt ->, f3 etc)
  - are these true? 
  - update the help sections accordingly

### Platform / macOS

- The system menu bar's **Edit** items (Undo/Redo/Cut/Copy/Paste/Select All) are Tauri's
  predefined native ones, which raise no menu event — so they can't reach the session
  table's editor the way the Windows/Linux title-bar menu does, and ⌘Z likely never gets
  to the table at all. Needs a Mac to build and test on:
  [handoff-macos-edit-menu.md](handoff-macos-edit-menu.md).

### Build / Packaging

- self-hosted Material Symbols is the full 4 MB icon font (Google served the same, but it's in the installer now) — subset it to the ~80 glyphs actually used

### Testing

- Testing coverage and documentation
- npm ci from e2e ? doesn't work?
- test pdfium cargo test

### Legal / Copy

- proof read all text
- re verify all legal related content
  - including how it is just in the app with notes on ai output
- do the terms and conditions need the user to have scrolled through them to accept?

### Website

- Use actual screenshots
- Signed installers
- focused ideal-customer profile
  -  one or two lead use cases to anchor the hero/problem copy around (e.g. registrar offices processing transcripts)
- monetization signal (add way to show this is monetizable)(?)

---

## Backlog

- Right side of session as single page, chat menu type interface with the raw output and table pinned to the top
  - this shows the history of extraction, if the user did any reextractions to show the old ones in a chronological ordering
  - then also their chat messages to make edits, with the table before and after
  - The "saved in app" stuff could go in the header for everything in the session
- Eventually probably a vs code style work area that can be configured however the user chooses

version 2 and later:
- chat with llm to edit the cells



---

## Resolved

### General

Added excel export support

**Dark-mode screenshots don't render the cell highlights correctly.** The provenance
   highlight boxes drawn over the source image look wrong (or are missing) when the app is
   in dark mode while capturing/showing the screenshot.

**No in-app indication that results are saved.** After an extraction the output is
   persisted, but the UI gives no "saved" affordance, so the user can't tell their work is
   safe. Needs a save-state indicator.

**Colour was the only signal for confidence — bad accessibility for colour blind.**
   Low-trust table cells now carry a "!" badge whenever they don't already show the
   "?" (unverified source) or "≈" (approximate match) badge, so "verify this cell" is
   never communicated by hue alone. The legend teaches all three badge glyphs, and the
   flagged-cell review nav ("N cells to review") was already a color-independent path
   to the same cells. (UX review 2026-07 #10.)

### Build / Packaging

1. **"Format as table" loaded the model then failed with "Failed to fetch" in packaged
   builds (worked in dev).** The model loaded fine — its `/health` and completion calls go to
   `http://127.0.0.1:*`, which the CSP `connect-src` allowed — but the next step,
   `fetch(fileUrl)` to read the source image bytes for the vision prompt
   (`useLlamaChat.ts`), targets the asset-protocol URL from `convertFileSrc`
   (`http://asset.localhost/…` on Windows, `asset://localhost/…` on macOS). That origin was
   listed in `img-src` (so the `<img>` rendered) but **not** in `connect-src`, and `fetch()`
   is governed by `connect-src` — so the read was blocked as a CSP violation, surfacing as a
   bare `TypeError: Failed to fetch`.
   - **Resolved** by adding `asset: http://asset.localhost` to `connect-src` in both `csp`
     and `devCsp` (`tauri.conf.json`). This grants no new capability — the webview can
     already load those exact bytes via `<img>`, and the asset protocol stays scoped to
     `sessions/**`.

2. **Generation (tps) was far slower in packaged builds than in dev** — e.g. ~7.6 t/s on an
   RTX 2060 SUPER that should manage GPU-class speed for a 4B Q4 model. The model and
   `llama-server` binary are identical (shared AppData), so the only difference was the
   `--n-gpu-layers` flag, driven by the `hardwareBackend` setting (`999` for a GPU backend,
   `0` = CPU-only). `hardwareBackend` lived **only** in webview localStorage, which is
   per-origin: the dev origin (`localhost:1420`) and the packaged origin (`tauri`/`asset`
   `localhost`) keep separate stores. Because dev had already populated the *shared* AppData
   assets, the build's `check_setup_complete` passed and it **skipped the wizard** — so
   `CompleteStep` (the only writer of `hardwareBackend`) never ran for the packaged origin,
   and `readSetting('hardwareBackend')` fell back to the `cpu` default → `--n-gpu-layers 0` →
   CPU-only generation despite the CUDA build and a detected GPU with 7 GB free.
   - Confirmed from `logs/llama-server.log`: GPU detected (`CUDA0 … 7158 MiB free`) but no
     `offloaded N/N layers to GPU` line and `eval time … 7.59 tokens per second` (CPU-class).
   - **Resolved** by persisting the chosen backend to AppData, not just localStorage: the
     wizard writes it via a new `persist_backend` command, `get_setup_paths` returns it, and
     the `useSetupCheck` auto-heal restores `hardwareBackend` for any origin — gated on
     `hasSetting('hardwareBackend')` (raw key presence), not `readSetting`, since the latter
     can't distinguish a never-set backend from the `cpu` default. An install that predates
     the on-disk file falls back to `detect_hardware`'s recommended backend, so an existing
     broken install self-heals on the next launch (no wizard re-run needed). As
     defense-in-depth, `start_llama_server` also upgrades a passed `cpu`/default backend from
     the persisted file, and logs the effective backend + `n_gpu_layers` to the top of
     `llama-server.log` so the launch decision is diagnosable.
   - **Verified** on an RTX 2060 SUPER: generation 7.45 → 26.98 t/s, prompt eval 357 → 823
     t/s, image processing 2678 → 1358 ms, with the log header showing
     `effective_backend=cuda n_gpu_layers=999`.

3. **"Format as table" failed again with "Failed to fetch" (Windows) / "Load failed" (macOS)
   in packaged builds — a repeat of #1, on both platforms this time.** The mac-display
   refactor ("images display on mac") changed the page-image `fileUrl` in
   `useDocumentExtraction.ts` from a `convertFileSrc` `asset://` URL to a same-origin
   `blob:` object URL (`URL.createObjectURL`), so the viewer's canvas no longer needed
   `crossOrigin` against WKWebView's custom scheme. But that same `fileUrl` is also read by
   `useLlamaChat.ts` (`fetch(fileUrl)` → base64 for the vision prompt), so "Format as table"
   now does `fetch("blob:…")`. The CSP `img-src` already listed `blob:` (so the image still
   *displayed*), but `connect-src` did **not** — and `fetch()` is governed by `connect-src`,
   not `img-src` — so the read was blocked as a CSP violation, surfacing as a bare
   `TypeError: Failed to fetch` / `Load failed`. Both platforms failed this time (vs #1's
   Windows-only asset origin) because `blob:` is scheme-only and platform-independent. Worked
   in dev because the packaged CSP isn't enforced against the Vite dev-server origin. The
   model loaded fine first (its `http://127.0.0.1:*` calls were always allowed), so the
   failure looked like a server problem but was the image read.
   - **Resolved** by adding `blob:` to `connect-src` in both `csp` and `devCsp`
     (`tauri.conf.json`), exactly as #1 added `asset:`. Grants no new capability — the blob is
     created in-process from bytes already read via the fs plugin, and the webview can already
     render those exact bytes via `<img>`.
   - **Deeper fix (not yet done):** `useDocumentExtraction.ts` already `readFile`s the image
     bytes; `useLlamaChat.ts` then re-`fetch`es the blob URL for the same bytes. Passing the
     bytes/base64 directly would drop the round-trip and make this path immune to
     `connect-src` regressions entirely.

4. **The app fetched its fonts from Google on every launch, contradicting the on-device
   claim.** `index.html` `<link>`ed Inter, Source Serif 4, and Material Symbols from
   `fonts.googleapis.com`/`fonts.gstatic.com`, which also forced both origins into
   `style-src`/`font-src` in *both* `csp` and `devCsp`. Offline — the normal case for this
   app — the UI fell back to Georgia/system-ui and every icon rendered as its ligature text.
   - **Resolved** by self-hosting: `@fontsource-variable/inter`,
     `@fontsource-variable/source-serif-4`, and `material-symbols` are now bundled and
     imported from `main.tsx` (not `App.css` — Tailwind v4 owns that file's `@import` graph),
     and both Google origins are gone from the CSP, which is now `font-src 'self'` outright.
   - Fontsource registers the families as `Inter Variable` / `Source Serif 4 Variable`, so the
     `--font-*` tokens list those first and keep the plain names as fallbacks.
   - **The icons came back filled.** The Google URL requested *single* axis values
     (`…:opsz,wght,FILL,GRAD@24,400,0,0`), so what it served was a font **instanced** at that
     point — the axes were baked into the file, and `font-variation-settings` could not move
     them. Every `fill={1}` and `weight={300}` in the codebase had therefore been a silent
     no-op since it was written. The self-hosted package ships the *full* variable font with
     all four axes live, so those props abruptly started working: six icons (the
     `check_circle`s in CompleteStep/DownloadStep/Settings/ExtractionOutputPane and the active
     `SideNavBar` item) filled in, and the `weight={300}` ones thinned.
     - Fixed by pinning `FILL 0, wght 400, GRAD 0, opsz 24` on `.material-symbols-outlined`
       in App.css — the instanced font's values — and gating the props behind `PIN_AXES` in
       `Icon.tsx`. The pin must live in CSS, not in `Icon`'s inline style, because
       `font-variation-settings` is replaced wholesale rather than merged: a partial inline
       value would drop the unnamed axes to the *font's* defaults (opsz 48), not the pinned
       ones.
     - **Worth a decision:** those six call sites were asking for filled icons and not getting
       them. `PIN_AXES = false` turns the props on — a deliberate visual change, icon by icon.
   - Cost: ~4 MB of icon font in the bundle (subsetting tracked under Open ▸ Build /
     Packaging).

5. **`package.json` was still named `app`** while every other field was already
   Anchor-branded. Renamed to `anchor`.

### Data / Storage

1. **"Remove all data and quit" left `workspace.db` (+ `-wal`, `-shm`) behind in an otherwise
   emptied AppData folder.** The wipe itself worked — binaries, models, tessdata, sessions and
   logs were all gone — but the database reappeared with the same timestamp, and the folder it
   needed came back with it.
   - **Root cause:** `removeAllAppData` finished by emitting a session-change event, and
     `AppLayout`'s sidebar answers that event by reloading its recent-session list. That calls
     `getDb()`, and `Database.load` in tauri-plugin-sql does not merely *open* a file — it
     `create_dir_all`s the app config dir and creates the database, after which `runMigrations`
     writes the schema. So the wipe was undone from the frontend milliseconds after it
     succeeded, and `std::process::exit` then killed the process before SQLite could checkpoint,
     leaving the `-wal`/`-shm` siblings too.
   - **Fix:** the event is gone (both wipe paths replace the UI wholesale, so nothing needed
     it), *and* `db.ts` now has a seal — after a wipe, `getDb()` rejects instead of reopening,
     so any caller (a listener, a timer, an in-flight promise) fails loudly rather than
     silently re-creating the database. `unsealDb` restores it if the wipe failed outright.
   - **Lesson for anything else that deletes app files:** deletion is not the end of the
     operation. Ask what in the running app will notice, because a "read" through this plugin
     is a write. Blocking the reopen at the source beats auditing every caller.

### UI / Frontend

1. **Editing the OCR broke the highlight boxes over the source image when clicking a cell.**
   - Provenance cell→source mappings now store stable `OcrWord` UUIDs instead of array
     indices, and `getCellSourceBox` resolves them against the *current* word array at click
     time. An add/edit/delete elsewhere on the page no longer shifts a cell onto the wrong
     box; a since-deleted source word resolves to no highlight rather than a wrong/broken
     box. Covered by reorder/delete cases in `provenance.test.ts`.

2. **The formatted table was read-only apart from single-cell edits** — a value the model
   split across two cells, a row shifted a column out of alignment, a junk row, or a
   duplicated column all had to be fixed after export, in another program. Three separate
   entries asked for the same thing: a fuller spreadsheet editor (delete cells, merge
   left/right), a way to mark many cells checked at once, and cell-by-cell arrow keys.
   - **Resolved** with a table editor over the same provenance grid
     (`features/extraction/tableEdits.ts` for the pure transforms, `useTableEditor.ts` for
     selection/history, `pages/session/tableCommands.ts` for the menus). Range selection
     (drag, Shift+click/arrows, row/column handles, Ctrl+A) drives bulk mark-as-checked,
     clear, copy/cut/paste (TSV, so it round-trips with Excel/Sheets); the structural
     commands are insert/delete/move rows and columns, join cells or whole columns, and
     delete/insert cells with a left/right shift for a misaligned row. Everything is
     undoable (Ctrl+Z, 50 deep, cleared per page).
   - Every command is a **pure grid transform** returning a rectangular, re-indexed grid,
     committed through the one existing write path (`Session.applyCellUpdate`), so
     click-to-highlight, the review worklist, confidence rendering and persistence needed
     no special cases. Structural edits keep each cell's `wordIds`, so a moved or joined
     cell still highlights its source words on the page.
   - **Arrow keys now move one cell** in all four directions (Shift extends the selection).
     Stepping between flagged cells moved to Alt+←/→ and F3 — the toolbar chevrons were
     always the primary path, and an editable table has to let you walk it.
   - Keyboard/paste act on the table only while the last click landed in the output pane —
     without that gate a Delete pressed while correcting OCR on the left would silently
     clear cells on the right.
   - The window title bar's **Edit menu** (Undo/Redo/Cut/Copy/Paste/Select All) used to run
     `document.execCommand` unconditionally, which acts on the focused *text field* — so
     with the table focused every one of those items was dead. A surface can now claim them
     while focused (`lib/editTarget.ts`), and the rows report its real availability instead
     of standing enabled over an empty undo stack. Not wired on macOS, whose Edit items are
     Tauri's predefined native ones and can't be intercepted from the frontend.
   - **Paste raised a browser permission prompt** ("localhost:1420 wants to see text and
     images copied to the clipboard", Block/Allow) — an on-device app asking the user's
     permission to read their own clipboard, which reads as a web page, not a desktop app.
     Cause: `navigator.clipboard.readText()` is a *web* API, so the webview gates it behind
     Chromium's `clipboard-read` permission; it is not specific to the dev origin and would
     have shipped. **Resolved** by reading through `tauri-plugin-clipboard-manager` instead
     (`readClipboardText` in `utils/clipboard.ts`), which asks the OS from Rust and never
     prompts; the web API stays as the fallback for a plain `vite dev` with no backend.
     Only `allow-read-text` is granted. Writes were never affected — `navigator.clipboard
     .write` is granted outright for a focused document acting on a user gesture — so the
     copy path keeps the web API, which is what lets it offer HTML alongside plain text.

3. **The setup wizard came up in light mode, and its back/forward buttons were dead** — both
   because the wizard renders *instead of* the routes, so nothing the routed app sets up on
   the way in applies to it. Only visible on a **re-run** (Settings ▸ *Re-run setup*, or a
   re-consent run after an `EULA_VERSION` bump); a genuine first install has neither a
   theme preference nor any history, so both defects looked like correct behaviour.
   - *Theme*: the `dark` class on `<html>` was written only by `useTheme`, whose two
     subscribers (`AppLayout`, `Settings`) are inside the router — so a user who had chosen
     dark was sent back through setup in light. **Resolved** by applying it once in
     `main.tsx` before `createRoot` (`applyStoredTheme`), which also removes the light flash
     on a normal launch, where the class previously landed in an effect after first paint.
     A full *Remove all data* reset is unaffected and still correct: it clears localStorage
     along with everything else, so that run really is a first run.
   - *Navigation*: a reload keeps the session's entries **and** the `idx` React Router wrote
     into `history.state`, so `historyPosition` reported Back as live. Pressing it moved the
     history behind a screen that never changed, and left the hash pointing somewhere the
     user hadn't been — which is where the wizard's own closing reload then landed them.
     **Resolved** with `lib/navState.ts`, which carries two facts: `App` declares whether
     the routes are on screen (false for the wizard, the startup check, and an
     unmounted-by-`ErrorBoundary` tree), which disables Forward and the routing menu items;
     and a takeover that can be left registers a **back handler** saying what Back means
     instead. The wizard registers one when the run is escapable, so Back does what the user
     pressing it actually wants — hands the app back — rather than being merely inert, and
     shows a *Back to Anchor* button off the same condition so the only way out isn't an
     arrow in the title bar.
     Escapable means `check_setup_complete` passed *and* the flag is what put us here, which
     is why `useSetupCheck` no longer short-circuits on the flag: the probe is the only thing
     separating a re-run the user chose from an install that is genuinely broken (and from a
     consent run, which `App` excludes since an unaccepted EULA gates the app rather than
     being a screen to dismiss). The install step withdraws the handler — a download in
     flight has to be stopped and confirmed, which its own *Cancel setup* does. Both checks
     sit inside `go`/`runCommand` rather than only in the `disabled` props, so the
     accelerators and macOS's native menu items — built in Rust, unable to read frontend
     state — are covered too.

### Provenance / Matching

1. **Course column got split into two columns.** Capitalized course name + right-justified
   numerical course code were read as two columns because each is distinct positionally
   (course codes all end before the description column's starting x).
   - **Root cause / mostly resolved:** the OCR text fed to the LLM (`buildTableText`) spaced
     each line independently by pixel X, so a wide column with left- and right-justified
     content produced a large within-cell gap the LLM read as a column break. Fixed by
     deriving column boundaries once from the header line and snapping every row to them.
   - **Residual (tracked in `todo.md`):** the user-facing mitigation — a chat box to ask the
     LLM to fix structure automatically — is still open.

2. **Everything loses alignment if the OCR isn't perfect**, especially when a missed word is
   a duplicate of a common value.
   - **Fuzzy second pass exists:** `fuzzyMatchPass` runs after the exact reading-order walk
     and recovers *misread* words.
   - **Grid cross-check exists:** `gridMatchPass` re-places cells that *desynced* from a
     dropped/duplicate word by triangulating from the surrounding matched grid.
   - **Residual (tracked in `todo.md`):** a word the OCR *missed entirely* still has no run
     to match against, so some duplicate-value misalignment from a dropped word can remain.

3. **Empty columns ruin matching.**
   - **Mostly resolved** by `gridMatchPass` (third pass after the exact walk + fuzzy pass).
     For a cell the linear passes left `unmatched`, it derives the row band from matched row
     siblings and the column band from the same column in other rows, then matches only OCR
     words whose centre falls in that row∩column region.
   - **Residual (tracked in `todo.md`):** it needs both a row and a column anchor, so a
     whole-row or whole-column blackout still can't be triangulated.

4. **Grid-based matching as an alternative to sequence matching** (infer column x-ranges /
   row y-ranges from OCR boxes to place links by grid index rather than sequence position).
   - **Implemented twice, in stages:** first as `gridMatchPass`, a cross-check *after* the
     sequence matcher; now fully, as the grid-first primary matcher (see #5 below) with the
     sequence walk demoted to fallback.

5. **Provenance matching should determine the grid algorithmically, not rely on reading
   order (which doesn't handle multiline cells well).**
   - **Resolved:** Stage 2a is now grid-first. Column bands are detected as whitespace
     channels (justification-agnostic; escalating crossing tolerance so a title line can't
     erase a real gap; the TSV's own column count anchors how many separators to pick), TSV
     rows are DP-aligned to visual lines by per-column content (a row can span wrapped
     lines, noise lines are skipped, an OCR-dropped row stays unassigned rather than
     stealing a duplicate from the next row), and each cell matches only unclaimed words in
     its own row×column region. Wrapped multiline cells — whose words interleave with other
     columns in reading order and could never form a contiguous run — now match exactly.
     The reading-order walk remains as the fallback primary (single-column output,
     non-tabular layout, or a grid that places <30% of cells), and the fuzzy gap pass +
     band-based grid cross-check remain as recovery passes. See design.md §6 4a.

6. **An exact-only match marked near-perfect cells "completely unverified"** — e.g.
   "Calc for eng I" vs OCR's "Calc for eng |" came back unverified despite being one char off.
   - Resolved with the fuzzy second pass (`fuzzyMatchPass`). After the exact reading-order
     walk, each still-unmatched cell is matched against the OCR words bounded by its nearest
     matched neighbours using normalized Levenshtein similarity (threshold 0.8). Above the
     threshold the cell is matched but flagged `fuzzy`, its trust drops one level, and it
     shows an `≈` badge instead of the gray "unverified" cell. Bounding the search to the
     positional gap keeps reading order intact and stops a fuzzy match from stealing a word
     another cell already owns.

### Parsing

1. **Valid commas in the text weren't being properly quoted or escaped.**
   - Moved to TSV, which solved this. TSV works fine with the LLM without degrading output,
     and tabs don't occur inside OCR'd table cells, so it's a clean delimiter.

2. **Valid pipes broke extraction.** OCR reported `|` (an actual `I` in the image) which
   should have been corrected to `I` in the table but was instead excluded — likely because
   the LLM read dropping it (shortening "Calc for engineers I" → "Calc for engineers") as a
   valid resolution.
   - Resolved by allowing pipes that stand alone in OCR (`"|"` is kept, but `"asd|"` has the
     pipe stripped).
   - **Watch:** flagged at the time as possibly still imperfect; revisit if pipe-in-value
     cases resurface.

### OCR / Preprocessing

1. **Preprocessed images still had rule lines and degraded glyphs.** Rule-line removal left
   black smudges/blobs (especially around boxed cells and at line intersections), and the
   adaptive threshold produced broken or thickened glyphs.
   - Resolved by removing the binarization pipeline entirely, reordering the upscale, letting
     Tesseract binarize, and correcting the Tesseract settings:

   ```
   1. Removed the binarization pipeline entirely.
   The old code ran every image through median denoise → adaptive threshold → rule-line removal before handing it to Tesseract. Intermediate debug images showed that Otsu at native 366×259 resolution was cutting through 1–2px antialiased screen font strokes at level ~196 — fragmenting glyphs before any upscaling could help. The remove_rule_lines function was also introducing black smudge artifacts at table line intersections. All of it is gone.

   2. Reordered upscale and let Tesseract binarize.
   The old code upscaled the already-binary image with nearest-neighbor, which blockified the fragmented pixels. The new pipeline converts to grayscale first, then Lanczos-upscales the grayscale (so antialiased stroke shoulders fatten up), then saves as-is. Tesseract's internal Sauvola/Otsu threshold runs on a 2× larger, smooth image and produces far cleaner glyph boundaries than the hard global cut we were applying to tiny native-resolution pixels.

   3. Corrected Tesseract settings.
   psm was left at the default (3 = auto-segment), which treats the image as a full page and wastes time on layout analysis. Setting it to 6 (single uniform text block) is the right mode for a screenshot of a table. dpi was defaulting to 150 in rusty-tesseract, which misrepresents post-upscale content and causes Tesseract to miscalibrate its font-size heuristics; setting it to None lets Tesseract estimate from the image itself.
   ```
