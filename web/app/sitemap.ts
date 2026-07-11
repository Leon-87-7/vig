import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

// Public pages only. Authenticated app routes redirect to /login for
// crawlers, so listing them would just produce soft-404 noise.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: new Date('2026-07-01'),
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified: new Date('2026-07-01'),
      changeFrequency: 'monthly',
      priority: 0.4,
    },
  ];
}
