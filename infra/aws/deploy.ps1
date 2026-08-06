[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z0-9.-]+$')]
    [string]$DomainName,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^Z[A-Z0-9]+$')]
    [string]$HostedZoneId,

    [string]$Region = 'ap-south-1',
    [string]$ApplicationStackName = 'capchur-production',
    [string]$BootstrapStackName = 'capchur-production-bootstrap',
    [string]$RepositoryName = 'capchur-production-web',
    [string]$NotificationEmail = '',
    [string]$ResetEmailSecretArn = '',
    [string]$EmailFrom = '',
    [string]$ChromeExtensionStoreUrl = '',
    [string]$FirefoxExtensionStoreUrl = '',
    [string]$ImageTag = ''
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$env:AWS_PAGER = ''

function Assert-Command([string]$Name, [string]$InstallHelp) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "$Name is required. $InstallHelp"
    }
}

Assert-Command 'aws' 'Install AWS CLI v2, then open a new PowerShell window.'

Write-Host 'Checking the active AWS identity...'
aws sts get-caller-identity --region $Region --no-cli-pager

Write-Host 'Building the production image remotely in AWS CodeBuild...'
$imageUri = & "$PSScriptRoot/build-image.ps1" `
    -Region $Region `
    -BootstrapStackName $BootstrapStackName `
    -RepositoryName $RepositoryName `
    -ImageTag $ImageTag

Write-Host 'Creating the production AWS platform. RDS can take 10-20 minutes...'
aws cloudformation deploy `
    --stack-name $ApplicationStackName `
    --template-file infra/aws/platform.yml `
    --parameter-overrides `
    "ApplicationName=$ApplicationStackName" `
    "DomainName=$DomainName" `
    "HostedZoneId=$HostedZoneId" `
    "NotificationEmail=$NotificationEmail" `
    "ResetEmailSecretArn=$ResetEmailSecretArn" `
    "EmailFrom=$EmailFrom" `
    "ChromeExtensionStoreUrl=$ChromeExtensionStoreUrl" `
    "FirefoxExtensionStoreUrl=$FirefoxExtensionStoreUrl" `
    "ImageUri=$imageUri" `
    --capabilities CAPABILITY_IAM `
    --region $Region `
    --no-fail-on-empty-changeset `
    --no-cli-pager

Write-Host 'Deployment outputs:'
aws cloudformation describe-stacks `
    --stack-name $ApplicationStackName `
    --query 'Stacks[0].Outputs[].{Name:OutputKey,Value:OutputValue}' `
    --output table `
    --region $Region `
    --no-cli-pager

Write-Host "Deployment requested for https://$DomainName"