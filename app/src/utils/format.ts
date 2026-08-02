/** Shared human-readable renderings of the numbers the backend reports. */

/**
 * Megabytes as gigabytes, one decimal — how VRAM and system RAM are shown
 * everywhere they appear (the About panel's diagnostics, the setup wizard's
 * hardware summary, and the backend-mismatch warning). One decimal is the point:
 * an integer would round a 7.6 GB card to "8 GB" and put it on the wrong side of
 * the 4 GB CUDA threshold the same panel is explaining.
 */
export function mbToGb(mb: number): string {
    return `${(mb / 1024).toFixed(1)} GB`;
}

/** Megabytes as GB above 1 GB, MB below — for asset sizes, which span both. */
export function formatMb(mb: number): string {
    return mb >= 1024 ? mbToGb(mb) : `${mb} MB`;
}
