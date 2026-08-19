# Repository Instructions

## Scope

These rules apply to every coding CLI or agent working in this repository.

## Before Editing

- Read the relevant code and existing tests before making assumptions.
- Check `git status --short` before starting.
- Treat existing user changes as intentional. Do not revert, reset, or overwrite unrelated work.
- Keep changes narrowly scoped to the requested task.
- Prefer the repository's existing patterns, helpers, frameworks, and naming.

## Files And Secrets

- Respect `.gitignore` and never force-add ignored files without explicit approval.
- Never commit secrets, API keys, tokens, credentials, local environment files, model weights, databases, evidence frames, or generated build output.
- Keep per-developer assistant configuration local. Do not commit `.claude/`, `.clinerules`, `.clineignore`, or local tool configuration unless explicitly requested.
- Review staged file names and the staged diff before every commit.
- Stage explicit paths only. Never use `git add .` or `git add -A` when unrelated work is present.

## Editing And Verification

- Use `apply_patch` for manual edits.
- Preserve ASCII unless the file already requires another character set.
- Add focused tests for behavior changes and run the narrowest relevant checks.
- Run `git diff --check` before committing.
- Report unavailable dependencies or skipped tests honestly.

## Git Commits And Pushes

- Commit only when the user explicitly asks.
- Before committing, inspect `git status`, the staged diff, and recent commit style.
- Use the repository's configured `user.name` and `user.email`.
- Do not add assistant names, `Co-authored-by` trailers, agent attribution, or generated authorship metadata unless explicitly requested.
- Use concise commit messages matching the existing repository style.
- Never amend, force-push, reset, or rewrite history unless explicitly requested.
- Push only when the user explicitly asks, and verify the remote branch and final status afterward.

## Collaboration

- Do not claim a change is complete until implementation and verification are finished.
- If the worktree contains unrelated changes, leave them untouched and tell the user what remains uncommitted.
- If a requested change conflicts with existing user work in the same files, stop and ask before overwriting it.
