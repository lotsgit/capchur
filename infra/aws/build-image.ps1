[CmdletBinding()]
param(
    [string]$Region = 'ap-south-1',
    [string]$BootstrapStackName = 'capchur-production-bootstrap',
    [string]$RepositoryName = 'capchur-production-web',
    [string]$ImageTag = ''
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$env:AWS_PAGER = ''

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    throw 'AWS CLI v2 is required.'
}
if (-not (Get-Command tar.exe -ErrorAction SilentlyContinue)) {
    throw 'Windows tar.exe is required to package the build source.'
}

if (-not $ImageTag) {
    $commit = git rev-parse --short=12 HEAD 2>$null
    $suffix = Get-Date -Format 'yyyyMMddHHmmss'
    $ImageTag = if ($commit) { "$commit-$suffix" } else { "manual-$suffix" }
}

Write-Host 'Creating or updating the remote image builder...'
aws cloudformation deploy `
    --stack-name $BootstrapStackName `
    --template-file infra/aws/bootstrap.yml `
    --parameter-overrides "RepositoryName=$RepositoryName" `
    --capabilities CAPABILITY_IAM `
    --region $Region `
    --no-fail-on-empty-changeset `
    --no-cli-pager | Out-Host

$outputs = aws cloudformation describe-stacks `
    --stack-name $BootstrapStackName `
    --query 'Stacks[0].Outputs' `
    --output json `
    --region $Region `
    --no-cli-pager | ConvertFrom-Json

function Get-StackOutput([string]$Key) {
    return ($outputs | Where-Object OutputKey -eq $Key).OutputValue
}

$buildProject = Get-StackOutput 'BuildProjectName'
$sourceBucket = Get-StackOutput 'BuildSourceBucketName'
$repositoryUri = Get-StackOutput 'RepositoryUri'
if (-not $buildProject -or -not $sourceBucket -or -not $repositoryUri) {
    throw 'The bootstrap stack did not return all remote-build outputs.'
}

$archive = Join-Path ([System.IO.Path]::GetTempPath()) "capchur-$ImageTag.zip"
try {
    if (Test-Path $archive) {
        Remove-Item $archive -Force
    }

    Write-Host 'Packaging source without local secrets or generated files...'
    $tarArguments = @(
        '-a', '-c', '-f', $archive,
        '--exclude=.git', '--exclude=.vscode', '--exclude=.data',
        '--exclude=node_modules', '--exclude=*/node_modules',
        '--exclude=.env', '--exclude=.env.*', '--exclude=*/.env', '--exclude=*/.env.*',
        '--exclude=*/.next', '--exclude=*/.wxt', '--exclude=*/.output',
        '--exclude=*/coverage', '--exclude=*/dist', '--exclude=*/out',
        '--exclude=*.log', '--exclude=*.tsbuildinfo',
        '.'
    )
    & tar.exe @tarArguments

    Write-Host "Uploading source to the private build bucket $sourceBucket..."
    aws s3 cp $archive "s3://$sourceBucket/source.zip" `
        --region $Region `
        --no-progress `
        --no-cli-pager | Out-Host

    Write-Host "Starting the AWS CodeBuild image build for tag $ImageTag..."
    $buildId = aws codebuild start-build `
        --project-name $buildProject `
        --environment-variables-override "name=IMAGE_TAG,value=$ImageTag,type=PLAINTEXT" `
        --query 'build.id' `
        --output text `
        --region $Region `
        --no-cli-pager
    if (-not $buildId -or $buildId -eq 'None') {
        throw 'CodeBuild did not return a build ID.'
    }

    do {
        [System.Threading.Thread]::Sleep(10000)
        $build = aws codebuild batch-get-builds `
            --ids $buildId `
            --query 'builds[0].{Status:buildStatus,LogUrl:logs.deepLink}' `
            --output json `
            --region $Region `
            --no-cli-pager | ConvertFrom-Json
        Write-Host "CodeBuild status: $($build.Status)"
    } while ($build.Status -in @('IN_PROGRESS'))

    if ($build.Status -ne 'SUCCEEDED') {
        throw "CodeBuild ended with status $($build.Status). Logs: $($build.LogUrl)"
    }

    Write-Output "${repositoryUri}:$ImageTag"
}
finally {
    Remove-Item $archive -Force -ErrorAction SilentlyContinue
}