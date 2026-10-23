// ================= GAME =================
const $ = id => document.getElementById(id);
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const lsDel = k => { try { localStorage.removeItem(k); } catch {} };
window.addEventListener('error', e => { const m = $('msg'); m.style.display = 'block'; m.textContent = 'Error: ' + e.message + (e.lineno ? ' (line ' + e.lineno + ')' : ''); });
let name = lsGet('mc_name') || '', cfg = null;
function choose(kind, md) {
  const v = $('nm').value.trim(); if (!v) { $('menuerr').textContent = 'Enter a display name first'; return; }
  let code = 'PUBLIC';
  if (kind === 'room') { code = $('rc').value.toUpperCase().replace(/[^A-Z0-9]/g, ''); if (code.length < 3 || code.length > 12) { $('menuerr').textContent = 'Room code: 3-12 letters or numbers'; return; } lsSet('mc_room', code); }
  name = v; lsSet('mc_name', v); cfg = { kind, mode: kind === 'solo' ? 'survival' : (md || 'creative'), code }; start();
}
$('bpub').onclick = () => choose('public'); $('brc').onclick = () => choose('room', 'creative'); $('brs').onclick = () => choose('room', 'survival'); $('bsolo').onclick = () => choose('solo');
$('bnew').onclick = () => { lsDel('mc_solo'); $('bnew').style.display = 'none'; $('bsolo').textContent = 'Start survival'; $('menuerr').textContent = 'Old save cleared. Press Start survival for a fresh world.'; };
$('nmc').onclick = () => { lsDel('mc_name'); $('nm').value = ''; name = ''; $('menuerr').textContent = 'Name cleared'; };
$('nm').value = name; $('rc').value = lsGet('mc_room') || '';
if (lsGet('mc_solo')) { $('bsolo').textContent = 'Continue survival'; $('bnew').style.display = 'block'; }

const touch = matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window && !matchMedia('(pointer: fine)').matches);
if (touch) document.body.classList.add('touch');
const HOT = [3, 2, 1, 8, 5, 6, 26, 10, 45], D = 4.2, PI = Math.PI;
let sel = 0, world = null, myId = 0, hp = 20, kills = 0, view = 1, started = false, me = null, mode = 'creative', offline = false, roomCode = 'PUBLIC', sim = null, campOwn = {}, simAcc = 0;
const newS = () => ({ coins: 25, inv: { 8: 12, 45: 6, bread: 3 }, weapon: 0, armor: 0 });
let S = newS();
const netEnts = new Map(), anims = new Map(), parts = [], WDMG = [3, 5, 8, 12];

// ---------- quality ----------
const weak = touch && ((navigator.deviceMemory || 4) <= 3 || (navigator.hardwareConcurrency || 4) <= 4);
const QS = [{ R: 3, pr: .55, ao: 0, fast: 1, cl: 0, b: 5 }, { R: 4, pr: .75, ao: 0, fast: 1, cl: 0, b: 6 }, { R: 5, pr: 1, ao: 1, fast: 0, cl: 1, b: 8 }, { R: 7, pr: Math.min(window.devicePixelRatio || 1, 1.5), ao: 1, fast: 0, cl: 1, b: 10 }];
const qMax = touch ? 2 : 3;
let qMode = lsGet('mc_q') || 'auto', qLevel = weak ? 0 : touch ? 1 : 3, R = QS[qLevel].R;
const meshOpt = { ao: QS[qLevel].ao, fast: QS[qLevel].fast };
let rescan = true, showClouds = !!QS[qLevel].cl, fogN = 40, fogF = 80;

// ---------- minimal WebGL renderer ----------
const cv = document.createElement('canvas'); cv.id = 'gl'; document.body.prepend(cv);
let gl = null;
try { gl = cv.getContext('webgl', { antialias: !touch, alpha: false, powerPreference: 'high-performance' }) || cv.getContext('experimental-webgl'); } catch (e) { }
if (!gl) { document.body.innerHTML = '<p style="padding:20px;color:#fff">WebGL is not available in this browser, so the game cannot start.</p>'; throw new Error('no webgl'); }
const u32 = gl.getExtension('OES_element_index_uint');
cv.addEventListener('webglcontextlost', e => e.preventDefault());
cv.addEventListener('webglcontextrestored', () => location.reload());
const FSP = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n';
function mkProg(vs, fs, binds) {
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(o)); return o; };
  const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FSP + fs));
  binds.forEach((n, i) => gl.bindAttribLocation(p, i, n)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
  const L = {}; return { p, u: n => (n in L) ? L[n] : (L[n] = gl.getUniformLocation(p, n)) };
}
const TP = mkProg(`attribute vec3 aP;attribute vec2 aUV;attribute vec4 aC;uniform mat4 uVP;uniform vec3 uOff,uCam,uFog;varying vec2 vUV;varying vec3 vC;varying float vF;
void main(){vec3 w=aP+uOff;gl_Position=uVP*vec4(w,1.);vUV=aUV;vC=aC.rgb;float d=distance(w,uCam);vF=clamp((d-uFog.x)/(uFog.y-uFog.x),0.,1.);}`,
  `uniform sampler2D uTex;uniform vec3 uTint,uFogC;uniform float uAlpha,uCut;varying vec2 vUV;varying vec3 vC;varying float vF;
void main(){vec4 t=texture2D(uTex,vUV);if(uCut>.5&&t.a<.5)discard;vec3 c=t.rgb*vC*uTint;gl_FragColor=vec4(mix(c,uFogC,vF),uCut>.5?1.:uAlpha);}`, ['aP', 'aUV', 'aC']);
const OP = mkProg(`attribute vec3 aP,aN;attribute vec2 aUV;uniform mat4 uVP,uModel;uniform vec3 uScale,uCam,uFog;uniform vec4 uUV;varying vec2 vUV;varying float vL,vF;
void main(){vec4 w=uModel*vec4(aP*uScale,1.);gl_Position=uVP*w;vUV=aUV*uUV.xy+uUV.zw;vec3 n=normalize(mat3(uModel)*aN);vL=.55+.45*max(0.,dot(n,normalize(vec3(.4,.8,.45))));float d=distance(w.xyz,uCam);vF=clamp((d-uFog.x)/(uFog.y-uFog.x),0.,1.);}`,
  `uniform sampler2D uTex;uniform vec3 uColor,uTint,uFogC;uniform float uMode,uFlash,uAlpha;varying vec2 vUV;varying float vL,vF;
void main(){vec3 c;float a=1.;
if(uMode<.5){c=uColor*vL*uTint;}
else if(uMode<1.5){vec4 t=texture2D(uTex,vUV);c=t.rgb*vL*uTint;a=t.a;if(a<.05)discard;}
else if(uMode<2.5){c=uColor;}
else{vec4 t=texture2D(uTex,vUV);c=t.rgb*uTint;a=t.a*uAlpha;if(a<.02)discard;}
c=mix(c,vec3(.85,.1,.1),uFlash*.55);gl_FragColor=vec4(mix(c,uFogC,vF),a);}`, ['aP', 'aN', 'aUV']);
const LP = mkProg(`attribute vec2 aK;uniform mat4 uP,uV;uniform vec3 uC;uniform vec2 uS;varying vec2 vUV;
void main(){vec4 p=uV*vec4(uC,1.);p.xy+=aK*uS;gl_Position=uP*p;vUV=aK*.5+.5;}`,
  `uniform sampler2D uTex;varying vec2 vUV;void main(){vec4 t=texture2D(uTex,vUV);if(t.a<.05)discard;gl_FragColor=t;}`, ['aK']);

