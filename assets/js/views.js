/* ============================================================
 *  家装平台 · views（各页面视图渲染）
 *  经典脚本（无构建）。依赖 store.js / components.js 已加载；
 *  加载顺序：store → components → views → router → main
 * ============================================================ */
"use strict";

/* ============================================================
 *  视图：总览
 * ============================================================ */
function ringSVG(pct) {
  const r = 52, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
  return '<div class="ring-wrap">' +
    '<svg width="128" height="128" viewBox="0 0 128 128">' +
      '<defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="#d78a5f"/><stop offset="1" stop-color="#bf5a2f"/>' +
      '</linearGradient></defs>' +
      '<circle class="ring-track" cx="64" cy="64" r="' + r + '" fill="none" stroke-width="9"/>' +
      '<circle class="ring-bar" cx="64" cy="64" r="' + r + '" fill="none" stroke-width="9" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '"/>' +
    '</svg>' +
    '<div class="ring-center"><div class="num">' + Math.round(pct) + '<small>%</small></div><div class="cap">总体完成</div></div>' +
  '</div>';
}

function kpiCard(o) {
  return '<div class="card kpi">' +
    '<div class="kpi-top"><span class="kpi-label">' + esc(o.label) + '</span>' +
      '<span class="kpi-ico ' + o.icoCls + '">' + o.icon + '</span></div>' +
    '<div class="kpi-val">' + o.val + '</div>' +
    '<div class="kpi-sub">' + o.sub + '</div>' +
  '</div>';
}

