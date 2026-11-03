const $ = s => document.querySelector(s);
const p2 = n => String(n).padStart(2, '0'), p3 = n => String(n).padStart(3, '0');
const COLORS = ['#555', '#d93a3a', '#2ea84f', '#d4b52a', '#2f6fed', '#b04fd6', '#2ec4c4', '#e6e6e6'];
const range = (n, f) => Array.from({ length: n }, (_, i) => f(i + 1));

// ---------- definição dos strips ----------
const KINDS = {
  ch: { sec: ['Config', 'Preamp', 'Gate', 'Dyn', 'EQ', 'Sends'], eq: 4, sends: 16, sl: 'Bus' },
  auxin: { sec: ['Config', 'EQ', 'Sends'], eq: 4, sends: 16, sl: 'Bus' },
  fxrtn: { sec: ['Config', 'EQ', 'Sends'], eq: 4, sends: 16, sl: 'Bus' },
  bus: { sec: ['Config', 'Dyn', 'EQ', 'Sends'], eq: 6, sends: 6, sl: 'Mtx' },
  mtx: { sec: ['Config', 'Dyn', 'EQ'], eq: 6 },
  main: { sec: ['Dyn', 'EQ'], eq: 6 }
};
function S(label, base, meter, kind, o = {}) {
  return {
    label, base, meter, kind, defName: label,
    solo: o.solo !== undefined ? o.solo : (meter >= 0 ? meter + 1 : null),
    fader: o.fader || base + '/mix/fader', on: o.on || base + '/mix/on',
    pan: o.pan === null ? null : (o.pan || base + '/mix/pan'),
    name: o.name === null ? null : (o.name || base + '/config/name'),
    color: o.color === null ? null : (o.color || base + '/config/color')
  };
}
const LAYERS = {
  'Ch 1-16': range(16, i => S('Ch ' + i, `/ch/${p2(i)}`, i - 1, 'ch')),
  'Ch 17-32': range(16, i => S('Ch ' + (i + 16), `/ch/${p2(i + 16)}`, i + 15, 'ch')),
  'Aux / FX': [...range(8, i => S('Aux ' + i, `/auxin/${p2(i)}`, 31 + i, 'auxin')), ...range(8, i => S('FX ' + ['1L', '1R', '2L', '2R', '3L', '3R', '4L', '4R'][i - 1], `/fxrtn/${p2(i)}`, 39 + i, 'fxrtn'))],
  'Buses': range(16, i => S('Bus ' + i, `/bus/${p2(i)}`, 47 + i, 'bus')),
  'Main / Mtx': [S('Main LR', '/main/st', -1, 'main', { name: null, color: null, solo: 71 }), S('Mono', '/main/m', -1, 'main', { name: null, color: null, pan: null, solo: 72 }),
    ...range(6, i => S('Mtx ' + i, `/mtx/${p2(i)}`, 63 + i, 'mtx', { pan: null }))],
  'DCA': range(8, i => S('DCA ' + i, `/dca/${i}`, -1, null, { fader: `/dca/${i}/fader`, on: `/dca/${i}/on`, name: `/dca/${i}/config/name`, color: `/dca/${i}/config/color`, pan: null, solo: 72 + i }))
};
const allStrips = () => Object.values(LAYERS).flat();

// ---------- conversões (curvas da X32) ----------
const toDb = f => f >= .5 ? f * 40 - 30 : f >= .25 ? f * 80 - 50 : f >= .0625 ? f * 160 - 70 : f * 480 - 90;
const fmtDb = f => f <= 0.0001 ? '-∞' : (toDb(f) >= 0 ? '+' : '') + toDb(f).toFixed(1);
const lin = (a, b, u) => f => (a + f * (b - a)).toFixed(1) + u;
const logf = (a, b, u) => f => { const v = a * Math.pow(b / a, f); return (v >= 1000 && u === 'Hz' ? (v / 1000).toFixed(2) + 'k' : v.toFixed(v < 10 ? 2 : 0)) + (u === 'Hz' ? 'Hz' : u); };
const hz = f => 20 * Math.pow(1000, f), qv = f => 10 * Math.pow(0.03, f);

const state = {}; let cur = null, els = [], last = {};
function throttle(a, t, v) { const n = Date.now(); if (!last[a] || n - last[a] > 30) { last[a] = n; x32.set(a, t, v); } else { clearTimeout(throttle['t' + a]); throttle['t' + a] = setTimeout(() => x32.set(a, t, v), 35); } }

// ---------- strips ----------
const dbToF = db => db >= -10 ? (db + 30) / 40 : db >= -30 ? (db + 50) / 80 : db >= -60 ? (db + 70) / 160 : (db + 90) / 480;
const MARKS = [[10, '10'], [5, '5'], [0, '0'], [-5, '5'], [-10, '10'], [-20, '20'], [-30, '30'], [-50, '50']];
const MAINLR = LAYERS['Main / Mtx'][0], MONO = LAYERS['Main / Mtx'][1];
const FIXED = {
  '1-32': [...LAYERS['Ch 1-16'], ...LAYERS['Ch 17-32']], 'Aux FX': LAYERS['Aux / FX'],
  'Bus Mtx': [...LAYERS['Buses'], ...LAYERS['Main / Mtx'].filter(s => s !== MAINLR)], 'DCA': LAYERS['DCA']
};
const SOFK = ['ch', 'auxin', 'fxrtn'], RATIOS = [1.1, 1.3, 1.5, 2, 2.5, 3, 4, 5, 7, 10, 20, 100];
const USER_BANKS = ['User 1', 'User 2', 'User 3'];
const byBase = {}; allStrips().forEach(s => byBase[s.base] = s);
const ubLoad = () => { try { return JSON.parse(localStorage.getItem('userBanks') || '{}'); } catch (e) { return {}; } };
const bankStrips = n => FIXED[n] || (ubLoad()[n] || []).map(b => byBase[b]).filter(Boolean);
let selS = null, curPage = 'Mixer', sofBus = null, pinS = null;
const faAddr = s => sofBus && SOFK.includes(s.kind) ? `${s.base}/mix/${p2(sofBus)}/level` : s.fader;
const oaAddr = s => sofBus && SOFK.includes(s.kind) ? `${s.base}/mix/${p2(sofBus)}/on` : s.on;
const lblFmt = l => l.replace(/(\d+)(?=\D*$)/, m => m.length < 2 ? '0' + m : m);
const dbTxt = f => fmtDb(f).replace('∞', 'oo');
function setPage(n) { curPage = n; document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.n === n)); }

