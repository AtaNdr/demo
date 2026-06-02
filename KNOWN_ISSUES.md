# Known Issues

> Things that look broken but aren't. Save agents from "fixing" them.

- `body { overflow: hidden }` in `index.html` is intentional. The slide deck fills the full viewport and suppresses scroll by design. Don't remove it to "fix" scrolling — the layout relies on it.

- `.dot` nav elements are 5×5 px — far below the 44×44 px touch target floor in `DESIGN_DEFAULTS.md`. This is a known inconsistency documented in `DESIGN.md` as an open question (#2 in that file). Don't enlarge them ad hoc; wait for the human to make the call.

- Slide elements use `position: absolute; inset: 0` and stack in the DOM. This is intentional: CSS transitions animate slides in/out without reflow. It is not a layout bug or an accessibility oversight — keyboard navigation (arrow keys) is wired in the `<script>`.

- The `@AtaNdr/maintainers` handle in `.github/CODEOWNERS` is a placeholder. It is noted in the CODEOWNERS file itself with setup instructions. Do not try to resolve or update it — that is a human-only decision and the file is in DO_NOT_TOUCH.

- The Azure Static Web Apps subdomain `gentle-forest-0098b6810` is auto-assigned by Azure. It is not configurable without migrating to a different resource. Don't flag it as wrong.
