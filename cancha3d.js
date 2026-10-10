// 🥃 La cancha de Rorro, en 3D (three.js): lo que se ve cuando juega Rorro. El juego (juego.html) sigue siendo el de
// siempre (el HUD, la goma, el latido, el motor, el match, el ranking): esto solo dibuja la cancha, el golfista, la
// pelota y el clima en 3D, y le pasa al juego la cámara (para dibujar arriba la goma y la línea) y la grilla del motor
// de cada versión. La cancha está hecha en código y se rehace en cada tiro MIENTRAS VUELA LA PELOTA: el tiro bueno
// (soltado en el latido) se aprueba (se abre la calle, se arreglan los bugs, una skin prolija); el malo trae cambios
// del cliente (todo se mueve, otra paleta, otro tipo de árbol, otro dibujo del pasto y algún bug). Antes de que pique,
// la física ya juega en la versión nueva. Los greens no se mueven nunca (el putt es el putt) y su relieve sale de las
// caídas del motor (campo3d.js). Dos poderes de dev por hoyo: ⏸ debug (en el aire congela la pelota y le corrés el
// destino) y ↩ revert (vuelve la versión anterior). La primera vez, una intro: la cancha dibujada de siempre se pasa a
// una grilla y de la grilla se levanta en 3D.
import * as THREE from './intro/assets/vendor/three.module.min.js'
import * as M from './motor.js'
import * as C from './ciber.js'
import { campoBase, FILAS, W, H, N, clamp, lerp, ss, dist, norm, letraBase, CAPA, est, NB, avance, armado, adelante, adelanteQuieto, inversa, alturaEn, alturaBase, hornear, campoCon, SKINS, TIPOS_ARBOL, CAIDA_GREEN } from './campo3d.js'

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const col = (h) => new THREE.Color(h)
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const elastic = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1)
const elegir = (l) => l[Math.floor(Math.random() * l.length)]
const rndFijo = M.rngDesde(20261010)
const difAng = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b))
const HOYOS = M.HOYOS
const CERO = new THREE.Matrix4().makeScale(0, 0, 0)
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = V3(), _s = V3(), _v = V3()

// ── el mundo: la escena, la luz (de arriba a la izquierda del dibujo, como las sombras de la cancha) y la cámara ──
let renderer = null, lienzo = null
const escena = new THREE.Scene()
const FONDO = col('#0a2117')
escena.background = FONDO.clone()
escena.fog = new THREE.Fog(FONDO.clone(), 520, 1300)
const camara = new THREE.PerspectiveCamera(50, 1, 0.05, 2600)
const cielo = new THREE.HemisphereLight('#fff6df', '#5a7448', 1.15)
escena.add(cielo)
const sol = new THREE.DirectionalLight('#fff0d0', 2.6)
const SOL_DIR = V3(-1, 1.55, -1).normalize()
sol.castShadow = true
sol.shadow.mapSize.set(1024, 1024)
sol.shadow.bias = -0.0004
sol.shadow.normalBias = 0.35
sol.shadow.radius = 3
escena.add(sol, sol.target)
function sombraEn(cx, cz, r) {
  sol.target.position.set(cx, 0, cz)
  sol.position.set(cx + SOL_DIR.x * 200, SOL_DIR.y * 200, cz + SOL_DIR.z * 200)
  const c = sol.shadow.camera
  if (Math.abs(c.right - r) > 0.5) { c.left = -r; c.right = r; c.top = r; c.bottom = -r; c.near = 20; c.far = 560; c.updateProjectionMatrix() }
}

// ── las capas del mapa, como texturas para el shader ──
function textura(r, g, b, a) {
  const d = new Uint8Array(N * 4)
  for (let i = 0; i < N; i++) { d[i * 4] = r(i); d[i * 4 + 1] = g(i); d[i * 4 + 2] = b(i); d[i * 4 + 3] = a(i) }
  const t = new THREE.DataTexture(d, W, H, THREE.RGBAFormat, THREE.UnsignedByteType)
  t.magFilter = t.minFilter = THREE.LinearFilter
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
  t.needsUpdate = true
  return t
}
const b255 = (a, k = 1) => (i) => Math.round(clamp(a[i] * k, 0, 1) * 255)
const TEX1 = textura(b255(CAPA.calle), b255(CAPA.green), b255(CAPA.bunker), b255(CAPA.tee))
const TEX2 = textura(b255(CAPA.afuera), b255(CAPA.arbol), b255(CAPA.relieve, 0.5), b255(CAPA.collar))
const TEX3 = textura(b255(CAPA.quieta), () => 0, () => 0, () => 255)
const TEXN = (() => {
  const nx = new Float32Array(N), nz = new Float32Array(N)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const q = [x + 0.5, y + 0.5], e = 0.7
    const h0 = alturaBase(q), hx = alturaBase([q[0] + e, q[1]]), hz = alturaBase([q[0], q[1] + e])
    const a = -(hx - h0) / e, c = -(hz - h0) / e, l = Math.hypot(a, 1, c)
    nx[y * W + x] = a / l; nz[y * W + x] = c / l
  }
  const b = (a) => (i) => Math.round(clamp(a[i] * 0.5 + 0.5, 0, 1) * 255)
  return textura(b(nx), b(nz), () => 0, () => 255)
})()
// la caída del motor en los greens (para dónde y cuánto), para la grilla del putt: dirección en rg, fuerza en b
const TEXC = (() => {
  const C = CAIDA_GREEN, s = (i) => Math.hypot(C[i * 2], C[i * 2 + 1])
  return textura((i) => Math.round((C[i * 2] / (s(i) || 1)) * 127.5 + 127.5), (i) => Math.round((C[i * 2 + 1] / (s(i) || 1)) * 127.5 + 127.5), (i) => Math.round(clamp(s(i) / 1.3, 0, 1) * 255), (i) => (s(i) > 0 ? 255 : 0))
})()

