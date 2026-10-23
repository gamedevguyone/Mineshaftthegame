const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const { WebSocketServer } = require('ws');
const { World, Sim } = require('./core.js');
const PORT = process.env.PORT || 3000;
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const ROOMS = path.join(DATA, 'rooms');
const CH = 80, MAXID = 45, WDMG = [3, 5, 8, 12];
try { fs.mkdirSync(ROOMS, { recursive: true }); } catch (e) { console.error('data dir:', e.message); }
process.on('uncaughtException', e => console.error('uncaught:', e));
process.on('unhandledRejection', e => console.error('unhandled:', e));

// ---------- rooms (public creative world + private rooms) ----------
const rooms = new Map();
const roomFile = code => code === 'PUBLIC' ? path.join(DATA, 'world.json') : path.join(ROOMS, code + '.json');
function getRoom(code, mode) {
  let r = rooms.get(code); if (r) { clearTimeout(r.gc); return r; }
  let d = null; try { d = JSON.parse(fs.readFileSync(roomFile(code), 'utf8')); } catch {}
  if (!d || !Number.isInteger(d.seed) || !d.edits) d = { seed: Math.floor(Math.random() * 1e9), edits: {}, mode: code === 'PUBLIC' ? 'creative' : (mode === 'survival' ? 'survival' : 'creative'), pstate: {}, owners: {} };
  r = { code, mode: d.mode === 'survival' ? 'survival' : 'creative', seed: d.seed, edits: d.edits, pstate: d.pstate || {}, owners: d.owners || {}, players: new Set(), dirty: true, world: null, sim: null, tickN: 0, gc: null };
  if (r.mode === 'survival') initSim(r);
  rooms.set(code, r); return r;
}
function saveRoom(r) {
  try { const f = roomFile(r.code); fs.writeFileSync(f + '.tmp', JSON.stringify({ seed: r.seed, mode: r.mode, edits: r.edits, pstate: r.pstate, owners: r.owners })); fs.renameSync(f + '.tmp', f); r.dirty = false; return true; }
  catch (e) { console.error('save:', e.message); return false; }
}
setInterval(() => { for (const r of rooms.values()) if (r.dirty) saveRoom(r); }, 5000);
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { for (const r of rooms.values()) saveRoom(r); process.exit(0); });
const send = (ws, o) => { try { if (ws.readyState === 1) ws.send(JSON.stringify(o)); } catch {} };
const bc = (r, o, except) => { const s = JSON.stringify(o); for (const p of r.players) { if (p.ws === except || p.ws.readyState !== 1) continue; try { p.ws.send(s); } catch {} } };
const rplayer = (r, id) => { for (const p of r.players) if (p.id === id && p.name) return p; return null; };
function setEdit(r, x, y, z, id) { const k = (x >> 4) + ',' + (z >> 4); (r.edits[k] ||= {})[x + ',' + y + ',' + z] = id; r.dirty = true; }
function initSim(r) {
  const w = new World(r.seed);
  w.onGen = c => { const e = r.edits[c.cx + ',' + c.cz]; if (e) for (const k in e) { const [x, y, z] = k.split(',').map(Number); w.set(x, y, z, e[k]); } };
  r.world = w;
  r.sim = new Sim(w, {
    hurtPlayer: (pid, dmg, src) => { const p = rplayer(r, pid); if (p) hurt(r, p, Math.max(1, Math.round(dmg * (1 - .2 * p.armor))), null, src); },
    reward: (pid, rw) => { const p = rplayer(r, pid); if (p) send(p.ws, { t: 'rw', c: rw.coins || 0, m: rw.meat || 0 }); },
    setBlock: (x, y, z, id) => { setEdit(r, x, y, z, id); w.set(x, y, z, id); bc(r, { t: 'set', x, y, z, id }); },
    camp: (id, o) => { r.owners[id] = o; r.dirty = true; bc(r, { t: 'camp', id, o }); },
    income: c => bc(r, { t: 'rw', c, m: 0, inc: 1 }),
    msg: s => bc(r, { t: 'msg', s }),
  });
  r.sim.owners = r.owners;
}
function hurt(r, p, dmg, by, src) {
  p.hp -= dmg; p.lastDmg = Date.now();
  if (p.hp <= 0) {
    p.hp = 20; bc(r, { t: 'dead', id: p.id, by: by ? by.id : 0, name: p.name, byName: by ? by.name : (src || 'gravity') });
    send(p.ws, { t: 'respawn' }); if (by) send(by.ws, { t: 'kill' });
  }
  bc(r, { t: 'hp', id: p.id, hp: p.hp });
}
// simulation tick (survival rooms): 10 Hz sim, 5 Hz snapshots
setInterval(() => {
  for (const r of rooms.values()) {
    if (!r.sim || !r.players.size) continue;
    try {
      const pl = []; for (const p of r.players) if (p.name) pl.push({ id: p.id, x: p.x, y: p.y, z: p.z });
      let budget = 3; for (const p of pl) { const pcx = Math.floor(p.x) >> 4, pcz = Math.floor(p.z) >> 4; for (let dx = -3; dx <= 3 && budget > 0; dx++) for (let dz = -3; dz <= 3 && budget > 0; dz++) if (dx * dx + dz * dz <= 10 && !r.world.chunks.has(((pcx + dx) & 0xffff) * 65536 + ((pcz + dz) & 0xffff))) { r.world.gen(pcx + dx, pcz + dz); budget--; } }
      r.sim.tick(.1, pl);
      if ((r.tickN++ & 1) === 0) for (const p of r.players) if (p.name) send(p.ws, { t: 'e', l: r.sim.snap(p.x, p.z) });
      if (r.tickN % 300 === 0) for (const [k, c] of r.world.chunks) if (!pl.some(p => Math.hypot(c.cx * 16 + 8 - p.x, c.cz * 16 + 8 - p.z) < 130)) r.world.chunks.delete(k);
    } catch (e) { console.error('sim:', e); }
  }
}, 100);
setInterval(() => { const now = Date.now(); for (const r of rooms.values()) for (const p of r.players) if (p.name && p.hp < 20 && now - p.lastDmg > 5000) { p.hp++; bc(r, { t: 'hp', id: p.id, hp: p.hp }); } }, 4000);

