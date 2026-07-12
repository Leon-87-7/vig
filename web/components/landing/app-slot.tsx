'use client';

import { useEffect, useState } from 'react';
import { YouTubeIcon } from '@/components/svg/youtube-icon';
import { YouTubeShortsIcon } from '@/components/svg/youtube-shorts-icon';
import { InstagramIcon } from '@/components/svg/instagram-icon';
import { TikTokIcon } from '@/components/svg/tiktok-icon';
import { GitHubIcon } from '@/components/svg/github-icon';

const icons = [
  YouTubeIcon,
  YouTubeShortsIcon,
  InstagramIcon,
  TikTokIcon,
  GitHubIcon,
];

/** Inline 22px icon slot in the hero copy that cross-fades through the
 * apps you can share from. Under reduced motion it stays on the first icon. */
export function AppSlot() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (media.matches) return;
    const id = setInterval(
      () => setActive((i) => (i + 1) % icons.length),
      2800,
    );
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <span
        aria-hidden="true"
        className="inline-grid h-[22px] w-[22px] align-[-4px]"
      >
        {icons.map((Icon, i) => (
          <Icon
            key={i}
            className={`col-start-1 row-start-1 h-[22px] w-[22px] text-ink transition-opacity duration-[400ms] ease-out ${
              i === active ? 'opacity-100' : 'opacity-0'
            }`}
          />
        ))}
      </span>
      <span className="sr-only">any app</span>
    </>
  );
}