// ── el terreno: una malla de una yarda, deformada y pintada en el shader (sobre el material estándar: luz y sombras) ──
const MARGEN = 24, PASO_MALLA = 1.5
function mallaTerreno() {
  const x0 = -MARGEN, z0 = -MARGEN, nx = Math.ceil((W + 2 * MARGEN) / PASO_MALLA), nz = Math.ceil((H + 2 * MARGEN) / PASO_MALLA)
  const pos = new Float32Array((nx + 1) * (nz + 1) * 3)
  let k = 0
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { pos[k++] = x0 + i * PASO_MALLA; pos[k++] = 0; pos[k++] = z0 + j * PASO_MALLA }
  const idx = new Uint32Array(nx * nz * 6)
  k = 0
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1
    idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3))
  g.setIndex(new THREE.BufferAttribute(idx, 1))
  g.boundingSphere = new THREE.Sphere(V3(W / 2, 0, H / 2), 420)
  return g
}
const paleta = (id) => SKINS[id].col.map(col)
const U = {
  uMask1: { value: TEX1 }, uMask2: { value: TEX2 }, uMask3: { value: TEX3 }, uNormal: { value: TEXN }, uTam: { value: new THREE.Vector2(W, H) },
  uBC: { value: Array.from({ length: NB }, () => new THREE.Vector4()) }, uBV: { value: Array.from({ length: NB }, () => new THREE.Vector4()) }, uNB: { value: 0 },
  uBolaQ: { value: new THREE.Vector2() },
  uSwO: { value: new THREE.Vector2() }, uSwSentido: { value: 1 }, uSwW: { value: 1e5 }, uSwBanda: { value: est.swBanda }, uSwVivo: { value: 0 }, uRebobina: { value: 0 },
  uT: { value: 0 }, uResp: { value: est.resp },
  uArmaO: { value: new THREE.Vector2(...est.armaO) }, uArmaD: { value: new THREE.Vector2(...est.armaD) }, uArmaW: { value: est.armaW }, uArmaBanda: { value: est.armaBanda },
  uSkA: { value: paleta('clasico') }, uSkB: { value: paleta('clasico') }, uPatA: { value: 0 }, uPatB: { value: 0 },
  uBug: { value: Array.from({ length: 4 }, () => new THREE.Vector4()) }, uBugV: { value: Array.from({ length: 4 }, () => new THREE.Vector4()) }, uNBug: { value: 0 },
  uNubes: { value: 0 }, uMojado: { value: 0 }, uSeco: { value: 0 }, uOscuro: { value: 0 }, uNieve: { value: 0 }, uNubeV: { value: new THREE.Vector2(1, 0.3) },
  uColPlano: { value: col('#071a12') }, uColOro: { value: col('#e8c34a') }, uColAzul: { value: col('#7fc4ff') }, uColNeon: { value: col('#38f2c8') },
  uDibujo: { value: null }, uDibTam: { value: new THREE.Vector2(219.5, 447.75) }, uDibW: { value: -50 }, uDibVivo: { value: 0 },
  uCaida: { value: TEXC }, uGrilla: { value: 0 },
}
const GLSL_COMUN = /* glsl */ `
#define NB ${NB}
uniform sampler2D uMask1; uniform sampler2D uMask2; uniform sampler2D uMask3; uniform sampler2D uNormal; uniform vec2 uTam;
uniform vec4 uBC[NB]; uniform vec4 uBV[NB]; uniform int uNB;
uniform vec2 uBolaQ;
uniform vec2 uSwO; uniform float uSwSentido; uniform float uSwW; uniform float uSwBanda; uniform float uSwVivo; uniform float uRebobina;
uniform float uT; uniform float uResp;
uniform vec2 uArmaO; uniform vec2 uArmaD; uniform float uArmaW; uniform float uArmaBanda;
varying vec2 vQ;
varying vec3 vMundo;
float avance(vec2 q) { float d = distance(q, uSwO); return clamp((uSwSentido > 0.0 ? uSwW - d : d - uSwW) / uSwBanda, 0.0, 1.0); }
float armado(vec2 q) { return clamp((uArmaW - dot(q - uArmaO, uArmaD)) / uArmaBanda, 0.0, 1.0); }
`
const GLSL_VERTICE = /* glsl */ `
vec2 desplazo(vec2 q) {
  float qq = texture(uMask3, q / uTam).r;
  if (qq < 0.001 || (uNB == 0 && uResp == 0.0)) return vec2(0.0); // los greens no se mueven: ni se calcula
  float k = avance(q);
  vec2 d = vec2(0.0);
  for (int i = 0; i < NB; i++) {
    if (i >= uNB) break;
    vec4 c = uBC[i]; vec4 v = uBV[i];
    float amp = mix(v.z, v.w, k);
    if (c.w > 1.5) { d += v.xy * sin(dot(q, c.xy) + c.z) * amp; continue; }
    vec2 e = q - c.xy;
    float w = exp(-dot(e, e) / (c.z * c.z)) * amp;
    d += (c.w < 0.5 ? v.xy : e / c.z * v.x) * w;
  }
  float r = uResp * smoothstep(3.0, 9.0, distance(q, uBolaQ));
  d.x += r * (sin(q.y * 0.061 + uT * 0.9) + 0.5 * sin(q.x * 0.11 - uT * 1.3));
  d.y += r * (cos(q.x * 0.07 + uT * 0.7) + 0.5 * cos(q.y * 0.09 + uT * 1.1));
  return d * qq;
}
vec2 inversa(vec2 p) { vec2 q = p; for (int i = 0; i < 3; i++) q = p - desplazo(q); return q; }
float alturaEn(vec2 q) {
  vec2 uv = q / uTam;
  vec4 a = texture(uMask1, uv); vec4 b = texture(uMask2, uv);
  float fw = smoothstep(0.3, 0.7, a.r), bk = smoothstep(0.25, 0.7, a.b), te = smoothstep(0.3, 0.7, a.a);
  float fu = smoothstep(0.3, 0.7, b.r);
  float h = fw * 0.1 + te * 0.35 + b.b * 2.0 - bk * 0.9 + b.g * 0.2;
  h = mix(h, -4.5, fu);
  h += uSwVivo * 0.9 * exp(-pow((distance(q, uSwO) - uSwW) / 3.2, 2.0)) * (1.0 - fu);
  return h * armado(q);
}
`
const GLSL_FRAGMENTO = /* glsl */ `
uniform vec3 uSkA[11]; uniform vec3 uSkB[11]; uniform float uPatA; uniform float uPatB;
uniform vec4 uBug[4]; uniform vec4 uBugV[4]; uniform int uNBug;
uniform float uNubes; uniform float uMojado; uniform float uSeco; uniform float uOscuro; uniform float uNieve; uniform vec2 uNubeV;
uniform vec3 uColPlano; uniform vec3 uColOro; uniform vec3 uColAzul; uniform vec3 uColNeon;
uniform sampler2D uDibujo; uniform vec2 uDibTam; uniform float uDibW; uniform float uDibVivo;
uniform sampler2D uCaida; uniform float uGrilla;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ruido(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
// una línea de grilla finita (sin moiré: se apaga cuando de lejos la grilla se vuelve muy densa)
float linea(vec2 q, float paso) {
  vec2 c = q / paso, w = max(fwidth(c), vec2(1e-4));
  vec2 g = abs(fract(c - 0.5) - 0.5) / w;
  return (1.0 - min(min(g.x, g.y), 1.0)) * (1.0 - smoothstep(0.12, 0.4, max(w.x, w.y)));
}
float contorno(float m) { return 1.0 - smoothstep(0.0, max(fwidth(m) * 1.4, 1e-3), abs(m - 0.5)); }
// franjas suaves (el corte del pasto: sin bordes de serrucho de lejos)
float franja(float x, float ancho) { float w = max(fwidth(x / ancho), 1e-4); return smoothstep(0.5 - w, 0.5 + w, abs(fract(x / ancho) - 0.5) * 2.0); }
// el dibujo del pasto en la calle: 0 franjas a lo largo · 1 diagonales · 2 cuadros · 3 pixelado · 4 ondas · 5 grilla
float patron(vec2 q, float pat) {
  if (pat < 0.5) return franja(q.x, 7.0);
  if (pat < 1.5) return franja(q.x + q.y, 8.0);
  if (pat < 2.5) return abs(franja(q.x, 6.0) - franja(q.y, 6.0));
  if (pat < 3.5) return step(0.5, hash(floor(q / 2.5)));
  if (pat < 4.5) return franja(q.y + sin(q.x * 0.08) * 5.0, 9.0);
  return linea(q, 4.0);
}
vec3 pinta(vec2 q, vec4 a, vec4 b, float arriba, vec3 P[11], float pat) {
  float fw = smoothstep(0.38, 0.62, a.r), gr = smoothstep(0.42, 0.62, a.g), bk = smoothstep(0.3, 0.6, a.b), te = smoothstep(0.38, 0.62, a.a);
  float fu = smoothstep(0.38, 0.62, b.r), ar = b.g, co = smoothstep(0.2, 0.7, b.a) * (1.0 - gr);
  vec2 qn = (pat > 2.5 && pat < 3.5) ? floor(q / 2.5) * 2.5 : q;
  float n = ruido(qn * 0.3) * 0.55 + ruido(qn * 1.3) * 0.3 + ruido(qn * 6.0) * 0.15;
  float r = patron(q, pat);
  // el rough: dos tonos con ruido, más oscuro abajo de los árboles
  vec3 c = mix(P[0], P[1], n);
  c *= 1.0 - 0.35 * ar;
  // la calle: el corte en franjas
  c = mix(c, mix(P[2], P[3], r) * (0.95 + 0.1 * n), fw);
  // el collar del green: el pasto un poco más largo, entre la calle y el green
  c = mix(c, mix(P[4], P[2], 0.45) * (0.9 + 0.08 * n), co);
  // el green: corte fino cruzado (como los de verdad), parejito
  float cruz = (pat > 4.5 || (pat > 2.5 && pat < 3.5)) ? r : 0.5 * (franja(q.x + q.y * 0.35, 2.2) + franja(q.y - q.x * 0.35, 2.2));
  c = mix(c, mix(P[4], P[5], cruz) * (0.97 + 0.05 * ruido(q * 2.5)), gr);
  c = mix(c, P[7] * (0.94 + 0.12 * franja(q.y, 2.0)), te);
  // el bunker: arena con grano y las marcas del rastrillo
  float rastrillo = 0.5 + 0.5 * sin(q.x * 3.1 + sin(q.y * 0.7) * 2.0);
  c = mix(c, P[6] * (0.9 + 0.06 * ruido(q * 7.0) + 0.05 * rastrillo), bk);
  float borde = max(4.0 * smoothstep(0.2, 0.8, a.r) * (1.0 - smoothstep(0.2, 0.8, a.r)), 4.0 * smoothstep(0.2, 0.8, a.g) * (1.0 - smoothstep(0.2, 0.8, a.g)));
  c *= 1.0 - 0.1 * borde;
  // los costados empinados (el borde del bunker, la losa): la tierra
  c = mix(c, P[10] * (0.85 + 0.2 * ruido(q * vec2(0.6, 2.5))), (1.0 - smoothstep(0.42, 0.8, arriba)) * (1.0 - fu * 0.6));
  c = mix(c, mix(P[8], P[9], franja(q.x + q.y, 9.0)), fu * smoothstep(0.75, 0.95, arriba));
  return c;
}
vec3 colorTerreno(vec2 q) {
  vec2 uv = q / uTam;
  vec4 a = texture(uMask1, uv); vec4 b = texture(uMask2, uv);
  float arriba = abs(normalize(cross(dFdx(vMundo), dFdy(vMundo))).y);
  float k = avance(q);
  vec3 c = pinta(q, a, b, arriba, uSkB, uPatB);
  if (k < 0.999) c = mix(pinta(q, a, b, arriba, uSkA, uPatA), c, k);
  // los bugs simulados: textura faltante, z-fighting, wireframe y el NaN
  for (int i = 0; i < 4; i++) {
    if (i >= uNBug) break;
    vec4 g = uBug[i];
    float amp = mix(uBugV[i].x, uBugV[i].y, k);
    float adentro = (1.0 - smoothstep(g.z - 1.2, g.z, distance(q, g.xy))) * amp;
    if (adentro < 0.001) continue;
    vec3 bug;
    if (g.w < 0.5) bug = mod(floor(q.x / 1.2) + floor(q.y / 1.2), 2.0) > 0.5 ? vec3(1.0, 0.0, 1.0) : vec3(0.02);
    else if (g.w < 1.5) bug = mix(c, vec3(1.0) - c, step(0.5, fract(q.x * 0.9 + q.y * 0.45 + floor(uT * 16.0) * 0.37)));
    else if (g.w < 2.5) bug = vec3(0.02, 0.05, 0.03) + vec3(0.2, 1.0, 0.45) * linea(q, 1.5);
    else bug = floor(c * 3.0) / 3.0 + vec3(0.35, 0.0, 0.25) * step(0.5, fract(uT * 3.0));
    c = mix(c, bug, adentro);
  }
  // el clima
  float fu = smoothstep(0.38, 0.62, b.r);
  if (uNieve > 0.0) {
    float fwg = max(smoothstep(0.38, 0.62, a.r), smoothstep(0.38, 0.62, a.g));
    vec3 blanco = vec3(0.86, 0.9, 0.95) * (0.95 + 0.07 * ruido(q * 0.8));
    c = mix(c, blanco, uNieve * mix(0.94, 0.45, fwg) * (1.0 - fu * 0.25));
  }
  c = mix(c, c * vec3(1.14, 1.0, 0.7), uSeco * (1.0 - 0.6 * smoothstep(0.38, 0.62, a.g)));
  c *= 1.0 - 0.18 * uMojado;
  if (uNubes > 0.0) {
    float s = smoothstep(0.45, 0.72, ruido((q + uNubeV * uT) * 0.011) * 0.65 + ruido((q - uNubeV * uT * 0.6) * 0.03) * 0.35);
    c *= 1.0 - 0.34 * uNubes * s;
  }
  c *= 1.0 - 0.3 * uOscuro;
  // la grilla: antes de levantarse, la cancha es una grilla oscura con el contorno de cada cosa en neón
  float kb = armado(q);
  if (kb < 1.0) {
    float bordes = clamp(contorno(a.r) + contorno(a.g) + contorno(a.b) + contorno(b.r) + 0.5 * contorno(b.g), 0.0, 1.0);
    vec3 plano = uColPlano * (1.0 + 0.7 * smoothstep(0.4, 0.6, b.g)) + uColNeon * (0.22 * linea(q, 10.0) + 0.07 * linea(q, 2.0)) + uColOro * 0.9 * bordes;
    c = mix(plano, c, kb);
  }
  return c;
}
// el dibujo de la cancha (el del juego de siempre): adelante de la onda que lo pasa a la grilla
float delDibujo(vec2 q) { return uDibVivo * smoothstep(uDibW - 2.5, uDibW + 2.5, q.y); }
vec3 colorDibujo(vec2 q) {
  vec2 uv = vec2(q.x / uDibTam.x, 1.0 - q.y / uDibTam.y);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return uColPlano;
  return texture(uDibujo, uv).rgb;
}
vec3 brillo(vec2 q) {
  float kb = armado(q);
  float frente = exp(-pow((dot(q - uArmaO, uArmaD) - uArmaW) / 2.2, 2.0));
  vec3 e = uColOro * frente * 1.5 * step(kb, 0.999);
  float k = avance(q);
  float fs = exp(-pow((distance(q, uSwO) - uSwW) / 2.0, 2.0)) * uSwVivo;
  float banda = k * (1.0 - k) * 4.0 * uSwVivo;
  vec3 tono = mix(uColOro, uColAzul, uRebobina);
  e += tono * (fs * 1.8 + banda * 0.5 * linea(q, 5.0));
  if (uDibVivo > 0.0) {
    float kd = delDibujo(q);
    e += colorDibujo(q) * kd * 0.92;
    e += uColNeon * exp(-pow((q.y - uDibW) / 1.6, 2.0)) * 2.2 * uDibVivo;
  }
  // la grilla del green en el putt (como en el Mario Golf): una grilla de una yarda y luces que bajan con la caída
  // del motor (la que sigue la pelota): donde cae poco, celestes y lentas; donde cae mucho, doradas y rápidas
  if (uGrilla > 0.001) {
    vec4 c = texture(uCaida, q / uTam);
    if (c.a > 0.02) {
      vec2 dir = normalize(c.rg * 2.0 - 1.0 + vec2(1e-5));
      float fuerza = c.b;
      float lin = linea(q, 1.0);
      float fase = fract(dot(q, dir) * 0.3 - uT * (0.35 + 1.1 * fuerza));
      float luz = smoothstep(0.0, 0.06, fase) * (1.0 - smoothstep(0.06, 0.4, fase));
      vec3 tono = mix(vec3(0.55, 0.95, 1.0), uColOro * 1.15, smoothstep(0.25, 0.85, fuerza));
      e += (vec3(0.09) + tono * 1.4 * luz) * lin * smoothstep(0.02, 0.6, c.a) * uGrilla;
    }
  }
  return e;
}
`
const matTerreno = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0 })
matTerreno.onBeforeCompile = (sh) => {
  Object.assign(sh.uniforms, U)
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', `#include <common>\n${GLSL_COMUN}\n${GLSL_VERTICE}`)
    .replace('#include <beginnormal_vertex>', `
      vec2 q = inversa(position.xz);
      vQ = q;
      float h0 = alturaEn(q);
      vec2 nn = texture(uNormal, q / uTam).rg * 2.0 - 1.0;
      vec3 objectNormal = normalize(mix(vec3(0.0, 1.0, 0.0), vec3(nn.x, sqrt(max(0.0, 1.0 - dot(nn, nn))), nn.y), armado(q)));`)
    .replace('#include <begin_vertex>', 'vec3 transformed = vec3(position.x, h0, position.z);\nvMundo = transformed;')
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>\n${GLSL_COMUN}\n${GLSL_FRAGMENTO}`)
    .replace('#include <color_fragment>', 'diffuseColor.rgb = colorTerreno(vQ) * (1.0 - delDibujo(vQ));')
    .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += brillo(vQ);')
}
// (adentro de la boca del hoyo no: ahí se ve el vaso)
Object.assign(matTerreno, { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc })
const terreno = new THREE.Mesh(mallaTerreno(), matTerreno)
terreno.receiveShadow = true
terreno.frustumCulled = false
escena.add(terreno)

// ── el estado de la cancha de cada versión: la skin (paleta, patrón y árbol) y los bugs, de antes (A) y de ahora (B) ──
const cancha = { skinA: 'clasico', skinB: 'clasico', bugsA: [], bugsB: [], arbolBugA: new Map(), arbolBugB: new Map(), monoBug: null }
function subirUniforms() {
  const bs = est.bumps.slice(-NB)
  bs.forEach((b, i) => { U.uBC.value[i].set(b.cx, b.cy, b.r, b.tipo); U.uBV.value[i].set(b.vx, b.vy, b.desde, b.hasta) })
  U.uNB.value = bs.length
  U.uBolaQ.value.set(...est.bola)
  U.uSwO.value.set(...est.swO); U.uSwSentido.value = est.swSentido; U.uSwW.value = est.swW; U.uSwBanda.value = est.swBanda; U.uSwVivo.value = est.swVivo; U.uRebobina.value = est.rebobina
  U.uT.value = est.t; U.uResp.value = est.resp
  U.uArmaW.value = est.armaW
  const bugs = [...cancha.bugsA.filter((b) => b.suelo != null && !cancha.bugsB.includes(b)).map((b) => [b, 1, 0]), ...cancha.bugsB.filter((b) => b.suelo != null).map((b) => [b, cancha.bugsA.includes(b) ? 1 : 0, 1])].slice(0, 4)
  bugs.forEach(([b, d, h], i) => { U.uBug.value[i].set(b.c[0], b.c[1], b.r, b.suelo); U.uBugV.value[i].set(d, h, 0, 0) })
  U.uNBug.value = bugs.length
}
function ponerSkins(a, b) {
  cancha.skinA = a; cancha.skinB = b
  U.uSkA.value = paleta(a); U.uSkB.value = paleta(b)
  U.uPatA.value = SKINS[a].patron; U.uPatB.value = SKINS[b].patron
}

// ── los árboles: uno por cada manchón de copa del mapa, de seis tipos (cambian con la skin), con resorte ──
const arboles = []
{
  const celdas = []
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (FILAS[y][x] === 't') celdas.push([x + 0.5, y + 0.5])
  for (let i = celdas.length - 1; i > 0; i--) { const j = Math.floor(rndFijo() * (i + 1)); [celdas[i], celdas[j]] = [celdas[j], celdas[i]] }
  const cuad = new Map(), CQ = 4
  for (const c of celdas) {
    const r = 1.35 + rndFijo() * 0.9
    const q = [c[0] + (rndFijo() - 0.5) * 0.8, c[1] + (rndFijo() - 0.5) * 0.8]
    let choca = false
    for (let dx = -1; dx <= 1 && !choca; dx++) for (let dy = -1; dy <= 1 && !choca; dy++) {
      for (const o of cuad.get(`${Math.floor(q[0] / CQ) + dx},${Math.floor(q[1] / CQ) + dy}`) ?? []) if (dist(o.q, q) < (o.r + r) * 0.82) { choca = true; break }
    }
    if (choca) continue
    const a = { q, r, alto: 1.1 + rndFijo() * 0.9, tono: rndFijo(), fase: rndFijo() * 6.28, giro: rndFijo() * 6.28, pos: [...q], vel: [0, 0], popT: -1, skin: 'clasico', swap: null, bug: null }
    arboles.push(a)
    const k = `${Math.floor(q[0] / CQ)},${Math.floor(q[1] / CQ)}`; if (!cuad.has(k)) cuad.set(k, []); cuad.get(k).push(a)
  }
}
function unir(...gs) {
  const ps = gs.map((g) => (g.index ? g.toNonIndexed() : g))
  const n = ps.reduce((s, g) => s + g.attributes.position.count, 0)
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3)
  let o = 0
  for (const g of ps) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count }
  const r = new THREE.BufferGeometry()
  r.setAttribute('position', new THREE.BufferAttribute(pos, 3)); r.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  return r
}
const GEO_ARBOL = {
  redondo: unir(new THREE.IcosahedronGeometry(1, 0), new THREE.IcosahedronGeometry(0.62, 0).translate(0.45, 0.42, 0.2), new THREE.IcosahedronGeometry(0.58, 0).translate(-0.42, 0.3, -0.28)),
  pino: unir(new THREE.ConeGeometry(1.05, 1.9, 7).translate(0, -0.2, 0), new THREE.ConeGeometry(0.78, 1.5, 7).translate(0, 0.6, 0), new THREE.ConeGeometry(0.5, 1.1, 7).translate(0, 1.25, 0)),
  cubo: new THREE.BoxGeometry(1.45, 1.45, 1.45),
  chupetin: new THREE.IcosahedronGeometry(0.95, 1),
  cristal: new THREE.OctahedronGeometry(1.05, 0).scale(0.8, 1.5, 0.8),
  cactus: unir(new THREE.CylinderGeometry(0.42, 0.48, 2.6, 7), new THREE.CylinderGeometry(0.2, 0.22, 0.9, 5).rotateZ(Math.PI / 2).translate(0.55, 0.05, 0), new THREE.CylinderGeometry(0.21, 0.23, 0.9, 5).translate(0.98, 0.4, 0), new THREE.CylinderGeometry(0.19, 0.21, 0.75, 5).rotateZ(Math.PI / 2).translate(-0.5, -0.25, 0), new THREE.CylinderGeometry(0.19, 0.21, 0.75, 5).translate(-0.86, 0.08, 0)),
}
const PARAM_ARBOL = { redondo: { tronco: 1, alto: 0.62 }, pino: { tronco: 0.55, alto: 0.95 }, cubo: { tronco: 1, alto: 0.72 }, chupetin: { tronco: 1.7, alto: 0.95 }, cristal: { tronco: 0.35, alto: 1.25 }, cactus: { tronco: 0, alto: 1.3 } }
/** Con nieve, las caras que miran para arriba quedan blancas (las copas y los techos). */
function nevable(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNieve = U.uNieve
    sh.vertexShader = 'varying float vNy;\n' + sh.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
      #ifdef USE_INSTANCING
        vNy = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal).y;
      #else
        vNy = normalize(mat3(modelMatrix) * objectNormal).y;
      #endif`)
    sh.fragmentShader = 'varying float vNy;\nuniform float uNieve;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.95, 0.99), uNieve * smoothstep(0.3, 0.7, vNy) * 0.92);`)
  }
}
// Una malla por tipo, con los árboles de ese tipo juntos al principio (`count`): así se dibujan solo los que hay
// (antes se dibujaban los 1.454 de los seis tipos, la mayoría achicados a cero: era lo que trababa)
const copas = {}
for (const tipo of TIPOS_ARBOL) {
  const mat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: tipo === 'cristal' ? 0.25 : 0.85, metalness: tipo === 'cristal' ? 0.35 : 0 })
  nevable(mat)
  const m = new THREE.InstancedMesh(GEO_ARBOL[tipo], mat, arboles.length)
  m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false
  m.setColorAt(0, col('#3a6b24'))
  m.count = 0
  copas[tipo] = m
  escena.add(m)
}
const troncos = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.26, 1, 6).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: '#5b3f26', roughness: 1 }), arboles.length)
troncos.castShadow = true; troncos.frustumCulled = false
troncos.count = 0
escena.add(troncos)
const tipoDe = (skin) => SKINS[skin].arbol
function colorArbol(a, skin) { const v = SKINS[skin].verdes; return col(v[Math.floor(a.tono * v.length) % v.length]).offsetHSL(0, 0, (a.tono - 0.5) * 0.05) }
for (const a of arboles) { a.color = colorArbol(a, 'clasico'); a.colorDe = null }
let energiaArboles = 0
// los árboles se mueven solo cuando pasa algo (una versión, un revert, la intro, el cambio de hoyo); el resto del
// tiempo quedan quietos y no se recalculan (salvo los que flotan por un bug)
let despiertoHasta = 0
const despertarArboles = (seg = 2.5) => { despiertoHasta = Math.max(despiertoHasta, tReal + seg) }
function matrizCopa(a, tipo, esc, reves, flota, sy, sxz, aplasta, r, yc) {
  _e.set(clamp(a.vel[1] * 0.05, -0.4, 0.4) + reves, a.giro + (a.bug === 'flota' ? tReal * 1.5 : 0), -clamp(a.vel[0] * 0.05, -0.4, 0.4))
  _q.setFromEuler(_e)
  _p.set(a.pos[0], yc, a.pos[1])
  _s.set(r * esc * (1 + aplasta * 0.5) * sxz, r * esc * 0.95 * (1 - aplasta) * sy, r * esc * (1 + aplasta * 0.5) * sxz)
  return _m.compose(_p, _q, _s)
}
function moverArboles(dt) {
  const hayFlota = cancha.arbolBugA.size || cancha.arbolBugB.size
  if (tReal > despiertoHasta && !barrido && !intro) {
    // dormidos: solo los que flotan (en su lugar de siempre)
    if (hayFlota) for (const a of arboles) {
      if (a.bug !== 'flota' || a.slot == null) continue
      const flota = 5 + Math.sin(tReal * 1.7 + a.fase) * 0.8, P = PARAM_ARBOL[tipoDe(a.skin)], r = a.r
      const yc = a.suelo + a.alto * r * 0.55 * P.tronco + r * P.alto + flota
      copas[tipoDe(a.skin)].setMatrixAt(a.slot, matrizCopa(a, tipoDe(a.skin), 1, 0, flota, 1, 1, 0, r, yc))
      copas[tipoDe(a.skin)].instanceMatrix.needsUpdate = true
    }
    energiaArboles = 0
    return
  }
  let suma = 0, animando = false
  const n = Object.fromEntries(TIPOS_ARBOL.map((t) => [t, 0]))
  let nt = 0
  for (let i = 0; i < arboles.length; i++) {
    const a = arboles[i]
    const obj = adelanteQuieto(a.q)
    const kx = (obj[0] - a.pos[0]) * 70, ky = (obj[1] - a.pos[1]) * 70
    a.vel[0] = (a.vel[0] + kx * dt) * Math.exp(-7 * dt); a.vel[1] = (a.vel[1] + ky * dt) * Math.exp(-7 * dt)
    a.pos[0] += a.vel[0] * dt; a.pos[1] += a.vel[1] * dt
    if (a.popT < 0 && armado(a.q) > 0.55) a.popT = tReal
    const k = avance(a.q)
    const quiere = k > 0.5 ? cancha.skinB : cancha.skinA
    if (quiere !== a.skin) {
      a.swap = { de: a.skin, t0: tReal }
      a.colorDe = a.color
      a.skin = quiere
      a.color = colorArbol(a, quiere)
    }
    a.bug = (k > 0.5 ? cancha.arbolBugB : cancha.arbolBugA).get(i) ?? null
    const pop = a.popT < 0 ? 0 : elastic(Math.min(1, (tReal - a.popT) / 0.9))
    const sw = a.swap ? Math.min(1, (tReal - a.swap.t0) / 0.55) : 1
    if (a.swap && sw >= 1) { a.swap = null; a.colorDe = null }
    if (a.swap || (a.popT >= 0 && tReal - a.popT < 1)) animando = true
    const v = Math.hypot(a.vel[0], a.vel[1])
    suma += v
    if (v > 0.02) animando = true
    const aplasta = Math.min(0.28, v * 0.035)
    a.suelo = alturaEn(a.q)
    const tipo = tipoDe(a.skin), P = PARAM_ARBOL[tipo]
    const r = a.r * pop
    a.slot = null
    if (r <= 0.001) continue
    let sy = 1, sxz = 1, flota = 0, reves = 0
    if (a.bug === 'flota') flota = 5 + Math.sin(tReal * 1.7 + a.fase) * 0.8
    if (a.bug === 'estirado') { sy = 3.2; sxz = 0.55 }
    if (a.bug === 'reves') reves = Math.PI
    const tronco = a.alto * r * 0.55 * P.tronco
    const yc = a.suelo + tronco + r * P.alto * (1 - aplasta) * sy + flota
    // la copa nueva crece con rebote; la vieja se achica
    const poner = (t, esc, color) => {
      if (esc <= 0.001) return
      const m = copas[t], j = n[t]++
      m.setMatrixAt(j, matrizCopa(a, t, esc, reves, flota, sy, sxz, aplasta, r, yc))
      m.setColorAt(j, color)
      if (t === tipo && !a.swap) a.slot = j
    }
    poner(tipo, a.swap ? elastic(sw) : 1, a.color)
    if (a.swap) poner(tipoDe(a.swap.de), 1 - easeIO(sw), a.colorDe ?? a.color)
    if (P.tronco) {
      _p.set(a.pos[0], a.suelo - 0.1 + flota, a.pos[1])
      _s.set(pop, tronco + 0.25, pop)
      troncos.setMatrixAt(nt++, _m.compose(_p, _q.setFromEuler(_e.set(reves, 0, 0)), _s))
    }
  }
  for (const t of TIPOS_ARBOL) { const m = copas[t]; m.count = n[t]; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true }
  troncos.count = nt
  troncos.instanceMatrix.needsUpdate = true
  energiaArboles = suma / arboles.length
  if (animando) despertarArboles(0.6)
}