function mkStrip(s, box) {
  const d = document.createElement('div'); d.className = 'strip' + (s === MAINLR ? ' main' : '');
  const scale = MARKS.map(([db, t]) => `<span class="${db === 0 ? 'z' : ''}" style="bottom:calc(${dbToF(db)} * (100% - 20px) + 10px)">${t}</span>`).join('') + '<span style="bottom:10px">∞</span>';
  d.innerHTML = `<canvas class="mini g" width="86" height="48"></canvas><canvas class="mini d" width="86" height="48"></canvas><canvas class="mini q" width="86" height="48"></canvas>
    <div class="nm">${s.defName}</div>
    ${s.pan ? '<input class="pan" type="range" min="0" max="1" step="0.01" value="0.5" title="Pan (duplo clique = centro)">' : '<div class="pan0"></div>'}
    ${s.solo ? '<button class="solo">Solo</button>' : '<div class="solo0"></div>'}
    <div class="db">-oo</div>
    <div class="fw"><div class="scale">${scale}</div><input class="fader" type="range" min="0" max="1" step="0.001" value="0"><div class="meter"><i></i></div></div>
    <button class="mute">Mute</button>
    <div class="bar">${lblFmt(s.label)}</div>`;
  box.appendChild(d);
  const e = { s, d, nm: d.querySelector('.nm'), bar: d.querySelector('.bar'), pan: d.querySelector('.pan'), mute: d.querySelector('.mute'), solo: d.querySelector('.solo'),
    sa: s.solo ? `/-stat/solosw/${p2(s.solo)}` : null, fader: d.querySelector('.fader'), db: d.querySelector('.db'), mt: d.querySelector('.meter i'),
    cg: d.querySelector('.mini.g'), cd: d.querySelector('.mini.d'), cq: d.querySelector('.mini.q'), fa: faAddr(s), oa: oaAddr(s) };
  e.fader.oninput = () => { state[e.fa] = +e.fader.value; e.db.textContent = dbTxt(+e.fader.value); throttle(e.fa, 'f', +e.fader.value); };
  e.fader.ondblclick = () => { e.fader.value = 0.75; e.fader.oninput(); };
  e.mute.onclick = () => { const on = state[e.oa] === 1 ? 0 : 1; state[e.oa] = on; refresh(e); x32.set(e.oa, 'i', on); };
  if (e.pan) { e.pan.oninput = () => { state[s.pan] = +e.pan.value; throttle(s.pan, 'f', +e.pan.value); }; e.pan.ondblclick = () => { e.pan.value = .5; e.pan.oninput(); }; }
  if (e.solo) e.solo.onclick = () => { state[e.sa] = state[e.sa] ? 0 : 1; x32.set(e.sa, 'i', state[e.sa]); refresh(e); };
  if (s.kind) {
    e.nm.onclick = e.bar.onclick = () => select(s); e.nm.style.cursor = e.bar.style.cursor = 'pointer';
    const k0 = KINDS[s.kind], go = t => () => { select(s); showTab(t); };
    [[e.cg, 'Gate'], [e.cd, 'Dyn'], [e.cq, 'EQ']].forEach(([cv, t]) => { if (k0.sec.includes(t)) { cv.onclick = go(t); cv.style.cursor = 'pointer'; cv.title = 'Abrir ' + t; } });
  }
  els.push(e); refresh(e); drawMini(e); return e;
}
function build(bank) {
  cur = bank; els = []; const box = $('#strips'); box.innerHTML = ''; $('#mainstrip').innerHTML = ''; $('#pinstrip').innerHTML = '';
  document.querySelectorAll('#banks button').forEach(b => b.classList.toggle('on', b.dataset.n === bank));
  const list = bankStrips(bank); list.forEach(s => mkStrip(s, box));
  if (!list.length) { const h = document.createElement('div'); h.className = 'empty'; h.textContent = 'Banco vazio. Clique em "✎ Editar bancos" (barra lateral) para escolher os canais deste banco.'; box.appendChild(h); }
  mkStrip(MAINLR, $('#mainstrip'));
  if (pinS) mkStrip(pinS, $('#pinstrip')).d.classList.add('pinned');
  els.forEach(e => e.d.classList.toggle('sel', e.s === selS));
  const q = els.filter(e => e.sa).map(e => e.sa); if (sofBus) els.forEach(e => { if (SOFK.includes(e.s.kind)) { e.d.classList.add('sof'); q.push(e.fa, e.oa); } });
  x32.query(q);
}
const selPages = ['Channel', 'Config', 'Gate', 'Dyn', 'EQ', 'Sends'];
function select(s) { selS = s; els.forEach(e => e.d.classList.toggle('sel', e.s === s)); $('#selbox').textContent = lblFmt(s.label); if (selPages.includes(curPage)) showTab(curPage); }
function refresh(e) {
  const s = e.s, st = state;
  if (document.activeElement !== e.fader) e.fader.value = e.fa in st ? st[e.fa] : 0;
  e.db.textContent = e.fa in st ? dbTxt(st[e.fa]) : '-oo';
  e.mute.classList.toggle('m', st[e.oa] === 0);
  if (s.pan && s.pan in st && document.activeElement !== e.pan) e.pan.value = st[s.pan];
  if (e.sa && e.solo) e.solo.classList.toggle('s', !!st[e.sa]);
  if (s.name && st[s.name]) { e.nm.textContent = st[s.name]; e.nm.title = st[s.name]; }
  if (s.color && s.color in st) { const col = COLORS[st[s.color] % 8]; e.d.style.setProperty('--c', col); }
}
// mini-gráficos (gate, dinâmica, EQ) de cada faixa
function miniBase(c) { const x = c.getContext('2d'); x.fillStyle = '#050505'; x.fillRect(0, 0, c.width, c.height); x.strokeStyle = '#202020'; x.lineWidth = 1; x.beginPath(); x.moveTo(0, c.height / 2); x.lineTo(c.width, c.height / 2); x.stroke(); return x; }
function miniLine(c, x, pts, on) { x.strokeStyle = on ? '#35e0e0' : '#7a7a7a'; x.lineWidth = 2; x.beginPath(); pts.forEach(([px, py], i) => { const X = px * c.width, Y = (1 - py) * c.height; i ? x.lineTo(X, Y) : x.moveTo(X, Y); }); x.stroke(); }
function drawMini(e) {
  const s = e.s, b = s.base, k = KINDS[s.kind], st = state; if (!k) return;
  let x = miniBase(e.cg);
  if (k.sec.includes('Gate')) {
    const t = st[b + '/gate/thr'];
    if (t === undefined) miniLine(e.cg, x, [[0, 0], [1, 1]], false);
    else { const thr = t * 80 - 80, rg = 3 + (st[b + '/gate/range'] ?? 1) * 57, pts = []; for (let i = 0; i <= 40; i++) { const inn = -80 + i * 2, out = inn >= thr ? inn : Math.max(inn - rg, -80); pts.push([(inn + 80) / 80, (out + 80) / 80]); } miniLine(e.cg, x, pts, st[b + '/gate/on'] === 1); }
  }
  x = miniBase(e.cd);
  if (k.sec.includes('Dyn')) {
    const t = st[b + '/dyn/thr'];
    if (t === undefined) miniLine(e.cd, x, [[0, 0], [1, 1]], false);
    else { const thr = t * 60 - 60, R = RATIOS[st[b + '/dyn/ratio'] | 0] || 1, mk = (st[b + '/dyn/mgain'] ?? 0) * 24, pts = []; for (let i = 0; i <= 30; i++) { const inn = -60 + i * 2, out = (inn < thr ? inn : thr + (inn - thr) / R) + mk; pts.push([(inn + 60) / 60, Math.max(0, Math.min(1, (out + 60) / 60))]); } miniLine(e.cd, x, pts, st[b + '/dyn/on'] === 1); }
  }
  x = miniBase(e.cq);
  if (k.sec.includes('EQ')) {
    const pts = []; for (let i = 0; i <= 40; i++) { const f = 20 * Math.pow(1000, i / 40); let db = 0; for (let j = 1; j <= k.eq; j++) { const q = `${b}/eq/${j}`; if (!(q + '/f' in st)) continue; db += bandDb(st[q + '/type'] | 0, hz(st[q + '/f']), (st[q + '/g'] ?? .5) * 30 - 15, qv(st[q + '/q'] ?? .5), f); } pts.push([i / 40, 0.5 + Math.max(-15, Math.min(15, db)) / 30]); }
    miniLine(e.cq, x, pts, st[b + '/eq/on'] !== 0);
  }
}
let miniQ = false;
function miniDirty(e) { e.dirty = true; if (!miniQ) { miniQ = true; requestAnimationFrame(() => { miniQ = false; els.forEach(x => { if (x.dirty) { x.dirty = false; drawMini(x); } }); }); } }
function queryAll() {
  const l = [], l2 = [];
  allStrips().forEach(s => {
    [s.fader, s.on, s.pan, s.name, s.color, s.solo && `/-stat/solosw/${p2(s.solo)}`].forEach(a => a && l.push(a));
    const k = KINDS[s.kind]; if (!k) return;
    if (k.sec.includes('EQ')) { l2.push(s.base + '/eq/on'); for (let i = 1; i <= k.eq; i++) ['type', 'f', 'g', 'q'].forEach(p => l2.push(`${s.base}/eq/${i}/${p}`)); }
    if (k.sec.includes('Dyn')) ['on', 'thr', 'ratio', 'mgain'].forEach(p => l2.push(`${s.base}/dyn/${p}`));
    if (k.sec.includes('Gate')) ['on', 'thr', 'range'].forEach(p => l2.push(`${s.base}/gate/${p}`));
  });
  for (let i = 1; i <= 6; i++) l.push('/config/mute/' + i);
  x32.query(l.concat(l2));
}

