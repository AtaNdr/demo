# Project Context

## What this project is

**CodeLegion** is a self-hosted autonomous coding agent fleet. A developer labels a GitHub issue `agent-ready`, and the system picks it up, implements it, and opens a pull request for human review — unattended, for $0.03–$0.30 per task in LLM token costs.

This repository is simultaneously the fleet's own working directory (where agents do their work) and the host of a static stakeholder briefing presentation (`index.html`) explaining the system to decision-makers.

Target audience: engineering teams of 1–20 people with a steady backlog of scoped, testable issues.

## Stack

| Layer | Technology |
|---|---|
| Presentation app | Pure HTML/CSS/JS — no framework, no build step |
| Deployment | Azure Static Web Apps via GitHub Actions |
| Agent runtime | Claude Code CLI (`claude`) running on Azure VMs |
| LLM provider | Anthropic (Claude Haiku / Sonnet / Opus) |
| Auth | GitHub App (short-lived installation tokens) |
| Infrastructure | Azure Web App (controller) + Azure VMs (agents, on-demand) |
| Package manager | None — zero dependencies |
| Test framework | None in this repo (the repo IS the fleet; tests live in downstream repos) |

## Commands

```bash
# View the stakeholder briefing locally
open index.html           # macOS
xdg-open index.html       # Linux
# or: just open index.html in any browser — no server needed

# Deploy
git push origin main      # GitHub Actions picks up and deploys to Azure Static Web Apps automatically

# Lint / format / type-check
# None — the repo has no build toolchain. index.html is plain HTML.
```

## Key directories and files

| Path | Purpose |
|---|---|
| `index.html` | Stakeholder briefing — an 11-slide presentation about CodeLegion |
| `CLAUDE.md` | Fleet working agreement — the primary governing doc all agents read first |
| `CONTEXT.md` | This file — what the project is and how to work in it |
| `ARCHITECTURE.md` | Why the code is structured the way it is |
| `DESIGN.md` | UI contract for the briefing presentation |
| `DESIGN_DEFAULTS.md` | Non-negotiable accessibility and quality floors for all UI work |
| `COMMENT_STYLE.md` | How agents format issue comments and PR descriptions |
| `KNOWN_ISSUES.md` | Things that look broken but aren't — read before "fixing" anything |
| `LESSONS.md` | Append-only log of fleet corrections from rejected PRs |
| `DO_NOT_TOUCH.md` | Paths agents must never edit |
| `.github/` | CI/CD workflow, issue templates, label definitions (DO NOT TOUCH) |

## Conventions

- **No build step.** `index.html` is self-contained. All CSS is inline in `<style>`, all JS is inline in `<script>`. No bundler, no preprocessor.
- **Design via CSS custom properties.** The `index.html` defines its design system in `:root` — change tokens there, not ad hoc throughout the file.
- **Branch naming:** `<agent-name>/issue-<N>-<short-slug>` — always branch from `main`, never commit directly to it.
- **Every PR closes an issue.** PR bodies include `Closes #<N>`.
- **Tests required.** Every PR covering logic changes must include tests for each acceptance criterion. (For `index.html` UI changes, this means manual verification and documented checks since there's no test framework.)
- **CODEOWNERS enforces protection.** `.github/`, `infra/`, `migrations/`, lockfiles, and the fleet contracts are gated to `@AtaNdr/maintainers`.

## Gotchas

- The repo has **no `package.json`, `go.mod`, or `requirements.txt`** — there are no dependencies to install. Don't run `npm install` or similar.
- `KNOWN_ISSUES.md`, `LESSONS.md`, `DESIGN_DEFAULTS.md`, and `DO_NOT_TOUCH.md` all contain placeholder examples rather than real project-specific entries. These are template stubs — do not treat the examples as real facts about this repo.
- The `index.html` uses `overflow: hidden` on `body` intentionally — the slide deck fills the viewport and scroll is suppressed by design.
- The `.github/CODEOWNERS` file references `@AtaNdr/maintainers` as a placeholder — replace with real team handles before relying on CODEOWNERS enforcement.
- Azure Static Web Apps has a `gentle-forest-0098b6810` subdomain; this is auto-assigned by Azure and is not meaningful to change.

## How to work in this repo locally (end to end)

1. Clone the repo.
2. Open `index.html` in a browser — that's the full app.
3. Make changes to `index.html` (or markdown files).
4. Push a branch and open a PR → CI runs the Azure Static Web Apps deploy action and spins up a preview environment for the PR.
5. Merge to `main` → deploys to production automatically.
