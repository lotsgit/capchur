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

AI description enhancement is disabled by default. Configure `CAPCHUR_AI_API_KEY` and `CAPCHUR_AI_MODEL` on the server to enable an OpenAI-compatible chat completions provider. `CAPCHUR_AI_ENDPOINT` defaults to OpenAI and must use HTTPS in production.

The editor requires workspace-owner opt-in for each browser editing session. The server sends only redacted step title, deterministic description, and optional section text, with a four-second default timeout and deterministic fallback. Configure `CAPCHUR_AI_REQUESTS_PER_MINUTE`, `CAPCHUR_AI_TIMEOUT_MS`, and the two `CAPCHUR_AI_*_COST_MICROS_PER_MILLION` values as needed. Usage records contain model, token counts, estimated cost, workspace, user, and timestamp, never prompt or guide content.
