# Capchur

Capchur is a browser workflow recorder and guide editor. The repository is a pnpm workspace containing a WXT browser extension, a Next.js web application, and shared TypeScript contracts.

## Prerequisites

- Node.js 22 or newer
- Git
- Chrome or Edge
- VS Code with the recommended workspace extensions

This Windows installation cannot create Corepack shims under `C:\Program Files\nodejs` without elevation, so repository commands use `corepack pnpm` explicitly.

## Install

```powershell
corepack pnpm install
```

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
corepack pnpm run typecheck
corepack pnpm run lint
corepack pnpm run build
```

## Structure

```text
apps/extension      WXT React browser extension
apps/web            Next.js guide editor
packages/contracts  Shared capture and API types
```