function mkTex(canvas, repeat, smooth) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  const f = smooth ? gl.LINEAR : gl.NEAREST, w = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, w); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, w); return t;
}
// matrices (column-major)
const M = {
  mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
  id() { const o = new Float32Array(16); o[0] = o[5] = o[10] = o[15] = 1; return o; },
  trans(x, y, z) { const o = M.id(); o[12] = x; o[13] = y; o[14] = z; return o; },
  scl(s) { const o = M.id(); o[0] = o[5] = o[10] = s; return o; },
  rotX(a) { const o = M.id(), c = Math.cos(a), s = Math.sin(a); o[5] = c; o[6] = s; o[9] = -s; o[10] = c; return o; },
  rotY(a) { const o = M.id(), c = Math.cos(a), s = Math.sin(a); o[0] = c; o[2] = -s; o[8] = s; o[10] = c; return o; },
  persp(f, a, n, fa) { const t = 1 / Math.tan(f / 2), o = new Float32Array(16); o[0] = t / a; o[5] = t; o[10] = (fa + n) / (n - fa); o[11] = -1; o[14] = 2 * fa * n / (n - fa); return o; },
  look(ex, ey, ez, cx, cy, cz) {
    let zx = ex - cx, zy = ey - cy, zz = ez - cz, l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
    let xx = zz, xy = 0, xz = -zx; l = Math.hypot(xx, xz) || 1; xx /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx, o = new Float32Array(16);
    o[0] = xx; o[1] = yx; o[2] = zx; o[4] = xy; o[5] = yy; o[6] = zy; o[8] = xz; o[9] = yz; o[10] = zz;
    o[12] = -(xx * ex + xy * ey + xz * ez); o[13] = -(yx * ex + yy * ey + yz * ez); o[14] = -(zx * ex + zy * ey + zz * ez); o[15] = 1; return o;
  },
};
// static geometry
function mkGeo(verts, idx, mode) {
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  return { vb, ib, n: idx.length, mode };
}
const boxG = (() => {
  const v = [], ix = [];
  FACES.forEach(f => { const n = v.length / 8; f.v.forEach((p, k) => v.push(p[0] - .5, p[1] - .5, p[2] - .5, f.d[0], f.d[1], f.d[2], UV[k][0], UV[k][1])); ix.push(n, n + 1, n + 2, n, n + 2, n + 3); });
  return mkGeo(v, ix, gl.TRIANGLES);
})();
const quadG = mkGeo([-.5, -.5, 0, 0, 0, 1, 0, 0, .5, -.5, 0, 0, 0, 1, 1, 0, .5, .5, 0, 0, 0, 1, 1, 1, -.5, .5, 0, 0, 0, 1, 0, 1], [0, 1, 2, 0, 2, 3], gl.TRIANGLES);
const wireG = (() => {
  const c = [], e = [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]], v = [], ix = [];
  for (let i = 0; i < 8; i++) c.push([(i & 1) - .5, ((i >> 1) & 1) - .5, ((i >> 2) & 1) - .5]);
  c.forEach(p => v.push(p[0], p[1], p[2], 0, 1, 0, 0, 0)); e.forEach(p => ix.push(p[0], p[1]));
  return mkGeo(v, ix, gl.LINES);
})();
const labG = (() => { const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW); const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW); return { vb, ib }; })();

const atlas = makeAtlas(), atlasTex = mkTex(atlas, false, false);
const faceCv = document.createElement('canvas'); faceCv.width = faceCv.height = 16;
{ const x = faceCv.getContext('2d'); x.fillStyle = '#e0ac86'; x.fillRect(0, 0, 16, 16); x.fillStyle = '#4a2f1a'; x.fillRect(0, 0, 16, 3); x.fillStyle = '#fff'; x.fillRect(3, 7, 3, 2); x.fillRect(10, 7, 3, 2); x.fillStyle = '#2a4aa0'; x.fillRect(4, 7, 2, 2); x.fillRect(10, 7, 2, 2); x.fillStyle = '#8a4a3a'; x.fillRect(6, 11, 4, 1); }
const faceTex = mkTex(faceCv, false, false);
const cloudCv = document.createElement('canvas'); cloudCv.width = cloudCv.height = 64;
{ const x = cloudCv.getContext('2d'); x.fillStyle = 'rgba(255,255,255,.9)'; for (let i = 0; i < 26; i++) x.fillRect(Math.random() * 56, Math.random() * 56, 6 + Math.random() * 14, 4 + Math.random() * 8); }
const cloudTex = mkTex(cloudCv, true, false);