// ── la bandera y el hoyo: un agujero de verdad en el green (con su vaso blanco adentro, donde la pelota cae y se ve en
// el fondo) y el palo con la bandera numerada que flamea con el viento ──
const TELA = { roja: ['#c8352e', '#f4eeda'], blanca: ['#f4eeda', '#14402a'], azul: ['#2f5fd0', '#f4eeda'] }
// adentro del hoyo: el vaso (arriba, el borde blanco; después, oscuro hasta el fondo)
function texturaVaso() {
  const c = document.createElement('canvas'); c.width = 16; c.height = 128
  const g = c.getContext('2d')
  const gr = g.createLinearGradient(0, 0, 0, 128)
  gr.addColorStop(0, '#f6f4ec'); gr.addColorStop(0.24, '#dcd8ca'); gr.addColorStop(0.27, '#5d625a'); gr.addColorStop(0.6, '#3a3e38'); gr.addColorStop(1, '#22251f')
  g.fillStyle = gr; g.fillRect(0, 0, 16, 128)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  return t
}
const TEXTURAS_TELA = new Map()
function texturaTela(n, color) {
  const k = `${n}-${color}`
  if (TEXTURAS_TELA.has(k)) return TEXTURAS_TELA.get(k)
  const [fondo, letra] = TELA[color] ?? TELA.roja
  const c = document.createElement('canvas'); c.width = 256; c.height = 168
  const g = c.getContext('2d')
  g.fillStyle = fondo; g.fillRect(0, 0, 256, 168)
  g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, 0, 14, 168)
  g.fillStyle = letra; g.font = '120px Anton, Impact, "Arial Narrow", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillText(String(n), 136, 92)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
  TEXTURAS_TELA.set(k, t)
  return t
}
const TEX_VASO = texturaVaso()
/**
 * El hoyo, arcade (como en el Mario Golf): grande, del tamaño de la boca del motor (`bocaHoyo`, la que atrapa la
 * pelota) menos un poco. Así lo que se ve es lo que pasa, sin achicar nada cerca del hoyo (eso parecía un imán): la
 * pelota que el motor mete ya está colgando del borde; la que pasa de largo, pasa rozando. Es un agujero de verdad: el
 * green no se dibuja adentro (con el stencil: la boca marca y el terreno se saltea), y adentro está el vaso.
 */
const RADIO_BOLA = 0.17 // arcade: grande al lado del muñeco, como en el Mario Golf
const RADIO_TAZA = 0.53
const HONDO_TAZA = 0.55 // (bajito, como en los juegos: la pelota del fondo se ve)
const PALO_R = 0.04 // el palo de la bandera (queda puesto: la pelota cae al lado)
let pinActual = null
const ALTO_PALO = 4.4 // arcade: alta, que se vea de lejos (y en el putt queda puesta)
const TAM_TELA = [1.25, 0.82]
const banderas = HOYOS.map((h) => {
  const g = new THREE.Group()
  // el agujero: la boca marca el stencil (antes que nada) y el terreno no se dibuja ahí; el vaso y el fondo, solo ahí
  const enBoca = { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.EqualStencilFunc }
  const boca = new THREE.Mesh(new THREE.CircleGeometry(RADIO_TAZA, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp }))
  boca.position.y = 0.012
  boca.renderOrder = -2
  const vaso = new THREE.Mesh(new THREE.CylinderGeometry(RADIO_TAZA, RADIO_TAZA, HONDO_TAZA, 40, 1, true).translate(0, 0.012 - HONDO_TAZA / 2, 0), new THREE.MeshBasicMaterial({ map: TEX_VASO, side: THREE.BackSide, ...enBoca }))
  const fondo = new THREE.Mesh(new THREE.CircleGeometry(RADIO_TAZA, 40).rotateX(-Math.PI / 2).translate(0, 0.012 - HONDO_TAZA, 0), new THREE.MeshBasicMaterial({ color: '#1e211c', ...enBoca }))
  vaso.renderOrder = fondo.renderOrder = -1
  const taza = new THREE.Group()
  taza.add(boca, vaso, fondo)
  const palo = new THREE.Group()
  const vara = new THREE.Mesh(new THREE.CylinderGeometry(0.034, PALO_R, ALTO_PALO + HONDO_TAZA, 10).translate(0, (ALTO_PALO - HONDO_TAZA) / 2, 0), new THREE.MeshStandardMaterial({ color: '#f5f2e6', roughness: 0.3 })) // (hasta el fondo del hoyo)
  const anillos = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.043, 0.6, 10).translate(0, 0.3 + ALTO_PALO * 0.2, 0), new THREE.MeshStandardMaterial({ color: '#c8352e', roughness: 0.4 }))
  const punta = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), new THREE.MeshStandardMaterial({ color: '#e8c34a', roughness: 0.25, metalness: 0.6 }))
  punta.position.y = ALTO_PALO + 0.04
  const geoTela = new THREE.PlaneGeometry(TAM_TELA[0], TAM_TELA[1], 14, 5).translate(TAM_TELA[0] / 2, 0, 0)
  const tela = new THREE.Mesh(geoTela, new THREE.MeshStandardMaterial({ map: texturaTela(h.n, 'roja'), side: THREE.DoubleSide, roughness: 0.75 }))
  tela.position.set(0.04, ALTO_PALO - TAM_TELA[1] / 2 - 0.04, 0)
  for (const o of [vara, anillos, punta, tela]) o.castShadow = true
  palo.add(vara, anillos, punta, tela)
  // el borde del hoyo (blanco, que se ve aunque el green esté lejos) y el pulso que lo marca cuando la pelota anda cerca
  const aro = new THREE.Mesh(new THREE.RingGeometry(RADIO_TAZA * 0.99, RADIO_TAZA * 1.1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#f6f3e8', transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }))
  aro.position.y = 0.014
  const pulsos = [0, 1].map(() => {
    const m = new THREE.Mesh(new THREE.RingGeometry(1, 1.16, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4 }))
    m.position.y = 0.02
    m.renderOrder = 4
    return m
  })
  g.add(taza, aro, ...pulsos, palo)
  g.userData = { tela, palo, aro, pulsos, base: geoTela.attributes.position.array.slice(), color: null, tiembla: 0, marca: 0 }
  escena.add(g)
  return g
})
function moverBanderas(dt, st) {
  const r = st.ronda
  const v = r?.viento ?? { ang: 0.6, kmh: 8 }
  const fuerza = clamp(v.kmh / 22, 0.08, 1)
  ;(r?.hoyos ?? HOYOS).forEach((h, i) => {
    const g = banderas[i]
    g.position.set(h.pin[0], alturaEn(h.pin), h.pin[1])
    g.visible = armado(h.pin) > 0.7
    const { tela, base, palo } = g.userData
    const colorTela = h.bandera ?? M.colorBandera?.(h, h.pin) ?? 'roja'
    if (g.userData.color !== colorTela) { g.userData.color = colorTela; tela.material.map = texturaTela(h.n, colorTela); tela.material.needsUpdate = true }
    const p = tela.geometry.attributes.position
    const tt = est.t * (3 + 9 * fuerza)
    for (let k = 0; k < p.count; k++) {
      const x = base[k * 3], u = x / TAM_TELA[0], xr = u * 0.62
      p.array[k * 3 + 2] = (Math.sin(xr * 6 - tt + i) * 0.09 * u * (0.3 + fuerza) + Math.sin(xr * 12 - tt * 1.7) * 0.02 * u) * 2
      p.array[k * 3 + 1] = base[k * 3 + 1] - u * u * 0.27 * 2 * (1 - fuerza)
      p.array[k * 3] = x * (0.55 + 0.45 * fuerza)
    }
    p.needsUpdate = true
    tela.geometry.computeVertexNormals()
    g.userData.tiembla = Math.max(0, g.userData.tiembla - dt)
    const tiembla = Math.sin(g.userData.tiembla * 40) * g.userData.tiembla * 0.12
    palo.rotation.y = -v.ang + Math.sin(est.t * 0.8 + i) * 0.06 * fuerza
    palo.rotation.z = tiembla
    // el hoyo que se juega, marcado: de cerca (en el putt, o a tiro del green) late con dos aros que se abren
    const { aro, pulsos } = g.userData
    const cerca = !!r && i === r.idx && !r.terminada && st.estado !== 'resultado' && st.estado !== 'fin' && (st.enPutt || dist(r.pelota, h.pin) < 60)
    g.userData.marca += ((cerca ? 1 : 0) - g.userData.marca) * Math.min(1, dt * 4)
    const mk = g.userData.marca
    aro.material.opacity = 0.75 + 0.25 * mk
    // adentro: un aro grande y dorado que se abre (una vez)
    const boom = g.userData.boom ?? 0
    if (boom > 0) g.userData.boom = Math.max(0, boom - dt * 1.4)
    pulsos.forEach((m, j) => {
      const u = (est.t * 0.7 + j * 0.5) % 1
      if (boom > 0) {
        const ub = 1 - boom + j * 0.12
        m.visible = ub < 1
        m.scale.setScalar(RADIO_TAZA * (1.1 + 7 * ub))
        m.material.color.set('#ffd257')
        m.material.opacity = 0.9 * (1 - ub) ** 1.2
        return
      }
      m.material.color.set('#ffffff')
      m.visible = mk > 0.01
      m.scale.setScalar(RADIO_TAZA * (1.05 + 2.6 * u))
      m.material.opacity = 0.6 * mk * (1 - u) ** 1.5
    })
  })
}

// ── la pelota (arcade; de lejos se agranda lo justo para que se vea), su sombra, el tee y el trazador ──
function texturaDimples() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64
  const g = c.getContext('2d')
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 64)
  for (let y = 0; y < 64; y += 5) for (let x = (y / 5) % 2 ? 2.5 : 0; x < 128; x += 5) { g.fillStyle = 'rgba(150,160,170,.28)'; g.beginPath(); g.arc(x, y, 1.6, 0, 7); g.fill() }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  return t
}
const bola = new THREE.Mesh(new THREE.SphereGeometry(RADIO_BOLA, 20, 14), new THREE.MeshStandardMaterial({ color: '#ffffff', map: texturaDimples(), roughness: 0.35, emissive: '#ffffff', emissiveIntensity: 0.18 }))
bola.castShadow = true
escena.add(bola)
const sombraBola = new THREE.Mesh(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.32, depthWrite: false }))
sombraBola.renderOrder = 3
escena.add(sombraBola)
const ALTO_TEE = 0.11 // (la pelota apoyada arriba del tee)
const teePeg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.016, ALTO_TEE + 0.015, 8).translate(0, (ALTO_TEE + 0.015) / 2, 0), new THREE.MeshStandardMaterial({ color: '#f4eeda', roughness: 0.5 }))
teePeg.visible = false
escena.add(teePeg)
const fantasma = new THREE.Mesh(new THREE.SphereGeometry(RADIO_BOLA, 14, 10), new THREE.MeshBasicMaterial({ color: '#9fd3f7', transparent: true, opacity: 0.55, depthWrite: false }))
fantasma.visible = false
escena.add(fantasma)
// el trazador del vuelo (como en la tele): una cinta que sigue a la pelota desde que sale, y se apaga cuando para
const MAXT = 220
const trazoGeo = new THREE.BufferGeometry()
trazoGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXT * 2 * 3), 3))
trazoGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAXT * 2 * 4), 4))
{ const idx = []; for (let i = 0; i < MAXT - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) } trazoGeo.setIndex(idx) }
const trazo = new THREE.Mesh(trazoGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }))
trazo.frustumCulled = false
trazo.renderOrder = 5
escena.add(trazo)
let trazoPts = [], trazoColor = col('#fff1c9'), trazoApaga = null
const _td = V3(), _tv = V3(), _tl = V3()
function pintarTrazo() {
  const p = trazoGeo.attributes.position.array, c = trazoGeo.attributes.color.array
  const n = Math.min(trazoPts.length, MAXT), pts = trazoPts.slice(-n)
  const apaga = trazoApaga == null ? 1 : Math.max(0, 1 - (tReal - trazoApaga) / 1.4)
  const cam = camara.position
  for (let i = 0; i < MAXT; i++) {
    const j = Math.min(i, n - 1), s = pts[j]
    if (!s || n < 2) { p.fill(0, i * 6, i * 6 + 6); c.fill(0, i * 8, i * 8 + 8); continue }
    const sig = pts[Math.min(n - 1, j + 1)], ant = pts[Math.max(0, j - 1)]
    const d = _td.set(sig[0] - ant[0], sig[1] - ant[1], sig[2] - ant[2]).normalize()
    const vista = _tv.set(cam.x - s[0], cam.y - s[1], cam.z - s[2])
    const lejos = vista.length()
    const ancho = Math.max(0.03, lejos * 0.0024) // ~1 px de cada lado
    const lado = _tl.copy(d).cross(vista.normalize()).normalize().multiplyScalar(ancho)
    p[i * 6] = s[0] + lado.x; p[i * 6 + 1] = s[1] + lado.y; p[i * 6 + 2] = s[2] + lado.z
    p[i * 6 + 3] = s[0] - lado.x; p[i * 6 + 4] = s[1] - lado.y; p[i * 6 + 5] = s[2] - lado.z
    const a = i >= n ? 0 : (0.08 + 0.92 * (i / n) ** 1.6) * apaga
    for (const o of [0, 4]) { c[i * 8 + o] = trazoColor.r * a; c[i * 8 + o + 1] = trazoColor.g * a; c[i * 8 + o + 2] = trazoColor.b * a; c[i * 8 + o + 3] = a }
  }
  trazoGeo.attributes.position.needsUpdate = true
  trazoGeo.attributes.color.needsUpdate = true
}
// las chispitas (el pasto que salta, la arena, la nieve, el polvo, el agua)
const MAXP = 220
const parts = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.06), new THREE.MeshStandardMaterial({ roughness: 0.8 }), MAXP)
parts.frustumCulled = false
parts.setColorAt(0, new THREE.Color()) // (el color por chispa, de entrada: si no, la primera chispa recompila el shader)
escena.add(parts)
const vivas = []
function chispas(pos, n, colores, fuerza = 3, arriba = 3, tam = 1) {
  for (let i = 0; i < n; i++) {
    if (vivas.length >= MAXP) vivas.shift()
    const a = Math.random() * Math.PI * 2, f = fuerza * (0.4 + Math.random() * 0.8)
    vivas.push({ p: [...pos], v: [Math.cos(a) * f, arriba * (0.6 + Math.random() * 0.7), Math.sin(a) * f], vida: 0.7 + Math.random() * 0.8, t: 0, rot: Math.random() * 6, col: col(colores[i % colores.length]), tam: (0.6 + Math.random() * 0.8) * tam })
  }
}
function moverParticulas(dt) {
  for (const v of vivas) {
    v.t += dt
    v.v[1] -= 14 * dt
    v.p[0] += v.v[0] * dt; v.p[1] += v.v[1] * dt; v.p[2] += v.v[2] * dt
    const piso = alturaEn(inversa([v.p[0], v.p[2]])) + 0.03
    if (v.p[1] < piso) { v.p[1] = piso; v.v[0] *= 0.5; v.v[2] *= 0.5; v.v[1] = Math.abs(v.v[1]) * 0.25 }
  }
  for (let i = vivas.length - 1; i >= 0; i--) if (vivas[i].t > vivas[i].vida) vivas.splice(i, 1)
  for (let i = 0; i < MAXP; i++) {
    const v = vivas[i]
    if (!v) { parts.setMatrixAt(i, CERO); continue }
    const k = (1 - (v.t / v.vida) ** 3) * v.tam * escalaVista()
    _q.setFromEuler(_e.set(v.rot + v.t * 9, v.t * 7, 0))
    parts.setMatrixAt(i, _m.compose(_p.set(...v.p), _q, _s.set(k, k, k)))
    parts.setColorAt(i, v.col)
  }
  parts.instanceMatrix.needsUpdate = true
  if (parts.instanceColor) parts.instanceColor.needsUpdate = true
}

