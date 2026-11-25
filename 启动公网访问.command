#!/bin/zsh
# 一条命令：启动本机服务（如未运行）+ 创建 Cloudflare 公网 HTTPS 隧道
# 隧道运行期间会阻止 Mac 休眠；断开后自动重连（临时网址可能变化）
set -e
cd "$(dirname "$0")"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "还没有安装 cloudflared。请先在“终端”里运行："
  echo ""
  echo "    brew install cloudflared"
  echo ""
  echo "安装完成后，重新双击本脚本。"
  read "?按回车退出。"
  exit 1
fi

# 若本机服务未运行，则在后台启动
if ! lsof -ti tcp:8777 >/dev/null 2>&1; then
  echo "正在后台启动本地服务…"
  nohup python3 server.py >/tmp/zx-server.log 2>&1 &
  for i in {1..20}; do
    lsof -ti tcp:8777 >/dev/null 2>&1 && break
    sleep 0.3
  done
  if ! lsof -ti tcp:8777 >/dev/null 2>&1; then
    echo "本地服务启动失败，请查看 /tmp/zx-server.log。"
    read "?按回车退出。"
    exit 1
  fi
  echo "本地服务已启动（日志：/tmp/zx-server.log）。"
fi

# 阻止系统在隧道运行期间休眠（这是「隔一会儿就打不开」的常见原因）
caffeinate -dims -w $$ >/dev/null 2>&1 &
CAFFEINATE_PID=$!
cleanup() {
  kill "$CAFFEINATE_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "正在创建公网隧道，请稍候… 连接成功后会在下方高亮显示分享链接。"
echo "默认打开即为只读；在网页右上角输入编辑指令后可修改。"
echo "注意：请保持本窗口开着；关闭后公网网址即失效。"
echo "已开启防休眠：Mac 插电时可长时间保持可访问；临时网址断开重连后可能会变。"
echo ""

print_link() {
  local url="$1"
  echo ""
  echo "  \033[1;33m════════════════════════════════════════════════\033[0m"
  echo "  \033[1;33m  公网分享链接（发这个网址给对方即可）：\033[0m"
  echo "  \033[1;30;43m  $url  \033[0m"
  echo "  \033[1;33m════════════════════════════════════════════════\033[0m"
  echo "  \033[2m已复制到剪贴板；也可稍后运行  cat /tmp/zx-public-url.txt  再查看。\033[0m"
  echo ""
}

attempt=0
while true; do
  attempt=$((attempt + 1))
  if (( attempt > 1 )); then
    echo ""
    echo "隧道已断开，正在重新连接（第 ${attempt} 次）… 新网址可能会变化，请把新链接再发给对方。"
    echo ""
    sleep 3
  fi

  URL_SHOWN=0
  # set +e：cloudflared 退出时不要立刻结束整个脚本，方便自动重连
  set +e
  cloudflared tunnel --url http://localhost:8777 2>&1 | while IFS= read -r line; do
    print -r -- "$line"
    if [[ $URL_SHOWN -eq 0 && "$line" == *trycloudflare.com* ]]; then
      url=$(print -r -- "$line" | grep -oE 'https://[a-z0-9.-]+\.trycloudflare\.com' | head -1)
      if [[ -n "$url" ]]; then
        URL_SHOWN=1
        print -r -- "$url" > /tmp/zx-public-url.txt
        printf "%s" "$url" | pbcopy 2>/dev/null || true
        print_link "$url"
      fi
    fi
  done
  exit_code=${pipestatus[1]}
  set -e

  # 用户主动中断（Ctrl+C）时退出，不再重连
  if [[ $exit_code -eq 130 || $exit_code -eq 2 ]]; then
    echo "已停止公网隧道。"
    break
  fi
done
