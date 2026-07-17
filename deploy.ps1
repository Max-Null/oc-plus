<#-----------------------------------------------------------------------------
   脚本: deploy.ps1
   说明: 部署 oc-plus V3.3 agent 定义、命令和记忆管家 Plugin 到 opencode 配置目录
   版本: V3.4 | 2026-07-17
   编码: UTF-8 with BOM
------------------------------------------------------------------------------#>
param()

Set-Location $PSScriptRoot
$OC = "$env:USERPROFILE\.config\opencode"

# 当前活跃的 agent 文件
$deployments = @(
    @{ Source = ".\双星系统\agents\双星.md";   TargetDir = "$OC\agents" },
    @{ Source = ".\双星系统\agents\工匠.md";   TargetDir = "$OC\agents" },
    @{ Source = ".\双星系统\agents\参谋.md";   TargetDir = "$OC\agents" },
    @{ Source = ".\双星系统\agents\军师.md";   TargetDir = "$OC\agents" },
    @{ Source = ".\记忆管家\agents\助理.md";    TargetDir = "$OC\agents" },
    @{ Source = ".\记忆管家\memories.ts";       TargetDir = "$OC\plugins" },
    @{ Source = ".\记忆管家\prompts.ts";       TargetDir = "$OC\plugins" },
    @{ Source = ".\记忆管家\scripts\memories-cli.mjs"; TargetDir = "$OC\scripts" }
)

# 命令文件
$commandSource = ".\双星系统\commands\*.md"
$commandTargetDir = "$OC\commands"

# 记忆存储子目录
$memoryDirs = @("$OC\memories\blocks", "$OC\memories\triggers")

$deployed = @()
$skipped = @()
$failed = @()

Write-Host "===== oc-plus V3.3 部署 =====" -ForegroundColor Cyan
Write-Host "目标: $OC`n"

# [1/4] 创建目标目录
Write-Host "[1/4] 创建目录..." -ForegroundColor Yellow
$requiredDirs = @("$OC\agents", "$OC\commands", "$OC\plugins", "$OC\scripts") + $memoryDirs
foreach ($dir in $requiredDirs) {
    if (-not (Test-Path -LiteralPath $dir)) {
        try { New-Item -ItemType Directory -Path $dir -Force | Out-Null; Write-Host "  + $dir" }
        catch { Write-Host "  x $dir - $_" -ForegroundColor Red; $failed += $dir }
    } else { Write-Host "  . $dir" }
}

# [2/4] 部署 agent + plugin
Write-Host "`n[2/4] 部署 agent & plugin..." -ForegroundColor Yellow
foreach ($item in $deployments) {
    if (-not (Test-Path -LiteralPath $item.Source)) {
        Write-Host "  x 源文件不存在: $($item.Source)" -ForegroundColor Red; $skipped += $item.Source; continue
    }
    try { Copy-Item -LiteralPath $item.Source -Destination $item.TargetDir -Force; Write-Host "  V $($item.Source)"; $deployed += $item.Source }
    catch { Write-Host "  x $($item.Source) - $_" -ForegroundColor Red; $failed += $item.Source }
}

# [3/4] 部署命令
Write-Host "`n[3/4] 部署命令..." -ForegroundColor Yellow
$commandFiles = Get-ChildItem -Path $commandSource -ErrorAction SilentlyContinue
if ($commandFiles.Count -gt 0) {
    foreach ($cmdFile in $commandFiles) {
        try { Copy-Item -LiteralPath $cmdFile.FullName -Destination $commandTargetDir -Force; Write-Host "  V $($cmdFile.Name)"; $deployed += $cmdFile.FullName }
        catch { Write-Host "  x $($cmdFile.Name) - $_" -ForegroundColor Red; $failed += $cmdFile.FullName }
    }
} else { Write-Host "  . 无匹配命令" -ForegroundColor DarkGray }

# [4/4] 记忆目录
Write-Host "`n[4/4] 记忆目录..." -ForegroundColor Yellow
foreach ($dir in $memoryDirs) {
    if (-not (Test-Path -LiteralPath $dir)) {
        try { New-Item -ItemType Directory -Path $dir -Force | Out-Null; Write-Host "  + $dir"; $deployed += $dir }
        catch { Write-Host "  x $dir - $_" -ForegroundColor Red; $failed += $dir }
    } else { Write-Host "  . $dir" }
}

# 摘要
Write-Host "`n===== 部署完成 =====" -ForegroundColor Cyan
Write-Host "  成功: $($deployed.Count) | 跳过: $($skipped.Count) | 失败: $($failed.Count)"
if ($skipped.Count -gt 0) { foreach ($s in $skipped) { Write-Host "    跳过: $s" -ForegroundColor Yellow } }
if ($failed.Count -gt 0) { foreach ($f in $failed) { Write-Host "    失败: $f" -ForegroundColor Red } }
Write-Host "`n确保 opencode.json 中 plugin 数组包含 `"memories`"，然后重启 opencode。" -ForegroundColor Cyan
