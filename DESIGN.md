# Design Contract

## Framework and approach

Pure HTML + CSS + vanilla JavaScript. No UI framework, no component library, no external CSS. The entire stylesheet is embedded in `index.html`'s `<style>` block.

## Design tokens (CSS custom properties)

All values are defined in `:root` in `index.html`. Never hard-code these values in rules or inline styles — always use the variable.

### Colors

| Variable | Value | Role |
|---|---|---|
| `--gold` | `#C9A84C` | Primary accent — headings, active dots, borders, bar |
| `--bg` | `#0A0A0A` | Page / slide background |
| `--card` | `#161616` | Card surface |
| `--card2` | `#1E1E1E` | Secondary card surface (note bars, table headers) |
| `--border` | `#2E2E2E` | Standard border |
| `--border2` | `#3A3A3A` | Stronger border (nav bar buttons, inactive bar rects) |
| `--silver` | `#888` | Secondary / supporting text |
| `--muted` | `#555` | Tertiary / disabled text (footnotes, chart notes) |
| `--off` | `#D8D8D8` | Primary body text |
| `--white` | `#FFFFFF` | Emphasis text, high-contrast headings |
| `--red` | `#E03E3E` | Risk / danger accent (risk rows) |
| `--nav-h` | `52px` | Fixed nav bar height — used in layout calculations |

### Typography

| Role | Size | Weight | Color | Notes |
|---|---|---|---|---|
| Hero title | 52px | 700 | `--white` | `.slide-title.lg` |
| Slide title | 28px | 700 | `--white` | `.slide-title` |
| Card title | 15px | 700 | `--white` | `.crit-title`, `.cap-title`, etc. |
| Body text | 14–15px | 400 | `--off` | `.blist li`, `.ctable td`, etc. |
| Secondary text | 13px | 400 | `--silver` | `.crit-body`, `.fs2`, etc. |
| Label / caps | 10–11px | 700 | `--gold` | `.slab`, `.label`, `.sec-label` |
| Footnote | 11–12px | 400 | `--muted` | chart notes, bottom disclaimers |
| Big stat | 58px | 700 | `--gold` or `--white` | `.big-num` |
| Perf stat | 28px | 700 | `--gold` or `--white` | `.perf-val` |
| Pill value | 22px | 700 | `--white` | `.pill-val` |

Font stack: `'Segoe UI', Helvetica, Arial, sans-serif` (system fonts only — no web font loaded).

### Spacing

No formal spacing scale is defined as tokens. Padding and gap values are set per-component in the stylesheet. Common values in use: 8px, 10px, 12px, 14px, 16px, 18px, 20px, 22px, 24px, 28px, 44px.

## Layout system

- CSS Grid for multi-column layouts (`.cols-2`, `.cols-3`, `.cols-4`, `.crit-grid`, `.cap-grid`, `.perf-row`)
- Flexbox for single-axis alignment and stacking (`.col`, `.body`, `.flow`, `.blist`)
- No external grid framework

## Component inventory

| Component | Class | Description |
|---|---|---|
| Slide | `.slide` | Full-screen panel; one active at a time |
| Section label bar | `.slab` | 40px top bar with uppercase gold label |
| Slide body | `.body` | Flex column, padded content area |
| Card | `.card` | Dark surface with optional accent modifier |
| Card modifiers | `.gold-top`, `.white-top`, `.gold-left`, `.white-left`, `.red-left` | Colored top/left border |
| Two-column grid | `.cols.cols-2` | Equal-width 2-col grid |
| Bullet list | `.blist` | Styled list with left gold border on items |
| Note bar | `.note` | Italic footnote block with gold left border |
| Big stat | `.big-stat` + `.big-num` | Centered large metric |
| Pill | `.pill` | Stat tile with gold top border |
| Flow diagram | `.flow` + `.fbox` + `.farr` | Horizontal process flow |
| Feature card | `.feat-card` | 4-col grid of feature tiles |
| Capability column | `.cap-col` | 3-col layout for grouped lists |
| Performance card | `.perf-card` | 4-col grid of metric tiles |
| Risk row | `.risk-row` + `.risk-cell` + `.mit-cell` | Red risk / gold mitigation row |
| Compare table | `.ctable` | Dark-themed comparison table |
| Bar chart | `.bar-chart` + `.bar-col` | Inline vertical bar chart |
| Roadmap grid | `.road-grid` + `.road-col` | 2-col roadmap layout |
| Summary grid | `.summary-grid` | 2-col summary + ask layout |
| Nav bar | `#nav` + `.nav-btn` + `.dot` | Fixed bottom navigation |
| Progress bar | `#bar` | 2px gold strip at top, width = progress % |

## Patterns to preserve

1. **Token-only colors.** All color values come from CSS variables. No hex literals in rules or inline styles.
2. **Accent via modifier class.** Card accents (top/left borders) are applied by adding a modifier class (`.gold-top`, `.red-left`, etc.) to `.card` — never with inline `style=""`.
3. **Section label anatomy.** Every slide with a label uses `.slab` at the top of the slide, containing uppercase text only. Do not put icons, buttons, or non-text content in `.slab`.
4. **No-scroll constraint.** Slides must not scroll. All content must fit in `calc(100vh - 52px)`. If a slide needs more space, redesign its layout — do not remove `overflow: hidden`.
5. **Big stat centering.** `.big-stat` uses flexbox centering — do not change this to absolute positioning or text-align tricks.
6. **Dot navigation.** Dots are rendered dynamically from JS — do not add `.dot` elements to HTML directly.

## Known inconsistencies (do not propagate)

- **Inline `style=""` for layout.** Several slides use `style="flex:1;min-height:0;"` etc. for one-off tweaks. New slides should use utility classes instead.
- **No `prefers-reduced-motion` support.** Slide transitions run unconditionally. This violates `DESIGN_DEFAULTS.md`. A fix is pending.
- **Dot nav touch targets are 5×5px.** Far below the 44×44px minimum in `DESIGN_DEFAULTS.md`. This is a known gap.

## Proposed contract (going forward)

- All new slides use the `.slide` > `.slab` > `.body` skeleton exactly.
- All new CSS custom properties are added to `:root` before use.
- No new external fonts or CSS frameworks without explicit human approval.
- No inline `style=""` for layout — add a named utility class and document it here.
- Every PR that touches `index.html` must be visually checked at 1280×800 (standard laptop) and 1920×1080 (wide monitor).
- Animations must respect `prefers-reduced-motion` — any new animation added must include a `@media (prefers-reduced-motion: reduce)` override that removes or stills it.

## Open questions for humans

1. **Dot nav hit targets (5×5px).** This is a clear accessibility violation. Should agents fix it (e.g., add a transparent hit-area overlay), or does it require a design decision first?
2. **`prefers-reduced-motion`.** Should a fix be bundled into the next content change, or tracked as a standalone issue?
3. **Inline styles.** Should existing inline `style=""` uses be cleaned up in a dedicated refactor issue, or left until a slide is touched for other reasons?
