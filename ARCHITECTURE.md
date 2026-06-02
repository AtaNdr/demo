# Architecture

## What this repo is and why it's structured this way

CodeLegion's source code (the controller, VM provisioning, reconcile loop, GitHub App integration) lives in a separate private repo. **This repo** serves two roles:

1. **The fleet's working repository** — agents check out this repo, read the context files, and do their work here. The markdown files (CLAUDE.md, CONTEXT.md, DESIGN.md, etc.) are the "operating system" of the fleet.
2. **Host of the stakeholder briefing** (`index.html`) — a static slide deck deployed to Azure Static Web Apps.

Keeping the fleet contracts and the briefing in the same repo is intentional: any change to the agent working agreement goes through the same branch-protection and human-review process as any other change.

## The fleet's runtime architecture (as described in the briefing)

```
GitHub Issue (labeled agent-ready)
        │
        ▼
Azure Web App — Controller
  ├─ Reconcile loop: every 45 seconds
  ├─ Receives GitHub webhooks
  ├─ Maintains per-VM live state on disk
  └─ Holds GitHub App private key (never leaves the controller)
        │ spin up VM on demand
        ▼
Azure VM — Agent
  ├─ Clones this repo
  ├─ Reads fleet context files
  ├─ Runs Claude Code CLI (claude)
  ├─ Implements the issue, writes tests, opens PR
  └─ Self-deallocates after 10 idle minutes
        │ opens PR
        ▼
GitHub Pull Request
  └─ Human reviews and merges
```

### Why Azure VMs and not GitHub Actions runners?

GitHub Actions has a 6-hour job limit and harder process isolation. Agent tasks can run 5–30 minutes and need a persistent filesystem for the Claude Code working directory. Azure VMs give a predictable, isolated environment with no run-time limit.

### Why a single controller (not distributed)?

Simplicity. The controller runs as a single Azure Web App instance. This trades horizontal scale for operational clarity: no distributed coordination, no shared state store, no leader election. App Service auto-restart means recovery from crashes is automatic and fast (~45s to re-enter the reconcile loop).

OPEN QUESTION: If the fleet grows to handle dozens of concurrent issues, the single-instance design becomes a bottleneck. The roadmap explicitly marks "horizontal scaling" as out of scope by design — revisit if concurrency requirements grow.

### Why all state on disk?

No Key Vault and no database are required. Per-VM live state and 50-cycle reconcile history are stored as files on the Web App's persistent disk. This makes the system easier to deploy (~15 minutes from zero) and eliminates two external dependencies that could fail or require additional permissions.

### Label-driven dispatch

The controller reads GitHub issue labels to decide:
- **Whether to dispatch**: `agent-ready` must be present.
- **Which model tier**: `model:haiku` (trivial), `model:sonnet` (standard, default), `model:opus` (hard problems).
- **Fleet state signals**: `agent:blocked`, `agent:needs-revision`, `triage:proposed`, `agent:approved`, `agent:do-not-pick`.

This means the entire fleet is controlled through GitHub's label UI — no new portal, no new tooling.

### GitHub App auth

The controller mints short-lived GitHub installation tokens. Agents receive a token scoped to this repo; it expires quickly and is never persisted to disk on the VM. The private key stays on the controller. This limits blast radius if a VM is compromised.

## The briefing (`index.html`)

The slide deck is a single self-contained HTML file — CSS in `<style>`, JS in `<script>`, no external resources. Slides are `<div class="slide">` elements positioned absolutely; CSS transitions handle the animation. Navigation state (current slide index) lives in a closure.

Why no framework or bundler? The briefing is a stable artifact that will rarely change. The zero-dependency approach means it opens instantly in any browser, deploys trivially to Azure Static Web Apps, and has no supply chain surface.

## CI/CD

```
Push to main          → Azure Static Web Apps deploy action → production
Open PR against main  → Azure Static Web Apps deploy action → preview environment per PR
Close PR              → preview environment torn down
```

No build step. The `app_location: "/"` and `output_location: "."` in the workflow mean the root of the repo is served as-is.

## What's not in this repo

The controller source code, VM provisioning scripts, and GitHub App registration are in a separate private repo (`AtaNdr/CodeLegion` based on the briefing link). This repo is a consumer of that infrastructure, not its source.

OPEN QUESTION: Is `AtaNdr/CodeLegion` public or private? The briefing links `github.com/AtaNdr/CodeLegion` publicly. Agents should not assume access to that repo.
