'use strict';

/* =========================================================
   大学の追加・変更
   ========================================================= */
let udraft = null;

function openUnivForm(id) {
  const u = id ? getUniv(id) : null;
  udraft = { id: id || null, name: u ? u.name : '', image: u ? u.image : null, blob: null, preview: null, removeImage: false };
  go({ v: 'univForm', id: id || null });
}

VIEWS.univForm = function () {
  if (!udraft) return bail();
  const d = udraft;
  const picker = el('button', { class: 'picker', type: 'button', 'aria-label': '画像を選ぶ' });
  const removeBtn = el('button', { class: 'link', type: 'button', onclick: () => { d.blob = null; d.preview = null; d.removeImage = true; paint(); } }, '画像を外す');
  const fileIn = el('input', {
    type: 'file', accept: 'image/*', style: 'display:none',
    onchange: async e => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try {
        d.blob = await resizeImage(f, 256, true, 0.85);
        if (d.preview) URL.revokeObjectURL(d.preview);
        d.preview = URL.createObjectURL(d.blob);
        d.removeImage = false;
        paint();
      } catch (err) { alertDlg('画像を読み込めません', err.message); }
    }
  });
  function paint() {
    picker.replaceChildren();
    if (d.preview) picker.append(el('img', { src: d.preview, alt: '' }));
    else if (d.image && !d.removeImage) { const im = el('img', { alt: '' }); fillImg(im, d.image); picker.append(im); }
    else picker.append(icon('photoplus', 28), el('span', { class: 's' }, '画像を選ぶ'));
    removeBtn.style.display = (d.preview || (d.image && !d.removeImage)) ? '' : 'none';
  }
  picker.addEventListener('click', () => fileIn.click());
  paint();

  const err = el('div', { class: 'err', role: 'alert' });
  const nameIn = el('input', {
    class: 'field', type: 'text', value: d.name, placeholder: 'D大学', maxlength: '40',
    oninput: e => { d.name = e.target.value; }
  });
  const save = async () => {
    const name = d.name.trim();
    if (!name) { err.textContent = '大学名を入力してください。'; nameIn.focus(); return; }
    let u;
    if (d.id) { u = getUniv(d.id); u.name = name; }
    else { u = { id: uid(), name, image: null }; config.universities.push(u); }
    if (d.blob) { const iid = uid(); await dbPut('images', { id: iid, blob: d.blob }); u.image = iid; }
    else if (d.removeImage) u.image = null;
    await saveConfig();
    await gcImages();
    udraft = null;
    history.back();
  };
  return [
    header(d.id ? '大学を編集' : '大学を追加'),
    el('div', { class: 'center' }, picker, removeBtn),
    fileIn,
    el('p', { class: 's ctr' }, 'なければ、頭文字が表示されます'),
    el('div', { class: 'lb' }, '大学名'), nameIn, err,
    el('button', { class: 'bt pri gap', type: 'button', onclick: save }, d.id ? '保存' : '追加')
  ];
};

/* =========================================================
   科目の追加・編集（単元と細目もここで直す）
   ========================================================= */
let sdraft = null;   // 編集中の科目
let ud = null;       // 編集中の単元
let udIndex = -1;

function openSubjForm(sid) {
  sdraft = sid
    ? clone(getSubj(sid))
    : { id: uid(), name: '', maxDai: 5, maxSho: 5, groups: null, units: [], _new: true };
  go({ v: 'subjForm', sid: sid || null });
}

function numSelect(max, value, onChange) {
  const s = el('select', { class: 'field', onchange: e => onChange(+e.target.value) });
  for (let n = 1; n <= max; n++) s.append(el('option', { value: String(n), selected: n === value }, String(n)));
  return s;
}

