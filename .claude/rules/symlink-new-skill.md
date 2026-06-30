## Registering a new skill (symlink algorithm)

`agent-knowledge/skills/` is the single source of truth. `.claude/skills/` and
`.agents/skills/` are symlink mirrors so both Claude Code and Codex/other
AGENTS.md-following tools can fire the same skill. When adding a new skill,
do not put real files in `.claude/skills/` or `.agents/skills/` — symlink them.

**Steps:**

1. Create the skill at `agent-knowledge/skills/<skill-name>/SKILL.md` (plus any
   `reference.md` / `heuristics.md` / `examples.md`).
2. Create both symlinks via **PowerShell**, not Git Bash:
   ```powershell
   New-Item -ItemType SymbolicLink -Path ".claude\skills\<skill-name>" -Target "..\..\agent-knowledge\skills\<skill-name>"
   New-Item -ItemType SymbolicLink -Path ".agents\skills\<skill-name>" -Target "..\..\agent-knowledge\skills\<skill-name>"
   ```
3. Verify each is a real symlink, not a directory copy:
   ```powershell
   Get-Item ".claude\skills\<skill-name>" | Select-Object Name, LinkType, Target
   ```
   `LinkType` must read `SymbolicLink`. Blank `LinkType` means it copied instead of linking — delete it and redo step 2.
4. `git add` both paths and confirm git recorded them as symlinks, not regular files:
   ```bash
   git ls-files -s .claude/skills/<skill-name> .agents/skills/<skill-name>
   ```
   Both lines must show mode `120000`. Mode `100644` means a real copy got staged — `git rm` it and redo step 2.

**Why PowerShell, not `ln -s`:** on this machine, Git Bash's `ln -s` against a
directory target silently falls back to a full recursive copy instead of
creating a symlink — no error, no warning, it just duplicates the files. This
was discovered when testing the algorithm: `ln -s` produced a plain
`Directory` (confirmed via `Get-Item ... | Select Attributes`), while
`New-Item -ItemType SymbolicLink` produced a real `SymbolicLink` reparse
point that `git ls-files -s` correctly recorded as mode `120000`.

This requires Windows Developer Mode enabled (`AllowDevelopmentWithoutDevLicense=1`
under `HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock`) and
this repo's `core.symlinks=true` (both already set on this machine — see
git history for the original symlink-registration commit). Without
Developer Mode, `New-Item -ItemType SymbolicLink` requires admin elevation.