const SKYD = [.55, .8, .95], SKYN = [.024, .039, .125];
let sky = SKYD.slice(), tint = [1, .95, .85], sunDir = [0, 1, .25];
function resizeGL() {
  const pr = QS[qLevel].pr; cv.width = Math.max(1, innerWidth * pr | 0); cv.height = Math.max(1, innerHeight * pr | 0);
  cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px'; gl.viewport(0, 0, cv.width, cv.height);
}
addEventListener('resize', resizeGL); addEventListener('orientationchange', () => setTimeout(resizeGL, 200));
const cam = { x: 0, y: 0, z: 0, fov: 75 }, look = { x: 0, y: 0, z: -1 };
const attrs = n => { for (let i = 0; i < 3; i++) i < n ? gl.enableVertexAttribArray(i) : gl.disableVertexAttribArray(i); };
let VP, PROJ, VIEW, planes = [];
function setPlanes() {
  planes = []; const m = VP, row = i => [m[i], m[4 + i], m[8 + i], m[12 + i]];
  const r0 = row(0), r1 = row(1), r2 = row(2), r3 = row(3);
  for (const [a, s] of [[r0, 1], [r0, -1], [r1, 1], [r1, -1], [r2, 1], [r2, -1]]) planes.push([r3[0] + s * a[0], r3[1] + s * a[1], r3[2] + s * a[2], r3[3] + s * a[3]]);
}
function visible(c) {
  const x0 = c.cx * CS, z0 = c.cz * CS, y1 = c.maxY + 1;
  for (const p of planes) { const px = p[0] >= 0 ? x0 + CS : x0, py = p[1] >= 0 ? y1 : 0, pz = p[2] >= 0 ? z0 + CS : z0; if (p[0] * px + p[1] * py + p[2] * pz + p[3] < 0) return false; }
  return true;
}
function drawGeoObj(g, model, sc, col, mode, flash, tex, alpha, uv) {
  gl.uniformMatrix4fv(OP.u('uModel'), false, model); gl.uniform3f(OP.u('uScale'), sc[0], sc[1], sc[2]); gl.uniform3f(OP.u('uColor'), col[0], col[1], col[2]);
  gl.uniform1f(OP.u('uMode'), mode); gl.uniform1f(OP.u('uFlash'), flash || 0); gl.uniform1f(OP.u('uAlpha'), alpha === undefined ? 1 : alpha);
  gl.uniform3f(OP.u('uFog'), mode === 3 ? 1e8 : fogN, mode === 3 ? 2e8 : fogF, 0);
  const u = uv || [1, 1, 0, 0]; gl.uniform4f(OP.u('uUV'), u[0], u[1], u[2], u[3]);
  if (tex) gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.bindBuffer(gl.ARRAY_BUFFER, g.vb); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.ib); gl.drawElements(g.mode, g.n, gl.UNSIGNED_SHORT, 0);
}
function useObj() {
  gl.useProgram(OP.p); attrs(3); gl.uniformMatrix4fv(OP.u('uVP'), false, VP); gl.uniform3f(OP.u('uCam'), cam.x, cam.y, cam.z);
  gl.uniform3f(OP.u('uTint'), tint[0], tint[1], tint[2]); gl.uniform3f(OP.u('uFogC'), sky[0], sky[1], sky[2]); gl.uniform1i(OP.u('uTex'), 0);
}
const SK = [.88, .67, .53], HAIR = [.29, .18, .1], BLACK = [0, 0, 0];
function drawChar(ch, x, y, z, ry) {
  const root = M.mul(M.mul(M.trans(x, y, z), M.rotY(ry + PI)), M.scl(.9)), fl = ch.flash > 0 ? 1 : 0;
  const limb = (px, py, ang, sz, col) => drawGeoObj(boxG, M.mul(M.mul(M.mul(root, M.trans(px, py, 0)), M.rotX(ang)), M.trans(0, -sz[1] / 2, 0)), sz, col, 0, fl);
  const blk = (px, py, pz, sz, col) => drawGeoObj(boxG, M.mul(root, M.trans(px, py, pz)), sz, col, 0, fl);
  limb(0, 1.5, 0, [.5, .75, .25], ch.shirt); limb(-.125, .75, ch.ll, [.25, .75, .25], ch.pants); limb(.125, .75, ch.lr, [.25, .75, .25], ch.pants);
  limb(-.375, 1.5, ch.al, [.25, .75, .25], ch.shirt); limb(.375, 1.5, ch.ar, [.25, .75, .25], ch.shirt);
  blk(0, 1.75, 0, [.5, .5, .5], SK); blk(0, 1.98, 0, [.52, .1, .52], HAIR); blk(0, 1.78, -.2, [.52, .5, .12], HAIR);
  gl.disable(gl.CULL_FACE); drawGeoObj(quadG, M.mul(root, M.trans(0, 1.75, .2515)), [.5, .5, 1], BLACK, 1, fl, faceTex); gl.enable(gl.CULL_FACE);
}
function drawTex(tex, x, y, z, sx, sy) { gl.uniform3f(LP.u('uC'), x, y, z); gl.uniform2f(LP.u('uS'), sx, sy); gl.bindTexture(gl.TEXTURE_2D, tex); gl.bindBuffer(gl.ARRAY_BUFFER, labG.vb); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, labG.ib); gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0); }
function discTex(c1, c2) { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 4, 32, 32, 30); g.addColorStop(0, c1); g.addColorStop(.7, c2); g.addColorStop(1, 'rgba(255,200,100,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return mkTex(c, false, true); }
function solidTex(col) { const c = document.createElement('canvas'); c.width = c.height = 2; const x = c.getContext('2d'); x.fillStyle = col; x.fillRect(0, 0, 2, 2); return mkTex(c, false, false); }
const sunTex = discTex('#fff6c8', '#ffb23c'), moonTex = discTex('#f4f6ff', '#aab4d8'), redTex = solidTex('#e8483a'), darkTex = solidTex('#2a1a10'), labCache = {};
function labTex(t) { if (labCache[t]) return labCache[t]; const lc = document.createElement('canvas'); lc.width = 256; lc.height = 64; const x = lc.getContext('2d'); x.fillStyle = 'rgba(0,0,0,.45)'; x.fillRect(0, 0, 256, 64); x.fillStyle = '#fff'; x.font = '30px monospace'; x.textAlign = 'center'; x.fillText(t, 128, 42); return (labCache[t] = mkTex(lc, false, true)); }
function skyBody(tex, d, size) {
  const l = Math.hypot(d[0], d[1], d[2]); gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.useProgram(LP.p); attrs(1); gl.uniformMatrix4fv(LP.u('uP'), false, PROJ); gl.uniformMatrix4fv(LP.u('uV'), false, VIEW); gl.uniform1i(LP.u('uTex'), 0);
  drawTex(tex, cam.x + d[0] / l * 300, cam.y + d[1] / l * 300, cam.z + d[2] / l * 300, size, size); gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
}
const AN = { pig: { c: [.97, .72, .74], bw: .6, bh: .5, bl: .9, lh: .3, hs: .4, hc: [.99, .78, .8] }, sheep: { c: [.96, .96, .9], bw: .7, bh: .6, bl: .9, lh: .45, hs: .4, hc: [.3, .27, .27] }, wolf: { c: [.58, .58, .63], bw: .45, bh: .5, bl: .9, lh: .45, hs: .38, hc: [.66, .66, .7], eye: 1 }, bear: { c: [.42, .27, .15], bw: .9, bh: .9, bl: 1.3, lh: .5, hs: .55, hc: [.48, .32, .19], eye: 1 }, spider: { c: [.2, .12, .24], bw: .9, bh: .35, bl: .9, lh: .25, hs: .4, hc: [.26, .15, .3], eye: 1 } };
function drawAnimal(e, an) {
  const a = AN[e.type]; if (!a) return; const root = M.mul(M.trans(e.x, e.y, e.z), M.rotY(e.ry + PI)), fl = an.fl > 0 ? 1 : 0, sw = Math.sin(tt * 10 + e.id) * Math.min(1, an.sp / 3) * .8;
  drawGeoObj(boxG, M.mul(root, M.trans(0, a.lh + a.bh / 2, 0)), [a.bw, a.bh, a.bl], a.c, 0, fl);
  const hy = a.lh + a.bh * .75, hz = a.bl / 2 + a.hs * .4; drawGeoObj(boxG, M.mul(root, M.trans(0, hy, hz)), [a.hs, a.hs, a.hs], a.hc, 0, fl);
  if (a.eye) for (const sx of [-1, 1]) drawGeoObj(boxG, M.mul(root, M.trans(sx * a.hs * .25, hy + a.hs * .1, hz + a.hs / 2 + .01)), [.08, .08, .04], [1, .1, .1], 2, 0);
  const lc = a.c.map(v => v * .75);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) drawGeoObj(boxG, M.mul(M.mul(M.mul(root, M.trans(sx * a.bw * .36, a.lh, sz * a.bl * .36)), M.rotX(sx * sz > 0 ? sw : -sw)), M.trans(0, -a.lh / 2, 0)), [.15, a.lh, .15], lc, 0, fl);
}
const FCOL = { R: [[.85, .2, .15], [.3, .1, .1]], B: [[.25, .4, .9], [.1, .12, .35]], P: [[.3, .75, .3], [.1, .3, .12]], T: [[.95, .75, .2], [.4, .25, .1]] }, FNAME = { R: 'Red Soldier', B: 'Blue Soldier', P: 'Ally Soldier', T: 'Trader' }, echars = {};
const echar = e => { const k = e.type === 'trader' ? 'T' : e.f; return echars[k] || (echars[k] = makeChar(FNAME[k] || 'Soldier', FCOL[k] || FCOL.R)); };
function drawEnt(e) {
  const an = anims.get(e.id) || { sp: 0, fl: 0 };
  if (e.type === 'soldier' || e.type === 'trader') { const ch = echar(e); pose(ch, an.sp, tt + e.id, 0); ch.flash = an.fl > 0 ? 1 : 0; drawChar(ch, e.x, e.y, e.z, e.ry); }
  else drawAnimal(e, an);
}
function drawLabel(ch, x, y, z) {
  gl.uniform3f(LP.u('uC'), x, y + 2.2, z); gl.uniform2f(LP.u('uS'), 1, .25); gl.bindTexture(gl.TEXTURE_2D, ch.label);
  gl.bindBuffer(gl.ARRAY_BUFFER, labG.vb); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, labG.ib); gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
}
let selBox = null, cloudOff = 0;
function render() {
  const asp = cv.width / cv.height;
  PROJ = M.persp(cam.fov * PI / 180, asp, .1, 400); VIEW = M.look(cam.x, cam.y, cam.z, cam.x + look.x, cam.y + look.y, cam.z + look.z); VP = M.mul(PROJ, VIEW); setPlanes();
  gl.clearColor(sky[0], sky[1], sky[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.disable(gl.BLEND); gl.depthMask(true); gl.activeTexture(gl.TEXTURE0);
  const vis = []; for (const c of world.chunks.values()) if (c.meshes.length && visible(c)) vis.push(c);
  const terr = (water) => {
    gl.useProgram(TP.p); attrs(3); gl.uniformMatrix4fv(TP.u('uVP'), false, VP); gl.uniform3f(TP.u('uCam'), cam.x, cam.y, cam.z); gl.uniform3f(TP.u('uFog'), fogN, fogF, 0);
    gl.uniform3f(TP.u('uTint'), tint[0], tint[1], tint[2]); gl.uniform3f(TP.u('uFogC'), sky[0], sky[1], sky[2]); gl.uniform1i(TP.u('uTex'), 0);
    gl.uniform1f(TP.u('uCut'), water ? 0 : 1); gl.uniform1f(TP.u('uAlpha'), .65); gl.bindTexture(gl.TEXTURE_2D, atlasTex);
    for (const c of vis) for (const m of c.meshes) {
      if (m.w !== water) continue;
      gl.uniform3f(TP.u('uOff'), c.cx * CS, 0, c.cz * CS); gl.bindBuffer(gl.ARRAY_BUFFER, m.vb);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 12); gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, 24, 20);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib); gl.drawElements(gl.TRIANGLES, m.n, m.t, 0);
    }
  };
  if (sunDir[1] > -.1) skyBody(sunTex, sunDir, 38); if (sunDir[1] < .1) skyBody(moonTex, [-sunDir[0], -sunDir[1], -sunDir[2]], 22);
  terr(false);
  useObj();
  if (me && view) drawChar(me, P.x, P.y, P.z, P.yaw);
  for (const o of others.values()) drawChar(o.ch, o.pos.x, o.pos.y, o.pos.z, o.ry);
  for (const e of entList()) if (Math.hypot(e.x - cam.x, e.z - cam.z) < 70) drawEnt(e);
  for (const p of parts) drawGeoObj(boxG, M.trans(p.x, p.y, p.z), [.13, .13, .13], p.col, 0, 0);
  if (selBox) drawGeoObj(wireG, M.mul(M.trans(selBox[0] + .5, selBox[1] + .5, selBox[2] + .5), M.scl(1)), [1.004, 1.004, 1.004], BLACK, 2, 0);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
  terr(true);
  if (showClouds) { useObj(); gl.disable(gl.CULL_FACE); drawGeoObj(quadG, M.mul(M.trans(P.x, CH + 26, P.z), M.mul(M.rotX(PI / 2), M.scl(900))), [1, 1, 1], BLACK, 3, 0, cloudTex, .75, [5, 5, cloudOff, 0]); gl.enable(gl.CULL_FACE); }
  gl.useProgram(LP.p); attrs(1); gl.uniformMatrix4fv(LP.u('uP'), false, PROJ); gl.uniformMatrix4fv(LP.u('uV'), false, VIEW); gl.uniform1i(LP.u('uTex'), 0);
  for (const o of others.values()) drawLabel(o.ch, o.pos.x, o.pos.y, o.pos.z);
  for (const e of entList()) {
    const d = Math.hypot(e.x - cam.x, e.z - cam.z), mm = MOB[e.type]; if (d > 22 || !mm) continue;
    const big = e.type === 'soldier' || e.type === 'trader';
    if (big) drawTex(echar(e).label, e.x, e.y + 2.2, e.z, 1, .25); else if (d < 14) drawTex(labTex(e.type[0].toUpperCase() + e.type.slice(1)), e.x, e.y + mm.h + .45, e.z, .7, .17);
    if (e.mh && e.hp < e.mh) { const y = e.y + (big ? 2.55 : mm.h + .7), f = Math.max(.02, e.hp / e.mh); drawTex(darkTex, e.x, y, e.z, .5, .06); drawTex(redTex, e.x, y, e.z, .5 * f, .06); }
  }
  gl.depthMask(true); gl.disable(gl.BLEND);
}