// ---------- painel de detalhes ----------
let reg = {}, pending = [], eqInfo = null, dynInfos = [], rtaOn = false, rtaData = [];
const addReg = (a, f) => (reg[a] = reg[a] || []).push(f);
function mkSlider(addr, fmt, val) {
  const i = document.createElement('input'); i.type = 'range'; i.min = 0; i.max = 1; i.step = 0.001; i.value = 0;
  i.oninput = () => { state[addr] = +i.value; val.textContent = fmt(+i.value); throttle(addr, 'f', +i.value); eqDraw(); };
  addReg(addr, v => { if (document.activeElement !== i) { i.value = v; val.textContent = fmt(v); } });
  return i;
}
function mkCheck(addr) {
  const c = document.createElement('input'); c.type = 'checkbox';
  c.onchange = () => { state[addr] = +c.checked; x32.set(addr, 'i', +c.checked); eqDraw(); };
  addReg(addr, v => c.checked = !!v); pending.push(addr); return c;
}
// sp: {t:'f',fmt} | {t:'b'} | {t:'e',opts}
function row(label, addr, sp, onAddr) {
  const r = document.createElement('div'); r.className = 'row';
  const l = document.createElement('label'); l.textContent = label; r.appendChild(l);
  const val = document.createElement('span'); val.className = 'v'; pending.push(addr);
  if (sp.t === 'b') r.appendChild(mkCheck(addr));
  else if (sp.t === 'e') {
    const s = document.createElement('select'); sp.opts.forEach((o, i) => s.add(new Option(o, i)));
    s.onchange = () => { state[addr] = +s.value; x32.set(addr, 'i', +s.value); eqDraw(); els.forEach(refresh); };
    addReg(addr, v => s.value = v); r.appendChild(s);
  } else { r.append(mkSlider(addr, sp.fmt, val), val); }
  if (onAddr) { const c = mkCheck(onAddr); c.title = 'Ativo'; r.appendChild(c); }
  if (addr in state && reg[addr]) reg[addr].forEach(f => f(state[addr]));
  if (onAddr && onAddr in state) reg[onAddr].forEach(f => f(state[onAddr]));
  return r;
}
function textRow(label, addr, max) {
  const r = document.createElement('div'); r.className = 'row'; r.innerHTML = `<label>${label}</label>`;
  const i = document.createElement('input'); i.className = 'tx'; i.maxLength = max; i.value = state[addr] || '';
  i.onchange = () => { state[addr] = i.value; x32.set(addr, 's', i.value); els.forEach(refresh); };
  addReg(addr, v => { if (document.activeElement !== i) i.value = v; }); pending.push(addr); r.appendChild(i); return r;
}
const COLN = ['OFF', 'Vermelho', 'Verde', 'Amarelo', 'Azul', 'Magenta', 'Ciano', 'Branco'].flatMap((n, i, l) => [n]).concat(['OFF', 'Vermelho', 'Verde', 'Amarelo', 'Azul', 'Magenta', 'Ciano', 'Branco'].map(n => n + ' (inv.)'));
const ICONS = ['—', ...range(74, i => 'Ícone ' + i)];
const dyn = {
  gate: b => [['On', b + '/on', { t: 'b' }], ['Threshold', b + '/thr', { t: 'f', fmt: lin(-80, 0, ' dB') }], ['Range', b + '/range', { t: 'f', fmt: lin(3, 60, ' dB') }],
    ['Attack', b + '/attack', { t: 'f', fmt: lin(0, 120, ' ms') }], ['Hold', b + '/hold', { t: 'f', fmt: logf(0.02, 2000, ' ms') }], ['Release', b + '/release', { t: 'f', fmt: logf(5, 4000, ' ms') }]],
  dyn: b => [['On', b + '/on', { t: 'b' }], ['Threshold', b + '/thr', { t: 'f', fmt: lin(-60, 0, ' dB') }],
    ['Ratio', b + '/ratio', { t: 'e', opts: ['1.1', '1.3', '1.5', '2.0', '2.5', '3.0', '4.0', '5.0', '7.0', '10', '20', '100'] }],
    ['Makeup', b + '/mgain', { t: 'f', fmt: lin(0, 24, ' dB') }], ['Attack', b + '/attack', { t: 'f', fmt: lin(0, 120, ' ms') }],
    ['Release', b + '/release', { t: 'f', fmt: logf(5, 4000, ' ms') }], ['Mix', b + '/mix', { t: 'f', fmt: lin(0, 100, ' %') }]]
};
const EQT = ['LCut', 'LShv', 'PEQ', 'VEQ', 'HShv', 'HCut'];
function section(name, s) {
  const k = KINDS[s.kind], w = document.createElement('div'), b = s.base;
  if (name === 'Config') {
    w.appendChild(textRow('Nome', b + '/config/name', 12)); w.appendChild(row('Cor', b + '/config/color', { t: 'e', opts: COLN })); w.appendChild(row('Ícone', b + '/config/icon', { t: 'e', opts: ICONS }));
    const n = document.createElement('p'); n.style.color = '#8b93a1'; n.textContent = 'O ícone é o número (1-74) da biblioteca da mesa.'; w.appendChild(n);
  } else if (name === 'Preamp') [['Trim', b + '/preamp/trim', { t: 'f', fmt: lin(-18, 18, ' dB') }], ['Low cut', b + '/preamp/hpon', { t: 'b' }], ['Freq low cut', b + '/preamp/hpf', { t: 'f', fmt: logf(20, 400, 'Hz') }], ['Fase (inv.)', b + '/preamp/invert', { t: 'b' }], ['Delay entrada', b + '/delay/on', { t: 'b' }], ['Tempo delay', b + '/delay/time', { t: 'f', fmt: lin(0.3, 500, ' ms') }]].forEach(r => w.appendChild(row(...r)));
  else if (name === 'Gate') { dynGfx(w, b, 'gate'); dyn.gate(b + '/gate').forEach(r => w.appendChild(row(...r))); }
  else if (name === 'Dyn') { dynGfx(w, b, 'dyn'); dyn.dyn(b + '/dyn').forEach(r => w.appendChild(row(...r))); }
  else if (name === 'Sends') for (let i = 1; i <= k.sends; i++) w.appendChild(row(k.sl + ' ' + i, `${b}/mix/${p2(i)}/level`, { t: 'f', fmt: fmtDb }, `${b}/mix/${p2(i)}/on`));
  else if (name === 'EQ') {
    const cv = document.createElement('canvas'); cv.className = 'eq'; cv.width = 1200; cv.height = 340; w.appendChild(cv);
    cv.onmousedown = eqDown; cv.onwheel = eqWheel;
    w.appendChild(row('EQ On', b + '/eq/on', { t: 'b' }));
    const ro = document.createElement('label'); ro.className = 'rtaopt', cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = rtaOn;
    cb.onchange = () => { rtaOn = cb.checked; x32.rta(rtaOn); if (!rtaOn) { rtaData = []; eqDraw(); } };
    ro.append(cb, ' Mostrar RTA (analisador de espectro da mesa, experimental)'); w.appendChild(ro);
    const hint = document.createElement('p'); hint.className = 'hint'; hint.textContent = 'Arraste os pontos numerados no gráfico: horizontal muda a frequência, vertical muda o ganho. Roda do mouse muda o Q da banda selecionada.'; w.appendChild(hint);
    const bs = document.createElement('div'); bs.className = 'bands';
    for (let i = 1; i <= k.eq; i++) {
      const d = document.createElement('div'); d.className = 'band'; d.innerHTML = `<h4>Banda ${i}</h4>`; const q = `${b}/eq/${i}`;
      [['Tipo', q + '/type', { t: 'e', opts: EQT }], ['Freq', q + '/f', { t: 'f', fmt: logf(20, 20000, 'Hz') }], ['Ganho', q + '/g', { t: 'f', fmt: lin(-15, 15, ' dB') }], ['Q', q + '/q', { t: 'f', fmt: f => qv(f).toFixed(2) }]].forEach(r => d.appendChild(row(...r)));
      bs.appendChild(d);
    }
    w.appendChild(bs); eqInfo = { cv, b, n: k.eq }; setTimeout(eqDraw, 0);
  }
  return w;
}
function openDetail(s) {
  const D = $('#detail'), k = KINDS[s.kind]; D.hidden = false; D.innerHTML = '';
  const nm = state[s.name] || s.defName;
  const h = document.createElement('div'); h.className = 'dh'; h.innerHTML = `<b>${s.label} — ${nm}</b>`;
  const body = document.createElement('div'); body.className = 'db2';
  const show = n => {
    reg = {}; pending = []; eqInfo = null; dynInfos = []; rtaStop(); body.innerHTML = ''; body.appendChild(section(n, s));
    h.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.textContent === n)); x32.query(pending.slice());
  };
  k.sec.forEach(n => { const b = document.createElement('button'); b.textContent = n; b.onclick = () => show(n); h.appendChild(b); });
  const x = document.createElement('button'); x.textContent = 'Fechar'; x.className = 'x'; x.onclick = closeDetail; h.appendChild(x);
  D.append(h, body); show(k.sec[k.sec.indexOf('EQ') >= 0 ? k.sec.indexOf('EQ') : 0]);
}
function closeDetail() { els.forEach(refresh); }

