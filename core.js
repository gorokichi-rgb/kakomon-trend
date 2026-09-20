'use strict';

/* =========================================================
   基本の道具
   ========================================================= */
const $ = (s, r = document) => r.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const norm = s => String(s == null ? '' : s).normalize('NFKC').toLowerCase();
const clone = o => JSON.parse(JSON.stringify(o));

function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'style') e.style.cssText = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return e;
}

const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  dots: '<circle cx="12" cy="5" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="19" r="1.5" fill="currentColor"/>',
  down: '<path d="M6 9l6 6l6-6"/>',
  up: '<path d="M6 15l6-6l6 6"/>',
  right: '<path d="M9 6l6 6l-6 6"/>',
  search: '<circle cx="10" cy="10" r="6.5"/><path d="M15 15l5.5 5.5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  imp: '<path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M7 11l5 5l5-5M12 4v12"/>',
  exp: '<path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M7 9l5-5l5 5M12 4v12"/>',
  photoplus: '<path d="M12.5 20H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v6"/><circle cx="9" cy="10" r="1.6"/><path d="M3 16l5-5l4 4M16 19h6M19 16v6"/>',
  clip: '<rect x="6" y="5" width="12" height="16" rx="2"/><path d="M9 5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M9 11h6M9 15h6"/>',
  edit: '<path d="M4 20h4L18.5 9.5a2.8 2.8 0 0 0-4-4L4 16zM13.5 6.5l4 4"/>',
  app: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/>'
};
function icon(name, size = 18) {
  return el('span', {
    class: 'ic',
    html: `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`
  });
}

/* =========================================================
   データベース（IndexedDB）
   ========================================================= */
