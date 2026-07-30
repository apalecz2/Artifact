// Shared style for the square icon buttons in the floating pane toolbars.
export const iconBtnClass = "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-variant text-on-surface transition-colors shadow-sm hover:bg-surface-container-high disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20";

// The session toolbars live inside the split panes, so they have to shrink with
// the divider rather than the window — hence container queries (`@xl`), not
// viewport ones (`sm:`). Past a point a labelled row can only wrap into a stack
// crowded against the gutter, so labels drop and each control falls back to its
// icon. Anything that hides its label must carry its own `aria-label`/`title`:
// a `display: none` label is excluded from the accessible name.
//
// Each threshold has to sit at the width where *that* row stops fitting on one
// line, not at a value shared for tidiness. The two toolbars hold very different
// amounts, and setting both to the source pane's breakpoint left the output
// pane's row wrapping to two lines across a wide band of mid widths before it
// finally simplified back down to one — worse at 800px than at 500px.

/* The output pane's view toggle (Raw Text / Formatted Table). Its row can't wrap
   — the heading beside it truncates instead — so this is only about not crushing
   the title. */
export const viewToggleLabelClass = "hidden @xl:inline";

/* Source-document toolbar. The page navigator renders only for a multi-page
   document and costs ~150px, so the same row can afford its labels ~190px
   earlier without one. A container query can't see the page count, so the
   threshold is chosen here instead of baked into a single class.

     row content                        single page   multi-page
     icons only                            302px         453px
     + labels (tools, overlay mode)        574px         725px
     + detail ("Overlay:", zoom slider)    718px         869px

   `detail` covers the two pieces that carry least — the "Overlay:" qualifier,
   and the zoom slider, which only duplicates the −/+ buttons beside it — so they
   go a step before the labels do. */
export function sourceToolbarClasses(multiPage: boolean): {
    label: string; labelBlock: string; detail: string; detailBlock: string; pad: string;
} {
    return multiPage
        ? {
            label: "hidden @3xl:inline",           // 768px, row needs 725px
            labelBlock: "hidden @3xl:block",
            detail: "hidden @min-[57rem]:inline",  // 912px, row needs 869px
            detailBlock: "hidden @min-[57rem]:block",
            pad: "px-2 @3xl:px-3",
        }
        : {
            label: "hidden @min-[37rem]:inline",   // 592px, row needs 574px
            labelBlock: "hidden @min-[37rem]:block",
            detail: "hidden @min-[46rem]:inline",  // 736px, row needs 718px
            detailBlock: "hidden @min-[46rem]:block",
            pad: "px-2 @min-[37rem]:px-3",
        };
}

/* Output pane's floating action toolbar — review nav, cell actions, undo/redo,
   Edit table, Export, Re-extract. Far denser than the source pane's row, so it
   gets its own ladder, and the steps are the measured widths at which each piece
   stops fitting rather than round numbers. Note these are *container* widths:
   a size query reads the pane's content box, so each is 48px (the pane's `px-6`)
   inside the pane width you'd measure on screen.

     row content            needs    threshold
     icons only             502px    — (wraps below; only reachable near the
                                       360px split floor)
     + button labels        718px    @3xl  768px
     + review wording       816px    @min-[55rem]  880px
     + selection count      893px    @min-[59rem]  944px

   Headroom covers what the measurements can't: the counts are 1–3 digits, and
   each extra digit is ~8px in Source Serif. */

/* Button labels: Edit table, Export, Re-extract. */
export const outputToolbarLabelClass = "hidden @3xl:inline";
/* The review worklist's wording — the longest text in the row, and the most
   redundant, since the count and the chevrons beside it already say it. */
export const outputToolbarProseClass = "hidden @min-[55rem]:inline";
/* The multi-cell selection count, which only appears mid-selection and costs
   another ~77px on top of the wording above, so it needs its own step. */
export const outputToolbarCountClass = "hidden @min-[59rem]:inline";
