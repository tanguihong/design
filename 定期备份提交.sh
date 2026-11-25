#!/bin/zsh
# 定期检查项目文件变更，有改动则以当天日期作为 commit message 自动提交
# 用法：
#   ./定期备份提交.sh           # 前台监控（适合在终端里启动项目时执行）
#   ./定期备份提交.sh --daemon  # 后台监控（启动脚本会自动调用）
#   ./定期备份提交.sh --once    # 只检查并提交一次后退出
#   ./定期备份提交.sh --stop    # 停止后台监控
# 环境变量 INTERVAL：检查间隔秒数，默认 300（5 分钟）

set -e
cd "$(dirname "$0")"

INTERVAL="${INTERVAL:-300}"
PIDFILE="/tmp/zx-auto-commit.pid"
LOGFILE="/tmp/zx-auto-commit.log"

do_commit() {
  if [[ -z "$(git status --porcelain 2>/dev/null)" ]]; then
    return 1
  fi
  git add -A
  local msg
  msg="$(date +%Y-%m-%d)"
  if git commit -m "$msg" >/dev/null 2>&1; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 已提交：$msg"
    return 0
  fi
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 提交失败，请检查 git 配置或冲突。" >&2
  return 1
}

case "${1:-}" in
  --stop)
    if [[ -f "$PIDFILE" ]]; then
      pid="$(cat "$PIDFILE")"
      if kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null || true
        echo "已停止定期备份监控 (PID $pid)。"
      else
        echo "后台监控未在运行。"
      fi
      rm -f "$PIDFILE"
    else
      echo "后台监控未在运行。"
    fi
    exit 0
    ;;
  --once)
    if do_commit; then
      :
    else
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] 无变更，无需提交。"
    fi
    exit 0
    ;;
  --daemon|-d)
    if [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      echo "定期备份已在运行 (PID $(cat "$PIDFILE"))，间隔 ${INTERVAL}s。"
      exit 0
    fi
    nohup "$0" --loop >>"$LOGFILE" 2>&1 &
    echo $! > "$PIDFILE"
    echo "已启动定期备份监控 (PID $!)，间隔 ${INTERVAL}s，日志：$LOGFILE"
    exit 0
    ;;
  --loop)
    # 由 --daemon 调用；循环写日志
    echo $$ > "$PIDFILE"
    trap 'rm -f "$PIDFILE"; exit 0' EXIT INT TERM
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 开始监控，间隔 ${INTERVAL}s"
    while true; do
      do_commit || true
      sleep "$INTERVAL"
    done
    ;;
  ""|--foreground|-f)
    echo "定期备份监控已启动（前台）。有文件改动将以当天日期提交，间隔 ${INTERVAL}s。"
    echo "按 Ctrl+C 停止。也可用：./定期备份提交.sh --daemon 后台运行。"
    echo ""
    trap 'echo ""; echo "已停止定期备份监控。"; exit 0' INT TERM
    while true; do
      do_commit || true
      sleep "$INTERVAL"
    done
    ;;
  -h|--help)
    echo "用法：$0 [--daemon|--once|--stop|--foreground]"
    echo "  （无参数）     前台定期监控并提交"
    echo "  --daemon, -d  后台运行"
    echo "  --once        只提交一次"
    echo "  --stop        停止后台监控"
    echo "  INTERVAL=60 $0  可自定义检查间隔（秒）"
    exit 0
    ;;
  *)
    echo "未知参数：$1（用 --help 查看用法）" >&2
    exit 1
    ;;
esac