let db = null;
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('kakomon-app', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('kv');
      d.createObjectStore('problems', { keyPath: 'id' });
      d.createObjectStore('images', { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function tx(store, mode, fn) {
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    const req = fn(s);
    if (req) req.onsuccess = () => { out = req.result; };
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
}
const dbGet = (st, k) => tx(st, 'readonly', s => s.get(k));
const dbAll = st => tx(st, 'readonly', s => s.getAll());
const dbKeys = st => tx(st, 'readonly', s => s.getAllKeys());
const dbPut = (st, v, k) => tx(st, 'readwrite', s => (k !== undefined ? s.put(v, k) : s.put(v)));
const dbDel = (st, k) => tx(st, 'readwrite', s => s.delete(k));
const dbClear = st => tx(st, 'readwrite', s => s.clear());

/* =========================================================
   アプリのデータ
   ========================================================= */
let config = { universities: [], subjects: [] };
let problems = [];
const ITEM_MAP = new Map();

function buildSubject(m) {
  return {
    id: m.id, name: m.name, maxDai: m.maxDai, maxSho: m.maxSho,
    groups: m.groups ? m.groups.slice() : null,
    units: m.units.map((u, i) => ({
      id: `${m.id}_u${i}`, name: u.name, group: u.g || null,
      items: u.items.map((n, j) => ({ id: `${m.id}_u${i}_i${j}`, name: n }))
    }))
  };
}
const seedConfig = () => ({ universities: [], subjects: MASTER.subjects.map(buildSubject) });

function reindex() {
  ITEM_MAP.clear();
  for (const s of config.subjects) for (const u of s.units) for (const it of u.items) ITEM_MAP.set(it.id, { s, u, it });
}
async function saveConfig() {
  reindex();
  await dbPut('kv', config, 'config');
}

const getUniv = id => config.universities.find(u => u.id === id);
const getSubj = id => config.subjects.find(s => s.id === id);
const probsOf = (u, s) => problems.filter(p => p.uid === u && p.sid === s);
const itemCount = (list, id) => list.filter(p => p.items.includes(id)).length;
function unitCount(list, unit) {
  const ids = new Set(unit.items.map(i => i.id));
  return list.filter(p => p.items.some(i => ids.has(i))).length;
}
const sortProblems = list => list.slice().sort((a, b) => b.year - a.year || a.dai - b.dai || (a.sho || 0) - (b.sho || 0));
const probLabel = p => `大問${p.dai}${p.sho ? `(${p.sho})` : ''}`;
function blockedProblems(itemIds) {
  const set = new Set(itemIds);
  return problems.filter(p => p.items.length && p.items.every(i => set.has(i)));
}

async function saveProblemRec(p) {
  const i = problems.findIndex(x => x.id === p.id);
  if (i >= 0) problems[i] = p; else problems.push(p);
  await dbPut('problems', p);
}
async function deleteProblems(ids) {
  const set = new Set(ids);
  problems = problems.filter(p => !set.has(p.id));
  for (const id of ids) await dbDel('problems', id);
  await gcImages();
}

const lastYear = {
  get(k) { try { return JSON.parse(localStorage.getItem('kk_lastyear') || '{}')[k]; } catch (e) { return undefined; } },
  set(k, v) { try { const o = JSON.parse(localStorage.getItem('kk_lastyear') || '{}'); o[k] = v; localStorage.setItem('kk_lastyear', JSON.stringify(o)); } catch (e) { /* 保存できなくても続ける */ } }
};

/* =========================================================
   画像
   ========================================================= */
const urlCache = new Map();
async function imgURL(id) {
  if (urlCache.has(id)) return urlCache.get(id);
  const r = await dbGet('images', id);
  if (!r) return null;
  const u = URL.createObjectURL(r.blob);
  urlCache.set(id, u);
  return u;
}
function fillImg(img, id) { imgURL(id).then(u => { if (u) img.src = u; }); }
function dropImgURL(id) {
  const u = urlCache.get(id);
  if (u) { URL.revokeObjectURL(u); urlCache.delete(id); }
}
async function gcImages() {
  const used = new Set();
  for (const u of config.universities) if (u.image) used.add(u.image);
  for (const p of problems) for (const i of p.images) used.add(i);
  const keys = (await dbKeys('images')) || [];
  for (const k of keys) {
    if (!used.has(k)) { await dbDel('images', k); dropImgURL(k); }
  }
}
function loadImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => { URL.revokeObjectURL(url); res(im); };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('この画像は読み込めませんでした。別の画像を選んでください。')); };
    im.src = url;
  });
}
async function resizeImage(file, maxSide, square, quality) {
  const im = await loadImage(file);
  let sw = im.naturalWidth, sh = im.naturalHeight, sx = 0, sy = 0, dw, dh;
  if (square) {
    const m = Math.min(sw, sh);
    sx = (sw - m) / 2; sy = (sh - m) / 2; sw = m; sh = m; dw = dh = maxSide;
  } else {
    const k = Math.min(1, maxSide / Math.max(sw, sh));
    dw = Math.round(sw * k); dh = Math.round(sh * k);
  }
  const c = document.createElement('canvas');
  c.width = dw; c.height = dh;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, dw, dh);
  g.drawImage(im, sx, sy, sw, sh, 0, 0, dw, dh);
  return new Promise(res => c.toBlob(b => res(b), 'image/jpeg', quality));
}
const blobToDataURL = blob => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = () => rej(r.error);
  r.readAsDataURL(blob);
});

/* =========================================================
   画面の切り替え（スマホの「戻る」をそのまま使えるように、履歴に積む）
   ========================================================= */
const VIEWS = {};
history.scrollRestoration = 'manual';

function render() {
  const st = history.state || { v: 'home' };
  const app = $('#app');
  app.replaceChildren();
  const f = VIEWS[st.v] || VIEWS.home;
  const nodes = f(st);
  app.append(...[].concat(nodes || []).flat(Infinity).filter(Boolean));
}
function go(state) {
  history.pushState(state, '');
  render();
  window.scrollTo(0, 0);
}
function swap(state) {
  const y = window.scrollY;
  history.replaceState(state, '');
  render();
  window.scrollTo(0, y);
}
function bail() {
  queueMicrotask(() => { history.replaceState({ v: 'home' }, ''); render(); });
  return [];
}

