// La cancha de Rorro: La Trampa del Mono hecha en código. Sale del mismo mapa que usa el juego (cancha-grid.js, una
// letra por yarda) y se arma como una maqueta low-poly con three.js: el relieve real de cada green (su caída), los
// bunkers hundidos, los árboles con sombra (la luz viene de arriba a la izquierda, como en los dibujos), los monos y la
// bandera. Y se rehace en cada tiro: el buen tiro "aprueba el diseño" y te la acomoda; el malo trae "cambios del
// cliente". Cada versión entra con un barrido de deploy. Nada se mueve con la pelota en el aire, y alrededor de la
// pelota y de los hoyos la cancha queda quieta (la pelota nunca cambia de lie).
// El sonido es propio (ciber.js): cibernético y sucio, y sigue los movimientos (la cámara, la cancha que se deforma).
// Los superpoderes de dev: ⏸ debug (en el aire congela la pelota y le cambiás el destino) y ↩ git revert (deshace la
// última versión de la cancha). Uno de cada por hoyo.
//
// La deformación: un campo de desplazamiento D(q) en coordenadas del mapa (q = yardas del dibujo). Lo que estaba en q
// se ve en q + D(q). El terreno se dibuja al revés (cada punto de la pantalla busca su q, tres iteraciones), los
// árboles, los monos y la pelota van para adelante. La misma cuenta está en el shader (GLSL) y acá (JS): tienen que dar
// igual, así lo que ves es lo que juega.
import * as THREE from 'three'
import * as M from '../motor.js'
import * as C from './ciber.js'

const $ = (s) => document.querySelector(s)
const campo = M.crearCampo()
const FILAS = campo.cancha.filas
const W = FILAS[0].length, H = FILAS.length
const N = W * H
const clamp = (x, a, b) => Math.min(b, Math.max(a, x))
const lerp = (a, b, t) => a + (b - a) * t
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
const norm = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l] }
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const elastic = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1)
const rnd = M.rngDesde(20261010)
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) }
const letra = (q) => (FILAS[Math.floor(q[1])] ?? '')[Math.floor(q[0])] ?? 'x'
const HOYOS = M.HOYOS
const PRUEBA = new URLSearchParams(location.search).has('prueba')

// ── el mapa en capas (una por terreno), suavizadas para que los bordes sean curvas y no escalones ──
function capa(letras) {
  const a = new Float32Array(N)
  for (let y = 0; y < H; y++) { const f = FILAS[y]; for (let x = 0; x < W; x++) if (letras.includes(f[x])) a[y * W + x] = 1 }
  return a
}
function suavizar(a, pasadas = 2) {
  let src = a
  for (let p = 0; p < pasadas; p++) {
    const tmp = new Float32Array(N), out = new Float32Array(N)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x
      tmp[i] = (src[y * W + Math.max(0, x - 1)] + src[i] + src[y * W + Math.min(W - 1, x + 1)]) / 3
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      out[y * W + x] = (tmp[Math.max(0, y - 1) * W + x] + tmp[y * W + x] + tmp[Math.min(H - 1, y + 1) * W + x]) / 3
    }
    src = out
  }
  return src
}
const CAPA = { calle: suavizar(capa('f')), green: suavizar(capa('g')), bunker: suavizar(capa('b')), tee: suavizar(capa('e')), afuera: suavizar(capa('x')), arbol: suavizar(capa('t'), 3) }
// la caída de cada green, hecha relieve: baja para donde rueda la pelota (las zonas de caída del juego, mezcladas suave)
const CAIDA_K = 0.075
const caidaH = new Float32Array(N)
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (FILAS[y][x] !== 'g') continue
  const p = [x + 0.5, y + 0.5]
  const h = HOYOS.reduce((a, b) => (dist(b.pin, p) < dist(a.pin, p) ? b : a))
  const zonas = h.caidas?.length ? h.caidas : [{ p: h.pin, v: h.caida }]
  let s = 0, sw = 0
  for (const z of zonas) {
    const w = Math.exp(-((p[0] - z.p[0]) ** 2 + (p[1] - z.p[1]) ** 2) / (2 * 9 * 9)) + 1e-9
    s += w * -((p[0] - z.p[0]) * z.v[0] + (p[1] - z.p[1]) * z.v[1]) * CAIDA_K * (z.fuerte ? 1.6 : 1)
    sw += w
  }
  caidaH[y * W + x] = s / sw
}
CAPA.caida = suavizar(caidaH, 2)
function textura(r, g, b, a) {
  const d = new Uint8Array(N * 4)
  for (let i = 0; i < N; i++) { d[i * 4] = r(i); d[i * 4 + 1] = g(i); d[i * 4 + 2] = b(i); d[i * 4 + 3] = a(i) }
  const t = new THREE.DataTexture(d, W, H, THREE.RGBAFormat, THREE.UnsignedByteType)
  t.magFilter = t.minFilter = THREE.LinearFilter
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
  t.needsUpdate = true
  return t
}
const b255 = (a) => (i) => Math.round(clamp(a[i], 0, 1) * 255)
const TEX1 = textura(b255(CAPA.calle), b255(CAPA.green), b255(CAPA.bunker), b255(CAPA.tee))
const TEX2 = textura(b255(CAPA.afuera), b255(CAPA.arbol), (i) => Math.round(clamp(CAPA.caida[i] / 3 + 0.5, 0, 1) * 255), () => 255)
function muestra(a, x, y) {
  const fx = clamp(x - 0.5, 0, W - 1), fy = clamp(y - 0.5, 0, H - 1)
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(W - 1, x0 + 1), y1 = Math.min(H - 1, y0 + 1)
  const tx = fx - x0, ty = fy - y0
  return lerp(lerp(a[y0 * W + x0], a[y0 * W + x1], tx), lerp(a[y1 * W + x0], a[y1 * W + x1], tx), ty)
}

// ── la deformación (la misma cuenta que el shader) ──
const NB = 28
const est = {
  bumps: [], // { id, cx, cy, r, tipo (0 corre, 1 infla), vx, vy, desde, hasta }
  bola0: [0, 0], bola1: [0, 0], pins: HOYOS.map((h) => [...h.pin]),
  swO: [0, 0], swSentido: 1, swW: 1e5, swBanda: 22, swVivo: 0, rebobina: 0, // la onda del deploy: un círculo que sale de la pelota (o vuelve, en el revert)
  t: 0, resp: 0.32,
  armaO: [W / 2, H + 30], armaD: [0, -1], armaW: -40, armaBanda: 26,
}
let idBump = 1
const avance = (q) => { const d = dist(q, est.swO); return clamp((est.swSentido > 0 ? est.swW - d : d - est.swW) / est.swBanda, 0, 1) }
const armado = (q) => clamp((est.armaW - ((q[0] - est.armaO[0]) * est.armaD[0] + (q[1] - est.armaO[1]) * est.armaD[1])) / est.armaBanda, 0, 1)
const quieto = (q, c, r0, r1) => ss(r0, r1, dist(q, c))
function desplazo(q) {
  const k = avance(q)
  let dx = 0, dy = 0
  for (const b of est.bumps) {
    const ex = q[0] - b.cx, ey = q[1] - b.cy
    const w = Math.exp(-(ex * ex + ey * ey) / (b.r * b.r)) * lerp(b.desde, b.hasta, k)
    if (b.tipo === 0) { dx += b.vx * w; dy += b.vy * w } else { dx += (ex / b.r) * b.vx * w; dy += (ey / b.r) * b.vx * w }
  }
  const t = est.t
  dx += est.resp * (Math.sin(q[1] * 0.061 + t * 0.9) + 0.5 * Math.sin(q[0] * 0.11 - t * 1.3))
  dy += est.resp * (Math.cos(q[0] * 0.07 + t * 0.7) + 0.5 * Math.cos(q[1] * 0.09 + t * 1.1))
  const qb = lerp(quieto(q, est.bola0, 4, 10), quieto(q, est.bola1, 4, 10), k)
  const qp = quieto(q, est.pins[0], 5, 11) * quieto(q, est.pins[1], 5, 11) * quieto(q, est.pins[2], 5, 11)
  return [dx * qb * qp, dy * qb * qp]
}
const adelante = (q) => { const d = desplazo(q); return [q[0] + d[0], q[1] + d[1]] }
function inversa(p) { let q = p; for (let i = 0; i < 4; i++) { const d = desplazo(q); q = [p[0] - d[0], p[1] - d[1]] } return q }
/** La altura del terreno en q (yardas), como el shader. */
function alturaEn(q) {
  const fw = ss(0.3, 0.7, muestra(CAPA.calle, q[0], q[1])), gr = ss(0.3, 0.7, muestra(CAPA.green, q[0], q[1]))
  const bk = ss(0.25, 0.7, muestra(CAPA.bunker, q[0], q[1])), te = ss(0.3, 0.7, muestra(CAPA.tee, q[0], q[1]))
  const fu = ss(0.3, 0.7, muestra(CAPA.afuera, q[0], q[1])), ar = muestra(CAPA.arbol, q[0], q[1])
  let h = fw * 0.12 + te * 0.5 + gr * (0.32 + muestra(CAPA.caida, q[0], q[1])) - bk * 1.15 + ar * 0.25
  h = lerp(h, -4.5, fu)
  if (est.swVivo) h += est.swVivo * 1.3 * Math.exp(-(((dist(q, est.swO) - est.swW) / 3.2) ** 2)) * (1 - fu) // la ola del deploy
  return h * armado(q)
}

// ── three: el renderer, la escena, las luces ──
const lienzo = $('#lienzo')
const renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.05
const escena = new THREE.Scene()
const FONDO = new THREE.Color('#0a2117')
escena.background = FONDO
escena.fog = new THREE.Fog(FONDO, 520, 1200)
const camara = new THREE.PerspectiveCamera(48, 1, 0.5, 2500)
const cielo = new THREE.HemisphereLight('#fff6df', '#2d4a22', 1.15)
escena.add(cielo)
const sol = new THREE.DirectionalLight('#fff0d0', 2.6)
const SOL_DIR = new THREE.Vector3(-1, 1.55, -1).normalize() // de arriba a la izquierda del dibujo: las sombras caen abajo a la derecha
sol.castShadow = true
sol.shadow.mapSize.set(2048, 2048)
sol.shadow.bias = -0.0004
sol.shadow.normalBias = 0.5
sol.shadow.radius = 3
escena.add(sol, sol.target)
function sombraEn(cx, cz, r) {
  sol.target.position.set(cx, 0, cz)
  sol.position.set(cx + SOL_DIR.x * 200, SOL_DIR.y * 200, cz + SOL_DIR.z * 200)
  const c = sol.shadow.camera
  if (c.right !== r) { c.left = -r; c.right = r; c.top = r; c.bottom = -r; c.near = 20; c.far = 520; c.updateProjectionMatrix() }
}

