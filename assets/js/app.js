/* ============================================================
 *  家装项目管理平台 · 应用逻辑
 *  纯前端 · 数据保存在 localStorage
 * ============================================================ */
(function () {
  "use strict";

  const LS_KEY = "zx_pm_v1";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------------- 图标 ---------------- */
  const IC = {
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>',
    empty: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/></svg>'
  };

  /* ---------------- 工具 ---------------- */
  function uid(p) { return (p || "id") + "_" + Math.random().toString(36).slice(2, 9); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function num(n) { const v = Number(n); return isFinite(v) ? v : 0; }
  function money(n) {
    n = num(n);
    const d = Number.isInteger(n) ? 0 : 2;
    return "¥" + n.toLocaleString("zh-CN", { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function moneyWan(n) {
    n = num(n);
    if (Math.abs(n) >= 10000) return "¥" + (n / 10000).toFixed(1) + "万";
    return money(n);
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function fileToDataURL(file) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  }
  async function uploadFile(file) {
    if (SERVER) {
      const fd = new FormData(); fd.append("file", file);
      const r = await fetch(API_BASE + "/api/upload", { method: "POST", body: fd, credentials: "include" });
      if (!r.ok) throw new Error(r.status === 401 ? "登录已过期，请重新登录共享地址" : "服务器上传失败");
      const uploaded = await r.json();
      return API_BASE + uploaded.url;
    }
    if (file.size > 3 * 1024 * 1024) throw new Error("本地模式单文件需小于 3MB，建议启动共享服务");
    return await fileToDataURL(file);
  }

  /* ---------------- 状态 ---------------- */
  let state = load();
  let openStages = new Set();
  let stdCat = "全部";
  let stdQuery = "";
  let focusSel = null;
  let lastRoute = null;
  let saveT = null;

  /* ---------------- 同步 / 协作状态 ---------------- */
  let SERVER = false;          // 是否连接到共享服务
  let API_BASE = "";           // 共享服务地址（同源则为空）
  let lastRev = -1;            // 已同步的版本号
  let lastSyncAt = null;
  let pushT = null;
  let ROLE = null;             // 'view' | 'edit'
  let IDENTITY = "";           // 当前编辑指令对应的用户标识（仅用于修改记录）
  let historyData = null;      // 修改记录缓存
  let remoteEmpty = false;     // 服务端是否暂无数据（用于解锁时把本地数据落盘）
  const MY_NAME_KEY = "zx_my_name";
  const API_BASE_KEY = "zx_api_base";
  function myName() { return localStorage.getItem(MY_NAME_KEY) || "我"; }
  function canEdit() { return ROLE === "edit"; }

  /* 只读模式下允许的非变更动作，其余一律提示无权限 */
  const VIEW_ONLY_ACTIONS = new Set([
    "connect", "disconnect", "toggle-edit", "export", "print",
    "std-filter", "expand-all", "collapse-all", "toggle-stage",
    "lightbox", "attachments"
  ]);

  function normalizeState(input) {
    if (!input || typeof input !== "object" || !Array.isArray(input.stages) || input.stages.length === 0) return clone(window.SEED);
    const obj = input;
    Object.keys(window.SEED).forEach(key => {
      if (obj[key] == null) obj[key] = clone(window.SEED[key]);
    });
    ["preparation", "inspection", "materials", "contacts", "gallery"].forEach(k => {
      obj[k] = obj[k] || clone(window.SEED[k] || []);
    });
    obj.expenses = (obj.expenses || []).map(e => {
      if (e.price == null) e.price = num(e.amount);
      if (e.discount == null) e.discount = 0;
      if (e.pending == null) e.pending = Math.max(0, e.price - e.discount - num(e.paid));
      e.attachments = e.attachments || { contract: [], order: [], pay: [] };
      e.contact = e.contact || "";
      return e;
    });
    (obj.contracts || []).forEach(c => {
      c.extras = c.extras || [];
      if (c.warranty == null) c.warranty = "整体质保 2 年";
      (c.milestones || []).forEach(m => {
        if (m.kind == null) m.kind = "pay";
        // 历史数据：空调 468 / 净水器 400 为优惠返现，不是待付
        if (m.kind === "pay" && ((c.id === "c01" && num(m.amount) === 468) || (c.id === "c02" && num(m.amount) === 400))) {
          m.kind = "discount"; m.name = "优惠"; m.paid = false;
        }
        if (m.kind === "discount" && m.name === "优惠返现") m.name = "优惠";
      });
    });
    return obj;
  }
  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return normalizeState(JSON.parse(raw));
    } catch (e) { /* ignore */ }
    return clone(window.SEED);
  }
  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
    catch (e) { toast("保存失败，浏览器存储可能已满", false); }
    if (SERVER && canEdit()) {
      clearTimeout(pushT);
      pushT = setTimeout(() => {
        fetch(API_BASE + "/api/state", {
          method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include",
          body: JSON.stringify({ state: state, by: myName() })
        }).then(r => r.ok ? r.json() : null).then(j => {
          if (j && typeof j.rev === "number") { lastRev = j.rev; historyData = null; }
          lastSyncAt = Date.now(); updateSyncLabel();
        }).catch(() => { SERVER = false; updateSyncLabel(); });
      }, 180);
    }
    const el = $("#saveState");
    if (el) {
      el.classList.add("saving");
      const label = el.querySelector("span");
      if (label) label.textContent = "保存中…";
      clearTimeout(saveT);
      saveT = setTimeout(() => {
        el.classList.remove("saving");
        if (label) label.textContent = "已自动保存";
      }, 550);
    }
  }

  /* ---------------- 派生计算 ---------------- */
  const BUDGET_CATS = ["三大件", "基础硬装", "全屋成品主材", "收尾项目", "全屋定制", "家具家电软装"];
  const CAT_COLORS = { "三大件": "#2f6b54", "基础硬装": "#4f8a6f", "全屋成品主材": "#c0773c", "收尾项目": "#3f6f96", "全屋定制": "#7a9e88", "家具家电软装": "#a9738c" };

  function stageInfo(s) {
    const total = s.tasks.length;
    const done = s.tasks.filter(t => t.done).length;
    return { total, done, pct: total ? Math.round(done / total * 100) : 0 };
  }
  function overallPct() {
    let t = 0, d = 0;
    state.stages.forEach(s => { t += s.tasks.length; d += s.tasks.filter(x => x.done).length; });
    return t ? d / t * 100 : 0;
  }
  function currentStage() {
    return state.stages.find(s => { const i = stageInfo(s); return i.done > 0 && i.done < i.total; })
      || state.stages.find(s => stageInfo(s).done === 0)
      || state.stages[state.stages.length - 1];
  }
  function findStage(id) { return state.stages.find(s => s.id === id); }
  function budgetTotal() { return state.budget.reduce((a, b) => a + num(b.amount), 0); }
  function catTotal(cat) { return state.budget.filter(b => b.cat === cat).reduce((a, b) => a + num(b.amount), 0); }
  function catsUsed() { return BUDGET_CATS.filter(c => state.budget.some(b => b.cat === c)); }
  function expTotals() {
    let price = 0, discount = 0, paid = 0, pending = 0;
    state.expenses.forEach(e => {
      price += num(e.price); discount += num(e.discount);
      paid += num(e.paid); pending += num(e.pending);
    });
    return { price, discount, paid, pending };
  }
  function expAttachCount(e) {
    const a = e.attachments || {};
    return (a.contract || []).length + (a.order || []).length + (a.pay || []).length;
  }
  function isDiscount(m) { return m.kind === "discount"; }
  function contractPaid(c) { return c.milestones.filter(m => !isDiscount(m) && m.paid).reduce((a, m) => a + num(m.amount), 0); }
  function contractDiscount(c) { return c.milestones.filter(isDiscount).reduce((a, m) => a + num(m.amount), 0); }
  function contractPending(c) { return c.milestones.filter(m => !isDiscount(m) && !m.paid).reduce((a, m) => a + num(m.amount), 0); }
  function contractExtras(c) { return c.extras || []; }
  function contractExtrasTotal(c) { return (c.extras || []).reduce((a, x) => a + num(x.amount), 0); }
  function contractTotals() {
    let amount = 0, paid = 0, discount = 0, remain = 0, extras = 0;
    state.contracts.forEach(c => { amount += num(c.amount); paid += contractPaid(c); discount += contractDiscount(c); remain += contractPending(c); extras += contractExtrasTotal(c); });
    return { amount, paid, discount, remain, extras, count: state.contracts.length };
  }

  function updateEditToggle() {
    const button = $("#editToggle");
    const text = $("#editToggleText");
    if (!button || !text) return;
    text.textContent = canEdit() ? "退出编辑" : "解锁编辑";
    button.title = canEdit() ? "切换为只读" : "输入编辑指令";
  }
  function updateSyncLabel() {
    updateEditToggle();
    const el = $("#saveState"); if (!el) return;
    const label = el.querySelector("span");
    if (SERVER) {
      if (label) label.textContent = canEdit() ? ("已同步 · " + (IDENTITY || myName())) : "只读 · 仅查看";
      el.title = canEdit() ? "共享服务已连接（可编辑）" : "共享服务已连接（只读）";
    }
    else if (label) label.textContent = "仅本机保存";
  }
  async function connectServer(base) {
    API_BASE = (base || "").replace(/\/+$/, "");
    try {
      const session = await fetch(API_BASE + "/api/session", { credentials: "include" });
      const auth = await session.json();
      ROLE = auth.role === "edit" ? "edit" : "view";
      IDENTITY = auth.identity || "";
      const r = await fetch(API_BASE + "/api/state", { credentials: "include" });
      if (!r.ok) throw new Error("offline");
      const j = await r.json();
      const hasRemoteState = j && j.state && Array.isArray(j.state.stages) && j.state.stages.length > 0;
      remoteEmpty = !hasRemoteState;
      if (hasRemoteState) {
        state = normalizeState(j.state);
        lastRev = j.rev || 0;
        localStorage.setItem(LS_KEY, JSON.stringify(state));
      }
      SERVER = true; localStorage.setItem(API_BASE_KEY, API_BASE); updateSyncLabel();
      if (!hasRemoteState) save();
      if (!window.__syncTimer) window.__syncTimer = setInterval(pullServer, 2000);
      render(); toast("已连接共享空间");
    } catch (e) { SERVER = false; updateSyncLabel(); toast("无法连接共享服务，请确认对方已启动", false); }
  }
  async function pullServer() {
    if (!SERVER) return;
    try {
      const r = await fetch(API_BASE + "/api/state?since=" + lastRev, { credentials: "include" });
      if (r.status === 401 || r.status === 403) { return; }
      const j = await r.json();
      if (j && j.state && Array.isArray(j.state.stages) && typeof j.rev === "number" && j.rev > lastRev) {
        state = normalizeState(j.state); lastRev = j.rev; historyData = null; localStorage.setItem(LS_KEY, JSON.stringify(state)); render(); lastSyncAt = Date.now(); updateSyncLabel();
      }
    } catch (e) { SERVER = false; updateSyncLabel(); }
  }

  /* ---------------- Toast ---------------- */
  function toast(msg, ok = true) {
    const w = $("#toastWrap");
    if (!w) return;
    const t = document.createElement("div");
    t.className = "toast" + (ok ? " ok" : "");
    t.innerHTML = (ok ? IC.check : IC.info) + "<span>" + esc(msg) + "</span>";
    w.appendChild(t);
    setTimeout(() => {
      t.style.transition = "opacity .3s, transform .3s";
      t.style.opacity = "0";
      t.style.transform = "translateY(8px)";
      setTimeout(() => t.remove(), 320);
    }, 2200);
  }

  /* ---------------- 模态框 ---------------- */
  function openModal(opt) {
    const root = $("#modalRoot");
    const fields = opt.fields || [];
    const body = fields.map(fieldHTML).join("");
    root.innerHTML =
      '<div class="modal-mask" data-close></div>' +
      '<form class="modal" id="modalForm" autocomplete="off">' +
        '<div class="modal-head"><h3>' + esc(opt.title) + '</h3>' +
          '<button type="button" class="modal-x" data-close aria-label="关闭">' + IC.close + '</button>' +
        '</div>' +
        '<div class="modal-body"><div class="form-grid">' + body + '</div></div>' +
        '<div class="modal-foot">' +
          '<button type="button" class="btn ghost" data-close>取消</button>' +
          '<button type="submit" class="btn primary">' + esc(opt.submit || "保存") + '</button>' +
        '</div>' +
      '</form>';
    root.classList.add("open");
    const form = $("#modalForm");

    fields.forEach(f => {
      const el = form.querySelector('[name="' + f.name + '"]');
      if (el && f.value != null) el.value = f.value;
    });

    const close = () => { root.classList.remove("open"); root.innerHTML = ""; };
    root.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", close));
    form.addEventListener("submit", ev => {
      ev.preventDefault();
      const data = {};
      fields.forEach(f => {
        const el = form.querySelector('[name="' + f.name + '"]');
        let v = el.value;
        if (f.type === "number") v = v === "" ? "" : Number(v);
        data[f.name] = v;
      });
      const res = opt.onSubmit(data);
      if (res !== false) close();
    });
    const first = form.querySelector("input,textarea,select");
    if (first) setTimeout(() => first.focus(), 60);
  }
  function fieldHTML(f) {
    const cls = "fg" + (f.full ? " full" : "");
    let inner = "";
    if (f.type === "textarea") {
      inner = '<textarea name="' + f.name + '" rows="3" placeholder="' + esc(f.placeholder || "") + '">' + esc(f.value || "") + "</textarea>";
    } else if (f.type === "select") {
      inner = '<select name="' + f.name + '">' + (f.options || []).map(o => '<option value="' + esc(o) + '">' + esc(o) + "</option>").join("") + "</select>";
    } else {
      inner = '<input name="' + f.name + '" type="' + (f.type || "text") + '"' +
        (f.step ? ' step="' + f.step + '"' : "") +
        ' placeholder="' + esc(f.placeholder || "") + '" value="' + esc(f.value == null ? "" : f.value) + '">';
    }
    return '<div class="' + cls + '"><label>' + esc(f.label) + "</label>" + inner + "</div>";
  }

  /* ---------------- 路由 ---------------- */
  const ROUTE_META = {
    overview: { title: "项目总览", sub: "自装新房全流程管理 · 我和男朋友共同维护" },
    inspection: { title: "收房验房", sub: "逐项检查、记录问题并上传现场照片" },
    preparation: { title: "工种准备", sub: "按工种与施工节点准备 · 来自装修准备清单" },
    materials: { title: "材料进场验收", sub: "核对品牌型号、规格数量、外观与现场照片" },
    gallery: { title: "阶段留档", sub: "按施工阶段保存现场照片与备注" },
    contacts: { title: "工长 / 商家通讯录", sub: "保存施工师傅、工长和商家联系方式" },
    stages: { title: "阶段流程", sub: "按施工顺序推进 · 勾选任务自动统计进度" },
    standards: { title: "工艺要求", sub: "施工关键控制点与避坑清单" },
    budget: { title: "预算管理", sub: "全屋预算明细 · 实时合计" },
    expenses: { title: "实际开支", sub: "已付 / 待付台账，实时汇总" },
    contracts: { title: "合同管理", sub: "供应商合同、付款节点与履约进度" },
    equipment: { title: "设备选材", sub: "三大件 · 米家智能 · 全屋WiFi · 家电报价" },
    sockets: { title: "插座规划", sub: "按空间的开关插座点位清单" },
    measure: { title: "量房记录", sub: "梁宽 / 门洞 / 下沉 / 强弱电箱实测" },
    notes: { title: "备忘清单", sub: "收房、报备、尺寸确认等事项" },
    history: { title: "修改记录", sub: "谁在何时改了什么 · 按指令用户记录" },
    share: { title: "共同管理", sub: "和男朋友一起实时维护同一份装修进度" }
  };
  function currentRoute() {
    const h = (location.hash || "").replace("#", "");
    return ROUTE_META[h] ? h : "overview";
  }
  function render() {
    const route = currentRoute();
    const meta = ROUTE_META[route];
    const title = $("#pageTitle"), sub = $("#pageSub");
    if (title) title.textContent = meta.title;
    if (sub) sub.textContent = meta.sub;
    document.title = meta.title + " · 家装管理";
    $$(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.route === route));
    const same = route === lastRoute;
    const scroll = window.scrollY;
    const view = $("#view");
    view.innerHTML = VIEWS[route]();
    if (same) window.scrollTo(0, scroll); else window.scrollTo(0, 0);
    lastRoute = route;
    if (focusSel) { const n = document.querySelector(focusSel); if (n) n.focus(); focusSel = null; }
  }
  function refresh() { render(); }

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

  const VIEWS = {
    overview: viewOverview,
    preparation: viewPreparation,
    inspection: viewInspection,
    materials: viewMaterials,
    gallery: viewGallery,
    contacts: viewContacts,
    stages: viewStages,
    standards: viewStandards,
    budget: viewBudget,
    expenses: viewExpenses,
    contracts: viewContracts,
    equipment: viewEquipment,
    sockets: viewSockets,
    measure: viewMeasure,
    notes: viewNotes,
    history: viewHistory,
    share: viewShare
  };

  /* ============================================================
   *  操作实现
   * ============================================================ */
  function attachmentPicker(onFiles, accept = "image/*") {
    const input = document.createElement("input");
    input.type = "file"; input.accept = accept; input.multiple = true;
    input.onchange = async () => {
      for (const file of input.files) {
        try { await onFiles(file); }
        catch (err) { toast(err.message || "上传失败", false); }
      }
    };
    input.click();
  }
  function photoLinks(files) {
    return (files || []).map(f => '<a class="photo-thumb" href="' + esc(f.url) + '" data-action="lightbox" data-src="' + esc(f.url) + '" rel="noopener"><img src="' + esc(f.url) + '" alt="' + esc(f.name || "现场照片") + '" loading="lazy"></a>').join("");
  }
  function lightbox(src) {
    if (!src) return;
    let box = document.getElementById("lightbox");
    if (!box) {
      box = document.createElement("div");
      box.id = "lightbox";
      box.className = "lightbox";
      box.addEventListener("click", () => box.remove());
      document.body.appendChild(box);
    }
    box.innerHTML = '<button class="close" aria-label="关闭">×</button><img src="' + src + '" alt="照片预览">';
  }
  async function addPhotoTo(collection, id, file) {
    const url = await uploadFile(file);
    const record = collection.find(x => x.id === id);
    if (!record) return;
    record.photos = record.photos || [];
    record.photos.push({ name: file.name, url, date: new Date().toISOString() });
    save(); render();
  }
  function contactModal(existing) {
    const c = existing || {};
    openModal({ title: existing ? "编辑联系人" : "新增联系人", submit: existing ? "保存" : "添加", fields: [
      { name: "name", label: "姓名 / 商家", value: c.name || "", placeholder: "例如：水电工张师傅" },
      { name: "role", label: "类别", value: c.role || "工长", placeholder: "工长 / 工种师傅 / 商家" },
      { name: "phone", label: "电话", value: c.phone || "", placeholder: "手机号" },
      { name: "wechat", label: "微信", value: c.wechat || "", placeholder: "微信号" },
      { name: "company", label: "店铺 / 公司", value: c.company || "" },
      { name: "address", label: "地址 / 订单链接", value: c.address || "" },
      { name: "note", label: "备注", full: true, type: "textarea", value: c.note || "" }
    ], onSubmit(d) {
      const target = existing || { id: uid("contact"), createdAt: new Date().toISOString() };
      Object.assign(target, d);
      if (!existing) state.contacts.push(target);
      save(); render(); toast(existing ? "联系人已更新" : "联系人已添加");
    }});
  }
  function materialModal(existing) {
    const m = existing || {};
    openModal({ title: existing ? "编辑材料验收" : "登记进场材料", submit: existing ? "保存" : "添加", fields: [
      { name: "name", label: "材料名称", value: m.name || "", placeholder: "瓷砖 / 电线 / 水管 / 板材" },
      { name: "brand", label: "品牌 / 型号", value: m.brand || "" },
      { name: "quantity", label: "规格数量", value: m.quantity || "" },
      { name: "supplier", label: "供应商", value: m.supplier || "" },
      { name: "date", label: "进场日期", type: "date", value: m.date || "" },
      { name: "result", label: "验收结果", type: "select", options: ["待验收", "合格", "有问题", "退换货"], value: m.result || "待验收" },
      { name: "note", label: "验收备注", type: "textarea", full: true, value: m.note || "" }
    ], onSubmit(d) {
      const target = existing || { id: uid("mat"), photos: [] };
      Object.assign(target, d); if (!existing) state.materials.unshift(target);
      save(); render(); toast(existing ? "材料记录已更新" : "材料已登记");
    }});
  }
  function galleryModal(existing) {
    const g = existing || {};
    openModal({ title: existing ? "编辑阶段留档" : "新增阶段留档", submit: existing ? "保存" : "添加", fields: [
      { name: "stage", label: "施工阶段", value: g.stage || "", placeholder: "拆改 / 水电 / 瓦工 / 木工 / 油工" },
      { name: "date", label: "拍摄日期", type: "date", value: g.date || new Date().toISOString().slice(0,10) },
      { name: "location", label: "区域 / 点位", value: g.location || "" },
      { name: "note", label: "备注", type: "textarea", full: true, value: g.note || "" }
    ], onSubmit(d) {
      const target = existing || { id: uid("gallery"), photos: [] };
      Object.assign(target, d); if (!existing) state.gallery.unshift(target);
      save(); render(); toast(existing ? "留档已更新" : "阶段留档已添加");
    }});
  }

  function galleryPhotoPicker(recordId) {
    const rec = (state.gallery || []).find(x => x.id === recordId);
    if (!rec) return;
    rec.photos = rec.photos || [];
    const root = $("#modalRoot");
    function pool() {
      const seen = new Set(), out = [];
      [state.gallery, state.inspection, state.materials].forEach(coll => (coll || []).forEach(r => (r.photos || []).forEach(p => {
        if (p && p.url && !seen.has(p.url)) { seen.add(p.url); out.push(p); }
      })));
      return out;
    }
    const inRec = url => rec.photos.some(p => p.url === url);
    function draw() {
      const items = pool().map(p => {
        const on = inRec(p.url);
        return '<button type="button" class="pick-item' + (on ? ' on' : '') + '" data-action="pick-toggle" data-url="' + esc(p.url) + '" title="' + esc(p.name || "照片") + '"><img src="' + esc(p.url) + '" alt="" loading="lazy"><span class="pick-mark">' + (on ? "✓" : "+") + '</span></button>';
      }).join("");
      const cur = rec.photos.map((p, i) => '<div class="att-chip"><img src="' + esc(p.url) + '" alt=""><button class="att-del" data-action="pick-remove" data-i="' + i + '">' + IC.close + '</button></div>').join("");
      root.innerHTML =
        '<div class="modal-mask" data-action="pick-close"></div>' +
        '<div class="modal pick-modal">' +
          '<div class="modal-head"><div><h3>选择照片 · ' + esc(rec.stage || "") + ' ' + esc(rec.location || "") + '</h3><p class="att-sub">从项目已有照片中勾选，或上传新照片</p></div><button class="icon-btn" data-action="pick-close">' + IC.close + '</button></div>' +
          '<div class="modal-body">' +
            '<div class="att-block"><div class="att-head"><div><b>已选 ' + rec.photos.length + ' 张</b><span>当前留档照片</span></div><button class="btn sm" data-action="pick-upload">' + IC.plus + ' 上传新照片</button></div><div class="att-list pick-current">' + (cur || '<p class="att-empty">还没有照片，从下方选择或上传</p>') + '</div></div>' +
            '<div class="att-block"><div class="att-head"><div><b>项目照片</b><span>点击缩略图添加 / 取消</span></div></div><div class="pick-grid">' + (items || '<p class="att-empty">项目里还没有其它照片</p>') + '</div></div>' +
          '</div>' +
          '<div class="modal-foot"><span class="att-mode">' + (SERVER ? "共享模式" : "本机模式") + '</span><button class="btn primary" data-action="pick-close">完成</button></div>' +
        '</div>';
      root.classList.add("open");
    }
    function close() { root.classList.remove("open"); root.innerHTML = ""; }
    root.onclick = function (ev) {
      const t = ev.target.closest("[data-action]"); if (!t || !root.contains(t)) return;
      const a = t.dataset.action;
      if (a === "pick-close") { close(); }
      else if (a === "pick-toggle") {
        const url = t.dataset.url;
        if (inRec(url)) rec.photos = rec.photos.filter(p => p.url !== url);
        else { const p = pool().find(x => x.url === url); if (p) rec.photos.push({ name: p.name || "照片", url: p.url, date: new Date().toISOString() }); }
        save(); draw(); render();
      } else if (a === "pick-remove") { rec.photos.splice(+t.dataset.i, 1); save(); draw(); render(); }
      else if (a === "pick-upload") {
        const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*"; inp.multiple = true;
        inp.onchange = async () => {
          for (const f of inp.files) { try { const url = await uploadFile(f); rec.photos.push({ name: f.name, url, date: new Date().toISOString() }); } catch (e) { toast(e.message || "上传失败", false); } }
          save(); draw(); render();
        };
        inp.click();
      }
    };
    draw();
  }

  function addTask(sid, text) {
    text = (text || "").trim();
    if (!text) return;
    const s = findStage(sid);
    if (!s) return;
    s.tasks.push({ id: uid("t"), text: text, done: false });
    save();
    focusSel = "#add-" + sid;
    render();
  }

  function expenseModal(existing) {
    const e = existing || {};
    openModal({
      title: existing ? "编辑开支" : "记一笔开支",
      submit: existing ? "保存" : "添加",
      fields: [
        { name: "cat", label: "大类", value: e.cat || "电器", placeholder: "如：三大件 / 电器 / 自装" },
        { name: "product", label: "产品 / 项目", value: e.product || "", placeholder: "如：中央空调" },
        { name: "spec", label: "规格 / 备注", type: "textarea", full: true, value: e.spec || "" },
        { name: "price", label: "原价 / 报价 (元)", type: "number", step: "0.01", value: e.price != null ? e.price : "" },
        { name: "discount", label: "优惠 (元)", type: "number", step: "0.01", value: e.discount != null ? e.discount : 0 },
        { name: "paid", label: "实际支付 (元)", type: "number", step: "0.01", value: e.paid != null ? e.paid : 0 },
        { name: "method", label: "支付方式", value: e.method || "", placeholder: "京东 / 光大信用卡 / 转账" },
        { name: "contact", label: "订购联系方式", value: e.contact || "", placeholder: "姓名、电话、微信、店铺链接" },
        { name: "date", label: "下单 / 支付日期", type: "date", value: e.date || "" },
        { name: "note", label: "备注", type: "textarea", full: true, value: e.note || "" }
      ],
      onSubmit(d) {
        const payload = {
          id: existing ? e.id : uid("e"), cat: d.cat || "其他", product: d.product || "未命名", spec: d.spec || "",
          price: num(d.price), discount: num(d.discount), paid: num(d.paid), pending: Math.max(0, num(d.price) - num(d.discount) - num(d.paid)),
          method: d.method || "", contact: d.contact || "", date: d.date || "", note: d.note || "",
          attachments: e.attachments || { contract: [], order: [], pay: [] }
        };
        if (existing) { Object.assign(e, payload); }
        else { state.expenses.push(payload); }
        save(); refresh(); toast(existing ? "已更新" : "已添加");
      }
    });
  }

  function attachmentModal(exp) {
    if (!exp) return;
    exp.attachments = exp.attachments || { contract: [], order: [], pay: [] };
    const root = $("#modalRoot");
    const groups = [
      { key: "contract", label: "合同 / 协议", hint: "PDF、图片" },
      { key: "order", label: "订购联系方式截图", hint: "订单、联系人、店铺截图" },
      { key: "pay", label: "支付截图", hint: "付款 / 优惠截图" }
    ];
    function isImg(name) { return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name || ""); }
    function draw() {
      const blocks = groups.map(g => {
        const list = exp.attachments[g.key] || [];
        const chips = list.map((f, i) => '<div class="att-chip">' + (isImg(f.name) ? '<img src="' + esc(f.url) + '" alt="">' : '<span class="att-ico">' + IC.empty + '</span>') + '<div class="att-meta"><b title="' + esc(f.name) + '">' + esc(f.name) + '</b><a href="' + esc(f.url) + '" target="_blank" rel="noopener">查看</a></div><button class="att-del" data-action="att-del" data-key="' + g.key + '" data-i="' + i + '">' + IC.close + '</button></div>').join("");
        return '<div class="att-block"><div class="att-head"><div><b>' + g.label + '</b><span>' + g.hint + '</span></div><button class="btn sm" data-action="att-add" data-key="' + g.key + '">' + IC.plus + ' 上传</button></div><div class="att-list">' + (chips || '<p class="att-empty">暂无</p>') + '</div></div>';
      }).join("");
      root.innerHTML = '<div class="modal-mask" data-action="att-close"></div><div class="modal att-modal"><div class="modal-head"><div><h3>资料附件 · ' + esc(exp.product) + '</h3><p class="att-sub">合同、订购联系方式、支付截图统一归档</p></div><button class="icon-btn" data-action="att-close">' + IC.close + '</button></div><div class="modal-body"><div class="fg"><label>订购联系方式</label><textarea id="attContact" rows="2" placeholder="联系人、电话、微信、订单号">' + esc(exp.contact || "") + '</textarea></div>' + blocks + '</div><div class="modal-foot"><span class="att-mode">' + (SERVER ? "共享模式 · 上传至服务器" : "本机模式 · 存于浏览器") + '</span><button class="btn ghost" data-action="att-close">完成</button></div></div>';
      root.classList.add("open");
      const c = $("#attContact"); if (c) c.addEventListener("change", () => { exp.contact = c.value; save(); });
    }
    function pick(key) {
      const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*,application/pdf"; inp.multiple = true;
      inp.onchange = async () => {
        for (const f of inp.files) {
          try { const url = await uploadFile(f); (exp.attachments[key] = exp.attachments[key] || []).push({ name: f.name, url }); }
          catch (e) { toast(e.message || "上传失败", false); }
        }
        save(); draw();
      };
      inp.click();
    }
    function close() { root.classList.remove("open"); root.innerHTML = ""; }
    root.addEventListener("click", function h(ev) {
      const t = ev.target.closest("[data-action]"); if (!t || !root.contains(t)) return;
      const a = t.dataset.action;
      if (a === "att-close") { close(); }
      else if (a === "att-add") { pick(t.dataset.key); }
      else if (a === "att-del") { exp.attachments[t.dataset.key].splice(+t.dataset.i, 1); save(); draw(); }
    });
    draw();
  }

  function contractModal(existing) {
    const c = existing || {};
    const types = ["施工", "设备采购", "定制", "主材", "设计", "其他"];
    const statuses = ["草稿", "已签约", "履行中", "已完成", "已终止"];
    openModal({
      title: existing ? "编辑合同" : "新增合同",
      submit: existing ? "保存" : "创建",
      fields: [
        { name: "name", label: "合同名称", full: true, value: c.name || "", placeholder: "如：基础硬装施工合同" },
        { name: "vendor", label: "供应商 / 施工方", value: c.vendor || "" },
        { name: "type", label: "类型", type: "select", options: types, value: c.type || "施工" },
        { name: "amount", label: "合同金额 (元)", type: "number", step: "0.01", value: c.amount != null ? c.amount : "" },
        { name: "status", label: "状态", type: "select", options: statuses, value: c.status || "草稿" },
        { name: "signDate", label: "签约日期", type: "date", value: c.signDate || "" },
        { name: "startDate", label: "开工日期", type: "date", value: c.startDate || "" },
        { name: "endDate", label: "完工日期", type: "date", value: c.endDate || "" },
        { name: "warranty", label: "质保", value: c.warranty || "", placeholder: "如：整体质保 2 年" },
        { name: "note", label: "备注", type: "textarea", full: true, value: c.note || "" }
      ],
      onSubmit(d) {
        const payload = {
          name: d.name || "未命名合同", vendor: d.vendor || "", type: d.type || "其他",
          amount: num(d.amount), status: d.status || "草稿",
          signDate: d.signDate || "", startDate: d.startDate || "", endDate: d.endDate || "",
          warranty: d.warranty || "", note: d.note || ""
        };
        if (existing) { Object.assign(existing, payload); }
        else { payload.id = uid("c"); payload.milestones = []; state.contracts.push(payload); }
        save(); refresh(); toast(existing ? "已更新" : "已创建");
      }
    });
  }

  function budgetModal(cat) {
    openModal({
      title: "添加预算项",
      submit: "添加",
      fields: [
        { name: "cat", label: "大类", type: "select", options: BUDGET_CATS, value: cat || BUDGET_CATS[0] },
        { name: "sub", label: "项目明细", value: "", placeholder: "如：全屋踢脚线" },
        { name: "qty", label: "工程量", value: "1" },
        { name: "unit", label: "单位", value: "打包" },
        { name: "amount", label: "合价 (元)", type: "number", value: "" },
        { name: "note", label: "详细备注", type: "textarea", full: true, value: "" }
      ],
      onSubmit(d) {
        state.budget.push({ id: uid("b"), cat: d.cat, sub: d.sub || "新项目", note: d.note || "", qty: d.qty || "1", unit: d.unit || "打包", amount: num(d.amount) });
        save(); refresh(); toast("已添加预算项");
      }
    });
  }

  function standardModal(existing) {
    const s = existing || {};
    const cats = Array.from(new Set(state.standards.map(x => x.cat)));
    openModal({
      title: existing ? "编辑工艺" : "新增工艺",
      submit: existing ? "保存" : "添加",
      fields: [
        { name: "cat", label: "分类", value: s.cat || "防水", placeholder: "如：防水 / 水电 / 瓦工瓷砖" },
        { name: "level", label: "重要程度", type: "select", options: ["关键", "重要", "一般"], value: s.level || "重要" },
        { name: "title", label: "标题", full: true, value: s.title || "" },
        { name: "detail", label: "详细要求", type: "textarea", full: true, value: s.detail || "" }
      ],
      onSubmit(d) {
        const payload = { cat: d.cat || "其他", level: d.level || "一般", title: d.title || "未命名", detail: d.detail || "" };
        if (existing) { Object.assign(existing, payload); }
        else { payload.id = uid("g"); payload.checked = false; state.standards.push(payload); }
        save(); refresh(); toast(existing ? "已更新" : "已添加");
      }
    });
  }

  function stageModal() {
    openModal({
      title: "新增阶段",
      submit: "添加",
      fields: [
        { name: "name", label: "阶段名称", full: true, value: "", placeholder: "如：中央空调调试" },
        { name: "note", label: "备注", type: "textarea", full: true, value: "" },
        { name: "tasks", label: "任务（用逗号或换行分隔）", type: "textarea", full: true, value: "" }
      ],
      onSubmit(d) {
        const name = (d.name || "").trim();
        if (!name) return false;
        const tasks = (d.tasks || "").split(/[\n,，]/).map(t => t.trim()).filter(Boolean)
          .map(t => ({ id: uid("t"), text: t, done: false }));
        state.stages.push({ id: uid("s"), name: name, phase: "自定义", start: "", end: "", note: d.note || "", tasks: tasks });
        save(); refresh(); toast("已新增阶段");
      }
    });
  }

  function roomModal() {
    openModal({
      title: "添加房间",
      submit: "添加",
      fields: [{ name: "room", label: "房间名称", full: true, value: "", placeholder: "如：衣帽间" }],
      onSubmit(d) {
        const room = (d.room || "").trim();
        if (!room) return false;
        state.measure.push({ room: room, beamW: "", beamD: "", sunken: "", door: "", window: "", note: "" });
        save(); refresh(); toast("已添加房间");
      }
    });
  }

  function milestoneModal(cid) {
    const c = state.contracts.find(x => x.id === cid);
    if (!c) return;
    openModal({
      title: "添加付款节点",
      submit: "添加",
      fields: [
        { name: "name", label: "节点名称", full: true, value: "", placeholder: "如：水电验收款 30%" },
        { name: "amount", label: "金额 (元)", type: "number", step: "0.01", value: "" },
        { name: "due", label: "截止日期", type: "date", value: "" }
      ],
      onSubmit(d) {
        c.milestones.push({ id: uid("m"), name: d.name || "付款节点", amount: num(d.amount), due: d.due || "", paid: false });
        save(); refresh(); toast("已添加节点");
      }
    });
  }

  function milestoneEditModal(cid, mid) {
    const c = state.contracts.find(x => x.id === cid);
    if (!c) return;
    const m = c.milestones.find(x => x.id === mid);
    if (!m) return;
    openModal({
      title: "调整付款节点",
      submit: "保存",
      fields: [
        { name: "name", label: "节点名称", full: true, value: m.name || "", placeholder: "如：水电验收款 30%" },
        { name: "amount", label: "金额 (元)", type: "number", step: "0.01", value: m.amount },
        { name: "due", label: "截止日期", type: "date", value: m.due || "" }
      ],
      onSubmit(d) {
        m.name = d.name || "付款节点";
        m.amount = num(d.amount);
        m.due = d.due || "";
        save(); refresh(); toast("已更新节点");
      }
    });
  }

  function extraModal(cid) {
    const c = state.contracts.find(x => x.id === cid);
    if (!c) return;
    openModal({
      title: "添加增项",
      submit: "添加",
      fields: [
        { name: "name", label: "增项内容", full: true, value: "", placeholder: "如：加做一组吊柜 / 更换五金" },
        { name: "amount", label: "金额 (元)", type: "number", step: "0.01", value: "" }
      ],
      onSubmit(d) {
        c.extras = c.extras || [];
        c.extras.push({ id: uid("x"), name: d.name || "增项", amount: num(d.amount) });
        save(); refresh(); toast("已添加增项");
      }
    });
  }

  function extraEditModal(cid, xid) {
    const c = state.contracts.find(x => x.id === cid);
    if (!c) return;
    const x = (c.extras || []).find(t => t.id === xid);
    if (!x) return;
    openModal({
      title: "编辑增项",
      submit: "保存",
      fields: [
        { name: "name", label: "增项内容", full: true, value: x.name || "" },
        { name: "amount", label: "金额 (元)", type: "number", step: "0.01", value: x.amount }
      ],
      onSubmit(d) {
        x.name = d.name || "增项";
        x.amount = num(d.amount);
        save(); refresh(); toast("已更新增项");
      }
    });
  }

  function doExport() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "家装数据备份-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 800);
    toast("已导出数据备份");
  }

  /* ============================================================
   *  全局事件
   * ============================================================ */
  function bindGlobal() {
    // 移动端菜单
    const menuBtn = $("#menuBtn");
    const sidebar = $("#sidebar");
    const overlay = $("#sidebarOverlay");
    const closeSidebar = () => { sidebar.classList.remove("open"); overlay.classList.remove("show"); };
    if (menuBtn) menuBtn.addEventListener("click", () => {
      sidebar.classList.toggle("open"); overlay.classList.toggle("show");
    });
    if (overlay) overlay.addEventListener("click", closeSidebar);
    $$(".nav-item").forEach(a => a.addEventListener("click", closeSidebar));

    // 点击委派
    document.addEventListener("click", ev => {
      const el = ev.target.closest("[data-action]");
      if (!el) return;
      const a = el.dataset.action;

      if (SERVER && !canEdit() && !VIEW_ONLY_ACTIONS.has(a)) {
        toast("只读模式：请先点右上角“解锁编辑”再操作", false);
        return;
      }

      switch (a) {
        case "toggle-task": {
          const s = findStage(el.dataset.sid); if (!s) break;
          const t = s.tasks.find(x => x.id === el.dataset.tid); if (!t) break;
          t.done = !t.done; save(); render(); break;
        }
        case "del-task": {
          const s = findStage(el.dataset.sid); if (!s) break;
          s.tasks = s.tasks.filter(x => x.id !== el.dataset.tid); save(); render(); break;
        }
        case "add-task": {
          const wrap = el.closest(".add-task");
          const input = wrap ? wrap.querySelector("input") : null;
          addTask(el.dataset.sid, input ? input.value : ""); break;
        }
        case "toggle-stage": {
          const sid = el.dataset.sid;
          const card = el.closest(".stage");
          if (openStages.has(sid)) { openStages.delete(sid); if (card) card.classList.add("collapsed"); }
          else { openStages.add(sid); if (card) card.classList.remove("collapsed"); }
          break;
        }
        case "expand-all": {
          state.stages.forEach(s => openStages.add(s.id));
          $$(".stage").forEach(c => c.classList.remove("collapsed")); break;
        }
        case "collapse-all": {
          openStages.clear();
          $$(".stage").forEach(c => c.classList.add("collapsed")); break;
        }
        case "add-stage": stageModal(); break;
        case "del-stage": {
          if (!confirm("确定删除该阶段及其所有任务？")) break;
          state.stages = state.stages.filter(s => s.id !== el.dataset.sid);
          save(); render(); toast("已删除阶段"); break;
        }

        case "std-filter": stdCat = el.dataset.cat; render(); break;
        case "toggle-standard": {
          const s = state.standards.find(x => x.id === el.dataset.id); if (!s) break;
          s.checked = !s.checked; save(); render(); break;
        }
        case "add-standard": standardModal(); break;
        case "edit-standard": standardModal(state.standards.find(x => x.id === el.dataset.id)); break;
        case "del-standard": {
          if (!confirm("删除该工艺条目？")) break;
          state.standards = state.standards.filter(x => x.id !== el.dataset.id);
          save(); render(); toast("已删除"); break;
        }

        case "add-budget": budgetModal(el.dataset.cat); break;
        case "del-budget": {
          if (!confirm("删除该预算项？")) break;
          state.budget = state.budget.filter(b => b.id !== el.dataset.id);
          save(); refresh(); toast("已删除预算项"); break;
        }

        case "add-expense": expenseModal(null); break;
        case "lightbox": if (ev && ev.preventDefault) ev.preventDefault(); lightbox(el.dataset.src); break;
        case "edit-expense": expenseModal(state.expenses.find(x => x.id === el.dataset.id)); break;
        case "attachments": attachmentModal(state.expenses.find(x => x.id === el.dataset.id)); break;
        case "history-refresh": { historyData = null; render(); break; }
        case "toggle-edit": {
          if (canEdit()) {
            fetch(API_BASE + "/api/logout", { method: "POST", credentials: "include", headers: { "X-Requested-With": "fetch" } }).catch(() => {});
            ROLE = "view"; IDENTITY = ""; updateSyncLabel(); render(); toast("已切换为只读"); break;
          }
          const command = window.prompt("请输入编辑指令");
          if (!command) break;
          fetch(API_BASE + "/api/login", { method: "POST", headers: { "Content-Type": "application/json", "X-Requested-With": "fetch" }, credentials: "include", body: JSON.stringify({ command }) })
            .then(r => r.ok ? r.json() : null).then(result => {
              if (!result || !result.ok || result.role !== "edit") { toast("无权限或指令错误", false); return; }
              ROLE = "edit"; IDENTITY = result.identity || ""; updateSyncLabel();
              if (remoteEmpty) { remoteEmpty = false; save(); }
              toast("已解锁编辑" + (IDENTITY ? "（" + IDENTITY + "）" : "")); render();
            }).catch(() => toast("解锁失败，请检查服务", false));
          break;
        }
        case "connect": {
          const name = document.getElementById("myNameInput");
          if (name && name.value.trim()) localStorage.setItem(MY_NAME_KEY, name.value.trim());
          const base = document.getElementById("apiBaseInput");
          connectServer(base ? base.value.trim() : ""); break;
        }
        case "disconnect": SERVER = false; updateSyncLabel(); toast("已切换为本机模式"); break;
        case "toggle-prep": {
          const phase = (state.preparation || []).find(p => p.id === el.dataset.pid); if (!phase) break;
          const item = phase.items.find(i => i.id === el.dataset.iid); if (!item) break;
          item.done = !item.done; save(); render(); break;
        }
        case "del-expense": {
          const before = state.expenses.length;
          state.expenses = state.expenses.filter(x => x.id !== el.dataset.id);
          if (state.expenses.length === before) break;
          save(); refresh(); toast("已删除该开支记录"); break;
        }

        case "add-contact": contactModal(null); break;
        case "del-contact": {
          if (!confirm("删除此联系人？")) break;
          state.contacts = state.contacts.filter(x => x.id !== el.dataset.id); save(); render(); break;
        }
        case "del-material": {
          if (!confirm("删除此材料验收记录？")) break;
          state.materials = state.materials.filter(x => x.id !== el.dataset.id); save(); render(); break;
        }
        case "del-gallery": {
          if (!confirm("删除此阶段留档？")) break;
          state.gallery = state.gallery.filter(x => x.id !== el.dataset.id); save(); render(); break;
        }
        case "edit-contact": contactModal(state.contacts.find(x => x.id === el.dataset.id)); break;
        case "add-material": materialModal(null); break;
        case "edit-material": materialModal(state.materials.find(x => x.id === el.dataset.id)); break;
        case "add-gallery": galleryModal(null); break;
        case "edit-gallery": galleryModal(state.gallery.find(x => x.id === el.dataset.id)); break;
        case "inspection-photo": attachmentPicker(file => addPhotoTo(state.inspection, el.dataset.id, file)); break;
        case "material-photo": attachmentPicker(file => addPhotoTo(state.materials, el.dataset.id, file)); break;
        case "gallery-photo": galleryPhotoPicker(el.dataset.id); break;
        case "add-contract": contractModal(null); break;
        case "edit-contract": contractModal(state.contracts.find(x => x.id === el.dataset.id)); break;
        case "del-contract": {
          if (!confirm("删除该合同及其付款节点？")) break;
          state.contracts = state.contracts.filter(x => x.id !== el.dataset.id);
          save(); refresh(); toast("已删除合同"); break;
        }
        case "add-milestone": milestoneModal(el.dataset.cid); break;
        case "edit-milestone": milestoneEditModal(el.dataset.cid, el.dataset.mid); break;
        case "pay-milestone": {
          const c = state.contracts.find(x => x.id === el.dataset.cid); if (!c) break;
          const m = c.milestones.find(x => x.id === el.dataset.mid); if (!m) break;
          m.paid = !m.paid; save(); refresh(); break;
        }
        case "del-milestone": {
          const c = state.contracts.find(x => x.id === el.dataset.cid); if (!c) break;
          const before = c.milestones.length;
          c.milestones = c.milestones.filter(x => x.id !== el.dataset.mid);
          if (c.milestones.length === before) break;
          save(); refresh(); toast("已删除支付节点"); break;
        }
        case "add-extra": extraModal(el.dataset.cid); break;
        case "edit-extra": extraEditModal(el.dataset.cid, el.dataset.xid); break;
        case "del-extra": {
          const c = state.contracts.find(x => x.id === el.dataset.cid); if (!c) break;
          c.extras = (c.extras || []).filter(x => x.id !== el.dataset.xid);
          save(); refresh(); toast("已删除增项"); break;
        }
        case "history-clear": {
          fetch(API_BASE + "/api/history", { method: "DELETE", credentials: "include" })
            .then(r => r.ok ? r.json() : null)
            .then(() => { historyData = null; render(); toast("已清除修改记录"); })
            .catch(() => toast("清除失败，请检查服务", false));
          break;
        }

        case "add-socket": {
          const area = state.sockets.find(x => x.id === el.dataset.area); if (!area) break;
          const input = document.getElementById("sk-" + area.id);
          const v = input ? input.value.trim() : "";
          if (!v) break;
          area.items.push(v); save(); focusSel = "#sk-" + area.id; render(); break;
        }
        case "del-socket": {
          const area = state.sockets.find(x => x.id === el.dataset.area); if (!area) break;
          area.items.splice(Number(el.dataset.idx), 1); save(); render(); break;
        }

        case "add-room": roomModal(); break;

        case "toggle-note": {
          const n = state.notes.find(x => x.id === el.dataset.id); if (!n) break;
          n.done = !n.done; save(); render(); break;
        }
        case "del-note": {
          state.notes = state.notes.filter(x => x.id !== el.dataset.id);
          save(); render(); break;
        }
        case "add-note": {
          const input = document.getElementById("add-note");
          const v = input ? input.value.trim() : "";
          if (!v) break;
          state.notes.push({ id: uid("n"), text: v, done: false });
          save(); focusSel = "#add-note"; render(); toast("已添加"); break;
        }

        case "export": doExport(); break;
        case "import": { const f = document.getElementById("importFile"); if (f) f.click(); break; }
        case "print": window.print(); break;
        case "reset": {
          if (confirm("确定重置为初始示例数据？当前所有修改将丢失。")) {
            state = clone(window.SEED); save(); initOpenStages(); render(); toast("已重置为初始数据");
          }
          break;
        }
      }
    });

    // 内联编辑（只读模式拒绝变更）
    document.addEventListener("change", ev => {
      const I = ev.target;
      if (SERVER && !canEdit()) {
        toast("无权限：当前为只读模式，不可编辑", false);
        render();
        return;
      }
      if (I && I.matches && I.matches("[data-inspection-result]")) {
        const rec = state.inspection.find(x => x.id === I.dataset.inspectionResult);
        if (rec) { rec.result = I.value; save(); render(); } return;
      }
      if (I && I.matches && I.matches("[data-inspection-note]")) {
        const rec = state.inspection.find(x => x.id === I.dataset.inspectionNote);
        if (rec) { rec.note = I.value; save(); } return;
      }
      const inp = ev.target.closest("[data-bind]");
      if (inp) {
        const parts = inp.dataset.bind.split(":");
        const ent = parts[0], field = parts[1];
        const val = inp.value;
        if (ent === "stage") {
          const s = findStage(inp.dataset.id);
          if (s) { s[field] = val; save(); }
        } else if (ent === "budget") {
          const b = state.budget.find(x => x.id === inp.dataset.id);
          if (b) { b[field] = field === "amount" ? num(val) : val; save(); refresh(); }
        } else if (ent === "meta") {
          state.measureMeta[field] = val; save();
        } else if (ent === "measure") {
          const r = state.measure.find(x => x.room === inp.dataset.room);
          if (r) { r[field] = val; save(); }
        }
        return;
      }
      // 导入文件
      if (ev.target.id === "importFile") {
        const file = ev.target.files && ev.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const obj = JSON.parse(reader.result);
            if (!obj || !obj.stages || !obj.budget) throw new Error("bad");
            state = obj; save(); initOpenStages(); render(); toast("导入成功");
          } catch (e) { toast("文件格式不正确", false); }
        };
        reader.readAsText(file);
        ev.target.value = "";
      }
    });

    // 搜索（工艺）
    document.addEventListener("input", ev => {
      if (ev.target && ev.target.id === "stdSearch") {
        stdQuery = ev.target.value;
        const grid = document.getElementById("stdGrid");
        if (grid) grid.innerHTML = stdCardsHTML();
      }
    });

    // 回车添加
    document.addEventListener("keydown", ev => {
      if (ev.key !== "Enter") return;
      if (SERVER && !canEdit()) {
        const t = ev.target;
        if (t && t.matches && (t.matches("[data-add-task]") || t.id === "add-note" || t.matches("[data-add-socket]"))) {
          ev.preventDefault();
          toast("无权限：当前为只读模式，不可编辑", false);
        }
        return;
      }
      const t = ev.target;
      if (t && t.matches && t.matches("[data-add-task]")) {
        ev.preventDefault(); addTask(t.dataset.addTask, t.value); return;
      }
      if (t && t.id === "add-note") {
        ev.preventDefault();
        const v = t.value.trim(); if (!v) return;
        state.notes.push({ id: uid("n"), text: v, done: false }); save(); focusSel = "#add-note"; render(); return;
      }
      if (t && t.matches && t.matches("[data-add-socket]")) {
        ev.preventDefault();
        const area = state.sockets.find(x => x.id === t.dataset.addSocket);
        if (!area) return;
        const v = t.value.trim(); if (!v) return;
        area.items.push(v); save(); focusSel = "#sk-" + area.id; render(); return;
      }
    });
  }

  function initOpenStages() {
    openStages = new Set();
    const cur = currentStage();
    if (cur) openStages.add(cur.id);
  }

  /* ============================================================
   *  启动
   * ============================================================ */
  function init() {
    initOpenStages();
    bindGlobal();
    updateSyncLabel();
    render();
    const servedByHttp = location.protocol === "http:" || location.protocol === "https:";
    // 通过 HTTP 打开时，始终用当前地址连接，避免沿用旧的失效地址
    if (servedByHttp) connectServer(location.origin);
    window.addEventListener("hashchange", render);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
