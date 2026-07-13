---
name: rabbitloop
description: >
  Use when the user wants to fully optimize a GitHub PR against CodeRabbit's and Codacy's review
  standards — iterate on a PR until CodeRabbit reports zero actionable comments and the Codacy
  Static Code Analysis check is green. Triggers/waits for both reviewers, fixes all actionable
  findings, pushes, re-checks, and repeats.
license: MIT
compatibility: Requires git and gh (GitHub CLI) authenticated, and CodeRabbit and/or Codacy installed on the repo.
metadata:
  author: LeonEidelman
  version: "1.0"
allowed-tools: Bash(gh:*) Bash(git:*)
---

# Rabbitloop

Iteratively fix a GitHub PR until **both** reviewers are satisfied: CodeRabbit reports zero
actionable comments (and zero unresolved threads) **and** Codacy's check run concludes `success`.

> **Two reviewers, one loop.** CodeRabbit and Codacy both run automatically on every push. Each
> iteration waits for both, gathers every actionable finding from either, fixes them in one batch,
> then pushes once so a single push re-runs both. The loop only exits when **both** pass. A repo may
> have only one installed — skip the absent reviewer (detect by whether its bot/check ever appears)
> rather than blocking on it.

**How each reviewer signals:**

| Reviewer   | Bot login                | Completion signal                                          | Pass condition |
| ---------- | ------------------------ | ---------------------------------------------------------- | -------------- |
| CodeRabbit | `coderabbitai[bot]`      | Commit status context `CodeRabbit`; PR review whose body starts `Actionable comments posted: N` | `Actionable comments posted: 0` and no unresolved inline threads |
| Codacy     | `codacy-production[bot]` | Check run `Codacy Static Code Analysis` completes; AI Reviewer posts a PR review whose body starts `### Pull Request Overview` | Check conclusion `success` and no unresolved inline threads |

Codacy has **two channels** under the same bot: the static-analysis **check run** (the gate) and an
**AI Reviewer** that submits a PR review with risk-tagged inline comments (`🔴 HIGH RISK` /
`🟡 MEDIUM RISK`). The AI review has no actionable counter — its unresolved inline threads ARE the
findings.

## Inputs

- **PR number** (optional): If not provided, detect the PR for the current branch.

## Instructions

### 1. Identify the PR

```bash
gh pr view --json number,headRefName -q '{number: .number, branch: .headRefName}'
```

Switch to the PR branch if not already on it.

### 2. Loop

Repeat the following cycle. **Max 5 iterations** to avoid runaway loops.

#### A. Trigger reviews

Push the latest changes (if any):

```bash
git push
```

Both reviewers auto-run on push — no trigger comment needed. Only if **nothing new was pushed**
this iteration and you need a fresh CodeRabbit pass, force one:

```bash
gh pr comment <PR_NUMBER> --body "@coderabbitai review"
```

(Codacy has no comment trigger; it only re-runs on push.)

#### B. Wait for both reviewers

Get the head SHA once per iteration:

```bash
HEAD_SHA=$(gh pr view <PR_NUMBER> --json headRefOid -q .headRefOid)
```

**Codacy** — poll the check run until it completes:

```bash
while true; do
  CODACY=$(gh api "repos/{owner}/{repo}/commits/$HEAD_SHA/check-runs" \
    --jq '.check_runs[] | select(.app.slug == "codacy-production")')
  STATUS=$(echo "$CODACY" | jq -r '.status // empty')
  if [ "$STATUS" = "completed" ]; then
    echo "Codacy: $(echo "$CODACY" | jq -r '.conclusion')"
    break
  fi
  echo "Waiting for Codacy... (status: ${STATUS:-not started})"
  sleep 10
done
```

**CodeRabbit** — poll the commit status until it leaves `pending`, then read its latest review:

```bash
while true; do
  CR_STATE=$(gh api "repos/{owner}/{repo}/commits/$HEAD_SHA/status" \
    --jq '.statuses[] | select(.context == "CodeRabbit") | .state')
  if [ -n "$CR_STATE" ] && [ "$CR_STATE" != "pending" ]; then
    echo "CodeRabbit: $CR_STATE"
    break
  fi
  echo "Waiting for CodeRabbit... (state: ${CR_STATE:-not started})"
  sleep 10
done
```

If a reviewer never appears after a reasonable wait (~3–4 min), treat it as not installed and skip
it for the rest of the loop.

#### C. Fetch findings

**CodeRabbit summary** — latest review body starts with `Actionable comments posted: N`:

```bash
gh api "repos/{owner}/{repo}/pulls/<PR_NUMBER>/reviews" \
  --jq '[.[] | select(.user.login | test("coderabbit"; "i"))] | last | .body'
```

Parse `Actionable comments posted: N`. Ignore CodeRabbit's collapsible boilerplate
(`🤖 Prompt for AI Agents`, `🪄 Autofix`, review-info blocks) — they are not findings.

**Codacy check run** — the output names the issues/complexity/clones it flagged:

