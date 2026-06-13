'use client';

import { usePathname } from 'next/navigation';

const PAGE_BACKGROUNDS = {
  feed: '/backgrounds/feed.png',
  brain: '/backgrounds/brain.png',
  spaces: '/backgrounds/spaces.png',
  prompts: '/backgrounds/prompts.png',
  controls: '/backgrounds/controls.png',
} as const;

function getBackgroundForPath(pathname: string): string {
  if (pathname === '/brain' || pathname.startsWith('/brain/')) {
    return PAGE_BACKGROUNDS.brain;
  }

  if (pathname === '/spaces' || pathname.startsWith('/spaces/')) {
    return PAGE_BACKGROUNDS.spaces;
  }

  if (pathname === '/prompts' || pathname.startsWith('/prompts/')) {
    return PAGE_BACKGROUNDS.prompts;
  }

  if (pathname === '/controls' || pathname.startsWith('/controls/')) {
    return PAGE_BACKGROUNDS.controls;
  }

  return PAGE_BACKGROUNDS.feed;
}

export function PageBackground() {
  const pathname = usePathname();
  const backgroundImage = getBackgroundForPath(pathname);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-canvas"
    >
      <div
        className="absolute inset-0 bg-cover bg-center opacity-[0.34]"
        style={{ backgroundImage: `url(${backgroundImage})` }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(20,22,26,0.12),rgba(11,12,15,0.78)_58%,rgba(11,12,15,0.94)_100%)]" />
      <div className="absolute inset-0 bg-gradient-to-b from-canvas/72 via-canvas/34 to-canvas/88" />
    </div>
  );
}
