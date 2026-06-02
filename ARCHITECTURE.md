# Architecture

## Overview

The application is a **single-file HTML presentation** with no server-side components. All markup, styling, and behavior live in `index.html`. There is no build step, no dependency graph, and no runtime beyond a browser.

```
Browser
  └── index.html
        ├── <style>       — all CSS (~300 lines, embedded)
        ├── #deck         — 11 slide <div>s, absolutely positioned, stacked
        ├── #nav          — fixed bottom nav bar
        └── <script>      — IIFE, ~60 lines, all interaction logic
```

## Why single-file?

The presentation must be:
1. **Maximally portable** — viewable by opening the file locally with no server
2. **Zero-dependency** — no npm, no CDN calls, no external fonts
3. **Trivially deployable** — Azure SWA serves it as-is; no build config needed

Splitting into separate CSS/JS files would add a dev-server requirement for local preview and introduce a bundling concern for deployment. The payoff is not worth it at this scale.

## Slide system

Slides are siblings inside `#deck`, all `position: absolute; inset: 0`. Only one is visible at a time.

**State machine (per slide):**

| Class | Meaning |
|---|---|
| *(none)* | Hidden, right-offset (`translateX(60px)`, `opacity: 0`) |
| `.active` | Visible, at rest (`translateX(0)`, `opacity: 1`) |
| `.out-left` | Exiting left (`translateX(-60px)`, `opacity: 0`) |

`out-left` is added to the departing slide, then removed after the 420ms transition completes. This prevents the departing slide from snapping back and re-obscuring the incoming one.

## JS navigation closure

The `<script>` block is a single IIFE. State is:

```
cur   — current slide index (0-based)
total — slide count (read from DOM on init)
```

Entry points:
- `window.go(d)` — exposed globally so the nav buttons can call `go(-1)` / `go(1)` inline
- `goTo(idx)` — internal; handles bounds checks, class transitions, render
- `render()` — updates progress bar, slide label, dot indicators, button disabled states
- Keyboard listener (`ArrowRight`/`ArrowDown` → next, `ArrowLeft`/`ArrowUp` → prev)
- Touch listener (touchstart / touchend, 44px threshold, horizontal bias)

## Deployment pipeline

```
git push → main
    └── GitHub Actions: azure-static-web-apps-gentle-forest-0098b6810.yml
            └── Azure/static-web-apps-deploy@v1
                    app_location: "/"
                    output_location: "."
                    → deploys index.html verbatim to Azure SWA CDN
```

PR branches get a **preview environment** automatically (provisioned by the same action on `pull_request` open/sync, torn down on close).

## External integrations

| Integration | Purpose |
|---|---|
| Azure Static Web Apps | Static hosting with CDN, preview environments per PR |
| GitHub Actions | CI/CD trigger on push to main and PR events |
| CodeLegion agent fleet | Picks up `agent-ready` issues from this repo and opens PRs |

The CodeLegion fleet itself is external (`github.com/AtaNdr/CodeLegion`). This repo is a **fleet target**, not fleet infrastructure.

## What looks odd but is intentional

**`submodules: true` in the checkout step** — the SWA GitHub Action template includes this by default. No submodules exist in this repo; the flag is harmless but unnecessary. It was left in to avoid diverging from the template unnecessarily.

**`output_location: "."`** — the entire repo root is the "build output." This works because there is no build step and `index.html` is at the root.

**`overflow: hidden` on `html, body`** — this is not an oversight. It prevents scroll on the presentation view. Slide content is intentionally fixed to viewport height; overflow within a slide is clipped.

## Architecture under stress

- **No `prefers-reduced-motion` handling.** The slide transitions run unconditionally. This is a known gap against `DESIGN_DEFAULTS.md`.
- **All content is hard-coded HTML.** Adding, reordering, or removing slides requires editing `index.html` directly. There is no data layer, CMS, or template system. This scales to roughly 20–30 slides before it becomes unwieldy.

## OPEN QUESTION: build system threshold

At what slide count (or content complexity) does it make sense to introduce a static site generator (e.g., 11ty, Astro) to split slides into separate files? The current single-file approach is fast and simple but creates merge-conflict surface as the fleet makes changes. No decision has been made.
