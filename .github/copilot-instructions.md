# Capchur Project Instructions

## Global Development Reference

- Before planning or generating code, read `docs/DEVELOPMENT_PLAYBOOK.md`, especially **Current State**, **Architecture Rules**, and the active `NEXT` session.
- Implement only the active roadmap session unless the user explicitly changes scope. Explain prerequisites before working ahead of an incomplete dependency.
- Treat the playbook as the system-wide source of truth, not as optional documentation. Reconcile proposed changes with extension, web, shared-contract, persistence, export, privacy, and test impacts.
- When a session changes architecture, contracts, setup, commands, risk, or milestone status, update the playbook in the same change.
- Keep exactly one roadmap session marked `NEXT`. Mark a session `DONE` only after its acceptance criteria and required validation pass, and add its evidence to the completion record.

## Priorities

- Prefer correctness, security, maintainability, and clear ownership over speed or cleverness.
- Make the smallest complete change that solves the requested problem. Do not mix unrelated refactors into feature or bug-fix work.
- Inspect the owning code, nearby call sites, and relevant tests before changing behavior. Follow established repository patterns unless there is a concrete reason not to.
- State assumptions when requirements are ambiguous. Ask before making irreversible, destructive, or contract-breaking changes.

## Repository Boundaries

- This is a pnpm workspace. Run commands from the repository root with `corepack pnpm` and keep the existing package manager and lockfile.
- `apps/extension` owns browser capture, extension lifecycle, permissions, and browser APIs.
- `apps/web` owns the Next.js guide editor and server-side web concerns. Follow `apps/web/AGENTS.md` for current Next.js APIs and conventions.
- `packages/contracts` owns data exchanged between applications. Put shared wire types and cross-package contracts there, not application-specific implementation details.
- Keep dependencies directed toward shared packages. Do not import application code from another application or introduce circular package dependencies.
- Preserve public contracts unless the task explicitly requires a breaking change. When a shared contract changes, update every producer and consumer in the same change.

## Efficient Coding

- Search for an existing implementation, utility, component, or type before adding one.
- Keep functions and components focused. Extract an abstraction only when it removes meaningful duplication or clarifies a stable domain concept.
- Prefer TypeScript's type system and structured APIs over casts, untyped objects, or ad hoc string parsing.
- Avoid `any`, non-null assertions, ignored errors, placeholder branches, and speculative compatibility code. Narrow `unknown` values explicitly.
- Use descriptive names and straightforward control flow. Add comments only for decisions or constraints that code cannot express clearly.
- Avoid new dependencies when platform APIs or an existing dependency solve the problem cleanly. Add dependencies to the package that uses them, never to the workspace root by convenience.

## Safe Code

- Treat page content, DOM values, URLs, extension messages, storage, API responses, imported files, and user input as untrusted at their boundaries. Validate before use.
- Keep browser-extension permissions and host access to the minimum required. Do not broaden permissions without explaining the need.
- Never commit secrets, tokens, credentials, private keys, or sensitive captured content. Use environment variables and documented example values.
- Do not log authentication data, full captured payloads, private page content, or other sensitive information. Logs should be intentional and actionable.
- Avoid unsafe HTML injection and dynamic code execution. Do not use `dangerouslySetInnerHTML`, `eval`, or equivalent mechanisms unless the requirement is explicit and the input is sanitized with a proven approach.
- Enforce authorization and sensitive validation on trusted server-side boundaries; client-side checks are usability controls, not security controls.
- Handle failures explicitly. User-facing errors must be useful without exposing internals, while diagnostic errors should retain enough context for debugging.
- Do not weaken lint, type, build, or security settings to make a change pass.

## Professional Architecture

- Separate domain logic from React rendering, browser API adapters, persistence, transport, and framework lifecycle code.
- Keep data flow explicit. Prefer immutable updates and pure transformations for captured-step and guide data.
- Define contracts at system boundaries and map external data into internal models. Do not let transport or DOM-specific shapes spread through domain code.
- Keep client and server boundaries explicit in Next.js. Do not move secrets, privileged operations, or unnecessary code into client components.
- Design browser messaging as a versionable contract with validated message shapes and explicit error responses.
- Preserve accessibility and keyboard behavior in UI changes. Use semantic elements before adding ARIA.
- Account for loading, empty, error, permission-denied, and retry states in user-facing workflows where applicable.

## Change Discipline

- Preserve user changes and unrelated worktree modifications. Never revert or reformat unrelated files.
- Update documentation when setup, architecture, commands, permissions, environment variables, or public behavior changes.
- Add or update focused tests for bug fixes and behavior changes when a test framework exists. Test externally observable behavior rather than implementation details.
- Keep generated output, build artifacts, local environment files, and dependency directories out of source control.

## Validation

- Validate the narrowest affected package first, then run repository checks appropriate to the change.
- Before considering a code change complete, run:

```powershell
corepack pnpm run typecheck
corepack pnpm run lint
```

- Run `corepack pnpm run build` for cross-package changes, configuration changes, dependency changes, and release-facing work.
- For dependency changes, inspect install warnings and run `corepack pnpm audit --audit-level high`. Do not use forceful audit fixes without reviewing breaking changes.
- Report commands that were run and any validation that could not be completed.