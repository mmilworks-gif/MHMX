// Mesa simulada para testar o app sem a mesa real (modo demo)
const p2 = n => String(n).padStart(2, '0');
const CH = ['Kick', 'Snare', 'HiHat', 'Tom 1', 'Tom 2', 'Over L', 'Over R', 'Baixo', 'Violão', 'Guitarra', 'Teclado L', 'Teclado R', 'Voz 1', 'Voz 2', 'Voz 3', 'Voz 4'];
const CHC = [1, 1, 1, 1, 1, 3, 3, 2, 5, 5, 6, 6, 4, 4, 4, 4];
const BUS = ['Wedge 1', 'Wedge 2', 'Wedge 3', 'Wedge 4', 'Side L', 'Side R'];
const DCA = ['Bateria', 'Cordas', 'Teclas', 'Vozes', '', '', '', ''];
const SCENES = ['Ensaio', 'Culto manhã', 'Culto noite', 'Show banda'];
const rnd = (a, b) => a + Math.random() * (b - a);

function def(addr) {
  let m;
  if ((m = addr.match(/^\/(ch|auxin|fxrtn|bus|mtx)\/(\d\d)\/(.*)$/))) {
    const k = m[1], i = +m[2], r = m[3];
    if (r === 'config/name') return k === 'ch' ? (CH[i - 1] || '') : k === 'bus' ? (BUS[i - 1] || '') : '';
    if (r === 'config/color') return k === 'ch' ? (CHC[i - 1] || 0) : k === 'bus' ? 4 : 0;
    if (r === 'config/icon') return k === 'ch' && i <= 16 ? 1 + i : 1;
    if (r === 'config/insrc') return k === 'ch' ? i : 0;
    if (r === 'mix/fader') return k === 'ch' ? (i <= 16 ? 0.55 + ((i * 7) % 5) * 0.06 : 0.4) : 0.6;
    if (r === 'mix/on') return 1;
    if (r === 'mix/pan') return k === 'ch' ? (i % 2 ? 0.35 : 0.65) : 0.5;
    if ((m = r.match(/^mix\/(\d\d)\/(level|on|pan)$/))) return m[2] === 'level' ? 0.2 + (((i + +m[1]) * 3) % 7) * 0.08 : m[2] === 'on' ? 1 : 0.5;
    if (r === 'preamp/trim') return 0.5; if (r === 'preamp/hpf') return 0.3;
    if (/^preamp\/(hpon|invert)$/.test(r) || /^delay\/on$/.test(r)) return 0; if (r === 'delay/time') return 0;
    if (r === 'eq/on') return 1;
    if ((m = r.match(/^eq\/(\d)\/(type|f|g|q)$/))) { const b = +m[1]; return m[2] === 'type' ? (b === 1 ? 1 : b === 6 ? 4 : 2) : m[2] === 'f' ? [0.18, 0.4, 0.58, 0.75, 0.88, 0.95][b - 1] : m[2] === 'g' ? 0.5 + (((i + b) % 5) - 2) * 0.05 : 0.5; }
    if (/^dyn\/on$/.test(r)) return i % 2; if (r === 'dyn/thr') return 0.6; if (r === 'dyn/ratio') return 5; if (r === 'dyn/mgain') return 0.1;
    if (r === 'dyn/attack') return 0.2; if (r === 'dyn/release') return 0.4; if (r === 'dyn/mix') return 1;
    if (r === 'gate/on') return 0; if (r === 'gate/thr') return 0.3; if (r === 'gate/range') return 0.5; if (/^gate\//.test(r)) return 0.3;
    if (/^grp\//.test(r)) return 0;
    return undefined;
  }
  if ((m = addr.match(/^\/main\/(st|m)\/(.*)$/))) { const r = m[2]; if (r === 'mix/fader') return 0.75; if (r === 'mix/on') return 1; if (r === 'mix/pan') return 0.5; if (r === 'eq/on') return 1; if (r === 'dyn/on') return 0; if (/^eq\/\d\/f$/.test(r)) return 0.5; if (/^eq\/\d\/(g|q)$/.test(r)) return 0.5; if (/^eq\/\d\/type$/.test(r)) return 2; return 0.5; }
  if ((m = addr.match(/^\/dca\/(\d)\/(.*)$/))) { const i = +m[1], r = m[2]; if (r === 'config/name') return DCA[i - 1]; if (r === 'config/color') return [1, 2, 5, 4, 0, 0, 0, 0][i - 1]; if (r === 'on') return 1; if (r === 'fader') return 0.75; return undefined; }
  if ((m = addr.match(/^\/headamp\/(\d+)\/(gain|phantom)$/))) return m[2] === 'gain' ? 0.35 + (+m[1] % 6) * 0.05 : 0;
  if ((m = addr.match(/^\/outputs\/(main|aux|p16|aes|rec)\/(\d\d)\/(src|pos|invert|delay\/on|delay\/time)$/))) { const i = +m[2]; if (m[3] === 'src') return m[1] === 'main' ? 3 + i : m[1] === 'aux' ? 1 + (i % 2) : m[1] === 'p16' ? 3 + i : 0; if (m[3] === 'pos') return 8; return 0; }
  if (/^\/config\/routing\/IN\//.test(addr)) return 0;
  if ((m = addr.match(/^\/fx\/(\d)\/(type|par\/(\d\d))$/))) { if (m[2] === 'type') return [0, 10, 13, 5, 28, 28, 31, 36][+m[1] - 1]; return +m[3] <= 12 ? 0.3 + ((+m[3] * 11) % 7) * 0.08 : undefined; }
  if ((m = addr.match(/^\/-show\/showfile\/scene\/(\d+)\/name$/))) return SCENES[+m[1]] || '';
  if (/^\/config\/(mute\/\d|chlink|auxlink|buslink|mtxlink)/.test(addr)) return 0;
  if (/^\/config\/solo\//.test(addr)) return addr.endsWith('/level') ? 0.8 : 0;
  if (/^\/config\/talk\//.test(addr)) return 0;
  if (/^\/-stat\/solosw\//.test(addr)) return 0;
  return undefined;
}

module.exports = function makeDemo(emit, emitMeters, emitRta) {
  const P = new Map(); let timer = null, t = 0, rta = false;
  return {
    start() {
      timer = setInterval(() => {
        t += 0.1; const m = new Array(70).fill(0);
        for (let i = 0; i < 70; i++) {
          const act = i < 16 ? 1 : i < 32 ? 0.05 : i < 48 ? 0.25 : i < 54 ? 0.8 : 0.15;
          m[i] = Math.max(0, Math.min(1, act * (0.25 + 0.5 * Math.abs(Math.sin(t * (1.2 + (i % 7) * 0.35) + i))) * rnd(0.7, 1)));
        }
        emitMeters(m);
        if (rta && emitRta) emitRta(Array.from({ length: 100 }, (_, i) => -22 - i * 0.28 + 9 * Math.exp(-Math.pow((i - 22 - 6 * Math.sin(t)) / 5, 2)) + 7 * Math.exp(-Math.pow((i - 60) / 7, 2)) * Math.abs(Math.sin(t * 1.3)) + rnd(-2.5, 2.5)));
      }, 100);
    },
    stop() { if (timer) clearInterval(timer); timer = null; },
    send(addr, args) {
      if (addr === '/meters') { if (args[0] && args[0].v === '/meters/15') rta = true; return; }
      if (addr === '/xremote' || addr === '/info' || addr === '/xinfo' || addr === '/-action/goscene') return;
      if (addr === '/-action/clearsolo') { for (const k of [...P.keys()]) if (k.startsWith('/-stat/solosw/')) P.set(k, 0); return; }
      if (addr === '/save' && args.length >= 3) { P.set(`/-show/showfile/scene/${String(args[1].v).padStart(3, '0')}/name`, args[2].v); return; }
      if (args.length) { P.set(addr, args[0].v); return; }
      const v = P.has(addr) ? P.get(addr) : def(addr);
      if (v !== undefined) setTimeout(() => emit(addr, v), 2 + Math.random() * 10);
    }
  };
};