// ── los colores (sacados del dibujo de la cancha: la mediana de cada terreno) ──
const col = (h) => new THREE.Color(h)
const COL = {
  roughA: col('#3e6b1f'), roughB: col('#6f9636'), calleA: col('#a2bc43'), calleB: col('#b7cd4e'), greenA: col('#bcd558'), greenB: col('#cbe066'),
  bunker: col('#f4e6c4'), tee: col('#3f7029'), afueraA: col('#0c2b1c'), afueraB: col('#11372a'), tierra: col('#5d432c'), plano: col('#0b2219'),
  oro: col('#e8c34a'), azul: col('#7fc4ff'),
}

// ── el terreno: una malla de una yarda, deformada y coloreada en el shader (sobre el material estándar, así tiene luz y sombras) ──
const MARGEN = 22
function mallaTerreno() {
  const x0 = -MARGEN, z0 = -MARGEN, nx = W + 2 * MARGEN, nz = H + 2 * MARGEN
  const pos = new Float32Array((nx + 1) * (nz + 1) * 3)
  let k = 0
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { pos[k++] = x0 + i; pos[k++] = 0; pos[k++] = z0 + j }
  const idx = new Uint32Array(nx * nz * 6)
  k = 0
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1
    idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3))
  g.setIndex(new THREE.BufferAttribute(idx, 1))
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(W / 2, 0, H / 2), 400)
  return g
}
const U = {
  uMask1: { value: TEX1 }, uMask2: { value: TEX2 }, uTam: { value: new THREE.Vector2(W, H) },
  uBC: { value: Array.from({ length: NB }, () => new THREE.Vector4()) }, uBV: { value: Array.from({ length: NB }, () => new THREE.Vector4()) }, uNB: { value: 0 },
  uBola0: { value: new THREE.Vector2() }, uBola1: { value: new THREE.Vector2() }, uPins: { value: est.pins.map((p) => new THREE.Vector2(...p)) },
  uSwO: { value: new THREE.Vector2() }, uSwSentido: { value: 1 }, uSwW: { value: 1e5 }, uSwBanda: { value: est.swBanda }, uSwVivo: { value: 0 }, uRebobina: { value: 0 },
  uT: { value: 0 }, uResp: { value: est.resp },
  uArmaO: { value: new THREE.Vector2(...est.armaO) }, uArmaD: { value: new THREE.Vector2(...est.armaD) }, uArmaW: { value: est.armaW }, uArmaBanda: { value: est.armaBanda },
}
for (const [k, v] of Object.entries(COL)) U['uCol' + k[0].toUpperCase() + k.slice(1)] = { value: v }
const GLSL_COMUN = /* glsl */ `
#define NB ${NB}
uniform sampler2D uMask1; uniform sampler2D uMask2; uniform vec2 uTam;
uniform vec4 uBC[NB]; uniform vec4 uBV[NB]; uniform int uNB;
uniform vec2 uBola0; uniform vec2 uBola1; uniform vec2 uPins[3];
uniform vec2 uSwO; uniform float uSwSentido; uniform float uSwW; uniform float uSwBanda; uniform float uSwVivo; uniform float uRebobina;
uniform float uT; uniform float uResp;
uniform vec2 uArmaO; uniform vec2 uArmaD; uniform float uArmaW; uniform float uArmaBanda;
varying vec2 vQ;
varying vec3 vMundo;
float avance(vec2 q) { float d = distance(q, uSwO); return clamp((uSwSentido > 0.0 ? uSwW - d : d - uSwW) / uSwBanda, 0.0, 1.0); }
float armado(vec2 q) { return clamp((uArmaW - dot(q - uArmaO, uArmaD)) / uArmaBanda, 0.0, 1.0); }
float quieto(vec2 q, vec2 c, float r0, float r1) { return smoothstep(r0, r1, distance(q, c)); }
`
const GLSL_VERTICE = /* glsl */ `
vec2 desplazo(vec2 q) {
  float k = avance(q);
  vec2 d = vec2(0.0);
  for (int i = 0; i < NB; i++) {
    if (i >= uNB) break;
    vec4 c = uBC[i]; vec4 v = uBV[i];
    vec2 e = q - c.xy;
    float w = exp(-dot(e, e) / (c.z * c.z)) * mix(v.z, v.w, k);
    d += (c.w < 0.5 ? v.xy : e / c.z * v.x) * w;
  }
  d.x += uResp * (sin(q.y * 0.061 + uT * 0.9) + 0.5 * sin(q.x * 0.11 - uT * 1.3));
  d.y += uResp * (cos(q.x * 0.07 + uT * 0.7) + 0.5 * cos(q.y * 0.09 + uT * 1.1));
  float qb = mix(quieto(q, uBola0, 4.0, 10.0), quieto(q, uBola1, 4.0, 10.0), k);
  float qp = quieto(q, uPins[0], 5.0, 11.0) * quieto(q, uPins[1], 5.0, 11.0) * quieto(q, uPins[2], 5.0, 11.0);
  return d * qb * qp;
}
vec2 inversa(vec2 p) { vec2 q = p; for (int i = 0; i < 2; i++) q = p - desplazo(q); return q; }
float alturaEn(vec2 q) {
  vec2 uv = q / uTam;
  vec4 a = texture(uMask1, uv); vec4 b = texture(uMask2, uv);
  float fw = smoothstep(0.3, 0.7, a.r), gr = smoothstep(0.3, 0.7, a.g), bk = smoothstep(0.25, 0.7, a.b), te = smoothstep(0.3, 0.7, a.a);
  float fu = smoothstep(0.3, 0.7, b.r);
  float h = fw * 0.12 + te * 0.5 + gr * (0.32 + (b.b - 0.5) * 3.0) - bk * 1.15 + b.g * 0.25;
  h = mix(h, -4.5, fu);
  h += uSwVivo * 1.3 * exp(-pow((distance(q, uSwO) - uSwW) / 3.2, 2.0)) * (1.0 - fu); // la ola del deploy
  return h * armado(q);
}
`
const GLSL_FRAGMENTO = /* glsl */ `
uniform vec3 uColRoughA; uniform vec3 uColRoughB; uniform vec3 uColCalleA; uniform vec3 uColCalleB; uniform vec3 uColGreenA; uniform vec3 uColGreenB;
uniform vec3 uColBunker; uniform vec3 uColTee; uniform vec3 uColAfueraA; uniform vec3 uColAfueraB; uniform vec3 uColTierra; uniform vec3 uColPlano;
uniform vec3 uColOro; uniform vec3 uColAzul;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ruido(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
// una línea de grilla de un píxel (sin moiré: se apaga cuando de lejos la grilla se vuelve muy densa)
float linea(vec2 q, float paso) {
  vec2 c = q / paso, w = max(fwidth(c), vec2(1e-4));
  vec2 g = abs(fract(c - 0.5) - 0.5) / w;
  return (1.0 - min(min(g.x, g.y), 1.0)) * (1.0 - smoothstep(0.12, 0.4, max(w.x, w.y)));
}
float contorno(float m) { return 1.0 - smoothstep(0.0, max(fwidth(m) * 1.4, 1e-3), abs(m - 0.5)); }
vec3 colorTerreno(vec2 q) {
  vec2 uv = q / uTam;
  vec4 a = texture(uMask1, uv); vec4 b = texture(uMask2, uv);
  float fw = smoothstep(0.38, 0.62, a.r), gr = smoothstep(0.38, 0.62, a.g), bk = smoothstep(0.3, 0.6, a.b), te = smoothstep(0.38, 0.62, a.a);
  float fu = smoothstep(0.38, 0.62, b.r), ar = b.g;
  float n = ruido(q * 0.32) * 0.6 + ruido(q * 1.4) * 0.4;
  vec3 c = mix(uColRoughA, uColRoughB, n);
  c *= 1.0 - 0.32 * ar;
  float rayas = step(0.5, fract(q.y / 7.0));
  c = mix(c, mix(uColCalleA, uColCalleB, rayas) * (0.96 + 0.08 * n), fw);
  float rg = step(0.5, fract((q.x + q.y) / 3.4));
  c = mix(c, mix(uColGreenA, uColGreenB, rg), gr);
  c = mix(c, uColTee * (0.94 + 0.12 * rayas), te);
  c = mix(c, uColBunker * (0.92 + 0.1 * ruido(q * 5.0)), bk);
  float borde = max(4.0 * smoothstep(0.2, 0.8, a.r) * (1.0 - smoothstep(0.2, 0.8, a.r)), 4.0 * smoothstep(0.2, 0.8, a.g) * (1.0 - smoothstep(0.2, 0.8, a.g)));
  c *= 1.0 - 0.14 * borde;
  float arriba = abs(normalize(cross(dFdx(vMundo), dFdy(vMundo))).y);
  c = mix(c, uColTierra * (0.85 + 0.2 * ruido(q * vec2(0.6, 2.5))), (1.0 - smoothstep(0.42, 0.8, arriba)) * (1.0 - fu * 0.6));
  float tr = step(0.5, fract((q.x + q.y) / 9.0));
  c = mix(c, mix(uColAfueraA, uColAfueraB, tr), fu * smoothstep(0.75, 0.95, arriba));
  // el plano: antes de compilarse, la cancha es un plano con su grilla y el contorno en dorado
  float kb = armado(q);
  if (kb < 1.0) {
    float bordes = clamp(contorno(a.r) + contorno(a.g) + contorno(a.b) + contorno(b.r) + 0.5 * contorno(b.g), 0.0, 1.0);
    vec3 plano = uColPlano * (1.0 + 0.6 * smoothstep(0.4, 0.6, b.g)) + uColOro * (0.3 * linea(q, 10.0) + 0.85 * bordes);
    c = mix(plano, c, kb);
  }
  return c;
}
vec3 brillo(vec2 q) {
  float kb = armado(q);
  float frente = exp(-pow((dot(q - uArmaO, uArmaD) - uArmaW) / 2.2, 2.0));
  vec3 e = uColOro * frente * 1.6 * step(kb, 0.999);
  float k = avance(q);
  float fs = exp(-pow((distance(q, uSwO) - uSwW) / 2.0, 2.0)) * uSwVivo;
  float banda = k * (1.0 - k) * 4.0 * uSwVivo;
  vec3 tono = mix(uColOro, uColAzul, uRebobina);
  e += tono * (fs * 2.4 + banda * 0.75 * linea(q, 5.0));
  return e;
}
`
const matTerreno = new THREE.MeshStandardMaterial({ roughness: 0.93, metalness: 0, flatShading: true }) // facetado: low-poly y una sola altura por vértice
matTerreno.onBeforeCompile = (sh) => {
  Object.assign(sh.uniforms, U)
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', `#include <common>\n${GLSL_COMUN}\n${GLSL_VERTICE}`)
    .replace('#include <beginnormal_vertex>', `
      vec2 q = inversa(position.xz);
      vQ = q;
      float h0 = alturaEn(q);
      vec3 objectNormal = vec3(0.0, 1.0, 0.0);`)
    .replace('#include <begin_vertex>', 'vec3 transformed = vec3(position.x, h0, position.z);\nvMundo = transformed;')
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>\n${GLSL_COMUN}\n${GLSL_FRAGMENTO}`)
    .replace('#include <color_fragment>', 'diffuseColor.rgb = colorTerreno(vQ);')
    .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += brillo(vQ);')
}
const terreno = new THREE.Mesh(mallaTerreno(), matTerreno)
terreno.receiveShadow = true
terreno.frustumCulled = false
escena.add(terreno)
function subirUniforms() {
  const bs = est.bumps.slice(-NB)
  bs.forEach((b, i) => { U.uBC.value[i].set(b.cx, b.cy, b.r, b.tipo); U.uBV.value[i].set(b.vx, b.vy, b.desde, b.hasta) })
  U.uNB.value = bs.length
  U.uBola0.value.set(...est.bola0); U.uBola1.value.set(...est.bola1)
  U.uSwO.value.set(...est.swO); U.uSwSentido.value = est.swSentido; U.uSwW.value = est.swW; U.uSwBanda.value = est.swBanda; U.uSwVivo.value = est.swVivo; U.uRebobina.value = est.rebobina
  U.uT.value = est.t; U.uResp.value = est.resp
  U.uArmaW.value = est.armaW
}

// ── los árboles: uno por cada manchón de copa del mapa, low-poly, con resorte (cuando la cancha se mueve, se bambolean) ──
const arboles = []
{
  const celdas = []
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (FILAS[y][x] === 't') celdas.push([x + 0.5, y + 0.5])
  for (let i = celdas.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [celdas[i], celdas[j]] = [celdas[j], celdas[i]] }
  const cuad = new Map(), C = 4
  const clave = (x, y) => `${Math.floor(x / C)},${Math.floor(y / C)}`
  for (const c of celdas) {
    const r = 1.35 + rnd() * 0.9 // el radio de la copa
    const q = [c[0] + (rnd() - 0.5) * 0.8, c[1] + (rnd() - 0.5) * 0.8]
    let choca = false
    for (let dx = -1; dx <= 1 && !choca; dx++) for (let dy = -1; dy <= 1 && !choca; dy++) {
      for (const o of cuad.get(`${Math.floor(q[0] / C) + dx},${Math.floor(q[1] / C) + dy}`) ?? []) if (dist(o.q, q) < (o.r + r) * 0.82) { choca = true; break }
    }
    if (choca) continue
    const a = { q, r, alto: 1.1 + rnd() * 0.9, tono: rnd(), fase: rnd() * 6.28, giro: rnd() * 6.28, pos: [...q], vel: [0, 0], pop: 0, popT: -1 }
    arboles.push(a)
    const k = clave(q[0], q[1]); if (!cuad.has(k)) cuad.set(k, []); cuad.get(k).push(a)
  }
}
const geoCopa = new THREE.IcosahedronGeometry(1, 0)
const geoTronco = new THREE.CylinderGeometry(0.16, 0.26, 1, 6).translate(0, 0.5, 0)
const copas = new THREE.InstancedMesh(geoCopa, new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.85 }), arboles.length)
const troncos = new THREE.InstancedMesh(geoTronco, new THREE.MeshStandardMaterial({ color: '#5b3f26', roughness: 1 }), arboles.length)
copas.castShadow = true; troncos.castShadow = true
copas.receiveShadow = true
const VERDES = ['#2c5a1d', '#3a6b24', '#4b7d2c', '#24491a', '#5a8a33', '#33621f'].map(col)
arboles.forEach((a, i) => copas.setColorAt(i, VERDES[Math.floor(a.tono * VERDES.length)].clone().offsetHSL(0, 0, (a.tono - 0.5) * 0.04)))
copas.frustumCulled = troncos.frustumCulled = false
escena.add(copas, troncos)
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3()
let energiaArboles = 0
function moverArboles(dt) {
  const viento = Math.sin(est.t * 0.7)
  let suma = 0
  for (let i = 0; i < arboles.length; i++) {
    const a = arboles[i]
    const obj = adelante(a.q)
    // el resorte: va para donde lo lleva la cancha, se pasa un poquito y vuelve
    const kx = (obj[0] - a.pos[0]) * 70, ky = (obj[1] - a.pos[1]) * 70
    a.vel[0] = (a.vel[0] + kx * dt) * Math.exp(-7 * dt); a.vel[1] = (a.vel[1] + ky * dt) * Math.exp(-7 * dt)
    a.pos[0] += a.vel[0] * dt; a.pos[1] += a.vel[1] * dt
    // aparece cuando lo alcanza el frente de la compilación (con rebote)
    if (a.popT < 0 && armado(a.q) > 0.55) a.popT = est.t
    const pop = a.popT < 0 ? 0 : elastic(Math.min(1, (est.t - a.popT) / 0.9))
    const v = Math.hypot(a.vel[0], a.vel[1])
    suma += v
    const aplasta = Math.min(0.28, v * 0.035)
    const suelo = alturaEn(a.q)
    const r = a.r * pop
    _e.set(clamp(a.vel[1] * 0.05, -0.4, 0.4) + Math.sin(est.t * 1.3 + a.fase) * 0.015 * viento, a.giro, -clamp(a.vel[0] * 0.05, -0.4, 0.4) + Math.cos(est.t * 1.1 + a.fase) * 0.015)
    _q.setFromEuler(_e)
    const tronco = a.alto * r * 0.55
    _p.set(a.pos[0], suelo + tronco + r * 0.62 * (1 - aplasta), a.pos[1])
    _s.set(r * (1 + aplasta * 0.5), r * 0.95 * (1 - aplasta), r * (1 + aplasta * 0.5))
    copas.setMatrixAt(i, _m.compose(_p, _q, _s))
    _p.set(a.pos[0], suelo - 0.1, a.pos[1])
    _s.set(Math.max(0.001, pop), tronco + 0.25, Math.max(0.001, pop))
    troncos.setMatrixAt(i, _m.compose(_p, _q.identity(), _s))
  }
  copas.instanceMatrix.needsUpdate = true
  troncos.instanceMatrix.needsUpdate = true
  energiaArboles = suma / arboles.length
}

// ── las banderas y los hoyos ──
const TELA = { roja: ['#c8352e', '#f4eeda'], blanca: ['#f4eeda', '#14402a'], azul: ['#2f5fd0', '#f4eeda'] }
const banderas = HOYOS.map((h) => {
  const g = new THREE.Group()
  const palo = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 6.2, 8).translate(0, 3.1, 0), new THREE.MeshStandardMaterial({ color: '#f7f5ee', roughness: 0.4 }))
  palo.castShadow = true
  const bola = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshStandardMaterial({ color: '#e8c34a', roughness: 0.3, metalness: 0.4 }))
  bola.position.y = 6.25
  const geoTela = new THREE.PlaneGeometry(2.6, 1.55, 12, 3).translate(1.3, 0, 0)
  const [c1] = TELA[M.colorBandera?.(h, h.pin) ?? 'roja'] ?? TELA.roja
  const tela = new THREE.Mesh(geoTela, new THREE.MeshStandardMaterial({ color: c1, side: THREE.DoubleSide, roughness: 0.7 }))
  tela.position.set(0.05, 5.35, 0)
  tela.castShadow = true
  const taza = new THREE.Mesh(new THREE.CircleGeometry(0.62, 24).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#06120b', roughness: 1 }))
  taza.position.y = 0.04
  const aro = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.72, 24).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#e9e4d2' }))
  aro.position.y = 0.045
  g.add(palo, bola, tela, taza, aro)
  g.userData = { tela, base: geoTela.attributes.position.array.slice() }
  escena.add(g)
  return g
})
function moverBanderas() {
  HOYOS.forEach((h, i) => {
    const g = banderas[i]
    g.position.set(h.pin[0], alturaEn(h.pin), h.pin[1])
    g.visible = armado(h.pin) > 0.7
    const { tela, base } = g.userData
    const p = tela.geometry.attributes.position
    for (let k = 0; k < p.count; k++) {
      const x = base[k * 3]
      p.array[k * 3 + 2] = Math.sin(x * 2.2 - est.t * 7 + i) * 0.22 * (x / 2.6) + Math.sin(x * 4.1 - est.t * 11) * 0.05 * (x / 2.6)
      p.array[k * 3 + 1] = base[k * 3 + 1] - (x / 2.6) ** 2 * 0.12
    }
    p.needsUpdate = true
    tela.geometry.computeVertexNormals()
    g.rotation.y = -0.7 + Math.sin(est.t * 0.3 + i) * 0.15 // para donde sopla
  })
}

// ── la pelota, su estela, el objetivo y el arco de la próxima ──
const RADIO_BOLA = 0.42
const bola = new THREE.Mesh(new THREE.IcosahedronGeometry(RADIO_BOLA, 2), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35, emissive: '#ffffff', emissiveIntensity: 0.12 }))
bola.castShadow = true
escena.add(bola)
const ESTELA = 64
const estelaGeo = new THREE.BufferGeometry()
estelaGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ESTELA * 3), 3))
estelaGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(ESTELA * 4), 4))
const estela = new THREE.Line(estelaGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }))
estela.frustumCulled = false
escena.add(estela)
let estelaPts = []
function pintarEstela() {
  const p = estelaGeo.attributes.position.array, c = estelaGeo.attributes.color.array
  for (let i = 0; i < ESTELA; i++) {
    const s = estelaPts[Math.max(0, estelaPts.length - ESTELA + i)] ?? estelaPts[0] ?? [0, -50, 0]
    p[i * 3] = s[0]; p[i * 3 + 1] = s[1]; p[i * 3 + 2] = s[2]
    const a = estelaPts.length ? (i / ESTELA) ** 1.6 * 0.9 : 0
    c[i * 4] = 1; c[i * 4 + 1] = 0.95; c[i * 4 + 2] = 0.8; c[i * 4 + 3] = a
  }
  estelaGeo.attributes.position.needsUpdate = true
  estelaGeo.attributes.color.needsUpdate = true
}
const marca = new THREE.Group()
{
  const aro = new THREE.Mesh(new THREE.RingGeometry(1.5, 2.0, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#e8c34a', transparent: true, opacity: 0.95, depthWrite: false }))
  const punto = new THREE.Mesh(new THREE.CircleGeometry(0.45, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#e8c34a', depthWrite: false }))
  const haz = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 7, 6).translate(0, 3.5, 0), new THREE.MeshBasicMaterial({ color: '#e8c34a', transparent: true, opacity: 0.5, depthWrite: false }))
  marca.add(aro, punto, haz)
  marca.userData.aro = aro
  marca.visible = false
  marca.renderOrder = 5
  escena.add(marca)
}
const arcoGeo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 60 }, () => new THREE.Vector3()))
const arco = new THREE.Line(arcoGeo, new THREE.LineDashedMaterial({ color: '#f4eeda', dashSize: 1.4, gapSize: 1.0, transparent: true, opacity: 0.9, depthTest: false }))
arco.renderOrder = 6
arco.frustumCulled = false
arco.visible = false
escena.add(arco)
function dibujarArco(desde, hasta, alto, colorHex = '#f4eeda') {
  const p = arcoGeo.attributes.position
  for (let i = 0; i < 60; i++) {
    const s = i / 59
    const x = lerp(desde[0], hasta[0], s), z = lerp(desde[2], hasta[2], s)
    p.setXYZ(i, x, lerp(desde[1], hasta[1], s) + alto * 4 * s * (1 - s), z)
  }
  p.needsUpdate = true
  arco.computeLineDistances()
  arco.material.color.set(colorHex)
  arco.visible = true
}

// ── las partículas (pasto, arena, papelitos) ──
const MAXP = 160
const parts = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.22), new THREE.MeshStandardMaterial({ roughness: 0.8 }), MAXP)
parts.frustumCulled = false
escena.add(parts)
const vivas = []
function chispas(pos, n, colores, fuerza = 6, arriba = 7) {
  for (let i = 0; i < n; i++) {
    if (vivas.length >= MAXP) vivas.shift()
    const a = Math.random() * Math.PI * 2, f = fuerza * (0.4 + Math.random() * 0.8)
    vivas.push({ p: [...pos], v: [Math.cos(a) * f, arriba * (0.6 + Math.random() * 0.7), Math.sin(a) * f], vida: 0.9 + Math.random() * 0.8, t: 0, rot: Math.random() * 6, col: col(colores[i % colores.length]), tam: 0.7 + Math.random() * 0.8 })
  }
}
function moverParticulas(dt) {
  for (const v of vivas) {
    v.t += dt
    v.v[1] -= 22 * dt
    v.p[0] += v.v[0] * dt; v.p[1] += v.v[1] * dt; v.p[2] += v.v[2] * dt
    const piso = alturaEn(inversa([v.p[0], v.p[2]])) + 0.1
    if (v.p[1] < piso) { v.p[1] = piso; v.v[0] *= 0.5; v.v[2] *= 0.5; v.v[1] = Math.abs(v.v[1]) * 0.25 }
  }
  for (let i = vivas.length - 1; i >= 0; i--) if (vivas[i].t > vivas[i].vida) vivas.splice(i, 1)
  for (let i = 0; i < MAXP; i++) {
    const v = vivas[i]
    if (!v) { parts.setMatrixAt(i, _m.makeScale(0, 0, 0)); continue }
    const k = (1 - (v.t / v.vida) ** 3) * v.tam
    _q.setFromEuler(_e.set(v.rot + v.t * 9, v.t * 7, 0))
    parts.setMatrixAt(i, _m.compose(_p.set(...v.p), _q, _s.set(k, k, k)))
    parts.setColorAt(i, v.col)
  }
  parts.instanceMatrix.needsUpdate = true
  if (parts.instanceColor) parts.instanceColor.needsUpdate = true
}

// ── el golfista: Rorro, con su camisa bordó y la gorra negra (los colores del juego) ──
const golfista = new THREE.Group()
const brazos = new THREE.Group()
{
  const m = (c) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.85 })
  const camisa = m('#6a1d2a'), pantalon = m('#e9e1c8'), piel = m('#d8a57c'), gorra = m('#1a1a1a'), zapato = m('#f4eeda')
  const pierna = new THREE.CylinderGeometry(0.17, 0.15, 1.1, 6).translate(0, 0.55, 0)
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(pierna, pantalon); p.position.set(s * 0.24, 0.05, 0); golfista.add(p)
    const z = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.42), zapato); z.position.set(s * 0.24, 0.07, 0.08); golfista.add(z)
  }
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.3, 1.05, 7).translate(0, 0.52, 0), camisa)
  torso.position.y = 1.1
  torso.rotation.x = 0.28
  golfista.add(torso)
  const cabeza = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), piel)
  cabeza.position.set(0, 2.38, 0.22)
  const visera = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.32, 0.16, 10), gorra)
  visera.position.set(0, 2.55, 0.22)
  const ala = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.3), gorra)
  ala.position.set(0, 2.5, 0.5)
  golfista.add(cabeza, visera, ala)
  // los brazos y el palo giran juntos (el swing), en un plano inclinado hacia la pelota
  const planoSwing = new THREE.Group()
  planoSwing.position.set(0, 1.95, 0.25)
  planoSwing.rotation.x = -0.5
  planoSwing.add(brazos)
  const brazo = new THREE.CylinderGeometry(0.1, 0.09, 0.95, 6).translate(0, -0.47, 0)
  for (const s of [-1, 1]) { const b = new THREE.Mesh(brazo, camisa); b.position.x = s * 0.12; b.rotation.z = s * 0.12; brazos.add(b) }
  const palo = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.25, 5).translate(0, -0.62, 0), m('#b9b9b9'))
  palo.position.y = -0.9
  const cabezaPalo = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.38), m('#3a3a3a'))
  cabezaPalo.position.set(0, -1.25, 0.12)
  palo.add(cabezaPalo)
  brazos.add(palo)
  golfista.add(planoSwing)
  golfista.traverse((o) => { if (o.isMesh) o.castShadow = true })
  golfista.scale.setScalar(1.15)
  escena.add(golfista)
}
let swing = null // { t0, fase }
function poseGolfista(dt) {
  if (!golfista.visible) return
  let a = 0.15 // el palo, colgando
  if (swing) {
    const t = (performance.now() - swing.t0) / 1000
    if (t < 0.38) a = 0.15 - 2.6 * easeIO(t / 0.38) // para atrás
    else if (t < 0.52) a = -2.45 + 4.6 * ((t - 0.38) / 0.14) ** 2 // baja y pega
    else if (t < 1.1) a = 2.15 - 0.25 * Math.sin((t - 0.52) * 4) // termina arriba
    else a = 1.9
  }
  brazos.rotation.z = a
}

// ── los monos (la esencia: patrullan cerca de la calle; cuando la pelota cae cerca, saltan y gritan) ──
const monos = []
function crearMono() {
  const g = new THREE.Group()
  const m = (c) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.9 })
  const piel = m('#6b4423'), cara = m('#e2bc8f'), ojo = m('#120a05')
  const cuerpo = new THREE.Mesh(new THREE.IcosahedronGeometry(0.72, 0), piel); cuerpo.scale.set(1, 1.15, 0.9); cuerpo.position.y = 1.05
  const cabeza = new THREE.Mesh(new THREE.IcosahedronGeometry(0.58, 1), piel); cabeza.position.y = 2.05
  const frente = new THREE.Mesh(new THREE.IcosahedronGeometry(0.38, 1), cara); frente.scale.set(1, 0.8, 0.6); frente.position.set(0, 1.97, 0.4)
  for (const s of [-1, 1]) {
    const oreja = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), cara); oreja.position.set(s * 0.58, 2.12, 0); g.add(oreja)
    const o = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 5), ojo); o.position.set(s * 0.16, 2.12, 0.6); g.add(o)
    const pata = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.7, 5).translate(0, -0.35, 0), piel); pata.position.set(s * 0.32, 0.72, 0); pata.name = 'pata' + s; g.add(pata)
    const brazo = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.85, 5).translate(0, -0.42, 0), piel); brazo.position.set(s * 0.62, 1.45, 0); brazo.rotation.z = s * 0.35; brazo.name = 'brazo' + s; g.add(brazo)
  }
  const cola = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.8, -0.5), new THREE.Vector3(0, 0.6, -1.1), new THREE.Vector3(0, 1.2, -1.5), new THREE.Vector3(0, 1.7, -1.2), new THREE.Vector3(0, 1.6, -0.9)]), 16, 0.07, 5), piel)
  g.add(cuerpo, cabeza, frente, cola)
  g.traverse((o) => { if (o.isMesh) o.castShadow = true })
  g.scale.setScalar(1.3)
  escena.add(g)
  return g
}
HOYOS.forEach((h) => (h.monos ?? []).forEach((r) => monos.push({ g: crearMono(), a: r.a, b: r.b, fase: (r.fase ?? 0) * 0.37, salto: 0, mira: null, q: [...r.a], dir: 0 })))
function moverMonos(dt) {
  for (const m of monos) {
    const largo = dist(m.a, m.b)
    const s = (Math.sin(est.t * (3.2 / largo) + m.fase) + 1) / 2
    const q = [lerp(m.a[0], m.b[0], s), lerp(m.a[1], m.b[1], s)]
    const v = [q[0] - m.q[0], q[1] - m.q[1]]
    if (Math.hypot(...v) > 1e-4) m.dir = Math.atan2(v[0], v[1])
    m.q = q
    const p = adelante(q)
    let mira = m.dir
    if (m.mira) mira = Math.atan2(m.mira[0] - p[0], m.mira[1] - p[1])
    const dif = Math.atan2(Math.sin(mira - m.g.rotation.y), Math.cos(mira - m.g.rotation.y))
    m.g.rotation.y = Math.atan2(Math.sin(m.g.rotation.y + dif * Math.min(1, dt * 8)), Math.cos(m.g.rotation.y + dif * Math.min(1, dt * 8)))
    m.salto = Math.max(0, m.salto - dt)
    const brinco = m.salto > 0 ? Math.abs(Math.sin(m.salto * 9)) * 1.6 : Math.abs(Math.sin(est.t * 9 + m.fase)) * 0.18
    m.g.position.set(p[0], alturaEn(q) + brinco, p[1])
    const paso = Math.sin(est.t * 9 + m.fase)
    m.g.getObjectByName('pata-1').rotation.x = paso * 0.5
    m.g.getObjectByName('pata1').rotation.x = -paso * 0.5
    const arriba = m.salto > 0 ? -2.6 : paso * 0.4
    m.g.getObjectByName('brazo-1').rotation.x = arriba
    m.g.getObjectByName('brazo1').rotation.x = m.salto > 0 ? -2.6 : -paso * 0.4
    m.g.visible = armado(q) > 0.6
  }
}

// ── la cámara: un riel suave (y el sobrevuelo de TV en cada hoyo) ──
const cam = { pos: new THREE.Vector3(W / 2, 520, H + 260), mira: new THREE.Vector3(W / 2, 0, H / 2), obj: null, ruta: null, orbita: 0 }
const V3 = (x, y, z) => new THREE.Vector3(x, y, z)
function poseApuntar(qb, haciaQ) {
  const b = mundo(qb), d = norm([haciaQ[0] - b.x, haciaQ[1] - b.z])
  const largo = Math.min(dist([b.x, b.z], haciaQ), 260)
  const alto = 14 + largo * 0.1, atras = 18 + largo * 0.08
  // la pelota queda abajo, a ~17° del centro de la pantalla: el resto del hoyo, para arriba
  // (en pantallas anchas, menos: el campo vertical es más chico y abajo están los botones)
  const angBola = Math.atan2(alto, atras), angMira = Math.max(0.12, angBola - ((camara.fov / 2) * Math.PI / 180) * 0.55)
  const alcance = alto / Math.tan(angMira) - atras
  return { pos: V3(b.x - d[0] * atras, b.y + alto, b.z - d[1] * atras), mira: V3(b.x + d[0] * alcance, b.y, b.z + d[1] * alcance) }
}
function poseCancha() { return { pos: V3(W / 2, 470, H / 2 + 330), mira: V3(W / 2, 0, H / 2 + 10) } }
function seguir(pose, k = 3.2) { cam.obj = pose; cam.k = k }
function sobrevolar(puntos, dur = 3.2, alFinal = null) { cam.ruta = { puntos, t0: est.tReal, dur, alFinal } }
function moverCamara(dt) {
  if (cam.ruta) {
    const r = cam.ruta, u = clamp((est.tReal - r.t0) / r.dur, 0, 1), e = easeIO(u)
    const pos = new THREE.CatmullRomCurve3(r.puntos.map((p) => p.pos), false, 'centripetal').getPoint(e)
    const mira = new THREE.CatmullRomCurve3(r.puntos.map((p) => p.mira), false, 'centripetal').getPoint(e)
    cam.pos.copy(pos); cam.mira.copy(mira)
    if (u >= 1) { cam.ruta = null; cam.obj = r.puntos[r.puntos.length - 1]; r.alFinal?.() }
  } else if (cam.obj) {
    const a = 1 - Math.exp(-dt * (cam.k ?? 3.2))
    cam.pos.lerp(cam.obj.pos, a); cam.mira.lerp(cam.obj.mira, a)
  }
  camara.position.copy(cam.pos)
  if (cam.orbita) { // en el breakpoint, la cámara gira despacito alrededor de la pelota congelada
    const c = cam.mira, d = cam.pos.clone().sub(c), ang = cam.orbita
    camara.position.set(c.x + d.x * Math.cos(ang) - d.z * Math.sin(ang), cam.pos.y, c.z + d.x * Math.sin(ang) + d.z * Math.cos(ang))
  }
  camara.lookAt(cam.mira)
  const foco = cam.mira, r = clamp(camara.position.distanceTo(foco) * 0.75, 60, 300)
  sombraEn(foco.x, foco.z, Math.round(r / 10) * 10)
}
const mundo = (q) => { const p = adelante(q); return V3(p[0], alturaEn(q) + RADIO_BOLA, p[1]) }

// ── el juego ──
const juego = {
  hoyo: 0, golpes: 0, qBola: [0, 0], estado: 'armando', objetivo: null, vuelo: null, total: 0,
  ver: [1, 0], historial: [], poder: { revert: 1, bp: 1 }, tarjeta: [],
}
const hoyo = () => HOYOS[juego.hoyo]
const verTxt = () => `v${juego.ver[0]}.${juego.ver[1]}`
function pintarHud() {
  const h = hoyo()
  $('#h-tit').textContent = `HOYO ${h.n}`
  $('#h-par').textContent = `PAR ${h.par}`
  $('#h-yd').textContent = `${Math.round(dist(juego.qBola, h.pin) * (h.escala ?? 1))} YD`
  $('#ver-n').textContent = verTxt()
  $('#golpes').textContent = juego.golpes
  $('#revert-n').textContent = juego.poder.revert
  $('#revert').disabled = !(juego.estado === 'apuntar' && juego.poder.revert > 0 && juego.historial.length > 0)
  $('#pegar').disabled = !(juego.estado === 'apuntar' && juego.objetivo)
  const bp = $('#bp')
  bp.disabled = !(juego.estado === 'vuelo' && juego.poder.bp > 0) && juego.estado !== 'pausa'
  bp.classList.toggle('vivo', juego.estado === 'vuelo' && juego.poder.bp > 0)
  bp.innerHTML = juego.estado === 'pausa' ? '▶ continuar' : `⏸ debug <span class="n" id="bp-n">${juego.poder.bp}</span>`
  document.querySelectorAll('[data-hoyo]').forEach((b) => b.classList.toggle('on', +b.dataset.hoyo === juego.hoyo))
}
function saltaVersion() { const v = $('#ver'); v.classList.remove('salta'); void v.offsetWidth; v.classList.add('salta'); C.version() }

// LG relata (sin creérsela: el chiste es siempre a costa de Rorro)
const LG = {
  bueno: ['Bueno, por lo menos el juego lo hizo bien.', 'Aprobado. Que no se acostumbre.', 'Mirá vos, el diseñador sabe pegarle.', 'LGTM. Ni lo toquen.'],
  malo: ['El cliente siempre tiene razón.', 'Hizo la cancha y no la conoce.', 'Eso no estaba en el Figma.', 'Otra reunión más por ese tiro.'],
  bosque: ['Ese árbol lo dibujó él.', 'Se metió en su propio diseño.'],
  afuera: ['Fuera de límite. El límite también lo puso él.'],
  bp: ['Eso es trampa… pero la del mono.', 'Pausó el juego. En la vida real no se puede, Rorro.'],
  revert: ['Ctrl+Z en la vida real, por favor.', 'Revirtió. El cliente no se enteró.'],
  hoyo: ['¡A producción!', 'Deploy un viernes y anduvo. Milagro.'],
  inicio: ['Bienvenidos a la cancha de Rorro. Todavía está en beta.', 'Ojo que se mueve. Es un feature.'],
}
let lgT = null
function decir(tipo) {
  const l = LG[tipo]; if (!l) return
  $('#lg-txt').textContent = l[Math.floor(Math.random() * l.length)]
  $('#lg').classList.add('ve')
  clearTimeout(lgT); lgT = setTimeout(() => $('#lg').classList.remove('ve'), 4800)
}
function veredicto(txt, tipo) {
  const v = $('#veredicto')
  v.textContent = txt
  v.className = tipo
  void v.offsetWidth
  v.classList.add('ve')
  clearTimeout(veredicto.t); veredicto.t = setTimeout(() => v.classList.remove('ve'), 1400)
}
const hash = () => Math.random().toString(16).slice(2, 9)
function mostrarCommit({ tipo, titulo, lineas }) {
  const c = $('#commit')
  const desde = verTxt()
  c.innerHTML = `<div class="c1">● commit <b>${hash()}</b> · ${desde} → <b id="ver-sig"></b></div><div class="c2 ${tipo}">${titulo}</div>` +
    lineas.map(([cl, t], i) => `<div class="linea ${cl}" style="animation-delay:${0.15 + i * 0.16}s">${cl === 'mas' ? '+ ' : cl === 'menos' ? '− ' : '# '}${t}</div>`).join('')
  c.classList.add('ve')
  lineas.forEach((_, i) => setTimeout(() => { C.tecla(); C.datos(3, { vol: 0.045 }) }, 150 + i * 160))
  clearTimeout(mostrarCommit.t); mostrarCommit.t = setTimeout(() => c.classList.remove('ve'), 3800)
  return c
}

// ── las versiones: qué le hace a la cancha cada tiro ──
function cerca(q, centro) { return dist(q, centro) }
function nuevoBump(cx, cy, r, tipo, vx, vy, amp = 1) { return { id: idBump++, cx, cy, r, tipo, vx, vy, desde: 0, hasta: amp } }
/** El buen tiro: el cliente aprueba y se abre la calle (los costados se corren para afuera de la línea a la bandera). */
function versionAprobada(B, P) {
  const u = norm([P[0] - B[0], P[1] - B[1]]), n = [-u[1], u[0]], L = dist(B, P)
  const nuevos = []
  for (const t of [0.22, 0.42, 0.62, 0.82]) {
    if (t * L < 14) continue
    for (const s of [-1, 1]) {
      const c = [B[0] + u[0] * t * L + n[0] * s * 9, B[1] + u[1] * t * L + n[1] * s * 9]
      nuevos.push(nuevoBump(c[0], c[1], 13, 0, n[0] * s * 5.5, n[1] * s * 5.5))
    }
  }
  // y, si había, se revierte el último cambio del cliente
  const ultimo = [...juego.historial].reverse().find((v) => v.tipo === 'mal' && !v.revertido)
  return { tipo: 'ok', nuevos, quitar: ultimo ? ultimo.agregados : [], revierte: ultimo }
}
/** El tiro malo: cambios del cliente (dos de estos). */
const CLIENTE = {
  arbol(B, P) {
    const u = norm([P[0] - B[0], P[1] - B[1]]), n = [-u[1], u[0]], L = dist(B, P)
    let mejor = null
    for (const a of arboles) {
      const d = [a.q[0] - B[0], a.q[1] - B[1]], at = d[0] * u[0] + d[1] * u[1], pe = d[0] * n[0] + d[1] * n[1]
      if (at < L * 0.18 || at > L * 0.9 || Math.abs(pe) < 4 || Math.abs(pe) > 24) continue
      const costo = Math.abs(pe) + Math.abs(at - L * 0.5) * 0.15
      if (!mejor || costo < mejor.costo) mejor = { a, pe, costo }
    }
    if (!mejor) return null
    const m = -Math.sign(mejor.pe) * Math.min(Math.abs(mejor.pe) - 1, 10)
    return { cita: '¿Y si corremos ese árbol un poquito?', bumps: [nuevoBump(mejor.a.q[0], mejor.a.q[1], 8.5, 0, n[0] * m, n[1] * m)] }
  },
  bunker(B, P) {
    let mejor = null
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
      if (FILAS[y][x] !== 'b') continue
      const q = [x + 0.5, y + 0.5], d = cerca(q, P)
      if (d > dist(B, P) + 10) continue
      const costo = d + cerca(q, B) * 0.2
      if (!mejor || costo < mejor.costo) mejor = { q, costo }
    }
    if (!mejor) return null
    return { cita: 'El bunker lo veo chico.', bumps: [nuevoBump(mejor.q[0], mejor.q[1], 9, 1, 3.8, 0)] }
  },
  onda(B, P) {
    const u = norm([P[0] - B[0], P[1] - B[1]]), n = [-u[1], u[0]], L = dist(B, P)
    if (L < 40) return null
    const s0 = Math.random() < 0.5 ? -1 : 1
    const bumps = [0.4, 0.65, 0.88].map((t, i) => {
      const s = (i % 2 ? -1 : 1) * s0
      return nuevoBump(B[0] + u[0] * t * L, B[1] + u[1] * t * L, 18, 0, n[0] * s * 7, n[1] * s * 7)
    })
    return { cita: 'Démosle más onda a la calle.', bumps }
  },
  green(B, P) {
    if (dist(B, P) < 25) return null
    return { cita: 'El green, ¿no lo podemos achicar un toque?', bumps: [nuevoBump(P[0], P[1], 14, 1, -3, 0)] }
  },
}
function versionCliente(B, P) {
  const tipos = Object.keys(CLIENTE).sort(() => Math.random() - 0.5)
  const cambios = []
  for (const t of tipos) { const c = CLIENTE[t](B, P); if (c) cambios.push(c); if (cambios.length === 2) break }
  return { tipo: 'mal', nuevos: cambios.flatMap((c) => c.bumps), citas: cambios.map((c) => c.cita), quitar: [] }
}

/** Despliega una versión: el barrido recorre la cancha y, a su paso, todo queda en la versión nueva. */
function desplegar({ nuevos = [], quitar = [], bolaVieja, bolaNueva, rebobina = false, alFinal }) {
  for (const b of est.bumps) b.desde = b.hasta
  for (const id of quitar) { const b = est.bumps.find((x) => x.id === id); if (b) b.hasta = 0 }
  est.bumps.push(...nuevos)
  // si no entran todos, los más viejos se van en este mismo barrido
  while (est.bumps.filter((b) => b.hasta > 0).length > NB - 2) { const v = est.bumps.find((b) => b.hasta > 0); v.hasta = 0 }
  est.bumps = est.bumps.slice(-NB)
  est.bola0 = [...(bolaVieja ?? bolaNueva)]
  est.bola1 = [...bolaNueva]
  // la onda sale de la pelota y llega hasta la punta más lejana del mapa (en el revert, vuelve de afuera hacia la pelota)
  const o = bolaNueva
  const lejos = Math.max(...[[0, 0], [W, 0], [0, H], [W, H]].map((c) => dist(c, o))) + est.swBanda + 4
  est.swO = [...o]
  est.swSentido = rebobina ? -1 : 1
  est.rebobina = rebobina ? 1 : 0
  est.swVivo = 1
  const desdeA = rebobina ? lejos : -est.swBanda - 2, a1 = rebobina ? -est.swBanda - 2 : lejos, dur = 3.4
  est.swW = desdeA
  document.body.classList.toggle('rebobina', rebobina)
  const sonido = rebobina ? C.revert(dur) : C.deploy(dur)
  const t0 = est.tReal
  juego.barrido = () => {
    const u = clamp((est.tReal - t0) / dur, 0, 1)
    const e = rebobina ? easeIO(u) : u ** 1.35 // lenta cerca (lo que tenés adelante) y acelera para afuera
    est.swW = lerp(desdeA, a1, e)
    sonido?.avance(u)
    if (u >= 1) {
      juego.barrido = null
      sonido?.fin()
      for (const b of est.bumps) b.desde = b.hasta
      est.bumps = est.bumps.filter((b) => b.hasta > 0.001)
      est.bola0 = [...est.bola1]
      est.swW = 1e5; est.swSentido = 1; est.swVivo = 0; est.rebobina = 0
      document.body.classList.remove('rebobina')
      alFinal?.()
    }
  }
}

// ── apuntar y pegar ──
const raycaster = new THREE.Raycaster(), plano = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), _hit = new THREE.Vector3()
function alPiso(ev) {
  const r = lienzo.getBoundingClientRect()
  raycaster.setFromCamera(new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), camara)
  return raycaster.ray.intersectPlane(plano, _hit) ? [_hit.x, _hit.z] : null
}
const enGreen = () => letra(juego.qBola) === 'g'
function apuntarA(p) {
  const b = mundo(juego.qBola), B = [b.x, b.z]
  const max = enGreen() ? 45 : 270
  const d = dist(B, p)
  if (d < 2) return
  const u = norm([p[0] - B[0], p[1] - B[1]])
  const T = d > max ? [B[0] + u[0] * max, B[1] + u[1] * max] : p
  juego.objetivo = T
  const qT = inversa(T), y = alturaEn(qT)
  marca.position.set(T[0], y + 0.08, T[1])
  marca.visible = true
  dibujarArco([b.x, b.y, b.z], [T[0], y + 0.2, T[1]], enGreen() ? 0.15 : Math.min(36, 4 + dist(B, T) * 0.17))
  seguir(poseApuntar(juego.qBola, [lerp(B[0], T[0], 0.85), lerp(B[1], T[1], 0.85)]), 2.2)
  C.tap()
  pintarHud()
}
function pegar() {
  if (juego.estado !== 'apuntar' || !juego.objetivo) return
  C.despertar()
  juego.estado = 'swing'
  swing = { t0: performance.now() }
  pintarHud()
  setTimeout(salir, 520)
}
function salir() {
  const b = mundo(juego.qBola), B = [b.x, b.z], T = juego.objetivo
  const d = dist(B, T), putt = enGreen()
  const errAng = (putt ? 1.2 : 2.6 + d * 0.012) * (Math.PI / 180) * gauss()
  const errD = 1 + gauss() * (putt ? 0.05 : 0.065)
  const ang = Math.atan2(T[1] - B[1], T[0] - B[0]) + errAng
  const L = [B[0] + Math.cos(ang) * d * errD, B[1] + Math.sin(ang) * d * errD]
  juego.golpes++
  C.golpe(Math.min(1, d / 250), putt)
  marca.visible = false
  arco.visible = false
  chispas([b.x, b.y, b.z], 10, putt ? ['#bcd558'] : ['#6f9636', '#a2bc43', '#5d432c'], 4, 5)
  const dur = putt ? 0.5 + d / 14 : 0.95 + d / 140
  if (!putt) C.vuelo(dur)
  juego.vuelo = { desde: [b.x, b.y, b.z], hasta: L, t: 0, dur, alto: putt ? 0 : Math.min(36, 4 + d * 0.17), putt, dir: norm([L[0] - B[0], L[1] - B[1]]), d }
  estelaPts = []
  juego.estado = 'vuelo'
  for (const m of monos) m.mira = null
  pintarHud()
}
function moverVuelo(dt) {
  const v = juego.vuelo
  if (!v) return
  if (juego.estado === 'pausa') return
  v.t += dt
  const s = clamp(v.t / v.dur, 0, 1)
  const sx = v.putt ? 1 - (1 - s) ** 2 : s // el putt frena
  const x = lerp(v.desde[0], v.hasta[0], sx), z = lerp(v.desde[2], v.hasta[1], sx)
  const piso = alturaEn(inversa([x, z])) + RADIO_BOLA
  const y = (v.alt0 != null ? lerp(v.alt0, piso, s) : lerp(v.desde[1], piso, s)) + v.alto * 4 * s * (1 - s)
  bola.position.set(x, Math.max(y, piso), z)
  bola.rotation.x += dt * 14
  if (!v.putt) estelaPts.push([x, y, z])
  for (const m of monos) if (Math.hypot(m.g.position.x - x, m.g.position.z - z) < 40) m.mira = [x, z]
  // la cámara sigue a la pelota desde atrás y arriba
  if (!v.putt) seguir({ pos: V3(x - v.dir[0] * 34, Math.max(y, 0) + 26, z - v.dir[1] * 34), mira: V3(x + v.dir[0] * 16, Math.max(0, y * 0.4), z + v.dir[1] * 16) }, 3.5)
  if (s >= 1) aterrizar([x, z])
}
function aterrizar(L) {
  const v = juego.vuelo
  juego.vuelo = null
  // rueda un poco (en el green y la calle), frenando en lo que no rueda
  let fin = [...L]
  const q0 = inversa(L), t0 = letra(q0)
  if (!v.putt && 'fge'.includes(t0)) {
    const largo = v.d * (t0 === 'g' ? 0.07 : 0.05)
    for (let k = 1; k <= 20; k++) {
      const p = [L[0] + v.dir[0] * largo * (k / 20), L[1] + v.dir[1] * largo * (k / 20)]
      if (!'fge.'.includes(letra(inversa(p)))) break
      fin = p
    }
  }
  const qF = inversa(fin), tipo = letra(qF)
  const pin = hoyo().pin
  // ¿adentro? (pasó por el hoyo en el green, o cayó encima)
  const pasa = (() => {
    const a = L, b = fin, ab = [b[0] - a[0], b[1] - a[1]], l2 = ab[0] ** 2 + ab[1] ** 2 || 1
    const t = clamp(((pin[0] - a[0]) * ab[0] + (pin[1] - a[1]) * ab[1]) / l2, 0, 1)
    return dist([a[0] + ab[0] * t, a[1] + ab[1] * t], pin)
  })()
  const nombreT = { f: 'FAIRWAY', g: 'GREEN', e: 'TEE', '.': 'ROUGH', b: 'BUNKER', t: 'BOSQUE', x: 'AFUERA' }[tipo] ?? 'ROUGH'
  C.pique({ g: 'green', b: 'bunker' }[tipo] ?? 'calle', Math.min(1, v.d / 200))
  const y = alturaEn(qF)
  chispas([fin[0], y + 0.2, fin[1]], tipo === 'b' ? 26 : 14, tipo === 'b' ? ['#f4e6c4', '#e9d7a9'] : tipo === 'g' ? ['#cbe066', '#bcd558'] : ['#6f9636', '#3e6b1f', '#5d432c'], tipo === 'b' ? 7 : 4, tipo === 'b' ? 9 : 5)
  const segDist = (a, b, c) => { const ab = [b[0] - a[0], b[1] - a[1]], l2 = ab[0] ** 2 + ab[1] ** 2 || 1; const t = clamp(((c[0] - a[0]) * ab[0] + (c[1] - a[1]) * ab[1]) / l2, 0, 1); return dist([a[0] + ab[0] * t, a[1] + ab[1] * t], c) }
  const entra = v.putt ? (segDist([v.desde[0], v.desde[2]], fin, pin) < 0.45 && dist(fin, pin) < 3.2) || dist(fin, pin) < 0.55 : tipo === 'g' && (pasa < 0.5 || dist(fin, pin) < 0.55)
  if (entra) return embocar()
  let grito = false
  for (const m of monos) if (Math.hypot(m.g.position.x - fin[0], m.g.position.z - fin[1]) < 16) { m.salto = 1.2; grito = true }
  if (grito) setTimeout(() => C.mono(), 250)
  // el lie y lo que dice la cancha
  let qNueva = qF
  if (tipo === 'x') { qNueva = [...juego.qBola]; juego.golpes++; C.error(); veredicto('FUERA DE LÍMITE · +1', 'mal'); decir('afuera') }
  else if (tipo === 't') {
    // del bosque sale al rough más cercano
    let mejor = null
    for (let r = 1; r < 14 && !mejor; r++) for (let a = 0; a < 16; a++) {
      const p = [qF[0] + Math.cos(a * 0.39) * r, qF[1] + Math.sin(a * 0.39) * r]
      if ('.fg'.includes(letra(p))) { mejor = p; break }
    }
    qNueva = mejor ?? qF
    C.bosque(); veredicto('¡AL BOSQUE!', 'mal'); decir('bosque')
  } else veredicto(nombreT + ('fge'.includes(tipo) ? ' ✓' : ' ✗'), 'fge'.includes(tipo) ? 'ok' : 'mal')
  const bueno = 'fge'.includes(tipo)
  if (bueno) decir('bueno'); else if (tipo !== 'x' && tipo !== 't') decir('malo')
  // la cámara se abre para ver el deploy
  const P = hoyo().pin, mid = [lerp(qNueva[0], P[0], 0.45), lerp(qNueva[1], P[1], 0.45)]
  const largo = dist(qNueva, P)
  const dd = norm([P[0] - qNueva[0], P[1] - qNueva[1]])
  seguir({ pos: V3(mid[0] - dd[0] * (60 + largo * 0.5), 70 + largo * 0.55, mid[1] - dd[1] * (60 + largo * 0.5)), mira: V3(mid[0], 0, mid[1]) }, 2)
  juego.estado = 'deploy'
  juego.qVieja = [...juego.qBola]
  juego.qBola = [...qNueva]
  pintarHud()
  setTimeout(() => nuevaVersion(bueno, qNueva), 700)
}
/** Arma y despliega la versión que sigue (el buen tiro aprueba; el malo, cambios del cliente). */
function nuevaVersion(bueno, qNueva) {
  const P = hoyo().pin
  const v = bueno ? versionAprobada(qNueva, P) : versionCliente(qNueva, P)
  const lineas = bueno
    ? [['mas', 'se abre la calle'], ...(v.revierte ? [['menos', `revert: "${v.revierte.citas?.[0] ?? 'cambio del cliente'}"`]] : []), ['com', 'el cliente aprobó el diseño']]
    : v.citas.map((c) => ['mas', `"${c}"`]).concat([['com', 'pedido del cliente, urgente']])
  mostrarCommit({ tipo: v.tipo, titulo: bueno ? '✓ Aprobado · LGTM' : '✗ Cambios del cliente', lineas })
  if (v.revierte) v.revierte.revertido = true
  bueno ? C.aprobado() : C.cliente()
  const registro = { tipo: v.tipo, agregados: v.nuevos.map((b) => b.id), quitados: v.quitar.map((id) => ({ id, amp: est.bumps.find((b) => b.id === id)?.hasta ?? 1, b: est.bumps.find((b) => b.id === id) })), citas: v.citas, bolaAntes: [...juego.qBola] }
  desplegar({
    nuevos: v.nuevos, quitar: v.quitar, bolaVieja: juego.qVieja ?? qNueva, bolaNueva: qNueva,
    alFinal: () => {
      juego.historial.push(registro)
      juego.ver = [juego.ver[0], juego.ver[1] + 1]
      $('#ver-sig') && ($('#ver-sig').textContent = verTxt())
      saltaVersion()
      juego.qVieja = null
      listoParaApuntar()
    },
  })
  const sig = $('#ver-sig'); if (sig) sig.textContent = `v${juego.ver[0]}.${juego.ver[1] + 1}`
  if (juego.golpes >= 10) setTimeout(() => terminarHoyo(true), 2600)
}
function listoParaApuntar() {
  juego.estado = 'apuntar'
  juego.objetivo = null
  marca.visible = false
  arco.visible = false
  swing = null
  for (const m of monos) m.mira = null
  ubicarGolfista()
  seguir(poseApuntar(juego.qBola, hoyo().pin), 2.4)
  pintarHud()
}
function ubicarGolfista() {
  const b = mundo(juego.qBola), P = hoyo().pin
  const d = norm([P[0] - b.x, P[1] - b.z]), n = [-d[1], d[0]]
  golfista.visible = true
  golfista.position.set(b.x - n[0] * 1.5, alturaEn(juego.qBola), b.z - n[1] * 1.5)
  golfista.rotation.y = Math.atan2(n[0], n[1]) // mira a la pelota, de costado a la línea
}
function embocar() {
  C.embocada()
  const h = hoyo(), dif = juego.golpes - h.par
  const nombre = juego.golpes === 1 ? 'HOYO EN UNO' : { '-3': 'ALBATROS', '-2': 'EAGLE', '-1': 'BIRDIE', 0: 'PAR', 1: 'BOGEY', 2: 'DOBLE BOGEY' }[dif] ?? `+${dif}`
  veredicto(nombre, 'gol')
  decir('hoyo')
  const p = mundo(h.pin)
  chispas([p.x, p.y + 0.5, p.z], 90, ['#e8c34a', '#f4eeda', '#c8352e', '#2f5fd0'], 9, 16)
  bola.visible = false
  juego.estado = 'embocada'
  mostrarCommit({ tipo: 'ok', titulo: `🚀 ${verTxt()} en producción`, lineas: [['mas', `hoyo ${h.n}: ${juego.golpes} golpes (${nombre.toLowerCase()})`], ['com', 'merge a main']] })
  pintarHud()
  setTimeout(() => terminarHoyo(false), 3400)
}
function terminarHoyo() {
  juego.tarjeta[juego.hoyo] = juego.golpes
  empezarHoyo((juego.hoyo + 1) % HOYOS.length)
}
/** Un hoyo nuevo: la cancha vuelve a la v1.0 (una rama nueva) y el sobrevuelo de TV del green al tee. */
function empezarHoyo(i, { sinVuelo = false } = {}) {
  juego.hoyo = i
  const h = hoyo()
  juego.golpes = 0
  juego.ver = [1, 0]
  juego.historial = []
  juego.poder = { revert: 1, bp: 1 }
  const tee = h.tees?.blanca ?? h.tee
  juego.qBola = [...tee]
  juego.qVieja = null
  est.bumps = []
  est.bola0 = [...tee]; est.bola1 = [...tee]
  bola.visible = true
  golfista.visible = false
  marca.visible = false; arco.visible = false
  juego.estado = 'sobrevuelo'
  pintarHud()
  const fin = poseApuntar(tee, h.pin)
  if (sinVuelo) { cam.ruta = null; seguir(fin, 2.4); listoParaApuntar(); return }
  const P = h.pin, d = norm([P[0] - tee[0], P[1] - tee[1]])
  const mid = [lerp(tee[0], P[0], 0.5), lerp(tee[1], P[1], 0.5)]
  C.pasada(4.2)
  sobrevolar([
    { pos: cam.pos.clone(), mira: cam.mira.clone() },
    { pos: V3(P[0] + d[0] * 30, 42, P[1] + d[1] * 30), mira: V3(P[0], 0, P[1]) },
    { pos: V3(mid[0] + d[0] * 40 + d[1] * 30, 75, mid[1] + d[1] * 40 - d[0] * 30), mira: V3(mid[0], 0, mid[1]) },
    fin,
  ], 4.2, () => { listoParaApuntar(); decir('inicio') })
}

// ── superpoderes de dev ──
function breakpoint() {
  if (juego.estado === 'pausa') return continuar()
  if (juego.estado !== 'vuelo' || juego.poder.bp < 1 || !juego.vuelo) return
  juego.poder.bp--
  juego.estado = 'pausa'
  document.body.classList.add('pausa')
  C.pausa()
  const v = juego.vuelo
  v.destinoOrig = [...v.hasta]
  v.nuevo = [...v.hasta]
  cam.orbita = 0.0001
  decir('bp')
  pintarCodigo()
  pintarHud()
}
function pintarCodigo() {
  const v = juego.vuelo, p = bola.position
  const f = (n) => `<span class="num">${n.toFixed(1)}</span>`
  $('#codigo').innerHTML = `<span class="stop">● Pausado en el depurador</span> <span class="com">· tiro.js:42</span>\n` +
    `<span class="k">const</span> pelota = { x: ${f(p.x)}, y: ${f(p.z)}, alt: ${f(p.y)} }\n` +
    `pelota.<span class="s">destino</span> = { x: ${f(v.nuevo[0])}, y: ${f(v.nuevo[1])} } <span class="com">// ← arrastrá la cancha</span>`
}
function arrastrarDestino(p) {
  const v = juego.vuelo
  const resta = dist([bola.position.x, bola.position.z], v.destinoOrig)
  const maxR = Math.max(10, resta * 0.38)
  const d = [p[0] - v.destinoOrig[0], p[1] - v.destinoOrig[1]], l = Math.hypot(...d)
  v.nuevo = l > maxR ? [v.destinoOrig[0] + (d[0] / l) * maxR, v.destinoOrig[1] + (d[1] / l) * maxR] : p
  const qN = inversa(v.nuevo)
  marca.position.set(v.nuevo[0], alturaEn(qN) + 0.08, v.nuevo[1]); marca.visible = true
  dibujarArco([bola.position.x, bola.position.y, bola.position.z], [v.nuevo[0], alturaEn(qN) + 0.2, v.nuevo[1]], Math.max(2, bola.position.y * 0.35), '#ff8a7a')
  pintarCodigo()
}
function continuar() {
  const v = juego.vuelo
  document.body.classList.remove('pausa')
  cam.pos.copy(camara.position)
  cam.orbita = 0
  // sigue desde donde quedó, al destino nuevo, en lo que le quedaba de vuelo
  const resta = Math.max(0.35, v.dur - v.t)
  v.desde = [bola.position.x, bola.position.y, bola.position.z]
  v.alt0 = bola.position.y
  v.hasta = v.nuevo
  v.alto = Math.max(1.5, (bola.position.y - alturaEn(inversa(v.nuevo))) * 0.3)
  v.dir = norm([v.hasta[0] - v.desde[0], v.hasta[1] - v.desde[2]])
  v.t = 0; v.dur = resta
  marca.visible = false; arco.visible = false
  juego.estado = 'vuelo'
  C.seguir()
  pintarHud()
}
function gitRevert() {
  if (juego.estado !== 'apuntar' || juego.poder.revert < 1) return
  const ultimo = juego.historial.pop()
  if (!ultimo) return
  juego.poder.revert--
  juego.estado = 'deploy'
  decir('revert')
  mostrarCommit({ tipo: 'rev', titulo: `↩ git revert ${verTxt()}`, lineas: [['menos', ultimo.tipo === 'mal' ? `"${ultimo.citas?.[0] ?? 'cambios del cliente'}"` : 'se abre la calle'], ['com', `vuelve la v${juego.ver[0]}.${Math.max(0, juego.ver[1] - 1)}`]] })
  // lo que agregó, se va; lo que sacó, vuelve
  for (const q of ultimo.quitados) if (q.b && !est.bumps.includes(q.b)) { q.b.desde = 0; q.b.hasta = 0; est.bumps.push(q.b) }
  const vuelven = ultimo.quitados.map((q) => q.id)
  desplegar({
    nuevos: [], quitar: ultimo.agregados, bolaNueva: juego.qBola, rebobina: true,
    alFinal: () => { juego.ver = [juego.ver[0], Math.max(0, juego.ver[1] - 1)]; saltaVersion(); listoParaApuntar() },
  })
  for (const q of ultimo.quitados) { const b = est.bumps.find((x) => x.id === q.id); if (b) b.hasta = q.amp }
  void vuelven
  seguir({ pos: V3(W / 2, 360, H / 2 + 260), mira: V3(W / 2, 0, H / 2) }, 1.6)
  pintarHud()
}
function simular(bueno) {
  if (juego.estado !== 'apuntar') return
  juego.estado = 'deploy'
  veredicto(bueno ? 'SIMULADO ✓' : 'SIMULADO ✗', bueno ? 'ok' : 'mal')
  decir(bueno ? 'bueno' : 'malo')
  const P = hoyo().pin, q = juego.qBola, mid = [lerp(q[0], P[0], 0.45), lerp(q[1], P[1], 0.45)], d = norm([P[0] - q[0], P[1] - q[1]]), L = dist(q, P)
  seguir({ pos: V3(mid[0] - d[0] * (60 + L * 0.5), 70 + L * 0.55, mid[1] - d[1] * (60 + L * 0.5)), mira: V3(mid[0], 0, mid[1]) }, 2)
  pintarHud()
  setTimeout(() => nuevaVersion(bueno, juego.qBola), 600)
}

