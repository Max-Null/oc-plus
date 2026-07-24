@echo off
chcp 65001 >nul
echo ===== OC-plus 一键回滚 =====
echo.
echo 如果 OpenCode 部署后无法启动，双击此文件即可恢复到上一个可用版本。
echo.
echo 恢复内容: fractal.ts / prompts.ts / agents-priority.ts
echo.

node "%~dp0scripts\rollback.mjs"

echo.
echo 按任意键关闭...
pause >nul