// ---------- curva de EQ ----------
function bandDb(type, f0, g, q, f) {
  const w0 = 2 * Math.PI * f0 / 48000, c = Math.cos(w0), s = Math.sin(w0), A = Math.pow(10, g / 40);
  let al = s / (2 * q), b0, b1, b2, a0, a1, a2;
  if (type === 0) { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  else if (type === 5) { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  else if (type === 1 || type === 4) {
    const sq = 2 * Math.sqrt(A) * (s / 2 * Math.SQRT2);
    if (type === 1) { b0 = A * ((A + 1) - (A - 1) * c + sq); b1 = 2 * A * ((A - 1) - (A + 1) * c); b2 = A * ((A + 1) - (A - 1) * c - sq); a0 = (A + 1) + (A - 1) * c + sq; a1 = -2 * ((A - 1) + (A + 1) * c); a2 = (A + 1) + (A - 1) * c - sq; }
    else { b0 = A * ((A + 1) + (A - 1) * c + sq); b1 = -2 * A * ((A - 1) + (A + 1) * c); b2 = A * ((A + 1) + (A - 1) * c - sq); a0 = (A + 1) - (A - 1) * c + sq; a1 = 2 * ((A - 1) - (A + 1) * c); a2 = (A + 1) - (A - 1) * c - sq; }
  } else { b0 = 1 + al * A; b1 = -2 * c; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * c; a2 = 1 - al / A; }
  const w = 2 * Math.PI * f / 48000, cw = Math.cos(w), sw = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
  const nr = b0 + b1 * cw + b2 * c2, ni = -(b1 * sw + b2 * s2), dr = a0 + a1 * cw + a2 * c2, di = -(a1 * sw + a2 * s2);
  return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di));
}
const BCOL = ['#ff5252', '#ffd400', '#4be37a', '#35e0e0', '#b388ff', '#ff8a3d'];
let eqSel = 1, eqDrag = null;
const fmtHz = v => v >= 1000 ? (v / 1000).toFixed(2) + ' kHz' : Math.round(v) + ' Hz';
function eqPos(i) { const q = `${eqInfo.b}/eq/${i}`; if (!(q + '/f' in state)) return null; const t = state[q + '/type'] | 0; return { q, t, f: hz(state[q + '/f']), g: (t === 0 || t === 5) ? 0 : (state[q + '/g'] ?? .5) * 30 - 15 }; }
function eqXY(p) { const { cv } = eqInfo; return [Math.log10(p.f / 20) / 3 * cv.width, cv.height / 2 - Math.max(-18, Math.min(18, p.g)) / 18 * cv.height / 2]; }
function canvasXY(e) { const r = eqInfo.cv.getBoundingClientRect(); return [(e.clientX - r.left) * eqInfo.cv.width / r.width, (e.clientY - r.top) * eqInfo.cv.height / r.height]; }
function setParam(a, v) { state[a] = v; throttle(a, 'f', v); (reg[a] || []).forEach(f => f(v)); }
function eqDown(e) {
  if (!eqInfo) return; const [mx, my] = canvasXY(e); let best = null, bd = 30 * eqInfo.cv.width / eqInfo.cv.getBoundingClientRect().width;
  for (let i = 1; i <= eqInfo.n; i++) { const p = eqPos(i); if (!p) continue; const [x, y] = eqXY(p), d = Math.hypot(x - mx, y - my); if (d < bd) { bd = d; best = i; } }
  if (best) { eqSel = best; eqDrag = best; eqDraw(); e.preventDefault(); }
}
function eqMove(e) {
  if (!eqDrag || !eqInfo) return; const p = eqPos(eqDrag); if (!p) return; const [mx, my] = canvasXY(e), W = eqInfo.cv.width, H = eqInfo.cv.height;
  setParam(p.q + '/f', Math.round(Math.max(0, Math.min(1, mx / W)) * 200) / 200);
  if (p.t !== 0 && p.t !== 5) setParam(p.q + '/g', Math.round((Math.max(-15, Math.min(15, (H / 2 - my) / (H / 2) * 18)) + 15) / 30 * 120) / 120);
  eqDraw();
}
function eqWheel(e) {
  if (!eqInfo) return; e.preventDefault(); const p = eqPos(eqSel); if (!p) return;
  setParam(p.q + '/q', Math.max(0, Math.min(1, (state[p.q + '/q'] ?? .5) + (e.deltaY < 0 ? -0.02 : 0.02)))); eqDraw();
}
window.addEventListener('mousemove', eqMove); window.addEventListener('mouseup', () => { eqDrag = null; });
function rtaStop() { if (rtaOn) { rtaOn = false; rtaData = []; x32.rta(false); } }
function eqDraw() {
  dynDraw();
  if (!eqInfo) return; const { cv, b, n } = eqInfo, c = cv.getContext('2d'), W = cv.width, H = cv.height, XF = f => Math.log10(f / 20) / 3 * W, YD = d => H / 2 - d / 18 * H / 2;
  c.clearRect(0, 0, W, H); c.lineWidth = 1; c.font = '15px sans-serif';
  const major = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
  [20, 30, 40, 50, 60, 70, 80, 90, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 20000].forEach(f => {
    const x = XF(f), mj = major.includes(f); c.strokeStyle = mj ? '#3d424c' : '#23272e'; c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke();
    if (mj) { c.fillStyle = '#9aa3b2'; c.fillText(f >= 1000 ? f / 1000 + 'k' : f, Math.min(x + 4, W - 34), H - 6); }
  });
  [-15, -10, -5, 0, 5, 10, 15].forEach(d => { const y = YD(d); c.strokeStyle = d === 0 ? '#4d535e' : '#2a2e36'; c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); c.fillStyle = '#9aa3b2'; c.fillText(d > 0 ? '+' + d : d, 4, y - 3); });
  if (rtaOn && rtaData.length) {
    c.beginPath(); c.moveTo(0, H);
    rtaData.forEach((db, i) => c.lineTo(i / (rtaData.length - 1) * W, H - Math.max(0, Math.min(1, (db + 90) / 90)) * H * 0.92));
    c.lineTo(W, H); c.closePath(); c.fillStyle = 'rgba(80,200,120,.28)'; c.fill(); c.strokeStyle = 'rgba(130,235,160,.9)'; c.lineWidth = 1.5; c.stroke();
  }
  c.strokeStyle = state[b + '/eq/on'] === 0 ? '#666' : '#35e0e0'; c.lineWidth = 3; c.beginPath();
  for (let x = 0; x <= W; x += 4) {
    const f = 20 * Math.pow(1000, x / W); let db = 0;
    for (let i = 1; i <= n; i++) { const q = `${b}/eq/${i}`; if (!(q + '/f' in state)) continue; db += bandDb(state[q + '/type'] | 0, hz(state[q + '/f']), (state[q + '/g'] ?? .5) * 30 - 15, qv(state[q + '/q'] ?? .5), f); }
    const y = YD(Math.max(-18, Math.min(18, db))); x ? c.lineTo(x, y) : c.moveTo(x, y);
  }
  c.stroke();
  for (let i = 1; i <= n; i++) {
    const p = eqPos(i); if (!p) continue; const [x, y] = eqXY(p);
    c.beginPath(); c.arc(x, y, 13, 0, 7); c.fillStyle = BCOL[(i - 1) % 6] + (i === eqSel ? 'ff' : 'aa'); c.fill(); c.lineWidth = i === eqSel ? 3 : 1.5; c.strokeStyle = i === eqSel ? '#fff' : '#000'; c.stroke();
    c.fillStyle = '#000'; c.font = 'bold 14px sans-serif'; c.textAlign = 'center'; c.fillText(i, x, y + 5); c.textAlign = 'left';
  }
  const ps = eqPos(eqSel);
  if (ps) { const q = state[ps.q + '/q'] ?? .5; c.font = 'bold 16px sans-serif'; c.fillStyle = '#fff'; c.fillText(`Banda ${eqSel}:  ${fmtHz(ps.f)}   ${ps.g >= 0 ? '+' : ''}${ps.g.toFixed(1)} dB   Q ${qv(q).toFixed(2)}`, 44, 22); }
}

// ---------- cenas e snapshots ----------
const snaps = () => JSON.parse(localStorage.getItem('snaps') || '[]');
function buildScenes() {
  setPage('Library'); reg = {}; pending = []; eqInfo = null; dynInfos = []; rtaStop();
  const box = $('#page'); box.innerHTML = `<div class="sc"><div id="xs"><h3>Cenas da mesa</h3>
    <div><input id="scName" placeholder="Nome para salvar"> <small>(escolha o nº e clique Salvar)</small></div><div id="scList"></div></div>
    <div id="ls"><h3>Snapshots do app (fader / mute / pan)</h3>
    <div><input id="snName" placeholder="Nome do snapshot"><button id="snSave">Salvar snapshot</button></div><div id="snList"></div></div></div>`;
  const L = $('#scList'), q = [];
  for (let i = 0; i < 100; i++) {
    const a = `/-show/showfile/scene/${p3(i)}/name`; q.push(a);
    const r = document.createElement('div'); r.className = 'sr';
    r.innerHTML = `<span class="i">${p2(i)}</span><span class="n" id="sn${i}">${state[a] || '—'}</span><button class="g">Carregar</button><button>Salvar</button>`;
    const [bl, bs] = r.querySelectorAll('button');
    bl.onclick = () => { if (confirm('Carregar a cena ' + i + ' na mesa? Isso altera a mixagem atual.')) x32.set('/-action/goscene', 'i', i); };
    bs.onclick = () => { const nm = $('#scName').value.trim() || 'Cena ' + i; if (confirm('Salvar na posição ' + i + ' como "' + nm + '"? (sobrescreve)')) { x32.setm('/save', [{ t: 's', v: 'scene' }, { t: 'i', v: i }, { t: 's', v: nm }, { t: 's', v: 'Salvo pelo X32 Mixer Control' }]); setTimeout(() => x32.query([a]), 500); } };
    L.appendChild(r);
  }
  x32.query(q); drawSnaps();
  $('#snSave').onclick = () => {
    const vals = []; allStrips().forEach(s => { [[s.fader, 'f'], [s.pan, 'f'], [s.on, 'i']].forEach(([a, t]) => { if (a && a in state) vals.push([a, t, state[a]]); }); });
    if (!vals.length) return alert('Conecte à mesa primeiro para ler os valores.');
    const l = snaps(); l.push({ name: $('#snName').value.trim() || 'Snapshot ' + (l.length + 1), date: new Date().toLocaleString('pt-BR'), vals });
    localStorage.setItem('snaps', JSON.stringify(l)); drawSnaps();
  };
}
function drawSnaps() {
  const L = $('#snList'); L.innerHTML = ''; snaps().forEach((sn, i) => {
    const r = document.createElement('div'); r.className = 'sr';
    r.innerHTML = `<span class="n">${sn.name} <small>${sn.date}</small></span><button class="g">Recuperar</button><button>Apagar</button>`;
    const [a, d] = r.querySelectorAll('button');
    a.onclick = () => { if (confirm('Recuperar "' + sn.name + '"?')) { sn.vals.forEach(v => state[v[0]] = v[2]); x32.batch(sn.vals); } };
    d.onclick = () => { if (confirm('Apagar "' + sn.name + '"?')) { const l = snaps(); l.splice(i, 1); localStorage.setItem('snaps', JSON.stringify(l)); drawSnaps(); } };
    L.appendChild(r);
  });
}

