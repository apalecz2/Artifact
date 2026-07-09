# Issues

## Open

- Ideally all the test screenshots I have are full green provinence
- Terms of Service, etc. -- lets not get sued or allow for any possibility of




### Session:
- Sliding the slider over the image is laggy, compared to sliding it not over the image
- Info modal background / focus highlight looks off and is square and doesn't fit the area right.
    - Should probably overlay that entire side of session








### Low priority for first release:
- Screenshots don't show up well against the same theme -- dark screenshot against dark mode bg + vice versa
    - Could add drop shadow, or outline?


### From VM

1. Install steps ui need to scale to smaller device sizes better
5. Entire app should scale better on small screens



### Misc:

- Testing coverage and documentation
- npm ci from e2e ? doesn't work?
- test pdfium cargo test 




### Website:
- Product preview -- make more like the actual app -- use gif of working app
- Lies? Check hallucinations against actual app and ground it






### What do I need for 1.0.0?
- monochrome app icon next to name in top left of side bar 
- proof read all text
    - update app.tsx to match the text on the website to remove the em dash wording
- note on poor quality extractions -- "try fixing the OCR on the left for better results"
- re running set up(?)


- the saved in app x button can be hidden and not visible







---

## Resolved




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

### UI / Frontend

1. **Editing the OCR broke the highlight boxes over the source image when clicking a cell.**
   - Provenance cell→source mappings now store stable `OcrWord` UUIDs instead of array
     indices, and `getCellSourceBox` resolves them against the *current* word array at click
     time. An add/edit/delete elsewhere on the page no longer shifts a cell onto the wrong
     box; a since-deleted source word resolves to no highlight rather than a wrong/broken
     box. Covered by reorder/delete cases in `provenance.test.ts`.

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
