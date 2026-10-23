// Shared world generation + survival simulation (used by server.js and inlined into the client)
const CS = 16, CH = 80, SEA = 26;
const TRANSP = new Set([6, 7, 21, 26, 40, 41, 42, 43, 44, 45]);
const AT = [], T = (c, k = 'n', a = 0) => AT.push([c, k, a]) - 1;
const dirt = T(0x96603a), stone = T(0x7f7f84), plank = T(0xd09a4e, 'plank');
const B = {};
const b = (id, n, top, side = top, bot = side) => (B[id] = { n, f: [top, side, bot] });
b(1, 'Grass', T(0x66c23c), T(0x96603a, 'gside', 0x66c23c), dirt); b(2, 'Dirt', dirt); b(3, 'Stone', stone);
b(4, 'Sand', T(0xefd68a)); b(5, 'Oak Log', T(0x9c7f4e, 'ring'), T(0x5e4526, 'log')); b(6, 'Oak Leaves', T(0x3ea02a, 'leaf'));
b(7, 'Water', T(0x2f86e8)); b(8, 'Planks', plank); b(9, 'Bricks', T(0xb5493a, 'brick')); b(10, 'Lamp', T(0xffe08a, 'lamp'));
b(11, 'Bedrock', T(0x2a2a2a)); b(12, 'Snow', T(0xf4f8ff), T(0x96603a, 'gside', 0xf4f8ff), dirt); b(13, 'Gravel', T(0x8a8580));
b(14, 'Cobblestone', T(0x77777b, 'ore', 0x4a4a4e)); b(15, 'Coal Ore', T(0x7f7f84, 'ore', 0x1a1a1a)); b(16, 'Iron Ore', T(0x7f7f84, 'ore', 0xd8a37a));
b(17, 'Gold Ore', T(0x7f7f84, 'ore', 0xf7d83a)); b(18, 'Diamond Ore', T(0x7f7f84, 'ore', 0x4fe8e0));
b(19, 'Birch Log', T(0xd9c89a, 'ring'), T(0xe8e4d8, 'birch')); b(20, 'Spruce Log', T(0x6b4d2c, 'ring'), T(0x3c2a16, 'log'));
b(21, 'Spruce Leaves', T(0x27744a, 'leaf')); b(22, 'Cactus', T(0x3c8a2e, 'ring'), T(0x3c8a2e, 'cactus')); b(23, 'Sandstone', T(0xd6c58a, 'plank'));
b(24, 'Clay', T(0xa0a6b8)); b(25, 'Mud', T(0x4b3a2a)); b(26, 'Glass', T(0xcfeaf5, 'glass')); b(27, 'Ice', T(0x9fd0f5));
b(28, 'Mossy Cobble', T(0x77777b, 'ore', 0x3f7a35)); b(29, 'Bookshelf', plank, T(0xd09a4e, 'shelf'));
b(30, 'White Wool', T(0xeeeeee)); b(31, 'Red Wool', T(0xc0392b)); b(32, 'Blue Wool', T(0x2e5fc9)); b(33, 'Green Wool', T(0x3a9a3a));
b(34, 'Obsidian', T(0x1a1028)); b(35, 'Crate', T(0xa5793a, 'crate')); b(36, 'Gold Block', T(0xf3d13b)); b(37, 'Iron Block', T(0xd8d8d8)); b(38, 'Diamond Block', T(0x4fe8e0));
b(40, 'Tall Grass', T(0x66c23c, 'blade')); b(41, 'Red Flower', T(0x3a8a2a, 'flower', 0xd62828)); b(42, 'Yellow Flower', T(0x3a8a2a, 'flower', 0xf2d21b));
b(43, 'Mushroom', T(0xe8dcc0, 'shroom', 0xc0392b)); b(44, 'Dead Bush', T(0x7a5a30, 'bush')); b(45, 'Torch', T(0x6b4d2c, 'torch'));
const opq = id => id > 0 && !TRANSP.has(id);
const solid = id => id > 0 && id !== 7 && id < 40;
const idx = (x, y, z) => (y * CS + z) * CS + x;

function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function makeNoise(seed) {
  const r = mulberry(seed), p = new Uint8Array(512), a = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  for (let i = 0; i < 512; i++) p[i] = a[i & 255];
  const f = t => t * t * t * (t * (t * 6 - 15) + 10), l = (a, b, t) => a + (b - a) * t;
  const g = (h, x, y) => { h &= 3; return (h & 1 ? -x : x) + (h & 2 ? -y : y); };
  return (x, y) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255; x -= Math.floor(x); y -= Math.floor(y);
    const u = f(x), v = f(y), A = p[X] + Y, B = p[X + 1] + Y;
    return 0.5 * l(l(g(p[A], x, y), g(p[B], x - 1, y), u), l(g(p[A + 1], x, y - 1), g(p[B + 1], x - 1, y - 1), u), v);
  };
}
function hash(x, z, s) { let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ s; h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; }

