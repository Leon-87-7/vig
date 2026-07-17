# Ownix Mobile Onboarding Hero Implementation Plan

Date: 2026-07-17

Status: Draft implementation plan

Owner surface: public landing page

Target route: `/`

Primary files likely affected:

- `web/app/page.tsx`
- `web/components/landing/*`
- `web/app/globals.css`
- `web/public/*` or a dedicated landing asset folder for `.riv` files

Related product decisions:

- `docs/adr/0037-mobile-onboarding-storyboard-rive-nextjs.md`
- `docs/adr/0034-ownix-design-system-transition.md`
- `docs/adr/0035-restricted-mode-preview.md`
- `PRODUCT.md`
- `DESIGN.md`

## Goal

Add a mobile-first animated onboarding section to the Ownix public landing page
that communicates the core workflow:

```txt
doomscroll -> share -> Ownix Telegram capture -> Ownix Feed -> copy transcript -> reuse in AI chat
```

The point is not to make a decorative landing animation. The point is to show,
quickly and honestly, how Ownix turns passive internet consumption into owned,
organized, reusable AI context.

The animation should leave the visitor with this product idea:

```txt
Your internet. Own it. Reuse it.
```

## Final Landing Structure

The landing page should use this section order and these IDs:

```txt
#top
#hero
#onboarding
#showcase
#features
#stats
#demo
#invite
```

The current `#demo` screen recording should move later in the page. It should no
longer be the first explanatory section after the hero because it is a proof
recording of a desktop plus mobile workflow, not the mobile onboarding
storyboard.

The new `#onboarding` section should sit directly after `#hero`.

## Hero Section Decisions

The existing hero should remain the promise and CTA surface.

Keep the current primary and secondary CTAs:

- `Get an invite`
- `Look inside`

Do not auto-scroll from `#hero` to `#onboarding`.

Reason: the hero is where visitors orient, read the promise, and choose whether
to request access or inspect the product. Auto-scrolling away from the hero risks
making the page feel like it is taking control away from the visitor.

The hero may visually hint that the onboarding film exists below the fold, but
the visitor must remain in control.

Opening headline remains:

```txt
You watched it. You liked it. You lost it.
```

## Onboarding Section Decisions

`#onboarding` should be a full-viewport cinematic section.

It should be mobile-only in presentation: one phone-scale flow, not a phone plus
desktop composition.

The section should use abstracted product vignettes with recognizable UI cues.
Do not use literal screenshots.

The storyboard should be ambient, not interactive. The visitor should not need to
tap, drag, scrub, or choose an AI provider.

The section should preload while below the hero, but should start playback only
when roughly 60% visible.

The section should not start playback when `prefers-reduced-motion: reduce` is
active.

After the storyboard reaches the final Ownix end-card:

1. Stop on the end-card.
2. Hold for 5 seconds.
3. Smooth-scroll to `#showcase`, but only if the visitor has not interacted.

Auto-scroll must be cancelled by any of these signals:

- user scrolls
- user clicks or taps
- user presses a key
- user focuses a link or control
- reduced-motion preference is active

The end-card copy is:

```txt
Ownix
Your internet. Own it. Reuse it.
```

## Storyboard

Canonical storyboard:

```txt
doomscroll card drifts up
-> share sheet blooms
-> Ownix Telegram bot captures
-> bot CTA opens Ownix
-> Feed item resolves
-> simulated tap on Copy transcript
-> AI glass panel receives context
-> prompt types through
-> ChatGPT / Claude / Gemini icons pass behind glass
-> Ownix logo and tagline
```

Important: `Copy transcript` is a simulated tap inside the animation, not a
visitor interaction.

## Product Truth

The hero should show Telegram because Telegram is the honest everyday capture
path today.

Do not show dashboard URL submission in this hero flow, even though dashboard
submission exists or is being developed. Showing both capture paths in this
mobile cinematic would blur the core message.

Telegram should read as the capture transport layer, not as the product.

Visual hierarchy:

1. Ownix owns the workflow.
2. Telegram is the current capture channel.
3. The Feed and transcript are the durable Ownix artifact.
4. AI chat is the reuse destination.

## AI Chat Treatment

Use a generic glassmorphic AI chat interface, not a fake exact clone of ChatGPT,
Claude, or Gemini.

Behind the thick glass layer, let the ChatGPT, Claude, and Gemini icons move in
and out of view in a slow ambient flow.

The icons should feel like bodies passing behind frosted glass:

- visible enough to communicate compatibility with major AI tools
- softened enough that the interface remains Ownix-led
- never presented as official integrations or partnerships

The AI chat panel itself should stay generic. It should communicate:

```txt
Ownix context packet -> prompt -> useful AI output
```

The selling point is portability:

