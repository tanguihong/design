/* ============================================================
 *  家装平台 · store（状态 / 持久化 / 服务器同步 / 派生计算 / 工具与图标）
 *  经典脚本（无构建）。模块间通过全局作用域共享；
 *  加载顺序：store → components → views → router → main
 * ============================================================ */
"use strict";

const LS_KEY = "zx_pm_v1";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/* ---------------- 图标 ---------------- */
const IC = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></svg>',
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