// ---------- roteamento ----------
const FX8 = ['1L', '1R', '2L', '2R', '3L', '3R', '4L', '4R'];
const SRC_OUT = ['OFF', 'Main L', 'Main R', 'M/C', ...range(16, i => 'MixBus ' + p2(i)), ...range(6, i => 'Matrix ' + i), ...range(32, i => 'Direct Ch ' + p2(i)), ...range(8, i => 'Direct Aux ' + i), ...FX8.map(x => 'Direct FX ' + x), 'Monitor L', 'Monitor R', 'Talkback'];
const SRC_IN = ['OFF', ...range(32, i => 'In' + p2(i)), ...range(6, i => 'Aux' + i), 'USB L', 'USB R', ...FX8.map(x => 'Fx' + x), ...range(16, i => 'Bus' + p2(i))];
const TAP = ['IN/LC', 'IN/LC+M', 'Pre EQ (<-EQ)', '<-EQ+M', 'Post EQ (EQ->)', 'EQ->+M', 'Pre Fader (PRE)', 'PRE+M', 'Post Fader (POST)'];
const BLK = ['Local In 1-8', 'Local In 9-16', 'Local In 17-24', 'Local In 25-32', ...['A', 'B'].flatMap(x => ['1-8', '9-16', '17-24', '25-32', '33-40', '41-48'].map(n => 'AES50 ' + x + ' ' + n))];
let rtSub = 0;
function buildRouting(sub) {
  if (sub !== undefined) rtSub = sub;
  setPage('Routing'); reg = {}; pending = []; eqInfo = null; dynInfos = []; rtaStop();
  const box = $('#page'); box.innerHTML = '';
  const rt = document.createElement('div'); rt.className = 'rt', bar = document.createElement('div'); bar.className = 'dh';
  ['Preamps (XLR locais)', 'Home (blocos)', 'Entradas (canais)', 'Saídas'].forEach((n, i) => { const b = document.createElement('button'); b.textContent = n; b.className = i === rtSub ? 'on' : ''; b.onclick = () => buildRouting(i); bar.appendChild(b); });
  const g = document.createElement('div'); g.className = 'grid2';
  const head = t => { const h = document.createElement('h3'); h.textContent = t; h.style.gridColumn = '1/-1'; g.appendChild(h); };
  const sel = (l, a, o, cf) => { const r = row(l, a, { t: 'e', opts: o }); if (cf) { const s = r.querySelector('select'); s.onchange = () => { if (!confirm(cf)) { s.value = state[a] ?? 0; return; } state[a] = +s.value; x32.set(a, 'i', +s.value); }; } g.appendChild(r); };
  const card = (t, k, i, full) => {
    const d = document.createElement('div'); d.className = 'band'; d.innerHTML = `<h4>${t}</h4>`; const b = `/outputs/${k}/${p2(i)}`;
    d.appendChild(row('Fonte', b + '/src', { t: 'e', opts: SRC_OUT }));
    if (full) { d.appendChild(row('Tap', b + '/pos', { t: 'e', opts: TAP })); d.appendChild(row('Inverter fase', b + '/invert', { t: 'b' })); d.appendChild(row('Delay', b + '/delay/on', { t: 'b' })); d.appendChild(row('Tempo', b + '/delay/time', { t: 'f', fmt: lin(0.3, 500, ' ms') })); }
    g.appendChild(d);
  };
  if (rtSub === 0) {
    head('Ganho e +48V dos pré-amps locais (índices 000-031 do headamp; vale o patch da página Home da mesa)');
    for (let i = 0; i < 32; i++) {
      const a = `/headamp/${p3(i)}/phantom`, r = row('In ' + (i + 1), `/headamp/${p3(i)}/gain`, { t: 'f', fmt: lin(-12, 60, ' dB') }, a);
      const c = r.querySelector('input[type=checkbox]'), t = document.createElement('span'); t.textContent = '48V'; t.className = 'v'; t.style.width = '28px';
      c.onchange = () => { if (c.checked && !confirm('Ligar +48V na entrada ' + (i + 1) + '? Pode danificar microfones de fita e fontes não balanceadas.')) { c.checked = false; return; } state[a] = +c.checked; x32.set(a, 'i', +c.checked); };
      r.appendChild(t); g.appendChild(r);
    }
  } else if (rtSub === 1) {
    head('Fonte dos blocos de entrada (página Home): define de onde vêm os canais 1-32');
    ['1-8', '9-16', '17-24', '25-32'].forEach(n => sel('Inputs ' + n, `/config/routing/IN/${n}`, BLK, 'Trocar a origem do bloco Inputs ' + n + '? Isso muda os sinais que entram nesses canais.'));
  } else if (rtSub === 2) {
    head('Fonte de cada canal de entrada'); range(32, i => sel('Ch ' + i, `/ch/${p2(i)}/config/insrc`, SRC_IN));
    head('Fonte dos canais Aux In'); range(8, i => sel('AuxIn ' + i, `/auxin/${p2(i)}/config/insrc`, SRC_IN));
  } else {
    head('Saídas XLR (Out 1-16)'); range(16, i => card('Out ' + i, 'main', i, true));
    head('Saídas Aux (1-6)'); range(6, i => card('Aux ' + i, 'aux', i, true));
    head('Ultranet P16 (1-16)'); range(16, i => card('P16 ' + i, 'p16', i, true));
    head('AES/EBU (1-2)'); range(2, i => card('AES ' + i, 'aes', i, false));
    head('Gravação USB (Rec 1-2)'); range(2, i => card('Rec ' + i, 'rec', i, false));
  }
  rt.append(bar, g); box.appendChild(rt); x32.query(pending.slice());
}

// ---------- efeitos (FX 1-8) ----------
const FXT = ['HALL', 'AMBI', 'RPLT', 'ROOM', 'CHAM', 'PLAT', 'VREV', 'VRM', 'GATE', 'RVRS', 'DLY', '3TAP', '4TAP', 'CRS', 'FLNG', 'PHAS', 'DIMC', 'FILT', 'ROTA', 'PAN', 'SUB', 'D/RV', 'CR/R', 'FL/R', 'D/CR', 'D/FL', 'MODD', 'GEQ2', 'GEQ', 'TEQ2', 'TEQ', 'DES2', 'DES', 'P1A', 'P1A2', 'PQ5', 'PQ5S', 'WAVD', 'LIM', 'CMB', 'CMB2', 'FAC', 'FAC1M', 'FAC2', 'LEC', 'LEC2', 'ULC', 'ULC2', 'ENH2', 'ENH', 'EXC', 'EXC2', 'IMG', 'EDI', 'SON', 'AMP2', 'AMP', 'DRV', 'DRV2', 'PIT2', 'PIT'];
let fxSel = 1;
function special(name) {
  setPage(name); reg = {}; pending = []; eqInfo = null; dynInfos = []; rtaStop();
  $('#strips').hidden = true; const box = $('#page'); box.hidden = false; box.innerHTML = '';
  const rt = document.createElement('div'); rt.className = 'rt'; box.appendChild(rt); return rt;
}
const fxl = () => JSON.parse(localStorage.getItem('fxlabels') || '{}');
const fxFmt = d => !d || !isFinite(d.min) || !isFinite(d.max) ? (f => Math.round(f * 100) + '%') : (f => {
  const v = d.log && d.min > 0 ? d.min * Math.pow(d.max / d.min, f) : d.min + f * (d.max - d.min);
  return v.toFixed(Math.abs(v) < 10 ? 2 : Math.abs(v) < 100 ? 1 : 0) + (d.u ? ' ' + d.u : '');
});
function fxRow(b, i) {
  const a = `${b}/par/${p2(i)}`, r = document.createElement('div'); r.className = 'row'; r.style.display = 'none';
  const l = document.createElement('label'); l.style.cssText = 'cursor:pointer;width:130px'; l.title = 'Clique para nomear. Formato: Nome|mín|máx|unidade|log (ex.: Pre Delay|0|200|ms)';
  const s = document.createElement('input'); s.type = 'range'; s.min = 0; s.max = 1; s.step = 0.001; s.value = 0;
  const v = document.createElement('span'); v.className = 'v'; r.append(l, s, v);
  const key = () => `${state[b + '/type']}:${i}`, def = () => fxl()[key()];
  const paint = () => { const d = def(); l.textContent = (d && d.name) || 'Par ' + p2(i); v.textContent = fxFmt(d)(+s.value); };
  s.oninput = () => { state[a] = +s.value; throttle(a, 'f', +s.value); paint(); };
  addReg(a, val => { r.style.display = ''; if (document.activeElement !== s) s.value = val; paint(); });
  l.onclick = () => {
    const d = def(), t = document.createElement('input'); t.className = 'tx'; t.style.width = '130px';
    t.value = d ? [d.name, isFinite(d.min) ? d.min : '', isFinite(d.max) ? d.max : '', d.u || '', d.log ? 'log' : ''].join('|').replace(/\|+$/, '') : '';
    r.replaceChild(t, l); t.focus();
    const done = () => {
      const p = t.value.split('|').map(x => x.trim()), all = fxl();
      if (!p[0]) delete all[key()]; else all[key()] = { name: p[0], min: parseFloat(p[1]), max: parseFloat(p[2]), u: p[3] || '', log: p[4] === 'log' };
      localStorage.setItem('fxlabels', JSON.stringify(all)); if (t.parentNode) r.replaceChild(l, t); paint();
    };
    t.onblur = done; t.onkeydown = e => { if (e.key === 'Enter') t.blur(); };
  };
  if (a in state) { r.style.display = ''; s.value = state[a]; } paint(); pending.push(a);
  return { a, r, paint };
}
function buildFx(n) {
  if (n) fxSel = n; const rt = special(fxSel <= 4 ? 'FX1 - 4' : 'FX5 - 8'), b = `/fx/${fxSel}`;
  const bar = document.createElement('div'); bar.className = 'dh'; bar.style.border = '0';
  for (let i = 1; i <= 8; i++) { const x = document.createElement('button'); x.textContent = 'FX ' + i; x.className = i === fxSel ? 'on' : ''; x.onclick = () => buildFx(i); bar.appendChild(x); }
  const info = document.createElement('p'); info.style.color = '#8b93a1';
  info.textContent = 'FX 1-4 podem ser efeitos de send (side chain) ou insert; FX 5-8 só funcionam como insert. Os retornos de FX 1-4 ficam na aba Aux / FX, com faders separados para L e R. Os parâmetros aparecem como 0-100% até você nomeá-los: clique em "Par 01" e digite Nome|mín|máx|unidade (ex.: Pre Delay|0|200|ms). Os nomes ficam salvos por tipo de efeito.';
  const g = document.createElement('div'); g.className = 'grid2';
  const tr = row('Tipo', b + '/type', { t: 'e', opts: FXT }), ts = tr.querySelector('select'); g.appendChild(tr);
  const rows = range(32, i => fxRow(b, i)); rows.forEach(x => g.appendChild(x.r));
  addReg(b + '/type', () => rows.forEach(x => x.paint()));
  ts.onchange = () => {
    state[b + '/type'] = +ts.value; x32.set(b + '/type', 'i', +ts.value);
    rows.forEach(x => { x.r.style.display = 'none'; delete state[x.a]; }); rows.forEach(x => x.paint());
    setTimeout(() => x32.query(rows.map(x => x.a)), 500);
  };
  const io = document.createElement('div'); io.style.cssText = 'margin-top:12px;display:flex;gap:8px;align-items:center';
  const ta = document.createElement('input'); ta.className = 'tx'; ta.placeholder = 'JSON dos nomes (exportar/importar)';
  const be = document.createElement('button'); be.textContent = 'Exportar nomes'; be.onclick = () => { ta.value = localStorage.getItem('fxlabels') || '{}'; ta.select(); navigator.clipboard && navigator.clipboard.writeText(ta.value).catch(() => {}); };
  const bi = document.createElement('button'); bi.textContent = 'Importar nomes'; bi.onclick = () => { try { const o = JSON.parse(ta.value); localStorage.setItem('fxlabels', JSON.stringify(Object.assign(fxl(), o))); rows.forEach(x => x.paint()); } catch (e) { alert('JSON inválido.'); } };
  io.append(ta, be, bi); rt.append(bar, info, g, io); x32.query(pending.slice());
}

