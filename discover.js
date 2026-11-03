// Procura mesas X32/M32 na rede local (UDP 10023, comando /xinfo)
const dgram = require('dgram');
const os = require('os');
const al = n => (4 - (n % 4)) % 4;
function enc(addr) { const b = Buffer.from(addr + '\0'); return Buffer.concat([b, Buffer.alloc(al(b.length))]); }
function rs(buf, o) { const e = buf.indexOf(0, o); const s = buf.toString('utf8', o, e); let n = e + 1; n += al(n); return [s, n]; }
function parse(buf) {
  let [addr, o] = rs(buf, 0); const args = [];
  if (o >= buf.length) return { addr, args };
  let tags; [tags, o] = rs(buf, o);
  for (const t of tags.slice(1)) {
    if (t === 's') { let s; [s, o] = rs(buf, o); args.push(s); }
    else if (t === 'i' || t === 'f') { o += 4; args.push(null); } else break;
  }
  return { addr, args };
}
module.exports = function discover({ timeout = 2500, includeInternal = false, extra = [] } = {}) {
  return new Promise(resolve => {
    const found = new Map(); const sock = dgram.createSocket('udp4'); let done = false;
    const finish = () => { if (done) return; done = true; try { sock.close(); } catch (e) {} resolve([...found.values()]); };
    sock.on('error', finish);
    sock.on('message', (msg, r) => {
      let m; try { m = parse(msg); } catch (e) { return; }
      if (m.addr === '/xinfo') found.set(r.address, { ip: r.address, name: m.args[1] || '', model: m.args[2] || 'X32', version: m.args[3] || '' });
      else if (m.addr === '/info') found.set(r.address, { ip: r.address, name: '', model: m.args[2] || 'X32', version: m.args[3] || '' });
    });
    sock.bind(0, () => {
      try { sock.setBroadcast(true); } catch (e) {}
      const pkt = enc('/xinfo'), targets = new Set(['255.255.255.255', ...extra]);
      for (const list of Object.values(os.networkInterfaces())) for (const i of list || []) {
        if (i.family !== 'IPv4' || (i.internal && !includeInternal)) continue;
        const ip = i.address.split('.').map(Number), mask = i.netmask.split('.').map(Number);
        targets.add(ip.map((x, k) => (x & mask[k]) | (~mask[k] & 255)).join('.'));
        const bits = mask.reduce((s, x) => s + x.toString(2).replace(/0/g, '').length, 0);
        if (bits >= 22 && bits < 31) { // varre cada endereço da sub-rede (até 1022)
          const net = ip.map((x, k) => x & mask[k]), n = Math.pow(2, 32 - bits);
          const base = ((net[0] << 24) >>> 0) + (net[1] << 16) + (net[2] << 8) + net[3];
          for (let h = 1; h < n - 1; h++) { const v = base + h; targets.add([v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255].join('.')); }
        }
      }
      const list = [...targets]; let idx = 0;
      const send = () => { for (let k = 0; k < 50 && idx < list.length; k++, idx++) sock.send(pkt, 10023, list[idx], () => {}); if (idx < list.length) setTimeout(send, 10); };
      send(); setTimeout(finish, timeout);
    });
  });
};
