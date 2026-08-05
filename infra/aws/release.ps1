[CmdletBinding()]
param(
    [string]$Region = 'ap-south-1',
    [string]$ApplicationStackName = 'capchur-production',
    [string]$BootstrapStackName = 'capchur-production-bootstrap',
    [string]$ImageTag = '',
    [string]$RollbackImageUri = ''
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$env:AWS_PAGER = ''

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    throw 'AWS CLI v2 is required.'
}

if ($RollbackImageUri) {
    $imageUri = $RollbackImageUri
}
else {
    $imageUri = & "$PSScriptRoot/build-image.ps1" `
        -Region $Region `
        -BootstrapStackName $BootstrapStackName `
        -ImageTag $ImageTag
}

Write-Host "Deploying $imageUri..."
aws cloudformation deploy `
    --stack-name $ApplicationStackName `
    --template-file infra/aws/platform.yml `
    --parameter-overrides "ImageUri=$imageUri" `
    --capabilities CAPABILITY_IAM `
    --region $Region `
    --no-fail-on-empty-changeset `
    --no-cli-pager

Write-Host 'Current service details:'
$cluster = aws cloudformation describe-stacks --stack-name $ApplicationStackName --query "Stacks[0].Outputs[?OutputKey=='ClusterName'].OutputValue | [0]" --output text --region $Region --no-cli-pager
$service = aws cloudformation describe-stacks --stack-name $ApplicationStackName --query "Stacks[0].Outputs[?OutputKey=='ServiceName'].OutputValue | [0]" --output text --region $Region --no-cli-pager
aws ecs describe-services `
    --cluster $cluster `
    --services $service `
    --query 'services[0].{Status:status,Desired:desiredCount,Running:runningCount,Pending:pendingCount,TaskDefinition:taskDefinition}' `
    --output table `
    --region $Region `
    --no-cli-pager