/* ダイアログも履歴に積むので、「戻る」で閉じられる */
let ignorePop = 0;
const popWaiters = [];
const dialogs = [];
function openDialog(node) {
  history.pushState(Object.assign({}, history.state, { dlg: dialogs.length + 1 }), '');
  dialogs.push(node);
  document.body.append(node);
  const f = node.querySelector('[data-autofocus]');
  if (f) setTimeout(() => f.focus(), 40);
}
function closeDialog() {
  return new Promise(res => {
    const n = dialogs.pop();
    if (!n) { res(); return; }
    n.remove();
    ignorePop++;
    popWaiters.push(res);
    history.back();
  });
}
window.addEventListener('popstate', () => {
  if (ignorePop > 0) {
    ignorePop--;
    const w = popWaiters.shift();
    if (w) w();
    return;
  }
  if (dialogs.length) { dialogs.pop().remove(); return; }
  render();
  window.scrollTo(0, 0);
});

/* =========================================================
   ダイアログの部品
   ========================================================= */
function dialogBox(kids, cls) {
  const box = el('div', { class: 'dlg' }, kids);
  const ov = el('div', { class: 'dim' + (cls ? ' ' + cls : ''), onclick: e => { if (e.target === ov) closeDialog(); } }, box);
  return ov;
}
function confirmDlg(o, onOk) {
  const ov = dialogBox([
    el('div', { class: 'dt' }, o.title),
    o.body ? el('div', { class: 'db' }, o.body) : null,
    o.extra || null,
    el('div', { class: 'row2' },
      el('button', { class: 'bt', type: 'button', onclick: () => closeDialog() }, o.cancel || 'キャンセル'),
      el('button', {
        class: 'bt ' + (o.danger ? 'danger' : 'pri'), type: 'button',
        onclick: async () => { await closeDialog(); if (onOk) onOk(); }
      }, o.ok || 'OK'))
  ]);
  openDialog(ov);
}
function alertDlg(title, body) {
  openDialog(dialogBox([
    el('div', { class: 'dt' }, title),
    body ? el('div', { class: 'db' }, body) : null,
    el('button', { class: 'bt pri', type: 'button', onclick: () => closeDialog() }, 'OK')
  ]));
}
function promptDlg(o, onOk) {
  const input = el('input', { class: 'field', type: 'text', value: o.value || '', placeholder: o.placeholder || '', maxlength: '60', 'data-autofocus': true });
  const submit = async () => {
    const v = input.value.trim();
    if (!v) { input.focus(); return; }
    await closeDialog();
    onOk(v);
  };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  openDialog(dialogBox([
    el('div', { class: 'dt' }, o.title),
    input,
    el('div', { class: 'row2', style: 'margin-top:14px' },
      el('button', { class: 'bt', type: 'button', onclick: () => closeDialog() }, 'キャンセル'),
      el('button', { class: 'bt pri', type: 'button', onclick: submit }, o.ok || 'OK'))
  ]));
}
function textareaDlg(o, onOk) {
  const ta = el('textarea', { class: 'field ta', rows: '8', placeholder: o.placeholder || '', 'data-autofocus': true });
  openDialog(dialogBox([
    el('div', { class: 'dt' }, o.title),
    o.body ? el('div', { class: 'db' }, o.body) : null,
    ta,
    el('div', { class: 'row2', style: 'margin-top:14px' },
      el('button', { class: 'bt', type: 'button', onclick: () => closeDialog() }, 'キャンセル'),
      el('button', { class: 'bt pri', type: 'button', onclick: async () => { const v = ta.value; await closeDialog(); onOk(v); } }, o.ok || 'OK'))
  ]));
}
function listDlg(title, items, cls) {
  const box = items.map(it => el('button', {
    class: 'mi' + (it.danger ? ' danger-t' : ''), type: 'button',
    onclick: async () => { await closeDialog(); it.fn(); }
  }, it.ic ? icon(it.ic, 18) : null, el('span', null, it.label)));
  const inner = [];
  if (title) inner.push(el('div', { class: 'dt sm' }, title));
  inner.push(el('div', { class: 'menuList' }, box));
  const ov = el('div', { class: 'dim ' + (cls || ''), onclick: e => { if (e.target === ov) closeDialog(); } },
    el('div', { class: 'dlg menu' }, inner));
  openDialog(ov);
}
const sheetDlg = (title, items) => listDlg(title, items, '');
const menuDlg = items => listDlg('', items, 'tr');

