#!/bin/zsh
# 启动本地家装管理平台（数据保存在项目文件夹）
cd "$(dirname "$0")"
PORT="${PORT:-8777}"
URL="http://localhost:$PORT"

# 后台启动定期备份：有文件改动时以当天日期自动 git commit
if [[ -x "./定期备份提交.sh" ]]; then
  ./定期备份提交.sh --daemon
fi

if lsof -ti tcp:$PORT >/dev/null 2>&1; then
  echo "端口 $PORT 已有服务在运行，直接打开浏览器：$URL"
  echo "如需重启，请先关闭之前打开的启动窗口。"
  open "$URL"
  exit 0
fi

echo "启动本地家装管理平台：$URL"
echo "打开后默认只读；需要修改时点右上角“解锁编辑”。关闭本窗口即停止服务。"
# 稍等服务就绪后自动打开浏览器
( sleep 1; open "$URL" ) &
exec python3 server.py