// ---------- static file (index.html, gzip cached) ----------
const PUB = path.join(__dirname, 'public'), cache = new Map();
function load(p) { let e = cache.get(p); if (e) return e; const buf = fs.readFileSync(p); e = { buf, gz: zlib.gzipSync(buf, { level: 9 }) }; cache.set(p, e); return e; }
const server = http.createServer((req, res) => {
  try {
    const f = path.join(PUB, 'index.html'), e = load(f), gz = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', ...(gz ? { 'Content-Encoding': 'gzip' } : {}) });
    res.end(gz ? e.gz : e.buf);
  } catch (e) { try { res.writeHead(500); res.end('Error'); } catch {} }
});
server.on('clientError', (e, s) => { try { s.end('HTTP/1.1 400 Bad Request\r\n\r\n'); } catch {} });

// ---------- sockets ----------
const wss = new WebSocketServer({ server, maxPayload: 8192, perMessageDeflate: false });
wss.on('error', e => console.error('wss:', e.message));
const all = new Set(); let nextId = 1;
setInterval(() => { for (const p of all) { const ws = p.ws; if (ws.isAlive === false) { try { ws.terminate(); } catch {} continue; } ws.isAlive = false; try { ws.ping(); } catch {} } }, 25000);
const cl = (v, a, b) => Math.min(b, Math.max(a, v | 0));

