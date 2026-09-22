'use strict';

/* =========================================================
   共通の部品
   ========================================================= */
function header(title, sub, right) {
  return el('div', { class: 'hd' },
    el('div', { class: 'h' }, title),
    sub ? el('div', { class: 's' }, sub) : null,
    right || null);
}
const pillBtn = (ic, label, fn) => el('button', { class: 'pill', type: 'button', 'aria-label': label, onclick: fn }, icon(ic, 18));
const fabBtn = (fn, label) => el('button', { class: 'fab', type: 'button', 'aria-label': label, onclick: fn }, icon('plus', 24));

/* 長押しと通常のタップを両方使えるボタン */
function press(node, onTap, onLong) {
  let timer = null, fired = false, sx = 0, sy = 0;
  const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
  node.addEventListener('pointerdown', e => {
    fired = false; sx = e.clientX; sy = e.clientY;
    if (onLong) {
      timer = setTimeout(() => {
        fired = true; timer = null;
        if (navigator.vibrate) navigator.vibrate(15);
        onLong();
      }, 550);
    }
  });
  node.addEventListener('pointermove', e => { if (timer && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) clear(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => node.addEventListener(t, clear));
  node.addEventListener('click', e => {
    if (fired) { e.preventDefault(); e.stopPropagation(); fired = false; return; }
    if (onTap) onTap(e);
  });
  node.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (onLong && !fired) { fired = true; clear(); onLong(); }
  });
}
function bigBtn(kids, onTap, onLong, cls) {
  const b = el('button', { class: 'btn' + (cls ? ' ' + cls : ''), type: 'button' }, kids);
  press(b, onTap, onLong);
  return b;
}
const chipRow = (list, cur, onPick) => el('div', { class: 'chips' },
  list.map(o => el('button', { class: 'chip' + (o.key === cur ? ' on' : ''), type: 'button', onclick: () => onPick(o.key) }, o.label)));
const tabsEl = (cur, onPick) => el('div', { class: 'tabs' },
  el('button', { class: cur === 'unit' ? 'on' : '', type: 'button', onclick: () => onPick('unit') }, '単元別'),
  el('button', { class: cur === 'freq' ? 'on' : '', type: 'button', onclick: () => onPick('freq') }, '頻度順'),
  el('button', { class: cur === 'year' ? 'on' : '', type: 'button', onclick: () => onPick('year') }, '年度順'));
const empty = msg => el('p', { class: 'empty' }, msg);

function rankBtn(rank, name, c, max, onTap) {
  const pct = max ? Math.round(c / max * 100) : 0;
  return el('button', { class: 'btn rk', type: 'button', onclick: onTap },
    el('div', { class: 'rkTop' },
      el('span', { class: 'rn' }, String(rank)),
      el('span', { class: 'n' }, name),
      el('span', { class: 'r' }, String(c))),
    el('div', { class: 'bar' }, el('i', { style: `width:${pct}%` })));
}
function thumb(u) {
  if (u.image) { const im = el('img', { class: 'th', alt: '' }); fillImg(im, u.image); return im; }
  return el('span', { class: 'ico' }, (u.name || '?').slice(0, 1));
}
function problemCard(p) {
  return el('button', { class: 'btn block', type: 'button', onclick: () => go({ v: 'detail', pid: p.id }) },
    el('div', { class: 'cardTop' }, el('span', { class: 'n' }, `${p.year}年`), el('span', { class: 's' }, probLabel(p))),
    el('div', { class: 'tags' }, p.items.map(id => {
      const r = ITEM_MAP.get(id);
      return r ? el('span', { class: 'tg' }, r.it.name) : null;
    })));
}

/* =========================================================
   ホーム（大学の一覧）
   ========================================================= */
VIEWS.home = function () {
  const n = config.universities.length;
  const out = [header('大学', n ? `${n}校を登録中` : '', pillBtn('dots', 'メニュー', openHomeMenu))];
  if (!n) out.push(empty('右下の＋から大学を追加してください。'));
  for (const u of config.universities) {
    const cnt = problems.filter(p => p.uid === u.id).length;
    out.push(bigBtn(
      [thumb(u), el('div', null, el('div', { class: 'n' }, u.name), el('div', { class: 's' }, `入力 ${cnt}件`))],
      () => go({ v: 'subjects', uid: u.id }),
      () => univSheet(u)));
  }
  if (n) out.push(el('p', { class: 'hint' }, '大学のボタンを長押しすると、変更や削除ができます'));
  out.push(fabBtn(() => openUnivForm(null), '大学を追加'));
  return out;
};