// ── la intro: la cancha se compila sola ──
function compilar() {
  const arb = arboles.length.toLocaleString('es-AR'), bunk = FILAS.join('').split('b').length - 1
  const lineas = [
    '<div class="tit">LA CANCHA DE <em>RORRO</em></div>',
    '<span class="p">$</span> npm run cancha',
    `<span class="dim">›</span> leyendo cancha-grid.js · <span class="ok">${W} × ${H}</span> yardas`,
    `<span class="dim">›</span> plantando <span class="ok">${arb}</span> árboles`,
    `<span class="dim">›</span> 3 greens con su caída · <span class="ok">${bunk.toLocaleString('es-AR')}</span> yardas de bunker`,
    `<span class="dim">›</span> soltando los monos <span class="ok">🐒 ×${monos.length}</span>`,
    '<span class="ok">✓ compilado</span> <span class="dim">· v1.0 (en desarrollo)</span>',
  ]
  const el = $('#compila')
  el.innerHTML = ''
  lineas.forEach((l, i) => setTimeout(() => { const d = document.createElement('div'); d.innerHTML = l; d.className = 'linea'; d.style.animation = 'entra .25s ease forwards'; el.appendChild(d); C.tecla(); C.datos(4 + i, { vol: 0.05 }) }, 120 + i * 420))
  C.compilar(4.4)
  const t0 = est.tReal
  // la cámara, como un dron, acompaña la ola de la compilación de abajo para arriba y se abre a la cancha entera
  const fin = poseCancha()
  sobrevolar([
    { pos: V3(W / 2 + 30, 46, H + 72), mira: V3(W / 2, 0, H - 30) },
    { pos: V3(W / 2 + 70, 95, H * 0.66), mira: V3(W / 2 - 5, 0, H * 0.44) },
    { pos: V3(W / 2 + 45, 175, H * 0.36 + 70), mira: V3(W / 2, 0, H * 0.22) },
    fin,
  ], 5.4)
  juego.armando = () => {
    const u = clamp((est.tReal - t0 - 0.5) / 3.8, 0, 1)
    est.armaW = lerp(-40, H + 90, easeIO(u))
    if (u >= 1) { juego.armando = null; terminarIntro() }
  }
}
function terminarIntro() {
  if (juego.estado !== 'armando') return
  juego.armando = null
  est.armaW = H + 200
  for (const a of arboles) if (a.popT < 0) a.popT = est.t - 1
  $('#compila').classList.add('fuera')
  $('#saltar').hidden = true
  document.body.classList.remove('intro')
  cam.ruta = null
  C.compilado()
  C.zumbido(1)
  empezarHoyo(0)
}

