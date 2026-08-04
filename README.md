# Capchur

Capchur is a browser workflow recorder and guide editor. The repository is a pnpm workspace containing a WXT browser extension, a Next.js web application, and shared TypeScript contracts.

## Development Roadmap

Use [docs/DEVELOPMENT_PLAYBOOK.md](docs/DEVELOPMENT_PLAYBOOK.md) as the global reference for architecture, beginner-friendly commands, session sequencing, acceptance criteria, decisions, risks, and progress. Read it before starting a new coding session.

## Prerequisites

- Node.js 22 or newer
- Git
- Chrome or Edge
- VS Code with the recommended workspace extensions

This Windows installation cannot create Corepack shims under `C:\Program Files\nodejs` without elevation, so repository commands use `corepack pnpm` explicitly.

## Install

```powershell
corepack pnpm install
corepack pnpm run install:pdf-browser
```

Set `CAPCHUR_SIGNING_SECRET` to at least 32 characters for local storage-backed APIs. Production also requires `DATABASE_URL`, `S3_BUCKET`, and standard AWS credentials.

## Develop

Run either command from the repository root:

```powershell
corepack pnpm run dev:web
corepack pnpm run dev:extension
```

WXT opens a browser profile with the development extension loaded. The web editor is available at http://localhost:3000.

In VS Code, use **Terminal > Run Task** and select `Capchur: Web dev` or `Capchur: Extension dev`.

## Validate

```powershell
corepack pnpm run test
corepack pnpm run typecheck
corepack pnpm run lint
corepack pnpm run build
```

Production release evidence, environment requirements, browser packages, accessibility and
performance budgets, backup rehearsal, and rollback sign-off are in
[docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md). Security and privacy operations are
defined in [docs/SECURITY_THREAT_MODEL.md](docs/SECURITY_THREAT_MODEL.md),
[docs/OPERATIONS_RUNBOOK.md](docs/OPERATIONS_RUNBOOK.md), and
[docs/PRIVACY_POLICY.md](docs/PRIVACY_POLICY.md).

## Structure

```text
apps/extension      WXT React browser extension
apps/web            Next.js guide editor
packages/contracts  Shared capture and API types
```
