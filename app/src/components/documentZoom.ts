/**
 * Zoom math for the source-document viewer.
 *
 * Zoom is expressed *relative to the fitted image*: 1 means the page exactly
 * fits the visible pane, 0.5 half that, 2 double. Keeping the view model in
 * fit-relative units is what makes a window or split-divider resize free — the
 * fit is recomputed from the live pane size and the same zoom value still means
 * the same thing.
 *
 * The catch is that a *ceiling* in those units is not a ceiling on legibility.
 * A 2000px-wide pdfium render in a ~500px pane fits at ~0.23x, so a fixed
 * ceiling of 2 tops out at ~0.47x of the source pixels: the user could not zoom
 * far enough to read the very digit the confidence heatmap had flagged, in an
 * app whose core loop is "check this cell against the scan". The ceiling has to
 * be derived from the fit, not fixed against it — see `maxZoomFor`.
 *
 * Pure and DOM-free so the arithmetic can be tested without a layout.
 */

/** Furthest out, always relative to the fit: half the fitted size. */
export const MIN_ZOOM = 0.5;

/**
 * Lower bound for the zoom ceiling, in fit-relative units.
 *
 * Only binds when the page is already displayed at or above its natural size —
 * a small photo in a large pane, where 1:1 is *below* the fit and a ceiling of
 * exactly 1:1 would mean "cannot zoom in at all". Then this allows 2x the fit.
 */
export const FIT_MAX_ZOOM = 2;

/**
 * One click of zoom in/out, as a *factor* rather than an increment.
 *
 * Additive steps were fine against a fixed ceiling of 2, but the ceiling now
 * runs to ~4.3 on a typical scanned page, and +0.25 a click would be 14 clicks
 * from fit to 1:1. A factor also matches the wheel, which was already
 * exponential (`exp(-deltaY * k)`), so the two controls finally agree.
 */
export const ZOOM_FACTOR = 1.25;

/**
 * The zoom ceiling for a given fit scale (natural pixels -> pane pixels), or
 * `FIT_MAX_ZOOM` before the image and pane have both been measured.
 *
 * `1 / fitScale` is by definition the zoom at which one source pixel covers one
 * CSS pixel, so taking it as the ceiling makes 100% of the source resolution
 * exactly reachable — and reachable at the far end of the slider, which is the
 * cheapest possible affordance for "show me this at actual size". There is no
 * value in going past it: the render holds no further detail, and the OCR
 * overlay is drawn in the same coordinate space.
 */
export const maxZoomFor = (fitScale: number | null): number =>
    fitScale !== null && fitScale > 0 ? Math.max(FIT_MAX_ZOOM, 1 / fitScale) : FIT_MAX_ZOOM;

export const clampZoom = (zoom: number, maxZoom: number): number =>
    Math.min(maxZoom, Math.max(MIN_ZOOM, zoom));

/** One step in or out, clamped. `direction` is +1 to zoom in, -1 to zoom out. */
export const steppedZoom = (zoom: number, direction: 1 | -1, maxZoom: number): number =>
    clampZoom(direction === 1 ? zoom * ZOOM_FACTOR : zoom / ZOOM_FACTOR, maxZoom);

/**
 * Slider position in [0, 1] for a zoom value, and back.
 *
 * Logarithmic, because the range is no longer symmetric about the fit: on a
 * full-page scan it spans 0.5x..~4.3x, and a linear track would bury the fitted
 * view at 13% and hand five-sixths of its travel to magnification. On a log
 * track every pixel of travel is the same *proportional* change, so the fit sits
 * around a third of the way along and the halves stay usable.
 *
 * `maxZoom` is always >= FIT_MAX_ZOOM > MIN_ZOOM, so the span is never zero.
 */
export const zoomToSlider = (zoom: number, maxZoom: number): number =>
    Math.log(clampZoom(zoom, maxZoom) / MIN_ZOOM) / Math.log(maxZoom / MIN_ZOOM);

export const sliderToZoom = (position: number, maxZoom: number): number =>
    clampZoom(MIN_ZOOM * (maxZoom / MIN_ZOOM) ** Math.min(1, Math.max(0, position)), maxZoom);

/**
 * The zoom as a percentage of the source image's own pixels — what the toolbar
 * reports, and what "100%" means to anyone who has used an image viewer.
 *
 * Deliberately *not* the fit-relative zoom value: that number is an
 * implementation detail of the view model, and showing it would have the readout
 * say "200%" while the page is displayed at half its true resolution. Reported
 * this way, the readout doubles as the answer to "am I looking at everything
 * that's actually there?" — 100% is all of it.
 */
export const naturalZoomPercent = (zoom: number, fitScale: number | null): number | null =>
    fitScale !== null && fitScale > 0 ? Math.round(zoom * fitScale * 100) : null;
