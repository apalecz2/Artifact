import { describe, it, expect, vi, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { flushSync } from 'react-dom';
import ContextMenu, { type MenuItem } from './ContextMenu';

afterEach(cleanup);

const items: MenuItem[] = [
    { label: 'Cut', onSelect: vi.fn() },
    { separator: true },
    { label: 'Copy', onSelect: vi.fn() },
];

describe('ContextMenu', () => {
    it('closes on a mousedown outside itself', () => {
        const onClose = vi.fn();
        render(<ContextMenu x={10} y={10} items={items} onClose={onClose} />);

        fireEvent.mouseDown(document.body);

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('stays open for a mousedown inside itself', () => {
        const onClose = vi.fn();
        render(<ContextMenu x={10} y={10} items={items} onClose={onClose} label="Table edits" />);

        fireEvent.mouseDown(screen.getByRole('menu'));

        expect(onClose).not.toHaveBeenCalled();
    });

    // The pane's own document-capture mousedown listener clears the cell
    // selection on the same click, re-rendering this menu's parent. Closing must
    // not depend on surviving that.
    it('closes when another listener on the same dispatch re-renders it', () => {
        const onClose = vi.fn();

        function Host() {
            // Stands in for the selection state the real menu's items read.
            const [, setTick] = useState(0);
            useState(() => {
                document.addEventListener(
                    'mousedown',
                    () => flushSync(() => setTick(t => t + 1)),
                    true,
                );
            });
            return <ContextMenu x={10} y={10} items={items} onClose={onClose} />;
        }

        render(<Host />);
        fireEvent.mouseDown(document.body);

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes on an outside scroll but not on scrolling its own list', () => {
        const onClose = vi.fn();
        render(<ContextMenu x={10} y={10} items={items} onClose={onClose} />);

        // A tall menu scrolls internally (max-height + overflow-y): that must
        // not be mistaken for the anchor moving out from under the pointer.
        fireEvent.scroll(screen.getByRole('menu'));
        expect(onClose).not.toHaveBeenCalled();

        fireEvent.scroll(document.body);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('opens below the window title bar, not under it', () => {
        // The bar is z-100 and the menu z-60, so a menu clamped to the viewport
        // top had its first rows hidden beneath it — capping the height doesn't
        // help when the overflow is at the *top*.
        const bar = document.createElement('div');
        bar.setAttribute('data-app-titlebar', '');
        bar.getBoundingClientRect = () => ({ bottom: 40, top: 0, height: 40 }) as DOMRect;
        document.body.appendChild(bar);

        try {
            render(<ContextMenu x={10} y={0} items={items} onClose={vi.fn()} />);
            const menu = screen.getByRole('menu');
            // 40 (bar) + 8 (MARGIN).
            expect(menu.style.top).toBe('48px');
            // And the scroll cap starts from there, not from the viewport top.
            expect(menu.style.maxHeight).toBe(`${window.innerHeight - 48 - 8}px`);
        } finally {
            bar.remove();
        }
    });

    it('falls back to the viewport when there is no title bar', () => {
        render(<ContextMenu x={10} y={0} items={items} onClose={vi.fn()} />);

        expect(screen.getByRole('menu').style.top).toBe('8px');
    });

    it('closes on Escape', () => {
        const onClose = vi.fn();
        render(<ContextMenu x={10} y={10} items={items} onClose={onClose} />);

        fireEvent.keyDown(window, { key: 'Escape' });

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('runs an item and closes when one is chosen', () => {
        const onClose = vi.fn();
        const onSelect = vi.fn();
        render(
            <ContextMenu
                x={10}
                y={10}
                items={[{ label: 'Cut', onSelect }]}
                onClose={onClose}
            />,
        );

        fireEvent.click(screen.getByRole('menuitem', { name: 'Cut' }));

        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
