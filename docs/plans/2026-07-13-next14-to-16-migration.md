# Handoff: migrate `web/` from Next 14.2.35 → 16.2.10

Status: planned, not started. Work on a new branch off `main` (e.g. `chore/next16-migration`). Do NOT merge to main without the user's explicit say-so.

## Context

- App: `web/` — Next.js App Router, standalone output, Dockerfile deploy, vitest + RTL + msw tests, middleware-based session gate.
- Source context is cached locally for both versions:
  - `C:\Users\leone\.opensrc\repos\github.com\vercel\next.js\14.2.35`
  - `C:\Users\leone\.opensrc\repos\github.com\vercel\next.js\16.2.10`
  - Authoritative upgrade guides: `<16.2.10>\docs\01-app\02-guides\upgrading\version-15.mdx` and `version-16.mdx`. Turbopack loader config: `...\01-next-config-js\turbopack.mdx`.
- The codebase is already 16-friendly: `app/(dashboard)/layout.tsx` awaits `cookies()`/`headers()`; dynamic routes (`jobs/[id]`, `spaces/[id]`) are client components using `useParams()`/`useSearchParams()`; no `useFormState`, no pages router, no fetch-cache reliance, no `images.domains`, no parallel routes. Node 23 and TS 5 meet the floors.

Go 14 → 16 directly in one step; nothing here needs the Next 15 transitional shims.

## Step 1 — dependency bump

```
npm i next@16.2.10 react@19 react-dom@19
npm i -D @types/react@19 @types/react-dom@19
```

(or `npx @next/codemod@canary upgrade latest`, which also does some of the mechanical rewrites below).

Peer-dep watchlist — resolve on install, don't pre-bump: `lucide-react@^1.21`, `react-force-graph-2d`, `@milkdown/*`, `@paper-design/shaders-react`. Radix and `@testing-library/react@16.3` already support React 19.

## Step 2 — Turbopack is the default builder; the custom `webpack()` block breaks `next build`

`web/next.config.js:14-27` has a webpack SVGR rule. Next 16 fails the build when a webpack config exists (misconfiguration guard). Replace the whole `webpack()` block with the documented Turbopack rule (`@svgr/webpack` is on Turbopack's tested-loaders list):

```js
turbopack: {
  rules: {
    '*.svg': {
      loaders: ['@svgr/webpack'],
      as: '*.js',   // required — tells Turbopack the loader output is JS
    },
  },
},
```

SVGR consumers are TSX-only (imports of `@/app/ownix-logo.svg` in `app/page.tsx`, `components/sidebar.tsx`, `components/public-shell.tsx`, `components/ui/public-header.tsx`, `components/ui/footer.tsx`) — no CSS `url()` consumers, so a blanket `*.svg` rule is safe. Keep `svgr.d.ts` as is. Tests are unaffected (vitest mocks the svg in `test/setup.ts`).

Fallback if SVGR misbehaves under Turbopack: keep the webpack block and set `"build": "next build --webpack"`. Try the Turbopack rule first.

## Step 3 — `middleware.ts` → `proxy.ts`

- Rename `web/middleware.ts` → `web/proxy.ts`; rename the exported function `middleware` → `proxy`. Keep the `config` matcher export (unchanged convention).
- Rename `middleware.test.ts` → `proxy.test.ts` and update its imports.
- Runtime becomes nodejs (edge unsupported in proxy) — the cookie-routing logic doesn't care.

## Step 4 — `next lint` is removed

`package.json` has `"lint": "next lint"` and there is **no eslint config file** in `web/`. `next build` no longer lints either. Either:
- run `npx @next/codemod@canary next-lint-to-eslint-cli .` (creates flat-config ESLint + rewrites the script), or
- drop the `lint` script.

Note: `components/sidebar.tsx:109` carries an `eslint-disable @next/next/no-img-element` comment — harmless either way.

## Verify-only items (don't pre-fix)

- `app/opengraph-image.tsx` sets `runtime = 'edge'` — root route, no params; should still build. If it complains, delete the `runtime` export (nodejs runs ImageResponse fine in 16).
- `next dev` now writes to `.next/dev` — irrelevant to the standalone Dockerfile.
- Fetch is uncached by default since 15 — `isRestrictedRequest`'s backend call becomes explicitly uncached, which is the desired behavior.
- `images.minimumCacheTTL` / `qualities` / `imageSizes` defaults changed — no configured remote images, no action.

## Pre-existing bug found during planning (fix in passing or file an issue)

`components/svg/telegram-icon.tsx` renders `next/image` with a **remote** SVG (`https://thesvg.org/icons/telegram/default.svg`). With no `images.remotePatterns` configured this throws at runtime on Next 14 *and* 16, and next/image blocks SVG content without `dangerouslyAllowSVG` anyway. It's an untracked new file on `feat/ownix-landing-copy`. Simplest fix: plain `<img>` (pattern already used in `components/sidebar.tsx` for external CDNs) or inline the SVG like the sibling `instagram-icon.tsx`.

## Verification checklist

1. `npm run test:run` — full vitest suite green.
2. `npx next build` — must pass under Turbopack (this is the step most likely to surface issues).
3. `npx next dev`, then click through: landing `/` → login gate → `/feed` → `/jobs/[id]` → `/spaces/[id]` → `/restricted?exit` — exercises the proxy rename, SVGR components, and the restricted-mode cookie path (ADR-0035).
4. Docker build if touching the deploy: `docker build web/`.