VIEWS.subjForm = function () {
  if (!sdraft) return bail();
  const d = sdraft;
  const err = el('div', { class: 'err', role: 'alert' });
  const nameIn = el('input', { class: 'field', type: 'text', value: d.name, placeholder: '日本史', maxlength: '30', oninput: e => { d.name = e.target.value; } });
  const unitsBox = el('div');
  const paintUnits = () => {
    unitsBox.replaceChildren();
    d.units.forEach((u, i) => unitsBox.append(el('button', { class: 'btn', type: 'button', onclick: () => openUnitForm(i) },
      el('span', { class: 'n' }, u.name),
      d.groups && u.group ? el('span', { class: 's' }, u.group) : null,
      el('span', { class: 'r' }, `細目 ${u.items.length}`, icon('right', 14)))));
    if (!d.units.length) unitsBox.append(el('p', { class: 's pad' }, 'まだ単元がありません。'));
  };
  paintUnits();

  const save = async () => {
    const name = d.name.trim();
    if (!name) { err.textContent = '科目名を入力してください。'; nameIn.focus(); return; }
    const before = getSubj(d.id);
    const removed = new Set();
    if (before) {
      const now = new Set(d.units.flatMap(u => u.items.map(i => i.id)));
      for (const u of before.units) for (const it of u.items) if (!now.has(it.id)) removed.add(it.id);
    }
    d.name = name;
    delete d._new;
    if (before) config.subjects[config.subjects.indexOf(before)] = d; else config.subjects.push(d);
    if (removed.size) {
      for (const p of problems) {
        if (p.items.some(i => removed.has(i))) {
          p.items = p.items.filter(i => !removed.has(i));
          await dbPut('problems', p);
        }
      }
    }
    await saveConfig();
    sdraft = null;
    history.back();
  };
  return [
    header(d._new ? '科目を追加' : '科目を編集'),
    el('div', { class: 'lb' }, '科目名'), nameIn,
    el('div', { class: 'two' },
      el('div', null, el('div', { class: 'lb' }, '大問の上限'), numSelect(10, d.maxDai, v => { d.maxDai = v; })),
      el('div', null, el('div', { class: 'lb' }, '小問の上限'), numSelect(30, d.maxSho, v => { d.maxSho = v; }))),
    el('div', { class: 'lb' }, '単元と細目'),
    unitsBox,
    el('button', { class: 'bt out', type: 'button', onclick: () => openUnitForm(-1) }, icon('plus', 16), '単元を追加'),
    err,
    el('button', { class: 'bt pri gap', type: 'button', onclick: save }, '保存')
  ];
};

function openUnitForm(i) {
  udIndex = i;
  ud = i >= 0 ? clone(sdraft.units[i]) : { id: uid(), name: '', group: sdraft.groups ? sdraft.groups[0] : null, items: [] };
  go({ v: 'unitForm', i });
}

