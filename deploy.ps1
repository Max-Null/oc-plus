<#-----------------------------------------------------------------------------
       script: deploy.ps1
         desc: oc-plus V3.7 deploy wrapper — invokes Node.js deploy.mjs
              Node.js cross-platform script solves PowerShell 5.1 CJK encoding failures.
       version: V3.8 | 2026-07-21
     encoding: UTF-8 with BOM
  ------------------------------------------------------------------------------#>
param()

Set-Location $PSScriptRoot

Write-Host "oc-plus V3.8 deploy (wrapper)" -ForegroundColor Cyan
Write-Host "invoking deploy.mjs...`n"

node deploy.mjs
exit $LASTEXITCODE
