# Deploy Capchur To AWS

This guide deploys the Capchur web application to AWS. The browser extension is packaged separately after the web application is live.

## What This Creates

- An Application Load Balancer with an ACM TLS certificate and Route 53 aliases.
- An ECS Fargate task running the Node.js 22 application and Playwright Chromium.
- A private PostgreSQL RDS instance in database-only subnets.
- A private, encrypted, versioned S3 bucket for screenshots and exports.
- Generated database and authentication secrets in Secrets Manager.
- Daily AWS Backup recovery points retained for 30 days.
- CloudWatch logs and alarms, with optional SNS email delivery.
- An immutable, scan-on-push ECR image repository and temporary AWS CodeBuild image builder.

The stack creates billable resources even when no one uses the application. Review current AWS pricing for Application Load Balancer, ECS Fargate, RDS PostgreSQL, AWS Backup, S3, public IPv4 addresses, and CodeBuild build minutes. Create an AWS Budget before deployment.

## 1. Secure The AWS Account

Do not deploy using root access keys.

1. Enable MFA on the AWS root user.
2. Use IAM Identity Center or a dedicated administrator identity with MFA for initial provisioning.
3. Open **Billing and Cost Management > Budgets** and create a monthly cost budget with email alerts.
4. Keep the production resources in one AWS region. The examples below use Mumbai, `ap-south-1`.

The deployment identity needs permission to manage CloudFormation, ECR, ECS, EC2 networking, load balancers, RDS, S3, Secrets Manager, IAM roles, CloudWatch, SNS, AWS Backup, ACM, and Route 53. After provisioning, remove broad administrator access and retain only the access needed for releases and operations.

## 2. Install Local Tools

Install these on Windows:

- AWS CLI v2: <https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html>
- Git: <https://git-scm.com/download/win>

Docker Desktop is not required. AWS CodeBuild builds the Linux container remotely. Open a new PowerShell terminal at the repository root and verify the local tools:

```powershell
aws --version
git --version
```

Configure the AWS CLI using the sign-in method selected by the account administrator. For IAM Identity Center:

```powershell
aws configure sso
aws sso login
aws sts get-caller-identity
```

Read the account and ARN printed by the final command. Stop if they are not the intended production account and identity.

## 3. Find The Route 53 Hosted Zone

Set the domain and region for this terminal. The release checklist currently uses `capchur.io`:

```powershell
$domainName = "capchur.io"
$region = "ap-south-1"
$hostedZoneId = (aws route53 list-hosted-zones-by-name `
  --dns-name $domainName `
  --query "HostedZones[?Name=='$domainName.'].Id | [0]" `
  --output text `
  --no-cli-pager).Split('/')[-1]
$hostedZoneId
```

The result must begin with `Z`. If it prints `None`, open Route 53 in the AWS Console, select **Hosted zones**, open the public hosted zone that contains the domain, and copy its **Hosted zone ID**.

The hosted zone must be in the same AWS account used by the deployment. CloudFormation uses it to validate the certificate and create domain records automatically.

## 4. Run The First Deployment

Supply an email address to receive alarms:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
./infra/aws/deploy.ps1 `
  -DomainName $domainName `
  -HostedZoneId $hostedZoneId `
  -Region $region `
  -NotificationEmail "operations@example.com"
```

The script shows the active AWS identity, packages the workspace without Git metadata, local environment files, dependencies, or generated output, uploads that archive to a private seven-day S3 build bucket, and asks CodeBuild to build and push the Linux image. It then creates the production stack and prints the application URL and operational resource names.

The first remote image build commonly takes 10-20 minutes because Chromium and its Linux dependencies must be installed. The script prints CodeBuild status until completion and returns a CloudWatch log link if the build fails.

RDS and ACM commonly make the first deployment take 15-30 minutes. Keep the terminal open. If CloudFormation fails, open **CloudFormation > Stacks > capchur-production > Events** and inspect the first failed resource.

AWS sends an SNS confirmation message when `NotificationEmail` is supplied. Open it and choose **Confirm subscription** or alarms will not reach that address.

## 5. Verify The Deployment

Wait for the ECS service to report one running task, then check the public health endpoint:

```powershell
Invoke-RestMethod "https://$domainName/api/health"
```

The response must contain `status` with the value `ok`. Open `https://capchur.io`, create a rehearsal account, and verify sign-in, guide creation, screenshot upload, and PDF export. The first database-backed request applies forward-only Drizzle migrations.

