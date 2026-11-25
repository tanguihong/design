/* ============================================================
 *  家装平台 · main（全局事件绑定 / 启动）
 *  经典脚本（无构建）。依赖 store.js / components.js / views.js / router.js 已加载；
 *  加载顺序：store → components → views → router → main
 * ============================================================ */
"use strict";

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
