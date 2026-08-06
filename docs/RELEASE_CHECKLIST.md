# Release Checklist

Release candidate: 0.1.0. Production origin: `https://capchur.io`.

## Automated Gates

Run from a clean checkout with Node 22+ and pnpm 11:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm run install:pdf-browser
corepack pnpm run install:extension-browsers
corepack pnpm run test
corepack pnpm run typecheck
corepack pnpm run lint
corepack pnpm run build
$env:WXT_WEB_ORIGIN = "https://capchur.io"
corepack pnpm run build:extension:browsers
corepack pnpm --filter @capchur/extension test:browser
corepack pnpm audit --audit-level high
corepack pnpm run verify:release
corepack pnpm run zip:extension:browsers
```

Start the production web build with release-equivalent non-production secrets and isolated data, then run:

```powershell
$env:CAPCHUR_WEB_URL = "http://127.0.0.1:3100"
corepack pnpm run test:release:web
```

The browser gate requires zero serious/critical Axe findings, no browser errors or horizontal overflow at 1440x900 and 390x844, a load under 4 seconds, and transferred resources under 2 MiB. The package gate requires the exact approved manifests, HTTPS production origin, no unreviewed dynamic execution, and each unpacked extension under 5 MiB.

## Manual Rehearsal

- [ ] Install the unpacked Chrome/Edge package and signed Firefox candidate in clean profiles.
- [ ] Verify the public home, extension installation links, Help, and mobile navigation.
- [ ] Create an account, show/hide the password, recover it by email, sign in, and change it from Settings.
- [ ] Confirm a new account opens an empty guide dashboard rather than fixture content.
- [ ] Connect the extension and verify denied permission and protected-page messaging.
- [ ] Record at least five actions across navigation; confirm values/passwords are absent and screenshots survive restart.
- [ ] Review locally, sync once after simulated offline use, edit/reorder/redact, and resolve one stale edit conflict.
- [ ] Verify private/workspace/revocable-link access and immediate revocation in a second profile.
- [ ] Export HTML, Markdown, PDF, and DOCX; inspect redactions and a 50-step PDF/DOCX guide.
- [ ] Confirm synced and manually created guides appear in the dashboard and PDF/DOCX controls are enabled after save.
- [ ] Delete the rehearsal guide/session and verify source and export objects are unavailable.
- [ ] Verify AI opt-in, redaction, timeout fallback, provider-off behavior, and usage-only logging.
- [ ] Confirm production TLS, private bucket policy, secret injection, alerts, backup freshness, and support/security/privacy mailboxes.
- [x] Complete an isolated backup restore and record recovery point and duration.
- [ ] Exercise the rollback procedure with the previous application image.
- [ ] Inspect both archives for secrets, source maps, development origins, and generated-only files.
- [ ] Record store validation results, package hashes, approver, date, and known-risk disposition below.

## Evidence

| Evidence                            | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit/integration/type/lint/build    | Passed 2026-08-04: 117 tests; typecheck, lint, and production builds passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| High/critical dependency audit      | Passed 2026-08-04: zero high/critical; one documented low development advisory                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Chromium/Edge/Firefox capture E2E   | Passed 2026-08-04 against release-origin production bundles                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Axe and performance budgets         | Passed 2026-08-04: desktop 1963 ms / 256725 bytes; mobile 884 ms / 256727 bytes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Package manifest/safety/size        | Passed 2026-08-04: Chrome 496707 bytes; Firefox 496929 bytes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| AWS production deployment           | Passed 2026-08-04 in `ap-south-1`: CloudFormation `CREATE_COMPLETE`; ECR image `2041aa65d33c-20260804185217`; ECS steady with one healthy ALB target; ACM issued for `capchur.io`; HTTPS health returned 200; RDS private/encrypted with 30-day backups and deletion protection; S3 private/versioned; daily AWS Backup plan, three `OK` alarms, and the confirmed `prashant@bizleader.in` SNS subscription verified.                                                                                                                                                                                                                                                                                                                                                                                                     |
| Backup restore rehearsal            | Passed 2026-08-05 in `ap-south-1`: restored post-canary RDS recovery point `arn:aws:rds:ap-south-1:416107214402:snapshot:awsbackup:job-de704120-957c-4b70-abf5-216a8ce6519d` and S3 recovery point `arn:aws:backup:ap-south-1:416107214402:recovery-point:capchur-production-objectbucket-3lxcjnnc-20260805055316-0562c038` into an isolated no-ingress environment. The validator confirmed the synthetic guide, one revision, object metadata, exact SHA-256, and cross-workspace isolation. Overall restore time was 9m44s, within the 4-hour RTO. The restored RDS instance, versioned bucket, validator, IAM roles, VPC, log group, synthetic guide/object, and temporary credential secret were removed. Two empty synthetic account/workspace records remain because the product has no account-deletion workflow. |
| Application rollback rehearsal      | Must be completed in the deployment environment before publication                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Store archive hashes and validation | Packages generated and locally verified; Chrome `6a74c9a927e58bd71fb1a99e5eb06cca0bbd5964123ae8ad43aec10b005de348`, Firefox `115817c83777113edaf38073ee5d99b3d82b14891f69de9106e915952c042aad`, sources `7c556e24d0f5f62a44746efe86fa9e708946b8406d9e132262a8fbf82e6e58fb`; store validation pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

Release is blocked by any unexplained high-risk finding, failed restore, missing rollback evidence, unexpected permission/origin, or incomplete privacy/store metadata.
