import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { installMockBridge } from '@/test/setup';
import { TitleBar } from './TitleBar';

/**
 * The window is frameless, so this strip is the window chrome. A failure here
 * is not cosmetic: it is a window that cannot be closed.
 */
function renderTitleBar() {
  const mocks = installMockBridge();

  render(
    <MemoryRouter initialEntries={['/']}>
      <TitleBar />
      <Routes>
        <Route path="/" element={<p>Overview</p>} />
        {/* Stands in for the Search page, and proves where the query landed. */}
        <Route path="/search" element={<Query />} />
      </Routes>
    </MemoryRouter>,
  );

  return mocks;
}

function Query() {
  return <p>landed on search{useLocation().search}</p>;
}

function field() {
  return screen.getByRole('searchbox', { name: 'Search your history' });
}

/** Enter in a text input does not submit its form in jsdom, so submit it. */
function search(text: string) {
  fireEvent.change(field(), { target: { value: text } });
  fireEvent.submit(screen.getByRole('search'));
}

describe('the title bar', () => {
  it('asks the main process to close the window', async () => {
    const { windowControls } = renderTitleBar();

    screen.getByRole('button', { name: 'Close' }).click();

    await waitFor(() => expect(windowControls.close).toHaveBeenCalled());
  });

  it('minimises, and toggles maximise', async () => {
    const { windowControls } = renderTitleBar();

    screen.getByRole('button', { name: 'Minimise' }).click();
    screen.getByRole('button', { name: 'Maximise' }).click();

    await waitFor(() => expect(windowControls.minimize).toHaveBeenCalled());
    await waitFor(() => expect(windowControls.toggleMaximize).toHaveBeenCalled());
  });

  it('focuses the search field on Ctrl+K', async () => {
    renderTitleBar();

    expect(document.activeElement).not.toBe(field());

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });

    await waitFor(() => expect(document.activeElement).toBe(field()));
  });

  it('hands the query to the search page rather than answering it inline', async () => {
    renderTitleBar();

    search('invoice');

    expect(await screen.findByText(/landed on search\?q=invoice/)).toBeDefined();
  });

  it('ignores a query too short to search for', () => {
    renderTitleBar();

    search('a');

    // Still where it started: one character is not a search.
    expect(screen.getByText('Overview')).toBeDefined();
  });
});
