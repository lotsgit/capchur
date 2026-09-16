# Capchur Web

Run commands from the workspace root.

```powershell
corepack pnpm install
corepack pnpm run install:pdf-browser
$env:CAPCHUR_SIGNING_SECRET = node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
corepack pnpm run dev:web
```

Open http://localhost:3000. PDF export requires the installed Playwright Chromium runtime. Local development uses PGlite and filesystem object storage; production requires `DATABASE_URL`, `S3_BUCKET`, and standard AWS credentials.

## Optional AI Descriptions

AI description enhancement is disabled by default. Configure `CAPCHUR_AI_API_KEY` and `CAPCHUR_AI_MODEL` on the server to enable an OpenAI-compatible chat completions provider. `CAPCHUR_AI_ENDPOINT` defaults to OpenRouter and must use HTTPS in production.

The editor requires workspace-owner opt-in for each browser editing session. The server sends only redacted step title, deterministic description, and optional section text, with a four-second default timeout and deterministic fallback. Configure `CAPCHUR_AI_REQUESTS_PER_MINUTE`, `CAPCHUR_AI_TIMEOUT_MS`, and the two `CAPCHUR_AI_*_COST_MICROS_PER_MILLION` values as needed. Usage records contain model, token counts, estimated cost, workspace, user, and timestamp, never prompt or guide content.

## AI Guide Notes

AI notes (a per-step "Notes" supporting-detail field, generated only when useful, and an AI-drafted
guide introduction) are active by default for any authenticated member. Each account chooses, in a
one-time dialog (or later in Settings), whether processing runs:

- **Online** - the same server-side provider as AI descriptions (`CAPCHUR_AI_API_KEY`/`CAPCHUR_AI_MODEL`),
  defaulting to OpenRouter's free `:free` models. `CAPCHUR_AI_MODEL` accepts an ordered, comma-separated
  fallback list; a 429 from the current model tries the next one automatically. A separate
  `CAPCHUR_AI_REQUESTS_PER_DAY` cap (default 200) applies alongside the per-minute limit.
- **Local** - entirely in the browser, with no network request and no server involvement. Chrome's
  on-device Prompt API is used when available; otherwise WebLLM (`@mlc-ai/web-llm`) runs a small
  open model over WebGPU, downloading model weights once and caching them. Screenshots are never
  sent to any AI provider in either mode - only step title, description, and section text.

Both modes reuse the same redaction, prompts, and structured-output validation from
`packages/ai-notes-core`, and fall back to the existing text/introduction unchanged on any failure.

