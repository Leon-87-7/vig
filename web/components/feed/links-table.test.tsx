import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/render';
import { LinksTable } from '@/components/feed/links-table';
import type { UseLinksTableResult } from '@/lib/hooks/useLinksTable';

const baseLink = {
  id: 'lnk_1',
  url: 'https://thenounproject.com',
  title: '10M Free Icons & Stock Photos',
  topic: 'The video discusses consistent branding across platforms.',
  description: null as string | null,
  seen_count: 1,
  first_seen: '2026-07-14T09:05:00Z',
  last_seen: '2026-07-14T09:05:00Z',
  tags: [] as { id: string; name: string; color: string; meaning: string; icon?: string | null }[],
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

describe('LinksTable trimmed URL row', () => {
  it('shows pathname + query instead of the full URL', () => {
    render(
      <LinksTable
        linksData={makeLinksData({
          ...baseLink,
          url: 'https://github.com/vercel-labs/skills?tab=readme',
        })}
      />,
    );
    expect(screen.getAllByText('/vercel-labs/skills?tab=readme').length).toBeGreaterThan(0);
    // The full URL never renders as collapsed row text.
    expect(
      screen.queryByText('https://github.com/vercel-labs/skills?tab=readme'),
    ).not.toBeInTheDocument();
  });

  it('falls back to the hostname for bare-domain links', () => {
    render(<LinksTable linksData={makeLinksData(baseLink)} />);
    expect(screen.getAllByText('thenounproject.com').length).toBeGreaterThan(0);
  });

  it('keeps the hostname for root-domain links with a query string', () => {
    render(
      <LinksTable
        linksData={makeLinksData({
          ...baseLink,
          url: 'https://example.com/?u=1',
        })}
      />,
    );
    expect(screen.getAllByText('example.com?u=1').length).toBeGreaterThan(0);
    expect(screen.queryByText('/?u=1')).not.toBeInTheDocument();
  });

  it('provides the full URL in a tooltip for the trimmed URL', async () => {
    const user = userEvent.setup();
    render(
      <LinksTable
        linksData={makeLinksData({
          ...baseLink,
          url: 'https://github.com/vercel-labs/skills?tab=readme',
        })}
      />,
    );

    await user.hover(
      screen.getAllByRole('link', { name: '/vercel-labs/skills?tab=readme' })[0],
    );
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'https://github.com/vercel-labs/skills?tab=readme',
    );
  });

  it('renders a separate open-in-new-tab button alongside the URL anchor', () => {
    render(<LinksTable linksData={makeLinksData(baseLink)} />);
    expect(
      screen.getAllByRole('link', {
        name: 'Open https://thenounproject.com in a new tab',
      }).length,
    ).toBeGreaterThan(0);
  });

  it('reveals the full URL in the expanded More panel', async () => {
    const user = userEvent.setup();
    render(
      <LinksTable
        linksData={makeLinksData({
          ...baseLink,
          url: 'https://github.com/vercel-labs/skills',
        })}
      />,
    );
    await user.click(screen.getAllByRole('button', { name: 'More' })[0]);
    expect(
      screen.getAllByText('https://github.com/vercel-labs/skills').length,
    ).toBeGreaterThan(0);
  });

  it('renders a More button even when the link has no title or description', () => {
    render(
      <LinksTable
        linksData={makeLinksData({ ...baseLink, title: null as unknown as string })}
      />,
    );
    expect(screen.getAllByRole('button', { name: 'More' }).length).toBeGreaterThan(0);
  });
});

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

  it('shows only the title while description is unresolved — topic never leaks into the row', () => {
    render(<LinksTable linksData={makeLinksData(baseLink)} />);
    expect(
      screen.getAllByText('10M Free Icons & Stock Photos').length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByText(/The video discusses/, { exact: false }),
    ).not.toBeInTheDocument();
  });
});

describe('LinkTagCluster', () => {
  it('shows the ghost + affordance on untagged rows', () => {
    render(<LinksTable linksData={makeLinksData(baseLink)} />);
    // Desktop row + mobile card each render the cluster trigger.
    expect(
      screen.getAllByRole('button', { name: 'Add link tag' }).length,
    ).toBeGreaterThan(0);
  });

  it('renders name-less dots for attached tags, names only in the tooltip', () => {
    render(
      <LinksTable
        linksData={makeLinksData({
          ...baseLink,
          tags: [
            { id: 't1', name: 'svg', color: '#f87171', meaning: 'vector art' },
            { id: 't2', name: 'ui', color: '#60a5fa', meaning: '' },
          ],
        })}
      />,
    );
    const clusters = screen.getAllByRole('button', { name: 'Edit 2 link tags' });
    expect(clusters.length).toBeGreaterThan(0);
    // The tag name never renders as row text — badge is a color dot only.
    expect(screen.queryByText('svg')).not.toBeInTheDocument();
  });
});