// ── los toques ──
let toque = null
lienzo.addEventListener('pointerdown', (e) => { C.despertar(); toque = { x: e.clientX, y: e.clientY, t: performance.now() }; if (juego.estado === 'pausa') { const p = alPiso(e); if (p) arrastrarDestino(p) } })
lienzo.addEventListener('pointermove', (e) => { if (toque && juego.estado === 'pausa') { const p = alPiso(e); if (p) arrastrarDestino(p) } })
lienzo.addEventListener('pointerup', (e) => {
  if (!toque) return
  const movio = Math.hypot(e.clientX - toque.x, e.clientY - toque.y)
  toque = null
  if (juego.estado === 'armando') return terminarIntro()
  if (juego.estado === 'boot') return
  if (movio > 10) return
  if (juego.estado === 'apuntar') { const p = alPiso(e); if (p) apuntarA(p) }
})
$('#pegar').onclick = pegar
$('#bp').onclick = breakpoint
$('#revert').onclick = gitRevert
$('#saltar').onclick = terminarIntro
document.querySelectorAll('[data-hoyo]').forEach((b) => (b.onclick = () => { if (['apuntar', 'embocada'].includes(juego.estado)) empezarHoyo(+b.dataset.hoyo) }))
let vistaCancha = false
$('#vista').onclick = () => {
  vistaCancha = !vistaCancha
  $('#vista').classList.toggle('on', vistaCancha)
  if (vistaCancha) seguir(poseCancha(), 2)
  else if (juego.estado === 'apuntar') seguir(juego.objetivo ? poseApuntar(juego.qBola, juego.objetivo) : poseApuntar(juego.qBola, hoyo().pin), 2.4)
}
$('#sonido').onclick = () => { C.alternar(); $('#sonido').textContent = C.sonando() ? '🔊' : '🔇' }
$('#sonido').textContent = C.sonando() ? '🔊' : '🔇'
$('#engranaje').onclick = () => $('#ajustes').classList.toggle('ve')
$('#sim-bueno').onclick = () => { $('#ajustes').classList.remove('ve'); simular(true) }
$('#sim-malo').onclick = () => { $('#ajustes').classList.remove('ve'); simular(false) }
$('#respira').onclick = () => { est.resp = est.resp ? 0 : 0.32; $('#respira').textContent = `~ respira: ${est.resp ? 'sí' : 'no'}` }
addEventListener('keydown', (e) => { if (e.key === 'F8' || e.key === ' ') { e.preventDefault(); if (juego.estado === 'pausa' || juego.estado === 'vuelo') breakpoint(); else pegar() } })

