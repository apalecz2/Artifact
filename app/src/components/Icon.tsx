import React from 'react';

export interface IconProps {
    /** Material Symbols glyph name, e.g. "download" (see fonts.google.com/icons). */
    name: string;
    /** Font size in px. Omit to inherit the surrounding font size. */
    size?: number;
    /**
     * FILL axis: 0 = outlined, 1 = filled. **Currently inert** — see `PIN_AXES`
     * below. Every icon renders outlined, as it always has.
     */
    fill?: 0 | 1;
    /**
     * Optical weight (`wght`) axis, e.g. 300. **Currently inert** — see
     * `PIN_AXES` below. Every icon renders at weight 400, as it always has.
     */
    weight?: number;
    /** Extra classes for colour, animation, or layout (e.g. "text-primary animate-spin"). */
    className?: string;
    /** Decorative by default; pass `false` only when the glyph itself is the label. */
    'aria-hidden'?: boolean;
}

/**
 * When true, `fill` and `weight` are ignored and every glyph renders at the axis
 * values pinned in App.css (`FILL 0, wght 400, GRAD 0, opsz 24`).
 *
 * This preserves how the app has always looked, which is *not* the same as what
 * the call sites ask for. The Google-hosted stylesheet requested single axis
 * values (`…@24,400,0,0`), so the font it served was instanced at that point —
 * the axes were baked into the file and `font-variation-settings` could not move
 * them. Every `fill={1}` and `weight={300}` in the codebase has therefore been a
 * no-op for as long as it has been there. Self-hosting ships the full variable
 * font with the axes live, which silently filled the six `fill={1}` icons (the
 * `check_circle`s and the active nav item) and thinned the `weight={300}` ones.
 *
 * Set to false to let the props take effect — a deliberate visual change to
 * review icon by icon, not a bug fix.
 */
const PIN_AXES: boolean = true;

/**
 * Single home for the Material Symbols icon span that was repeated ~80 times across
 * the app. Replaces the `<span className="material-symbols-outlined" style={{ fontSize,
 * fontVariationSettings }}>name</span>` boilerplate with a typed, self-documenting
 * element. `size` maps to font size; `fill`/`weight` map to variable-font axes but are
 * currently pinned (see `PIN_AXES`); anything else (colour, spin, margins) goes through
 * `className`.
 */
export function Icon({
    name,
    size,
    fill,
    weight,
    className = '',
    'aria-hidden': ariaHidden = true,
}: IconProps): React.ReactElement {
    // Only the axes the caller set are emitted, so the App.css pin supplies the
    // rest. `font-variation-settings` is replaced wholesale rather than merged,
    // so emitting a partial value here would drop the unnamed axes to the font's
    // own defaults (opsz 48) instead of inheriting the pinned ones.
    const axes: string[] = [];
    if (!PIN_AXES) {
        if (fill !== undefined) axes.push(`'FILL' ${fill}`);
        if (weight !== undefined) axes.push(`'wght' ${weight}`);
    }

    const style: React.CSSProperties = {};
    if (size !== undefined) style.fontSize = `${size}px`;
    if (axes.length) {
        style.fontVariationSettings = `${axes.join(', ')}, 'GRAD' 0, 'opsz' 24`;
    }

    return (
        <span
            className={className ? `material-symbols-outlined ${className}` : 'material-symbols-outlined'}
            style={style}
            aria-hidden={ariaHidden}
        >
            {name}
        </span>
    );
}

export default Icon;
