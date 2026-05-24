# Architecture Deepening Opportunities

> Generated 2026-05-23 via `/improve-codebase-architecture`.  
> Each candidate is a refactor that turns shallow modules into deep ones — more behaviour behind a smaller interface.  
> Pick one and run `/improve-codebase-architecture` (grilling loop) to design the deepened interface.

---

## Candidate 1 — Gemini client lives in 5 places at once

**Files**  
`enrichment.py:155-168`, `prd.py:386-395`, `prd.py:573-581`, `brain.py:65-79`, `gemini.py:63-73`, `gemini_photo.py:112-127`

**Problem**  
The free→paid key selection and fallback loop is copy-pasted into every Gemini call site. Each copy has subtle variations (some try 2 keys, some 3, some wrap in a thread executor, some don't). There is no single place to fix retry policy, add observability, or swap in a new key.

**Solution**  
One deep `GeminiClient` module that owns key selection, fallback ordering, and retry. Callers say "generate with this prompt" — they never see which key was used or how many tries it took.

**Benefits**  
Every fix to the fallback logic is made once (locality). Tests can inject a fake client that returns canned responses, making every module that calls Gemini unit-testable without real API keys (leverage).

---

## Candidate 2 — Template logic has no home

**Files**  
`templates.py` (dataclass), `long_video.py:20-28` (auto-detection), `enrichment.py:37-104` (prompt injection), `enrichment.py:171-210` (result formatting), `validation.py:13-35` (score/mismatch warning)

**Problem**  
A template is defined in one file but its behaviour is scattered across four others. The deletion test is clear: deleting `templates.py` does not remove template complexity — it just forces it to reappear across all four call sites. Adding a new template requires coordinated edits in five files with no enforcement. The `PromptTemplate` dataclass is almost entirely passive; the behaviour it nominally owns lives elsewhere.

**Solution**  
A deep `Template` module that owns the full lifecycle: detection given a title, prompt injection given a transcript, and result rendering given `template_analysis`. Callers say "apply template to job" without knowing the template's internal structure.

**Benefits**  
Adding a 5th template is a single-file change (locality). The `_format_template_analysis` switch in `enrichment.py:171-210` disappears from enrichment entirely (leverage). Template detection and rendering can be unit-tested inside the template module without touching enrichment or processor code.

---

## Candidate 3 — Webhook handler is a procedure, not a module

**Files**  
`webhook.py:420-498` (main handler), `_handle_callback:114-210` (95 lines, 10+ callback types), `_dispatch_slash:213-308` (95 lines, 8+ slash commands)

**Problem**  
The handler does routing, authentication, chat-state expiration, job creation, photo batch gating, and intent-mode routing — all inline. Routing keys (`data.split(":", 1)[1]`) are bare strings matched in a single nested conditional. There is no seam between "decide what to do" and "do it." Testing any one callback requires standing up the full webhook surface.

**Solution**  
A dispatch table — a dict from callback/command discriminator to a handler function. The main webhook becomes a narrow router: authenticate, identify the message type, look up the handler, call it. Each handler is a small, independently testable function with typed arguments, not a branch in a 95-line conditional.

**Benefits**  
Each message type is testable in isolation without wiring up the full FastAPI app (leverage). Adding a new callback or command is a single dict entry with no risk of breaking adjacent handlers (locality). The routing strategy is visible at a glance.

---

## Candidate 4 — Processors are integration tests wearing production clothes

**Files**  
`processors/short_video.py` (199 lines), `processors/long_video.py` (135 lines)

**Problem**  
Each processor is a single `run()` function that calls 8+ external services inline — transcript service, Gemini, Brave, Drive, Sheets, Telegram, DB — in sequence with no seams between stages. The application cannot run in a test context without every external service live. Bugs in the orchestration logic (wrong status transitions, missing brain ingest call, skipping Telegram notification on error) are invisible to any test short of a full integration run. Both processors also duplicate the fire-and-forget brain ingest pattern, the error Telegram message pattern, and the Drive upload + Sheets append sequence.

**Solution**  
A `Pipeline` abstraction where each stage is a named, isolated step. The processor becomes a declaration of steps in order; each step receives job state from the previous step and returns updated state. External service calls are injected as dependencies rather than imported directly.

**Benefits**  
Each pipeline step is testable independently with a fake service (leverage). The shared stages — error reporting, brain ingest, Drive+Sheets — are implemented once and reused (locality). New pipeline variants (additional content types, experimental steps) are additive.

---

## Candidate 5 — PRD run_auto and run_intent are the same pipeline twice

**Files**  
`prd.py:345-514` (`run_auto`, 170 lines), `prd.py:516-709` (`run_intent`, 195 lines)

**Problem**  
Both functions follow an identical 7-step skeleton: acquire lock → sample transcript → call Gemini → Drive upload-or-update → Sheets append → brain ingest → Telegram delivery. They differ only in their lock column, their Gemini prompt, and one extra input field (`prd_intent_text`). A change to the Drive update logic must currently be made in two places, and the two copies are already drifting (the fallback loop at `prd.py:386-395` differs subtly from `prd.py:573-581`).

**Solution**  
Extract the shared skeleton as a single `run_prd(slot)` function accepting a slot descriptor (enum or dataclass) carrying the lock column name, the prompt-builder function, and the Gemini schema. The two public entry points become thin wrappers that construct the right slot descriptor and delegate.

**Benefits**  
Every fix to the PRD pipeline is made once (locality). The 7-step structure is legible in one place — no cross-referencing two 170-line functions (leverage). The skeleton itself can be unit-tested with a fake slot; the two wrappers each need only a narrow test for slot construction.