function openHomeMenu() {
  const items = [
    { ic: 'imp', label: 'インポート', fn: pickImportFile },
    { ic: 'exp', label: 'エクスポート', fn: () => doExport().then(() => toast('エクスポートしました')) }
  ];
  if (installEvt) items.push({ ic: 'app', label: 'アプリをインストール', fn: () => installEvt.prompt() });
  items.push({ ic: 'trash', label: '初期化', danger: true, fn: openResetDialog });
  menuDlg(items);
}
function openResetDialog() {
  const exportBtn = el('button', {
    class: 'bt out', type: 'button', style: 'margin-bottom:12px',
    onclick: () => doExport().then(() => toast('エクスポートしました'))
  }, icon('exp', 16), '先にエクスポートする');
  confirmDlg({
    title: 'すべて初期状態に戻しますか？',
    body: '大学、科目、細目、問題、画像がすべて消えます。この操作は取り消せません。',
    extra: exportBtn, ok: '初期化する', danger: true
  }, async () => {
    await wipeAll();
    swap({ v: 'home' });
    toast('初期化しました');
  });
}
function univSheet(u) {
  sheetDlg(u.name, [
    { ic: 'edit', label: '名前・画像を変更', fn: () => openUnivForm(u.id) },
    { ic: 'trash', label: '削除', danger: true, fn: () => deleteUniv(u) }
  ]);
}
function deleteUniv(u) {
  const ids = problems.filter(p => p.uid === u.id).map(p => p.id);
  confirmDlg({
    title: `「${u.name}」を削除しますか？`,
    body: ids.length ? `この大学の問題${ids.length}件と、その画像も消えます。` : 'この操作は取り消せません。',
    ok: '削除する', danger: true
  }, async () => {
    await deleteProblems(ids);
    config.universities = config.universities.filter(x => x.id !== u.id);
    await saveConfig();
    await gcImages();
    render();
    toast('削除しました');
  });
}

/* =========================================================
   科目の選択
   ========================================================= */
VIEWS.subjects = function (st) {
  const u = getUniv(st.uid);
  if (!u) return bail();
  const out = [header(u.name, '科目を選ぶ')];
  if (!config.subjects.length) out.push(empty('科目がありません。右下の＋から追加してください。'));
  for (const s of config.subjects) {
    const cnt = probsOf(u.id, s.id).length;
    out.push(bigBtn(
      el('div', null, el('div', { class: 'n big' }, s.name), el('div', { class: 's' }, `入力 ${cnt}件`)),
      () => go({ v: 'subject', uid: u.id, sid: s.id }),
      () => subjSheet(s), 'tall'));
  }
  if (config.subjects.length) out.push(el('p', { class: 'hint' }, '科目のボタンを長押しすると、編集や削除ができます'));
  out.push(fabBtn(() => openSubjForm(null), '科目を追加'));
  return out;
};
function subjSheet(s) {
  sheetDlg(s.name, [
    { ic: 'edit', label: '編集（単元・細目も直せます）', fn: () => openSubjForm(s.id) },
    { ic: 'trash', label: '削除', danger: true, fn: () => deleteSubj(s) }
  ]);
}
function deleteSubj(s) {
  const ids = problems.filter(p => p.sid === s.id).map(p => p.id);
  confirmDlg({
    title: `「${s.name}」を削除しますか？`,
    body: ids.length ? `この科目の問題${ids.length}件と、その画像も消えます（すべての大学の分）。` : 'この操作は取り消せません。',
    ok: '削除する', danger: true
  }, async () => {
    await deleteProblems(ids);
    config.subjects = config.subjects.filter(x => x.id !== s.id);
    await saveConfig();
    render();
    toast('削除しました');
  });
}

/* =========================================================
   科目の画面（単元別・頻度順）
   ========================================================= */