// ── Rorro: gorra negra, barba, chomba bordó, pantalón negro y zapatillas negras con suela blanca (como en la foto) ──
// El muñeco es de verdad (1,80 m): de frente a +z, el objetivo hacia +x (es diestro). El swing es el del juego (`sv`
// de la goma: atrás con la potencia, al soltar baja, pega y termina): las manos van por un círculo en el plano del
// swing y el palo con la muñeca quebrada; los brazos, con IK. Con el palo en el piso (sv = 0), la cabeza del palo
// queda justo atrás de la pelota.
function telaTextura(base, hilo, paso = 4, tipo = 'pique') {
  const c = document.createElement('canvas'); c.width = c.height = 128
  const g = c.getContext('2d')
  g.fillStyle = base; g.fillRect(0, 0, 128, 128)
  if (tipo === 'pique') for (let y = 0; y < 128; y += paso) for (let x = (y / paso) % 2 ? paso / 2 : 0; x < 128; x += paso) { g.fillStyle = hilo; g.beginPath(); g.arc(x, y, paso * 0.32, 0, 7); g.fill() }
  else for (let i = -128; i < 256; i += paso) { g.strokeStyle = hilo; g.lineWidth = 1; g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke() }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); t.anisotropy = 4
  return t
}
function pielTextura() {
  const c = document.createElement('canvas'); c.width = c.height = 64
  const g = c.getContext('2d')
  g.fillStyle = '#c98e6c'; g.fillRect(0, 0, 64, 64)
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${150 + Math.random() * 60},${90 + Math.random() * 40},${70 + Math.random() * 30},.08)`; g.fillRect(Math.random() * 64, Math.random() * 64, 2, 2) }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}
function barbaTextura() {
  const c = document.createElement('canvas'); c.width = c.height = 128
  const g = c.getContext('2d')
  g.fillStyle = '#3a2a1f'; g.fillRect(0, 0, 128, 128)
  for (let i = 0; i < 1600; i++) { const x = Math.random() * 128, y = Math.random() * 128; g.strokeStyle = `rgba(${20 + Math.random() * 40},${14 + Math.random() * 25},${10 + Math.random() * 15},.55)`; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 2, y + 2 + Math.random() * 3); g.stroke() }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2)
  return t
}
const MAT = {
  polo: new THREE.MeshStandardMaterial({ color: '#ffffff', map: telaTextura('#6b1f2b', 'rgba(40,6,14,.35)', 5), roughness: 0.9 }),
  cuello: new THREE.MeshStandardMaterial({ color: '#5a1824', roughness: 0.85 }),
  pantalon: new THREE.MeshStandardMaterial({ color: '#ffffff', map: telaTextura('#16171b', 'rgba(255,255,255,.035)', 3, 'sarga'), roughness: 0.82 }),
  cinto: new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.45, metalness: 0.1 }),
  hebilla: new THREE.MeshStandardMaterial({ color: '#c9ccd1', roughness: 0.25, metalness: 0.9 }),
  piel: new THREE.MeshStandardMaterial({ color: '#ffffff', map: pielTextura(), roughness: 0.62 }),
  barba: new THREE.MeshStandardMaterial({ color: '#ffffff', map: barbaTextura(), roughness: 1 }),
  pelo: new THREE.MeshStandardMaterial({ color: '#2b1f17', roughness: 0.95 }),
  ojo: new THREE.MeshStandardMaterial({ color: '#160e09', roughness: 0.3 }),
  gorra: new THREE.MeshStandardMaterial({ color: '#141518', roughness: 0.7 }),
  logo: new THREE.MeshStandardMaterial({ color: '#e9e9e9', roughness: 0.6 }),
  zapa: new THREE.MeshStandardMaterial({ color: '#17181c', roughness: 0.55 }),
  suela: new THREE.MeshStandardMaterial({ color: '#f1f1ee', roughness: 0.7 }),
  media: new THREE.MeshStandardMaterial({ color: '#2a2b30', roughness: 0.9 }),
  guante: new THREE.MeshStandardMaterial({ color: '#f4f2ea', roughness: 0.75 }),
  reloj: new THREE.MeshStandardMaterial({ color: '#0e0e10', roughness: 0.4 }),
  grip: new THREE.MeshStandardMaterial({ color: '#1b1b1d', roughness: 0.8 }),
  vara: new THREE.MeshStandardMaterial({ color: '#2a2c31', roughness: 0.3, metalness: 0.5 }),
  varaAcero: new THREE.MeshStandardMaterial({ color: '#c8ccd2', roughness: 0.2, metalness: 0.95 }),
  driver: new THREE.MeshStandardMaterial({ color: '#16171a', roughness: 0.18, metalness: 0.4 }),
  hierro: new THREE.MeshStandardMaterial({ color: '#d6d9de', roughness: 0.18, metalness: 0.95 }),
}
/** Una cápsula de `largo` entre 0 e y=largo (para ponerla entre dos puntos con `entre`). */
const capsula = (r, largo, seg = 10) => new THREE.CapsuleGeometry(r, Math.max(0.001, largo), 4, seg).translate(0, largo / 2, 0)
const _Y = V3(0, 1, 0), _eje = V3()
function entre(obj, a, b) {
  obj.position.copy(a)
  _v.subVectors(b, a)
  const l = _v.length()
  obj.quaternion.setFromUnitVectors(_Y, _v.normalize())
  return l
}
const PALOS = {
  driver: { L: 1.0, lie: (48 * Math.PI) / 180, x: 0.13 },
  hierro: { L: 0.88, lie: (55 * Math.PI) / 180, x: 0.04 },
  wedge: { L: 0.84, lie: (58 * Math.PI) / 180, x: 0.0 },
  putter: { L: 0.8, lie: (66 * Math.PI) / 180, x: 0.04 },
}
const CABEZA_PALO = 1.7
const ESCALA_RORRO = 2.25 // arcade: más grande que de verdad (los palos con él), que se vea el swing
const rorro = (() => {
  const g = new THREE.Group()
  g.visible = false
  escena.add(g)
  const add = (geo, mat, padre = g) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; padre.add(m); return m }
  // las piernas (quietas: el swing es de la cintura para arriba), con zapatillas
  const cadera = V3(0, 0.95, -0.06)
  const piernas = []
  for (const s of [-1, 1]) {
    const hip = V3(s * 0.1, 0.93, -0.06), rod = V3(s * 0.135, 0.5, 0.07), tob = V3(s * 0.165, 0.1, -0.01)
    const muslo = add(capsula(0.078, hip.distanceTo(rod)), MAT.pantalon); entre(muslo, hip, rod)
    const canilla = add(capsula(0.064, rod.distanceTo(tob)), MAT.pantalon); entre(canilla, rod, tob)
    const media = add(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 10), MAT.media); media.position.copy(tob).add(V3(0, -0.01, 0))
    const zapa = new THREE.Group(); zapa.position.set(tob.x, 0, tob.z + 0.02); zapa.rotation.y = s * 0.12; g.add(zapa)
    const capellada = add(new THREE.CapsuleGeometry(0.048, 0.2, 4, 10).rotateX(Math.PI / 2).scale(1.05, 0.85, 1), MAT.zapa, zapa); capellada.position.set(0, 0.058, 0.04)
    const suela = add(new THREE.BoxGeometry(0.11, 0.028, 0.31), MAT.suela, zapa); suela.position.set(0, 0.014, 0.04)
    piernas.push({ zapa })
  }
  // la cadera y el cinto
  const pelvis = new THREE.Group(); pelvis.position.copy(cadera); g.add(pelvis)
  add(new THREE.SphereGeometry(0.17, 16, 12).scale(1.12, 0.78, 0.82), MAT.pantalon, pelvis)
  const cinto = add(new THREE.CylinderGeometry(0.175, 0.175, 0.045, 18).scale(1.06, 1, 0.8), MAT.cinto, pelvis); cinto.position.y = 0.09
  const hebilla = add(new THREE.BoxGeometry(0.05, 0.035, 0.012), MAT.hebilla, pelvis); hebilla.position.set(0, 0.09, 0.145)
  // el torso: inclinado hacia la pelota y gira con el swing (alrededor de la columna)
  const INCLINA = (34 * Math.PI) / 180
  const columna = new THREE.Group(); columna.position.copy(cadera).add(V3(0, 0.06, 0)); columna.rotation.x = INCLINA; g.add(columna)
  const torso = new THREE.Group(); columna.add(torso)
  const perfil = [[0.0, 0.0], [0.168, 0.0], [0.172, 0.08], [0.168, 0.2], [0.18, 0.33], [0.2, 0.44], [0.19, 0.52], [0.14, 0.58], [0.07, 0.61], [0.0, 0.62]].map(([r, y]) => new THREE.Vector2(r, y))
  const chomba = add(new THREE.LatheGeometry(perfil, 24).scale(1.18, 1, 0.8), MAT.polo, torso)
  const cuello = add(new THREE.TorusGeometry(0.062, 0.022, 8, 18).rotateX(Math.PI / 2), MAT.cuello, torso); cuello.position.set(0, 0.6, 0.01)
  const tapeta = add(new THREE.BoxGeometry(0.035, 0.13, 0.01), MAT.cuello, torso); tapeta.position.set(0, 0.52, 0.152); tapeta.rotation.x = -0.32
  const HOMBRO = 0.53, ANCHO = 0.2
  // el cuello y la cabeza (mira la pelota; después del impacto, sigue la pelota)
  const nuca = add(capsula(0.05, 0.1), MAT.piel, torso); nuca.position.set(0, 0.58, 0)
  const cabeza = new THREE.Group(); cabeza.position.set(0, 0.74, 0.02); torso.add(cabeza)
  add(new THREE.SphereGeometry(0.105, 24, 18).scale(0.92, 1.12, 1), MAT.piel, cabeza)
  const barba = add(new THREE.SphereGeometry(0.11, 24, 14, 0, Math.PI * 2, Math.PI * 0.52, Math.PI * 0.34).scale(0.95, 1.12, 1.04), MAT.barba, cabeza); barba.rotation.x = -0.18
  const bigote = add(new THREE.CapsuleGeometry(0.012, 0.05, 3, 6).rotateZ(Math.PI / 2), MAT.barba, cabeza); bigote.position.set(0, -0.035, 0.1)
  const nariz = add(new THREE.ConeGeometry(0.018, 0.045, 8).rotateX(Math.PI / 2 + 0.3), MAT.piel, cabeza); nariz.position.set(0, -0.005, 0.11)
  for (const s of [-1, 1]) {
    const ojo = add(new THREE.SphereGeometry(0.011, 8, 6), MAT.ojo, cabeza); ojo.position.set(s * 0.037, 0.022, 0.093)
    const ceja = add(new THREE.BoxGeometry(0.035, 0.008, 0.01), MAT.pelo, cabeza); ceja.position.set(s * 0.038, 0.045, 0.097); ceja.rotation.z = -s * 0.12
    const oreja = add(new THREE.SphereGeometry(0.026, 10, 8).scale(0.5, 1, 0.8), MAT.piel, cabeza); oreja.position.set(s * 0.1, 0.0, 0.0)
  }
  add(new THREE.SphereGeometry(0.108, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(0.95, 1, 1).translate(0, 0.004, -0.008), MAT.pelo, cabeza)
  // la gorra: copa, visera curva y el logo
  const gorra = new THREE.Group(); gorra.position.set(0, 0.035, 0); cabeza.add(gorra)
  add(new THREE.SphereGeometry(0.114, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(0.97, 0.92, 1.03), MAT.gorra, gorra)
  const visera = add(new THREE.CylinderGeometry(0.11, 0.115, 0.012, 24, 1, false, -Math.PI * 0.42, Math.PI * 0.84).scale(1, 1, 1.25), MAT.gorra, gorra); visera.position.set(0, 0.0, 0.035); visera.rotation.x = 0.12
  const boton = add(new THREE.SphereGeometry(0.012, 8, 6), MAT.gorra, gorra); boton.position.set(0, 0.106, 0)
  const logo = add(new THREE.BoxGeometry(0.03, 0.022, 0.004), MAT.logo, gorra); logo.position.set(0, 0.055, 0.106); logo.rotation.x = -0.45
  // los brazos (hombro → codo → mano, con IK) y las mangas cortas
  const brazos = [-1, 1].map((s) => {
    const brazo = add(capsula(0.054, 0.3, 14), MAT.piel)
    const manga = add(new THREE.CylinderGeometry(0.074, 0.07, 0.17, 16).translate(0, 0.075, 0), MAT.polo)
    const codo = add(new THREE.SphereGeometry(0.05, 12, 10), MAT.piel)
    const ante = add(capsula(0.044, 0.28, 14), MAT.piel)
    const mano = add(new THREE.SphereGeometry(0.045, 12, 9).scale(0.85, 1.15, 0.7), s > 0 ? MAT.guante : MAT.piel)
    const reloj = s > 0 ? add(new THREE.CylinderGeometry(0.044, 0.044, 0.03, 12), MAT.reloj) : null
    return { s, brazo, manga, codo, ante, mano, reloj }
  })
  // el palo: el grip, la vara y la cabeza (driver, hierro, wedge o putter)
  const palo = new THREE.Group(); g.add(palo)
  const grip = add(new THREE.CylinderGeometry(0.014, 0.012, 0.26, 10).translate(0, -0.03, 0), MAT.grip, palo)
  const vara = add(new THREE.CylinderGeometry(0.0085, 0.006, 1, 8).translate(0, 0.5, 0), MAT.vara, palo)
  const cabezas = {
    driver: add(new THREE.SphereGeometry(0.06, 20, 14).scale(1.15, 0.55, 0.85), MAT.driver, palo),
    hierro: add(new THREE.BoxGeometry(0.075, 0.045, 0.016), MAT.hierro, palo),
    wedge: add(new THREE.BoxGeometry(0.075, 0.055, 0.016), MAT.hierro, palo),
    putter: add(new THREE.BoxGeometry(0.11, 0.028, 0.026), MAT.hierro, palo),
  }
  const lineaPutter = add(new THREE.BoxGeometry(0.004, 0.0012, 0.026), MAT.logo, cabezas.putter); lineaPutter.position.y = 0.0145
  for (const m of Object.values(cabezas)) m.scale.multiplyScalar(CABEZA_PALO) // arcade: los palos con cabezas grandes, para la pelota grande
  g.scale.setScalar(ESCALA_RORRO)
  return { g, pelvis, columna, torso, cabeza, brazos, palo, grip, vara, cabezas, HOMBRO, ANCHO, INCLINA, cadera }
})()
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _mb = new THREE.Matrix4()
/**
 * La pose de Rorro: `sv` el swing del juego (0 = en la pelota; > 0 atrás, < 0 el final), `putt`, `tipo` de palo.
 * Devuelve dónde queda la pelota en el muñeco (para pararlo atrás de la pelota).
 */
function poseRorro(sv, putt, tipo) {
  const P = PALOS[tipo] ?? PALOS.hierro
  const { L, lie } = P
  // la pelota y las manos en el piso de referencia (la cabeza del palo apoyada atrás de la pelota)
  const c0 = V3(0, -Math.sin(lie), Math.cos(lie))
  const H0 = V3(P.x * 0.6, L * Math.sin(lie) + 0.022 * CABEZA_PALO, 0.3) // (la suela del palo apoyada en el piso)
  const pelotaLocal = H0.clone().addScaledVector(c0, L)
  // el swing: las manos giran alrededor de los hombros en el plano del palo; la muñeca se quiebra
  const phi = putt ? sv : sv >= 0 ? sv * 2.62 : sv * 2.97
  const beta = putt ? 0 : phi >= 0 ? 1.45 * ss(0.25, 1.9, phi) : -1.25 * ss(0.4, 2.2, -phi)
  const nrm = V3(1, 0, 0).cross(c0).normalize() // positivo: para atrás (lejos del objetivo)
  const centro = V3(0, 1.42, 0.3)
  const H = H0.clone().sub(centro).applyAxisAngle(nrm, phi * (putt ? 0.9 : 1)).add(centro)
  const cdir = c0.clone().applyAxisAngle(nrm, phi + beta)
  // el torso gira con el swing (los hombros, hasta 90°; la cadera, la mitad) y la cabeza sigue la pelota después
  const giro = clamp(-phi * (putt ? 0.6 : 0.6), -1.75, 1.6)
  rorro.torso.rotation.y = giro
  rorro.pelvis.rotation.y = giro * 0.45
  rorro.cabeza.rotation.set(0.24 + (phi < -0.6 ? -0.5 * ss(0.6, 2.2, -phi) : 0), -giro + (phi < -0.6 ? 0.9 * ss(0.6, 2.4, -phi) : 0), 0)
  rorro.columna.rotation.x = rorro.INCLINA - (phi < -1 ? 0.35 * ss(1, 2.6, -phi) : 0) // en el final se para
  rorro.g.updateMatrixWorld(true)
  // el palo
  _mb.makeBasis(V3(1, 0, 0), c0, V3(1, 0, 0).cross(c0))
  _qa.setFromRotationMatrix(_mb)
  _qb.setFromAxisAngle(nrm, phi + beta)
  rorro.palo.position.copy(H)
  rorro.palo.quaternion.copy(_qb).multiply(_qa)
  rorro.vara.scale.y = L
  for (const [k, m] of Object.entries(rorro.cabezas)) {
    m.visible = k === (tipo in PALOS ? tipo : 'hierro')
    if (!m.visible) continue
    // la cabeza, apoyada en la punta de la vara, con la cara al objetivo
    m.position.set(k === 'driver' ? 0.0 : 0.0, L + 0.02, k === 'driver' ? 0.045 : k === 'putter' ? 0.04 : 0.03)
    m.rotation.set(0, 0, 0)
    m.quaternion.setFromAxisAngle(V3(1, 0, 0), lie - Math.PI / 2) // la suela plana en el piso
  }
  // los brazos: del hombro a las manos (la izquierda arriba en el grip), con el codo para abajo
  const hombroDe = (s) => rorro.torso.localToWorld(V3(s * rorro.ANCHO, rorro.HOMBRO, 0.02))
  const aLocal = (v) => rorro.g.worldToLocal(v.clone())
  for (const b of rorro.brazos) {
    const S = aLocal(hombroDe(b.s))
    const T = H.clone().addScaledVector(cdir, b.s > 0 ? -0.02 : 0.07)
    const a = 0.3, f = 0.28 + 0.03
    const d = Math.min(a + f - 1e-3, Math.max(0.12, S.distanceTo(T)))
    const dir = T.clone().sub(S).normalize()
    const polo = V3(-b.s * 0.25, -1, -0.35).normalize()
    const perp = polo.sub(dir.clone().multiplyScalar(polo.dot(dir))).normalize()
    const cosA = (a * a + d * d - f * f) / (2 * a * d)
    const codo = S.clone().addScaledVector(dir, a * cosA).addScaledVector(perp, a * Math.sqrt(Math.max(0, 1 - cosA * cosA)))
    const Tr = S.clone().addScaledVector(dir, d)
    entre(b.brazo, S, codo)
    entre(b.manga, S, codo)
    b.codo.position.copy(codo)
    entre(b.ante, codo, Tr)
    b.ante.scale.y = codo.distanceTo(Tr) / 0.28
    b.mano.position.copy(Tr); b.mano.quaternion.copy(rorro.palo.quaternion)
    if (b.reloj) { const r = codo.clone().lerp(Tr, 0.86); entre(b.reloj, r, Tr); b.reloj.scale.y = 0.03 }
  }
  // (la pelota grande va adelante de la cara del palo, no adentro)
  return pelotaLocal.add(V3(RADIO_BOLA / ESCALA_RORRO + 0.012 * CABEZA_PALO, 0, 0))
}

// ── los monos (los del motor: patrullan, cazan la pelota quieta, se la roban) ──
function crearMono() {
  const g = new THREE.Group()
  const m = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 })
  const piel = m('#6b4423'), cara = m('#e2bc8f'), ojo = m('#120a05')
  const cuerpo = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 10), piel); cuerpo.scale.set(1, 1.18, 0.9); cuerpo.position.y = 0.48
  const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.25, 14, 10), piel); cabeza.position.y = 0.92
  const frente = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 9), cara); frente.scale.set(1, 0.8, 0.6); frente.position.set(0, 0.88, 0.17)
  for (const s of [-1, 1]) {
    const oreja = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), cara); oreja.position.set(s * 0.26, 0.95, 0); g.add(oreja)
    const o = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 5), ojo); o.position.set(s * 0.07, 0.95, 0.26); g.add(o)
    const pata = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.32, 6).translate(0, -0.16, 0), piel); pata.position.set(s * 0.14, 0.32, 0); pata.name = 'pata' + s; g.add(pata)
    const brazo = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.38, 6).translate(0, -0.19, 0), piel); brazo.position.set(s * 0.28, 0.65, 0); brazo.rotation.z = s * 0.35; brazo.name = 'brazo' + s; g.add(brazo)
  }
  const cola = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V3(0, 0.36, -0.22), V3(0, 0.27, -0.5), V3(0, 0.54, -0.68), V3(0, 0.76, -0.54), V3(0, 0.72, -0.4)]), 16, 0.03, 5), piel)
  g.add(cuerpo, cabeza, frente, cola)
  g.traverse((o) => { if (o.isMesh) o.castShadow = true })
  g.visible = false
  escena.add(g)
  return { g, ultimo: null, dir: 0, salto: 0, partes: ['pata-1', 'pata1', 'brazo-1', 'brazo1'].map((n) => g.getObjectByName(n)) }
}
const ESCALA_MONO = 2.5 // arcade: grandes, que se vean venir
const monos3d = Array.from({ length: 8 }, crearMono)
function moverMonos3d(dt, st) {
  const lista = st.ronda?.monos ?? []
  monos3d.forEach((m, i) => {
    const s = lista[i]
    if (!s || s.modo === 'aplastado' || !st.ronda || intro) { m.g.visible = false; return }
    const p = s.pos
    if (m.ultimo) { const v = [p[0] - m.ultimo[0], p[1] - m.ultimo[1]]; if (Math.hypot(...v) > 1e-3) m.dir = Math.atan2(v[0], v[1]) }
    m.ultimo = [...p]
    const espera = s.espera > 0 && s.modo !== 'caza'
    m.g.visible = true
    m.g.rotation.y += difAng(m.dir, m.g.rotation.y) * Math.min(1, dt * 8)
    m.salto = Math.max(0, m.salto - dt)
    const corre = s.modo === 'caza' ? 16 : 9
    const tpose = cancha.monoBug === i
    const brinco = m.salto > 0 ? Math.abs(Math.sin(m.salto * 9)) * 0.7 : Math.abs(Math.sin(est.t * corre + i)) * (espera ? 0.015 : 0.09)
    m.g.position.set(p[0], alturaEn(inversa(p)) + brinco + (tpose ? 1.6 + Math.sin(tReal * 2) * 0.2 : 0), p[1])
    m.g.scale.setScalar(ESCALA_MONO * escalaVista(m.g.position, 0.5 * ESCALA_MONO, 14))
    if (tpose) m.g.rotation.y += dt * 2
    const paso = espera ? 0 : Math.sin(est.t * corre + i)
    const [p1, p2, b1, b2] = m.partes
    p1.rotation.x = paso * 0.6
    p2.rotation.x = -paso * 0.6
    b1.rotation.set(tpose ? 0 : m.salto > 0 ? -2.6 : paso * 0.5, 0, tpose ? -1.57 : -0.35)
    b2.rotation.set(tpose ? 0 : m.salto > 0 ? -2.6 : -paso * 0.5, 0, tpose ? 1.57 : 0.35)
  })
}

// ── el clima, en 3D: la luz, el cielo, las nubes, los charcos, la lluvia, los rayos y la nieve ──
const CLIMA_VIS = {
  soleado: { sol: 3.0, solCol: '#fff1cc', cielo: 1.05, fondo: '#0a2117', exp: 1.1 },
  nuboso: { sol: 1.0, solCol: '#e9eef2', cielo: 1.55, fondo: '#18261f', exp: 0.98, nubes: 0.9 },
  seco: { sol: 3.1, solCol: '#ffe0aa', cielo: 1.0, fondo: '#1d1a0d', exp: 1.1, seco: 1 },
  mojado: { sol: 1.5, solCol: '#e6eef0', cielo: 1.3, fondo: '#0d1f1a', exp: 1.0, mojado: 0.7, nubes: 0.3 },
  lluvia: { sol: 0.8, solCol: '#cfd9e2', cielo: 1.15, fondo: '#0c1820', exp: 0.95, mojado: 1, nubes: 0.6, oscuro: 0.2, lluvia: 0.55 },
  tormenta: { sol: 0.45, solCol: '#b8c6d6', cielo: 0.95, fondo: '#070d14', exp: 0.92, mojado: 1, nubes: 0.9, oscuro: 0.45, lluvia: 1, rayos: true },
  nieve: { sol: 1.9, solCol: '#eaf3ff', cielo: 1.35, fondo: '#1b2833', exp: 1.02, nieve: 1, copos: true },
}
let climaId = 'soleado'
const climaVis = () => CLIMA_VIS[climaId] ?? CLIMA_VIS.soleado
function aplicarClima(ronda) {
  climaId = ronda?.clima?.id ?? 'soleado'
  const c = climaVis()
  sol.intensity = c.sol; sol.color.set(c.solCol)
  cielo.intensity = c.cielo
  escena.background.set(c.fondo); escena.fog.color.set(c.fondo)
  if (renderer) renderer.toneMappingExposure = c.exp
  U.uNubes.value = c.nubes ?? 0; U.uMojado.value = c.mojado ?? 0; U.uSeco.value = c.seco ?? 0; U.uOscuro.value = c.oscuro ?? 0; U.uNieve.value = c.nieve ?? 0
  matTerreno.roughness = 0.92 - 0.4 * (c.mojado ?? 0)
  bola.material.color.set(c.nieve ? '#ff7a1a' : '#ffffff'); bola.material.emissive.set(c.nieve ? '#ff7a1a' : '#ffffff')
  lluvia.visible = !!c.lluvia; copos.visible = !!c.copos
  pintarCharcos(ronda)
}
const NLL = 1600
const lluviaGeo = new THREE.BufferGeometry()
lluviaGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NLL * 6), 3))
const lluvia = new THREE.LineSegments(lluviaGeo, new THREE.LineBasicMaterial({ color: '#cfe0ee', transparent: true, opacity: 0.42, depthWrite: false }))
lluvia.frustumCulled = false; lluvia.visible = false
escena.add(lluvia)
const gotas = Array.from({ length: NLL }, () => [Math.random() * 140 - 70, Math.random() * 60, Math.random() * 140 - 70])
const NCO = 2200
const coposGeo = new THREE.BufferGeometry()
coposGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NCO * 3), 3))
const copos = new THREE.Points(coposGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 3, sizeAttenuation: false, transparent: true, opacity: 0.85, depthWrite: false }))
copos.frustumCulled = false; copos.visible = false
escena.add(copos)
const copoS = Array.from({ length: NCO }, () => [Math.random() * 160 - 80, Math.random() * 50, Math.random() * 160 - 80, Math.random() * 6])
let rayo = null, proxRayo = 6
const rayoLinea = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 9 }, () => V3())), new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0 }))
rayoLinea.frustumCulled = false
escena.add(rayoLinea)
function moverClima(dt, st) {
  const c = climaVis(), r = st.ronda
  const v = r?.viento ?? { ang: 0, kmh: 0 }
  const wx = Math.cos(v.ang) * v.kmh * 0.35, wz = Math.sin(v.ang) * v.kmh * 0.35
  U.uNubeV.value.set(Math.cos(v.ang) * (2 + v.kmh * 0.4), Math.sin(v.ang) * (2 + v.kmh * 0.4))
  const foco = cam.foco
  // la lluvia y la nieve, en una caja entre la cámara y lo que mira (más chica de cerca: así siempre se ve)
  const caja = clamp(cam.D * 0.55, 6, 70), k = caja / 70
  const centro = V3().lerpVectors(camara.position, cam.piv, 0.55), piso = cam.piv.y - 1, techo = Math.max(camara.position.y + 4, piso + 12)
  if (lluvia.visible) {
    const n = Math.floor(NLL * c.lluvia), pa = lluviaGeo.attributes.position.array
    for (let i = 0; i < NLL; i++) {
      const gg = gotas[i]
      gg[1] -= 42 * dt; gg[0] += wx * dt; gg[2] += wz * dt
      if (gg[1] < 0 || Math.abs(gg[0]) > 70 || Math.abs(gg[2]) > 70) { gg[0] = Math.random() * 140 - 70; gg[1] = 40 + Math.random() * 25; gg[2] = Math.random() * 140 - 70 }
      if (i >= n) { pa.fill(0, i * 6, i * 6 + 6); continue }
      const x = centro.x + gg[0] * k, y = piso + (gg[1] / 65) * (techo - piso), z = centro.z + gg[2] * k
      pa[i * 6] = x; pa[i * 6 + 1] = y; pa[i * 6 + 2] = z
      pa[i * 6 + 3] = x - wx * 0.035 * k; pa[i * 6 + 4] = y + 1.6 * Math.max(0.25, k); pa[i * 6 + 5] = z - wz * 0.035 * k
    }
    lluviaGeo.attributes.position.needsUpdate = true
  }
  if (copos.visible) {
    const pa = coposGeo.attributes.position.array
    for (let i = 0; i < NCO; i++) {
      const gg = copoS[i]
      gg[1] -= (2.4 + (i % 5) * 0.3) * dt; gg[0] += (wx * 0.25 + Math.sin(tReal * 1.3 + gg[3]) * 0.6) * dt; gg[2] += wz * 0.25 * dt
      if (gg[1] < 0) { gg[0] = Math.random() * 160 - 80; gg[1] = 45 + Math.random() * 10; gg[2] = Math.random() * 160 - 80 }
      pa[i * 3] = centro.x + gg[0] * k; pa[i * 3 + 1] = piso + (gg[1] / 55) * (techo - piso); pa[i * 3 + 2] = centro.z + gg[2] * k
    }
    coposGeo.attributes.position.needsUpdate = true
  }
  if (c.rayos && st.ronda) {
    proxRayo -= dt
    if (proxRayo <= 0) {
      proxRayo = 5 + Math.random() * 7
      const x = foco.x + (Math.random() - 0.5) * 220, z = foco.z - 120 - Math.random() * 120
      const pts = []; let px = x, pz = z
      for (let i = 0; i < 9; i++) { pts.push(V3(px, 130 - i * 16, pz)); px += (Math.random() - 0.5) * 14; pz += (Math.random() - 0.5) * 6 }
      rayoLinea.geometry.setFromPoints(pts)
      rayo = { t0: tReal }
    }
  }
  if (rayo) {
    const u = tReal - rayo.t0
    const a = u < 0.06 ? 1 : u < 0.12 ? 0.2 : u < 0.2 ? 0.8 : Math.max(0, 0.8 - (u - 0.2) * 3)
    rayoLinea.material.opacity = a
    sol.intensity = c.sol + a * 6
    if (u > 0.5) { rayo = null; rayoLinea.material.opacity = 0; sol.intensity = c.sol }
  }
}
const charcos = []
function pintarCharcos(r) {
  for (const c of charcos) escena.remove(c)
  charcos.length = 0
  for (const q of r?.clima?.charcos?.[r.idx] ?? []) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(q.r, 28).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#a7bfd0', emissive: '#3d5566', emissiveIntensity: 0.35, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.72, polygonOffset: true, polygonOffsetFactor: -2 }))
    m.scale.set(1, 1, 0.75); m.rotation.y = q.ang ?? 0
    m.userData.p = q.pos
    m.receiveShadow = true
    escena.add(m); charcos.push(m)
  }
}
function moverCharcos() { for (const m of charcos) { const p = m.userData.p; m.position.set(p[0], alturaEn(inversa(p)) + 0.02, p[1]) } }

// ── la cámara: más de arriba que atrás (entre la tele y el juego de siempre). Se arma con cinco números (el pivote, que
// queda fijo en un lugar de la pantalla; para dónde mira; cuánto mira para abajo; la distancia y el alto del pivote en
// la pantalla) y cada uno se acerca suave al que pide el momento: así todo se mueve orgánico ──
const cam = { piv: V3(W / 2, 0, H / 2), yaw: -Math.PI / 2, pitch: 1.1, D: 320, yB: 0, foco: V3(W / 2, 0, H / 2), k: 3, quieta: false }
let pose = null // la que pide el momento
let zona = { top: 120, bot: 700 }
const ejes = (yaw, pitch) => {
  const f = [Math.cos(yaw), Math.sin(yaw)]
  const F = V3(f[0] * Math.cos(pitch), -Math.sin(pitch), f[1] * Math.cos(pitch))
  const R = V3(-f[1], 0, f[0]).normalize()
  const Uv = R.clone().cross(F).normalize()
  return { F, R, U: Uv }
}
/**
 * La distancia más corta a la que, con el pivote fijo en (0, yB) de la pantalla, entran todos los puntos (con margen
 * arriba para la tarjeta y abajo para los botones). Por bisección: de más lejos, todo se junta hacia el pivote.
 */
function resolverD(piv, yaw, pitch, yB, puntos, Dmin, Dmax) {
  const { F, R, U: Uv } = ejes(yaw, pitch)
  const tanH = Math.tan((camara.fov * Math.PI) / 360), asp = camara.aspect
  const r = F.clone().addScaledVector(Uv, yB * tanH).normalize()
  const H2 = innerHeight
  const ytop = 1 - (2 * (zona.top + 16)) / H2, ybot = 1 - (2 * (zona.bot - 10)) / H2, xm = 0.86
  const entra = (D) => {
    const Cx = piv.x - r.x * D, Cy = piv.y - r.y * D, Cz = piv.z - r.z * D
    for (const p of puntos) {
      const dx = p.x - Cx, dy = p.y - Cy, dz = p.z - Cz
      const zc = dx * F.x + dy * F.y + dz * F.z
      if (zc < 0.5) return false
      const x = (dx * R.x + dy * R.y + dz * R.z) / (zc * tanH * asp), y = (dx * Uv.x + dy * Uv.y + dz * Uv.z) / (zc * tanH)
      if (x < -xm || x > xm || y > ytop || y < ybot) return false
    }
    return true
  }
  if (entra(Dmin)) return Dmin
  if (!entra(Dmax)) return Dmax
  let lo = Dmin, hi = Dmax
  for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (entra(m)) hi = m; else lo = m }
  return hi
}
const ndcY = (py) => 1 - (2 * py) / innerHeight
function aplicarCamara() {
  const { F, U: Uv } = ejes(cam.yaw, cam.pitch)
  const tanH = Math.tan((camara.fov * Math.PI) / 360)
  const r = F.clone().addScaledVector(Uv, cam.yB * tanH).normalize()
  camara.position.copy(cam.piv).addScaledVector(r, -cam.D)
  camara.up.set(0, 1, 0)
  camara.lookAt(camara.position.clone().add(F))
  camara.updateMatrixWorld(true)
  cam.foco.copy(cam.piv)
}
function moverCamara(dt) {
  if (!pose) return
  const k = 1 - Math.exp(-dt * (pose.k ?? 3))
  cam.piv.lerp(pose.piv, k)
  cam.yaw += difAng(pose.yaw, cam.yaw) * k
  cam.pitch += (pose.pitch - cam.pitch) * k
  cam.D += (pose.D - cam.D) * k
  cam.yB += (pose.yB - cam.yB) * k
  if (pose.ruta) seguirRuta(pose)
  aplicarCamara()
  // (la sombra cubre lo que se ve: de cerca, más chica y más nítida)
  const rr = clamp(camara.position.distanceTo(cam.piv) * 0.8, 16, 320)
  sombraEn(cam.piv.x, cam.piv.z, rr < 60 ? Math.round(rr / 4) * 4 : Math.round(rr / 10) * 10)
}
const enPiso = (p, extra = 0) => V3(p[0], alturaEn(inversa(p)) + extra, p[1])
/** Una pose que encuadra: el pivote en yB de la pantalla y todos los puntos adentro. */
function encuadrar(piv, yaw, pitch, yB, puntos, { Dmin = 20, Dmax = 520, k = 3 } = {}) {
  const D = resolverD(piv, yaw, pitch, yB, puntos, Dmin, Dmax)
  return { piv, yaw, pitch, yB, D, k }
}
// los sobrevuelos: una ruta de poses (la del hoyo, de la intro)
function sobrevolar(poses, dur, alFinal) { pose = { ...poses[0], ruta: { poses, t0: tReal, dur, alFinal } } }
function seguirRuta(p) {
  const r = p.ruta, u = clamp((tReal - r.t0) / r.dur, 0, 1), e = easeIO(u)
  const n = r.poses.length - 1, i = Math.min(n - 1, Math.floor(e * n)), t = e * n - i
  const a = r.poses[i], b = r.poses[i + 1], s = t * t * (3 - 2 * t)
  cam.piv.copy(a.piv).lerp(b.piv, s)
  cam.yaw = a.yaw + difAng(b.yaw, a.yaw) * s
  cam.pitch = lerp(a.pitch, b.pitch, s); cam.D = lerp(a.D, b.D, s); cam.yB = lerp(a.yB, b.yB, s)
  if (u >= 1) { const fin = r.alFinal; pose = { ...r.poses[n] }; fin?.() }
}

/** La pose que pide el juego en este momento (apuntando, en el aire, rodando, en el putt, la pausa…). */
function poseDelJuego(st) {
  const r = st.ronda
  // el resultado: el hoyo que se jugó (el motor ya pasó al siguiente, o terminó), de arriba para ver la pelota en el
  // fondo, abajo del cartel
  if (r && st.estado === 'resultado' && (caida.on || pinVivo)) { const hp = caida.on ? caida.pin : pinVivo; return encuadrar(enPiso(hp), cam.yaw, 1.0, -0.45, [enPiso(hp, 0.3), enPiso(hp, ALTO_PALO)], { Dmin: 9, Dmax: 16, k: 2.4 }) }
  if (!r || r.terminada) return { piv: V3(W / 2, 0, H / 2 - 10), yaw: -Math.PI / 2, pitch: 1.05, yB: 0, D: 380, k: 0.8 }
  const h = M.hoyoActual(r), pin = h.pin
  const t = st.tiro
  const B = st.bola
  const alPin = Math.atan2(pin[1] - r.pelota[1], pin[0] - r.pelota[0])
  if (st.estado === 'pausa' && t) {
    // casi cenital: la pelota en el aire abajo y a dónde iba arriba, para arrastrarlo bien
    const D0 = t.destinoOrig ?? t.pos
    const piv = enPiso([lerp(t.pos[0], D0[0], 0.35), lerp(t.pos[1], D0[1], 0.35)])
    return encuadrar(piv, Math.atan2(D0[1] - t.desde[1], D0[0] - t.desde[0]), 1.2, 0, [enPiso(t.pos, t.alt ?? 0), enPiso(D0, 0).add(V3(0, 0, 0))].concat(anilloPuntos(D0, Math.max(10, dist(t.pos, D0) * 0.38))), { Dmin: 40, k: 2.4 })
  }
  if (st.estado === 'resultado') return encuadrar(enPiso(pin), cam.yaw, 0.95, -0.1, [enPiso(pin, 2.6)], { Dmin: 9, Dmax: 40, k: 1.6 })
  if (st.estado === 'anim' && st.anim) {
    const a = st.anim
    return encuadrar(enPiso(a.hasta ?? r.pelota), cam.yaw, 1.0, -0.2, [enPiso(a.desde ?? a.hasta ?? r.pelota)], { Dmin: 28, k: 2.2 })
  }
  if (st.estado === 'tiro' && t) {
    if (t.modo === 'putt') return encuadrar(enPiso(t.pos), cam.yaw, 1.02, -0.25, [enPiso(pin), ...anilloPuntos(pin, 2.5)], { Dmin: 12.5, Dmax: 70, k: 2.4 })
    const cae = [t.desde[0] + t.carryVec[0] + (t.deriva?.[0] ?? 0), t.desde[1] + t.carryVec[1] + (t.deriva?.[1] ?? 0)]
    const yaw = Math.atan2(cae[1] - t.desde[1], cae[0] - t.desde[0])
    const enVuelo = t.fase === 'vuelo'
    return encuadrar(B.clone(), yaw, enVuelo ? 0.82 : 0.95, enVuelo ? -0.15 : -0.25, [enPiso(cae, 0), ...(enVuelo ? [] : anilloPuntos(t.pos, 6))], { Dmin: enVuelo ? 30 : 22, k: enVuelo ? 3.2 : 2.4 })
  }
  // apuntando (o esperando): la pelota abajo, mirando al hoyo, ~75 yd para adelante (o el hoyo); tirando para atrás,
  // se abre lo justo para ver dónde pica (en el MODO PRO, hasta el hoyo o 200 yd, como el juego)
  const piv = enPiso(r.pelota)
  if (st.enPutt) {
    const d = dist(r.pelota, pin)
    return encuadrar(piv, alPin, 1.02, -0.36, [enPiso(pin, ALTO_PALO * 0.5), ...anilloPuntos(pin, Math.max(3, d * 0.45)), ...anilloPuntos(r.pelota, 3.5)], { Dmin: 12.5, Dmax: 80, k: 2.6 })
  }
  const d = dist(r.pelota, pin)
  const puntos = [enPiso([r.pelota[0] + Math.cos(alPin) * Math.min(d + 8, 34), r.pelota[1] + Math.sin(alPin) * Math.min(d + 8, 34)])]
  const a = st.apunte
  if (a && !a.putt) {
    if (r.pro) { const L = Math.min(d, 200 / h.escala); puntos.push(enPiso([r.pelota[0] + Math.cos(a.ang) * L, r.pelota[1] + Math.sin(a.ang) * L])) }
    else {
      const largo = Math.max(1.5 * a.disp.carry * a.alcance, 1.5), ancho = Math.max(a.alcance * Math.tan(Math.min(1.5 * a.disp.ang, 1.1)), 1.5)
      puntos.push(...anilloPuntos(a.destino, 0, largo + 4, ancho + 3, a.plan.cuerda))
    }
  }
  return encuadrar(piv, st.drag ? cam.yaw : alPin, 0.84, -0.36, puntos, { Dmin: 10.5, k: st.drag ? 2.2 : 2.6 })
}
function anilloPuntos(c, r, largo = r, ancho = r, ang = 0) {
  const pts = []
  for (let i = 0; i < 8; i++) { const t = (i / 8) * Math.PI * 2, l = Math.cos(t) * largo, w = Math.sin(t) * ancho; pts.push(enPiso([c[0] + Math.cos(ang) * l - Math.sin(ang) * w, c[1] + Math.sin(ang) * l + Math.cos(ang) * w])) }
  return pts
}

// ── las versiones: qué le hace a la cancha cada tiro ──
let idBump = 1
const nuevoBump = (cx, cy, r, tipo, vx, vy, amp = 1) => ({ id: idBump++, cx, cy, r, tipo, vx, vy, desde: 0, hasta: amp })
/** Una onda que cruza toda la cancha: largo de onda λ y amplitud (yardas), con la dirección al azar. */
function onda(lambda, amp) {
  const a = Math.random() * Math.PI * 2, k = (Math.PI * 2) / lambda, b = a + (Math.random() < 0.5 ? 1 : -1) * (0.6 + Math.random() * 0.9)
  return nuevoBump(Math.cos(a) * k, Math.sin(a) * k, Math.random() * 6.28, 2, Math.cos(b) * amp, Math.sin(b) * amp)
}
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
    const m = -Math.sign(mejor.pe) * Math.min(Math.abs(mejor.pe) - 1, 8)
    return { cita: '¿Y si corremos ese árbol un poquito?', bumps: [nuevoBump(mejor.a.q[0], mejor.a.q[1], Math.max(8, Math.abs(m) * 1.6), 0, n[0] * m, n[1] * m)] }
  },
  bunker(B, P) {
    let mejor = null
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
      if (FILAS[y][x] !== 'b') continue
      const q = [x + 0.5, y + 0.5], d = dist(q, P)
      if (d > dist(B, P) + 10) continue
      const costo = d + dist(q, B) * 0.2
      if (!mejor || costo < mejor.costo) mejor = { q, costo }
    }
    return mejor ? { cita: 'El bunker lo veo chico.', bumps: [nuevoBump(mejor.q[0], mejor.q[1], 9, 1, 3.8, 0)] } : null
  },
  onda(B, P) {
    const u = norm([P[0] - B[0], P[1] - B[1]]), n = [-u[1], u[0]], L = dist(B, P)
    if (L < 40) return null
    const s0 = Math.random() < 0.5 ? -1 : 1
    return { cita: 'Démosle más onda a la calle.', bumps: [0.4, 0.65, 0.88].map((t, i) => { const s = (i % 2 ? -1 : 1) * s0; return nuevoBump(B[0] + u[0] * t * L, B[1] + u[1] * t * L, 18, 0, n[0] * s * 7, n[1] * s * 7) }) }
  },
}
/** Los bugs de una versión mala: en el piso (adelante, cerca de la línea), en los árboles y algún mono. */
function sortearBugs(B, P) {
  const u = norm([P[0] - B[0], P[1] - B[1]]), n = [-u[1], u[0]], L = dist(B, P)
  const bugs = []
  const cuantos = Math.random() < 0.5 ? 1 : 2
  const tipos = ['textura', 'zfight', 'wire', 'nan', 'flota', 'estirado', 'reves', 'mono'].sort(() => Math.random() - 0.5)
  for (const t of tipos.slice(0, cuantos)) {
    const c = [B[0] + u[0] * L * (0.3 + Math.random() * 0.5) + n[0] * (Math.random() - 0.5) * 40, B[1] + u[1] * L * (0.3 + Math.random() * 0.5) + n[1] * (Math.random() - 0.5) * 40]
    if (['textura', 'zfight', 'wire', 'nan'].includes(t)) {
      if (dist(c, P) < 22 || dist(c, B) < 12) continue
      bugs.push({ tipo: t, c, r: 5 + Math.random() * 6, suelo: { textura: 0, zfight: 1, wire: 2, nan: 3 }[t] })
    } else if (t === 'mono') bugs.push({ tipo: 'mono' })
    else {
      const ids = arboles.map((a, i) => [i, dist(a.q, c)]).filter(([, d]) => d < 14).map(([i]) => i).slice(0, 7)
      if (ids.length) bugs.push({ tipo: t, ids })
    }
  }
  return bugs
}
const mapaBugsArbol = (bugs) => { const m = new Map(); for (const b of bugs) if (b.ids) for (const i of b.ids) m.set(i, b.tipo); return m }
function elegirSkin(limpio) { return elegir(Object.keys(SKINS).filter((k) => SKINS[k].limpio === limpio && k !== cancha.skinB)) }
const juego = { ver: [1, 0], historial: [], poder: { revert: 1, bp: 1 }, versiones: 0, bugs: 0, reverts: 0 }
/**
 * La versión que sigue. `bueno`: aprobada (se abre la calle, se arreglan los bugs, se revierte un cambio del cliente,
 * skin prolija); si no, cambios del cliente (dos o tres ondas grandes que mueven todo, dos pedidos, skin rara y bugs).
 */
function armarVersion(bueno, B, P) {
  const nuevos = [], quitar = []
  const viejasOndas = est.bumps.filter((b) => b.tipo === 2 && b.hasta).map((b) => b.id)
  quitar.push(...viejasOndas)
  let citas = []
  if (bueno) {
    const u = norm([P[0] - B[0], P[1] - B[1]]), n = [-u[1], u[0]], L = dist(B, P)
    for (const t of [0.22, 0.42, 0.62, 0.82]) {
      if (t * L < 14) continue
      for (const s of [-1, 1]) nuevos.push(nuevoBump(B[0] + u[0] * t * L + n[0] * s * 9, B[1] + u[1] * t * L + n[1] * s * 9, 13, 0, n[0] * s * 5, n[1] * s * 5))
    }
    nuevos.push(onda(170 + Math.random() * 60, 3))
    const ultimo = [...juego.historial].reverse().find((v) => v.tipo === 'mal' && !v.revertido)
    if (ultimo) { quitar.push(...ultimo.agregados.filter((id) => !viejasOndas.includes(id))); ultimo.revertido = true }
  } else {
    const k = 2 + Math.floor(Math.random() * 2)
    for (let i = 0; i < k; i++) { const l = 120 + Math.random() * 110; nuevos.push(onda(l, Math.min(9, l * 0.04))) }
    for (const t of Object.keys(CLIENTE).sort(() => Math.random() - 0.5)) { const c = CLIENTE[t](B, P); if (c) { nuevos.push(...c.bumps); citas.push(c.cita) } if (citas.length === 2) break }
  }
  return { tipo: bueno ? 'ok' : 'mal', nuevos, quitar, skin: elegirSkin(bueno), bugs: bueno ? [] : sortearBugs(B, P), citas }
}
/**
 * Despliega una versión: la onda sale de `origen` y, a su paso, todo queda en la versión nueva. La grilla del motor
 * se hornea de a pedazos mientras pasa y, al terminar, el juego juega en ella (`alCampo`).
 */
let barrido = null
function desplegar({ nuevos = [], quitar = [], skin, bugs, origen, rebobina = false, dur = 3, alFinal }) {
  terminarBarrido()
  for (const b of est.bumps) b.desde = b.hasta
  for (const id of quitar) { const b = est.bumps.find((x) => x.id === id); if (b) b.hasta = 0 }
  est.bumps.push(...nuevos)
  while (est.bumps.filter((b) => b.hasta > 0).length > NB - 2) est.bumps.find((b) => b.hasta > 0).hasta = 0
  est.bumps = est.bumps.slice(-NB)
  ponerSkins(cancha.skinB, skin ?? cancha.skinB)
  cancha.bugsA = cancha.bugsB; cancha.bugsB = bugs ?? cancha.bugsB
  cancha.arbolBugA = cancha.arbolBugB; cancha.arbolBugB = mapaBugsArbol(cancha.bugsB)
  const o = origen
  const lejos = Math.max(...[[0, 0], [W, 0], [0, H], [W, H]].map((c) => dist(c, o))) + est.swBanda + 4
  est.swO = [...o]; est.swSentido = rebobina ? -1 : 1; est.rebobina = rebobina ? 1 : 0; est.swVivo = 1
  const desdeA = rebobina ? lejos : -est.swBanda - 2, a1 = rebobina ? -est.swBanda - 2 : lejos
  est.swW = desdeA
  const sonido = rebobina ? C.revert(dur) : C.deploy(dur)
  despertarArboles(dur + 2)
  barrido = { horno: hornear(), filas: null, t0: est.t, dur, desdeA, a1, rebobina, sonido, alFinal }
}
function moverBarrido(forzar = false) {
  const b = barrido
  if (!b) return
  if (!b.filas) { const r = b.horno.next(); if (r.done) b.filas = r.value }
  const u = forzar ? 1 : clamp((est.t - b.t0) / b.dur, 0, 1)
  est.swW = lerp(b.desdeA, b.a1, b.rebobina ? easeIO(u) : u ** 1.25)
  b.sonido?.avance(u)
  if (u >= 1) terminarBarrido()
}
function terminarBarrido() {
  const b = barrido
  if (!b) return
  barrido = null
  while (!b.filas) { const r = b.horno.next(); if (r.done) b.filas = r.value }
  b.sonido?.fin()
  for (const x of est.bumps) x.desde = x.hasta
  est.bumps = est.bumps.filter((x) => x.hasta > 0.001)
  est.swW = 1e5; est.swSentido = 1; est.swVivo = 0; est.rebobina = 0
  ponerSkins(cancha.skinB, cancha.skinB)
  cancha.bugsA = cancha.bugsB; cancha.arbolBugA = cancha.arbolBugB
  cancha.monoBug = cancha.bugsB.some((x) => x.tipo === 'mono') ? Math.floor(Math.random() * 3) : null
  campoActual = campoCon(b.filas)
  alCampo(b.filas === FILAS ? null : b.filas)
  despertarArboles(2)
  b.alFinal?.()
}

// ── el tiempo, el estado y la intro ──
let tReal = 0
let activo = false
let intro = null // la cinemática de la primera vez: el dibujo → la grilla → la cancha 3D
let alCampo = () => {}
let campoActual = campoBase
let ultimoEstado = null, ultimoTiro = null, golfistaBase = null, teeBase = null, pelotaBase = null
/** Agranda (de lejos) lo que es chico de verdad, para que se vea: `px` el tamaño mínimo en la pantalla, en píxeles. */
function escalaVista(p = bola.position, real = RADIO_BOLA, px = 3) {
  const d = camara.position.distanceTo(p)
  const pxReal = (real / (d * Math.tan((camara.fov * Math.PI) / 360))) * (innerHeight / 2)
  return Math.max(1, px / Math.max(1e-4, pxReal))
}

// ── la API para el juego ──
/** Arranca three en el lienzo (una vez). `alCampo(filas)`: la grilla del motor de cada versión (null: la de siempre). */
export function iniciar({ lienzo: el, alCampo: cb }) {
  if (renderer) return
  lienzo = el
  alCampo = cb ?? (() => {})
  renderer = new THREE.WebGLRenderer({ canvas: el, antialias: true, stencil: true, powerPreference: 'high-performance' }) // (el stencil: el agujero del hoyo)
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)) // (con 2 o 3, el teléfono pinta el doble o más: se traba)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  medir()
  calentar()
}
/**
 * Los shaders, todos de entrada (con la terminal de carga en pantalla): si no, el primer tiro compila los de las chispas,
 * el trazador, la sombra de la pelota y las sombras de lo que aparece, en pleno vuelo, y se traba.
 */
function calentar() {
  const vuelta = []
  escena.traverse((o) => { if (o.isLight) return; vuelta.push([o, o.visible, o.frustumCulled]); o.visible = true; o.frustumCulled = false })
  try { renderer.compile(escena, camara); renderer.render(escena, camara) } catch (e) { console.warn(e) } finally { for (const [o, v, f] of vuelta) { o.visible = v; o.frustumCulled = f } }
}
export function medir() {
  if (!renderer) return
  const w = innerWidth, h = innerHeight
  renderer.setSize(w, h, false)
  camara.aspect = w / h
  camara.fov = w / h < 0.75 ? 50 : 42
  camara.updateProjectionMatrix()
}
export function activar(si) {
  activo = !!si
  if (lienzo) lienzo.hidden = !activo
  C.volumen(0.55)
  if (!activo) { C.zumbido(0); C.movimiento(0, 0) }
}
export const estaActivo = () => activo
export const campo = () => campoActual
export const version = () => `v${juego.ver[0]}.${juego.ver[1]}`
export function sonido(si) { C.ponerSonido(si) }
export function despertar() { C.despertar() }
/** Una vuelta nueva: el clima (la luz, la lluvia, los charcos) y la cancha limpia. */
export function nuevaRonda(ronda, imagenCancha = null) {
  aplicarClima(ronda)
  despertarArboles(2)
  juego.versiones = 0; juego.bugs = 0; juego.reverts = 0
  // el dibujo de la cancha (el del clima de hoy): la misma imagen del juego; cuando cambia, se vuelve a subir
  if (imagenCancha && U.uDibujo.value?.image !== imagenCancha) {
    const t = new THREE.Texture(imagenCancha); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
    // (se sube a la placa ya, no en el primer cuadro de la intro)
    const subir = () => { t.needsUpdate = true; try { renderer?.initTexture(t) } catch {} }
    if (imagenCancha.complete && imagenCancha.naturalWidth) subir()
    imagenCancha.addEventListener('load', subir)
    U.uDibujo.value = t
  }
}
export function climaCambio(ronda) { aplicarClima(ronda) }
/** Un hoyo nuevo: la cancha vuelve a la v1.0 (la base, la skin clásica, sin bugs) y el juego juega en la base. */
export function empezarHoyo(ronda) {
  terminarBarrido()
  caida.on = false; caida.tiro = null; festejo = null
  juego.ver = [1, 0]; juego.historial = []; juego.poder = { revert: 1, bp: 1 }
  est.bumps = []
  ponerSkins('clasico', 'clasico')
  cancha.bugsA = cancha.bugsB = []; cancha.arbolBugA = new Map(); cancha.arbolBugB = new Map(); cancha.monoBug = null
  campoActual = campoBase
  alCampo(null)
  despertarArboles(2.5)
  trazoPts = []; trazoApaga = null
  teeBase = null; golfistaBase = null
  pintarCharcos(ronda)
}
/** El sobrevuelo de la tele al empezar un hoyo: del green al tee (dura lo que la banda del hoyo). */
export function sobrevolarHoyo(ronda, dur = 2.8) {
  const h = M.hoyoActual(ronda), P = h.pin, T = ronda.pelota
  const yaw = Math.atan2(P[1] - T[1], P[0] - T[0])
  const fin = poseDelJuego({ ronda, estado: 'apuntar', bola: enPiso(T) })
  sobrevolar([
    { piv: enPiso(P), yaw: yaw + 0.9, pitch: 0.72, yB: 0, D: 55 },
    { piv: enPiso([lerp(T[0], P[0], 0.5), lerp(T[1], P[1], 0.5)]), yaw: yaw + 0.3, pitch: 0.95, yB: 0, D: dist(T, P) * 0.9 + 40 },
    fin,
  ], dur)
  C.pasada(dur)
}
/** La intro de la primera vez: el dibujo de siempre, que una onda pasa a la grilla, y de la grilla se levanta la cancha. */
export function correrIntro(ronda, alFinal) {
  C.despertar()
  C.volumen(1)
  est.armaW = -40
  for (const a of arboles) a.popT = -1
  U.uDibVivo.value = U.uDibujo.value ? 1 : 0
  U.uDibW.value = -10
  intro = { t0: tReal, alFinal }
  C.zumbido(0.6)
  const P = M.hoyoActual(ronda).pin, T = ronda.pelota
  const yaw0 = -Math.PI / 2
  sobrevolar([
    { piv: V3(W / 2, 0, H / 2), yaw: yaw0, pitch: 1.56, yB: 0, D: 560 },
    { piv: V3(W / 2, 0, H / 2), yaw: yaw0, pitch: 1.5, yB: 0, D: 520 },
    { piv: V3(W / 2, 0, H * 0.55), yaw: yaw0 + 0.35, pitch: 1.0, yB: 0, D: 430 },
    { piv: V3(W / 2 - 10, 0, H * 0.62), yaw: yaw0 + 0.6, pitch: 0.75, yB: 0, D: 300 },
    { piv: enPiso([lerp(T[0], P[0], 0.5), lerp(T[1], P[1], 0.5)]), yaw: Math.atan2(P[1] - T[1], P[0] - T[0]) + 0.2, pitch: 0.95, yB: 0, D: dist(T, P) * 0.9 + 40 },
  ], 6.6)
  C.compilar(4.6)
  ;[0.3, 0.9, 1.5, 2.2, 2.9, 3.6].forEach((at) => setTimeout(() => { if (intro) { C.tecla(); C.datos(5, { vol: 0.05 }) } }, at * 1000))
}
export function saltarIntro() { if (intro) terminarIntro() }
function moverIntro() {
  if (!intro) return
  const t = tReal - intro.t0
  // 0–1,4 s: el dibujo, quieto, de arriba (como el juego). 1,4–3,4: la onda lo pasa a la grilla (de arriba para abajo).
  // 3,2–6: la cancha se levanta (de abajo para arriba), con los árboles que brotan
  U.uDibW.value = lerp(-10, H + 12, ss(1.4, 3.4, t))
  if (t > 3.4) U.uDibVivo.value = 0
  est.armaW = lerp(-40, H + 90, ss(3.2, 6.0, t))
  if (t >= 6.4) terminarIntro()
}
function terminarIntro() {
  const fin = intro?.alFinal
  intro = null
  U.uDibVivo.value = 0
  est.armaW = H + 200
  for (const a of arboles) if (a.popT < 0) a.popT = tReal - 1
  despertarArboles(2)
  C.compilado()
  C.zumbido(0)
  C.volumen(0.55)
  fin?.()
}
export const enIntro = () => !!intro

/**
 * Al pegar (un tiro completo): la versión nueva sale mientras vuela (el tiro bueno, aprobado; el malo, cambios del
 * cliente) y está lista antes de que pique. En el putt no cambia nada (el green es sagrado).
 */
export function alPegar(tiro, ronda, { bueno }) {
  ultimoTiro = tiro
  trazoPts = []; trazoApaga = null
  trazoColor = col(tiro.perfecto ? '#ffd45a' : climaId === 'nieve' ? '#ff5a36' : '#fff1c9')
  const desde = tiro.desde ?? tiro.pos // (el putt no tiene `desde`)
  golfistaBase = inversa(desde)
  teeBase = ronda.lieDesde === 'tee' || ronda.lie === 'tee' ? inversa(desde) : null
  if (tiro.modo === 'putt') return null
  const P = M.hoyoActual(ronda).pin
  const B = inversa(tiro.desde)
  const v = armarVersion(bueno, B, P)
  const registro = { tipo: v.tipo, citas: v.citas, agregados: v.nuevos.map((b) => b.id), quitados: v.quitar.map((id) => ({ id, b: est.bumps.find((b) => b.id === id), amp: est.bumps.find((b) => b.id === id)?.hasta ?? 1 })), skin: cancha.skinB, bugs: cancha.bugsB }
  const dur = clamp((tiro.T ?? 2) * 0.78, 0.9, 3.2)
  desplegar({
    nuevos: v.nuevos, quitar: v.quitar, skin: v.skin, bugs: v.bugs, origen: B, dur,
    alFinal: () => { juego.historial.push(registro); juego.ver = [juego.ver[0], juego.ver[1] + 1]; juego.versiones++; juego.bugs += v.bugs.length; C.version() },
  })
  bueno ? C.aprobado() : C.cliente()
  return { tipo: v.tipo, cita: v.citas[0] ?? null, bugs: v.bugs.length, version: `v${juego.ver[0]}.${juego.ver[1] + 1}` }
}
export const puedeRevert = () => juego.poder.revert > 0 && juego.historial.length > 0 && !barrido
/** ↩ git revert: la versión de antes (la onda vuelve hacia la pelota, como una cinta). La pelota va con su pedazo de cancha. */
export function revert(ronda, alFinal) {
  if (!puedeRevert()) return false
  const ultimo = juego.historial.pop()
  juego.poder.revert--
  juego.reverts++
  for (const q of ultimo.quitados) if (q.b && !est.bumps.includes(q.b)) { q.b.desde = 0; q.b.hasta = 0; est.bumps.push(q.b) }
  const base = inversa(ronda.pelota, true)
  pelotaBase = base
  desplegar({
    nuevos: [], quitar: ultimo.agregados, skin: ultimo.skin ?? 'clasico', bugs: ultimo.bugs ?? [], origen: base, rebobina: true, dur: 2.4,
    alFinal: () => { juego.ver = [juego.ver[0], Math.max(0, juego.ver[1] - 1)]; C.version(); const p = adelante(base, true); pelotaBase = null; alFinal?.(p) },
  })
  for (const q of ultimo.quitados) { const b = est.bumps.find((x) => x.id === q.id); if (b) b.hasta = q.amp }
  return true
}
export const revirtiendo = () => !!barrido?.rebobina
export const puedeDebug = () => juego.poder.bp > 0
/** Los usos que quedan de cada poder en este hoyo, y la versión de ahora y la de antes (para el botón del revert). */
export const poderes = () => ({ bp: juego.poder.bp, revert: juego.poder.revert, ver: version(), antes: juego.historial.length ? `v${juego.ver[0]}.${Math.max(0, juego.ver[1] - 1)}` : null })
/** ⏸ El breakpoint: la pelota congelada en el aire (el juego deja de avanzar el tiro); acá, lo que se dibuja. */
export function breakpoint(tiro) {
  if (!puedeDebug()) return false
  juego.poder.bp--
  tiro.destinoOrig = [tiro.desde[0] + tiro.carryVec[0] + (tiro.deriva?.[0] ?? 0), tiro.desde[1] + tiro.carryVec[1] + (tiro.deriva?.[1] ?? 0)]
  tiro.nuevo = [...tiro.destinoOrig]
  C.pausa()
  return true
}
/** Arrastrando la cancha: el destino nuevo (hasta un 38% de lo que le falta). */
export function arrastrarDestino(tiro, x, y) {
  const p = aPiso(x, y)
  if (!p || !tiro?.destinoOrig) return
  const resta = dist(tiro.pos, tiro.destinoOrig)
  const maxR = Math.max(10, resta * 0.38)
  const d = [p[0] - tiro.destinoOrig[0], p[1] - tiro.destinoOrig[1]], l = Math.hypot(...d)
  tiro.nuevo = l > maxR ? [tiro.destinoOrig[0] + (d[0] / l) * maxR, tiro.destinoOrig[1] + (d[1] / l) * maxR] : p
}
/** Sigue el vuelo al destino nuevo: el final de la curva del motor se corre y el control se acomoda para que no salte. */
export function continuar(t) {
  const u = t.t / t.T, b1 = 2 * u * (1 - u), b2 = u * u
  const dv = t.deriva ?? [0, 0]
  const Cn = [t.nuevo[0] - t.desde[0] - dv[0], t.nuevo[1] - t.desde[1] - dv[1]]
  if (b1 > 0.04) t.controlVec = [t.controlVec[0] + ((t.carryVec[0] - Cn[0]) * b2) / b1, t.controlVec[1] + ((t.carryVec[1] - Cn[1]) * b2) / b1]
  t.carryVec = Cn
  t.carry = Math.hypot(...Cn)
  C.seguir()
}

// ── de la cancha a la pantalla (para que el juego dibuje arriba la goma, la línea y los cartelitos) ──
const _pr = V3()
/** El punto de la cancha (en el piso, más `alt` yardas) en la pantalla: [x, y, adelante de la cámara]. */
export function aPantalla(p, alt = 0) {
  _pr.set(p[0], alturaEn(inversa(p)) + alt, p[1]).project(camara)
  return [((_pr.x + 1) / 2) * innerWidth, ((1 - _pr.y) / 2) * innerHeight, _pr.z < 1]
}
/** Dónde se ve la cabeza del mono `i` (para el cartelito del juego): [x, y, adelante], o null si no está. */
export function monoEnPantalla(i) {
  const m = monos3d[i]
  if (!m?.g.visible) return null
  _pr.set(m.g.position.x, m.g.position.y + 1.3 * m.g.scale.x, m.g.position.z).project(camara)
  return [((_pr.x + 1) / 2) * innerWidth, ((1 - _pr.y) / 2) * innerHeight, _pr.z < 1]
}
const _ray = new THREE.Raycaster(), _plano = new THREE.Plane(V3(0, 1, 0), 0), _hit = V3()
/** El punto de la pantalla, en la cancha (contra el piso, más o menos a la altura del lugar). */
export function aPiso(x, y) {
  _ray.setFromCamera(new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), camara)
  _plano.constant = -cam.piv.y
  return _ray.ray.intersectPlane(_plano, _hit) ? [_hit.x, _hit.z] : null
}
/** Cuántos píxeles mide una yarda en p (en promedio, en la pantalla). */
export function escEn(p) { const a = aPantalla(p), b = aPantalla([p[0] + 1, p[1]]), c = aPantalla([p[0], p[1] + 1]); return (Math.hypot(b[0] - a[0], b[1] - a[1]) + Math.hypot(c[0] - a[0], c[1] - a[1])) / 2 }
/** El ángulo en la pantalla de la dirección `ang` (de la cancha) en p. */
export function anguloPantalla(p, ang) { const a = aPantalla(p), b = aPantalla([p[0] + Math.cos(ang) * 0.5, p[1] + Math.sin(ang) * 0.5]); return Math.atan2(b[1] - a[1], b[0] - a[0]) }
/** La inversa de cómo se ve la cancha alrededor de p: de un arrastre en la pantalla, a la cancha. */
export function jacobianoInv(p) {
  const a = aPantalla(p), b = aPantalla([p[0] + 1, p[1]]), c = aPantalla([p[0], p[1] + 1])
  const j00 = b[0] - a[0], j01 = c[0] - a[0], j10 = b[1] - a[1], j11 = c[1] - a[1]
  const det = j00 * j11 - j01 * j10 || 1e-6
  return [j11 / det, -j01 / det, -j10 / det, j00 / det]
}
/** El radio de la pelota en la pantalla (para el aro dorado del latido y la goma). */
export function radioPelotaPx() {
  const d = camara.position.distanceTo(bola.position)
  return Math.max(3.2, (RADIO_BOLA * bola.scale.x / (d * Math.tan((camara.fov * Math.PI) / 360))) * (innerHeight / 2) + 1)
}
/** El óvalo de dónde pica, en el piso (se ve con la perspectiva). Devuelve cuánto mide de alto en la pantalla. */
export function trazarOvalo(ctx, c, largo, ancho, ang) {
  let yMin = Infinity, yMax = -Infinity
  ctx.beginPath()
  for (let i = 0; i <= 48; i++) {
    const t = (i / 48) * Math.PI * 2, l = Math.cos(t) * largo, w = Math.sin(t) * ancho
    const [x, y] = aPantalla([c[0] + Math.cos(ang) * l - Math.sin(ang) * w, c[1] + Math.sin(ang) * l + Math.cos(ang) * w])
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
    yMin = Math.min(yMin, y); yMax = Math.max(yMax, y)
  }
  ctx.closePath()
  return (yMax - yMin) / 2
}
/** El depurador: hasta dónde se puede correr el destino, a dónde iba y a dónde va ahora (con el resto del vuelo). */
export function dibujarDepurador(ctx, t) {
  if (!t?.nuevo) return
  const D = t.destinoOrig, Nn = t.nuevo
  const maxR = Math.max(10, dist(t.pos, D) * 0.38)
  const anillo = (c, r) => { ctx.beginPath(); for (let i = 0; i <= 48; i++) { const a = (i / 48) * Math.PI * 2, [x, y] = aPantalla([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r], 0.05); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y) } }
  ctx.save()
  ctx.lineCap = 'round'
  anillo(D, maxR); ctx.fillStyle = 'rgba(255,138,122,.08)'; ctx.fill()
  ctx.setLineDash([6, 7]); ctx.strokeStyle = 'rgba(255,138,122,.75)'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([])
  anillo(D, 1.6); ctx.strokeStyle = 'rgba(244,238,218,.55)'; ctx.lineWidth = 2; ctx.stroke()
  const B = bola.position
  ctx.setLineDash([1, 8]); ctx.lineWidth = 3; ctx.strokeStyle = '#e8c34a'
  ctx.beginPath()
  for (let i = 0; i <= 30; i++) {
    const u = i / 30
    _pr.set(lerp(B.x, Nn[0], u), lerp(B.y, alturaEn(inversa(Nn)), u * u), lerp(B.z, Nn[1], u)).project(camara)
    const x = ((_pr.x + 1) / 2) * innerWidth, y = ((1 - _pr.y) / 2) * innerHeight
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
  }
  ctx.stroke(); ctx.setLineDash([])
  const late = 1 + Math.sin(performance.now() / 160) * 0.12
  anillo(Nn, 2.2 * late); ctx.strokeStyle = 'rgba(12,43,28,.85)'; ctx.lineWidth = 6; ctx.stroke()
  anillo(Nn, 2.2 * late); ctx.strokeStyle = '#e8c34a'; ctx.lineWidth = 3; ctx.stroke()
  const [nx, ny] = aPantalla(Nn)
  ctx.strokeStyle = '#e8c34a'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(nx - 14, ny); ctx.lineTo(nx - 5, ny); ctx.moveTo(nx + 5, ny); ctx.lineTo(nx + 14, ny); ctx.moveTo(nx, ny - 10); ctx.lineTo(nx, ny - 4); ctx.moveTo(nx, ny + 4); ctx.lineTo(nx, ny + 10); ctx.stroke()
  ctx.restore()
}

/**
 * Cada cuadro: el juego le pasa lo que pasa (`st`: estado, ronda, tiro, apunte, drag, enPutt, golfista {sv, ang,
 * putt, palo, desde}, anim, fantasma, zona de la pantalla libre) y esto mueve todo y dibuja.
 */
// ── la pelota y el hoyo ──
// El motor resuelve el hoyo de una: la que entra la pone en el centro (y el juego ya pasa al hoyo siguiente), la de la
// corbata la hace girar a un radio fijo, la que llega pasada salta. Acá se ve como sería: la que entra cae desde donde
// venía (se monta en el labio, choca las paredes y el palo, pica en el fondo y queda ahí, a la vista); la corbata va
// montada en el labio; la que salta, salta; la que queda colgando, cuelga del borde. Y los saltos del motor (al empezar
// o terminar la corbata, al quedar en el borde) se ven suaves.
const GRAVEDAD = 28
const caida = { on: false, tiro: null, idx: -1, pin: null, piso: 0, p: [0, 0], v: [0, 0], y: 0, vy: 0, fondo: false }
const ultima = { B: null, raw: null, v: [0, 0], vy: 0, tiro: null }
const desfase = [0, 0]
let pinVivo = null, idxVivo = -1 // el hoyo que se juega (en el cartel del resultado, el motor ya pasó al siguiente)
let festejo = null // el festejo del hoyo (las chispas, la bandera que tiembla): cuando la pelota toca el fondo
function empezarCaida(t, pin, idx) {
  const R = RADIO_TAZA, rb = RADIO_BOLA, piso = alturaEn(pin)
  let p, v, y, vy
  if (ultima.B && ultima.tiro === t && Math.hypot(ultima.B.x - pin[0], ultima.B.z - pin[1]) < 3) {
    p = [ultima.B.x - pin[0], ultima.B.z - pin[1]]; v = [...ultima.v]; y = ultima.B.y - piso; vy = ultima.vy
  } else {
    // (sin de dónde venía: desde el borde, del lado del tiro)
    const de = t.desde ?? pin, d = dist(de, pin), u = d > 1e-6 ? [(de[0] - pin[0]) / d, (de[1] - pin[1]) / d] : [1, 0]
    p = [u[0] * R, u[1] * R]; v = [-u[0] * 2, -u[1] * 2]; y = rb; vy = 0
  }
  const sp = Math.hypot(v[0], v[1])
  if (sp > 7) { v[0] *= 7 / sp; v[1] *= 7 / sp }
  // para adentro (el motor ya dijo que entra): lo de costado (la corbata, el que pasa rozando) se lo come el borde
  const d = Math.hypot(p[0], p[1])
  if (d > 0.05) {
    const ux = -p[0] / d, uy = -p[1] / d, vr = v[0] * ux + v[1] * uy, tx = -uy, ty = ux, vt = (v[0] * tx + v[1] * ty) * 0.4
    const vr2 = Math.max(vr, 1.2, Math.abs(vt) * 1.3)
    v[0] = ux * vr2 + tx * vt; v[1] = uy * vr2 + ty * vt
  }
  Object.assign(caida, { on: true, tiro: t, idx, pin: [...pin], piso, p, v, y: Math.max(y, -HONDO_TAZA + rb), vy: Math.min(vy, 0), fondo: false })
}
function avanzarCaida(dt) {
  const R = RADIO_TAZA, rb = RADIO_BOLA, pared = R - rb, fondoY = 0.012 - HONDO_TAZA + rb, minPalo = PALO_R + rb
  const c = caida, n = Math.max(1, Math.ceil(dt * 240)), h = dt / n
  for (let i = 0; i < n; i++) {
    let d = Math.hypot(c.p[0], c.p[1])
    // apoyada: en el green (afuera del borde) o en el labio (la sostiene el canto del borde, que la empuja para adentro)
    const apoyo = d >= R ? rb : d > pared ? Math.sqrt(Math.max(0, rb * rb - (R - d) ** 2)) : -Infinity
    c.vy -= GRAVEDAD * h
    if (d > pared && d < R && c.y <= apoyo + 1e-3) {
      // en el labio: el canto la empuja para adentro y le frena lo de costado
      const ux = c.p[0] / d, uy = c.p[1] / d, k = (GRAVEDAD * (R - d)) / rb + 6, vt = c.v[0] * -uy + c.v[1] * ux, f = 1 - Math.exp(-4 * h)
      c.v[0] -= ux * k * h + -uy * vt * f; c.v[1] -= uy * k * h + ux * vt * f
    } else if (d >= R && c.y <= rb + 1e-3) { c.v[0] -= (c.p[0] / d) * 10 * h; c.v[1] -= (c.p[1] / d) * 10 * h } // (alrededor del hoyo el green baja un poquito)
    c.p[0] += c.v[0] * h; c.p[1] += c.v[1] * h
    c.y += c.vy * h
    if (c.y < apoyo) { c.y = apoyo; if (c.vy < 0) c.vy = 0 }
    // adentro: las paredes del vaso y el palo de la bandera
    d = Math.hypot(c.p[0], c.p[1])
    if (c.y < rb * 0.6) {
      if (d > pared) {
        const nx = c.p[0] / d, ny = c.p[1] / d, vr = c.v[0] * nx + c.v[1] * ny
        if (vr > 0) { c.v[0] = (c.v[0] - 1.45 * vr * nx) * 0.85; c.v[1] = (c.v[1] - 1.45 * vr * ny) * 0.85 }
        c.p[0] = nx * pared; c.p[1] = ny * pared
      }
      if (d < minPalo) {
        const nx = d > 1e-6 ? c.p[0] / d : 1, ny = d > 1e-6 ? c.p[1] / d : 0, vr = c.v[0] * nx + c.v[1] * ny
        if (vr < 0) { c.v[0] -= 1.4 * vr * nx; c.v[1] -= 1.4 * vr * ny }
        c.p[0] = nx * minPalo; c.p[1] = ny * minPalo
      }
    }
    // el fondo: pica (cada vez menos) y se frena
    if (c.y < fondoY) {
      c.y = fondoY
      if (c.vy < -0.8) c.vy = -c.vy * 0.32; else c.vy = 0
      c.v[0] *= 0.6; c.v[1] *= 0.6
      if (!c.fondo) { c.fondo = true; if (festejo) festejo.ya = true }
    }
    if (c.y <= fondoY + 1e-3) { const f = Math.exp(-5 * h); c.v[0] *= f; c.v[1] *= f }
  }
}
/** Cerca del hoyo (sin entrar): la corbata montada en el labio, la que salta del labio, la que cuelga del borde. */
function cercaDelHoyo(B, t, pin, alt) {
  const R = RADIO_TAZA, rb = RADIO_BOLA, boca = M.FISICA.bocaHoyo
  const dx = B.x - pin[0], dz = B.z - pin[1], d = Math.hypot(dx, dz)
  if (d > boca + 0.1 || alt > 0.05) return B
  let dv = d
  if (t?.vuelta && !t.vuelta.hecha) dv = R - rb * 0.55 // la corbata: el centro un poco adentro del borde
  else if ((!t || t.fase === 'quieta') && d >= boca - 0.01) dv = R + rb * 0.1 // colgando del borde (el motor la deja en la boca)
  const k = d > 1e-6 ? dv / d : 1
  const piso = alturaEn(pin)
  let y = rb
  if (t?.salto && d < boca) y = rb + 1.1 * rb * (1 - d / boca) // pasada: salta del labio
  else if (dv < R) y = dv > R - rb ? Math.sqrt(Math.max(0, rb * rb - (R - dv) ** 2)) : 0 // sobre el agujero, baja
  return V3(pin[0] + dx * k, piso + y, pin[1] + dz * k)
}
export function cuadro(dtR, st) {
  if (!renderer || !activo) return
  if (_prueba.lento) dtR *= _prueba.lento // (para probar: en cámara lenta)
  const congelado = st.estado === 'pausa'
  const dt = congelado ? 0 : dtR
  tReal += dtR
  est.t += dt
  zona = st.zona ?? zona
  const r = st.ronda
  pinActual = r && !r.terminada ? M.hoyoActual(r).pin : null
  // la grilla del green: se prende en el putt (apuntando y mientras rueda) y se apaga suave
  const grilla = !!st.enPutt && !intro && (st.estado === 'apuntar' || st.estado === 'swing' || (st.estado === 'tiro' && st.tiro?.modo === 'putt'))
  U.uGrilla.value += ((grilla ? 1 : 0) - U.uGrilla.value) * Math.min(1, dtR * 4)
  moverIntro()
  moverBarrido()
  const t = st.tiro
  // si la pelota ya picó y la versión no terminó (un tiro cortito), se termina ya: la física juega en la nueva
  if (barrido && !barrido.rebobina && t && t.fase !== 'vuelo') moverBarrido(true)
  // la pelota: la del tiro (con el arco de verdad: sube rápido y cae más parado), la quieta, o la que va con la cancha (revert)
  if (r && !r.terminada && st.estado !== 'resultado' && st.estado !== 'fin') { pinVivo = pinActual; idxVivo = r.idx }
  // la que entró: cae en el hoyo (desde donde venía) y queda en el fondo, también con el cartel del resultado
  if (t?.embocada && t.fase === 'quieta' && caida.tiro !== t && pinVivo) empezarCaida(t, pinVivo, idxVivo)
  let B
  if (caida.on) {
    avanzarCaida(dt)
    B = V3(caida.pin[0] + caida.p[0], caida.piso + caida.y, caida.pin[1] + caida.p[1])
  } else if (t && st.estado !== 'resultado') {
    let alt = t.alt ?? 0
    if (t.modo === 'full' && t.fase === 'vuelo' && !t.pegoPalo && t.T) {
      const u = clamp(t.t / t.T, 0.001, 0.999)
      alt *= (3.48 * u * (1 - u) ** 0.82) / (4 * u * (1 - u)) // la forma del vuelo de verdad (mismo alto, el pico más adelante)
    }
    B = V3(t.pos[0], alturaEn(inversa(t.pos)) + RADIO_BOLA + alt, t.pos[1])
    if (pinActual) B = cercaDelHoyo(B, t, pinActual, alt)
    if (t.modo === 'full' && (t.fase === 'vuelo' || trazoPts.length < 400) && !t.embocada) { const l = trazoPts[trazoPts.length - 1]; if (!l || Math.hypot(l[0] - B.x, l[1] - B.y, l[2] - B.z) > 0.25) trazoPts.push([B.x, B.y, B.z]) }
    if (t.fase === 'quieta' && trazoApaga == null) trazoApaga = tReal
  } else if (pelotaBase) {
    const p = adelante(pelotaBase)
    B = V3(p[0], alturaEn(pelotaBase) + RADIO_BOLA, p[1])
  } else if (r) {
    const enTee = r.lie === 'tee' && !st.enPutt
    B = V3(r.pelota[0], alturaEn(inversa(r.pelota)) + RADIO_BOLA + (enTee ? ALTO_TEE : 0), r.pelota[1])
    if (pinActual && !enTee) B = cercaDelHoyo(B, null, pinActual, 0)
  } else B = V3(W / 2, -10, H / 2)
  // los saltos del motor (la corbata que empieza o termina, la que queda en el borde): se ven suaves
  if (t && !caida.on && t.fase !== 'vuelo' && ultima.tiro === t && ultima.raw) {
    const jx = B.x - ultima.raw[0], jz = B.z - ultima.raw[1], j = Math.hypot(jx, jz)
    if (j > Math.max(0.12, Math.hypot(ultima.v[0], ultima.v[1]) * dt * 3) && j < 2.5) { desfase[0] -= jx; desfase[1] -= jz }
  } else { desfase[0] = desfase[1] = 0 }
  const raw = [B.x, B.z]
  const fd = Math.exp(-dt / 0.07)
  desfase[0] *= fd; desfase[1] *= fd
  B.x += desfase[0]; B.z += desfase[1]
  if (st.anim && st.estado === 'anim') {
    const a = st.anim, u = clamp(a.t / a.T, 0, 1), e = easeIO(u)
    const d = a.desde ?? a.hasta, hh = a.hasta ?? d
    if (d && hh) B = V3(lerp(d[0], hh[0], e), alturaEn(inversa([lerp(d[0], hh[0], e), lerp(d[1], hh[1], e)])) + RADIO_BOLA + Math.sin(Math.PI * u) * 4, lerp(d[1], hh[1], e))
  }
  // (la velocidad que se ve: para rodar y para seguir de ahí si cae en el hoyo)
  if (ultima.B && dt > 0) {
    const k = Math.min(1, dt * 30)
    ultima.v[0] += ((B.x - ultima.B.x) / dt - ultima.v[0]) * k; ultima.v[1] += ((B.z - ultima.B.z) / dt - ultima.v[1]) * k
    ultima.vy += ((B.y - ultima.B.y) / dt - ultima.vy) * k
  }
  if (ultima.tiro !== t) { ultima.v = [0, 0]; ultima.vy = 0 }
  ultima.B = B.clone(); ultima.raw = raw; ultima.tiro = t
  bola.position.copy(B)
  bola.visible = !!r && !intro && st.estado !== 'fin'
  // rueda sobre el eje de costado a la marcha
  if (dt > 0) {
    const vel = Math.hypot(ultima.v[0], ultima.v[1])
    if (vel > 0.05 && vel < 60) bola.rotateOnWorldAxis(_eje.set(ultima.v[1] / vel, 0, -ultima.v[0] / vel), (vel * dt) / (RADIO_BOLA * bola.scale.x))
  }
  // el festejo, cuando toca el fondo (o enseguida, si no se vio caer)
  if (festejo && (festejo.ya || tReal - festejo.t > 0.9)) festejar()
  est.bola = r ? inversa(r.pelota) : [0, 0]
  // la sombra de la pelota en el piso (en el aire, más chica y más clara): así se lee la altura
  {
    const piso = alturaEn(inversa([B.x, B.z]))
    const alto = Math.max(0, B.y - piso - RADIO_BOLA)
    sombraBola.position.set(B.x + alto * 0.35, piso + 0.012, B.z + alto * 0.35)
    const k = escalaVista(B) * RADIO_BOLA * (1.1 + Math.min(1.5, alto * 0.02))
    sombraBola.scale.setScalar(k)
    sombraBola.material.opacity = 0.32 * Math.max(0.25, 1 - alto / 45)
    sombraBola.visible = bola.visible && !(caida.on && caida.y < RADIO_BOLA * 0.8)
  }
  // el tee: en la salida, la pelota arriba del tee; después del drive, el tee queda ahí
  const enTee = r && r.lie === 'tee' && !st.enPutt && !t
  if (enTee) teeBase = inversa(r.pelota)
  teePeg.visible = !!teeBase && !!r && !intro
  if (teeBase) { const p = adelante(teeBase); teePeg.position.set(p[0], alturaEn(teeBase), p[1]); teePeg.scale.setScalar(escalaVista(teePeg.position, ALTO_TEE, 1.5)) }
  // el fantasma del match
  fantasma.visible = !!st.fantasma && !intro
  if (st.fantasma) {
    const f = st.fantasma, adentro = pinActual && !f.alt && dist(f.pos, pinActual) < RADIO_TAZA - RADIO_BOLA // (el que la metió: en el fondo)
    fantasma.position.set(f.pos[0], alturaEn(inversa(f.pos)) + RADIO_BOLA + (adentro ? 0.012 - HONDO_TAZA : f.alt ?? 0), f.pos[1])
    fantasma.scale.setScalar(escalaVista(fantasma.position) * 1.1)
  }
  // la cámara (la intro y los sobrevuelos van por su ruta)
  if (!pose?.ruta) pose = _prueba.pose ?? poseDelJuego({ ...st, bola: B })
  moverCamara(dtR)
  bola.scale.setScalar(escalaVista(B))
  // Rorro: parado atrás de la pelota (de la que pega; mientras vuela, donde pegó), con el swing del juego
  const gs = st.golfista
  rorro.g.visible = !!r && !intro && !!gs && st.estado !== 'fin'
  if (rorro.g.visible) {
    const donde = gs.desde && (st.estado === 'tiro' || st.estado === 'anim' || st.estado === 'swing' || st.estado === 'resultado' || st.estado === 'pausa') ? gs.desde : r.pelota
    const base = pelotaBase ?? (golfistaBase && (st.estado === 'tiro' || st.estado === 'anim' || st.estado === 'pausa') ? golfistaBase : inversa(donde))
    const pw = adelante(base)
    const bl = poseRorro(gs.sv ?? 0, !!gs.putt, gs.palo ?? 'hierro')
    const ang = gs.ang ?? 0
    rorro.g.rotation.y = -ang
    const off = V3(bl.x, 0, bl.z).applyAxisAngle(_Y, -ang).multiplyScalar(ESCALA_RORRO)
    rorro.g.position.set(pw[0] - off.x, alturaEn(base), pw[1] - off.z)
  }
  moverArboles(dt)
  moverMonos3d(dt, st)
  moverBanderas(dtR, st)
  moverParticulas(dt)
  moverCharcos()
  moverClima(dt, st)
  if (trazoPts.length > 1) pintarTrazo(); else trazo.visible = false
  trazo.visible = trazoPts.length > 1
  // el dron (el servo y el aire de la cámara, el raspado de la cancha): solo en la intro y los sobrevuelos
  const velCam = dtR > 0 ? camara.position.distanceTo(posAntes) / dtR : 0
  posAntes.copy(camara.position)
  const dron = !!intro || !!pose?.ruta
  C.movimiento(dron && !congelado ? velCam : 0, (dron ? Math.min(0.6, energiaArboles * 0.35) + (intro ? 0.4 : 0) : 0) + est.swVivo * 0.25)
  C.zumbido(intro ? 0.8 : 0)
  subirUniforms()
  renderer.render(escena, camara)
  ultimoEstado = st.estado
}
const posAntes = V3()
/** Lo que pasa en el tiro, en 3D: el pasto que salta en el pique, la arena, la nieve, el agua; la bandera que tiembla. */
export function evento(e, t, ronda) {
  const p = [t.pos[0], alturaEn(inversa(t.pos)) + 0.03, t.pos[1]]
  if (e.tipo === 'pique') {
    if (e.terreno === 'bunker') chispas(p, 22, ['#f4e6c4', '#e9d7a9'], 2.4, 3.2, 1.1)
    else if (climaId === 'nieve' && e.terreno !== 'green') chispas(p, 22, ['#ffffff', '#e8f0f8'], 2, 3)
    else if (climaId === 'seco' && e.terreno !== 'green') chispas(p, 16, ['#c9a46a', '#b08850'], 1.8, 1.8)
    else if (['lluvia', 'tormenta', 'mojado'].includes(climaId) && e.terreno !== 'green') chispas(p, 14, ['#bcd6e8', '#9fc0d8'], 1.8, 2.4)
    else if (e.terreno !== 'green') chispas(p, 10, ['#6f9636', '#3e6b1f', '#5d432c'], 1.4, 2)
  } else if (e.tipo === 'bandera') { const g = banderas[ronda?.idx ?? 0]; if (g) g.userData.tiembla = 0.8 }
  else if (e.tipo === 'charco') chispas(p, 18, ['#bcd6e8', '#e8f0f8'], 2.2, 3)
}
/** Adentro: el festejo sale cuando la pelota toca el fondo del hoyo (las chispas, la bandera que tiembla, el aro, los monos). */
export function embocada(ronda) {
  festejo = { pin: [...M.hoyoActual(ronda).pin], idx: ronda.idx, t: tReal, ya: false }
}
function festejar() {
  const { pin, idx } = festejo
  festejo = null
  chispas([pin[0], alturaEn(pin) + 0.1, pin[1]], 60, ['#e8c34a', '#f4eeda', '#c8352e', '#2f5fd0'], 2.4, 5, 1.6)
  const g = banderas[idx]
  if (g) { g.userData.tiembla = 0.8; g.userData.boom = 1 }
  for (const m of monos3d) if (m.g.visible && Math.hypot(m.g.position.x - pin[0], m.g.position.z - pin[1]) < 25) m.salto = 1.2
}
export function golpe(ronda) {
  const p = [bola.position.x, bola.position.y, bola.position.z]
  if (ronda?.lie !== 'green') chispas(p, ronda?.lie === 'bunker' ? 18 : 8, ronda?.lie === 'bunker' ? ['#f4e6c4', '#e9d7a9'] : ['#6f9636', '#a2bc43', '#5d432c'], 1.2, 1.6, 0.7)
}
// para probar (window.__r3d en la copia dev/)
export const _prueba = { juego, est, cancha, camara, cam, rorro, poseRorro, ponerSkins, SKINS, arboles, bola, pose: null, V3, ren: () => renderer, escena, caida, lento: 0 }
