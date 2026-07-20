<#-----------------------------------------------------------------------------
       script: deploy.ps1（部署脚本包装器，版本号仅标识脚本自身迭代）
       version: V3.9 | 2026-07-21
     encoding: UTF-8 with BOM
  ------------------------------------------------------------------------------#>
param()

Set-Location $PSScriptRoot

Write-Host "oc-plus deploy (wrapper) V3.9" -ForegroundColor Cyan
Write-Host "invoking deploy.mjs...`n"

node deploy.mjs
exit $LASTEXITCODE
