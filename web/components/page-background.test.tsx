// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PageBackground } from './page-background';

const pathnameMock = vi.hoisted(() => ({ value: '/' }));
vi.mock('next/navigation', () => ({
  usePathname: () => pathnameMock.value,
}));

function bgUrlFor(pathname: string): string {
  pathnameMock.value = pathname;
  const { container } = render(<PageBackground />);
  const layer = container.querySelector('[style*="background-image"]') as HTMLElement;
  return layer.style.backgroundImage;
}

describe('getBackgroundForPath (via PageBackground)', () => {
  it.each([
    ['/', 'feed'],
    ['/brain', 'brain'],
    ['/brain/123', 'brain'],
    ['/spaces', 'spaces'],
    ['/spaces/abc', 'spaces'],
    ['/prompts', 'prompts'],
    ['/prompts/x', 'prompts'],
    ['/controls', 'controls'],
    ['/controls/y', 'controls'],
    ['/jobs/1', 'feed'], // unknown route → feed fallback
  ])('%s → %s.webp', (pathname, expected) => {
    expect(bgUrlFor(pathname)).toContain(`/backgrounds/webp/${expected}.webp`);
  });
});
