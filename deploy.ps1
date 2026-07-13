<#-----------------------------------------------------------------------------
  脚本: deploy.ps1
  说明: 部署 oc-plus 的 agent 定义、命令和记忆管家 Plugin 到 opencode 全局配置目录
  编码: UTF-8 with BOM（确保 PowerShell 5.x 兼容中文路径）
-----------------------------------------------------------------------------#>
param()

# 定位到脚本所在目录（确保相对路径正确）
Set-Location $PSScriptRoot

# opencode 全局配置目录
$OC = "$env:USERPROFILE\.config\opencode"

# 部署文件映射：源文件 → 目标目录
$deployments = @(
    @{ Source = ".\双星系统\agents\左脑.md";      TargetDir = "$OC\agents" },
    @{ Source = ".\双星系统\agents\右脑.md";      TargetDir = "$OC\agents" },
    @{ Source = ".\双星系统\agents\双星.md";      TargetDir = "$OC\agents" },
    @{ Source = ".\双星系统\agents\构建执行器.md"; TargetDir = "$OC\agents" },
    @{ Source = ".\记忆管家\agents\助理.md";       TargetDir = "$OC\agents" },
    @{ Source = ".\记忆管家\memories.ts";          TargetDir = "$OC\plugins" }
)

# 命令文件通配符部署
$commandSource = ".\双星系统\commands\*.md"
$commandTargetDir = "$OC\commands"

# 记忆存储子目录
$memoryDirs = @("$OC\memories\blocks", "$OC\memories\triggers")

# 部署结果收集
$deployed = @()
$skipped = @()
$failed = @()

Write-Host "===== oc-plus 部署脚本 =====" -ForegroundColor Cyan
Write-Host "目标目录: $OC`n"

# --- 1. 创建目标目录 ---
Write-Host "[1/4] 创建目标目录..." -ForegroundColor Yellow

# 创建 agents / commands / plugins 目录
$requiredDirs = @("$OC\agents", "$OC\commands", "$OC\plugins") + $memoryDirs
foreach ($dir in $requiredDirs) {
    if (-not (Test-Path -LiteralPath $dir)) {
        try {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
            Write-Host "  + 已创建: $dir"
        }
        catch {
            Write-Host "  ✗ 创建失败: $dir — $_" -ForegroundColor Red
            $failed += $dir
        }
    }
    else {
        Write-Host "  · 已存在: $dir"
    }
}

# --- 2. 部署 agent 定义 + plugin ---
Write-Host "`n[2/4] 部署 agent 定义 & plugin..." -ForegroundColor Yellow

foreach ($item in $deployments) {
    if (-not (Test-Path -LiteralPath $item.Source)) {
        Write-Host "  ✗ 源文件不存在，跳过: $($item.Source)" -ForegroundColor Red
        $skipped += $item.Source
        continue
    }

    try {
        Copy-Item -LiteralPath $item.Source -Destination $item.TargetDir -Force
        Write-Host "  ✓ 已部署: $($item.Source) → $($item.TargetDir)"
        $deployed += $item.Source
    }
    catch {
        Write-Host "  ✗ 部署失败: $($item.Source) — $_" -ForegroundColor Red
        $failed += $item.Source
    }
}

# --- 3. 部署命令文件 ---
Write-Host "`n[3/4] 部署命令文件..." -ForegroundColor Yellow

# 检查是否有匹配的命令文件
$commandFiles = Get-ChildItem -Path $commandSource -ErrorAction SilentlyContinue
if ($commandFiles.Count -gt 0) {
    foreach ($cmdFile in $commandFiles) {
        try {
            Copy-Item -LiteralPath $cmdFile.FullName -Destination $commandTargetDir -Force
            Write-Host "  ✓ 已部署: $($cmdFile.Name) → $commandTargetDir"
            $deployed += $cmdFile.FullName
        }
        catch {
            Write-Host "  ✗ 部署失败: $($cmdFile.FullName) — $_" -ForegroundColor Red
            $failed += $cmdFile.FullName
        }
    }
}
else {
    Write-Host "  · 无匹配命令文件 ($commandSource)" -ForegroundColor DarkGray
}

# --- 4. 创建记忆存储目录 ---
Write-Host "`n[4/4] 创建记忆存储目录..." -ForegroundColor Yellow

foreach ($dir in $memoryDirs) {
    if (-not (Test-Path -LiteralPath $dir)) {
        try {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
            Write-Host "  + 已创建: $dir"
            $deployed += $dir
        }
        catch {
            Write-Host "  ✗ 创建失败: $dir — $_" -ForegroundColor Red
            $failed += $dir
        }
    }
    else {
        Write-Host "  · 已存在: $dir"
    }
}

# --- 部署摘要 ---
Write-Host "`n===== 部署摘要 =====" -ForegroundColor Cyan
Write-Host "  成功部署: $($deployed.Count) 项" -ForegroundColor Green
if ($skipped.Count -gt 0) {
    Write-Host "  跳过（源文件不存在）: $($skipped.Count) 项" -ForegroundColor Yellow
    foreach ($s in $skipped) { Write-Host "    - $s" -ForegroundColor Yellow }
}
if ($failed.Count -gt 0) {
    Write-Host "  失败: $($failed.Count) 项" -ForegroundColor Red
    foreach ($f in $failed) { Write-Host "    - $f" -ForegroundColor Red }
}

Write-Host "`n部署完成。请确保 opencode.json 的 plugin 数组包含 `"memories`"，然后重启 opencode。" -ForegroundColor Cyan
