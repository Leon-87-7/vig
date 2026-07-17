---
adr: "0037"
title: Mobile onboarding storyboard via Rive scenes in Next.js
status: accepted
date: 2026-07-17
---

## Context

The Ownix landing page needs to explain the product's core loop before a
visitor enters the read-only preview: internet intake becomes an owned Feed item,
then reusable AI context. The current landing page already has the right product
surface, CTAs, Ownix design system, and `/restricted` preview route, but its
early demo recording mixes desktop and mobile proof. It does not act as a
mobile-first onboarding story.

The intended story is specific:

```txt
doomscroll -> share -> Ownix Telegram capture -> Ownix Feed -> copy transcript -> reuse in AI chat
```

Telegram remains part of the story because it is the honest everyday capture
path today, even though dashboard submission is also being developed. The hero
must not pretend the current primary flow is already dashboard-native.

The animation also needs designer-grade motion: a generic glass AI chat panel
receives Ownix context while ChatGPT, Claude, and Gemini icons pass behind the
glass, communicating portability across major AI tools without presenting fake
native integrations or official partnerships.

## Decision

Add a new full-viewport `#onboarding` section directly after `#hero` on the
existing Next.js landing page. Keep `#hero` as the static promise and CTA
surface with the existing `Get an invite` and `Look inside` actions; do not
auto-scroll from `#hero`.

Implement the onboarding storyboard as several smaller Rive scenes composed by
React, not as one monolithic film and not as a separate Webflow production page.

React owns:

- the section layout and landing-page order
- preloading and the "start when roughly 60% visible" rule
- scene ordering and crossfades
- advancement when a Rive scene reports completion
- max-duration fallbacks if a scene completion event fails
- reduced-motion fallback
- the final 5-second end-card hold
- the conditional auto-scroll from `#onboarding` to `#showcase`

Rive owns:

- each scene's internal motion
- phone-scale abstracted UI vignettes
- the glass AI chat treatment
- the ambient provider-icon motion behind the glass
- per-scene first frames and completion signals

The final landing section order is:

```txt
#top -> #hero -> #onboarding -> #showcase -> #features -> #stats -> #demo -> #invite
```

Move the existing desktop-plus-mobile recording to the later `#demo` section,
where it functions as proof rather than onboarding.

The onboarding sequence ends on:

```txt
Ownix
Your internet. Own it. Reuse it.
```

After the end-card, hold for 5 seconds and then smooth-scroll to `#showcase`
only if the visitor has not interacted and does not prefer reduced motion.
Cancel that auto-scroll on scroll, click/tap, key press, or focus into a link or
control.

## Consequences

- The production marketing surface stays in the real Next.js app, close to the
  Ownix design tokens, routing, access CTAs, and preview behavior.
- Rive becomes a runtime dependency for this landing section, and final visual
  polish lives in `.riv` assets rather than only in React/CSS.
- The scene-by-scene composition costs more orchestration work than a single
  exported film, but individual beats can be replaced or retimed without
  re-authoring the whole storyboard.
- The animation can remain honest about Telegram as today's capture path while
  still making Ownix, the Feed, and AI reuse the dominant product story.
- Reduced-motion handling is part of the decision, not an afterthought: visitors
  who prefer reduced motion get a static equivalent and no auto-scroll.
- The AI destination is intentionally generic. ChatGPT, Claude, and Gemini marks
  may appear as softened behind-glass signals of portability, but the interface
  must not imply official integrations or partnerships.

Detailed implementation notes live in
`docs/plans/2026-07-17-ownix-mobile-onboarding-hero.md`.

## Considered Options

### Next.js-only CSS/React animation

Rejected as the primary approach. It would keep all behavior in code, but the
glass/icon motion and scene polish are likely to be slower to art-direct and
harder to maintain at the desired quality.

### Full Webflow production page

Rejected. Webflow would help visual iteration, but the landing page already
depends on app routes, Ownix design tokens, and the restricted preview CTA. A
separate production Webflow surface would be more likely to drift from the real
product model.

### Webflow prototype, Next.js production

Reserved as an optional art-direction workflow, not the production decision. It
can be useful if the motion language needs exploration, but it creates double
work if treated as the source of truth.

### One monolithic Rive film

Rejected. A single film would keep timing simple, but it would make future
changes to individual beats harder. Ownix is still actively evolving its capture
and reuse surfaces, so scene-level flexibility is worth the React orchestration
cost.

### Rendered video hero

Rejected for the primary experience. It would be predictable and cheap to ship,
but less responsive, less adaptable, and weaker as a product-real onboarding
surface. It can remain a fallback or temporary asset if Rive implementation
lags.