function setQ(l) {
  l = Math.max(0, Math.min(3, l)); const Q = QS[l], redo = Q.ao !== meshOpt.ao || Q.fast !== meshOpt.fast;
  qLevel = l; R = Q.R; meshOpt.ao = Q.ao; meshOpt.fast = Q.fast; showClouds = !!Q.cl; resizeGL();
  fogN = R * CS * .5; fogF = R * CS - 6; rescan = true;
  if (world && redo) for (const c of world.chunks.values()) c.dirty = true;
  qLabel();
}
const MODES = ['auto', 'low', 'med', 'high'];
function setMode(m) { qMode = m; lsSet('mc_q', m); if (m !== 'auto') setQ({ low: 0, med: 2, high: 3 }[m]); qLabel(); }

// ---------- ui ----------
function icon(id) {
  const c = document.createElement('canvas'), t = B[id].f[id === 1 ? 0 : 1]; c.width = c.height = 40;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(atlas, (t % 8) * 16, (t >> 3) * 16, 16, 16, 0, 0, 40, 40); return c;
}
function bar() { $('bar').innerHTML = ''; HOT.forEach((id, i) => { const d = document.createElement('div'); if (i === sel) d.className = 'on'; d.appendChild(icon(id)); if (mode === 'survival') { const c = document.createElement('span'); c.className = 'cnt'; c.textContent = S.inv[id] | 0; d.appendChild(c); if (!(S.inv[id] > 0)) d.style.opacity = .5; } d.onclick = () => pick(i); $('bar').appendChild(d); }); }
const pick = i => { sel = (i + 9) % 9; bar(); };
bar();
const PANELS = ['pal', 'shop', 'gmenu'];
const panelOpen = () => PANELS.some(p => $(p).style.display === 'flex');
function hidePanels() { PANELS.forEach(p => { $(p).style.display = 'none'; }); }
function showPanel(id) { hidePanels(); $(id).style.display = 'flex'; if (document.exitPointerLock) document.exitPointerLock(); }
function togglePal() { if ($('pal').style.display === 'flex') return hidePanels(); buildPal(); showPanel('pal'); $('pal').style.flexWrap = 'wrap'; }
const ITEM = { meat: ['\u{1F356}', 'Meat'], bread: ['\u{1F35E}', 'Bread'], potion: ['\u{1F9EA}', 'Potion'] };
function slotEl(id, count) {
  const d = document.createElement('div'); d.className = 'slot'; d.title = B[id] ? B[id].n : id; d.appendChild(icon(+id));
  if (count !== undefined) { const c = document.createElement('span'); c.className = 'cnt'; c.textContent = count; d.appendChild(c); } return d;
}
function buildPal() {
  const el = $('pal'); el.innerHTML = '';
  if (mode === 'survival') {
    const h = document.createElement('div'); h.style.cssText = 'width:100%;font-size:14px;margin-bottom:4px'; h.innerHTML = '<b>Backpack</b> \u2014 tap a block to put it in the selected hotbar slot. &#129689; ' + S.coins + ' &nbsp; ' + Object.keys(ITEM).map(k => ITEM[k][0] + ' ' + (S.inv[k] | 0)).join(' &nbsp; '); el.appendChild(h);
    Object.keys(S.inv).filter(k => +k == k && S.inv[k] > 0 && B[k]).forEach(k => { const d = slotEl(+k, S.inv[k]); d.onclick = () => { HOT[sel] = +k; bar(); }; el.appendChild(d); });
  } else Object.keys(B).forEach(id => { const d = slotEl(+id); d.onclick = () => { HOT[sel] = +id; bar(); }; el.appendChild(d); });
}
const others = new Map();
function css(c) { return 'rgb(' + c.map(v => v * 255 | 0).join(',') + ')'; }
const hud = () => {
  $('hp').textContent = '\u2764 ' + hp + (mode === 'survival' ? '   \u{1FA99} ' + S.coins + '   \u2694' + S.weapon + ' \u{1F6E1}' + S.armor + '   \u{1F356}' + (S.inv.meat | 0) : '   kills ' + kills);
  $('hpfill').style.width = Math.max(0, hp / 20 * 100) + '%';
  let h = '<i style="background:#ffd27a"></i>' + name.replace(/[<>&"]/g, '') + ' \u2764' + hp;
  for (const o of others.values()) h += '<br><i style="background:' + css(o.ch.shirt) + '"></i>' + o.name.replace(/[<>&"]/g, '') + ' \u2764' + (o.hp ?? 20);
  $('plist').innerHTML = h; if (mode === 'survival' && $('bar').children.length) bar();
};
function buildMenu() {
  const el = $('gmenu');
  el.innerHTML = '<h3>Menu</h3><div style="font-size:13px;margin-bottom:6px">Mode: <b>' + mode + '</b> &nbsp; Room: <b>' + (offline ? 'offline save' : roomCode) + '</b> &nbsp; Name: <b>' + name.replace(/[<>&"]/g, '') + '</b></div><button id="gsave">\u{1F4BE} Save now</button><button id="gq"></button><button id="gleave">Leave to main menu</button><button id="gclose">Close</button>';
  $('gsave').onclick = () => manualSave(); $('gq').onclick = () => { setMode(MODES[(MODES.indexOf(qMode) + 1) % 4]); };
  $('gleave').onclick = () => { if (offline && started) saveSolo(); location.reload(); }; $('gclose').onclick = hidePanels; qLabel();
}
function qLabel() { const b = $('gq'); if (b) b.textContent = 'Graphics quality: ' + qMode + (qMode === 'auto' ? ' (' + ['low', 'medium', 'high', 'ultra'][qLevel] + ')' : ''); }
function manualSave() { if (offline) say(saveSolo() ? 'Saved \u2713 (this device)' : 'Could not save (storage full?)'); else if (mode === 'survival' || roomCode !== 'PUBLIC') { pushState(); tx({ t: 'save' }); } else say('Public world autosaves'); }
function say(t) { $('msg').style.display = 'block'; $('msg').textContent = t; clearTimeout(say.t); say.t = setTimeout(() => $('msg').style.display = 'none', 4000); }
const net = (t, c) => { $('net').textContent = '\u25CF ' + t; $('net').style.color = c; };

// ---------- chunk meshes ----------
function drop(c) { for (const m of c.meshes) { gl.deleteBuffer(m.vb); gl.deleteBuffer(m.ib); } c.meshes = []; }
function remesh(c) {
  drop(c);
  buildMesh(world, c, meshOpt).forEach((o, k) => {
    if (!o.i.length) return;
    const nv = o.p.length / 3, big = nv > 65535; if (big && !u32) return;
    const buf = new ArrayBuffer(nv * 24), f = new Float32Array(buf), u = new Uint8Array(buf);
    for (let i = 0; i < nv; i++) { const a = i * 6, b3 = i * 3, b = i * 24; f[a] = o.p[b3]; f[a + 1] = o.p[b3 + 1]; f[a + 2] = o.p[b3 + 2]; f[a + 3] = o.u[i * 2]; f[a + 4] = o.u[i * 2 + 1]; u[b + 20] = o.c[b3]; u[b + 21] = o.c[b3 + 1]; u[b + 22] = o.c[b3 + 2]; u[b + 23] = 255; }
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, buf, gl.STATIC_DRAW);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, big ? new Uint32Array(o.i) : new Uint16Array(o.i), gl.STATIC_DRAW);
    c.meshes.push({ vb, ib, n: o.i.length, t: big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, w: k === 1 });
  });
  c.dirty = false;
}
let need = [], lpx = 1e9, lpz = 1e9;
function work(budget) {
  const t0 = performance.now(), pcx = Math.floor(P.x / CS), pcz = Math.floor(P.z / CS);
  if (pcx !== lpx || pcz !== lpz || rescan) {
    lpx = pcx; lpz = pcz; rescan = false; need = [];
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) if (dx * dx + dz * dz <= R * R && !world.chunks.has(ck(pcx + dx, pcz + dz))) need.push([dx * dx + dz * dz, pcx + dx, pcz + dz]);
    need.sort((a, b) => a[0] - b[0]);
    for (const [k, c] of world.chunks) if (Math.hypot(c.cx - pcx, c.cz - pcz) > R + 2) { drop(c); world.chunks.delete(k); }
  }
  const ds = []; for (const c of world.chunks.values()) if (c.dirty) ds.push(c);
  if (ds.length) { ds.sort((a, b) => Math.hypot(a.cx - pcx, a.cz - pcz) - Math.hypot(b.cx - pcx, b.cz - pcz)); for (const c of ds) { remesh(c); if (performance.now() - t0 > budget) return; } }
  while (need.length) {
    const [, cx, cz] = need.shift(); if (world.chunks.has(ck(cx, cz))) continue;
    world.gen(cx, cz); tx({ t: 'chunk', cx, cz });
    const om = oe.get(cx + ',' + cz); if (om) for (const [k, id] of om) { const [x, y, z] = k.split(',').map(Number); world.set(x, y, z, id); }
    if (performance.now() - t0 > budget) break;
  }
}

// ---------- characters ----------
function hsl(h, s, l) { const a = s * Math.min(l, 1 - l), f = n => { const k = (n + h * 12) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return [f(0), f(8), f(4)]; }
function makeChar(nm, cols) {
  let hs = 0; for (const c of nm) hs = (hs * 31 + c.charCodeAt(0)) % 360;
  const lc = document.createElement('canvas'); lc.width = 256; lc.height = 64; const t = lc.getContext('2d');
  t.fillStyle = 'rgba(0,0,0,.45)'; t.fillRect(0, 0, 256, 64); t.fillStyle = '#fff'; t.font = '30px monospace'; t.textAlign = 'center'; t.fillText(nm, 128, 42);
  return { shirt: cols ? cols[0] : hsl(hs / 360, .6, .5), pants: cols ? cols[1] : hsl(((hs + 180) % 360) / 360, .5, .3), label: mkTex(lc, false, true), swingT: 0, flash: 0, ll: 0, lr: 0, al: 0, ar: 0 };
}
function pose(ch, speed, t, dt) {
  const s = Math.sin(t * 9) * Math.min(1, speed / 4) * .9;
  ch.ll = s; ch.lr = -s; ch.al = -s; ch.ar = s;
  if (ch.swingT > 0) { ch.swingT -= dt; ch.ar = -1.9 * Math.sin(PI * (1 - Math.max(0, ch.swingT) / .3)); }
  if (ch.flash > 0) ch.flash -= dt;
}
function addPlayer(p) {
  if (others.has(p.id)) return; const ch = makeChar(p.name), x = p.x ?? 0, y = p.y ?? 90, z = p.z ?? 0;
  others.set(p.id, { ch, name: p.name, hp: p.hp ?? 20, pos: { x, y, z }, t: { x, y, z }, ry: p.ry || 0, last: { x, z }, sp: 0 }); hud();
}
function removePlayer(id) { const o = others.get(id); if (o) { gl.deleteTexture(o.ch.label); others.delete(id); hud(); } }
function clearOthers() { for (const id of [...others.keys()]) removePlayer(id); }

// ---------- network ----------
let ws = null, online = false, retry = 0, lastRx = 0, worldReset = false;
const oe = new Map();
const URL_WS = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
function tx(o) { try { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); } catch { } }
function connect() {
  clearTimeout(connect.t); if (ws) return;
  let sock; net('Connecting...', '#fc6');
  try { sock = new WebSocket(URL_WS); } catch { return later(); }
  ws = sock;
  sock.onopen = () => { if (ws !== sock) return; lastRx = performance.now(); sock.send(JSON.stringify({ t: 'join', name, room: roomCode, mode })); };
  sock.onmessage = e => { if (ws !== sock) return; lastRx = performance.now(); let m; try { m = JSON.parse(e.data); } catch { return; } try { onMsg(m); } catch (err) { console.error(err); } };
  const bad = () => { if (ws !== sock) return; ws = null; online = false; net(started ? 'Offline (edits not shared)' : 'Server waking up...', '#f66'); later(); };
  sock.onclose = bad; sock.onerror = bad;
}
function later() { retry++; clearTimeout(connect.t); connect.t = setTimeout(connect, Math.min(8000, 1000 * 2 ** Math.min(retry, 3))); }
setInterval(() => { if (online) { tx({ t: 'ping' }); if (performance.now() - lastRx > 40000 && ws) try { ws.close(); } catch { } } }, 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && !ws) { retry = 0; connect(); } });
addEventListener('online', () => { if (!ws) { retry = 0; connect(); } });
function resetWorld(seed) { oe.clear(); if (world) for (const c of world.chunks.values()) drop(c); world = new World(seed); rescan = true; need = []; worldReset = true; }
function spawn() {
  if (mode === 'survival') { const sp = world.startPos(); if (sp) { P.x = sp.x; P.y = sp.y + 1; P.z = sp.z; P.vy = P.kx = P.kz = 0; return; } }
  for (let r = 0; r < 800; r += 12) for (let a = 0; a < 6.3; a += .8) {
    const x = Math.floor(Math.cos(a + Math.random()) * r + (Math.random() * 20 - 10)), z = Math.floor(Math.sin(a) * r), { h } = world.column(x, z);
    if (h > SEA + 1) { P.x = x + .5; P.z = z + .5; P.y = h + 2; P.vy = P.kx = P.kz = 0; return; }
  }
  P.y = 90; P.vy = 0;
}
const STARTHOT = [8, 45, 2, 14, 5, 3, 1, 4, 26];
function rewardMsg(c, m, inc) { S.coins += c; S.inv.meat = (S.inv.meat | 0) + m; if (c || m) say('+' + c + ' coins' + (m ? ' +' + m + ' meat' : '') + (inc ? ' (camp income)' : '')); hud(); pushSoon(); }
function makeSim() {
  sim = new Sim(world, {
    hurtPlayer: (pid, dmg, src) => { const d = Math.max(1, Math.round(dmg * (1 - .2 * S.armor))); hp -= d; flashHurt(); if (hp <= 0) { say('Killed by ' + src + ' - lost half your coins'); S.coins >>= 1; hp = 20; spawn(); } hud(); },
    reward: (pid, r) => rewardMsg(r.coins || 0, r.meat || 0, false),
    setBlock: (x, y, z, id) => edit(x, y, z, id),
    camp: (id, o) => { campOwn[id] = o; say(({ R: 'Red Clan', B: 'Blue Clan', P: 'You', N: 'Neutral' })[o] + ' captured a camp'); },
    income: c => rewardMsg(c, 0, true), msg: say,
  }); sim.owners = campOwn;
}
function saveSolo() {
  try {
    const edits = {}; for (const [k, m] of oe) edits[k] = [...m].map(([c, id]) => { const [x, y, z] = c.split(',').map(Number); return [x, y, z, id]; });
    localStorage.setItem('mc_solo', JSON.stringify({ v: 1, seed: world.seed, S, camps: campOwn, pos: { x: P.x, y: P.y, z: P.z }, hot: HOT, edits })); return true;
  } catch { return false; }
}
function pushState() { if (online && mode === 'survival') tx({ t: 'state', s: { coins: S.coins, inv: S.inv, weapon: S.weapon, armor: S.armor, x: P.x, y: P.y, z: P.z } }); }
let pT = 0; function pushSoon() { clearTimeout(pT); pT = setTimeout(pushState, 2000); }
function startSolo() {
  offline = true; roomCode = 'SOLO'; let sv = null; try { sv = JSON.parse(lsGet('mc_solo') || 'null'); } catch { }
  resetWorld(sv ? sv.seed : Math.floor(Math.random() * 1e9)); S = sv && sv.S ? sv.S : newS(); campOwn = sv && sv.camps ? sv.camps : {};
  if (sv && sv.hot) for (let i = 0; i < 9; i++) HOT[i] = (sv.hot[i] | 0) || HOT[i]; else STARTHOT.forEach((v, i) => { HOT[i] = v; });
  if (sv && sv.edits) for (const k in sv.edits) { const m = new Map(); for (const [x, y, z, id] of sv.edits[k]) m.set(x + ',' + y + ',' + z, id); oe.set(k, m); }
  makeSim(); startGame(); if (sv && sv.pos) { P.x = sv.pos.x; P.y = sv.pos.y + .5; P.z = sv.pos.z; }
  net('Offline single player', '#fc6'); say(sv ? 'Welcome back!' : 'Survive! Your camp (banner) has a trader.');
}
function startGame() { me = makeChar(name); spawn(); started = true; hud(); frame(); }
function startOffline() { if (started) return; mode = 'creative'; roomCode = 'PUBLIC'; resetWorld(Math.floor(Math.random() * 1e9)); startGame(); net('Offline (edits not shared)', '#f66'); }
function onMsg(m) {
  switch (m.t) {
    case 'init': {
      online = true; retry = 0; myId = m.id; hp = m.hp || 20; mode = m.mode || 'creative'; roomCode = m.room || 'PUBLIC'; campOwn = m.camps || {};
      const same = world && world.seed === m.seed;
      if (!same) { resetWorld(m.seed); if (mode === 'survival') { const sv = m.saved; S = sv ? { coins: sv.coins | 0, inv: sv.inv || {}, weapon: sv.weapon | 0, armor: sv.armor | 0 } : newS(); if (!sv) STARTHOT.forEach((v, i) => { HOT[i] = v; }); } }
      clearOthers(); (m.players || []).forEach(addPlayer);
      if (!started) startGame(); else if (!same) spawn(); else for (const c of world.chunks.values()) tx({ t: 'chunk', cx: c.cx, cz: c.cz });
      if (!same && mode === 'survival' && m.saved && (m.saved.x || m.saved.z)) { P.x = m.saved.x; P.y = m.saved.y + .5; P.z = m.saved.z; }
      buildMenu(); net('Online \u2022 ' + roomCode, '#6f6'); hud(); if (!same && worldReset) say(mode === 'survival' ? 'Co-op survival: stick together!' : 'Joined the world'); worldReset = false; break;
    }
    case 'join': addPlayer(m); say(m.name + ' joined'); break;
    case 'leave': removePlayer(m.id); break;
    case 'pos': { const o = others.get(m.id); if (o) { o.t.x = m.x; o.t.y = m.y; o.t.z = m.z; o.ry = m.ry; } break; }
    case 'swing': { const o = others.get(m.id); if (o) o.ch.swingT = .3; break; }
    case 'set': if (world) { if (m.id === 0 && Math.hypot(m.x - P.x, m.z - P.z) < 24) puff(m.x, m.y, m.z, world.get(m.x, m.y, m.z)); world.set(m.x, m.y, m.z, m.id); } break;
    case 'chunk': if (world) for (const [x, y, z, id] of m.e) world.set(x, y, z, id); break;
    case 'hp': if (m.id === myId) { if (m.hp < hp) flashHurt(); hp = m.hp; hud(); } else { const o = others.get(m.id); if (o) { o.ch.flash = .25; o.hp = m.hp; hud(); } } break;
    case 'kb': P.kx = m.x * 9; P.kz = m.z * 9; P.vy = 6.5; break;
    case 'dead': say(m.byName + ' eliminated ' + m.name); break;
    case 'respawn': hp = 20; if (mode === 'survival') { S.coins >>= 1; say('You died and lost half your coins'); } spawn(); hud(); break;
    case 'kill': kills++; hud(); break;
    case 'e': {
      const seen = new Set();
      for (const a of m.l) { const id = a[0]; seen.add(id); let e = netEnts.get(id); if (!e) { e = { id, type: TYPES[a[1]], x: a[2], y: a[3], z: a[4] }; netEnts.set(id, e); } e.tx = a[2]; e.ty = a[3]; e.tz = a[4]; e.ry = a[5]; e.hp = a[6]; e.f = FACS[a[7]]; e.mh = a[8]; }
      for (const id of [...netEnts.keys()]) if (!seen.has(id)) { netEnts.delete(id); anims.delete(id); } break;
    }
    case 'rw': rewardMsg(m.c | 0, m.m | 0, !!m.inc); break;
    case 'camp': campOwn[m.id] = m.o; say(({ R: 'Red Clan', B: 'Blue Clan', P: 'Your team', N: 'Neutral' })[m.o] + ' captured a camp'); break;
    case 'msg': say(m.s); break;
    case 'saved': say(m.ok ? 'Saved \u2713 on server' : 'Server could not save'); break;
    case 'err': say(m.s); break;
  }
}
function flashHurt() { $('hurt').style.opacity = .35; setTimeout(() => $('hurt').style.opacity = 0, 150); }
function start() {
  $('menu').style.display = 'none'; mode = cfg.mode; roomCode = cfg.code; buildMenu(); setQ(qLevel);
  if (cfg.kind === 'solo') return startSolo();
  net('Connecting...', '#fc6'); connect(); if (cfg.kind === 'public') setTimeout(startOffline, 5000);
}

// ---------- player ----------
const P = { x: 0, y: 90, z: 0, vx: 0, vy: 0, vz: 0, kx: 0, kz: 0, jx: 0, jy: 0, yaw: 0, pitch: 0, fly: false, ground: false, speed: 0 }, keys = {};
function hits(px, py, pz) {
  for (let x = Math.floor(px - .3), x1 = Math.floor(px + .3); x <= x1; x++) for (let y = Math.floor(py), y1 = Math.floor(py + 1.79); y <= y1; y++) for (let z = Math.floor(pz - .3), z1 = Math.floor(pz + .3); z <= z1; z++) if (solid(world.get(x, y, z))) return true;
  return false;
}
function hurtLocal(d) { if (online) return tx({ t: 'fall', d }); hp -= d; flashHurt(); if (hp <= 0) { hp = 20; spawn(); } hud(); }
function physics(dt) {
  if (!world.chunk(P.x, P.z)) return;
  const water = world.get(Math.floor(P.x), Math.floor(P.y + .6), Math.floor(P.z)) === 7, wasG = P.ground;
  const run = keys.ShiftLeft || (touch && Math.hypot(P.jx, P.jy) > .95), sp = (run && !P.fly ? 6.5 : 4.5) * (P.fly ? 2 : water ? .6 : 1);
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
  let mx = P.jx * rx - P.jy * fx, mz = P.jx * rz - P.jy * fz;
  if (keys.KeyW) { mx += fx; mz += fz; } if (keys.KeyS) { mx -= fx; mz -= fz; } if (keys.KeyD) { mx += rx; mz += rz; } if (keys.KeyA) { mx -= rx; mz -= rz; }
  const l = Math.max(1, Math.hypot(mx, mz)), mv = mx || mz; P.vx = mx / l * sp + P.kx; P.vz = mz / l * sp + P.kz;
  const dec = Math.pow(.01, dt); P.kx *= dec; P.kz *= dec;
  if (P.fly) P.vy = keys.Space ? sp : keys.ShiftLeft ? -sp : 0;
  else if (water) { P.vy = Math.max(P.vy - 9 * dt, -3); if (keys.Space) P.vy = 3.5; }
  else { P.vy = Math.max(P.vy - 28 * dt, -40); if (keys.Space && wasG) P.vy = 8.5; }
  P.ground = false; let impact = 0;
  for (let i = 0; i < 3; i++) {
    const s = dt / 3, nx = P.x + P.vx * s, nz = P.z + P.vz * s;
    if (!hits(nx, P.y, P.z)) P.x = nx; else if (touch && wasG && mv && !hits(nx, P.y + 1.05, P.z)) P.vy = 8.5;
    if (!hits(P.x, P.y, nz)) P.z = nz; else if (touch && wasG && mv && !hits(P.x, P.y + 1.05, nz)) P.vy = 8.5;
    const dy = P.vy * s;
    if (hits(P.x, P.y + dy, P.z)) { if (dy < 0) { P.ground = true; if (P.vy < -14 && !P.fly && !water) impact = -P.vy; } P.vy = 0; } else P.y += dy;
  }
  if (impact) { const d = Math.floor((impact - 13) / 2.2); if (d > 0) hurtLocal(Math.min(d, 10)); }
  P.speed = P.fly ? 0 : Math.hypot(mx / l * sp, mz / l * sp) * (P.ground || water ? 1 : .5);
  if (P.y < -30) spawn();
}

// ---------- targeting & actions ----------
function castBlocks(ox, oy, oz, dx, dy, dz, max) {
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz), px = x, py = y, pz = z, t = 0;
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1, tdx = dx ? Math.abs(1 / dx) : 1e9, tdy = dy ? Math.abs(1 / dy) : 1e9, tdz = dz ? Math.abs(1 / dz) : 1e9;
  let tmx = dx ? (dx > 0 ? x + 1 - ox : ox - x) * tdx : 1e9, tmy = dy ? (dy > 0 ? y + 1 - oy : oy - y) * tdy : 1e9, tmz = dz ? (dz > 0 ? z + 1 - oz : oz - z) * tdz : 1e9;
  for (let i = 0; i < 80; i++) {
    if (i > 0) { const b2 = world.get(x, y, z); if (b2 > 0 && b2 !== 7) return { hit: [x, y, z], prev: [px, py, pz], t }; }
    px = x; py = y; pz = z;
    if (tmx < tmy && tmx < tmz) { t = tmx; tmx += tdx; x += sx; } else if (tmy < tmz) { t = tmy; tmy += tdy; y += sy; } else { t = tmz; tmz += tdz; z += sz; }
    if (t > max) break;
  }
  return null;
}
const entList = () => sim ? sim.ents.values() : netEnts.values();
const findEnt = id => sim ? sim.ents.get(id) : netEnts.get(id);
function ray() {
  const reach = view ? D + 5 : 6, r = castBlocks(cam.x, cam.y, cam.z, look.x, look.y, look.z, reach);
  let tb = r ? r.t : reach, best = 0, bent = 0;
  for (const [id, p] of others) {
    const c = p.pos, vx = c.x - cam.x, vy = c.y + .9 - cam.y, vz = c.z - cam.z, t = vx * look.x + vy * look.y + vz * look.z;
    if (t > 0 && t < tb && vx * vx + vy * vy + vz * vz - t * t < .36 && Math.hypot(c.x - P.x, c.y - P.y, c.z - P.z) < 5) { tb = t; best = id; }
  }
  for (const e of entList()) {
    if (e.type === 'trader') continue;
    const mm = MOB[e.type], vx = e.x - cam.x, vy = e.y + mm.h / 2 - cam.y, vz = e.z - cam.z, t = vx * look.x + vy * look.y + vz * look.z, rr = mm.r + .35;
    if (t > 0 && t < tb && vx * vx + vy * vy + vz * vz - t * t < rr * rr && Math.hypot(e.x - P.x, e.y - P.y, e.z - P.z) < 6) { tb = t; bent = e.id; best = 0; }
  }
  return bent ? { ent: bent } : best ? { pl: best } : r;
}
function edit(x, y, z, id) {
  if (!online) { const k = (x >> 4) + ',' + (z >> 4); let m = oe.get(k); if (!m) oe.set(k, m = new Map()); m.set(x + ',' + y + ',' + z, id); }
  world.set(x, y, z, id); tx({ t: 'set', x, y, z, id });
}
let lastAct = -9, tt = 0, hold = null, terrT = 0;
const dropFor = id => id === 1 ? 2 : id === 3 ? 14 : (id === 6 || id === 21 || id === 40 || id === 11 || id === 7) ? null : id;
const addInv = (k, n) => { S.inv[k] = (S.inv[k] | 0) + n; pushSoon(); bar(); };
function puff(x, y, z, id) {
  if (!B[id] || parts.length > 80) return; const hx = AT[B[id].f[1]][0], col = [(hx >> 16 & 255) / 255, (hx >> 8 & 255) / 255, (hx & 255) / 255];
  for (let i = 0; i < 7; i++) parts.push({ x: x + .5, y: y + .5, z: z + .5, vx: Math.random() * 3 - 1.5, vy: Math.random() * 3 + 1, vz: Math.random() * 3 - 1.5, life: .7, col });
}
function act(btn) {
  if (!started || panelOpen() || (!touch && !document.pointerLockElement)) return;
  const r = ray(); if (tt - lastAct < (btn === 0 && r && (r.pl || r.ent) ? .32 : .18)) return; lastAct = tt;
  if (btn === 0) {
    me.swingT = .3; tx({ t: 'swing' });
    if (r && r.ent) { const e = findEnt(r.ent); if (e) { if (sim) { const dx = e.x - P.x, dz = e.z - P.z, l = Math.hypot(dx, dz) || 1; sim.damage(e.id, WDMG[S.weapon] || 3, 0, dx / l, dz / l); } else tx({ t: 'hitm', id: r.ent }); } }
    else if (r && r.pl) tx({ t: 'hit', id: r.pl });
    else if (r && r.hit) { const [x, y, z] = r.hit, id = world.get(x, y, z); if (id !== 11) { puff(x, y, z, id); if (mode === 'survival') { const d = dropFor(id); if (d) addInv(d, 1); } edit(x, y, z, 0); } }
  } else if (r && r.prev && !r.pl && !r.ent) {
    const [x, y, z] = r.prev, id = HOT[sel], ov = P.x + .3 > x && P.x - .3 < x + 1 && P.y + 1.8 > y && P.y < y + 1 && P.z + .3 > z && P.z - .3 < z + 1;
    if ((ov && id < 40) || y >= CH - 1 || world.get(x, y, z) >= 41) return;
    if (mode === 'survival') { if ((S.inv[id] | 0) <= 0) { say('None left of that block'); return; } S.inv[id]--; bar(); pushSoon(); }
    edit(x, y, z, id);
  }
}
const nearTrader = () => { for (const e of entList()) if (e.type === 'trader' && Math.hypot(e.x - P.x, e.z - P.z) < 8) return true; return false; };
function useAction() { if (mode === 'survival' && nearTrader()) openShop(); else eat(); }
function eat() {
  if (mode !== 'survival') return say('Nothing to eat in creative');
  if (hp >= 20) return say('Health is full');
  const k = (S.inv.potion | 0) > 0 ? 'potion' : (S.inv.bread | 0) > 0 ? 'bread' : (S.inv.meat | 0) > 0 ? 'meat' : null; if (!k) return say('No food. Hunt pigs and sheep or buy bread.');
  const n = { potion: 20, bread: 6, meat: 3 }[k]; S.inv[k]--; if (online) tx({ t: 'heal', n }); else hp = Math.min(20, hp + n); pushSoon(); hud();
}
// Economy: the trader buys RAW resources only (ores, logs, cobble, meat) and sells gear, food and building supplies.
// Nothing the trader sells can be sold back, so there is no buy-low/sell-high loop.
const SELL = { 14: 1, 5: 2, 19: 2, 20: 2, 22: 1, 23: 1, 15: 4, 16: 10, 17: 20, 18: 50, meat: 2 };
const LOGS = [5, 19, 20];
const BUY = [['Wood sword (dmg 5)', 25, 'weapon', 1], ['Iron sword (dmg 8)', 100, 'weapon', 2], ['Diamond sword (dmg 12)', 400, 'weapon', 3], ['Leather armor (-20% damage)', 40, 'armor', 1], ['Iron armor (-40%)', 150, 'armor', 2], ['Diamond armor (-60%)', 500, 'armor', 3], ['Bread x3 (heals 6 each)', 9, 'bread', 3], ['Healing potion (heals 20)', 30, 'potion', 1], ['Torches x8', 8, 45, 8], ['Glass x8', 12, 26, 8], ['Bricks x8', 16, 9, 8], ['Lamps x4', 16, 10, 4], ['Crates x2', 10, 35, 2]];
function openShop() { if (mode !== 'survival') return say('Shops are in survival mode'); if (!nearTrader()) return say('Walk to a trader at a camp (look for banners)'); buildShop(); showPanel('shop'); }
function buildShop() {
  const el = $('shop'); el.innerHTML = '<h3>\u{1F9D4} Trader \u2014 \u{1FA99} ' + S.coins + '</h3><div style="font-size:12px;margin-bottom:6px">I buy raw resources (ores, logs, cobble, meat) and sell gear, food and building supplies. Earn coins by selling, hunting dangerous animals and holding camps.</div><div class="cols"><div><h4>Sell resources</h4><div id="sell"></div></div><div><h4>Buy</h4><div id="buy"></div></div><div><h4>Sawmill (free)</h4><div id="craft"></div></div></div><button id="shopx">Close</button>';
  $('shopx').onclick = hidePanels; let any = false;
  for (const k of Object.keys(S.inv)) { const n = S.inv[k] | 0, p = SELL[k]; if (!(n > 0 && p)) continue; any = true; const bt = document.createElement('button'); bt.textContent = 'Sell ' + (B[k] ? B[k].n : ITEM[k][1]) + ' x' + n + ' @' + p + ' = +' + n * p; bt.onclick = () => { S.coins += n * p; S.inv[k] = 0; pushSoon(); hud(); buildShop(); }; $('sell').appendChild(bt); }
  if (!any) $('sell').textContent = 'Nothing sellable yet. Mine ores, logs and stone, or hunt.';
  const lg = LOGS.reduce((a, k) => a + (S.inv[k] | 0), 0);
  if (lg > 0) { const bt = document.createElement('button'); bt.textContent = 'Saw ' + lg + ' logs into ' + lg * 4 + ' planks'; bt.onclick = () => { LOGS.forEach(k => { S.inv[k] = 0; }); S.inv[8] = (S.inv[8] | 0) + lg * 4; pushSoon(); hud(); buildShop(); }; $('craft').appendChild(bt); } else $('craft').textContent = 'Bring logs to turn into planks.';
  for (const [nm, cost, kind, v] of BUY) {
    const bt = document.createElement('button'), have = (kind === 'weapon' && S.weapon >= v) || (kind === 'armor' && S.armor >= v);
    bt.textContent = nm + '  \u{1FA99}' + cost + (have ? ' (owned)' : ''); if (have || S.coins < cost) bt.className = 'no';
    bt.onclick = () => { if (have) return; if (S.coins < cost) return say('Not enough coins'); S.coins -= cost; if (kind === 'weapon') S.weapon = v; else if (kind === 'armor') S.armor = v; else S.inv[kind] = (S.inv[kind] | 0) + v; pushSoon(); hud(); buildShop(); }; $('buy').appendChild(bt);
  }
}
function terrCheck() {
  if (mode !== 'survival') { $('terr').textContent = ''; return; } let best = null, bd = 28; const rx = Math.floor(P.x / RS), rz = Math.floor(P.z / RS);
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const ci = world.campInfo(rx + dx, rz + dz); if (ci) { const d = Math.hypot(ci.x - P.x, ci.z - P.z); if (d < bd) { bd = d; best = ci; } } }
  $('terr').textContent = best ? 'Territory: ' + ({ R: 'Red Clan', B: 'Blue Clan', P: 'Your camp', N: 'Neutral camp' })[campOwn[best.id] || best.owner0] : '';
}

