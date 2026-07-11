import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

// Crawl control only — deindexing is handled by per-route `robots.index: false`
// metadata (/login, /logout, dashboard). Those routes stay crawlable here so
// bots can actually see the noindex directive.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/feed',
        '/brain',
        '/jobs',
        '/spaces',
        '/controls',
        '/prompts',
        '/doc-parser',
        '/mini',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
