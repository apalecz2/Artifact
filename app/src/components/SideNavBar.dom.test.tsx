import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

// The delete dialog reaches the DB and the filesystem; the recent list's ordering
// behaviour is what's under test here.
vi.mock('../features/sessions/DeleteSessionDialog', () => ({
    DeleteSessionDialog: () => null,
}));

import SideNavBar, { NavItem } from './SideNavBar';

const recent = (...ids: string[]): NavItem[] =>
    ids.map((id) => ({ id, icon: 'description', label: id.toUpperCase(), href: `/session/${id}` }));

const renderBar = (items: NavItem[]) =>
    render(
        <MemoryRouter>
            <SideNavBar collapsed={false} onToggleCollapse={vi.fn()} recentItems={items} />
        </MemoryRouter>,
    );

/** The recent rows, top to bottom, by label. */
const recentOrder = () =>
    screen
        .getAllByRole('link')
        .map((link) => link.getAttribute('href'))
        .filter((href): href is string => !!href?.startsWith('/session/'))
        .map((href) => href.replace('/session/', ''));

const list = () => screen.getByText('Recent Sessions').parentElement as HTMLElement;

describe('SideNavBar — recent session ordering', () => {
    it('re-orders immediately when the list is not being used', () => {
        const { rerender } = renderBar(recent('a', 'b', 'c'));
        expect(recentOrder()).toEqual(['a', 'b', 'c']);

        rerender(
            <MemoryRouter>
                <SideNavBar collapsed={false} onToggleCollapse={vi.fn()} recentItems={recent('c', 'a', 'b')} />
            </MemoryRouter>,
        );
        expect(recentOrder()).toEqual(['c', 'a', 'b']);
    });

    it('holds the new order while the pointer is over the list, then applies it on leave', () => {
        const { rerender } = renderBar(recent('a', 'b', 'c'));
        fireEvent.pointerEnter(list());

        rerender(
            <MemoryRouter>
                <SideNavBar collapsed={false} onToggleCollapse={vi.fn()} recentItems={recent('c', 'a', 'b')} />
            </MemoryRouter>,
        );
        expect(recentOrder()).toEqual(['a', 'b', 'c']);

        fireEvent.pointerLeave(list());
        expect(recentOrder()).toEqual(['c', 'a', 'b']);
    });

    it('still drops a removed session while the order is held', () => {
        const { rerender } = renderBar(recent('a', 'b', 'c'));
        fireEvent.pointerEnter(list());

        rerender(
            <MemoryRouter>
                <SideNavBar collapsed={false} onToggleCollapse={vi.fn()} recentItems={recent('c', 'a')} />
            </MemoryRouter>,
        );
        expect(recentOrder()).toEqual(['a', 'c']);
    });
});