// ---------- input ----------
cv.addEventListener('click', () => { if (!touch && !document.pointerLockElement && cv.requestPointerLock) cv.requestPointerLock(); });
addEventListener('mousemove', e => { if (document.pointerLockElement) { P.yaw -= e.movementX * .0025; P.pitch = Math.max(-1.5, Math.min(1.5, P.pitch - e.movementY * .0025)); } });
addEventListener('keydown', e => { keys[e.code] = true; if (e.code === 'KeyF') P.fly = !P.fly; if (e.code === 'KeyV') view ^= 1; if (e.code === 'KeyE') togglePal(); if (e.code === 'KeyT') openShop(); if (e.code === 'KeyQ') eat(); if (e.code === 'KeyM') { buildMenu(); showPanel('gmenu'); } if (/^Digit[1-9]$/.test(e.code)) pick(+e.code.slice(5) - 1); });
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; hold = null; });
addEventListener('wheel', e => pick(sel + Math.sign(e.deltaY)));
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('mousedown', e => { hold = e.button === 2 ? 2 : 0; act(hold); });
addEventListener('mouseup', () => { hold = null; });
if (touch) {
  let jid = null, lid = null, jo, lp;
  const joy = $('joy'), knob = $('knob');
  addEventListener('touchstart', e => { for (const t of e.changedTouches) { if (t.target.closest && t.target.closest('button,.panel,#bar,#card')) continue; if (t.clientX < innerWidth * .45 && jid === null) { jid = t.identifier; jo = [t.clientX, t.clientY]; joy.style.left = t.clientX + 'px'; joy.style.top = t.clientY + 'px'; joy.style.display = 'block'; } else if (lid === null) { lid = t.identifier; lp = [t.clientX, t.clientY]; } } }, { passive: true });
  addEventListener('touchmove', e => {
    for (const t of e.changedTouches) {
      if (t.identifier === jid) { P.jx = Math.max(-1, Math.min(1, (t.clientX - jo[0]) / 50)); P.jy = Math.max(-1, Math.min(1, (t.clientY - jo[1]) / 50)); knob.style.left = 30 + P.jx * 30 + 'px'; knob.style.top = 30 + P.jy * 30 + 'px'; }
      else if (t.identifier === lid) { P.yaw -= (t.clientX - lp[0]) * .006; P.pitch = Math.max(-1.5, Math.min(1.5, P.pitch - (t.clientY - lp[1]) * .006)); lp = [t.clientX, t.clientY]; }
    }
  }, { passive: true });
  const end = e => { for (const t of e.changedTouches) { if (t.identifier === jid) { jid = null; P.jx = P.jy = 0; joy.style.display = 'none'; knob.style.left = knob.style.top = '30px'; } if (t.identifier === lid) lid = null; } };
  addEventListener('touchend', end); addEventListener('touchcancel', end);
  const hb = (id, f, up) => { const b2 = $(id); b2.addEventListener('touchstart', e => { e.preventDefault(); f(); }, { passive: false }); b2.addEventListener('touchend', e => { e.preventDefault(); if (up) up(); }, { passive: false }); };
  hb('bj', () => { keys.Space = true; }, () => { keys.Space = false; });
  hb('ba', () => { hold = 0; act(0); }, () => { hold = null; });
  hb('bp', () => { hold = 2; act(2); }, () => { hold = null; });
  hb('bu', useAction); hb('bv', () => { view ^= 1; }); hb('be', togglePal); hb('bs', openShop); hb('bm', () => { buildMenu(); showPanel('gmenu'); });
}