VIEWS.unitForm = function () {
  if (!sdraft || !ud) return bail();
  const err = el('div', { class: 'err', role: 'alert' });
  const nameIn = el('input', { class: 'field', type: 'text', value: ud.name, placeholder: '古代', maxlength: '30', oninput: e => { ud.name = e.target.value; } });
  const itemsBox = el('div', { class: 'chips' });
  const addIn = el('input', { class: 'field', type: 'text', placeholder: '細目を入力', maxlength: '60' });

  function removeItem(it) {
    const blocked = blockedProblems([it.id]);
    if (blocked.length) {
      alertDlg('削除できません', `この細目だけが付いた問題が${blocked.length}件あります。先に、その問題の細目を変更してください。`);
      return;
    }
    const n = problems.filter(p => p.items.includes(it.id)).length;
    const doIt = () => { ud.items = ud.items.filter(x => x.id !== it.id); paintItems(); };
    if (n) confirmDlg({ title: `「${it.name}」を削除しますか？`, body: `この細目が付いた問題が${n}件あります。問題は残り、この細目だけが外れます。`, ok: '削除する', danger: true }, doIt);
    else doIt();
  }
  function paintItems() {
    itemsBox.replaceChildren();
    for (const it of ud.items) {
      itemsBox.append(el('span', { class: 'chip on sel' },
        el('button', {
          class: 'chipTxt', type: 'button', 'aria-label': `${it.name}の名前を変更`,
          onclick: () => promptDlg({ title: '細目の名前', value: it.name, ok: '変更' }, v => { it.name = v; paintItems(); })
        }, it.name),
        el('button', { class: 'chipX', type: 'button', 'aria-label': `${it.name}を削除`, onclick: () => removeItem(it) }, icon('x', 12))));
    }
    if (!ud.items.length) itemsBox.append(el('span', { class: 's' }, 'まだ細目がありません。'));
    cnt.textContent = `細目（${ud.items.length}）`;
  }
  const cnt = el('div', { class: 'lb' });
  function addNames(names) {
    let added = 0;
    for (const raw of names) {
      const name = raw.trim();
      if (!name || ud.items.some(x => x.name === name)) continue;
      ud.items.push({ id: uid(), name });
      added++;
    }
    paintItems();
    return added;
  }
  const addOne = () => { if (addNames([addIn.value])) addIn.value = ''; addIn.focus(); };
  addIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addOne(); } });
  paintItems();

  const groupHost = el('div');
  function refreshGroupChips() {
    groupHost.replaceChildren();
    if (sdraft.groups) groupHost.append(el('div', { class: 'lb' }, '区分'), chipRow(sdraft.groups.map(g => ({ key: g, label: g })), ud.group, k => { ud.group = k; refreshGroupChips(); }));
  }
  refreshGroupChips();

  const done = () => {
    const name = ud.name.trim();
    if (!name) { err.textContent = '単元名を入力してください。'; nameIn.focus(); return; }
    ud.name = name;
    if (udIndex >= 0) sdraft.units[udIndex] = ud; else sdraft.units.push(ud);
    ud = null;
    history.back();
  };
  const del = udIndex >= 0 ? el('button', {
    class: 'bt out danger-t gap', type: 'button',
    onclick: () => {
      const blocked = blockedProblems(ud.items.map(i => i.id));
      if (blocked.length) { alertDlg('削除できません', `この単元の細目だけが付いた問題が${blocked.length}件あります。先に、その問題の細目を変更してください。`); return; }
      confirmDlg({ title: `「${ud.name || 'この単元'}」を削除しますか？`, body: 'この単元の細目もすべて消えます。問題は残ります。', ok: '削除する', danger: true },
        () => { sdraft.units.splice(udIndex, 1); ud = null; history.back(); });
    }
  }, icon('trash', 16), 'この単元を削除') : null;

  return [
    header(udIndex >= 0 ? '単元を編集' : '単元を追加'),
    el('div', { class: 'lb' }, '単元名'), nameIn,
    groupHost,
    cnt, itemsBox,
    el('div', { class: 'lb' }, '細目を追加'),
    el('div', { class: 'addrow' }, addIn, el('button', { class: 'addbtn', type: 'button', 'aria-label': '追加', onclick: addOne }, icon('plus', 20))),
    el('button', {
      class: 'bt out', type: 'button', style: 'margin-top:10px',
      onclick: () => textareaDlg({ title: 'まとめて貼り付け', body: '1行に1つずつ書いてください。', placeholder: '律令国家\n摂関政治\n院政', ok: '追加' }, text => {
        const n = addNames(text.split(/\r?\n/));
        toast(n ? `${n}件追加しました` : '追加できる細目がありませんでした');
      })
    }, icon('clip', 16), 'まとめて貼り付け（1行に1つ）'),
    err,
    el('button', { class: 'bt pri gap', type: 'button', onclick: done }, '完了'),
    del
  ];
};

/* =========================================================
   問題の入力・編集
   ========================================================= */
let pd = null;