function viewOverview() {
  const m = state.meta;
  const pct = overallPct();
  const si = stageInfo(currentStage() || { tasks: [] });
  const cur = currentStage();
  const bt = budgetTotal();
  const exp = expTotals();
  const con = contractTotals();
  const remain = bt - exp.paid;

  // 预算构成
  const catRows = catsUsed().map(cat => {
    const amt = catTotal(cat);
    const p = bt ? (amt / bt * 100) : 0;
    const color = CAT_COLORS[cat] || "#bf5a2f";
    return '<div class="cat-row">' +
      '<span class="cat-name">' + esc(cat) + '</span>' +
      '<span class="cat-track"><span style="width:' + p.toFixed(1) + '%;background:' + color + '"></span></span>' +
      '<span class="cat-amt">' + moneyWan(amt) + '<span class="cat-pct">' + p.toFixed(0) + '%</span></span>' +
    '</div>';
  }).join("");

  // 下一步任务
  const next = [];
  outer: for (const s of state.stages) {
    for (const t of s.tasks) {
      if (!t.done) { next.push({ stage: s.name, text: t.text }); if (next.length >= 6) break outer; }
    }
  }
  const nextHTML = next.length ? next.map((n, i) =>
    '<div class="task-line"><span class="idx">' + (i + 1) + '</span>' +
      '<div class="tl-body"><p>' + esc(n.text) + '</p><small>' + esc(n.stage) + '</small></div></div>'
  ).join("") : '<div class="empty" style="padding:26px">' + IC.check + '<p>全部任务已完成 🎉</p></div>';

  // 待付款节点
  const pays = [];
  state.contracts.forEach(c => {
    if (c.status === "已完成") return;
    c.milestones.forEach(ms => { if (!isDiscount(ms) && !ms.paid) pays.push({ c: c.name, name: ms.name, amount: ms.amount, due: ms.due }); });
  });
  const payHTML = pays.length ? pays.slice(0, 6).map(p =>
    '<div class="task-line" style="align-items:center">' +
      '<span class="idx" style="background:var(--gold-soft);color:var(--gold)">付</span>' +
      '<div class="tl-body"><p>' + esc(p.name) + ' · <b style="color:var(--accent-2)">' + money(p.amount) + '</b></p>' +
        '<small>' + esc(p.c) + (p.due ? ' · 截止 ' + esc(p.due) : '') + '</small></div></div>'
  ).join("") : '<div class="empty" style="padding:26px">' + IC.info + '<p>暂无待付款节点</p></div>';

  const notePending = state.notes.filter(n => !n.done);

  return '<section class="hero">' +
      '<div class="hero-main">' +
        '<div class="eyebrow">' + esc(m.community || "新居") + ' · 装修进行时</div>' +
        '<h1>' + esc(m.projectName || "新居装修") + '</h1>' +
        '<div class="hero-meta">' +
          '<span>' + esc(m.layout) + '</span>' +
          '<span>面积 <b>' + esc(m.area) + '</b></span>' +
          '<span>预算 <b>' + moneyWan(bt) + '</b></span>' +
          (m.handoverDate ? '<span>收房 <b>' + esc(m.handoverDate) + '</b></span>' : '<span>状态 <b>待收房</b></span>') +
        '</div>' +
        '<div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap">' +
          '<a class="btn primary" href="#stages">' + IC.plus + '推进阶段</a>' +
          '<a class="btn" href="#contracts" style="background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.16);color:#efe7da">查看合同</a>' +
          '</div>' +
        '</div>' +
        '<div class="hero-ring">' +
          '<div class="ring-label">当前阶段 · ' + esc(cur ? cur.name.split(" · ")[0] : "—") + '</div>' +
          ringSVG(pct) +
          '<div class="ring-label">' + si.done + ' / ' + si.total + ' 项任务</div>' +
        '</div>' +
      '</section>' +

      '<div class="grid g4" style="margin-bottom:18px">' +
        kpiCard({ label: "装修总预算", val: moneyWan(bt), sub: "分类合计 · <b>" + catsUsed().length + "</b> 大类", icoCls: "ico-accent", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>' }) +
        kpiCard({ label: "已支付", val: moneyWan(exp.paid), sub: "占预算 <b>" + (bt ? (exp.paid / bt * 100).toFixed(0) : 0) + "%</b>", icoCls: "ico-ok", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>' }) +
        kpiCard({ label: "已享优惠", val: moneyWan(exp.discount), sub: "优惠来自信用卡 / 平台活动", icoCls: "ico-gold", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9l5 5z"/><path d="M15 3v5h5M8 14h8M8 17h5"/></svg>' }) +
        kpiCard({ label: "预算结余", val: moneyWan(remain), sub: "已签合同 <b>" + moneyWan(con.amount) + "</b>", icoCls: "ico-info", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 7-7"/><path d="M21 8V4h-4"/></svg>' }) +
      '</div>' +

      '<div class="grid g2" style="margin-bottom:18px">' +
        '<div class="card card-pad">' +
          '<div class="section-head"><h2>预算构成</h2><span class="sub">按大类</span><span class="spacer"></span><a class="btn sm ghost" href="#budget">明细</a></div>' +
          catRows +
        '</div>' +
        '<div class="card card-pad">' +
          '<div class="section-head"><h2>当前进行</h2><span class="spacer"></span><a class="btn sm ghost" href="#stages">全部</a></div>' +
          (cur ? (
            '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">' +
              '<span class="badge accent dot">进行中</span>' +
              '<h3 style="font-size:15px">' + esc(cur.name) + '</h3>' +
            '</div>' +
            '<div class="bar" style="margin:8px 0 14px"><span style="width:' + si.pct + '%"></span></div>' +
            cur.tasks.filter(t => !t.done).slice(0, 5).map(t =>
              '<div class="task"><span class="check"></span><span class="task-text">' + esc(t.text) + '</span></div>'
            ).join("") +
            (cur.tasks.filter(t => !t.done).length === 0 ? '<p style="color:var(--muted);font-size:13px">该阶段任务已全部完成</p>' : '')
          ) : '<div class="empty">' + IC.check + '<p>全部完成</p></div>') +
        '</div>' +
      '</div>' +

      '<div class="grid g2" style="margin-bottom:18px">' +
        '<div class="card card-pad">' +
          '<div class="section-head"><h2>下一步要做</h2><span class="sub">按流程排序</span></div>' +
          nextHTML +
        '</div>' +
        '<div class="card card-pad">' +
          '<div class="section-head"><h2>待付款节点</h2><span class="sub">合同里程碑</span><span class="spacer"></span><a class="btn sm ghost" href="#contracts">合同</a></div>' +
          payHTML +
        '</div>' +
      '</div>' +

      '<div class="grid g2">' +
        '<div class="card card-pad">' +
          '<div class="section-head"><h2>备忘待办</h2><span class="sub">' + notePending.length + ' 项</span><span class="spacer"></span><a class="btn sm ghost" href="#notes">全部</a></div>' +
          (notePending.length ? notePending.slice(0, 5).map(n =>
            '<div class="task"><span class="check"></span><span class="task-text">' + esc(n.text) + '</span></div>'
          ).join("") : '<div class="empty" style="padding:20px">' + IC.check + '<p>暂无待办</p></div>') +
        '</div>' +
        '<div class="card card-pad">' +
          '<div class="section-head"><h2>数据与备份</h2><span class="sub">' + (SERVER ? "已保存到项目文件夹" : "本机浏览器暂存") + '</span></div>' +
          '<p style="font-size:12.5px;color:var(--muted);line-height:1.7;margin-bottom:14px">' + (SERVER ? "项目数据保存在 data/ 目录（shared-state.json 为数据，uploads/ 为附件）。打包迁移时复制整个项目文件夹即可。" : "当前未启动服务，数据暂存在此浏览器。请通过 启动共享.command 打开，数据会保存到项目文件夹。") + '</p>' +
          '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
            '<button class="btn" data-action="export">导出数据</button>' +
            '<button class="btn" data-action="import">导入数据</button>' +
            '<button class="btn danger-ghost" data-action="reset" style="border:1px solid var(--line-strong)">重置示例</button>' +
          '</div>' +
        '</div>' +
      '</div>';
}

/* ============================================================
 *  视图：阶段流程
 * ============================================================ */
function statusOf(s) {
  const i = stageInfo(s);
  if (i.total && i.done === i.total) return { key: "done", label: "已完成", badge: "ok" };
  if (i.done > 0) return { key: "doing", label: "进行中", badge: "accent" };
  return { key: "todo", label: "未开始", badge: "" };
}
function viewStages() {
  const cur = currentStage();
  const cards = state.stages.map((s, idx) => {
    const info = stageInfo(s);
    const st = statusOf(s);
    const collapsed = !openStages.has(s.id);
    const isCurrent = cur && cur.id === s.id && st.key === "doing";
    const cardCls = "stage" + (collapsed ? " collapsed" : "") + (st.key === "done" ? " is-done" : "") + (isCurrent ? " is-current" : "") +
      (!openStages.has(s.id) ? " not-open" : "");
    const tasks = s.tasks.map(t =>
      '<div class="task' + (t.done ? " done" : "") + '">' +
        '<span class="check" data-action="toggle-task" data-sid="' + s.id + '" data-tid="' + t.id + '">' + IC.check + '</span>' +
        '<span class="task-text">' + esc(t.text) + '</span>' +
        '<button class="task-del" data-action="del-task" data-sid="' + s.id + '" data-tid="' + t.id + '" aria-label="删除">' + IC.trash + '</button>' +
      '</div>'
    ).join("");
    return '<article class="' + cardCls + '" data-card="' + s.id + '">' +
      '<div class="stage-head" data-action="toggle-stage" data-sid="' + s.id + '">' +
        '<div class="stage-num">' + (idx + 1) + '</div>' +
        '<div class="stage-title">' +
          '<h3>' + esc(s.name) + ' <span class="badge ' + st.badge + (st.badge ? " dot" : "") + '">' + st.label + '</span></h3>' +
          '<div class="stage-prog"><span>' + info.done + ' / ' + info.total + ' 项</span>' +
            '<span class="bar mini-bar thin ' + (st.key === "done" ? "sage" : "") + '"><span style="width:' + info.pct + '%"></span></span>' +
            '<span>' + info.pct + '%</span></div>' +
          '</div>' +
          '<div class="stage-toggle">' + IC.chevron + '</div>' +
        '</div>' +
        '<div class="stage-body">' +
          '<div class="stage-fields">' +
            '<div class="field"><label>开始日期</label><input type="date" data-bind="stage:start" data-id="' + s.id + '" value="' + esc(s.start) + '"></div>' +
            '<div class="field"><label>完成日期</label><input type="date" data-bind="stage:end" data-id="' + s.id + '" value="' + esc(s.end) + '"></div>' +
            '<div class="field" style="flex:1 1 260px;min-width:200px"><label>备注</label><input type="text" data-bind="stage:note" data-id="' + s.id + '" value="' + esc(s.note) + '" placeholder="阶段备注 / 验收要点"></div>' +
            '<div class="field" style="justify-content:flex-end"><label>&nbsp;</label><button class="btn sm danger-ghost" data-action="del-stage" data-sid="' + s.id + '">' + IC.trash + ' 删除阶段</button></div>' +
          '</div>' +
          tasks +
          '<div class="add-task">' +
            '<input id="add-' + s.id + '" data-add-task="' + s.id + '" placeholder="添加任务，回车确认">' +
            '<button class="btn sm primary" data-action="add-task" data-sid="' + s.id + '">' + IC.plus + ' 添加</button>' +
          '</div>' +
        '</div>' +
      '</article>';
  }).join("");

  return '<div class="stage-tools">' +
      '<button class="btn sm" data-action="expand-all">展开全部</button>' +
      '<button class="btn sm" data-action="collapse-all">收起全部</button>' +
      '<span class="spacer" style="flex:1"></span>' +
      '<button class="btn primary sm" data-action="add-stage">' + IC.plus + ' 新增阶段</button>' +
    '</div>' +
    '<div class="timeline">' + cards + '</div>';
}

/* ============================================================
 *  视图：工艺要求
 * ============================================================ */
function stdCardHTML(s) {
  const lvlCls = s.level === "关键" ? "danger" : s.level === "重要" ? "warn" : "";
  return '<div class="std' + (s.checked ? " checked" : "") + '">' +
    '<div class="std-top">' +
      '<span class="tag">' + esc(s.cat) + '</span>' +
      (s.level ? '<span class="badge ' + lvlCls + '">' + esc(s.level) + '</span>' : '') +
      '<span class="spacer"></span>' +
      '<button class="edit" data-action="edit-standard" data-id="' + s.id + '" aria-label="编辑">' + IC.edit + '</button>' +
      '<button class="del" data-action="del-standard" data-id="' + s.id + '" aria-label="删除">' + IC.trash + '</button>' +
    '</div>' +
    '<h4>' + esc(s.title) + '</h4>' +
    '<p>' + esc(s.detail) + '</p>' +
    '<div class="std-foot">' +
      '<button class="conf" data-action="toggle-standard" data-id="' + s.id + '">' + IC.check + ' ' + (s.checked ? "已确认" : "标记已确认") + '</button>' +
    '</div>' +
  '</div>';
}
function stdFiltered() {
  return state.standards.filter(s =>
    (stdCat === "全部" || s.cat === stdCat) &&
    (!stdQuery || (s.title + s.detail + s.cat).toLowerCase().includes(stdQuery.toLowerCase()))
  );
}
function stdCardsHTML() {
  const list = stdFiltered();
  if (!list.length) return '<div class="empty" style="grid-column:1/-1">' + IC.empty + '<p>没有匹配的工艺条目</p></div>';
  return list.map(stdCardHTML).join("");
}
function viewStandards() {
  const cats = ["全部"].concat(Array.from(new Set(state.standards.map(s => s.cat))));
  const chips = cats.map(c => '<button class="chip' + (c === stdCat ? " active" : "") + '" data-action="std-filter" data-cat="' + esc(c) + '">' + esc(c) + '</button>').join("");
  const totalKey = state.standards.filter(s => s.level === "关键").length;
  return '<div class="filter-bar">' + chips +
      '<div class="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>' +
        '<input id="stdSearch" placeholder="搜索工艺…" value="' + esc(stdQuery) + '"></div>' +
      '</div>' +
      '<div class="section-head"><h2>共 ' + state.standards.length + ' 条</h2><span class="sub">关键项 ' + totalKey + ' 条 · 建议逐条在施工前确认</span><span class="spacer"></span>' +
        '<button class="btn primary sm" data-action="add-standard">' + IC.plus + ' 新增工艺</button></div>' +
      '<div class="std-grid" id="stdGrid">' + stdCardsHTML() + '</div>';
}

/* ============================================================
 *  视图：预算管理
 * ============================================================ */
function viewBudget() {
  const bt = budgetTotal();
  const exp = expTotals();
  const remain = bt - exp.paid;
  const summary = '<div class="budget-summary">' +
    '<div class="bs"><div class="l">预算合计</div><div class="v accent">' + money(bt) + '</div></div>' +
    '<div class="bs"><div class="l">已支付（实际开支）</div><div class="v" style="color:var(--ok)">' + money(exp.paid) + '</div></div>' +
    '<div class="bs"><div class="l">已享优惠</div><div class="v" style="color:var(--gold)">-' + money(exp.discount) + '</div></div>' +
    '<div class="bs"><div class="l">预算结余</div><div class="v">' + money(remain) + '</div></div>' +
  '</div>';

  const blocks = catsUsed().map(cat => {
    const items = state.budget.filter(b => b.cat === cat);
    const sub = catTotal(cat);
    const color = CAT_COLORS[cat] || "#bf5a2f";
    const rows = items.map(b =>
      '<tr>' +
        '<td class="strong" style="min-width:150px">' + esc(b.sub) + '</td>' +
        '<td style="min-width:220px"><input class="cell-input note" data-bind="budget:note" data-id="' + b.id + '" value="' + esc(b.note) + '"></td>' +
        '<td class="num" style="white-space:nowrap">' + esc(b.qty) + ' <span style="color:var(--muted)">' + esc(b.unit || "") + '</span></td>' +
        '<td class="right"><input class="cell-input w-sm" type="number" data-bind="budget:amount" data-id="' + b.id + '" value="' + num(b.amount) + '"></td>' +
        '<td class="right" style="white-space:nowrap"><button class="btn sm danger-ghost" data-action="del-budget" data-id="' + b.id + '">' + IC.trash + '</button></td>' +
      '</tr>'
    ).join("");
    return '<div class="cat-block">' +
      '<div class="cat-block-head">' +
        '<span class="cat-dot" style="background:' + color + '"></span>' +
        '<h3>' + esc(cat) + '</h3>' +
        '<span class="cat-sum">' + money(sub) + '</span>' +
        '<button class="btn sm ghost" data-action="add-budget" data-cat="' + esc(cat) + '" style="margin-left:10px">' + IC.plus + '</button>' +
      '</div>' +
      '<div class="card table-wrap"><table class="data"><thead><tr>' +
        '<th>项目明细</th><th>详细备注</th><th>工程量</th><th class="right">合价 (元)</th><th class="right">操作</th>' +
      '</tr></thead><tbody>' + rows + '</tbody>' +
      '<tfoot><tr><td colspan="3">' + esc(cat) + ' 小计</td><td class="right">' + money(sub) + '</td><td></td></tr></tfoot>' +
      '</table></div>' +
    '</div>';
  }).join("");

  return summary +
    '<div class="section-head"><h2>预算明细</h2><span class="sub">合价可直接修改，自动汇总</span><span class="spacer"></span>' +
      '<button class="btn primary sm" data-action="add-budget">' + IC.plus + ' 添加预算项</button></div>' +
    blocks +
    '<div class="card card-pad" style="display:flex;align-items:center;gap:14px;background:var(--surface-2)">' +
      '<span class="eyebrow" style="color:var(--muted)">合计</span>' +
      '<span style="font-family:var(--serif);font-size:26px;font-weight:600">' + money(bt) + '</span>' +
      '<span class="spacer" style="flex:1"></span>' +
      '<span style="font-size:12.5px;color:var(--muted)">共 ' + state.budget.length + ' 个明细项 · ' + catsUsed().length + ' 大类</span>' +
    '</div>';
}

/* ============================================================
 *  视图：实际开支
 * ============================================================ */
function viewExpenses() {
  const t = expTotals();
  const summary = '<div class="budget-summary">' +
    '<div class="bs"><div class="l">原价合计</div><div class="v">' + money(t.price) + '</div></div>' +
    '<div class="bs"><div class="l">优惠合计</div><div class="v" style="color:var(--gold)">-' + money(t.discount) + '</div></div>' +
    '<div class="bs"><div class="l">实际支付</div><div class="v" style="color:var(--ok)">' + money(t.paid) + '</div></div>' +
    '<div class="bs"><div class="l">已记录</div><div class="v">' + state.expenses.length + ' <small style="font-size:14px;color:var(--muted)">笔</small></div></div>' +
  '</div>';

  const rows = state.expenses.map(e => {
    const at = expAttachCount(e);
    return '<tr>' +
      '<td><span class="tag">' + esc(e.cat) + '</span></td>' +
      '<td class="strong" style="min-width:90px">' + esc(e.product) + '</td>' +
      '<td style="max-width:280px;color:var(--muted);font-size:12px">' + esc(e.spec || "—") + '</td>' +
      '<td class="num right">' + money(e.price) + '</td>' +
      '<td class="num right" style="color:var(--gold);font-weight:600">-' + money(e.discount) + '</td>' +
      '<td class="num right" style="color:var(--ok);font-weight:600">' + money(e.paid) + '</td>' +
      '<td style="font-size:12px;color:var(--muted);min-width:120px">' + esc(e.method || "—") + '</td>' +
      '<td style="font-size:12px;min-width:130px"><span class="badge ' + (at ? "info" : "") + '">' + (at ? (at + " 个附件") : "未上传附件") + '</span></td>' +
      '<td class="right" style="white-space:nowrap">' +
        '<button class="btn sm" data-action="attachments" data-id="' + e.id + '">附件</button>' +
        '<button class="btn sm ghost" data-action="edit-expense" data-id="' + e.id + '">' + IC.edit + ' 编辑</button>' +
        '<button class="btn sm danger-ghost" data-action="del-expense" data-id="' + e.id + '">' + IC.trash + ' 删除</button>' +
      '</td>' +
    '</tr>';
  }).join("");

  return summary +
    '<div class="section-head"><h2>开支台账</h2><span class="sub">原价 − 优惠 = 实际支付 · 支持合同 / 订购联系方式 / 支付截图</span><span class="spacer"></span>' +
      '<button class="btn primary sm" data-action="add-expense">' + IC.plus + ' 记一笔</button></div>' +
    '<div class="card table-wrap"><table class="data"><thead><tr>' +
      '<th>大类</th><th>产品</th><th>规格 / 备注</th><th class="right">原价</th><th class="right">优惠</th><th class="right">实付</th><th>支付方式</th><th>资料</th><th class="right">操作</th>' +
    '</tr></thead><tbody>' + (rows || '<tr><td colspan="9"><div class="empty">' + IC.empty + '<p>暂无开支记录</p></div></td></tr>') + '</tbody>' +
    '<tfoot><tr><td colspan="3">合计</td><td class="right">' + money(t.price) + '</td><td class="right" style="color:var(--gold)">-' + money(t.discount) + '</td><td class="right" style="color:var(--ok)">' + money(t.paid) + '</td><td colspan="3"></td></tr></tfoot>' +
    '</table></div>';
}

/* ============================================================
 *  视图：合同管理
 * ============================================================ */
function contractStatusBadge(st) {
  const map = { "已签约": "info", "履行中": "accent", "已完成": "ok", "草稿": "", "已终止": "danger" };
  const cls = map[st] || "";
  return '<span class="badge ' + cls + (cls ? " dot" : "") + '">' + esc(st) + '</span>';
}
function viewContracts() {
  const t = contractTotals();
  const summary = '<div class="budget-summary">' +
    '<div class="bs"><div class="l">合同数量</div><div class="v">' + t.count + ' <small style="font-size:14px;color:var(--muted)">份</small></div></div>' +
    '<div class="bs"><div class="l">合同总额</div><div class="v accent">' + money(t.amount) + '</div></div>' +
    '<div class="bs"><div class="l">已支付</div><div class="v" style="color:var(--ok)">' + money(t.paid) + '</div></div>' +
    '<div class="bs"><div class="l">增项</div><div class="v" style="color:var(--warn)">' + money(t.extras) + '</div></div>' +
    '<div class="bs"><div class="l">待支付</div><div class="v" style="color:var(--warn)">' + money(t.remain) + '</div></div>' +
    '<div class="bs"><div class="l">优惠</div><div class="v" style="color:var(--gold)">' + money(t.discount) + '</div></div>' +
  '</div>';

  const cards = state.contracts.map(c => {
    const paid = contractPaid(c);
    const discount = contractDiscount(c);
    const pending = contractPending(c);
    const extrasTotal = contractExtrasTotal(c);
    const extrasList = contractExtras(c);
    const net = Math.max(0, num(c.amount) - discount);
    const pct = net ? Math.min(100, paid / net * 100) : 0;
    const ms = c.milestones.map(m => {
      const acts = '<span class="m-acts">' +
        '<button type="button" class="m-edit" data-action="edit-milestone" data-cid="' + c.id + '" data-mid="' + m.id + '" title="编辑节点">' + IC.edit + '</button>' +
        '<button type="button" class="m-del" data-action="del-milestone" data-cid="' + c.id + '" data-mid="' + m.id + '" title="删除节点">' + IC.trash + '</button>' +
      '</span>';
      if (isDiscount(m)) {
        return '<div class="milestone discount">' +
          '<span class="m-check" style="visibility:hidden"></span>' +
          '<span class="m-name" style="color:var(--gold)">' + esc(m.name || "优惠") + (m.due ? ' <span style="color:var(--muted-2);font-size:11.5px">· ' + esc(m.due) + '</span>' : '') + '</span>' +
          '<span class="m-amt" style="color:var(--gold)">-' + money(m.amount) + '</span>' +
          acts +
        '</div>';
      }
      return '<div class="milestone' + (m.paid ? " paid" : "") + '">' +
        '<span class="m-check" data-action="pay-milestone" data-cid="' + c.id + '" data-mid="' + m.id + '" title="点击切换已付/未付">' + IC.check + '</span>' +
        '<span class="m-name">' + esc(m.name) + (m.due ? ' <span style="color:var(--muted-2);font-size:11.5px">· ' + esc(m.due) + '</span>' : '') + '</span>' +
        '<span class="m-amt">' + money(m.amount) + '</span>' +
        acts +
      '</div>';
    }).join("") || '<p style="font-size:12.5px;color:var(--muted);padding:4px 2px">暂无付款节点</p>';

    const extrasRows = extrasList.length ? extrasList.map(x =>
      '<div class="extra-row">' +
        '<span class="x-name">' + esc(x.name || "增项") + '</span>' +
        '<span class="x-amt">' + money(x.amount) + '</span>' +
        '<span class="m-acts">' +
          '<button type="button" class="m-edit" data-action="edit-extra" data-cid="' + c.id + '" data-xid="' + x.id + '" title="编辑增项">' + IC.edit + '</button>' +
          '<button type="button" class="m-del" data-action="del-extra" data-cid="' + c.id + '" data-xid="' + x.id + '" title="删除增项">' + IC.trash + '</button>' +
        '</span>' +
      '</div>'
    ).join("") : '<p class="extra-empty">暂无增项</p>';
    const extrasBlock =
      '<div class="contract-extras">' +
        '<div class="extras-head"><span>增项</span>' + (extrasTotal > 0 ? '<b style="color:var(--warn)">' + money(extrasTotal) + '</b>' : '') + '</div>' +
        extrasRows +
        '<button type="button" class="btn sm" data-action="add-extra" data-cid="' + c.id + '">' + IC.plus + ' 添加增项</button>' +
      '</div>';

    return '<div class="contract">' +
      '<div class="contract-head">' +
        '<div class="contract-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h9l5 5v15H6z"/><path d="M15 2v5h5"/><path d="M9 13h6M9 17h4"/></svg></div>' +
        '<div class="contract-title"><h3>' + esc(c.name) + '</h3>' +
          '<div class="vendor">' + esc(c.vendor) + ' · <span class="tag">' + esc(c.type) + '</span> ' + contractStatusBadge(c.status) + '</div></div>' +
          '<div class="contract-amount"><div class="amt">' + money(c.amount) + '</div></div>' +
        '</div>' +
        (c.note ? '<div class="contract-note">' + esc(c.note) + '</div>' : '') +
        '<div class="contract-meta">' +
          (c.signDate ? '<span>签约 <b>' + esc(c.signDate) + '</b></span>' : '') +
          (c.startDate || c.endDate ? '<span>工期 <b>' + esc(c.startDate || "—") + ' ~ ' + esc(c.endDate || "—") + '</b></span>' : '') +
          '<span>质保 <b style="color:var(--ok)">' + esc(c.warranty || "—") + '</b></span>' +
          '<span>合同金额 <b>' + money(c.amount) + '</b></span>' +
          (extrasTotal > 0 ? '<span>增项 <b style="color:var(--warn)">+' + money(extrasTotal) + '</b></span>' : '') +
          (extrasTotal > 0 ? '<span>合计 <b>' + money(num(c.amount) + extrasTotal) + '</b></span>' : '') +
          '<span>已付 <b style="color:var(--ok)">' + money(paid) + '</b></span>' +
          '<span>待付 <b style="color:var(--accent-2)">' + money(pending) + '</b></span>' +
          (discount > 0 ? '<span>优惠 <b style="color:var(--gold)">' + money(discount) + '</b></span>' : '') +
        '</div>' +
        '<div class="contract-body">' +
          '<div class="contract-progress"><span class="cp-text">已付进度</span><div class="bar thin"><span style="width:' + pct.toFixed(1) + '%"></span></div><span class="cp-text"><b>' + Math.round(pct) + '%</b></span></div>' +
          ms +
          '<div style="margin-top:10px"><button class="btn sm" data-action="add-milestone" data-cid="' + c.id + '">' + IC.plus + ' 添加付款节点</button></div>' +
          extrasBlock +
        '</div>' +
        '<div class="contract-actions" style="padding-top:14px">' +
          '<button class="btn sm ghost" data-action="edit-contract" data-id="' + c.id + '">' + IC.edit + ' 编辑合同</button>' +
          '<button class="btn sm danger-ghost" data-action="del-contract" data-id="' + c.id + '">' + IC.trash + ' 删除</button>' +
        '</div>' +
      '</div>';
  }).join("");

  return summary +
    '<div class="section-head"><h2>合同清单</h2><span class="sub">已签约 · 空调 / 净水</span><span class="spacer"></span>' +
      '<button class="btn primary sm" data-action="add-contract">' + IC.plus + ' 新增合同</button></div>' +
    '<div class="stack">' + cards + '</div>';
}

/* ============================================================
 *  视图：设备选材
 * ============================================================ */
function viewEquipment() {
  const e = state.equipment;
  const acRows = e.acOptions.map(o =>
    '<div class="reco-row"><span class="brand">' + esc(o.brand) + '</span><span class="series">' + esc(o.series) + '</span>' +
      '<span class="spec">' + esc(o.spec || "—") + '</span><span class="price">' + esc(o.price || "—") + '</span></div>'
  ).join("");

  const smart = e.smartHome;
  const smartTotal = smart.items.reduce((a, it) => a + num(it.qty) * num(it.price), 0);
  const smartRows = smart.items.map(it =>
    '<tr><td><span class="tag">' + esc(it.area) + '</span></td><td class="strong">' + esc(it.name) + '</td>' +
      '<td class="num right">' + num(it.qty) + '</td><td class="num right">' + money(it.price) + '</td>' +
      '<td class="num right strong">' + money(num(it.qty) * num(it.price)) + '</td></tr>'
  ).join("");

  const wifi = e.wifi;
  const wifiTotal = wifi.items.reduce((a, it) => a + num(it.qty) * num(it.price), 0);
  const wifiRows = wifi.items.map(it =>
    '<tr><td class="strong">' + esc(it.name) + '</td><td class="num right">' + num(it.qty) + '</td>' +
      '<td class="num right">' + money(it.price) + '</td><td class="num right strong">' + money(num(it.qty) * num(it.price)) + '</td></tr>'
  ).join("");

  const appRows = e.appliances.map(a =>
    '<tr><td class="strong">' + esc(a.type) + '</td><td class="num right">' + (num(a.price) ? money(a.price) : "待定") + '</td>' +
      '<td style="font-size:12px;color:var(--muted)">' + esc(a.note || "") + '</td></tr>'
  ).join("");

  return '<div class="grid g2" style="margin-bottom:18px">' +

      '<div class="card eq-card">' +
        '<h3>中央空调</h3>' +
        '<div class="eq-note">方案对比（从多到少）</div>' +
        '<div class="reco-list">' + acRows + '</div>' +
        '<div class="eq-chosen"><span class="eq-chosen-label">已定</span><span class="eq-chosen-val">' + esc(e.chosenAC) + '</span>' +
          '<span class="eq-chosen-price">' + money(e.acActual) + '</span></div>' +
      '</div>' +

      '<div class="card eq-card">' +
        '<h3>新风 · 地暖</h3>' +
        '<div class="eq-note">三大件另两项</div>' +
        '<div style="font-size:13px;color:var(--ink-soft);line-height:1.7;margin-bottom:12px">' + esc(e.freshAir) + '</div>' +
        '<div class="eq-chosen" style="margin-top:0;margin-bottom:12px"><span class="eq-chosen-label">新风</span><span class="eq-chosen-val">设备 + 安装</span><span class="eq-chosen-price">' + money(e.freshAirActual) + '</span></div>' +
        '<div style="font-size:13px;color:var(--ink-soft);line-height:1.7;margin-bottom:12px">' + esc(e.floorHeat) + '</div>' +
        '<div class="eq-chosen" style="margin-top:0"><span class="eq-chosen-label">地暖</span><span class="eq-chosen-val">锅炉 + 盘管 + 分集水器</span><span class="eq-chosen-price">' + money(e.floorHeatActual) + '</span></div>' +
      '</div>' +

    '</div>' +

    '<div class="card" style="margin-bottom:18px">' +
      '<div class="card-pad" style="padding-bottom:0">' +
        '<div class="section-head" style="margin-bottom:6px"><h2>米家全屋智能</h2><span class="sub">' + esc(smart.note) + '</span></div>' +
      '</div>' +
      '<div class="table-wrap"><table class="data"><thead><tr><th>区域</th><th>产品</th><th class="right">数量</th><th class="right">单价</th><th class="right">小计</th></tr></thead>' +
      '<tbody>' + smartRows + '</tbody>' +
      '<tfoot><tr><td colspan="4">自购合计</td><td class="right">' + money(smartTotal) + '</td></tr></tfoot></table></div>' +
    '</div>' +

    '<div class="grid g2" style="margin-bottom:18px">' +
      '<div class="card">' +
        '<div class="card-pad" style="padding-bottom:0"><div class="section-head" style="margin-bottom:6px"><h2>全屋 WiFi</h2><span class="sub">' + esc(wifi.note) + '</span></div></div>' +
        '<div class="table-wrap"><table class="data"><thead><tr><th>设备</th><th class="right">数量</th><th class="right">单价</th><th class="right">小计</th></tr></thead>' +
        '<tbody>' + wifiRows + '</tbody>' +
        '<tfoot><tr><td colspan="3">合计</td><td class="right">' + money(wifiTotal) + '</td></tr></tfoot></table></div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="card-pad" style="padding-bottom:0"><div class="section-head" style="margin-bottom:6px"><h2>家电报价参考</h2><span class="sub">尺寸 / 预算</span></div></div>' +
        '<div class="table-wrap"><table class="data"><thead><tr><th>品类</th><th class="right">价格</th><th>备注</th></tr></thead><tbody>' + appRows + '</tbody></table></div>' +
      '</div>' +
    '</div>' +

    '<div class="card card-pad" style="background:var(--surface-2)">' +
      '<div class="section-head" style="margin-bottom:6px"><h2>主材品牌参考</h2></div>' +
      '<p style="font-size:13px;color:var(--ink-soft);line-height:1.8">' + esc(e.materialsNote) + '</p>' +
    '</div>';
}

/* ============================================================
 *  视图：插座规划
 * ============================================================ */
function viewSockets() {
  return '<div class="section-head"><h2>插座与开关点位</h2><span class="sub">厨房带开关 · 哑光无边框带安全门 · 洗手间水区带防溅盒</span></div>' +
    '<div class="grid g2">' +
      state.sockets.map(a =>
        '<div class="card socket-area">' +
          '<h3>' + esc(a.area) + ' <span class="badge">' + a.items.length + ' 点位</span></h3>' +
          '<p class="sa-rule">' + esc(a.rule) + '</p>' +
          '<div class="socket-pills">' +
            a.items.map((it, i) =>
              '<span class="socket-pill">' + esc(it) + '<span class="x" data-action="del-socket" data-area="' + a.id + '" data-idx="' + i + '">×</span></span>'
            ).join("") +
          '</div>' +
          '<div class="socket-add"><input id="sk-' + a.id + '" data-add-socket="' + a.id + '" placeholder="添加点位，回车确认">' +
            '<button class="btn sm" data-action="add-socket" data-area="' + a.id + '">' + IC.plus + '</button></div>' +
        '</div>'
      ).join("") +
    '</div>';
}

/* ============================================================
 *  视图：量房记录
 * ============================================================ */
function viewMeasure() {
  const mm = state.measureMeta;
  const metaFields = [
    ["elevator", "电梯门宽 × 高"], ["fireDoor", "消防门"], ["entrance", "入户 / 入口"],
    ["lowVoltBox", "弱电箱规格"], ["lowVoltHeight", "弱电箱距地"], ["powerBox", "配电箱规格"], ["powerHeight", "配电箱距地"]
  ].map(f =>
    '<div class="fg"><label>' + f[1] + '</label>' +
      '<input data-bind="meta:' + f[0] + '" value="' + esc(mm[f[0]] || "") + '" placeholder="待测量"></div>'
  ).join("");

  const rows = state.measure.map(r =>
    '<tr>' +
      '<td class="strong" style="white-space:nowrap">' + esc(r.room) + '</td>' +
      '<td><input class="cell-input measure" data-bind="measure:beamW" data-room="' + esc(r.room) + '" value="' + esc(r.beamW) + '" placeholder="mm"></td>' +
      '<td><input class="cell-input measure" data-bind="measure:beamD" data-room="' + esc(r.room) + '" value="' + esc(r.beamD) + '" placeholder="mm"></td>' +
      '<td><input class="cell-input measure" data-bind="measure:sunken" data-room="' + esc(r.room) + '" value="' + esc(r.sunken) + '" placeholder="mm"></td>' +
      '<td><input class="cell-input measure" data-bind="measure:door" data-room="' + esc(r.room) + '" value="' + esc(r.door) + '" placeholder="宽×高"></td>' +
      '<td><input class="cell-input measure" data-bind="measure:window" data-room="' + esc(r.room) + '" value="' + esc(r.window) + '" placeholder="宽×高"></td>' +
      '<td><input class="cell-input note" data-bind="measure:note" data-room="' + esc(r.room) + '" value="' + esc(r.note) + '" placeholder="备注"></td>' +
    '</tr>'
  ).join("");

  return '<div class="card card-pad" style="margin-bottom:18px">' +
      '<div class="section-head"><h2>公共尺寸</h2><span class="sub">来自量房表模板</span></div>' +
      '<div class="measure-meta">' + metaFields + '</div>' +
    '</div>' +
    '<div class="section-head"><h2>逐间实测</h2><span class="sub">梁宽 / 梁下 / 下沉 / 门洞 / 窗洞</span><span class="spacer"></span>' +
      '<button class="btn sm" data-action="add-room">' + IC.plus + ' 加房间</button></div>' +
    '<div class="card table-wrap"><table class="data measure-table"><thead><tr>' +
      '<th>区域</th><th>梁宽</th><th>梁下</th><th>下沉</th><th>门宽 × 高</th><th>窗洞宽 × 高</th><th>备注</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<p style="font-size:12px;color:var(--muted);margin-top:12px;padding-left:2px">提示：单位统一为 mm。收房时用激光测距仪逐项测量，重点记录梁位、下沉区域与强弱电箱位置。</p>';
}

/* ============================================================
 *  视图：工种准备
 * ============================================================ */
function prepInfo() {
  let total = 0, done = 0;
  (state.preparation || []).forEach(p => p.items.forEach(i => { total++; if (i.done) done++; }));
  return { total, done, pct: total ? Math.round(done / total * 100) : 0 };
}
function viewPreparation() {
  const info = prepInfo();
  const groups = (state.preparation || []).map(p => {
    const d = p.items.filter(i => i.done).length;
    return '<div class="card prep-group"><div class="prep-head"><div><span class="eyebrow">准备节点</span><h2>' + esc(p.phase) + '</h2></div><span class="badge ' + (d === p.items.length ? "ok" : "accent") + '">' + d + ' / ' + p.items.length + '</span></div>' +
      '<div class="bar thin"><span style="width:' + (p.items.length ? d / p.items.length * 100 : 0) + '%"></span></div>' +
      '<div class="prep-list">' + p.items.map(i => '<div class="task ' + (i.done ? "done" : "") + '"><span class="check" data-action="toggle-prep" data-pid="' + p.id + '" data-iid="' + i.id + '">' + IC.check + '</span><span class="task-text">' + esc(i.text) + '</span></div>').join("") + '</div></div>';
  }).join("");
  return '<div class="hero prep-hero"><div class="hero-main"><div class="eyebrow">更新✅装修各项工种准备工作</div><h1>按工种准备，避免返工</h1><div class="hero-meta"><span>自装模式</span><span>已完成 <b>' + info.done + ' / ' + info.total + ' 项</b></span></div></div><div class="hero-ring">' + ringSVG(info.pct) + '<div class="ring-label">准备完成 ' + info.pct + '%</div></div></div><div class="section-head"><h2>工种准备清单</h2><span class="sub">开工前 → 水电 → 木工 → 瓦工 → 油工 → 收尾</span></div><div class="prep-grid">' + groups + '</div>';
}
function viewInspection() {
  const items = state.inspection || [];
  const done = items.filter(x => x.result !== "待检查").length;
  const groups = [...new Set(items.map(x => x.category))];
  return '<div class="hero prep-hero"><div><div class="eyebrow">交付验房</div><h1>收房时逐项检查、拍照留证</h1><div class="hero-meta"><span>已检查 <b>' + done + ' / ' + items.length + '</b></span><span>异常项 <b>' + items.filter(x => x.result === "有问题").length + '</b></span></div></div></div>' + groups.map(cat => '<div class="section-head"><h2>' + esc(cat) + '</h2></div><div class="card record-list">' + items.filter(x => x.category === cat).map(x => '<div class="record-row"><div class="record-main"><b>' + esc(x.task) + '</b><select data-inspection-result="' + x.id + '"><option' + (x.result === "待检查" ? " selected" : "") + '>待检查</option><option' + (x.result === "合格" ? " selected" : "") + '>合格</option><option' + (x.result === "有问题" ? " selected" : "") + '>有问题</option><option' + (x.result === "不适用" ? " selected" : "") + '>不适用</option></select><input data-inspection-note="' + x.id + '" placeholder="检查备注 / 问题位置" value="' + esc(x.note || "") + '"><div class="photo-strip">' + photoLinks(x.photos) + '</div></div><button class="btn sm" data-action="inspection-photo" data-id="' + x.id + '">' + IC.plus + ' 现场照片</button></div>').join("") + '</div>').join("");
}
function viewMaterials() {
  const rows = (state.materials || []).map(m => '<article class="card material-card"><div class="material-top"><div><span class="tag">' + esc(m.result || "待验收") + '</span><h3>' + esc(m.name) + '</h3><p>' + esc([m.brand, m.quantity].filter(Boolean).join(" · ")) + '</p></div><button class="btn sm ghost" data-action="edit-material" data-id="' + m.id + '">' + IC.edit + '</button><button class="btn sm danger-ghost" data-action="del-material" data-id="' + m.id + '">' + IC.trash + '</button></div><div class="material-meta"><span>供应商：' + esc(m.supplier || "—") + '</span><span>进场：' + esc(m.date || "—") + '</span></div><p>' + esc(m.note || "") + '</p><div class="photo-strip">' + photoLinks(m.photos) + '</div><button class="btn sm" data-action="material-photo" data-id="' + m.id + '">' + IC.plus + ' 上传验收照片</button></article>').join("");
  return '<div class="section-head"><div><h2>材料进场验收</h2><span class="sub">核对品牌型号、规格数量、包装外观、合格证及实物，并拍照记录</span></div><span class="spacer"></span><button class="btn primary sm" data-action="add-material">' + IC.plus + ' 登记进场材料</button></div><div class="material-grid">' + (rows || '<div class="card card-pad empty">暂无材料进场记录，点击“登记进场材料”开始记录。</div>') + '</div>';
}
function viewGallery() {
  const rows = (state.gallery || []).map(g => '<article class="card gallery-card"><div class="gallery-head"><div><span class="tag">' + esc(g.stage) + '</span><h3>' + esc(g.location || "施工现场") + '</h3><span class="sub">' + esc(g.date || "") + '</span></div><div><button class="btn sm" data-action="gallery-photo" data-id="' + g.id + '">' + IC.plus + ' 选择照片</button> <button class="btn sm ghost" data-action="edit-gallery" data-id="' + g.id + '">' + IC.edit + '</button> <button class="btn sm danger-ghost" data-action="del-gallery" data-id="' + g.id + '">' + IC.trash + '</button></div></div><p>' + esc(g.note || "") + '</p><div class="gallery-photos">' + photoLinks(g.photos) + '</div></article>').join("");
  return '<div class="section-head"><div><h2>施工阶段留档</h2><span class="sub">每个节点按阶段、区域、日期归档，记录隐蔽工程和验收前后状态</span></div><span class="spacer"></span><button class="btn primary sm" data-action="add-gallery">' + IC.plus + ' 新增阶段留档</button></div><div class="gallery-list">' + (rows || '<div class="card card-pad empty">暂无阶段照片。建议拆改、水电、防水、瓦工、木工、油工和竣工分别留档。</div>') + '</div>';
}
function viewContacts() {
  const rows = (state.contacts || []).map(c => '<article class="card contact-card"><div class="contact-top"><div><span class="tag">' + esc(c.role || "联系人") + '</span><h3>' + esc(c.name) + '</h3><p>' + esc(c.company || "") + '</p></div><button class="btn sm ghost" data-action="edit-contact" data-id="' + c.id + '">' + IC.edit + '</button><button class="btn sm danger-ghost" data-action="del-contact" data-id="' + c.id + '">' + IC.trash + '</button></div><div class="contact-details">' + (c.phone ? '<a href="tel:' + esc(c.phone) + '">电话：' + esc(c.phone) + '</a>' : '') + (c.wechat ? '<span>微信：' + esc(c.wechat) + '</span>' : '') + (c.address ? '<span>店铺 / 地址：' + esc(c.address) + '</span>' : '') + '</div><p>' + esc(c.note || "") + '</p></article>').join("");
  return '<div class="section-head"><div><h2>工长 / 商家通讯录</h2><span class="sub">联系方式、店铺信息和合作备注统一保存</span></div><span class="spacer"></span><button class="btn primary sm" data-action="add-contact">' + IC.plus + ' 新增联系人</button></div><div class="contact-grid">' + (rows || '<div class="card card-pad empty">通讯录为空，添加工长、各工种师傅和材料商家。</div>') + '</div>';
}

/* ============================================================
 *  视图：共同管理
 * ============================================================ */
function viewShare() {
  const current = location.origin && location.origin !== "null" ? location.origin : "http://你的电脑IP:8777";
  return '<div class="share-hero card card-pad"><div class="share-icon">' + IC.info + '</div><div><div class="eyebrow">协作空间</div><h2>和男朋友一起管理</h2><p>进入后默认只读；需要修改时，使用右上角“解锁编辑”。数据由这台 Mac 保管。</p></div></div>' +
    '<div class="grid g2" style="margin-top:16px"><div class="card card-pad"><div class="section-head"><h2>连接共享空间</h2><span class="badge ' + (SERVER ? "ok" : "") + '">' + (SERVER ? "已连接" : "未连接") + '</span></div>' +
    '<div class="fg"><label>共享服务地址</label><input id="apiBaseInput" value="' + esc(localStorage.getItem(API_BASE_KEY) || current) + '" placeholder="例如 http://192.168.1.8:8777"></div>' +
    '<div class="fg" style="margin-top:12px"><label>你的称呼</label><input id="myNameInput" value="' + esc(myName()) + '" placeholder="我 / 男朋友"></div>' +
    '<div style="margin-top:16px;display:flex;gap:9px"><button class="btn primary" data-action="connect">连接并同步</button><button class="btn" data-action="disconnect">仅本机模式</button></div></div>' +
    '<div class="card card-pad"><div class="section-head"><h2>如何分享给别人</h2></div><ol class="share-steps"><li>先安装一次 <code>brew install cloudflared</code>。</li><li>双击 <code>启动公网访问.command</code>，脚本会自动启动服务并创建 HTTPS 公网链接。</li><li>把显示的链接发给男朋友；进入后默认只读。如需编辑，点击右上角“解锁编辑”并输入编辑指令。</li><li>你本机也用该公网链接或 <code>http://localhost:8777</code> 访问同一数据。</li></ol><p class="share-tip">Mac 必须开机、联网且不睡眠。关闭隧道窗口后链接失效，临时链接重启会变化。访问默认只读，编辑指令请只告知可信任的人。</p></div></div>' +
    '<div class="card card-pad" style="margin-top:16px"><div class="section-head"><h2>当前数据归属</h2></div><p style="font-size:13px;color:var(--ink-soft);line-height:1.8">当前为 <b>' + (SERVER ? "共享模式" : "本机模式") + '</b>。本机模式数据只在本浏览器；共享模式数据保存在启动服务的这台电脑中。访客登录后可以编辑全部项目数据。</p></div>';
}

/* ============================================================
 *  视图：备忘清单
 * ============================================================ */
function viewNotes() {
  const done = state.notes.filter(n => n.done).length;
  const rows = state.notes.map(n =>
    '<div class="note-line' + (n.done ? " done" : "") + '">' +
      '<span class="n-check" data-action="toggle-note" data-id="' + n.id + '">' + IC.check + '</span>' +
      '<span class="n-text">' + esc(n.text) + '</span>' +
      '<button class="n-del" data-action="del-note" data-id="' + n.id + '">' + IC.trash + '</button>' +
    '</div>'
  ).join("") || '<div class="empty">' + IC.check + '<p>暂无事项</p></div>';

  return '<div class="grid g2">' +
      '<div class="card card-pad" style="grid-column:1/-1">' +
        '<div class="section-head"><h2>待办事项</h2><span class="sub">' + done + ' / ' + state.notes.length + ' 已完成</span></div>' +
        rows +
        '<div class="add-task" style="margin-top:14px">' +
          '<input id="add-note" data-add-note="1" placeholder="添加事项，回车确认">' +
          '<button class="btn primary sm" data-action="add-note">' + IC.plus + ' 添加</button>' +
        '</div>' +
      '</div>' +
    '</div>';
}

/* ---------------- 修改记录 ---------------- */
function loadHistory(force) {
  if (!SERVER) { historyData = []; return; }
  if (historyData && !force) return;
  fetch(API_BASE + "/api/history", { credentials: "include" })
    .then(r => r.ok ? r.json() : { items: [] })
    .then(d => { historyData = d.items || []; render(); })
    .catch(() => { historyData = []; render(); });
}
function viewHistory() {
  if (!SERVER) return '<div class="card card-pad empty">' + IC.info + '<p>修改记录需连接共享服务后查看。</p></div>';
  if (historyData === null) { loadHistory(); return '<div class="card card-pad empty"><p>正在加载修改记录…</p></div>'; }
  const items = historyData;
  const rows = items.length ? items.map(h => {
    const changes = Array.isArray(h.changes) && h.changes.length;
    const body = changes
      ? '<ul class="hist-changes">' + h.changes.map(c => '<li>' + esc(c) + '</li>').join("") + '</ul>'
      : '<p class="hist-sum">' + esc(h.summary || "保存更新") + '</p>';
    return '<div class="hist-row"><span class="hist-dot"></span><div class="hist-body">' +
      '<div class="hist-head"><b>' + esc(h.user || "未知") + '</b>' +
        (h.name ? ' <span class="tag">' + esc(h.name) + '</span>' : '') +
        '<span class="hist-time">' + esc(h.time || "") + '</span></div>' +
      body +
      ' <span class="hist-rev">rev ' + esc(String(h.rev || "")) + '</span>' +
      '</div></div>';
  }).join("") : '<div class="card card-pad empty">' + IC.info + '<p>暂无修改记录。解锁编辑并修改后会在这里记录。</p></div>';
  return '<div class="section-head"><div><h2>修改记录</h2><span class="sub">按指令用户记录谁在何时改了什么</span></div><span class="spacer"></span>' +
    '<button class="btn sm ghost" data-action="history-refresh">刷新</button>' +
    (items.length ? ' <button class="btn sm danger-ghost" data-action="history-clear">一键清除修改记录</button>' : '') +
    '</div>' +
    '<div class="card card-pad hist-list">' + rows + '</div>';
}
