"""把单体 app.js 拆分为 store / components / views / router / main 五个经典脚本模块。

用法（在项目根目录执行）：
    python3 assets/js/_split.py

特点：
- 逐个“顶层声明”整体搬运，绝不切碎函数，代码零改动。
- 拆分后做括号平衡校验；任一模块不平衡则中止，不会改 index.html。
- 自动备份 index.html -> index.backup.html，并把 <script> 改为按序加载 5 个模块。
- 顺手清理本次测试留下的两条“留档：厨房”历史记录（不影响其它记录）。
- 原 app.js 保留，回滚只需 `cp index.backup.html index.html`。
"""
import re, sys, json
from pathlib import Path

js_dir = Path(__file__).resolve().parent          # assets/js
root = js_dir.parent.parent                        # 项目根
src_path = js_dir / "app.js"
if not src_path.exists():
    print("找不到 app.js，可能已经拆分过了。"); sys.exit(1)

src = src_path.read_text(encoding="utf-8").split("\n")

# 1) 找到所有顶层声明（缩进恰好 2 空格）
items = []
for i, l in enumerate(src, 1):
    m = re.match(r'^  function ([A-Za-z0-9_$]+)\s*\(', l)
    if m:
        items.append((i, m.group(1))); continue
    m = re.match(r'^  (?:const|let|var) ([A-Za-z0-9_$]+)\s*=', l)
    if m:
        items.append((i, m.group(1)))

close_line = None
for i in range(len(src), 0, -1):
    if src[i - 1].strip() == "})();":
        close_line = i; break
last_end = (close_line - 1) if close_line else len(src)

ranges = {}
for idx, (start, name) in enumerate(items):
    end = (items[idx + 1][0] - 1) if idx + 1 < len(items) else last_end
    ranges[name] = (start, end)

store = "LS_KEY $ $$ IC uid esc num money moneyWan clone fileToDataURL state openStages stdCat stdQuery focusSel lastRoute saveT SERVER API_BASE lastRev lastSyncAt pushT ROLE IDENTITY historyData remoteEmpty MY_NAME_KEY API_BASE_KEY VIEW_ONLY_ACTIONS myName canEdit normalizeState load save BUDGET_CATS CAT_COLORS stageInfo overallPct currentStage findStage budgetTotal catTotal catsUsed expTotals expAttachCount isDiscount contractPaid contractDiscount contractPending contractExtras contractExtrasTotal contractTotals updateEditToggle updateSyncLabel".split()
components = "toast openModal fieldHTML ringSVG kpiCard attachmentPicker photoLinks lightbox galleryPhotoPicker contactModal materialModal galleryModal addTask expenseModal attachmentModal contractModal budgetModal standardModal stageModal roomModal milestoneModal milestoneEditModal extraModal extraEditModal doExport".split()
views = "viewOverview statusOf viewStages stdCardHTML stdFiltered stdCardsHTML viewStandards viewBudget viewExpenses contractStatusBadge viewContracts viewEquipment viewSockets viewMeasure prepInfo viewPreparation viewInspection viewMaterials viewGallery viewContacts viewShare viewNotes loadHistory viewHistory".split()
router = "ROUTE_META currentRoute render refresh VIEWS".split()
main = "bindGlobal initOpenStages init".split()
modules = {"store": store, "components": components, "views": views, "router": router, "main": main}

allnames = [n for _, n in items]
assigned = [n for ms in modules.values() for n in ms]
missing = [n for n in allnames if n not in assigned]
dupes = sorted({n for n in assigned if assigned.count(n) > 1})
unknown = [n for n in assigned if n not in ranges]
if missing or dupes or unknown:
    print("模块归属不完整，已中止。")
    print("未分配:", missing); print("重复:", dupes); print("不存在:", unknown)
    sys.exit(2)

headers = {
    "store": "store · 状态 / 持久化 / 服务器同步 / 派生计算 / 工具与图标",
    "components": "components · 图标 / 弹窗 / 图片灯箱 / 照片选择 / 表单弹窗",
    "views": "views · 各页面视图渲染",
    "router": "router · 路由表 / 渲染 / 刷新",
    "main": "main · 全局事件绑定 / 启动",
}

bad = False
for mod, names in modules.items():
    nameset = set(names)
    out = ['/* ============================================================',
           ' *  ' + headers[mod],
           ' *  经典脚本（无构建）。模块间通过全局作用域共享；',
           ' *  加载顺序：store → components → views → router → main',
           ' * ============================================================ */',
           '"use strict";', ""]
    for start, name in items:
        if name in nameset:
            out.extend(src[start - 1:ranges[name][1]])
            out.append("")
    text = "\n".join(out) + "\n"
    bal = (text.count("{") - text.count("}"),
           text.count("(") - text.count(")"),
           text.count("[") - text.count("]"))
    print(f"{mod}.js  lines={len(out)}  balance(brace,paren,bracket)={bal}")
    if bal != (0, 0, 0):
        bad = True
    (js_dir / (mod + ".js")).write_text(text, encoding="utf-8")

if bad:
    print("有模块括号不平衡，已中止，未修改 index.html。原件 app.js 未动。")
    sys.exit(3)

# 2) 备份并改写 index.html 的脚本引用
index = root / "index.html"
html = index.read_text(encoding="utf-8")
v = "20261121m"
block = ('  <script src="assets/js/data.js?v=%s"></script>\n'
         '  <script src="assets/js/store.js?v=%s"></script>\n'
         '  <script src="assets/js/components.js?v=%s"></script>\n'
         '  <script src="assets/js/views.js?v=%s"></script>\n'
         '  <script src="assets/js/router.js?v=%s"></script>\n'
         '  <script src="assets/js/main.js?v=%s"></script>') % (v, v, v, v, v, v)
pat = re.compile(r'  <script src="assets/js/data\.js[^"]*"></script>\s*\n\s*<script src="assets/js/app\.js[^"]*"></script>')
if pat.search(html):
    (root / "index.backup.html").write_text(html, encoding="utf-8")
    html = pat.sub(block, html)
    index.write_text(html, encoding="utf-8")
    print("index.html 已切换到 5 个模块脚本（备份：index.backup.html）")
else:
    print("index.html 已是模块引用或未匹配，跳过改写。")

# 3) 清理本次测试产生的两条历史（仅匹配“留档：厨房”）
hist = root / "data" / "shared-history.json"
if hist.exists():
    try:
        data = json.loads(hist.read_text(encoding="utf-8") or "[]")
        before = len(data)
        data = [x for x in data if "留档：厨房" not in json.dumps(x, ensure_ascii=False)]
        if len(data) != before:
            hist.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"已清理测试历史 {before - len(data)} 条")
    except Exception as e:
        print("历史清理跳过：", e)

print("\n完成。请重启服务或直接刷新浏览器（强刷 Cmd+Shift+R）验证。")
print("回滚：cp index.backup.html index.html")