VIEWS.subject = function (st) {
  const u = getUniv(st.uid), S = getSubj(st.sid);
  if (!u || !S) return bail();
  const hasG = !!S.groups;
  const tab = st.tab === 'freq' ? 'freq' : st.tab === 'year' ? 'year' : 'unit';

  let g = null;
  if (hasG) {
    g = st.g || (tab === 'unit' ? S.groups[0] : 'all');
    if (tab === 'unit' && g === 'all') g = S.groups[0];
    if (g !== 'all' && !S.groups.includes(g)) g = S.groups[0];
  }
  const units = S.units.filter(x => !hasG || g === 'all' || x.group === g);
  let uId = st.u;
  if (tab === 'unit') {
    if (!units.some(x => x.id === uId)) uId = units[0] ? units[0].id : null;
  } else if (tab === 'freq') {
    if (uId !== 'all' && !units.some(x => x.id === uId)) uId = 'all';
    if (hasG && g === 'all') uId = 'all';
  }
  const dir = st.dir === 'asc' ? 'asc' : 'desc';
  const cur = { v: 'subject', uid: u.id, sid: S.id, tab, g, u: uId, dir };
  const list = probsOf(u.id, S.id);
  const out = [header(S.name, u.name), tabsEl(tab, t => swap(Object.assign({}, cur, { tab: t, g: null, u: null })))];

  if (tab !== 'year' && hasG) {
    const opts = (tab === 'freq' ? [{ key: 'all', label: 'すべて' }] : []).concat(S.groups.map(x => ({ key: x, label: x })));
    out.push(chipRow(opts, g, k => swap(Object.assign({}, cur, { g: k, u: null }))));
  }
  if (tab === 'unit') {
    if (units.length) out.push(chipRow(units.map(x => ({ key: x.id, label: x.name })), uId, k => swap(Object.assign({}, cur, { u: k }))));
  } else if (tab === 'freq' && !(hasG && g === 'all')) {
    out.push(chipRow([{ key: 'all', label: 'すべて' }].concat(units.map(x => ({ key: x.id, label: x.name }))), uId,
      k => swap(Object.assign({}, cur, { u: k }))));
  }

  const openPlist = it => go({ v: 'plist', uid: u.id, sid: S.id, item: it.id });
  if (tab === 'unit') {
    const unit = units.find(x => x.id === uId);
    if (!unit) out.push(empty('単元がありません。科目の編集から追加できます。'));
    else if (!unit.items.length) out.push(empty('細目がありません。科目の編集から追加できます。'));
    else for (const it of unit.items) {
      out.push(bigBtn([el('span', { class: 'n' }, it.name), el('span', { class: 'r' }, String(itemCount(list, it.id)))], () => openPlist(it)));
    }
  } else if (tab === 'freq') {
    if (uId === 'all') {
      const rows = units.map((x, i) => ({ x, c: unitCount(list, x), i })).sort((a, b) => b.c - a.c || a.i - b.i);
      const max = Math.max(0, ...rows.map(r => r.c));
      if (!rows.length) out.push(empty('単元がありません。科目の編集から追加できます。'));
      rows.forEach((r, k) => out.push(rankBtn(k + 1, r.x.name + (hasG && g === 'all' ? `（${r.x.group}）` : ''), r.c, max,
        () => swap(Object.assign({}, cur, { g: hasG ? r.x.group : null, u: r.x.id })))));
    } else {
      const unit = units.find(x => x.id === uId);
      const rows = unit.items.map((it, i) => ({ it, c: itemCount(list, it.id), i })).sort((a, b) => b.c - a.c || a.i - b.i);
      const max = Math.max(0, ...rows.map(r => r.c));
      if (!rows.length) out.push(empty('細目がありません。科目の編集から追加できます。'));
      rows.forEach((r, k) => out.push(rankBtn(k + 1, r.it.name, r.c, max, () => openPlist(r.it))));
    }
  } else {
    out.push(chipRow([{ key: 'desc', label: '新しい順' }, { key: 'asc', label: '古い順' }], dir, k => swap(Object.assign({}, cur, { dir: k }))));
    const filtered = hasG && g !== 'all'
      ? list.filter(p => p.items.some(id => { const r = ITEM_MAP.get(id); return r && r.u.group === g; }))
      : list;
    const rows = sortProblems(filtered);
    if (dir === 'asc') rows.reverse();
    if (!rows.length) out.push(empty('問題がありません。右下の＋から入力できます。'));
    for (const p of rows) out.push(problemCard(p));
  }

  const unitNow = tab === 'unit' ? units.find(x => x.id === uId) : null;
  out.push(fabBtn(() => openProbForm({
    uid: u.id, sid: S.id,
    groups: hasG && g && g !== 'all' ? [g] : (unitNow && unitNow.group ? [unitNow.group] : []),
    open: unitNow ? [unitNow.id] : []
  }), 'データを入力'));
  return out;
};

/* =========================================================
   細目を開いたときの問題の一覧
   ========================================================= */
VIEWS.plist = function (st) {
  const u = getUniv(st.uid), S = getSubj(st.sid), ref = ITEM_MAP.get(st.item);
  if (!u || !S || !ref) return bail();
  const list = sortProblems(probsOf(u.id, S.id).filter(p => p.items.includes(st.item)));
  const out = [header(ref.it.name, `${u.name} · ${S.name} · ${ref.u.name}`)];
  if (!list.length) out.push(empty('この細目の問題は、まだありません。右下の＋から入力できます。'));
  for (const p of list) out.push(problemCard(p));
  out.push(fabBtn(() => openProbForm({
    uid: u.id, sid: S.id, items: [st.item], groups: ref.u.group ? [ref.u.group] : [], open: [ref.u.id]
  }), 'データを入力'));
  return out;
};