// ---------- grupos de mute e DCA ----------
function buildGroups() {
  const rt = special('Mute Grp'), h = t => { const e = document.createElement('h3'); e.textContent = t; rt.appendChild(e); };
  h('Grupos de mute (aceso = canais do grupo mutados)');
  const mg = document.createElement('div'); mg.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap'; rt.appendChild(mg);
  for (let i = 1; i <= 6; i++) {
    const a = `/config/mute/${i}`, bt = document.createElement('button'); bt.className = 'mg'; bt.textContent = 'MUTE GRP ' + i; pending.push(a);
    bt.onclick = () => { const v = state[a] ? 0 : 1; state[a] = v; bt.classList.toggle('m', !!v); x32.set(a, 'i', v); };
    addReg(a, v => bt.classList.toggle('m', !!v)); if (a in state) bt.classList.toggle('m', !!state[a]); mg.appendChild(bt);
  }
  h('Nomes dos DCAs');
  const dn = document.createElement('div'); dn.className = 'grid2'; rt.appendChild(dn);
  for (let i = 1; i <= 8; i++) {
    const a = `/dca/${i}/config/name`, r = document.createElement('div'); r.className = 'row'; r.innerHTML = `<label>DCA ${i}</label>`;
    const inp = document.createElement('input'); inp.className = 'tx'; inp.maxLength = 12; inp.value = state[a] || '';
    inp.onchange = () => { state[a] = inp.value; x32.set(a, 's', inp.value); };
    addReg(a, v => { if (document.activeElement !== inp) inp.value = v; }); pending.push(a); r.appendChild(inp); dn.appendChild(r);
  }
  h('Atribuição de canais: DCA 1-8 e grupos de mute M1-M6');
  const gm = document.createElement('div'); gm.className = 'gm'; rt.appendChild(gm);
  const cell = (t, c) => { const d = document.createElement('div'); d.className = c || 'gc'; if (t instanceof Node) d.appendChild(t); else d.textContent = t; gm.appendChild(d); };
  cell('', 'gl'); for (let i = 1; i <= 8; i++) cell('D' + i, 'gc hd'); for (let i = 1; i <= 6; i++) cell('M' + i, 'gc hd m');
  const mk = (addr, bit) => {
    const c = document.createElement('input'); c.type = 'checkbox';
    c.onchange = () => { if (!(addr in state)) { c.checked = !c.checked; x32.query([addr]); return; } let v = state[addr] | 0; v = c.checked ? v | (1 << bit) : v & ~(1 << bit); state[addr] = v; x32.set(addr, 'i', v); };
    addReg(addr, v => c.checked = !!(v & (1 << bit))); if (addr in state) c.checked = !!(state[addr] & (1 << bit)); return c;
  };
  ['Ch 1-16', 'Ch 17-32', 'Aux / FX', 'Buses'].flatMap(k => LAYERS[k]).forEach(s => {
    const da = s.base + '/grp/dca', ma = s.base + '/grp/mute'; pending.push(da, ma);
    cell(s.label + (state[s.name] ? ' · ' + state[s.name] : ''), 'gl');
    for (let i = 0; i < 8; i++) cell(mk(da, i)); for (let i = 0; i < 6; i++) cell(mk(ma, i), 'gc m');
  });
  x32.query(pending.slice());
}

// ---------- monitor / solo / talkback ----------
function buildMonitor() {
  const rt = special('Monitor'), h = t => { const e = document.createElement('h3'); e.textContent = t; rt.appendChild(e); };
  const g = () => { const d = document.createElement('div'); d.className = 'grid2'; rt.appendChild(d); return d; };
  const pf = ['PFL', 'AFL'];
  h('Monitor e solo'); let d = g();
  [['Nível do monitor', '/config/solo/level', { t: 'f', fmt: lin(-90, 10, ' dB') }], ['Solo de canais', '/config/solo/chmode', { t: 'e', opts: pf }], ['Solo de buses', '/config/solo/busmode', { t: 'e', opts: pf }],
   ['Solo de DCAs', '/config/solo/dcamode', { t: 'e', opts: pf }], ['Solo exclusivo', '/config/solo/exclusive', { t: 'b' }], ['Dim', '/config/solo/dim', { t: 'b' }],
   ['Atenuação dim', '/config/solo/dimatt', { t: 'f', fmt: lin(-40, 0, ' dB') }], ['Monitor mono', '/config/solo/mono', { t: 'b' }]].forEach(r => d.appendChild(row(...r)));
  const cl = document.createElement('button'); cl.textContent = 'Limpar todos os solos'; cl.onclick = clearSolo; cl.style.marginTop = '8px'; rt.appendChild(cl);
  h('Talkback'); d = g();
  [['Fonte do mic', '/config/talk/source', { t: 'e', opts: ['INT', 'EXT'] }], ['Nível A', '/config/talk/A/level', { t: 'f', fmt: lin(-90, 10, ' dB') }], ['Dim A', '/config/talk/A/dim', { t: 'b' }],
   ['Nível B', '/config/talk/B/level', { t: 'f', fmt: lin(-90, 10, ' dB') }], ['Dim B', '/config/talk/B/dim', { t: 'b' }]].forEach(r => d.appendChild(row(...r)));
  const tb = document.createElement('div'); tb.style.cssText = 'display:flex;gap:10px;margin-top:10px'; rt.appendChild(tb);
  ['A', 'B'].forEach(k => { const t = document.createElement('button'); t.className = 'mg'; t.textContent = 'TALK ' + k + ' (segure)'; const a = `/-stat/talk/${k}`;
    const on = v => { t.classList.toggle('m', !!v); x32.set(a, 'i', v); }; t.onmousedown = () => on(1); t.onmouseup = t.onmouseleave = () => { if (t.classList.contains('m')) on(0); }; tb.appendChild(t); });
  const n = document.createElement('p'); n.style.color = '#8b93a1'; n.textContent = 'Os destinos do talkback (para quais buses ele vai) continuam sendo definidos na mesa.'; rt.appendChild(n);
  x32.query(pending.slice());
}
function clearSolo() {
  x32.set('/-action/clearsolo', 'i', 1); Object.keys(state).forEach(k => { if (k.startsWith('/-stat/solosw/')) state[k] = 0; }); els.forEach(refresh);
}

