/* ============================================================
 *  家装平台 · router（路由表 / 渲染 / 刷新）
 *  经典脚本（无构建）。依赖 store.js / components.js / views.js 已加载；
 *  加载顺序：store → components → views → router → main
 * ============================================================ */
"use strict";

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