```txt
Ownix turns your collected internet into reusable context for the AI tools you already use.
```

## Recommended Copy Inside The Animation

Use very short copy because this is a mobile cinematic.

Possible in-scene labels:

```txt
Share
Ownix bot
Open in Ownix
Transcript ready
Copy transcript
Context added
Prompt
Reusable output
```

Possible AI prompt:

```txt
Turn this into onboarding copy.
```

Alternative prompt if the surrounding section is more product-development
oriented:

```txt
Turn this into a launch support checklist.
```

The AI reply should be partial, not a wall of text. It only needs to prove that
the copied transcript became usable output.

Example reply fragments:

```txt
Here is a reusable onboarding flow:
1. Capture the source idea.
2. Extract the claim and examples.
3. Turn it into a checklist.
```

Keep the chat output generic enough that it does not overfit one audience.

## Rive And React Architecture

Use Rive embedded in the current Next.js landing page.

Do not move the production hero to Webflow for this implementation.

Accepted trade-off:

- Rive gives the polished motion and glass/icon treatment.
- Next.js keeps the landing page, routing, CTAs, accessibility behavior, and
  product consistency close to the real app.
- Major storyboard changes require editing Rive assets.

Use several smaller Rive scenes composed by React, not one monolithic Rive film.

Reason: flexibility from the start. Each beat can be replaced or retimed without
re-authoring the whole sequence.

Proposed scene components:

```txt
DoomscrollScene
ShareSheetScene
TelegramReceiptScene
FeedResolveScene
CopyTranscriptScene
AiReuseGlassScene
OwnixEndCardScene
```

React owns:

- section visibility
- preload timing
- scene ordering
- scene transition crossfades
- reduced-motion fallback
- auto-scroll rules
- event cancellation
- max-duration fallbacks

Rive owns:

- per-scene illustration
- per-scene internal motion
- glass/icon motion
- state-machine completion events
- crisp static first frames

## Scene Advancement Contract

Scene advancement should be driven by Rive completion signals, with React
timeouts as safety fallbacks.

Each scene should provide:

- a static first frame
- a named state machine or input contract
- a completion event or equivalent signal
- a maximum expected duration
- a reduced-motion still frame

React should advance when:

1. the active scene reports `done`, or
2. the scene exceeds its configured max duration

React should not depend only on hardcoded timeouts, because individual scenes
will likely change during animation polish.

Suggested scene metadata shape:

```ts
type OnboardingScene = {
  id: string;
  label: string;
  src: string;
  stateMachine: string;
  maxDurationMs: number;
  holdAfterDoneMs?: number;
};
```

Suggested sequence:

```ts
const scenes = [
  {
    id: 'doomscroll',
    label: 'Doomscroll',
    src: '/rive/onboarding-doomscroll.riv',
    stateMachine: 'Doomscroll',
    maxDurationMs: 3200,
  },
  {
    id: 'share-sheet',
    label: 'Share sheet',
    src: '/rive/onboarding-share-sheet.riv',
    stateMachine: 'ShareSheet',
    maxDurationMs: 2600,
  },
  {
    id: 'telegram-receipt',
    label: 'Ownix bot receipt',
    src: '/rive/onboarding-telegram-receipt.riv',
    stateMachine: 'TelegramReceipt',
    maxDurationMs: 3000,
  },
  {
    id: 'feed-resolve',
    label: 'Feed item ready',
    src: '/rive/onboarding-feed-resolve.riv',
    stateMachine: 'FeedResolve',
    maxDurationMs: 3200,
  },
  {
    id: 'copy-transcript',
    label: 'Copy transcript',
    src: '/rive/onboarding-copy-transcript.riv',
    stateMachine: 'CopyTranscript',
    maxDurationMs: 2200,
  },
  {
    id: 'ai-reuse-glass',
    label: 'Reuse in AI chat',
    src: '/rive/onboarding-ai-reuse-glass.riv',
    stateMachine: 'AiReuseGlass',
    maxDurationMs: 5200,
  },
  {
    id: 'ownix-end-card',
    label: 'Ownix end card',
    src: '/rive/onboarding-end-card.riv',
    stateMachine: 'EndCard',
    maxDurationMs: 1800,
    holdAfterDoneMs: 5000,
  },
];
```

These durations are starting points, not final timings.

## Asset Strategy

Place Rive files somewhere public and predictable, for example:

```txt
web/public/rive/onboarding-doomscroll.riv
web/public/rive/onboarding-share-sheet.riv
web/public/rive/onboarding-telegram-receipt.riv
web/public/rive/onboarding-feed-resolve.riv
web/public/rive/onboarding-copy-transcript.riv
web/public/rive/onboarding-ai-reuse-glass.riv
web/public/rive/onboarding-end-card.riv
```