function toast(msg) {
  const t = el('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 2000);
}

/* =========================================================
   エクスポート・インポート・初期化
   ========================================================= */
const dateStr = () => {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
};

async function doExport() {
  const imgs = await dbAll('images');
  const images = {};
  for (const r of imgs) images[r.id] = await blobToDataURL(r.blob);
  const data = { format: 'kakomon-app', version: 1, exportedAt: new Date().toISOString(), config, problems, images };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: `kakomon-backup-${dateStr()}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function validateBackup(d) {
  return d && d.format === 'kakomon-app' && d.config && Array.isArray(d.config.universities) &&
    Array.isArray(d.config.subjects) && Array.isArray(d.problems);
}
function mergeConfig(local, imp) {
  const out = clone(local);
  for (const u of imp.universities || []) {
    const i = out.universities.findIndex(x => x.id === u.id);
    if (i >= 0) out.universities[i] = u; else out.universities.push(u);
  }
  for (const s of imp.subjects || []) {
    const ls = out.subjects.find(x => x.id === s.id);
    if (!ls) { out.subjects.push(s); continue; }
    for (const u of s.units) {
      const lu = ls.units.find(x => x.id === u.id);
      if (!lu) { ls.units.push(u); continue; }
      for (const it of u.items) if (!lu.items.some(x => x.id === it.id)) lu.items.push(it);
    }
  }
  return out;
}
async function applyImport(d, mode) {
  if (mode === 'replace') {
    await dbClear('problems');
    await dbClear('images');
    for (const u of urlCache.values()) URL.revokeObjectURL(u);
    urlCache.clear();
    config = d.config;
    problems = [];
  } else {
    config = mergeConfig(config, d.config);
  }
  for (const [id, dataUrl] of Object.entries(d.images || {})) {
    const blob = await (await fetch(dataUrl)).blob();
    await dbPut('images', { id, blob });
    dropImgURL(id);
  }
  for (const p of d.problems) {
    const rec = Object.assign({}, p, { items: p.items || [], images: p.images || [] });
    const i = problems.findIndex(x => x.id === rec.id);
    if (i >= 0) problems[i] = rec; else problems.push(rec);
    await dbPut('problems', rec);
  }
  await saveConfig();
  await gcImages();
}
function pickImportFile() {
  const input = el('input', { type: 'file', accept: 'application/json,.json', style: 'display:none' });
  input.addEventListener('change', async () => {
    const f = input.files[0];
    input.remove();
    if (!f) return;
    let d;
    try { d = JSON.parse(await f.text()); } catch (e) { d = null; }
    if (!validateBackup(d)) {
      alertDlg('読み込めません', 'このアプリで書き出したバックアップのファイルを選んでください。');
      return;
    }
    const nProb = d.problems.length;
    openDialog(dialogBox([
      el('div', { class: 'dt' }, 'インポート'),
      el('div', { class: 'db' }, `問題${nProb}件のデータがあります。今のデータとの扱いを選んでください。`),
      el('button', { class: 'bt pri', type: 'button', style: 'margin-bottom:8px', onclick: async () => { await closeDialog(); await runImport(d, 'merge'); } }, '今のデータに追加する'),
      el('button', { class: 'bt danger', type: 'button', style: 'margin-bottom:8px', onclick: async () => { await closeDialog(); await runImport(d, 'replace'); } }, '今のデータを置き換える'),
      el('button', { class: 'bt', type: 'button', onclick: () => closeDialog() }, 'キャンセル')
    ]));
  });
  document.body.append(input);
  input.click();
}
async function runImport(d, mode) {
  try {
    await applyImport(d, mode);
    swap({ v: 'home' });
    toast('インポートしました');
  } catch (e) {
    alertDlg('インポートできませんでした', 'ファイルの中身を確認して、もう一度お試しください。');
  }
}
async function wipeAll() {
  await dbClear('problems');
  await dbClear('images');
  for (const u of urlCache.values()) URL.revokeObjectURL(u);
  urlCache.clear();
  config = seedConfig();
  problems = [];
  await saveConfig();
  try { localStorage.removeItem('kk_lastyear'); } catch (e) { /* 消せなくても続ける */ }
}

/* インストールの案内（ブラウザが対応している場合のみメニューに出す） */
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
window.addEventListener('appinstalled', () => { installEvt = null; });