function makeAtlas() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), im = x.createImageData(16, 16), d = im.data;
  AT.forEach(([col, k, acc], i) => {
    const R = col >> 16 & 255, G = col >> 8 & 255, Bc = col & 255, ar = acc >> 16 & 255, ag = acc >> 8 & 255, ab = acc & 255;
    for (let py = 0; py < 16; py++) for (let px = 0; px < 16; px++) {
      const h = hash(px + i * 31, py, 77), h2 = hash(px * 3, py * 5, i);
      let r = R, g = G, b = Bc, m = .88 + h * .24, al = 255;
      const set = (a, bb, cc) => { r = a; g = bb; b = cc; };
      if (k === 'gside' && py < 4 + (h < .4 ? 1 : 0)) set(ar, ag, ab);
      else if (k === 'ore' && h2 < .11) set(ar, ag, ab);
      else if (k === 'brick') { const off = (py >> 2) & 1 ? 4 : 0; if (py % 4 === 3 || (px + off) % 8 === 7) set(190, 190, 185); }
      else if (k === 'plank' && py % 4 === 3) m *= .7;
      else if (k === 'log' && (px % 4 === 0 || (px % 4 === 3 && h < .5))) m *= .72;
      else if (k === 'ring') { const dd = Math.max(Math.abs(px - 7.5), Math.abs(py - 7.5)) | 0; m *= dd === 7 ? .7 : dd % 3 === 2 ? .82 : 1; }
      else if (k === 'leaf' && h < .25) m *= .6;
      else if (k === 'glass') { const e = !px || !py || px === 15 || py === 15; if (!e && !(px === py || (px === py + 1 && py < 6))) al = 0; }
      else if (k === 'shelf') { if (py < 3 || py > 12) m *= 1; else { const bk = [0xaa3333, 0x3366aa, 0x33aa55, 0xccaa33][(px >> 1) % 4]; if (px % 2 || h > .2) set(bk >> 16 & 255, bk >> 8 & 255, bk & 255); } }
      else if (k === 'lamp') m = px % 8 === 0 || py % 8 === 0 ? .6 : 1.1;
      else if (k === 'crate') { if (px < 2 || py < 2 || px > 13 || py > 13) m *= .65; else if (px === py || px === 15 - py) m *= .8; }
      else if (k === 'birch' && h < .15 && py % 3 === 0) set(40, 40, 40);
      else if (k === 'cactus') { if (px % 5 === 2) m *= .7; if (h < .04) set(230, 230, 200); }
      else if (k === 'blade') { al = px % 3 && py >= 16 - (6 + (px * 5) % 8) ? 255 : 0; }
      else if (k === 'flower') { al = 0; const dd = Math.hypot(px - 7.5, py - 4.5); if (dd < 3) { set(ar, ag, ab); al = 255; } else if ((px === 7 || px === 8) && py >= 7) al = 255; }
      else if (k === 'shroom') { al = 0; if (py >= 5 && py <= 9 && px >= 4 && px <= 11 && !(py === 5 && (px < 6 || px > 9))) { set(ar, ag, ab); al = 255; } else if ((px === 7 || px === 8) && py >= 10 && py <= 14) al = 255; }
      else if (k === 'bush') al = (px + py) % 5 === 0 && py > 4 || (px === 8 && py > 6) ? 255 : 0;
      else if (k === 'torch') { al = (px === 7 || px === 8) && py >= 5 ? 255 : 0; if (py < 8) set(255, 210, 80); }
      const o = (py * 16 + px) * 4;
      d[o] = Math.min(255, r * m); d[o + 1] = Math.min(255, g * m); d[o + 2] = Math.min(255, b * m); d[o + 3] = al;
    }
    x.putImageData(im, (i % 8) * 16, (i >> 3) * 16);
  });
  return c;
}