If source project files are exported separately from `.riv`, store source
working files outside runtime paths, for example:

```txt
designs/rive/ownix-onboarding/
```

Runtime `.riv` files should be treated like built visual assets.

## Component Plan

Add a section component:

```txt
web/components/landing/onboarding-storyboard.tsx
```

Possible component structure:

```txt
OnboardingStoryboard
  OnboardingScenePlayer
  ReducedMotionStoryboard
  OnboardingProgress
```

`OnboardingStoryboard` responsibilities:

- render `<section id="onboarding">`
- preload Rive assets
- observe visibility
- start sequence only when 60% visible
- maintain active scene index
- listen for Rive `done`
- advance scenes
- hold end-card for 5 seconds
- auto-scroll to `#showcase` when allowed
- cancel auto-scroll on user interaction
- render fallback under reduced motion

`OnboardingScenePlayer` responsibilities:

- mount one Rive scene
- expose `onDone`
- expose `onLoad`
- handle max-duration fallback
- resize canvas correctly
- avoid layout shift

`ReducedMotionStoryboard` responsibilities:

- show a static sequence or final summary without motion
- preserve the same product message
- avoid auto-scroll

`OnboardingProgress` is optional. If used, keep it minimal and non-interactive,
such as small scene ticks. Avoid turning the section into a carousel.

## Layout And Visual Direction

The section should feel cinematic but still fit the Ownix system:

- dark canvas
- restrained surface ladder
- no bright gradient-orb decoration
- Index Amber only for action moments such as `Open in Ownix` or `Copy transcript`
- Brain gradient only if the Brain is explicitly the subject, which it is not in
  this storyboard
- clear phone-sized composition
- no nested cards
- no oversized decorative logo parade

The section should be full-viewport:

```txt
min-height: 100svh
```

Use `svh`/`dvh` carefully for mobile browser chrome.

The phone module should have stable dimensions:

```txt
aspect-ratio: 9 / 16
max-height: calc(100svh - reserved section chrome)
max-width: appropriate mobile width
```

The phone should not resize between scenes.

The Rive canvas should fill the same stable frame for every scene so crossfades
do not cause layout shifts.

## Accessibility Requirements

Reduced motion is mandatory.

When `prefers-reduced-motion: reduce` is active:

- do not autoplay the storyboard
- do not auto-scroll to `#showcase`
- show a static accessible summary of the flow
- keep CTAs and links keyboard accessible

The animated section should not trap focus.

The animation should be `aria-hidden` if it is purely visual and a text summary
is provided nearby.

Provide a concise screen-reader summary, for example:

```txt
Ownix lets you share a video through Telegram, open the saved item in your Feed,
copy the transcript, and reuse it as context in AI chat.
```

If there is a visible scene label, it should be real text outside the canvas,
not canvas-only text.

Auto-scroll must not fire after keyboard focus enters the section.

Any buttons inside the visible section must be real links or buttons if they are
interactive. In this plan, the storyboard itself is ambient, so simulated UI
inside Rive should not be focusable.

## Performance Requirements

The landing page must not block initial hero rendering on Rive.

Recommended loading behavior:

1. Render hero immediately.
2. Render `#onboarding` shell with static first frame or lightweight placeholder.
3. Preload Rive assets when the onboarding section is near the viewport.
4. Start playback only at the 60% visibility threshold.

Use dynamic import for the Rive runtime if needed so the landing page's initial
JavaScript is not dominated by animation code.

Avoid loading all Rive scenes before first paint. Preload enough for seamless
entry, then continue preloading later scenes while the early scenes play.

Possible preload strategy:

- eager: first two scenes
- background: remaining scenes after `#onboarding` shell mounts

Measure:

- Lighthouse mobile performance
- total JS impact
- layout shift
- animation frame smoothness on a mid-range mobile device

## External Tooling Notes

Production implementation should be Next.js plus Rive.

Webflow remains a possible prototyping tool, but not the production surface for
this plan.

Why not production Webflow now:

- the public landing page already exists in Next.js
- the CTAs depend on real app routes such as `/restricted` and `#invite`
- the visual system is already codified in `DESIGN.md` and Tailwind
- a separate Webflow page could drift from the real product model

Rive is the preferred motion tool because this storyboard needs polished
ambient motion, state-machine completion, responsive canvas behavior, and a
designer-editable source of truth for the glass/icon scene.

## Implementation Phases

### Phase 1 - Page Structure

Update `web/app/page.tsx` section order:

```txt
#top
#hero
#onboarding
#showcase
#features
#stats
#demo
#invite
```

Move the existing demo recording section later so it becomes `#demo`.

Add a placeholder `#onboarding` section with the final layout dimensions and
reduced-motion text summary.

