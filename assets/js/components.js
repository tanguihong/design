/* ============================================================
 *  家装平台 · components（模态框 / 表单 / 图片灯箱 / 照片选择器 / 表单弹窗）
 *  经典脚本（无构建）。依赖 store.js 已加载；
 *  加载顺序：store → components → views → router → main
 * ============================================================ */
"use strict";

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

/* ---------------- 图片 / 照片选择 ---------------- */
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

/* ---------------- 各表单弹窗 ---------------- */
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