wss.on('connection', ws => {
  const me = { ws, id: nextId++, name: null, room: null, x: 0, y: 80, z: 0, ry: 0, n: 0, hp: 20, lastHit: 0, lastDmg: 0, lastPos: 0, lastFall: 0, lastHeal: 0, weapon: 0, armor: 0 };
  all.add(me); ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; }); ws.on('error', () => {});
  const tick = setInterval(() => { me.n = 0; }, 1000);
  ws.on('message', raw => {
    try {
      ws.isAlive = true; if (++me.n > 400) return;
      const m = JSON.parse(raw); if (!m || typeof m !== 'object') return;
      if (m.t === 'ping') return send(ws, { t: 'pong' });
      if (m.t === 'join') {
        if (me.name) return;
        let code = String(m.room || 'PUBLIC').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'PUBLIC';
        if (code !== 'PUBLIC' && code.length < 3) { send(ws, { t: 'err', s: 'Room code needs 3-12 letters or numbers' }); return; }
        me.name = String(m.name || '').replace(/[^\w .\-]/g, '').trim().slice(0, 16) || 'Player';
        const r = getRoom(code, m.mode); me.room = r; r.players.add(me);
        const saved = r.pstate[me.name] || null;
        send(ws, { t: 'init', id: me.id, seed: r.seed, hp: me.hp, mode: r.mode, room: code, camps: r.owners, saved, players: [...r.players].filter(p => p.name && p !== me).map(({ id, name, x, y, z, ry, hp }) => ({ id, name, x, y, z, ry, hp })) });
        bc(r, { t: 'join', id: me.id, name: me.name }, ws);
        return;
      }
      const r = me.room; if (!r) return;
      const now = Date.now();
      if (m.t === 'pos') {
        if (now - me.lastPos < 40 || ![m.x, m.y, m.z, m.ry].every(Number.isFinite) || Math.abs(m.x) > 1e6 || Math.abs(m.z) > 1e6) return;
        me.lastPos = now; me.x = m.x; me.y = m.y; me.z = m.z; me.ry = m.ry; bc(r, { t: 'pos', id: me.id, x: m.x, y: m.y, z: m.z, ry: m.ry }, ws);
      } else if (m.t === 'swing') bc(r, { t: 'swing', id: me.id }, ws);
      else if (m.t === 'hit') {
        if (r.mode === 'survival' || now - me.lastHit < 280) return; me.lastHit = now;
        const tp = rplayer(r, m.id); if (!tp || tp === me || Math.hypot(tp.x - me.x, tp.y - me.y, tp.z - me.z) > 6.5) return;
        const dx = tp.x - me.x, dz = tp.z - me.z, l = Math.hypot(dx, dz) || 1;
        send(tp.ws, { t: 'kb', x: dx / l, z: dz / l }); hurt(r, tp, 3, me);
      } else if (m.t === 'hitm') {
        if (!r.sim || now - me.lastHit < 280) return; me.lastHit = now;
        const e = r.sim.ents.get(m.id); if (!e || Math.hypot(e.x - me.x, e.y - me.y, e.z - me.z) > 7.5) return;
        const dx = e.x - me.x, dz = e.z - me.z, l = Math.hypot(dx, dz) || 1;
        r.sim.damage(e.id, WDMG[me.weapon] || 3, me.id, dx / l, dz / l);
      } else if (m.t === 'fall') {
        if (now - me.lastFall < 300) return; me.lastFall = now; hurt(r, me, cl(m.d, 1, 10), null, 'gravity');
      } else if (m.t === 'heal') {
        if (now - me.lastHeal < 400) return; me.lastHeal = now; me.hp = Math.min(20, me.hp + cl(m.n, 1, 20)); bc(r, { t: 'hp', id: me.id, hp: me.hp });
      } else if (m.t === 'state' && m.s && typeof m.s === 'object') {
        const s = m.s, inv = {}; let n = 0;
        if (s.inv && typeof s.inv === 'object') for (const k in s.inv) { if (++n > 80) break; const v = s.inv[k] | 0; if (v > 0 && v < 100000) inv[k.slice(0, 12)] = v; }
        me.weapon = cl(s.weapon, 0, 3); me.armor = cl(s.armor, 0, 3);
        r.pstate[me.name] = { coins: cl(s.coins, 0, 1e9), inv, weapon: me.weapon, armor: me.armor, x: +s.x || 0, y: +s.y || 0, z: +s.z || 0 }; r.dirty = true;
      } else if (m.t === 'save') { send(ws, { t: 'saved', ok: saveRoom(r) }); }
      else if (m.t === 'chunk' && Number.isInteger(m.cx) && Number.isInteger(m.cz)) {
        const e = r.edits[m.cx + ',' + m.cz], out = [];
        if (e) for (const k in e) { const [x, y, z] = k.split(',').map(Number); out.push([x, y, z, e[k]]); }
        send(ws, { t: 'chunk', cx: m.cx, cz: m.cz, e: out });
      } else if (m.t === 'set') {
        const { x, y, z, id } = m;
        if (![x, y, z, id].every(Number.isInteger) || y < 1 || y >= CH || id < 0 || id > MAXID) return;
        if (Math.hypot(x - me.x, y - me.y, z - me.z) > 16) return;
        setEdit(r, x, y, z, id); if (r.world) r.world.set(x, y, z, id); bc(r, { t: 'set', x, y, z, id }, ws);
      }
    } catch (e) { /* ignore malformed message */ }
  });
  ws.on('close', () => {
    clearInterval(tick); all.delete(me); const r = me.room;
    if (r) { r.players.delete(me); if (me.name) bc(r, { t: 'leave', id: me.id }); if (!r.players.size) { saveRoom(r); r.gc = setTimeout(() => { if (!r.players.size) rooms.delete(r.code); }, 60000); } }
  });
});
server.listen(PORT, '0.0.0.0', () => console.log('Mineshaft on port ' + PORT));
