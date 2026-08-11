[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    [Parameter(Mandatory)]
    [ValidatePattern('^[0-9]+\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com\/[a-zA-Z0-9._\/-]+:[a-zA-Z0-9._-]+$')]
    [string]$RollbackImageUri,
    [string]$Region = 'ap-south-1',
    [string]$ApplicationStackName = 'capchur-production'
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$env:AWS_PAGER = ''

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    throw 'AWS CLI v2 is required.'
}

function Get-StackValue {
    param(
        [Parameter(Mandatory)]
        [ValidateSet('Parameters', 'Outputs')]
        [string]$Collection,
        [Parameter(Mandatory)]
        [string]$Key
    )

    $keyName = if ($Collection -eq 'Parameters') { 'ParameterKey' } else { 'OutputKey' }
    $valueName = if ($Collection -eq 'Parameters') { 'ParameterValue' } else { 'OutputValue' }
    $query = "Stacks[0].$Collection[?$keyName=='$Key'].$valueName | [0]"
    $value = aws cloudformation describe-stacks `
        --stack-name $ApplicationStackName `
        --query $query `
        --output text `
        --region $Region `
        --no-cli-pager

    if (-not $value -or $value -eq 'None') {
        throw "CloudFormation stack '$ApplicationStackName' has no $Collection value for '$Key'."
    }

    return $value
}

function Wait-ServiceHealthy {
    param([Parameter(Mandatory)][string]$ExpectedImageUri)

    $cluster = Get-StackValue -Collection Outputs -Key 'ClusterName'
    $service = Get-StackValue -Collection Outputs -Key 'ServiceName'
    $applicationUrl = Get-StackValue -Collection Outputs -Key 'ApplicationUrl'

    aws ecs wait services-stable `
        --cluster $cluster `
        --services $service `
        --region $Region `
        --no-cli-pager

    $deployedImage = Get-StackValue -Collection Parameters -Key 'ImageUri'
    if ($deployedImage -ne $ExpectedImageUri) {
        throw "Expected image '$ExpectedImageUri', but CloudFormation reports '$deployedImage'."
    }

    $health = Invoke-RestMethod "$applicationUrl/api/health" -TimeoutSec 15
    if ($health.status -ne 'ok') {
        throw "Health endpoint returned unexpected status '$($health.status)'."
    }

    Write-Host "Verified $ExpectedImageUri at $applicationUrl."
}

$currentImageUri = Get-StackValue -Collection Parameters -Key 'ImageUri'
if ($currentImageUri -eq $RollbackImageUri) {
    throw 'RollbackImageUri must differ from the currently deployed image.'
}

$operation = "deploy '$RollbackImageUri', verify health, then restore '$currentImageUri'"
if (-not $PSCmdlet.ShouldProcess($ApplicationStackName, $operation)) {
    return
}

$rollbackVerified = $false
$restoreVerified = $false

try {
    & "$PSScriptRoot/release.ps1" `
        -Region $Region `
        -ApplicationStackName $ApplicationStackName `
        -RollbackImageUri $RollbackImageUri
    Wait-ServiceHealthy -ExpectedImageUri $RollbackImageUri
    $rollbackVerified = $true
}
finally {
    Write-Host "Restoring original image $currentImageUri..."
    & "$PSScriptRoot/release.ps1" `
        -Region $Region `
        -ApplicationStackName $ApplicationStackName `
        -RollbackImageUri $currentImageUri
    Wait-ServiceHealthy -ExpectedImageUri $currentImageUri
    $restoreVerified = $true
}

if (-not $rollbackVerified -or -not $restoreVerified) {
    throw 'Rollback rehearsal did not verify both the rollback and restoration deployments.'
}

Write-Host 'Rollback rehearsal passed: the prior image and restored current image both reached stable HTTPS health.'