// ---------- main loop ----------
let last = performance.now(), sendT = 0, sentKey = '', posT = 0, skyT = 0, fpsT = 0, fpsN = 0, good = 0, lastDown = -99, warm = 2, errs = 0, regenT = 0, looping = false;
function frame() {
  if (!looping) looping = true; else if (frame.busy) { }
  requestAnimationFrame(frame);
  const now = performance.now(), raw = (now - last) / 1000; last = now;
  if (raw > .5) return;
  const dt = Math.min(.05, raw); tt += dt;
  try {
    work(QS[qLevel].b); physics(dt);
    if (sim) { simAcc += dt; while (simAcc >= .1) { simAcc -= .1; sim.tick(.1, [{ id: 0, x: P.x, y: P.y, z: P.z }]); } }
    look.x = -Math.sin(P.yaw) * Math.cos(P.pitch); look.y = Math.sin(P.pitch); look.z = -Math.cos(P.yaw) * Math.cos(P.pitch);
    const hx = P.x, hy = P.y + 1.6, hz = P.z;
    if (view) {
      const rx = Math.cos(P.yaw) * .7, rz = -Math.sin(P.yaw) * .7; let k = 1;
      for (let q = .04; q <= 1; q += .04) { const cx = hx + rx * q - look.x * D * q, cy = hy + .25 * q - look.y * D * q, cz = hz + rz * q - look.z * D * q; if (solid(world.get(Math.floor(cx), Math.floor(cy), Math.floor(cz)))) { k = Math.max(0, q - .1); break; } }
      cam.x = hx + rx * k - look.x * D * k; cam.y = hy + .25 * k - look.y * D * k; cam.z = hz + rz * k - look.z * D * k;
    } else { cam.x = hx; cam.y = hy; cam.z = hz; }
    const fov = 75 + (P.speed > 5.5 ? 7 : 0); cam.fov += (fov - cam.fov) * .15;
    pose(me, P.speed, tt, dt);
    const r = ray(); selBox = r && r.hit ? r.hit : null;
    for (const e of entList()) {
      if (e.tx !== undefined) { e.x += (e.tx - e.x) * .3; e.y += (e.ty - e.y) * .3; e.z += (e.tz - e.z) * .3; }
      let a = anims.get(e.id); if (!a) { a = { lx: e.x, lz: e.z, sp: 0, fl: 0, hp: e.hp }; anims.set(e.id, a); }
      a.sp += (Math.hypot(e.x - a.lx, e.z - a.lz) / Math.max(dt, .001) - a.sp) * .2; a.lx = e.x; a.lz = e.z; if (e.hp < a.hp) a.fl = .25; a.hp = e.hp; if (a.fl > 0) a.fl -= dt;
    }
    for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.vy -= 14 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if ((p.life -= dt) <= 0) parts.splice(i, 1); }
    if ((terrT += dt) > .5) { terrT = 0; terrCheck(); if (sim) for (const id of [...anims.keys()]) if (!sim.ents.has(id)) anims.delete(id); }
    if (hold !== null && tt - lastAct > .2) act(hold);
    for (const o of others.values()) {
      const p = o.pos; p.x += (o.t.x - p.x) * .25; p.y += (o.t.y - p.y) * .25; p.z += (o.t.z - p.z) * .25;
      o.sp += (Math.hypot(p.x - o.last.x, p.z - o.last.z) / Math.max(dt, .001) - o.sp) * .2; o.last.x = p.x; o.last.z = p.z; pose(o.ch, o.sp, tt, dt);
    }
    if ((sendT += dt) > .1) { sendT = 0; const key = P.x.toFixed(2) + P.y.toFixed(2) + P.z.toFixed(2) + P.yaw.toFixed(2); if (key !== sentKey || tt - posT > 1) { sentKey = key; posT = tt; tx({ t: 'pos', x: P.x, y: P.y, z: P.z, ry: P.yaw }); } }
    if ((skyT += dt) > .5) {
      skyT = 0; const sh = Math.sin(((Date.now() / 1000) / 600 % 1) * 6.2832), Lt = Math.max(.2, Math.min(1, sh * 1.4 + .55)), k = (Lt - .2) / .8;
      sky = [SKYN[0] + (SKYD[0] - SKYN[0]) * k, SKYN[1] + (SKYD[1] - SKYN[1]) * k, SKYN[2] + (SKYD[2] - SKYN[2]) * k]; const dusk = Math.max(0, 1 - Math.abs(sh) * 4) * .55; sky = [sky[0] + (.98 - sky[0]) * dusk, sky[1] + (.52 - sky[1]) * dusk, sky[2] + (.28 - sky[2]) * dusk]; tint = [Lt, Lt * (1 - .05 * k), Math.min(1, Lt * 1.12 + .04) * (1 - .15 * k)]; sunDir = [Math.cos(((Date.now() / 1000) / 600 % 1) * 6.2832), sh, .25];
    }
    cloudOff += dt * .0015;
    if (!online && hp < 20 && (regenT += dt) > 4) { regenT = 0; hp++; hud(); }
    fpsT += raw; fpsN++;
    if (fpsT > 2.5) {
      const fps = fpsN / fpsT; fpsT = fpsN = 0;
      if (qMode === 'auto') { if (warm > 0) warm--; else if (fps < 26 && qLevel > 0) { setQ(qLevel - 1); lastDown = tt; good = 0; warm = 1; } else if (fps >= 56) { if (++good >= 4 && qLevel < qMax && tt - lastDown > 40) { setQ(qLevel + 1); good = 0; warm = 1; } } else good = 0; }
    }
    render(); errs = 0;
  } catch (e) { if (++errs < 4) console.error(e); if (errs === 3) say('Render error: ' + e.message); }
}
if (qMode !== 'auto') setMode(qMode);
resizeGL();
setInterval(() => { if (offline && started) saveSolo(); }, 30000); setInterval(() => { pushState(); }, 15000);
addEventListener('pagehide', () => { if (offline && started) saveSolo(); else pushState(); });
window.__mc = { ents: () => [...entList()], act, buildShop, eat, openShop, get S() { return S; }, get sim() { return sim; }, P };