To inspect service logs:

```powershell
$logGroup = aws cloudformation describe-stacks `
  --stack-name capchur-production `
  --query "Stacks[0].Outputs[?OutputKey=='LogGroupName'].OutputValue | [0]" `
  --output text `
  --region $region `
  --no-cli-pager
aws logs tail $logGroup --since 30m --region $region --no-cli-pager
```

Logs must not contain passwords, extension credentials, share tokens, screenshots, prompts, or captured page content.

## 6. Build The Production Extension

After HTTPS is working, build extension packages against the deployed origin:

```powershell
$env:WXT_WEB_ORIGIN = "https://$domainName"
corepack pnpm run build:extension:browsers
corepack pnpm run verify:release
corepack pnpm run zip:extension:browsers
```

Do not publish extension packages that still contain `localhost` as their web origin.

## 7. Release A New Version

Run repository checks, then build and deploy a new immutable image:

```powershell
corepack pnpm run test
corepack pnpm run typecheck
corepack pnpm run lint
corepack pnpm run build
./infra/aws/release.ps1 -Region $region
```

ECS deployment circuit breaking automatically returns to the previous task definition when new tasks cannot become healthy. Database migrations are forward-only, so application changes must remain compatible with the previous release during rollout.

## 8. Roll Back The Application

List retained images and choose the previously verified image tag:

```powershell
$repositoryUri = aws cloudformation describe-stacks `
  --stack-name capchur-production-bootstrap `
  --query "Stacks[0].Outputs[?OutputKey=='RepositoryUri'].OutputValue | [0]" `
  --output text `
  --region $region `
  --no-cli-pager
aws ecr describe-images `
  --repository-name capchur-production-web `
  --query "sort_by(imageDetails,&imagePushedAt)[].{Pushed:imagePushedAt,Tags:imageTags}" `
  --output table `
  --region $region `
  --no-cli-pager
```

Deploy that exact image without rebuilding it:

```powershell
./infra/aws/release.ps1 `
  -Region $region `
  -RollbackImageUri "$repositoryUri:PREVIOUS_TAG"
```

Do not reverse a database migration during application rollback. Follow [OPERATIONS_RUNBOOK.md](OPERATIONS_RUNBOOK.md) if incompatible data was written.

## 9. Rehearse Backup Restore

After the first daily backup completes:

1. Open **AWS Backup > Backup vaults > capchur-ap-south-1-416107214402**.
2. Restore the latest RDS recovery point to a new, isolated database identifier.
3. Restore the matching S3 recovery point to a new, private rehearsal bucket.
4. Run the matching image in an isolated non-production stack with AI disabled.
5. Verify one guide, its screenshots, a revision, workspace isolation, and object checksums.
6. Delete rehearsal resources and record the recovery point, duration, and result in [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md).

Do not connect the restore environment to the production domain or exercise live share links and credentials.

## Security Notes

- RDS has no public address and accepts PostgreSQL traffic only from ECS.
- ECS tasks receive public addresses for outbound access, but inbound traffic is restricted to the load balancer.
- S3 Block Public Access is enabled. Browser transfers use five-minute signed URLs.
- S3 CORS permits multiple browser-extension origins because Chromium IDs and Firefox origins differ by installation. CORS does not grant object access; every request still requires a valid signed URL.
- RDS deletion protection and retained data resources reduce accidental deletion risk.
- Store any optional AI API key in Secrets Manager and add it to the ECS task definition. Never place it in source or extension configuration.

## Cleanup Warning

Deleting the application stack is intentionally not a complete teardown. RDS deletion protection blocks accidental deletion, while the database secret, authentication secret, S3 bucket, log group, backup vault, and snapshots are retained. These resources continue to incur charges. A production operator must export required evidence, disable RDS deletion protection deliberately, archive retained data according to policy, and then remove each retained resource explicitly.