const ck = (cx, cz) => (cx & 0xffff) * 65536 + (cz & 0xffff);
const RS = 160, WOOL = { N: 30, R: 31, B: 32, P: 33 };
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
class World {
  constructor(seed) { this.seed = seed; this.noise = makeNoise(seed); this.chunks = new Map(); this.camps = new Map(); this.ci = new Map(); this.onGen = null; }
  rawColumn(wx, wz) {
    const n = this.noise;
    const Tm = n(wx / 420 + 11, wz / 420 + 11) * 2.6, M = n(wx / 380 - 77, wz / 380 - 77) * 2.6, mt = n(wx / 170 + 300, wz / 170 + 300) * 2.6;
    const cont = n(wx / 150, wz / 150) * 1.3 + n(wx / 60, wz / 60) * .5 + n(wx / 22, wz / 22) * .18 + n(wx / 9, wz / 9) * .05;
    let h = SEA + 3 + cont * 16, bio = 'plains';
    if (h > SEA + 1) { if (Tm > .5 && M < .3) bio = 'desert'; else if (Tm < -.5) bio = 'snow'; else if (M > .7 && Tm > -.4 && Tm < .6) bio = 'swamp'; else if (M > .25) bio = 'forest'; }
    if (bio === 'swamp') h = SEA + Math.round(n(wx / 14, wz / 14) * 5);
    else if (mt > .35) { h += (mt - .35) * 34; if (h > SEA + 20) bio = 'mountain'; }
    h = Math.max(3, Math.min(CH - 12, Math.floor(h)));
    if (h < SEA - 1) bio = 'ocean'; else if (h <= SEA + 1 && bio !== 'swamp' && bio !== 'snow') bio = 'beach';
    return { h, bio };
  }
  campRaw(rx, rz) {
    const k = rx + ',' + rz; if (this.camps.has(k)) return this.camps.get(k);
    let r = null;
    if (hash(rx, rz, this.seed + 9) < .9) {
      const x = rx * RS + 24 + Math.floor(hash(rx, rz, this.seed + 10) * (RS - 48)), z = rz * RS + 24 + Math.floor(hash(rz, rx, this.seed + 11) * (RS - 48)), c = this.rawColumn(x, z);
      if (c.h > SEA + 2 && c.bio !== 'ocean' && c.bio !== 'mountain' && c.bio !== 'swamp' && c.bio !== 'beach') r = { id: k, x, z, y: c.h };
    }
    this.camps.set(k, r); return r;
  }
  startId() { if (this._sid !== undefined) return this._sid; let best = null, bd = 1e9; for (let rx = -4; rx <= 3; rx++) for (let rz = -4; rz <= 3; rz++) { const c = this.campRaw(rx, rz); if (c) { const d = Math.hypot(c.x, c.z); if (d < bd) { bd = d; best = c.id; } } } return (this._sid = best); }
  campInfo(rx, rz) {
    const k = rx + ',' + rz; if (this.ci.has(k)) return this.ci.get(k);
    const c = this.campRaw(rx, rz); let r = null;
    if (c) { const o = hash(rx, rz, this.seed + 12); r = { id: c.id, x: c.x, z: c.z, y: c.y, owner0: c.id === this.startId() ? 'P' : o < .34 ? 'R' : o < .68 ? 'B' : 'N' }; }
    this.ci.set(k, r); return r;
  }
  column(wx, wz) { const ci = this.campInfo(Math.floor(wx / RS), Math.floor(wz / RS)); if (ci && Math.abs(wx - ci.x) <= 6 && Math.abs(wz - ci.z) <= 6) return { h: ci.y, bio: 'plains' }; return this.rawColumn(wx, wz); }
  nearCamp(x, z, r) { const ci = this.campInfo(Math.floor(x / RS), Math.floor(z / RS)); return !!ci && Math.abs(x - ci.x) <= r && Math.abs(z - ci.z) <= r; }
  startPos() { const c = this.campInfo(...this.startId().split(',').map(Number)); return c ? { x: c.x + 3.5, z: c.z + 3.5, y: c.y + 1 } : null; }
  gen(cx, cz) {
    const d = new Uint8Array(CS * CS * CH), n = this.noise, S = this.seed; let mh = SEA;
    const put = (x, y, z, id, over) => { if (x < 0 || z < 0 || x > 15 || z > 15 || y < 0 || y >= CH) return; const i = idx(x, y, z); if (over || !d[i]) d[i] = id; };
    for (let lx = 0; lx < CS; lx++) for (let lz = 0; lz < CS; lz++) {
      const wx = cx * CS + lx, wz = cz * CS + lz, { h, bio } = this.column(wx, wz);
      if (h > mh) mh = h;
      const top = { desert: 4, beach: 4, ocean: 4, snow: 12, mountain: h > SEA + 34 ? 12 : 3, swamp: h <= SEA ? 25 : 1 }[bio] || 1;
      const sub = { desert: 23, beach: 4, ocean: 4, mountain: 3, swamp: 25 }[bio] || 2;
      for (let y = 0; y <= h; y++) {
        let id = y === 0 ? 11 : y < h - 3 ? 3 : y < h ? sub : top;
        if (y > 4 && y < h - 2 && Math.abs(n(wx / 18 + y * .37, wz / 18 - y * .21)) < .06 && Math.abs(n(wx / 18 - y * .29 + 50, wz / 18 + y * .33 + 50)) < .06) id = 0;
        else if (id === 3) { const r = hash(wx + y * 131, wz + y * 7, S); id = r < .012 ? 15 : r < .019 && y < 40 ? 16 : r < .022 && y < 22 ? 17 : r < .0235 && y < 14 ? 18 : r > .985 && y < 50 ? 13 : 3; }
        else if ((bio === 'ocean' || bio === 'beach') && y === h && hash(wx, wz, S + 3) < .12) id = bio === 'ocean' ? 24 : 4;
        d[idx(lx, y, lz)] = id;
      }
      for (let y = h + 1; y <= SEA; y++) d[idx(lx, y, lz)] = bio === 'snow' && y === SEA ? 27 : 7;
      if (h <= SEA || this.nearCamp(wx, wz, 8)) continue;
      const r = hash(wx, wz, S + 1), r2 = hash(wz, wx, S + 2), inner = lx >= 3 && lx <= 12 && lz >= 3 && lz <= 12, y0 = h + 1;
      const tree = (log, leaf, th) => { if (h + th + 2 > mh) mh = h + th + 2; for (let y = y0; y < y0 + th; y++) put(lx, y, lz, log); for (let dy = th - 2; dy <= th + 1; dy++) { const rad = dy >= th ? 1 : 2; for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) if (!(Math.abs(dx) === rad && Math.abs(dz) === rad && (dy > th || hash(wx + dx, wz + dz, S) < .5))) put(lx + dx, y0 + dy, lz + dz, leaf); } };
      if (bio === 'plains') { if (r < .003 && inner) tree(5, 6, 4 + (r2 * 3 | 0)); else if (r > .9) put(lx, y0, lz, 40); else if (r > .86) put(lx, y0, lz, r2 < .5 ? 41 : 42); }
      else if (bio === 'forest') { if (r < .045 && inner) r2 < .3 ? tree(19, 6, 5 + (r2 * 10 | 0) % 3) : tree(5, 6, 4 + (r2 * 4 | 0)); else if (r > .93) put(lx, y0, lz, 40); else if (r > .985) put(lx, y0, lz, 43); }
      else if (bio === 'swamp') { if (r < .025 && inner) tree(5, 6, 4 + (r2 * 2 | 0)); else if (r > .97) put(lx, y0, lz, 43); else if (r > .88) put(lx, y0, lz, 40); }
      else if (bio === 'snow') { if (r < .03 && inner) { const th = 5 + (r2 * 3 | 0); if (h + th + 3 > mh) mh = h + th + 3; for (let y = y0; y < y0 + th; y++) put(lx, y, lz, 20); for (let dy = 2; dy <= th + 1; dy++) { const rad = Math.max(0, Math.floor((th + 1 - dy) / 2)); for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) if (!(rad && Math.abs(dx) === rad && Math.abs(dz) === rad)) put(lx + dx, y0 + dy, lz + dz, 21); } } }
      else if (bio === 'desert') { if (r < .006) { for (let y = y0; y < y0 + 2 + (r2 * 3 | 0); y++) put(lx, y, lz, 22); if (mh < h + 5) mh = h + 5; } else if (r > .985) put(lx, y0, lz, 44); }
    }
    for (let rx = Math.floor((cx * CS - 5) / RS); rx <= Math.floor((cx * CS + 20) / RS); rx++) for (let rz = Math.floor((cz * CS - 5) / RS); rz <= Math.floor((cz * CS + 20) / RS); rz++) {
      const ci = this.campInfo(rx, rz); if (!ci) continue;
      const lx = ci.x - cx * CS, lz = ci.z - cz * CS, y = ci.y, wl = WOOL[ci.owner0];
      if (lx < -4 || lx > 19 || lz < -4 || lz > 19) continue;
      for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) put(lx + dx, y, lz + dz, 8, true);
      for (let dy = 1; dy <= 5; dy++) put(lx, y + dy, lz, 5, true);
      for (let dy = 4; dy <= 5; dy++) { put(lx + 1, y + dy, lz, wl, true); put(lx + 2, y + dy, lz, wl, true); }
      for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) put(lx + dx, y + 1, lz + dz, 45, true);
      put(lx - 2, y + 1, lz, 35, true);
      if (mh < y + 7) mh = y + 7;
    }
    if (mh < SEA + 3) mh = SEA + 3;
    const c = { cx, cz, d, dirty: true, meshes: [], maxY: Math.min(CH - 1, mh + 2), miss: 0 };
    this.chunks.set(ck(cx, cz), c);
    if (this.onGen) this.onGen(c);
    for (let k = 0; k < 4; k++) { const q = this.chunks.get(ck(cx + DIRS[k][0], cz + DIRS[k][1])); if (q && (q.miss >> (k ^ 1)) & 1) q.dirty = true; }
    return c;
  }
  chunk(x, z) { return this.chunks.get(ck(Math.floor(x) >> 4, Math.floor(z) >> 4)); }
  get(x, y, z) { if (y < 0 || y >= CH) return 0; const c = this.chunks.get(ck(x >> 4, z >> 4)); return c ? c.d[idx(x & 15, y, z & 15)] : 0; }
  set(x, y, z, id) {
    const c = this.chunks.get(ck(x >> 4, z >> 4)); if (!c || y < 0 || y >= CH) return;
    c.d[idx(x & 15, y, z & 15)] = id; c.dirty = true; if (y > c.maxY) c.maxY = Math.min(CH - 1, y + 1);
    const lx = x & 15, lz = z & 15, mark = (a, b) => { const q = this.chunks.get(ck(a, b)); if (q) q.dirty = true; };
    if (lx === 0) mark(c.cx - 1, c.cz); if (lx === 15) mark(c.cx + 1, c.cz);
    if (lz === 0) mark(c.cx, c.cz - 1); if (lz === 15) mark(c.cx, c.cz + 1);
  }
}

