#!/usr/bin/env python3
"""Password-protected home-renovation collaboration server."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from http.cookies import SimpleCookie
from pathlib import Path
import base64
import hashlib
import hmac
import json
import os
import re
import shutil
import time
import uuid

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
DATA_DIR.mkdir(exist_ok=True)
DATA = DATA_DIR / "shared-state.json"
REV = DATA_DIR / "shared-revision.txt"
UPLOADS = DATA_DIR / "uploads"
HISTORY = DATA_DIR / "shared-history.json"
MAX_HISTORY = 300
# 访问口令 -> (权限, 身份)：tgh 只读；tgh_123 / lch_123 可编辑
ACCESS_CODES = {
    "tgh": ("view", "tgh"),
    "tgh_123": ("edit", "tgh_123"),
    "lch_123": ("edit", "lch_123"),
}
SESSION_TTL = 60 * 60 * 24 * 14
UPLOAD_LIMIT = 25 * 1024 * 1024
SECRET_FILE = DATA_DIR / ".session-secret"
if not SECRET_FILE.exists():
    SECRET_FILE.write_text(base64.urlsafe_b64encode(os.urandom(48)).decode(), encoding="ascii")
    SECRET_FILE.chmod(0o600)
SESSION_SECRET = SECRET_FILE.read_text(encoding="ascii").strip().encode()
UPLOADS.mkdir(exist_ok=True)


def parse_session(token):
    """返回 (role, identity)，无效时返回 (None, None)。"""
    try:
        payload, signature = token.rsplit(".", 1)
        expected = hmac.new(SESSION_SECRET, payload.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            return None, None
        decoded = base64.urlsafe_b64decode(payload.encode() + b"=" * (-len(payload) % 4)).decode()
        expires, role, identity = decoded.split("|", 2)
        if int(expires) > time.time() and role in ("view", "edit"):
            return role, identity
        return None, None
    except (ValueError, TypeError, UnicodeDecodeError):
        return None, None


def load_history():
    try:
        data = json.loads(HISTORY.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except (OSError, json.JSONDecodeError, ValueError):
        return []


def _metrics(state):
    m = {"tasks": 0, "tasks_done": 0, "budget": 0, "expenses": 0, "expenses_paid": 0.0,
         "contracts": 0, "inspected": 0, "materials": 0, "contacts": 0, "gallery": 0}
    if not isinstance(state, dict):
        return m
    stages = state.get("stages") or []
    m["tasks"] = sum(len(s.get("tasks") or []) for s in stages)
    m["tasks_done"] = sum(1 for s in stages for t in (s.get("tasks") or []) if t.get("done"))
    m["budget"] = len(state.get("budget") or [])
    expenses = state.get("expenses") or []
    m["expenses"] = len(expenses)
    m["expenses_paid"] = round(sum(float(e.get("paid") or 0) for e in expenses), 2)
    contracts = state.get("contracts") or []
    m["contracts"] = len(contracts)
    m["inspected"] = sum(1 for x in (state.get("inspection") or []) if x.get("result") not in (None, "", "待检查"))
    m["materials"] = len(state.get("materials") or [])
    m["contacts"] = len(state.get("contacts") or [])
    m["gallery"] = len(state.get("gallery") or [])
    return m


def diff_summary(old, new):
    a, b = _metrics(old), _metrics(new)
    parts = []
    def chg(key, label, money=False):
        if key in a and key in b and a[key] != b[key]:
            d = b[key] - a[key]
            sign = "+" if d > 0 else ""
            if money:
                parts.append(f"{label} {sign}{d:.0f}")
            else:
                parts.append(f"{label} {sign}{d}")
    chg("tasks_done", "完成任务")
    chg("budget", "预算项")
    chg("expenses", "开支")
    chg("expenses_paid", "已付合计", money=True)
    chg("contracts", "合同")
    chg("inspected", "已验收项")
    chg("materials", "材料")
    chg("contacts", "联系人")
    chg("gallery", "留档")
    return "；".join(parts) if parts else "保存更新"


def _fmt_num(x):
    try:
        v = float(x or 0)
    except (TypeError, ValueError):
        return str(x)
    return f"{v:.0f}" if abs(v - round(v)) < 1e-9 else f"{v:.2f}"


def _by_id(items):
    return {it.get("id"): it for it in (items or []) if isinstance(it, dict)}


def diff_changes(old, new):
    """返回具体变更描述列表，用于修改记录展示。"""
    old = old if isinstance(old, dict) else {}
    new = new if isinstance(new, dict) else {}
    if not old:
        return [f"初始化项目数据（合同 {len(new.get('contracts') or [])} 份、开支 {len(new.get('expenses') or [])} 条）"]
    out = []

    def tasks_map(s):
        m = {}
        for st in (s.get("stages") or []):
            for t in (st.get("tasks") or []):
                if isinstance(t, dict):
                    m[t.get("id")] = t
        return m

    ot, nt = tasks_map(old), tasks_map(new)
    for tid, t in nt.items():
        o = ot.get(tid)
        if o is not None and bool(o.get("done")) != bool(t.get("done")):
            out.append(("完成任务：" if t.get("done") else "取消完成：") + (t.get("text") or ""))

    oc, nc = _by_id(old.get("contracts")), _by_id(new.get("contracts"))
    for cid, c in nc.items():
        o = oc.get(cid)
        name = c.get("name") or ""
        if o is None:
            out.append("新增合同：" + name)
            continue
        if _fmt_num(o.get("amount")) != _fmt_num(c.get("amount")):
            out.append(f"合同·{name}：合同金额 {_fmt_num(o.get('amount'))}→{_fmt_num(c.get('amount'))}")
        if (o.get("warranty") or "") != (c.get("warranty") or ""):
            out.append(f"合同·{name}：质保 {o.get('warranty') or '—'}→{c.get('warranty') or '—'}")
        om, nm = _by_id(o.get("milestones")), _by_id(c.get("milestones"))
        for mid, m in nm.items():
            mo = om.get(mid)
            if mo is None:
                tag = "优惠" if m.get("kind") == "discount" else "支付节点"
                out.append(f"合同·{name}：新增{tag}「{m.get('name', '')}」({_fmt_num(m.get('amount'))})")
            else:
                if _fmt_num(mo.get("amount")) != _fmt_num(m.get("amount")):
                    out.append(f"合同·{name}：节点「{m.get('name', '')}」金额 {_fmt_num(mo.get('amount'))}→{_fmt_num(m.get('amount'))}")
                if bool(mo.get("paid")) != bool(m.get("paid")):
                    out.append(f"合同·{name}：节点「{m.get('name', '')}」" + ("标记已付" if m.get("paid") else "取消已付"))
        for mid, m in om.items():
            if mid not in nm:
                out.append(f"合同·{name}：删除节点「{m.get('name', '')}」({_fmt_num(m.get('amount'))})")
        ox, nx = _by_id(o.get("extras")), _by_id(c.get("extras"))
        for xid, x in nx.items():
            xo = ox.get(xid)
            xname = x.get("name") or ""
            if xo is None:
                out.append(f"合同·{name}：新增增项「{xname}」({_fmt_num(x.get('amount'))})")
            elif _fmt_num(xo.get("amount")) != _fmt_num(x.get("amount")):
                out.append(f"合同·{name}：增项「{xname}」金额 {_fmt_num(xo.get('amount'))}→{_fmt_num(x.get('amount'))}")
        for xid, x in ox.items():
            if xid not in nx:
                out.append(f"合同·{name}：删除增项「{x.get('name', '')}」({_fmt_num(x.get('amount'))})")
    for cid, c in oc.items():
        if cid not in nc:
            out.append("删除合同：" + (c.get("name") or ""))

    oe, ne = _by_id(old.get("expenses")), _by_id(new.get("expenses"))
    for eid, e in ne.items():
        o = oe.get(eid)
        name = e.get("product") or e.get("cat") or ""
        if o is None:
            out.append("新增开支：" + name)
            continue
        for f, lab in (("price", "原价"), ("discount", "优惠"), ("paid", "实付")):
            if _fmt_num(o.get(f)) != _fmt_num(e.get(f)):
                out.append(f"开支·{name}：{lab} {_fmt_num(o.get(f))}→{_fmt_num(e.get(f))}")
    for eid, e in oe.items():
        if eid not in ne:
            out.append("删除开支：" + (e.get("product") or e.get("cat") or ""))

    ob, nb = _by_id(old.get("budget")), _by_id(new.get("budget"))
    for bid, b in nb.items():
        o = ob.get(bid)
        sub = b.get("sub") or b.get("cat") or ""
        if o is None:
            out.append("新增预算项：" + sub)
            continue
        if _fmt_num(o.get("amount")) != _fmt_num(b.get("amount")):
            out.append(f"预算·{sub}：{_fmt_num(o.get('amount'))}→{_fmt_num(b.get('amount'))}")
    for bid, b in ob.items():
        if bid not in nb:
            out.append("删除预算项：" + (b.get("sub") or b.get("cat") or ""))

    oi, ni = _by_id(old.get("inspection")), _by_id(new.get("inspection"))
    for iid, it in ni.items():
        o = oi.get(iid)
        if o is not None and (o.get("result") or "") != (it.get("result") or ""):
            out.append(f"验房·{it.get('task', '')}：{o.get('result') or '待检查'}→{it.get('result') or '待检查'}")

    for key, labname, field in (("materials", "材料", "name"), ("contacts", "联系人", "name"), ("gallery", "留档", "location")):
        o, n = _by_id(old.get(key)), _by_id(new.get(key))
        for i, it in n.items():
            if i not in o:
                out.append(f"新增{labname}：" + (it.get(field) or ""))
        for i, it in o.items():
            if i not in n:
                out.append(f"删除{labname}：" + (it.get(field) or ""))
    return out


class Handler(SimpleHTTPRequestHandler):
    def end_json(self, code=200, extra_headers=None):
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        if extra_headers:
            for key, value in extra_headers.items():
                self.send_header(key, value)
        self.end_headers()

    def cookie_token(self):
        cookie = SimpleCookie(self.headers.get("Cookie", ""))
        item = cookie.get("zx_session")
        return item.value if item else ""

    def session_info(self):
        role, identity = parse_session(self.cookie_token())
        return role, identity

    def authorized(self):
        return self.session_info()[0]

    def require_auth(self, need_edit=False):
        role = self.authorized()
        if role and (not need_edit or role == "edit"):
            return True
        path = urlparse(self.path).path
        if path.startswith("/api/"):
            code = 403 if role else 401
            self.end_json(code)
            self.wfile.write(json.dumps({"error": "forbidden" if role else "authentication required"}).encode())
        else:
            self.send_response(303)
            self.send_header("Location", "/login")
            self.end_headers()
        return False

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin", "null"))
        self.send_header("Access-Control-Allow-Credentials", "true")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, OPTIONS")
        self.send_header("Vary", "Origin")
        self.end_headers()

    def end_headers(self):
        path = urlparse(self.path).path
        if path.endswith((".js", ".css", ".html")) or path in ("/", ""):
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.send_header("Pragma", "no-cache")
        if self.headers.get("X-Forwarded-Proto") == "https":
            self.send_header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        super().end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/login":
            self.send_login_page()
            return
        if path == "/logout":
            self.send_response(303)
            self.send_header("Set-Cookie", "zx_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax")
            self.send_header("Location", "/")
            self.end_headers()
            return
        if path == "/api/login":
            self.send_login_page()
            return
        if path == "/api/session":
            role, identity = self.session_info()
            self.end_json()
            self.wfile.write(json.dumps({"authenticated": bool(role), "role": role or "view", "identity": identity or ""}).encode())
            return
        if path == "/api/history":
            self.end_json()
            self.wfile.write(json.dumps({"items": list(reversed(load_history()))}, ensure_ascii=False).encode())
            return
        if path == "/api/state":
            rev = int(REV.read_text() or "0") if REV.exists() else 0
            state_obj = None
            if DATA.exists():
                try:
                    state_obj = json.loads(DATA.read_text(encoding="utf-8") or "null")
                except (json.JSONDecodeError, ValueError):
                    state_obj = None
            payload = {"state": state_obj, "rev": rev}
            self.end_json()
            self.wfile.write(json.dumps(payload, ensure_ascii=False).encode())
            return
        if path.startswith("/data/") or path == "/server.py" or path.endswith(".command"):
            self.end_json(404)
            return
        if path.startswith("/uploads/"):
            self.path = "/data" + path
            return super().do_GET()
        if path.startswith("/api/"):
            self.end_json(404)
            return
        return super().do_GET()

    def send_login_page(self, error=""):
        html = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>家装平台</title><style>body{margin:0;background:#f5f3ef;color:#292d27;font:16px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:grid;min-height:100vh;place-items:center}.box{background:white;padding:32px;border-radius:18px;width:min(360px,calc(100% - 48px));box-shadow:0 12px 40px #0001}h1{font-size:22px}p{color:#697168;font-size:14px;line-height:1.6}input,button{box-sizing:border-box;width:100%;padding:13px;border-radius:9px;margin-top:12px;font-size:15px}input{border:1px solid #d9ddd7}button{border:0;background:#52715c;color:white;cursor:pointer}.err{color:#ad4328}</style><div class="box"><h1>新居装修管理</h1><p>请输入访问指令进入。</p><form method="post" action="/api/login"><input name="command" required autofocus autocomplete="off" placeholder="访问指令"><button>进入</button></form><p class="err">''' + error + '''</p></div></html>'''
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(html.encode())

    def handle_login(self):
        length = min(int(self.headers.get("Content-Length", "0")), 4096)
        body = self.rfile.read(length).decode("utf-8", "replace")
        is_json = "application/json" in self.headers.get("Content-Type", "") or self.headers.get("X-Requested-With") == "fetch"
        if is_json:
            try:
                provided = (json.loads(body or "{}").get("command") or "").strip()
            except json.JSONDecodeError:
                provided = ""
        else:
            provided = parse_qs(body).get("command", [""])[0].strip()
        pair = ACCESS_CODES.get(provided)
        if not pair:
            if is_json:
                self.end_json(403)
                self.wfile.write(b'{"ok":false,"error":"invalid command"}')
            else:
                self.send_login_page("指令不正确，请重试。")
            return
        role, identity = pair
        payload = base64.urlsafe_b64encode(f"{int(time.time()) + SESSION_TTL}|{role}|{identity}".encode()).decode().rstrip("=")
        signature = hmac.new(SESSION_SECRET, payload.encode(), hashlib.sha256).hexdigest()
        token = payload + "." + signature
        secure = "; Secure" if self.headers.get("X-Forwarded-Proto") == "https" or self.server.tls else ""
        cookie = f"zx_session={token}; Max-Age={SESSION_TTL}; Path=/; HttpOnly; SameSite=Lax{secure}"
        if is_json:
            self.end_json(200, {"Set-Cookie": cookie})
            self.wfile.write(json.dumps({"ok": True, "role": role, "identity": identity}).encode())
            return
        self.send_response(303)
        self.send_header("Set-Cookie", cookie)
        self.send_header("Location", "/")
        self.end_headers()

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/login":
            self.handle_login()
            return
        if path == "/api/logout":
            self.end_json(200, {"Set-Cookie": "zx_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax"})
            self.wfile.write(b'{"ok":true}')
            return
        if not self.require_auth(need_edit=True):
            return
        if path != "/api/upload":
            self.end_json(404)
            return
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > UPLOAD_LIMIT:
            self.end_json(413)
            self.wfile.write(b'{"error":"file too large; maximum is 25 MB"}')
            return
        content_type = self.headers.get("Content-Type", "")
        match = re.search(r'boundary=(?:"([^"]+)"|([^;]+))', content_type)
        if not match:
            self.end_json(400)
            self.wfile.write(b'{"error":"invalid multipart request"}')
            return
        boundary = (match.group(1) or match.group(2)).encode()
        body = self.rfile.read(length)
        for part in body.split(b"--" + boundary):
            if b'Content-Disposition:' not in part or b'name="file"' not in part:
                continue
            header, separator, content = part.partition(b"\r\n\r\n")
            file_match = re.search(rb'filename="([^"]*)"', header)
            if not separator or not file_match:
                continue
            original_name = file_match.group(1).decode("utf-8", "replace")
            content = content.removesuffix(b"\r\n").removesuffix(b"--\r\n")
            name = uuid.uuid4().hex + Path(original_name).suffix[:12]
            out = UPLOADS / name
            out.write_bytes(content)
            self.end_json()
            self.wfile.write(json.dumps({"url": "/uploads/" + name, "name": original_name, "size": out.stat().st_size}, ensure_ascii=False).encode())
            return
        self.end_json(400)
        self.wfile.write(b'{"error":"missing file"}')

    def do_DELETE(self):
        path = urlparse(self.path).path
        if path != "/api/history":
            self.end_json(404)
            return
        if not self.require_auth(need_edit=True):
            return
        try:
            if HISTORY.exists():
                HISTORY.unlink()
        except OSError as exc:
            self.end_json(400)
            self.wfile.write(json.dumps({"error": str(exc)}).encode())
            return
        self.end_json()
        self.wfile.write(b'{"ok":true}')

    def do_PUT(self):
        if urlparse(self.path).path != "/api/state":
            self.end_json(404)
            return
        if not self.require_auth(need_edit=True):
            return
        length = int(self.headers.get("Content-Length", "0"))
        if length > 20 * 1024 * 1024:
            self.end_json(413)
            return
        try:
            old_obj = None
            if DATA.exists():
                try:
                    old_obj = json.loads(DATA.read_text(encoding="utf-8") or "null")
                except (json.JSONDecodeError, ValueError):
                    old_obj = None
            incoming = json.loads(self.rfile.read(length))
            obj = incoming.get("state", incoming)
            by = (incoming.get("by") or "").strip()
            # 写入前保留上一版备份，避免误覆盖导致数据丢失
            if DATA.exists():
                try:
                    shutil.copy2(DATA, DATA.with_suffix(".bak.json"))
                except OSError:
                    pass
            DATA.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")
            rev = int(REV.read_text() if REV.exists() else "0") + 1
            REV.write_text(str(rev), encoding="utf-8")
            _, identity = self.session_info()
            summary = diff_summary(old_obj, obj)
            changes = diff_changes(old_obj, obj)
            entry = {
                "time": time.strftime("%Y-%m-%d %H:%M:%S"),
                "ts": int(time.time()),
                "user": identity or "unknown",
                "name": by or "",
                "rev": rev,
                "summary": summary,
                "changes": changes[:40],
            }
            items = load_history()
            items.append(entry)
            HISTORY.write_text(json.dumps(items[-MAX_HISTORY:], ensure_ascii=False, indent=2), encoding="utf-8")
        except (json.JSONDecodeError, OSError, ValueError) as exc:
            self.end_json(400)
            self.wfile.write(json.dumps({"error": str(exc)}).encode())
            return
        self.end_json()
        self.wfile.write(json.dumps({"ok": True, "rev": rev}).encode())


def main():
    server = ThreadingHTTPServer(("0.0.0.0", int(os.environ.get("PORT", "8777"))), Handler)
    server.tls = False
    print("Command-protected service listening on port", server.server_port)
    server.serve_forever()


if __name__ == "__main__":
    main()
