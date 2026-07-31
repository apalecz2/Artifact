import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { OutputHelp } from './SessionHelp';

afterEach(cleanup);

/** The rendered prose, with JSX's line wrapping collapsed the way a reader sees it. */
const prose = () => screen.getByText(/Drag across cells/).textContent!.replace(/\s+/g, ' ');

describe('OutputHelp keyboard hints', () => {
    it('keeps a space between a shortcut and the words after it', () => {
        // JSX drops whitespace between an expression and text on the next line,
        // so `{key('Ctrl+C')}\ncopies` renders as "Ctrl+Ccopies". Every hint in
        // this file is an expression, so the trap is one line break away.
        render(<OutputHelp />);

        expect(prose()).toContain('Ctrl+C copies the block');
        expect(prose()).toContain('Ctrl+A takes the table');
        expect(prose()).toContain('Ctrl+V pastes one back in');
    });

    it('names Windows keys off macOS', () => {
        render(<OutputHelp />);

        expect(prose()).toContain('Ctrl+A');
        expect(prose()).not.toContain('⌘');
        // Review nav: F3 off macOS, where Alt+arrows are the history shortcuts.
        expect(screen.getByText(/cells worth a second look/).textContent).toContain('F3');
    });

    it('names macOS keys on macOS', () => {
        render(<OutputHelp isMac />);

        expect(prose()).toContain('⌘A');
        expect(prose()).toContain('⌘C copies the block');
        expect(prose()).not.toContain('Ctrl+');
        // Review nav: ⌥ arrows on macOS, where F3 is a media key.
        const reviewNav = screen.getByText(/cells worth a second look/).textContent!;
        expect(reviewNav).toContain('⌥←/→');
        expect(reviewNav).not.toContain('F3');
    });

    it('documents F2 alongside Enter for starting an edit', () => {
        render(<OutputHelp />);

        expect(screen.getByText(/Double-click a cell/).textContent).toContain('press Enter or F2');
    });
});