const FACES = [
  { d: [1, 0, 0], v: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], s: .85 },
  { d: [-1, 0, 0], v: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], s: .85 },
  { d: [0, 1, 0], v: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], s: 1 },
  { d: [0, -1, 0], v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], s: .55 },
  { d: [0, 0, 1], v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], s: .7 },
  { d: [0, 0, -1], v: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], s: .7 },
];
const AOO = FACES.map(f => f.v.map(v => {
  const nax = f.d[0] ? 0 : f.d[1] ? 1 : 2, t1 = (nax + 1) % 3, t2 = (nax + 2) % 3;
  const mk = (a, b) => { const r = [f.d[0], f.d[1], f.d[2]]; if (a) r[t1] += v[t1] ? 1 : -1; if (b) r[t2] += v[t2] ? 1 : -1; return r; };
  return [mk(1, 0), mk(0, 1), mk(1, 1)];
}));
const CROSS = [[[0, 0, 0], [1, 0, 1], [1, 1, 1], [0, 1, 0]], [[1, 0, 0], [0, 0, 1], [0, 1, 1], [1, 1, 0]]];
const AOB = [140, 184, 220, 255], opqF = id => id > 0 && id !== 7 && id !== 26 && id < 40, E = .0015;
const UV = [[0, 0], [1, 0], [1, 1], [0, 1]];
function quad(o, x, y, z, verts, tile, sh, flip, low) {
  const n = o.p.length / 3, u0 = (tile % 8) / 8 + E, v0 = 1 - ((tile >> 3) + 1) / 8 + E, du = 1 / 8 - 2 * E;
  for (let k = 0; k < 4; k++) {
    const v = verts[k]; o.p.push(x + v[0], y + v[1] * (low && v[1] ? .88 : 1), z + v[2]);
    const s = Math.min(255, sh[k] | 0); o.c.push(s, s, s); o.u.push(u0 + UV[k][0] * du, v0 + UV[k][1] * du);
  }
  if (flip) o.i.push(n, n + 1, n + 3, n + 1, n + 2, n + 3); else o.i.push(n, n + 1, n + 2, n, n + 2, n + 3);
}
function buildMesh(w, c, opt = {}) {
  const out = [0, 1].map(() => ({ p: [], c: [], u: [], i: [] })), nbs = new Array(9);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const q = dx || dz ? w.chunks.get(ck(c.cx + dx, c.cz + dz)) : c; nbs[(dz + 1) * 3 + dx + 1] = q ? q.d : null; }
  let miss = 0; DIRS.forEach(([dx, dz], k) => { if (!nbs[(dz + 1) * 3 + dx + 1]) miss |= 1 << k; }); c.miss = miss;
  const g = (x, y, z) => { if (y < 0) return 3; if (y >= CH) return 0; const a = nbs[((z >> 4) + 1) * 3 + (x >> 4) + 1]; return a ? a[(y * CS + (z & 15)) * CS + (x & 15)] : 3; };
  const OP = opt.fast ? opqF : opq, ao = opt.ao, my = c.maxY, top = new Int16Array(CS * CS), A = [0, 0, 0, 0], S4 = [0, 0, 0, 0];
  for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) { let y = my; while (y > 0 && !OP(c.d[idx(x, y, z)])) y--; top[z * CS + x] = y; }
  for (let y = 0; y <= my; y++) for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
    const id = c.d[idx(x, y, z)]; if (!id) continue;
    const def = B[id], tp = top[z * CS + x], L = y >= tp ? 1 : Math.max(.28, 1 - (tp - y) * .13);
    if (id >= 40) { const sh = L * 242; S4[0] = S4[1] = S4[2] = S4[3] = sh; for (const q of CROSS) { quad(out[0], x, y, z, q, def.f[0], S4, 0); const o = out[0], n = o.p.length / 3; o.i.push(n - 4, n - 2, n - 3, n - 4, n - 1, n - 2); } continue; }
    const o = out[id === 7 ? 1 : 0];
    for (let fi = 0; fi < 6; fi++) {
      const f = FACES[fi], nb = g(x + f.d[0], y + f.d[1], z + f.d[2]);
      if (OP(nb) || (nb === id && TRANSP.has(id))) continue;
      if (id === 7 && nb !== 0 && f.d[1] !== 1) continue;
      const base = f.s * L * 255 * (.95 + hash(c.cx * 16 + x + y * 7, c.cz * 16 + z, 5) * .08);
      if (ao && id !== 7) {
        for (let vi = 0; vi < 4; vi++) { const q = AOO[fi][vi], a1 = OP(g(x + q[0][0], y + q[0][1], z + q[0][2])), a2 = OP(g(x + q[1][0], y + q[1][1], z + q[1][2])), a3 = OP(g(x + q[2][0], y + q[2][1], z + q[2][2])); A[vi] = a1 && a2 ? 0 : 3 - (a1 + a2 + a3); S4[vi] = base * AOB[A[vi]] / 255; }
        quad(o, x, y, z, f.v, def.f[fi === 2 ? 0 : fi === 3 ? 2 : 1], S4, A[0] + A[2] < A[1] + A[3], 0);
      } else { S4[0] = S4[1] = S4[2] = S4[3] = base; quad(o, x, y, z, f.v, def.f[fi === 2 ? 0 : fi === 3 ? 2 : 1], S4, 0, id === 7 && nb === 0); }
    }
  }
  return out;
}