/* =========================================================
   問題の詳細
   ========================================================= */
VIEWS.detail = function (st) {
  const p = problems.find(x => x.id === st.pid);
  if (!p) return bail();
  const u = getUniv(p.uid), S = getSubj(p.sid);
  if (!u || !S) return bail();
  const units = [];
  for (const id of p.items) {
    const r = ITEM_MAP.get(id);
    if (r && !units.includes(r.u)) units.push(r.u);
  }
  const unitLabel = units.map(x => (S.groups && x.group ? `${x.name}（${x.group}）` : x.name)).join('、') || '—';
  const kv = (k, v) => el('div', { class: 'kv' }, el('span', { class: 'k' }, k), el('span', { class: 'v' }, v));
  const info = el('div', { class: 'grp' },
    kv('大学', u.name), kv('科目', S.name), kv('年', `${p.year}年`), kv('大問', String(p.dai)),
    kv('小問', p.sho ? `(${p.sho})` : 'なし'), kv('単元', unitLabel),
    el('div', { class: 'kv col' }, el('span', { class: 'k' }, '細目'),
      el('div', { class: 'tags' }, p.items.map(id => {
        const r = ITEM_MAP.get(id);
        return r ? el('span', { class: 'tg' }, r.it.name) : null;
      }))));
  const imgs = p.images.map((id, i) => {
    const im = el('img', { class: 'pimg', alt: `問題の画像 ${i + 1}` });
    fillImg(im, id);
    return el('button', { class: 'imgwrap', type: 'button', 'aria-label': `画像${i + 1}を拡大`, onclick: () => openViewer(p.images, i) }, im);
  });
  return [
    header(`${p.year}年 ${probLabel(p)}`, `${u.name} · ${S.name}`,
      pillBtn('dots', '編集と削除', () => sheetDlg('この問題', [
        { ic: 'edit', label: '編集', fn: () => openProbForm({ pid: p.id }) },
        { ic: 'trash', label: '削除', danger: true, fn: () => deleteProblem(p) }
      ]))),
    info,
    el('div', { class: 'lb' }, `画像（${p.images.length}枚・タップで拡大）`),
    imgs
  ];
};
function deleteProblem(p) {
  confirmDlg({
    title: 'この問題を削除しますか？',
    body: `${p.year}年 ${probLabel(p)} と、その画像を削除します。`,
    ok: '削除する', danger: true
  }, async () => {
    await deleteProblems([p.id]);
    history.back();
    toast('削除しました');
  });
}

/* 画像の拡大表示 */
function openViewer(ids, start) {
  let idx = start, z = 1;
  const img = el('img', { alt: '問題の画像' });
  const box = el('div', { class: 'vbox' }, img);
  const count = el('span', { class: 'vcount' });
  const steps = [1, 1.5, 2, 3, 4];
  const paint = () => {
    img.style.width = (z * 100) + '%';
    count.textContent = ids.length > 1 ? `${idx + 1} / ${ids.length}` : '';
  };
  const show = () => { img.removeAttribute('src'); fillImg(img, ids[idx]); box.scrollTo(0, 0); paint(); };
  const zoom = d => {
    const i = Math.max(0, Math.min(steps.length - 1, steps.indexOf(z) + d));
    z = steps[i];
    paint();
  };
  const bar = el('div', { class: 'vbar' },
    el('button', { class: 'vb', type: 'button', 'aria-label': '閉じる', onclick: () => closeDialog() }, icon('x', 20)),
    ids.length > 1 ? el('button', { class: 'vb', type: 'button', 'aria-label': '前の画像', onclick: () => { idx = (idx + ids.length - 1) % ids.length; z = 1; show(); } },
      el('span', { style: 'display:inline-flex;transform:rotate(180deg)' }, icon('right', 20))) : null,
    count,
    ids.length > 1 ? el('button', { class: 'vb', type: 'button', 'aria-label': '次の画像', onclick: () => { idx = (idx + 1) % ids.length; z = 1; show(); } }, icon('right', 20)) : null,
    el('span', { class: 'grow' }),
    el('button', { class: 'vb', type: 'button', 'aria-label': '縮小', onclick: () => zoom(-1) }, icon('minus', 20)),
    el('button', { class: 'vb', type: 'button', 'aria-label': '拡大', onclick: () => zoom(1) }, icon('plus', 20)));
  const ov = el('div', { class: 'viewer' }, bar, box);
  openDialog(ov);
  show();
}