```bash
gh api "repos/{owner}/{repo}/commits/$HEAD_SHA/check-runs" \
  --jq '.check_runs[] | select(.app.slug == "codacy-production") | .output | {title, summary}'
```

A `success` conclusion titled "Your pull request is up to standards!" passes even if the summary
lists complexity/clone deltas — those are informational. A failing conclusion means the summary
(and inline comments) contain the gate-breaking issues.

**Codacy AI Reviewer** — latest `codacy-production[bot]` PR review; the body is a prose
`### Pull Request Overview` (no counter — the inline threads are the findings):

```bash
gh api "repos/{owner}/{repo}/pulls/<PR_NUMBER>/reviews" \
  --jq '[.[] | select(.user.login | test("codacy"; "i"))] | last | .body'
```

The AI review may land a few minutes after the check run; if the bot has reviewed this PR before
but no review covers the latest push yet, wait for it (or use the review UI's "Run reviewer"
trigger — there is no comment trigger). Each of its inline comments opens with a risk tag
(`🔴 HIGH RISK` / `🟡 MEDIUM RISK`); treat them all as actionable unless clearly a false positive.

**Inline comments from both** — one call covers the two bots:

```bash
gh api --paginate "repos/{owner}/{repo}/pulls/<PR_NUMBER>/comments" \
  --jq '.[] | select(.user.login | test("coderabbit|codacy"; "i")) | {user: .user.login, path, line, body}'
```

#### D. Check exit conditions

Stop the loop if **any** of these are true:

- **Both** reviewers pass: CodeRabbit reports **`Actionable comments posted: 0`** with **zero
  unresolved inline threads**, AND the Codacy check concluded **`success`** with **zero unresolved
  inline threads**. (Skip whichever reviewer is not installed — an absent reviewer does not block
  the exit.)
- Max iterations reached (report current state).

Do **not** exit when only one reviewer is happy: a green Codacy check while CodeRabbit still has
actionable comments (or vice versa) means keep looping.

#### E. Fix actionable comments

Gather the unresolved findings from **both** reviewers into one list, then for each:

1. Read the file and understand the comment in context.
2. Determine if it's actionable (code change needed) or informational/nitpick/false positive.
3. If actionable, make the fix.
4. If informational or a false positive, note it (with a brief reason) but still resolve the thread.

Fix everything in a single batch before pushing, so one push re-runs both reviewers at once.

#### F. Resolve threads

Both bots' inline comments are GitHub review threads, so one resolve flow handles both — when
listing threads, match `author.login` against `coderabbit` **or** `codacy`. (As a shortcut, posting
`@coderabbitai resolve` as a PR comment tells CodeRabbit to resolve all of its own threads at once;
still resolve Codacy's via GraphQL.)

Fetch unresolved review threads:

```bash
gh api graphql -f query='
query($cursor: String) {
  repository(owner: "OWNER", name: "REPO") {
    pullRequest(number: PR_NUMBER) {
      reviewThreads(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          comments(first: 1) {
            nodes { body path author { login } }
          }
        }
      }
    }
  }
}'
```

Resolve addressed threads:

```bash
gh api graphql -f query='
mutation {
  t1: resolveReviewThread(input: {threadId: "ID1"}) { thread { isResolved } }
  t2: resolveReviewThread(input: {threadId: "ID2"}) { thread { isResolved } }
}'
```

#### G. Commit and push

```bash
git add -A
git commit -m "address review feedback (rabbitloop iteration N)"
git push
```

Then go back to step **A**.

### 3. Report

After exiting the loop, summarize:

| Field                 | Value                                     |
| --------------------- | ----------------------------------------- |
| Iterations            | N                                         |
| CodeRabbit actionable | N remaining (or n/a if not installed)     |
| Codacy check          | success / failure (or n/a if not installed) |
| Comments resolved     | N                                         |
| Remaining comments    | N (if any)                                |

If the loop exited due to max iterations, list any remaining unresolved comments (noting which
reviewer raised each) and suggest next steps.

### 4. Offer to merge on a full pass

If the loop exited because **both** reviewers passed (not max-iterations) and any CI/status checks
are green, proactively ask the user whether to merge — don't just report and stop. This is the one
case worth interrupting for: 0-actionable CodeRabbit + green Codacy + green CI is the signal the
user is waiting on.

- `gh pr merge <PR_NUMBER> --squash --delete-branch` (or the user's preferred merge strategy) once
  confirmed.

Still honor any standing merge policy (e.g. extra confirmation before merging into `main`/`master`)
— this prompt satisfies "ask before merging," it doesn't bypass a stricter main-branch rule layered
on top.

## Output format

```
Rabbitloop complete.
  Iterations:    2
  CodeRabbit:    0 actionable
  Codacy:        success
  Resolved:      7 comments
  Remaining:     0
```

If not fully resolved:

```
Rabbitloop stopped after 5 iterations.
  CodeRabbit:    2 actionable
  Codacy:        failure
  Resolved:      12 comments
  Remaining:     3

Remaining issues:
  - [coderabbit] src/db.ts:112 — "Missing index on user_id column"
  - [codacy]     src/auth.ts:45 — "Avoid deeply nested control flow"
```