// ---------- links estéreo ----------
function buildLinks() {
  const rt = special('Links');
  const sets = [['Canais', 'chlink', 16], ['Aux In', 'auxlink', 4], ['Buses', 'buslink', 8], ['Matrix', 'mtxlink', 3]];
  const n = document.createElement('p'); n.style.color = '#8b93a1'; n.textContent = 'Ligar um par faz os dois canais funcionarem como estéreo. O que é copiado entre eles depende da configuração de link da mesa.'; rt.appendChild(n);
  sets.forEach(([t, k, c]) => {
    const h = document.createElement('h3'); h.textContent = t; rt.appendChild(h);
    const d = document.createElement('div'); d.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap'; rt.appendChild(d);
    for (let i = 0; i < c; i++) {
      const x = i * 2 + 1, a = `/config/${k}/${x}-${x + 1}`, b = document.createElement('button'); b.className = 'mg'; b.style.padding = '8px 14px'; b.textContent = x + '-' + (x + 1); pending.push(a);
      b.onclick = () => { const v = state[a] ? 0 : 1; state[a] = v; b.classList.toggle('m', !!v); x32.set(a, 'i', v); };
      addReg(a, v => b.classList.toggle('m', !!v)); if (a in state) b.classList.toggle('m', !!state[a]); d.appendChild(b);
    }
  });
  x32.query(pending.slice());
}

function dynGfx(w, b, type) {
  const cv = document.createElement('canvas'); cv.className = 'dynv'; cv.width = 380; cv.height = 320; w.appendChild(cv);
  dynInfos.push({ cv, b, type }); setTimeout(dynDraw, 0);
}
function dynDraw() {
  dynInfos.forEach(({ cv, b, type }) => {
    const c = cv.getContext('2d'), W = cv.width, H = cv.height, st = state, p = b + '/' + type, gate = type === 'gate', lo = gate ? -80 : -60;
    const X = db => 34 + (db - lo) / -lo * (W - 48), Y = db => H - 28 - (db - lo) / -lo * (H - 44), on = st[p + '/on'] === 1;
    c.clearRect(0, 0, W, H); c.font = '13px sans-serif'; c.lineWidth = 1;
    for (let d = lo; d <= 0; d += 10) { c.strokeStyle = d === 0 ? '#4d535e' : '#2a2e36'; c.beginPath(); c.moveTo(X(d), Y(0)); c.lineTo(X(d), Y(lo)); c.moveTo(X(lo), Y(d)); c.lineTo(X(0), Y(d)); c.stroke(); c.fillStyle = '#9aa3b2'; c.fillText(d, X(d) - 8, H - 10); c.fillText(d, 2, Y(d) + 4); }
    c.setLineDash([5, 5]); c.strokeStyle = '#555'; c.beginPath(); c.moveTo(X(lo), Y(lo)); c.lineTo(X(0), Y(0)); c.stroke(); c.setLineDash([]);
    const t = st[p + '/thr']; if (t === undefined) { c.fillStyle = '#9aa3b2'; c.fillText('Aguardando valores da mesa...', 60, H / 2); return; }
    const thr = gate ? t * 80 - 80 : t * 60 - 60, R = gate ? 0 : (RATIOS[st[p + '/ratio'] | 0] || 1), mk = gate ? 0 : (st[p + '/mgain'] ?? 0) * 24, rg = gate ? 3 + (st[p + '/range'] ?? 1) * 57 : 0;
    const out = inn => gate ? (inn >= thr ? inn : Math.max(inn - rg, lo)) : (inn < thr ? inn : thr + (inn - thr) / R) + mk;
    c.strokeStyle = '#ffd40088'; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(X(thr), Y(0)); c.lineTo(X(thr), Y(lo)); c.stroke(); c.setLineDash([]);
    c.strokeStyle = on ? '#35e0e0' : '#7a7a7a'; c.lineWidth = 3; c.beginPath();
    for (let d = lo; d <= 0; d += 1) { const o = Math.max(lo, Math.min(0, out(d))); d === lo ? c.moveTo(X(d), Y(o)) : c.lineTo(X(d), Y(o)); } c.stroke();
    c.fillStyle = '#fff'; c.font = 'bold 14px sans-serif';
    c.fillText(gate ? `Limiar ${thr.toFixed(1)} dB   Range ${rg.toFixed(0)} dB` : `Limiar ${thr.toFixed(1)} dB   ${R}:1   Makeup +${mk.toFixed(1)} dB`, 40, 18);
    if (!on) { c.fillStyle = '#ff9a9a'; c.fillText('desligado', W - 90, 18); }
  });
}

// ---------- páginas do canal selecionado (Channel, Config, Gate, Dyn, EQ, Sends) ----------
function selPage(tab, secs) {
  const rt = special(tab), s = selS, k = s && KINDS[s.kind];
  const hd = document.createElement('div'); hd.className = 'hh'; hd.textContent = s ? `${lblFmt(s.label)}  ·  ${state[s.name] || s.defName}` : 'Nenhum canal selecionado';
  rt.appendChild(hd);
  const list = k ? (secs || k.sec).filter(n => k.sec.includes(n)) : [];
  if (!list.length) { const p = document.createElement('p'); p.style.color = '#9a9a9a'; p.textContent = k ? 'Este canal não tem esta seção.' : 'Clique no nome ou no rótulo de um canal, aux, FX, bus ou matrix para selecioná-lo.'; rt.appendChild(p); return; }
  const g = document.createElement('div'); g.className = 'hgrid';
  list.forEach(n => { const p = document.createElement('div'); p.className = 'hp' + (n === 'EQ' ? ' eqp' : ''); p.innerHTML = `<h4>${n}</h4>`; p.appendChild(section(n, s)); g.appendChild(p); });
  rt.appendChild(g); x32.query(pending.slice());
}
function buildHome() { selPage('Channel'); }
const TABS = [['Mixer', '▦'], ['Channel', '⇅'], ['Config', '⚙'], ['Gate', '⌐'], ['Dyn', '◢'], ['EQ', '∿'], ['Sends', '⇶'], ['Main', 'LR'], ['FX1 - 4', '∿'], ['FX5 - 8', '{fx}']];
function showTab(n) {
  if (n === 'Mixer') { if (USER_BANKS.includes(cur)) build(cur); setPage('Mixer'); reg = {}; eqInfo = null; dynInfos = []; rtaStop(); $('#page').hidden = true; $('#strips').hidden = false; els.forEach(refresh); return; }
  if (n === 'Channel') return selPage('Channel');
  if (n === 'Config') return selPage('Config', ['Config', 'Preamp']);
  if (['Gate', 'Dyn', 'EQ', 'Sends'].includes(n)) return selPage(n, [n]);
  if (n === 'Main') { select(MAINLR); return selPage('Main'); }
  if (n === 'FX1 - 4') return buildFx(1);
  if (n === 'FX5 - 8') return buildFx(5);
}
const PAGEFN = { Routing: () => buildRouting(), Library: () => buildScenes(), 'Mute Grp': () => buildGroups(), Monitor: () => buildMonitor(), Links: () => buildLinks(), Bancos: () => buildBanks() };
function rebuildPage() { if (TABS.some(t => t[0] === curPage)) showTab(curPage); else if (PAGEFN[curPage]) PAGEFN[curPage](); }

// ---------- painel direito ----------
let mgBtns = [];
const paintMg = () => mgBtns.forEach((b, i) => b.classList.toggle('m', !!state['/config/mute/' + (i + 1)]));
function applySof() {
  const q = [];
  els.forEach(e => { e.fa = faAddr(e.s); e.oa = oaAddr(e.s); const sf = !!(sofBus && SOFK.includes(e.s.kind)); e.d.classList.toggle('sof', sf); if (sf) q.push(e.fa, e.oa); refresh(e); });
  if (q.length) x32.query(q);
}
function setSof(n) { sofBus = n; document.querySelectorAll('.bb.bus').forEach(b => b.classList.toggle('on', +b.dataset.n === n)); applySof(); }
function buildRight() {
  const r = $('#rctl'), el = (t, c, h) => { const d = document.createElement(t); if (c) d.className = c; if (h !== undefined) d.innerHTML = h; return d; };
  const ib = el('div', 'ibtns');
  [['⚙', 'Setup', () => buildLinks()], ['⇅', 'Routing', () => buildRouting()], ['▤', 'Library', () => buildScenes()], ['◉', 'Assign', () => buildGroups()], ['♫', 'Monitor', () => buildMonitor()]]
    .forEach(([i, t, f]) => { const b = el('button', '', `<b>${i}</b>${t}`); b.onclick = f; ib.appendChild(b); });
  r.appendChild(ib); r.appendChild(el('div', 'rsec', 'Select'));
  const r1 = el('div', 'r3'); const cs = el('button', '', 'Clear Solo'); cs.onclick = clearSolo; r1.appendChild(cs);
  ['A', 'B'].forEach(k => { const t = el('button', '', k); const a = `/-stat/talk/${k}`; t.title = 'Talkback ' + k + ' (segure)'; const on = v => { t.classList.toggle('m', !!v); x32.set(a, 'i', v); }; t.onmousedown = () => on(1); t.onmouseup = t.onmouseleave = () => { if (t.classList.contains('m')) on(0); }; r1.appendChild(t); });
  r.appendChild(r1);
  const r2 = el('div', 'rbtn2');
  const bl = el('button', '', 'Main LR'); bl.onclick = () => select(MAINLR); const bm = el('button', '', 'M/C'); bm.onclick = () => select(MONO); r2.append(bl, bm); r.appendChild(r2);
  const r4 = el('div', 'rbtn2');
  for (let n = 1; n <= 16; n++) { const b = el('button', 'bb bus', `MixBus<br>${n}`); b.dataset.n = n; b.title = 'Sends no fader: MixBus ' + n; b.onclick = () => { select(LAYERS['Buses'][n - 1]); setSof(sofBus === n ? null : n); }; r4.appendChild(b); }
  r.appendChild(r4);
  const r5 = el('div', 'rbtn2'); for (let n = 1; n <= 4; n++) { const b = el('button', 'bb fx', 'Fx ' + n); b.onclick = () => buildFx(n); r5.appendChild(b); } r.appendChild(r5);
  r.appendChild(el('div', 'rsec', 'Mute Groups'));
  const mg = el('div', 'mgrp'); mgBtns = []; for (let n = 1; n <= 6; n++) { const b = el('button', '', String(n)); b.onclick = () => { const a = '/config/mute/' + n, v = state[a] ? 0 : 1; state[a] = v; x32.set(a, 'i', v); paintMg(); }; mgBtns.push(b); mg.appendChild(b); } r.appendChild(mg);
}

