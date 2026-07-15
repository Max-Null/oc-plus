# CC 启动脚本 — 自动切换技能目录
# 用法：.\cc.ps1
# 或：.\cc.ps1 "你的提示词"

param([string]$Prompt)

$skills = "$env:USERPROFILE\.claude\skills"
$bak = "$env:USERPROFILE\.claude\skills-cc.bak"

# 检查备份是否存在
if (-not (Test-Path $bak)) {
    Write-Host "未找到 skills-cc.bak，无需切换" -ForegroundColor Yellow
    $needSwitch = $false
} else {
    $needSwitch = $true
}

# 启动前：恢复 CC 技能目录
if ($needSwitch) {
    Rename-Item -LiteralPath $bak -NewName "skills" -Force
    Write-Host "已启用 CC 技能目录" -ForegroundColor Green
}

try {
    # 启动 CC
    if ($Prompt) {
        claude $Prompt
    } else {
        claude
    }
} finally {
    # 退出后：移走 CC 技能目录
    if ($needSwitch -and (Test-Path $skills)) {
        Rename-Item -LiteralPath $skills -NewName "skills-cc.bak" -Force
        Write-Host "已移走 CC 技能目录" -ForegroundColor Green
    }
}
