import { describe, it, expect } from 'vitest';
import {
    FIT_MAX_ZOOM,
    MIN_ZOOM,
    ZOOM_FACTOR,
    clampZoom,
    maxZoomFor,
    naturalZoomPercent,
    sliderToZoom,
    steppedZoom,
    zoomToSlider,
} from './documentZoom';

// The pane in the review's worked example: a 2000px-wide pdfium render in a
// ~500px split pane fits at ~0.23x of its natural size.
const SCAN_FIT = 0.23;

describe('maxZoomFor', () => {
    /**
     * The whole point of the item this replaced: the ceiling used to be a fixed
     * 2 in *fit-relative* units, which on a full-page scan capped the view at
     * ~0.47x of the source pixels. The user could not zoom far enough to read a
     * digit the app itself had flagged as low-confidence.
     */
    it('lets a downscaled scan reach exactly 1:1 with its source pixels', () => {
        const max = maxZoomFor(SCAN_FIT);
        expect(max * SCAN_FIT).toBeCloseTo(1, 10);
        expect(max).toBeGreaterThan(FIT_MAX_ZOOM);
    });

    it('still allows magnification when the image already fits larger than life', () => {
        // A small photo blown up to fill the pane: 1:1 is *below* the fitted
        // view, so a ceiling of 1/fitScale would mean "cannot zoom in at all".
        expect(maxZoomFor(4)).toBe(FIT_MAX_ZOOM);
    });

    it('falls back to the fixed ceiling before anything has been measured', () => {
        expect(maxZoomFor(null)).toBe(FIT_MAX_ZOOM);
        expect(maxZoomFor(0)).toBe(FIT_MAX_ZOOM);
    });
});

describe('clampZoom', () => {
    it('holds the zoom inside the range', () => {
        expect(clampZoom(99, 4)).toBe(4);
        expect(clampZoom(0.01, 4)).toBe(MIN_ZOOM);
        expect(clampZoom(1.5, 4)).toBe(1.5);
    });
});

describe('steppedZoom', () => {
    it('steps by a factor, so the in and out buttons are inverses', () => {
        const max = maxZoomFor(SCAN_FIT);
        expect(steppedZoom(1, 1, max)).toBeCloseTo(ZOOM_FACTOR, 10);
        expect(steppedZoom(steppedZoom(1, 1, max), -1, max)).toBeCloseTo(1, 10);
    });

    /**
     * Why a factor and not the old +0.25: the ceiling now runs past 4x the fit
     * on a typical page, and additive steps would put actual size ~14 clicks
     * away. A factor also matches the wheel, which was already exponential.
     */
    it('reaches actual size from the fit in a handful of clicks', () => {
        const max = maxZoomFor(SCAN_FIT);
        let zoom = 1;
        let clicks = 0;
        while (zoom < max && clicks < 100) {
            zoom = steppedZoom(zoom, 1, max);
            clicks++;
        }
        expect(zoom).toBe(max);
        expect(clicks).toBeLessThanOrEqual(8);
    });

    it('does not overshoot either stop', () => {
        expect(steppedZoom(MIN_ZOOM, -1, 4)).toBe(MIN_ZOOM);
        expect(steppedZoom(4, 1, 4)).toBe(4);
    });
});

describe('slider mapping', () => {
    it('round-trips a zoom through the track', () => {
        const max = maxZoomFor(SCAN_FIT);
        for (const zoom of [MIN_ZOOM, 0.8, 1, 2, 3, max]) {
            expect(sliderToZoom(zoomToSlider(zoom, max), max)).toBeCloseTo(zoom, 10);
        }
    });

    it('pins the ends of the track to the ends of the range', () => {
        const max = maxZoomFor(SCAN_FIT);
        expect(sliderToZoom(0, max)).toBeCloseTo(MIN_ZOOM, 10);
        expect(sliderToZoom(1, max)).toBeCloseTo(max, 10);
    });

    /**
     * The reason the track is logarithmic: on a lopsided range a linear one
     * would leave the fitted view at ~13% of the travel and give five-sixths of
     * the slider to magnification.
     */
    it('keeps the fitted view near the middle of a lopsided range', () => {
        const position = zoomToSlider(1, maxZoomFor(SCAN_FIT));
        expect(position).toBeGreaterThan(0.25);
        expect(position).toBeLessThan(0.45);
    });

    it('clamps a position outside the track rather than escaping the range', () => {
        expect(sliderToZoom(-1, 4)).toBe(MIN_ZOOM);
        expect(sliderToZoom(2, 4)).toBe(4);
    });
});

describe('naturalZoomPercent', () => {
    it('reports the fraction of the source resolution actually on screen', () => {
        // Fitted view of a full-page scan: far short of 100%, which is exactly
        // the fact the old fit-relative readout ("100%") concealed.
        expect(naturalZoomPercent(1, SCAN_FIT)).toBe(23);
        expect(naturalZoomPercent(maxZoomFor(SCAN_FIT), SCAN_FIT)).toBe(100);
    });

    it('has nothing to report before the fit is known', () => {
        expect(naturalZoomPercent(1, null)).toBeNull();
    });
});