Acceptance criteria:

- anchor links still work
- `Get an invite` still reaches `#invite`
- `Look inside` still reaches `/restricted`
- no auto-scroll from `#hero`
- `#onboarding` exists immediately after `#hero`

### Phase 2 - Storyboard Shell

Build `OnboardingStoryboard` without final Rive assets.

Use temporary scene placeholders that mimic the expected dimensions and scene
events.

Implement:

- visibility observer
- 60% playback threshold
- scene sequence
- done-event advancement
- max-duration fallback
- end-card 5 second hold
- auto-scroll to `#showcase`
- cancellation on interaction
- reduced-motion fallback

Acceptance criteria:

- sequence starts only when visible
- sequence does not start under reduced motion
- scene advancement works from fake `done` events
- a missing `done` event falls back to max duration
- auto-scroll only fires when allowed
- any user interaction cancels auto-scroll

### Phase 3 - Rive Runtime Integration

Add the Rive web runtime and scene player.

Confirm the best package for the current Next.js setup during implementation.
Likely candidates:

- `@rive-app/react-canvas`
- `@rive-app/react-webgl2`

Pick based on compatibility, bundle impact, and rendering behavior in the
existing app.

Integrate one test scene first, then all scenes.

Acceptance criteria:

- canvas is nonblank on desktop and mobile
- scene reports load state
- scene completion reaches React
- scene resizes without distortion
- no layout shift between scenes

### Phase 4 - Final Rive Assets

Create or import final `.riv` files:

- doomscroll card
- share sheet
- Telegram receipt
- Feed item resolve
- Copy transcript
- AI glass reuse
- Ownix end-card

Each scene must have:

- static first frame
- clear start state
- clear done signal
- expected max duration
- reduced-motion still frame

Acceptance criteria:

- every scene can play independently
- every scene has a clean first frame
- each scene reports done
- visual style matches Ownix tokens and product tone
- AI icons behind glass communicate portability without overpowering Ownix

### Phase 5 - Content And Polish

Finalize in-scene copy.

Tune timing:

- flow should be understandable if the visitor starts watching at the beginning
- end-card should hold long enough to read
- total duration should not feel like a long ad

Recommended target duration:

```txt
18-26 seconds before end-card hold
5 second end-card hold
```

Tune transitions:

- crossfades or match cuts between scenes
- no bouncy toy motion
- no generic AI glow overload
- no palette drift into one-note purple or neon

Acceptance criteria:

- user can understand the workflow without reading a paragraph
- final end-card lands cleanly
- section scroll into `#showcase` feels intentional

### Phase 6 - Tests And Verification

Add unit/component tests where practical:

- reduced-motion disables autoplay
- interaction cancels auto-scroll
- scene fallback advances after max duration
- end-card hold triggers scroll only when allowed

Use Playwright or equivalent visual checks for:

- desktop viewport
- mobile viewport
- reduced-motion emulation
- onboarding canvas nonblank
- no text overlap
- no unexpected horizontal scroll
- `#demo` later in the page

Manual verification:

- load landing page fresh
- read hero without being moved
- scroll to onboarding
- confirm playback starts only when mostly visible
- wait for end-card
- confirm auto-scroll to `#showcase`
- repeat while clicking/tapping/scrolling to confirm cancellation
- repeat with reduced motion enabled

## Open Questions

These are intentionally unresolved until implementation/art direction:

1. Which exact AI prompt should appear in the glass chat scene?
2. Should the AI icon set use official marks, simplified silhouettes, or custom
   abstracted marks inspired by the providers?
3. Should scene labels be visible outside the canvas, or only implied by the UI?
4. Should the end-card include CTAs, or only logo plus tagline?
5. How much of the existing landing copy should be shortened once the
   onboarding section carries the workflow explanation?

## Non-Goals

Do not build:

- a Webflow production landing page
- a visitor-controlled carousel
- a literal Telegram screenshot clone
- fake native ChatGPT/Claude/Gemini interfaces
- a desktop Feed hero
- a dashboard-submit branch in the hero storyboard
- a new public preview model
- a new chat integration

## Definition Of Done

This plan is complete when:

- the landing page has the final section order
- `#onboarding` is a full-viewport mobile cinematic section
- the storyboard follows the agreed Telegram-to-Feed-to-AI reuse flow
- Rive scenes are composed by React and advance via completion events
- reduced-motion visitors receive a static equivalent with no auto-scroll
- end-card holds for 5 seconds
- auto-scroll to `#showcase` happens only when allowed
- the existing screen recording is moved to `#demo`
- tests or manual verification cover the interaction and reduced-motion rules
- the page still feels like Ownix: quiet, precise, premium, and product-real
