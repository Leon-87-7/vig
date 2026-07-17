import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LinksTable } from '@/components/feed/links-table';
import type { UseLinksTableResult } from '@/lib/hooks/useLinksTable';

const baseLink = {
  url: 'https://thenounproject.com',
  title: '10M Free Icons & Stock Photos',
  topic: 'The video discusses consistent branding across platforms.',
  description: null as string | null,
  seen_count: 1,
  first_seen: '2026-07-14T09:05:00Z',
  last_seen: '2026-07-14T09:05:00Z',
};

function makeLinksData(link: typeof baseLink): UseLinksTableResult {
  return {
    query: '',
    setQuery: () => {},
    view: { sort: 'last_seen', order: 'desc', size: 25 },
    viewLoaded: true,
    updateView: () => {},
    toggleSort: () => {},
    data: { items: [link], limit: 25, offset: 0, total: 1 },
    state: 'ready',
    message: '',
    page: 0,
    setPage: () => {},
    jumpPage: '1',
    setJumpPage: () => {},
    submitJump: () => {},
    pageCount: 1,
    currentPage: 1,
    start: 1,
    end: 1,
    hasPrevious: false,
    hasNext: false,
  } as unknown as UseLinksTableResult;
}

describe('LinksTable standalone identity line', () => {
  it('shows title · description when the link has its own description', () => {
    render(
      <LinksTable
        linksData={makeLinksData({
          ...baseLink,
          description: 'Over 10 million SVG and PNG icons for download.',
        })}
      />,
    );
    expect(
      screen.getAllByText(
        '10M Free Icons & Stock Photos · Over 10 million SVG and PNG icons for download.',
      ).length,
    ).toBeGreaterThan(0);
    // The video topic never appears collapsed.
    expect(
      screen.queryByText(/The video discusses/, { exact: false }),
    ).not.toBeInTheDocument();
  });

  it('reveals the provenance line only when expanded', async () => {
    const user = userEvent.setup();
    render(
      <LinksTable
        linksData={makeLinksData({
          ...baseLink,
          description: 'Over 10 million SVG and PNG icons for download.',
        })}
      />,
    );
    // Two More buttons (mobile card + desktop row); expanding the first suffices.
    await user.click(screen.getAllByRole('button', { name: 'More' })[0]);
    expect(
      screen.getAllByText(/From: The video discusses/, { exact: false }).length,
    ).toBeGreaterThan(0);
  });

  it('falls back to title · topic while description is missing', () => {
    render(<LinksTable linksData={makeLinksData(baseLink)} />);
    expect(
      screen.getAllByText(
        '10M Free Icons & Stock Photos · The video discusses consistent branding across platforms.',
      ).length,
    ).toBeGreaterThan(0);
  });
});
