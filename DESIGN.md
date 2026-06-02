# Design Contract

## What has UI

This repo has one UI artifact: `index.html` — an 11-slide stakeholder briefing presentation. It is a full-screen, keyboard/touch-navigable slide deck deployed as a static web app.

## Frameworks and libraries

None. The presentation is pure HTML/CSS/JS with no external dependencies. No component library, no CSS framework, no JS framework.

## Design tokens

All tokens are defined as CSS custom properties in `:root` inside `index.html`:

| Token | Value | Usage |
|---|---|---|
| `--gold` | `#C9A84C` | Primary accent: headings, borders, highlights, active states |
| `--bg` | `#0A0A0A` | Page background |
| `--card` | `#161616` | Card / surface background |
| `--card2` | `#1E1E1E` | Secondary card / alternate surface |
| `--border` | `#2E2E2E` | Subtle borders |
| `--border2` | `#3A3A3A` | Slightly more visible borders |
| `--silver` | `#888` | Secondary text, labels, subdued content |
| `--muted` | `#555` | Tertiary text, chart notes, footnotes |
| `--off` | `#D8D8D8` | Body text (not pure white — reduces glare on dark bg) |
| `--white` | `#FFFFFF` | Headings, high-emphasis text |
| `--red` | `#E03E3E` | Risk indicators only |
| `--nav-h` | `52px` | Navigation bar height |

**Typography:**
- Font stack: `'Segoe UI', Helvetica, Arial, sans-serif`
- Base font size: `15px`
- Base line-height: `1.5`
- Heading sizes: `28px` (standard), `52px` (large/title)

**Spacing:**
- Slide body padding: `28px 44px 24px`
- Section slab height: `40px`
- Card padding: `18px 20px`
- Gap between grid columns: `10px–24px` depending on context

## Patterns to preserve

**Slide structure:** Every slide follows this shell:
```html
<div class="slide [active]" id="sN">
  <div class="slab">Section Label</div>   <!-- optional; omit on title slide -->
  <div class="body">
    <div class="slide-title">Heading</div>
    <!-- content -->
  </div>
</div>
```

**Gold as the primary signal color.** Gold (`--gold`) marks things that are active, important, or highlighted. White marks secondary importance. Red is reserved strictly for risk/negative states. Do not repurpose these colors.

**Card accent borders signal hierarchy:**
- `.card.gold-top` / `.card.white-top` — horizontal emphasis (top border)
- `.card.gold-left` / `.card.white-left` / `.card.red-left` — vertical emphasis (left border)

**Navigation is always fixed to the bottom.** The `#nav` bar is `position: fixed; bottom: 0`. Do not move it or make it scrollable.

**Progress bar is at the top.** `#bar` is a 2px gold line at `top: 0`, `position: fixed`. It tracks slide progress.

**Slide animation.** Active slide: `opacity: 1; transform: translateX(0)`. Exiting slide: `opacity: 0; transform: translateX(-60px)`. Incoming slide starts at `translateX(60px)`. Transition: `0.4s cubic-bezier(0.4,0,0.2,1)`. Do not change the timing without checking `prefers-reduced-motion` (see below).

**Layout classes are composable:**
- `.cols.cols-2` / `.cols-3` / `.cols-4` — CSS grid with equal columns
- `.card` — the base surface; add modifier classes for accent borders
- `.big-stat` — centered stat card with `.big-num` and `.big-desc`
- `.blist` — gold-left-bordered bullet list
- `.flow` — horizontal pipeline diagram with `.fbox` and `.farr`

## Inconsistencies to resolve

1. **`prefers-reduced-motion` is not implemented.** The slide transition animation runs unconditionally. Per `DESIGN_DEFAULTS.md`, a no-motion fallback is required. Any PR touching animations must add this.

2. **Touch targets in the nav bar may be undersized.** The `.dot` elements are `5×5px` — far below the 44×44px minimum from `DESIGN_DEFAULTS.md`. The dots are clickable navigation controls. This needs a larger hit area (e.g., padding or a pseudo-element).

3. **No focus styles on `.dot` or `.nav-btn`.** The nav buttons (`←Prev`, `Next →`) and dot controls lack explicit `:focus-visible` styles. Keyboard navigation works (arrow keys navigate slides), but clicking a dot and then tabbing may lose focus visibility.

4. **No `alt` on any visual content.** The presentation has no images, so this is not currently a problem — but any future image additions need `alt` text.

5. **`overflow: hidden` on `body`.** This is intentional (slide deck semantics), but it means keyboard users cannot scroll. Since all content is within the slide viewport, this is acceptable — but verify nothing is clipped on very small screens.

## Proposed contract going forward

- **All color changes go through `:root` tokens.** Never hardcode hex values in new rules.
- **All new slides use the existing shell** (`.slab` + `.body` with `.slide-title`). Don't invent new slide structure.
- **All new layout uses the existing grid classes** (`.cols`, `.card`, etc.). Don't introduce new layout systems.
- **Any animation added must include a `prefers-reduced-motion` fallback** that disables or minimizes the motion.
- **Interactive elements must have `:focus-visible` styles** matching the gold accent (`outline: 2px solid var(--gold)`).
- **No external dependencies.** The zero-dependency constraint is load-bearing — the file must open offline in any browser.
- **No new CSS frameworks or JS libraries.** Extend what exists.

## Open questions for the human to resolve

1. Should the dot navigation controls be removed in favor of the arrow keys and Prev/Next buttons, or should they stay and get enlarged hit areas?
2. Is `prefers-reduced-motion` a fix to do now, or defer until the animation is otherwise changed?
3. Are there plans to add more slides, or is the 11-slide structure considered final?
