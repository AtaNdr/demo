# Lessons

> One- or two-line entries capturing things the fleet learned from rejected PRs or human corrections. Append-only. Keep terse.

Format: `- YYYY-MM-DD (#issue): lesson`

Examples:
- 2026-05-04 (#447): Don't add npm packages without flagging — use existing `utils/date.ts` instead of date-fns.
- 2026-05-06 (#451): Auth middleware runs before logging — don't assume `req.user` exists in logger.
- 2026-05-09 (#458): When changing API response shape, also update the OpenAPI schema in `docs/api/`.
- 2026-06-03 (#5): When adding auth to an Azure app, reviewer may want a self-configuring first-run setup flow — not just login. Multiple separate KV secrets for credentials may be rejected in favour of a single JSON secret keyed by username.