function openProbForm(o) {
  if (o.pid) {
    const p = problems.find(x => x.id === o.pid);
    pd = { id: p.id, uid: p.uid, sid: p.sid, year: p.year, dai: p.dai, sho: p.sho, items: p.items.slice(), imgs: p.images.slice(), groups: [], open: new Set(), q: '', createdAt: p.createdAt };
  } else {
    const S = getSubj(o.sid);
    pd = {
      id: null, uid: o.uid, sid: o.sid, year: lastYear.get(o.uid + '|' + o.sid) || new Date().getFullYear(),
      dai: 1, sho: S.maxSho > 0 ? 1 : null, items: (o.items || []).slice(), imgs: [],
      groups: (o.groups || []).slice(), open: new Set(o.open || []), q: ''
    };
  }
  for (const iid of pd.items) {
    const r = ITEM_MAP.get(iid);
    if (!r) continue;
    if (r.u.group && !pd.groups.includes(r.u.group)) pd.groups.push(r.u.group);
    pd.open.add(r.u.id);
  }
  go({ v: 'probForm', pid: o.pid || null });
}

VIEWS.probForm = function () {
  if (!pd) return bail();
  const S = getSubj(pd.sid), U = getUniv(pd.uid);
  if (!S || !U) return bail();
  const isEdit = !!pd.id;
  const secDai = el('div'), secSho = el('div'), secG = el('div'), secSel = el('div'), secUnits = el('div'), secImgs = el('div');
  const err = el('div', { class: 'err', role: 'alert' });

  /* 年 */
  const cy = new Date().getFullYear();
  const yearSel = el('select', { class: 'field', onchange: e => { pd.year = +e.target.value; } });
  const ys = new Set();
  for (let y = cy + 1; y >= 1990; y--) ys.add(y);
  ys.add(pd.year);
  [...ys].sort((a, b) => b - a).forEach(y => yearSel.append(el('option', { value: String(y), selected: y === pd.year }, `${y}年`)));

  /* 大問・小問 */
  function paintDai() {
    secDai.replaceChildren(el('div', { class: 'lb' }, '大問'),
      el('div', { class: 'chips' }, Array.from({ length: S.maxDai }, (_, i) => i + 1).map(n =>
        el('button', { class: 'chip big' + (pd.dai === n ? ' on' : ''), type: 'button', onclick: () => { pd.dai = n; paintDai(); } }, String(n)))));
  }
  function paintSho() {
    secSho.replaceChildren(el('div', { class: 'lb' }, '小問'));
    if (S.maxSho <= 8) {
      const chips = Array.from({ length: S.maxSho }, (_, i) => i + 1).map(n =>
        el('button', { class: 'chip' + (pd.sho === n ? ' on' : ''), type: 'button', onclick: () => { pd.sho = n; paintSho(); } }, `(${n})`));
      chips.push(el('button', { class: 'chip' + (pd.sho === null ? ' on' : ''), type: 'button', onclick: () => { pd.sho = null; paintSho(); } }, 'なし'));
      secSho.append(el('div', { class: 'chips' }, chips));
    } else {
      const s = el('select', { class: 'field', onchange: e => { pd.sho = e.target.value === '' ? null : +e.target.value; } },
        el('option', { value: '', selected: pd.sho === null }, 'なし'));
      for (let n = 1; n <= S.maxSho; n++) s.append(el('option', { value: String(n), selected: pd.sho === n }, `(${n})`));
      secSho.append(s);
    }
  }

  /* 区分（数学） */
  function paintG() {
    secG.replaceChildren();
    if (!S.groups) return;
    secG.append(el('div', { class: 'lb' }, '区分（複数選べます）'),
      el('div', { class: 'chips' }, S.groups.map(g => el('button', {
        class: 'chip' + (pd.groups.includes(g) ? ' on' : ''), type: 'button',
        onclick: () => {
          pd.groups = pd.groups.includes(g) ? pd.groups.filter(x => x !== g) : pd.groups.concat(g);
          paintG(); paintUnits();
        }
      }, g))));
  }

  /* 細目の選択 */
  function toggleItem(u, it) {
    if (pd.items.includes(it.id)) pd.items = pd.items.filter(x => x !== it.id);
    else {
      pd.items = pd.items.concat(it.id);
      if (u.group && !pd.groups.includes(u.group)) { pd.groups = pd.groups.concat(u.group); paintG(); }
    }
    paintSel(); paintUnits();
  }
  function paintSel() {
    err.textContent = '';
    secSel.replaceChildren(el('div', { class: 'lb' }, `選択中（${pd.items.length}）`));
    if (!pd.items.length) { secSel.append(el('p', { class: 's pad' }, 'まだ選んでいません。')); return; }
    secSel.append(el('div', { class: 'chips' }, pd.items.map(id => {
      const r = ITEM_MAP.get(id);
      if (!r) return null;
      return el('span', { class: 'tg rm' }, r.it.name,
        el('button', { class: 'chipX', type: 'button', 'aria-label': `${r.it.name}を外す`, onclick: () => { pd.items = pd.items.filter(x => x !== id); paintSel(); paintUnits(); } }, icon('x', 12)));
    })));
  }
  const itemChip = (u, it, withUnit) => el('button', {
    class: 'chip sm' + (pd.items.includes(it.id) ? ' on' : ''), type: 'button', onclick: () => toggleItem(u, it)
  }, it.name, withUnit ? el('span', { class: 'cu' }, u.name) : null);

  function paintUnits() {
    secUnits.replaceChildren();
    const q = norm(pd.q).trim();
    if (q) {
      const res = [];
      for (const u of S.units) for (const it of u.items) if (norm(it.name).includes(q)) res.push({ u, it });
      secUnits.append(res.length ? el('div', { class: 'chips' }, res.map(r => itemChip(r.u, r.it, true))) : el('p', { class: 's pad' }, '見つかりません。'));
      return;
    }
    if (!S.units.length) { secUnits.append(el('p', { class: 's pad' }, '単元がありません。科目の編集から追加できます。')); return; }
    if (S.groups && !pd.groups.length) { secUnits.append(el('p', { class: 's pad' }, '区分を選ぶと、単元が出ます。')); return; }
    const units = S.units.filter(u => !S.groups || pd.groups.includes(u.group));
    for (const u of units) {
      const open = pd.open.has(u.id);
      const nSel = u.items.filter(it => pd.items.includes(it.id)).length;
      const head = el('button', {
        class: 'accHead', type: 'button', 'aria-expanded': open ? 'true' : 'false',
        onclick: () => { if (open) pd.open.delete(u.id); else pd.open.add(u.id); paintUnits(); }
      },
        el('span', { class: 'n' }, u.name),
        S.groups && u.group ? el('span', { class: 's' }, u.group) : null,
        el('span', { class: 'r' }, nSel ? String(nSel) : '', icon(open ? 'up' : 'down', 16)));
      const acc = el('div', { class: 'acc' }, head);
      if (open) {
        const chips = u.items.map(it => itemChip(u, it, false));
        chips.push(el('button', {
          class: 'chip sm outl', type: 'button',
          onclick: () => promptDlg({ title: `「${u.name}」に細目を追加`, ok: '追加' }, async v => {
            let it = u.items.find(x => x.name === v);
            if (!it) { it = { id: uid(), name: v }; u.items.push(it); await saveConfig(); }
            if (!pd.items.includes(it.id)) pd.items = pd.items.concat(it.id);
            paintSel(); paintUnits();
          })
        }, icon('plus', 12), '追加'));
        acc.append(el('div', { class: 'chips inacc' }, chips));
      }
      secUnits.append(acc);
    }
  }

  /* 画像 */
  const fileIn = el('input', {
    type: 'file', accept: 'image/*', multiple: true, style: 'display:none',
    onchange: async e => {
      const files = [...e.target.files];
      e.target.value = '';
      if (!files.length) return;
      busy.textContent = '画像を読み込んでいます…';
      try {
        for (const f of files) {
          const blob = await resizeImage(f, 1800, false, 0.85);
          const id = uid();
          await dbPut('images', { id, blob });
          pd.imgs = pd.imgs.concat(id);
          paintImgs();
        }
      } catch (err2) { alertDlg('画像を読み込めません', err2.message); }
      busy.textContent = '';
    }
  });
  const busy = el('div', { class: 's pad' });
  function paintImgs() {
    err.textContent = '';
    secImgs.replaceChildren(el('div', { class: 'lb' }, '画像（1枚以上）'));
    const row = el('div', { class: 'thumbs' });
    pd.imgs.forEach((id, i) => {
      const im = el('img', { alt: `画像${i + 1}` });
      fillImg(im, id);
      row.append(el('div', { class: 'thumb' }, im,
        el('button', { class: 'thumbX', type: 'button', 'aria-label': `画像${i + 1}を外す`, onclick: () => { pd.imgs = pd.imgs.filter(x => x !== id); paintImgs(); } }, icon('x', 12))));
    });
    row.append(el('button', { class: 'thumbAdd', type: 'button', 'aria-label': '画像を追加', onclick: () => fileIn.click() }, icon('plus', 24)));
    secImgs.append(row, busy);
  }

  /* 保存 */
  async function submit(cont) {
    err.textContent = '';
    if (!pd.items.length) { err.textContent = '細目を1つ以上選んでください。'; secSel.scrollIntoView({ block: 'center' }); return; }
    if (!pd.imgs.length) { err.textContent = '画像を1枚以上入れてください。'; secImgs.scrollIntoView({ block: 'center' }); return; }
    const now = Date.now();
    const rec = {
      id: pd.id || uid(), uid: pd.uid, sid: pd.sid, year: pd.year, dai: pd.dai, sho: pd.sho,
      items: pd.items.slice(), images: pd.imgs.slice(), createdAt: pd.createdAt || now, updatedAt: now
    };
    await saveProblemRec(rec);
    lastYear.set(pd.uid + '|' + pd.sid, pd.year);
    if (cont && !isEdit) {
      pd = Object.assign({}, pd, {
        id: null, items: [], q: '',
        sho: pd.sho !== null && pd.sho < S.maxSho ? pd.sho + 1 : pd.sho,
        imgs: pd.imgs.slice()
      });
      render();
      window.scrollTo(0, 0);
      toast('保存しました。続けて入力できます');
      return;
    }
    await gcImages();
    pd = null;
    history.back();
    toast('保存しました');
  }

  const search = el('div', { class: 'searchBox' }, icon('search', 16),
    el('input', {
      type: 'search', placeholder: '細目を検索', 'aria-label': '細目を検索', value: pd.q,
      oninput: e => { pd.q = e.target.value; paintUnits(); }
    }));

  paintDai(); paintSho(); paintG(); paintSel(); paintUnits(); paintImgs();

  return [
    header(isEdit ? '問題を編集' : '問題を追加', `${U.name} · ${S.name}`),
    el('div', { class: 'lb' }, '年'), yearSel,
    secDai, secSho, secG,
    el('div', { class: 'lb' }, S.groups ? '細目（区分をまたいで選べます）' : '細目（単元をまたいで選べます）'),
    search, secSel, secUnits,
    secImgs, fileIn,
    err,
    el('button', { class: 'bt pri gap', type: 'button', onclick: () => submit(false) }, '保存'),
    isEdit ? null : el('button', { class: 'bt out', type: 'button', style: 'margin-top:8px', onclick: () => submit(true) }, '保存して続ける')
  ];
};

/* =========================================================
   起動
   ========================================================= */
async function boot() {
  try {
    db = await openDB();
    config = await dbGet('kv', 'config');
    if (!config) { config = seedConfig(); await dbPut('kv', config, 'config'); }
    problems = await dbAll('problems');
    reindex();
    await gcImages();
  } catch (e) {
    $('#app').append(el('p', { class: 'empty' }, 'この環境では、データを保存できません。プライベートモードを終了して、もう一度開いてください。'));
    return;
  }
  history.replaceState({ v: 'home' }, '');
  render();
}
boot();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => { /* オフライン用。登録できなくても動きます */ }); });
}
