# Project Context

## What this project is

This repo hosts the **CodeLegion stakeholder briefing** — an 11-slide presentation delivered as a single static HTML page (`index.html`). The presentation explains the CodeLegion autonomous agent fleet product: what it does, why it exists, how it compares to alternatives, and what's on the roadmap. It is aimed at engineering managers and technical stakeholders considering deploying the fleet.

The repo also serves as a **live CodeLegion target**: the agent fleet scaffolding (CLAUDE.md, DESIGN_DEFAULTS.md, issue templates, etc.) is wired up so that agents can pick up labeled GitHub issues and open PRs against this repo — including issues that improve the presentation itself.

**Who uses it:**
- Stakeholders viewing the deployed presentation at the Azure Static Web App URL
- The CodeLegion agent fleet, which picks up `agent-ready` issues here

## Stack

| Layer | Choice |
|---|---|
| Language | HTML + CSS + vanilla JavaScript |
| Framework | None — single-file app, no build system |
| Hosting | Azure Static Web Apps |
| CI/CD | GitHub Actions (Azure SWA deploy action) |
| Package manager | None (`package.json` does not exist) |
| Test framework | None |
| Linter / formatter | None |

## Commands

There are no dependencies to install. All tooling is zero-setup.

```bash
# Run locally — open in a browser directly:
open index.html

# Or serve with Python's built-in server (useful for testing links):
python3 -m http.server 8080
# then open http://localhost:8080

# Deploy: push to main — GitHub Actions handles it automatically
git push origin main
```

There is no install, test, lint, format, or type-check step. The "test" for this project is visual: open the file in a browser and navigate through all 11 slides.

## Key directories / files

```
/
├── index.html          — the entire application (HTML + CSS + JS, ~770 lines)
├── CLAUDE.md           — agent working agreement (governs fleet behavior)
├── CONTEXT.md          — this file
├── ARCHITECTURE.md     — structural rationale
├── DESIGN.md           — UI design contract
├── DESIGN_DEFAULTS.md  — universal accessibility and quality floors
├── COMMENT_STYLE.md    — agent comment formatting rules
├── KNOWN_ISSUES.md     — things that look broken but aren't
├── LESSONS.md          — append-only corrections from rejected PRs
├── DO_NOT_TOUCH.md     — files agents must not edit
└── .github/
    ├── CODEOWNERS              — branch protection for critical paths
    ├── labels.yml              — fleet label definitions
    ├── ISSUE_TEMPLATE/
    │   ├── agent-task.md       — structured template for agent-ready issues
    │   └── free-form-request.md
    └── workflows/
        └── azure-static-web-apps-gentle-forest-0098b6810.yml  — CI/CD deploy
```

## Conventions

- **All CSS uses custom properties** defined in `:root` — never hard-code color or spacing values directly in rules or inline styles.
- **Class naming is semantic, not utility-first.** Components are named by role (`.card`, `.slide`, `.blist`, `.flow`, `.slab`) not by their CSS properties. No BEM, no Tailwind.
- **Slide structure is fixed:** every slide is `<div class="slide">` optionally containing `.slab` (section label), then `.body` (content). Do not deviate from this structure.
- **Slide transitions** are driven by toggling `.active` / `.out-left` classes via JS — do not add additional CSS that changes `opacity` or `transform` on `.slide` elements.
- **All state lives in the JS closure** at the bottom of `index.html`. There is no global state.

## Gotchas

- **No build step.** `index.html` is deployed verbatim. If you introduce a build tool (webpack, Vite, etc.) you must update the CI/CD workflow and document the change prominently.
- **Slides must not scroll.** `html, body { overflow: hidden; }` is load-bearing. Slide content must fit in `calc(100vh - 52px)`. If content overflows, it is invisible — not scrollable. Size content to fit.
- **The Azure SWA API token** (`AZURE_STATIC_WEB_APPS_API_TOKEN_GENTLE_FOREST_0098B6810`) must exist as a GitHub repo secret for deployment to work. It is not in this repo.
- **The agent fleet infrastructure** (the CodeLegion controller, VM provisioner, etc.) is a separate project at `github.com/AtaNdr/CodeLegion`. Issues labeled `agent-ready` here are picked up by that external fleet; the fleet's own source is not in this repo.
- **KNOWN_ISSUES.md and LESSONS.md** currently contain placeholder examples, not real project-specific entries. The examples reference files (`src/`, `tests/legacy/`, etc.) that do not exist in this repo.