// ── el cuadro ──
function medir() {
  const w = innerWidth, h = innerHeight
  renderer.setSize(w, h, false)
  camara.aspect = w / h
  camara.fov = w / h < 0.75 ? 52 : 42
  camara.updateProjectionMatrix()
}
addEventListener('resize', medir)
medir()
est.t = 0; est.tReal = 0
let antes = performance.now()
const posAntes = new THREE.Vector3()
function cuadro(ahora) {
  requestAnimationFrame(cuadro)
  try { paso(ahora) } catch (e) { console.error(e) }
}
function paso(ahora) {
  const dtR = Math.min(PRUEBA ? 0.6 : 0.05, (ahora - antes) / 1000)
  antes = ahora
  est.tReal += dtR
  const congelado = juego.estado === 'pausa'
  const dt = congelado ? 0 : dtR
  est.t += dt
  if (congelado) cam.orbita += dtR * 0.18
  if (juego.estado === 'boot') { cam.pos.set(W / 2 + 30 + Math.sin(est.tReal * 0.25) * 14, 46 + Math.sin(est.tReal * 0.4) * 4, H + 72); cam.mira.set(W / 2, 0, H - 30 - Math.sin(est.tReal * 0.2) * 10) }
  juego.armando?.()
  juego.barrido?.()
  moverVuelo(dt)
  if (!juego.vuelo && juego.estado !== 'embocada') { const b = mundo(juego.qBola); bola.position.copy(b); bola.visible = armado(juego.qBola) > 0.7 }
  moverCamara(dtR)
  moverArboles(Math.max(dt, congelado ? 0 : 0))
  moverMonos(dt)
  moverBanderas()
  moverParticulas(dt)
  poseGolfista(dt)
  if (juego.estado === 'vuelo' || juego.estado === 'pausa') pintarEstela(); else if (estelaPts.length) { estelaPts.shift(); estelaPts.shift(); pintarEstela() }
  if (marca.visible) { const k = 1 + Math.sin(est.tReal * 5) * 0.08; marca.userData.aro.scale.set(k, 1, k) }
  // el sonido del movimiento: la cámara (servo y aire) y la cancha (raspa cuando se deforma o se compila)
  const velCam = dtR > 0 ? camara.position.distanceTo(posAntes) / dtR : 0
  posAntes.copy(camara.position)
  const armandose = juego.estado === 'armando' ? 0.45 : 0
  C.movimiento(congelado ? 0 : velCam, est.swVivo * 0.55 + Math.min(0.6, energiaArboles * 0.35) + armandose)
  subirUniforms()
  renderer.render(escena, camara)
}
// arranca: la cámara baja, al pie de la cancha en plano
cam.pos.set(W / 2 + 30, 46, H + 72)
cam.mira.set(W / 2, 0, H - 30)
juego.qBola = [...(HOYOS[0].tees?.blanca ?? HOYOS[0].tee)]
est.bola0 = [...juego.qBola]; est.bola1 = [...juego.qBola]
golfista.visible = false
pintarHud()
juego.estado = 'boot'
$('#compila').innerHTML = `<div class="tit">LA CANCHA DE <em>RORRO</em></div><div class="dim">// La Trampa del Mono, hecha en código.<br>// Cada tiro la rehace: el bueno se aprueba, el malo trae cambios del cliente.</div><button class="btn oro" id="arrancar">▶ COMPILAR</button><div class="dim chico">con sonido 🔊</div>`
$('#saltar').hidden = true
$('#arrancar').onclick = () => { C.despertar(); C.zumbido(0.5); juego.estado = 'armando'; $('#saltar').hidden = false; compilar() }
requestAnimationFrame(cuadro)
// para probar desde afuera
window.__rorro = { juego, est, arboles, camara, cam, bola, empezarHoyo, simular, apuntarA, pegar, breakpoint, continuar, gitRevert, terminarIntro, mundo, inversa, adelante }