// ================= SURVIVAL SIM (shared by server and offline client) =================
const TYPES = ['pig', 'sheep', 'wolf', 'bear', 'spider', 'soldier', 'trader'], FACS = ['N', 'R', 'B', 'P'];
const MOB = {
  pig: { hp: 8, spd: 1.8, host: 0, coins: 0, meat: 1, r: .45, h: .9 }, sheep: { hp: 8, spd: 1.8, host: 0, coins: 0, meat: 1, r: .45, h: 1.1 },
  wolf: { hp: 12, spd: 4.8, host: 1, aggro: 15, dmg: 2, coins: 6, meat: 1, r: .45, h: .9 }, bear: { hp: 30, spd: 3.2, host: 1, aggro: 10, dmg: 5, coins: 16, meat: 2, r: .75, h: 1.4 },
  spider: { hp: 14, spd: 4.2, host: 1, aggro: 11, dmg: 2, coins: 8, meat: 0, r: .65, h: .7 }, soldier: { hp: 26, spd: 3.6, host: 0, dmg: 3, r: .3, h: 1.8 }, trader: { hp: 999, spd: 0, host: 0, r: .3, h: 1.8 },
};
function isNight() { return Math.sin(((Date.now() / 1000) / 600 % 1) * 6.2832) < -.15; }
const r1 = v => Math.round(v * 10) / 10;
class Sim {
  constructor(world, hk) { this.w = world; this.hk = hk; this.ents = new Map(); this.camps = new Map(); this.owners = {}; this.t = 0; this.nid = 100000; this.spT = 1; this.cT = 0; this.raidT = { R: 30, B: 45, P: 90 }; this.incT = 60; }
  S(x, y, z) { return solid(this.w.get(Math.floor(x), Math.floor(y), Math.floor(z))); }
  add(type, x, y, z, f, home) { const m = MOB[type], e = { id: this.nid++, type, x, y, z, vy: 0, ry: Math.random() * 6.28, hp: m.hp, mh: m.hp, f: f || 'N', home: home || null, cd: 0, wt: 0, wx: x, wz: z, kx: 0, kz: 0, raid: null, raidT: 0, aggroT: 0, aggroP: -1, onG: false }; this.ents.set(e.id, e); return e; }
  blocked(x, y, z, h) { return this.S(x, y + .1, z) || (h > 1 && this.S(x, y + 1.1, z)); }
  mv(e, dx, dz) {
    const h = MOB[e.type].h, nx = e.x + dx, nz = e.z + dz;
    if (!this.blocked(nx, e.y, nz, h)) { e.x = nx; e.z = nz; }
    else if (e.onG && !this.blocked(nx, e.y + 1, nz, h) && !this.S(e.x, e.y + h + .9, e.z)) { e.y += 1; e.x = nx; e.z = nz; }
  }
  step(e, tx, tz, spd, dt) { let dx = tx - e.x, dz = tz - e.z; const d = Math.hypot(dx, dz); if (d < .05) return d; const s = Math.min(spd * dt, d); dx = dx / d * s; dz = dz / d * s; e.ry = Math.atan2(-dx, -dz); this.mv(e, dx, dz); return d; }
  grav(e, dt) {
    e.onG = this.S(e.x, e.y - .05, e.z);
    if (!e.onG) { e.vy = Math.max(e.vy - 25 * dt, -30); const ny = e.y + e.vy * dt; if (this.S(e.x, ny, e.z)) { e.y = Math.floor(ny) + 1; e.vy = 0; e.onG = true; } else e.y = ny; }
    else { e.vy = 0; if (this.S(e.x, e.y + .1, e.z)) e.y += 1; }
  }
  kill(e, byPid) {
    this.ents.delete(e.id); const m = MOB[e.type];
    if (byPid != null && byPid >= 0) { const c = e.type === 'soldier' ? (e.f === 'P' ? 0 : 10) : (m.coins || 0); if (c || m.meat) this.hk.reward(byPid, { coins: c, meat: m.meat || 0 }); }
  }
  damage(id, dmg, byPid, kx, kz) {
    const e = this.ents.get(id); if (!e || e.type === 'trader') return;
    e.hp -= dmg; e.kx = (kx || 0) * 7; e.kz = (kz || 0) * 7;
    if (e.type === 'soldier' && e.f !== 'P' && byPid >= 0) { e.aggroP = byPid; e.aggroT = this.t + 30; }
    if (e.hp <= 0) this.kill(e, byPid);
  }
  scanCamps(players) {
    for (const p of players) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const ci = this.w.campInfo(Math.floor(p.x / RS) + dx, Math.floor(p.z / RS) + dz);
      if (ci && !this.camps.has(ci.id)) this.camps.set(ci.id, { id: ci.id, x: ci.x, z: ci.z, y: ci.y, owner: this.owners[ci.id] || ci.owner0, cap: 0, capF: null, pcap: 0, spT: 4, tid: 0 });
    }
  }
  flip(c, f) {
    c.owner = f; this.owners[c.id] = f; c.cap = 0; c.pcap = 0;
    const wl = WOOL[f]; for (let dy = 4; dy <= 5; dy++) { this.hk.setBlock(c.x + 1, c.y + dy, c.z, wl); this.hk.setBlock(c.x + 2, c.y + dy, c.z, wl); }
    for (const e of [...this.ents.values()]) { if (e.type === 'soldier' && e.home === c.id) this.ents.delete(e.id); else if (e.raid === c.id) e.raid = null; }
    this.hk.camp(c.id, f);
  }
  campLogic(dt, players) {
    const H = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    let pc = 0;
    for (const c of this.camps.values()) {
      if (!players.some(p => H(p, c) < 130)) continue;
      if (c.owner === 'P') pc++;
      if (!this.ents.has(c.tid) && this.w.chunk(c.x, c.z)) c.tid = this.add('trader', c.x + 2.5, c.y + 1, c.z + 2.5, 'N', c.id).id;
      let mine = 0, att = 0, def = 0; const af = { R: 0, B: 0, P: 0 }; let hostile = 0;
      for (const e of this.ents.values()) {
        if (e.type !== 'soldier') continue; const d = H(e, c);
        if (e.home === c.id) mine++;
        if (e.f !== c.owner && d < 5) { att++; af[e.f]++; } else if (e.f === c.owner && d < 10) def++;
        if (e.f !== 'P' && d < 12) hostile++;
      }
      if (c.owner !== 'N' && mine < (c.owner === 'P' ? 4 : 3) && (c.spT -= dt) <= 0 && this.w.chunk(c.x, c.z)) { c.spT = 20; this.add('soldier', c.x + (Math.random() * 6 - 3), c.y + 1, c.z + (Math.random() * 6 - 3), c.owner, c.id); }
      if (c.owner === 'P') def += players.filter(p => H(p, c) < 10).length;
      if (att > 0 && def === 0) { c.cap += dt * att; c.capF = af.R >= af.B && af.R >= af.P ? 'R' : af.B >= af.P ? 'B' : 'P'; if (c.cap >= 8) { this.flip(c, c.capF); continue; } } else c.cap = Math.max(0, c.cap - dt * .5);
      if (c.owner !== 'P') {
        const near = players.filter(p => H(p, c) < 4.5);
        if (near.length && hostile === 0) { c.pcap += dt; if (c.pcap >= 6) { this.flip(c, 'P'); near.forEach(p => this.hk.reward(p.id, { coins: 40 })); this.hk.msg('Camp captured! It now pays you income.'); } } else c.pcap = Math.max(0, c.pcap - dt * .5);
      }
    }
    if ((this.incT -= dt) <= 0) { this.incT = 60; if (pc) this.hk.income(5 * pc); }
    for (const f of ['R', 'B', 'P']) {
      if ((this.raidT[f] -= dt) > 0) continue; this.raidT[f] = 60 + Math.random() * 40;
      const sol = [...this.ents.values()].filter(e => e.type === 'soldier' && e.f === f); if (sol.length < (f === 'P' ? 3 : 2)) continue;
      let best = null, bd = 170; for (const c of this.camps.values()) if (c.owner !== f) { const d = H(sol[0], c); if (d < bd) { bd = d; best = c; } }
      if (best) for (const e of sol) { e.raid = best.id; e.raidT = this.t + 50; }
    }
  }
  spawn(players) {
    const night = isNight(); if (this.ents.size > 110) return;
    for (const p of players) {
      let host = 0, pas = 0; for (const e of this.ents.values()) if (Math.hypot(e.x - p.x, e.z - p.z) < 50) { if (MOB[e.type].host) host++; else if (e.type === 'pig' || e.type === 'sheep') pas++; }
      const a = Math.random() * 6.283, d = 22 + Math.random() * 16, x = Math.floor(p.x + Math.cos(a) * d), z = Math.floor(p.z + Math.sin(a) * d);
      if (!this.w.chunk(x, z) || this.w.nearCamp(x, z, 20)) continue;
      const col = this.w.column(x, z); if (col.h <= SEA) continue; const y = col.h + 1; if (this.S(x, y, z) || this.S(x, y + 1, z)) continue;
      let type = null; const bio = col.bio;
      if (host < (night ? 7 : 3) && Math.random() < (night ? .9 : .35)) { type = night && (bio === 'plains' || bio === 'desert' || bio === 'swamp' || bio === 'beach') && Math.random() < .6 ? 'spider' : (bio === 'mountain' || bio === 'snow' || (bio === 'forest' && Math.random() < .3)) && Math.random() < .5 ? 'bear' : 'wolf'; }
      else if (pas < 5 && !night && (bio === 'plains' || bio === 'forest')) type = Math.random() < .5 ? 'pig' : 'sheep';
      if (type) this.add(type, x + .5, y, z + .5);
    }
  }
  tick(dt, players) {
    this.t += dt; if (!players.length) return;
    if ((this.cT -= dt) <= 0) { this.cT = 2; this.scanCamps(players); }
    if ((this.spT -= dt) <= 0) { this.spT = 3; this.spawn(players); }
    this.campLogic(dt, players);
    const night = isNight(), H = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    for (const e of [...this.ents.values()]) {
      const m = MOB[e.type]; let near = 1e9; for (const p of players) near = Math.min(near, H(e, p));
      if (near > (e.type === 'soldier' || e.type === 'trader' ? 125 : 78) || e.y < -5) { this.ents.delete(e.id); continue; }
      if (!this.w.chunk(e.x, e.z)) continue;
      e.cd -= dt;
      if (e.kx || e.kz) { this.mv(e, e.kx * dt, e.kz * dt); e.kx *= .85; e.kz *= .85; if (Math.abs(e.kx) < .1) e.kx = e.kz = 0; }
      this.grav(e, dt);
      if (e.type === 'trader') { let np = null, nd = 12; for (const p of players) { const d = H(e, p); if (d < nd) { nd = d; np = p; } } if (np) e.ry = Math.atan2(-(np.x - e.x), -(np.z - e.z)); continue; }
      let tg = null, td = 1e9;
      const cand = (o, isP) => { const d = H(e, o); if (d < td && Math.abs(o.y - e.y) < 5) { td = d; tg = { x: o.x, z: o.z, pid: isP ? o.id : undefined, ent: isP ? null : o }; } };
      if (m.host) {
        const ag = m.aggro * (e.type === 'spider' && !night ? .4 : 1);
        for (const p of players) if (H(e, p) < ag) cand(p, true);
        for (const o of this.ents.values()) if (o.type === 'soldier' && H(e, o) < ag * .6) cand(o, false);
        if (tg && td > ag) tg = null;
      } else if (e.type === 'soldier') {
        const home = this.camps.get(e.home);
        for (const o of this.ents.values()) { if (o === e) continue; if ((MOB[o.type].host && H(e, o) < 16) || (o.type === 'soldier' && o.f !== e.f && H(e, o) < 18)) cand(o, false); }
        for (const p of players) if ((e.f !== 'P' && home && H(p, home) < 14) || (e.aggroT > this.t && e.aggroP === p.id)) { if (H(e, p) < 18) cand(p, true); }
        if (!tg) {
          let gx = e.x, gz = e.z, go = false;
          if (e.raid && e.raidT > this.t) { const rc = this.camps.get(e.raid); if (rc && rc.owner !== e.f) { gx = rc.x; gz = rc.z; go = true; } else e.raid = null; }
          else if (home) { if ((e.wt -= dt) <= 0) { e.wt = 3 + Math.random() * 4; e.wx = home.x + Math.random() * 14 - 7; e.wz = home.z + Math.random() * 14 - 7; } gx = e.wx; gz = e.wz; }
          if (H(e, { x: gx, z: gz }) > (go ? 3 : .8)) this.step(e, gx, gz, MOB.soldier.spd * (go ? 1 : .4), dt);
          continue;
        }
      }
      if (tg) {
        const reach = 1.5 + m.r;
        if (td > reach - .3) this.step(e, tg.x, tg.z, m.spd, dt);
        else e.ry = Math.atan2(-(tg.x - e.x), -(tg.z - e.z));
        if (td < reach && e.cd <= 0) {
          e.cd = 1.1;
          if (tg.pid !== undefined) this.hk.hurtPlayer(tg.pid, m.dmg, e.type === 'soldier' ? 'a soldier' : 'a ' + e.type);
          else if (tg.ent) { tg.ent.hp -= m.dmg; if (tg.ent.hp <= 0) this.kill(tg.ent, null); }
        }
      } else {
        if ((e.wt -= dt) <= 0) { e.wt = 3 + Math.random() * 4; if (Math.random() < .6) { e.wx = e.x + Math.random() * 8 - 4; e.wz = e.z + Math.random() * 8 - 4; } else { e.wx = e.x; e.wz = e.z; } }
        if (H(e, { x: e.wx, z: e.wz }) > .5) this.step(e, e.wx, e.wz, m.spd * .35, dt);
      }
    }
  }
  snap(px, pz) {
    const out = [];
    for (const e of this.ents.values()) if (Math.hypot(e.x - px, e.z - pz) < 80) out.push([e.id, TYPES.indexOf(e.type), r1(e.x), r1(e.y), r1(e.z), Math.round(e.ry * 100) / 100, Math.ceil(e.hp), FACS.indexOf(e.f), e.mh]);
    return out;
  }
}
if (typeof module !== 'undefined') module.exports = { World, Sim, hash, CH, CS, SEA, TYPES, FACS, MOB, B, solid, ck, isNight, RS, WOOL };