// ---------- editor de bancos do usuário ----------
let ubSel = 'User 1';
function buildBanks(n) {
  if (n) ubSel = n; const rt = special('Bancos');
  const bar = document.createElement('div'); bar.className = 'dh';
  USER_BANKS.forEach(b => { const x = document.createElement('button'); x.textContent = b; x.className = b === ubSel ? 'on' : ''; x.onclick = () => buildBanks(b); bar.appendChild(x); });
  const all = ubLoad(), cur = all[ubSel] || [];
  const save = l => { all[ubSel] = l; localStorage.setItem('userBanks', JSON.stringify(all)); buildBanks(); };
  const open = document.createElement('button'); open.textContent = 'Abrir este banco no Mixer'; open.onclick = () => { build(ubSel); showTab('Mixer'); };
  const clr = document.createElement('button'); clr.textContent = 'Limpar banco'; clr.onclick = () => save([]);
  bar.append(open, clr); rt.appendChild(bar);
  const info = document.createElement('p'); info.style.color = '#9a9a9a'; info.textContent = 'Clique nos canais para incluir ou tirar deste banco. A ordem dos faders é a ordem em que você clicou (o número mostra a posição).'; rt.appendChild(info);
  [['Canais 1-32', [...LAYERS['Ch 1-16'], ...LAYERS['Ch 17-32']]], ['Aux In e retornos de FX', LAYERS['Aux / FX']], ['Buses', LAYERS['Buses']], ['Matrix, Mono e DCAs', [...LAYERS['Main / Mtx'].filter(s => s !== MAINLR), ...LAYERS['DCA']]]].forEach(([t, list]) => {
    const h = document.createElement('h3'); h.textContent = t; rt.appendChild(h);
    const g = document.createElement('div'); g.className = 'chips'; rt.appendChild(g);
    list.forEach(s => {
      const pos = cur.indexOf(s.base), b = document.createElement('button'); b.className = 'chip' + (pos >= 0 ? ' on' : '');
      b.innerHTML = (pos >= 0 ? `<b>${pos + 1}</b>` : '') + lblFmt(s.label) + (state[s.name] ? ' · ' + state[s.name] : '');
      b.onclick = () => save(pos >= 0 ? cur.filter(x => x !== s.base) : [...cur, s.base]); g.appendChild(b);
    });
  });
}
function updPinBtn() { const b = $('#btnPin'); b.textContent = pinS ? '📌 Soltar' : '📌 Fixar'; b.classList.toggle('on', !!pinS); b.title = pinS ? 'Soltar ' + lblFmt(pinS.label) : 'Fixa o canal selecionado ao lado do Main, sempre visível'; }

// ---------- eventos ----------
x32.onOsc((a, v) => {
  if (!v.length) return; state[a] = v[0];
  if (reg[a]) reg[a].forEach(f => f(v[0]));
  if (eqInfo && a.startsWith(eqInfo.b + '/eq')) eqDraw();
  if (dynInfos.length && dynInfos.some(d => a.startsWith(d.b + '/'))) dynDraw();
  if (curPage === 'Library' && a.startsWith('/-show/showfile/scene/')) { const el = document.getElementById('sn' + parseInt(a.split('/')[4], 10)); if (el) el.textContent = v[0] || '—'; }
  if (a.startsWith('/config/mute/')) paintMg();
  if (/\/(eq|dyn|gate)\//.test(a)) els.forEach(e => { if (a.startsWith(e.s.base + '/')) miniDirty(e); });
  els.forEach(e => { const s = e.s; if (a === e.fa || a === e.oa || [s.pan, s.name, s.color].includes(a) || a === e.sa) refresh(e); });
  if (a === '/main/st/mix/fader' || a === '/main/st/mix/on') { /* strip Main já coberto acima */ }
});
x32.onMeters(m => els.forEach(e => {
  if (e.s.meter < 0) return;
  const v = m[e.s.meter] || 0, db = v > 0 ? 20 * Math.log10(v) : -90;
  e.mt.style.height = Math.max(0, Math.min(100, (db + 60) / 60 * 100)) + '%';
}));
x32.onRta(arr => { if (rtaOn) { rtaData = arr; if (eqInfo) eqDraw(); } });
x32.onStatus(s => $('#status').textContent = s);
x32.onConn((s, ip) => {
  const demo = ip === 'demo', c = $('#conn');
  c.className = 'c-' + (demo && s === 'ok' ? 'demo' : s);
  c.title = { ok: 'Conectado', connecting: 'Conectando...', lost: 'Conexão perdida', off: 'Desconectado' }[s] || '';
  $('#connbar').hidden = s !== 'lost'; $('#app').classList.toggle('lost', s === 'lost');
  if (s === 'connecting') $('#status').textContent = 'Procurando a mesa em ' + ip + '...';
  if (s === 'lost') $('#status').textContent = 'Conexão perdida com ' + ip + '. Tentando reconectar...';
  if (s === 'ok') { $('#status').textContent = demo ? 'Modo demo: mesa simulada' : 'Conectado a ' + ip; setTimeout(queryAll, 300); setTimeout(rebuildPage, 1800); }
});
x32.onUpdateReady(() => $('#btnInst').hidden = false);

[...Object.keys(FIXED), ...USER_BANKS].forEach(n => { const b = document.createElement('button'); b.textContent = n; b.dataset.n = n; b.onclick = () => build(n); $('#banks').appendChild(b); });
TABS.forEach(([n, ic]) => { const b = document.createElement('button'); b.dataset.n = n; b.innerHTML = `<i>${ic}</i>${n}`; b.onclick = () => showTab(n); $('#tabs').appendChild(b); });
$('#ip').value = localStorage.getItem('ip') || '';
const doConnect = ip => { if (!ip) return; $('#ip').value = ip; localStorage.setItem('ip', ip); x32.connect(ip); };
$('#btnConn').onclick = () => doConnect($('#ip').value.trim());
$('#btnFind').onclick = async () => {
  const btn = $('#btnFind'), sel = $('#found'); btn.disabled = true; sel.hidden = true; $('#status').textContent = 'Procurando mesa na rede...';
  const list = await x32.discover(); btn.disabled = false;
  if (!list.length) { $('#status').textContent = 'Nenhuma mesa encontrada. Confira o cabo/Wi-Fi, o firewall e se o PC está na mesma rede.'; return; }
  if (list.length === 1) { $('#status').textContent = `Encontrada: ${list[0].name || list[0].model} (${list[0].ip})`; doConnect(list[0].ip); return; }
  $('#status').textContent = list.length + ' mesas encontradas. Escolha:'; sel.innerHTML = '<option value="">Escolher...</option>';
  list.forEach(m => sel.add(new Option(`${m.name || m.model} (${m.ip})`, m.ip))); sel.hidden = false; sel.onchange = () => { if (sel.value) { doConnect(sel.value); sel.hidden = true; } };
};
$('#btnDemo').onclick = () => x32.connect('demo');
$('#btnEditBanks').onclick = () => buildBanks();
$('#btnPin').onclick = () => { pinS = pinS ? null : selS; localStorage.setItem('pinBase', pinS ? pinS.base : ''); updPinBtn(); build(cur); };
$('#btnUpd').onclick = () => x32.checkUpdate();
$('#btnInst').onclick = () => x32.installUpdate();
x32.version().then(v => $('#ver').textContent = 'v' + v);
pinS = byBase[localStorage.getItem('pinBase')] || null; updPinBtn();
selS = LAYERS['Ch 1-16'][0]; $('#selbox').textContent = lblFmt(selS.label); build('1-32'); buildRight(); showTab('Mixer');
