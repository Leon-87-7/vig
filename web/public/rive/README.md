# Ownix onboarding mini-game — Rive contract

One production file lives in this directory: `onboarding-minigame.riv`.
One artboard, one state machine named `MiniGame`. It replaces the retired
7-file storyboard contract (per-scene `.riv`s with `OnboardingScene` / `done`).

## The game

An interactive teaching toy in the "Three taps" section (`#onboarding`) of the
landing page. Scene arc, all authored inside the state machine:

| Scene | Beat | Gate |
| ----- | ---- | ---- |
| 0 | Cover (Ownix logo card, ex-end-card artwork) splits open down the middle | auto, plays **once per page load** — restarts never route back here |
| 1 | Share funnel pulls the pipeline icons into the Telegram bot | click (center-canvas hit area) or ~3.5 s idle auto-advance |
| 2 | Telegram packs links (www.) + summary papers into the package for the AI pass | click (center-canvas hit area) or ~3.5 s idle auto-advance |
| 3 | Telegram plane flies through the Ownix logo | auto — the payoff, never gated |
| 4 | End state: logo settles; React overlays the HTML end screen | terminal |

Icon cast for scene 1 (same simple-icons geometry as the dashboard's
`platform-icon.tsx`): YouTube (landscape card), YouTube Shorts (portrait card),
Instagram, TikTok, GitHub, PDF page, Substack, photo. Substack is in because
`ARTICLE_DEFAULT_DOMAINS` ships it as a built-in article source.

The AI pass uses a **generic AI motif** — no Gemini or vendor branding baked
into the file.

## State machine contract

Inputs:

- `restart` (trigger) — jump to scene 1 (cover stays open).

Reported events (fired Rive events):

- `end_screen` — scene 4 reached; React fades in the HTML end screen
  (three buttons: reusable / searchable / stored) over the canvas.

All pacing — idle timers, scene durations — is authored in the state machine.
React keeps exactly one safety timeout (~25 s without `end_screen` ⇒ treat as
ended) and does not sequence scenes.

## React side (`onboarding-storyboard` successor component)

- Rive runtime stays behind `next/dynamic` (out of the initial bundle).
- Playback starts when the section scrolls into view, or on arrival via the
  hero's "See how it works" edge-tab pill (arrival = intent, start immediately).
- Restart: HTML ghost icon-button, bottom-right of the canvas, fires `restart`.
- End screen is HTML (real `<button>`s, design tokens, editable copy):
  - **Reusable** — tag, rerun enrichment or copy your content (rerun ships via
    ownix#398)
  - **Searchable** — search every job, link and tag — or ask your Second Brain
  - **Stored** — everything also lands in your Google Drive as markdown

## Degraded modes

`prefers-reduced-motion`, Rive load error, and no-JS all degrade to the
destination: static HTML with the Ownix logo, the three explained buttons, and
below them a flat "zoo map" SVG of the whole journey (funnel → AI pass →
dashboard), exported from the game's own artwork. The same SVG doubles as the
loading poster while the `.riv` fetches. No animation-shaped skeletons.
