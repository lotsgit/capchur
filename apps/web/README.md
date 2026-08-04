# Capchur Web

Run commands from the workspace root.

```powershell
corepack pnpm install
corepack pnpm run install:pdf-browser
$env:CAPCHUR_SIGNING_SECRET = node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
corepack pnpm run dev:web
```

Open http://localhost:3000. PDF export requires the installed Playwright Chromium runtime. Local development uses PGlite and filesystem object storage; production requires `DATABASE_URL`, `S3_BUCKET`, and standard AWS credentials.
