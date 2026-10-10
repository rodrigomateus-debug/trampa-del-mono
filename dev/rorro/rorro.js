// La cancha de Rorro (v2): La Trampa del Mono hecha en código, jugada con el motor de verdad. La cancha sale del mapa del
// juego (campo3d.js) y es una maqueta low-poly con three.js; se juega igual que el juego (la goma para atrás, el latido
// con el sweet spot, normal o PRO, el putt con la caída del green, los monos, el viento y el clima del motor), y en cada
// tiro sale una versión nueva de la cancha: el bueno se aprueba (se abre la calle, se arreglan los bugs, una skin
// prolija) y el malo trae cambios del cliente (todo se mueve, otra paleta, otro tipo de árbol, otra textura y bugs).
// La grilla del motor se hornea en cada versión: la física juega en la cancha que se ve. Alrededor de la pelota y de
// los hoyos la cancha queda quieta (la pelota nunca cambia de lie).
// Superpoderes de dev (uno de cada por hoyo): ⏸ debug (en el aire congela la pelota y le cambiás el destino, con la
// física de verdad) y ↩ revert (vuelve la versión anterior de la cancha).
// Sonido: el dron (ciber.js) en la compilación, el sobrevuelo y la vista de cámara; jugando, los sonidos del juego
// (sonido.js). El deploy, el revert y el breakpoint suenan a máquina (son de Rorro).
import * as THREE from 'three'
import * as M from '../motor.js'
import * as S from '../sonido.js'
import * as C from './ciber.js'
import { PLANTEL } from '../plantel.js'
import { campoBase, FILAS, W, H, N, clamp, lerp, ss, dist, norm, letraBase, CAPA, muestra, est, NB, avance, armado, desplazo, adelante, inversa, alturaEn, hornear, campoCon, SKINS, TIPOS_ARBOL } from './campo3d.js'

const $ = (s) => document.querySelector(s)
const PARAMS = new URLSearchParams(location.search)
const PRUEBA = PARAMS.has('prueba')
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const elastic = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1)
const rng = () => Math.random()
const rndFijo = M.rngDesde(20261010)
const elegir = (l) => l[Math.floor(Math.random() * l.length)]
const HOYOS = M.HOYOS
const RORRO = PLANTEL.find((j) => j.apodo === 'Rorro') ?? { apodo: 'Rorro', emoji: '🥃', hcp: 14.6 }
const PASO = 1 / 120

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
const b255 = (a) => (i) => Math.round(clamp(a[i], 0, 1) * 255)
const TEX1 = textura(b255(CAPA.calle), b255(CAPA.green), b255(CAPA.bunker), b255(CAPA.tee))
const TEX2 = textura(b255(CAPA.afuera), b255(CAPA.arbol), (i) => Math.round(clamp(CAPA.caida[i] / 3 + 0.5, 0, 1) * 255), () => 255)

// ── three ──
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
escena.background = FONDO.clone()
escena.fog = new THREE.Fog(FONDO.clone(), 520, 1200)
const camara = new THREE.PerspectiveCamera(48, 1, 0.3, 2500)
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
const col = (h) => new THREE.Color(h)
const V3 = (x, y, z) => new THREE.Vector3(x, y, z)

// ── el terreno: una malla de una yarda, deformada y pintada en el shader (sobre el material estándar: luz y sombras) ──
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
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3))
  g.setIndex(new THREE.BufferAttribute(idx, 1))
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(W / 2, 0, H / 2), 400)
  return g
}
const paleta = (id) => SKINS[id].col.map(col)
const U = {
  uMask1: { value: TEX1 }, uMask2: { value: TEX2 }, uTam: { value: new THREE.Vector2(W, H) },
  uBC: { value: Array.from({ length: NB }, () => new THREE.Vector4()) }, uBV: { value: Array.from({ length: NB }, () => new THREE.Vector4()) }, uNB: { value: 0 },
  uBola0: { value: new THREE.Vector2() }, uBola1: { value: new THREE.Vector2() }, uPins: { value: est.pins.map((p) => new THREE.Vector2(...p)) },
  uSwO: { value: new THREE.Vector2() }, uSwSentido: { value: 1 }, uSwW: { value: 1e5 }, uSwBanda: { value: est.swBanda }, uSwVivo: { value: 0 }, uRebobina: { value: 0 },
  uT: { value: 0 }, uResp: { value: est.resp },
  uArmaO: { value: new THREE.Vector2(...est.armaO) }, uArmaD: { value: new THREE.Vector2(...est.armaD) }, uArmaW: { value: est.armaW }, uArmaBanda: { value: est.armaBanda },
  uSkA: { value: paleta('clasico') }, uSkB: { value: paleta('clasico') }, uPatA: { value: 0 }, uPatB: { value: 0 },
  uBug: { value: Array.from({ length: 4 }, () => new THREE.Vector4()) }, uBugV: { value: Array.from({ length: 4 }, () => new THREE.Vector4()) }, uNBug: { value: 0 },
  uNubes: { value: 0 }, uMojado: { value: 0 }, uSeco: { value: 0 }, uOscuro: { value: 0 }, uNieve: { value: 0 }, uNubeV: { value: new THREE.Vector2(1, 0.3) },
  uColPlano: { value: col('#0b2219') }, uColOro: { value: col('#e8c34a') }, uColAzul: { value: col('#7fc4ff') },
}
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
    float amp = mix(v.z, v.w, k);
    if (c.w > 1.5) { d += v.xy * sin(dot(q, c.xy) + c.z) * amp; continue; }
    vec2 e = q - c.xy;
    float w = exp(-dot(e, e) / (c.z * c.z)) * amp;
    d += (c.w < 0.5 ? v.xy : e / c.z * v.x) * w;
  }
  d.x += uResp * (sin(q.y * 0.061 + uT * 0.9) + 0.5 * sin(q.x * 0.11 - uT * 1.3));
  d.y += uResp * (cos(q.x * 0.07 + uT * 0.7) + 0.5 * cos(q.y * 0.09 + uT * 1.1));
  float qb = mix(quieto(q, uBola0, 4.0, 10.0), quieto(q, uBola1, 4.0, 10.0), k);
  float qp = quieto(q, uPins[0], 5.0, 11.0) * quieto(q, uPins[1], 5.0, 11.0) * quieto(q, uPins[2], 5.0, 11.0);
  return d * qb * qp;
}
vec2 inversa(vec2 p) { vec2 q = p; for (int i = 0; i < 3; i++) q = p - desplazo(q); return q; }
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
uniform vec3 uSkA[11]; uniform vec3 uSkB[11]; uniform float uPatA; uniform float uPatB;
uniform vec4 uBug[4]; uniform vec4 uBugV[4]; uniform int uNBug;
uniform float uNubes; uniform float uMojado; uniform float uSeco; uniform float uOscuro; uniform float uNieve; uniform vec2 uNubeV;
uniform vec3 uColPlano; uniform vec3 uColOro; uniform vec3 uColAzul;
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
// el dibujo del pasto: 0 rayas de corte · 1 diagonales · 2 cuadros · 3 pixelado · 4 ondas · 5 grilla
float patron(vec2 q, float pat) {
  if (pat < 0.5) return step(0.5, fract(q.y / 7.0));
  if (pat < 1.5) return step(0.5, fract((q.x + q.y) / 8.0));
  if (pat < 2.5) return mod(floor(q.x / 6.0) + floor(q.y / 6.0), 2.0);
  if (pat < 3.5) return step(0.5, hash(floor(q / 2.5)));
  if (pat < 4.5) return step(0.5, fract(q.y / 9.0 + sin(q.x * 0.08) * 0.6));
  return linea(q, 4.0);
}
vec3 pinta(vec2 q, vec4 a, vec4 b, float arriba, vec3 P[11], float pat) {
  float fw = smoothstep(0.38, 0.62, a.r), gr = smoothstep(0.38, 0.62, a.g), bk = smoothstep(0.3, 0.6, a.b), te = smoothstep(0.38, 0.62, a.a);
  float fu = smoothstep(0.38, 0.62, b.r), ar = b.g;
  vec2 qn = (pat > 2.5 && pat < 3.5) ? floor(q / 2.5) * 2.5 : q;
  float n = ruido(qn * 0.32) * 0.6 + ruido(qn * 1.4) * 0.4;
  float r = patron(q, pat);
  vec3 c = mix(P[0], P[1], n);
  c *= 1.0 - 0.32 * ar;
  c = mix(c, mix(P[2], P[3], r) * (0.96 + 0.08 * n), fw);
  float rg = pat < 0.5 ? step(0.5, fract((q.x + q.y) / 3.4)) : r;
  c = mix(c, mix(P[4], P[5], rg), gr);
  c = mix(c, P[7] * (0.94 + 0.12 * r), te);
  c = mix(c, P[6] * (0.92 + 0.1 * ruido(q * 5.0)), bk);
  float borde = max(4.0 * smoothstep(0.2, 0.8, a.r) * (1.0 - smoothstep(0.2, 0.8, a.r)), 4.0 * smoothstep(0.2, 0.8, a.g) * (1.0 - smoothstep(0.2, 0.8, a.g)));
  c *= 1.0 - 0.14 * borde;
  c = mix(c, P[10] * (0.85 + 0.2 * ruido(q * vec2(0.6, 2.5))), (1.0 - smoothstep(0.42, 0.8, arriba)) * (1.0 - fu * 0.6));
  float tr = step(0.5, fract((q.x + q.y) / 9.0));
  c = mix(c, mix(P[8], P[9], tr), fu * smoothstep(0.75, 0.95, arriba));
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
    c = mix(c, blanco, uNieve * mix(0.94, 0.5, fwg) * (1.0 - fu * 0.25));
  }
  c = mix(c, c * vec3(1.14, 1.0, 0.7), uSeco * (1.0 - 0.6 * smoothstep(0.38, 0.62, a.g)));
  c *= 1.0 - 0.18 * uMojado;
  if (uNubes > 0.0) {
    float s = smoothstep(0.45, 0.72, ruido((q + uNubeV * uT) * 0.011) * 0.65 + ruido((q - uNubeV * uT * 0.6) * 0.03) * 0.35);
    c *= 1.0 - 0.36 * uNubes * s;
  }
  c *= 1.0 - 0.3 * uOscuro;
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
const matTerreno = new THREE.MeshStandardMaterial({ roughness: 0.93, metalness: 0, flatShading: true })
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

// ── el estado de la cancha de cada versión: la skin (paleta, patrón y árbol) y los bugs, de antes (A) y de ahora (B) ──
const cancha = { skinA: 'clasico', skinB: 'clasico', bugsA: [], bugsB: [], arbolBugA: new Map(), arbolBugB: new Map(), monoBug: null }
function subirUniforms() {
  const bs = est.bumps.slice(-NB)
  bs.forEach((b, i) => { U.uBC.value[i].set(b.cx, b.cy, b.r, b.tipo); U.uBV.value[i].set(b.vx, b.vy, b.desde, b.hasta) })
  U.uNB.value = bs.length
  U.uBola0.value.set(...est.bola0); U.uBola1.value.set(...est.bola1)
  est.pins.forEach((p, i) => U.uPins.value[i].set(...p))
  U.uSwO.value.set(...est.swO); U.uSwSentido.value = est.swSentido; U.uSwW.value = est.swW; U.uSwBanda.value = est.swBanda; U.uSwVivo.value = est.swVivo; U.uRebobina.value = est.rebobina
  U.uT.value = est.t; U.uResp.value = est.resp
  U.uArmaW.value = est.armaW
  // los bugs del terreno: los de antes que se van y los nuevos que vienen
  const bugs = [...cancha.bugsA.filter((b) => b.suelo && !cancha.bugsB.includes(b)).map((b) => [b, 1, 0]), ...cancha.bugsB.filter((b) => b.suelo).map((b) => [b, cancha.bugsA.includes(b) ? 1 : 0, 1])].slice(0, 4)
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
  redondo: new THREE.IcosahedronGeometry(1, 0),
  pino: unir(new THREE.ConeGeometry(1.05, 1.9, 7).translate(0, -0.2, 0), new THREE.ConeGeometry(0.72, 1.5, 7).translate(0, 0.75, 0)),
  cubo: new THREE.BoxGeometry(1.45, 1.45, 1.45),
  chupetin: new THREE.SphereGeometry(0.95, 8, 6),
  cristal: new THREE.OctahedronGeometry(1.05, 0).scale(0.8, 1.5, 0.8),
  cactus: unir(new THREE.CylinderGeometry(0.42, 0.48, 2.6, 7), new THREE.CylinderGeometry(0.2, 0.22, 0.9, 6).rotateZ(Math.PI / 2).translate(0.55, 0.05, 0), new THREE.CylinderGeometry(0.21, 0.23, 0.9, 6).translate(0.98, 0.4, 0), new THREE.CylinderGeometry(0.19, 0.21, 0.75, 6).rotateZ(Math.PI / 2).translate(-0.5, -0.25, 0), new THREE.CylinderGeometry(0.19, 0.21, 0.75, 6).translate(-0.86, 0.08, 0)),
}
// cuánto tronco lleva cada tipo y a qué altura va la copa (× el radio)
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
const copas = {}
for (const tipo of TIPOS_ARBOL) {
  const mat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: tipo === 'cristal' ? 0.25 : 0.85, metalness: tipo === 'cristal' ? 0.35 : 0 })
  nevable(mat)
  const m = new THREE.InstancedMesh(GEO_ARBOL[tipo], mat, arboles.length)
  m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false
  for (let i = 0; i < arboles.length; i++) { m.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0)); m.setColorAt(i, col('#3a6b24')) }
  copas[tipo] = m
  escena.add(m)
}
const troncos = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.26, 1, 6).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: '#5b3f26', roughness: 1 }), arboles.length)
troncos.castShadow = true; troncos.frustumCulled = false
escena.add(troncos)
const tipoDe = (skin) => SKINS[skin].arbol
function colorArbol(a, skin) { const v = SKINS[skin].verdes; return col(v[Math.floor(a.tono * v.length) % v.length]).offsetHSL(0, 0, (a.tono - 0.5) * 0.05) }
arboles.forEach((a, i) => copas.redondo.setColorAt(i, colorArbol(a, 'clasico')))
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), CERO = new THREE.Matrix4().makeScale(0, 0, 0)
let energiaArboles = 0
function moverArboles(dt) {
  const viento = Math.sin(est.t * 0.7)
  let suma = 0
  const tocados = new Set()
  for (let i = 0; i < arboles.length; i++) {
    const a = arboles[i]
    const obj = adelante(a.q)
    const kx = (obj[0] - a.pos[0]) * 70, ky = (obj[1] - a.pos[1]) * 70
    a.vel[0] = (a.vel[0] + kx * dt) * Math.exp(-7 * dt); a.vel[1] = (a.vel[1] + ky * dt) * Math.exp(-7 * dt)
    a.pos[0] += a.vel[0] * dt; a.pos[1] += a.vel[1] * dt
    if (a.popT < 0 && armado(a.q) > 0.55) a.popT = est.tReal
    // la skin que le toca (cuando pasa la onda del deploy, la nueva) y el bug
    const k = avance(a.q)
    const quiere = k > 0.5 ? cancha.skinB : cancha.skinA
    if (quiere !== a.skin) {
      a.swap = { de: a.skin, t0: est.tReal }
      a.skin = quiere
      copas[tipoDe(quiere)].setColorAt(i, colorArbol(a, quiere)); tocados.add(tipoDe(quiere))
    }
    a.bug = (k > 0.5 ? cancha.arbolBugB : cancha.arbolBugA).get(i) ?? null
    const pop = a.popT < 0 ? 0 : elastic(Math.min(1, (est.tReal - a.popT) / 0.9))
    const sw = a.swap ? Math.min(1, (est.tReal - a.swap.t0) / 0.55) : 1
    if (a.swap && sw >= 1) a.swap = null
    const v = Math.hypot(a.vel[0], a.vel[1])
    suma += v
    const aplasta = Math.min(0.28, v * 0.035)
    const suelo = alturaEn(a.q)
    const tipo = tipoDe(a.skin), P = PARAM_ARBOL[tipo]
    let r = a.r * pop
    let sy = 1, sxz = 1, flota = 0, reves = 0
    if (a.bug === 'flota') flota = 5 + Math.sin(est.tReal * 1.7 + a.fase) * 0.8
    if (a.bug === 'estirado') { sy = 3.2; sxz = 0.55 }
    if (a.bug === 'reves') reves = Math.PI
    _e.set(clamp(a.vel[1] * 0.05, -0.4, 0.4) + Math.sin(est.t * 1.3 + a.fase) * 0.015 * viento + reves, a.giro + (a.bug === 'flota' ? est.tReal * 1.5 : 0), -clamp(a.vel[0] * 0.05, -0.4, 0.4) + Math.cos(est.t * 1.1 + a.fase) * 0.015)
    _q.setFromEuler(_e)
    const tronco = a.alto * r * 0.55 * P.tronco
    const yc = suelo + tronco + r * P.alto * (1 - aplasta) * sy + flota
    // la copa nueva crece con rebote; la vieja se achica
    for (const t of TIPOS_ARBOL) {
      let esc = 0
      if (t === tipo) esc = a.swap ? elastic(sw) : 1
      else if (a.swap && t === tipoDe(a.swap.de)) esc = 1 - easeIO(sw)
      if (esc <= 0.001) { if (a['z' + t] !== true) { copas[t].setMatrixAt(i, CERO); a['z' + t] = true; tocados.add(t) } continue }
      a['z' + t] = false
      _p.set(a.pos[0], yc, a.pos[1])
      _s.set(r * esc * (1 + aplasta * 0.5) * sxz, r * esc * 0.95 * (1 - aplasta) * sy, r * esc * (1 + aplasta * 0.5) * sxz)
      copas[t].setMatrixAt(i, _m.compose(_p, _q, _s))
      tocados.add(t)
    }
    _p.set(a.pos[0], suelo - 0.1 + flota, a.pos[1])
    _s.set(Math.max(0.001, pop), (tronco + 0.25) * (P.tronco ? 1 : 0.001), Math.max(0.001, pop))
    troncos.setMatrixAt(i, _m.compose(_p, _q.setFromEuler(_e.set(reves, 0, 0)), _s))
  }
  for (const t of tocados) { copas[t].instanceMatrix.needsUpdate = true; if (copas[t].instanceColor) copas[t].instanceColor.needsUpdate = true }
  troncos.instanceMatrix.needsUpdate = true
  energiaArboles = suma / arboles.length
}

// ── la bandera y el hoyo, como los de verdad: la taza con su vaso blanco, el palo con la bandera numerada que flamea con
// el viento; en el putt se saca y queda acostada en el green ──
const TELA = { roja: ['#c8352e', '#f4eeda'], blanca: ['#f4eeda', '#14402a'], azul: ['#2f5fd0', '#f4eeda'] }
function texturaTaza() {
  const c = document.createElement('canvas'); c.width = c.height = 256
  const g = c.getContext('2d')
  const R = 128
  // el corte del green: un borde de tierra
  g.fillStyle = 'rgba(70,52,30,.75)'; g.beginPath(); g.arc(R, R, R - 2, 0, 7); g.fill()
  // adentro: oscuro, con la pared de enfrente (abajo a la derecha del dibujo) iluminada
  const gr = g.createRadialGradient(R - 26, R - 30, 8, R, R, R - 10)
  gr.addColorStop(0, '#020604'); gr.addColorStop(0.55, '#08130c'); gr.addColorStop(1, '#22352a')
  g.fillStyle = gr; g.beginPath(); g.arc(R, R, R - 12, 0, 7); g.fill()
  // el vaso blanco: se ve del lado de la luz (la pared de enfrente)
  g.strokeStyle = 'rgba(240,240,232,.92)'; g.lineWidth = 16
  g.beginPath(); g.arc(R, R, R - 22, -0.35 * Math.PI, 0.9 * Math.PI); g.stroke()
  g.strokeStyle = 'rgba(160,165,160,.35)'; g.beginPath(); g.arc(R, R, R - 22, 0.9 * Math.PI, 1.65 * Math.PI); g.stroke()
  // el filo del pasto que toma luz
  g.strokeStyle = 'rgba(255,255,236,.35)'; g.lineWidth = 5; g.beginPath(); g.arc(R, R, R - 6, -0.2 * Math.PI, 0.8 * Math.PI); g.stroke()
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
  return t
}
function texturaTela(n, color) {
  const [fondo, letra] = TELA[color] ?? TELA.roja
  const c = document.createElement('canvas'); c.width = 256; c.height = 168
  const g = c.getContext('2d')
  g.fillStyle = fondo; g.fillRect(0, 0, 256, 168)
  g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, 0, 14, 168) // la vaina del palo
  g.fillStyle = letra; g.font = '120px Anton, Impact, "Arial Narrow", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillText(String(n), 136, 92)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
  return t
}
const TEX_TAZA = texturaTaza()
const RADIO_TAZA = M.FISICA.bocaHoyo
const ALTO_PALO = 3.4
const banderas = HOYOS.map((h, i) => {
  const g = new THREE.Group()
  const taza = new THREE.Mesh(new THREE.CircleGeometry(RADIO_TAZA, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: TEX_TAZA, transparent: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }))
  taza.position.y = 0.03
  taza.receiveShadow = true
  const palo = new THREE.Group() // el palo y la tela juntos (para sacarlo en el putt)
  const vara = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, ALTO_PALO, 8).translate(0, ALTO_PALO / 2, 0), new THREE.MeshStandardMaterial({ color: '#f5f2e6', roughness: 0.35 }))
  const anillos = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.5, 8).translate(0, 0.25 + ALTO_PALO * 0.18, 0), new THREE.MeshStandardMaterial({ color: '#c8352e', roughness: 0.4 }))
  const punta = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshStandardMaterial({ color: '#e8c34a', roughness: 0.25, metalness: 0.6 }))
  punta.position.y = ALTO_PALO + 0.03
  const geoTela = new THREE.PlaneGeometry(1.25, 0.82, 14, 5).translate(0.625, 0, 0)
  const tela = new THREE.Mesh(geoTela, new THREE.MeshStandardMaterial({ map: texturaTela(h.n, 'roja'), side: THREE.DoubleSide, roughness: 0.75 }))
  tela.position.set(0.04, ALTO_PALO - 0.45, 0)
  for (const o of [vara, anillos, punta, tela]) o.castShadow = true
  palo.add(vara, anillos, punta, tela)
  g.add(taza, palo)
  g.userData = { tela, palo, base: geoTela.attributes.position.array.slice(), color: null, sacada: 0 }
  escena.add(g)
  return g
})
function moverBanderas(dt) {
  const r = juego.ronda
  const v = r?.viento ?? { ang: 0.6, kmh: 8 }
  const fuerza = clamp(v.kmh / 22, 0.08, 1)
  ;(r?.hoyos ?? HOYOS).forEach((h, i) => {
    const g = banderas[i]
    const q = inversa(h.pin)
    g.position.set(h.pin[0], alturaEn(q), h.pin[1])
    g.visible = armado(h.pin) > 0.7
    const { tela, base, palo } = g.userData
    const colorTela = M.colorBandera?.(h, h.pin) ?? 'roja'
    if (g.userData.color !== colorTela) { g.userData.color = colorTela; tela.material.map = texturaTela(h.n, colorTela); tela.material.needsUpdate = true }
    // flamea para donde sopla: más estirada y más rápido cuanto más viento; sin viento, cae
    const p = tela.geometry.attributes.position
    const tt = est.t * (3 + 9 * fuerza)
    for (let k = 0; k < p.count; k++) {
      const x = base[k * 3], u = x / 1.25
      p.array[k * 3 + 2] = Math.sin(x * 3 - tt + i) * 0.18 * u * (0.3 + fuerza) + Math.sin(x * 6 - tt * 1.7) * 0.04 * u
      p.array[k * 3 + 1] = base[k * 3 + 1] - u * u * 0.55 * (1 - fuerza)
      p.array[k * 3] = x * (0.55 + 0.45 * fuerza)
    }
    p.needsUpdate = true
    tela.geometry.computeVertexNormals()
    palo.rotation.y = -v.ang + Math.sin(est.t * 0.8 + i) * 0.06 * fuerza
    // en el putt del hoyo que se juega, la bandera se saca y queda acostada al lado (hasta que se emboca)
    const sacar = r && i === r.idx && !!juego.enPutt && juego.estado !== 'resultado'
    g.userData.sacada += ((sacar ? 1 : 0) - g.userData.sacada) * Math.min(1, dt * 5)
    const s = g.userData.sacada
    palo.position.set(1.6 * s, 0.06 * s, 0.9 * s)
    palo.rotation.z = -Math.PI / 2 * s
  })
}

// ── la pelota, su estela, las partículas ──
const RADIO_BOLA = 0.26
const bola = new THREE.Mesh(new THREE.SphereGeometry(RADIO_BOLA, 18, 14), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.32, emissive: '#ffffff', emissiveIntensity: 0.12 }))
bola.castShadow = true
escena.add(bola)
const ESTELA = 70
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
    const a = estelaPts.length ? (i / ESTELA) ** 1.6 * 0.85 : 0
    c[i * 4] = 1; c[i * 4 + 1] = 0.96; c[i * 4 + 2] = 0.84; c[i * 4 + 3] = a
  }
  estelaGeo.attributes.position.needsUpdate = true
  estelaGeo.attributes.color.needsUpdate = true
}
const MAXP = 200
const parts = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.16), new THREE.MeshStandardMaterial({ roughness: 0.8 }), MAXP)
parts.frustumCulled = false
escena.add(parts)
const vivas = []
function chispas(pos, n, colores, fuerza = 5, arriba = 6) {
  for (let i = 0; i < n; i++) {
    if (vivas.length >= MAXP) vivas.shift()
    const a = Math.random() * Math.PI * 2, f = fuerza * (0.4 + Math.random() * 0.8)
    vivas.push({ p: [...pos], v: [Math.cos(a) * f, arriba * (0.6 + Math.random() * 0.7), Math.sin(a) * f], vida: 0.8 + Math.random() * 0.8, t: 0, rot: Math.random() * 6, col: col(colores[i % colores.length]), tam: 0.6 + Math.random() * 0.8 })
  }
}
function moverParticulas(dt) {
  for (const v of vivas) {
    v.t += dt
    v.v[1] -= 22 * dt
    v.p[0] += v.v[0] * dt; v.p[1] += v.v[1] * dt; v.p[2] += v.v[2] * dt
    const piso = alturaEn(inversa([v.p[0], v.p[2]])) + 0.08
    if (v.p[1] < piso) { v.p[1] = piso; v.v[0] *= 0.5; v.v[2] *= 0.5; v.v[1] = Math.abs(v.v[1]) * 0.25 }
  }
  for (let i = vivas.length - 1; i >= 0; i--) if (vivas[i].t > vivas[i].vida) vivas.splice(i, 1)
  for (let i = 0; i < MAXP; i++) {
    const v = vivas[i]
    if (!v) { parts.setMatrixAt(i, CERO); continue }
    const k = (1 - (v.t / v.vida) ** 3) * v.tam
    _q.setFromEuler(_e.set(v.rot + v.t * 9, v.t * 7, 0))
    parts.setMatrixAt(i, _m.compose(_p.set(...v.p), _q, _s.set(k, k, k)))
    parts.setColorAt(i, v.col)
  }
  parts.instanceMatrix.needsUpdate = true
  if (parts.instanceColor) parts.instanceColor.needsUpdate = true
}

// ── el golfista: Rorro, con su camisa bordó y la gorra negra ──
const golfista = new THREE.Group()
const brazos = new THREE.Group()
const paloG = new THREE.Group()
{
  const m = (c) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.85 })
  const camisa = m('#6a1d2a'), pantalon = m('#e9e1c8'), piel = m('#d8a57c'), gorra = m('#1a1a1a'), zapato = m('#f4eeda')
  const pierna = new THREE.CylinderGeometry(0.17, 0.15, 1.1, 6).translate(0, 0.55, 0)
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(pierna, pantalon); p.position.set(s * 0.24, 0.05, 0); golfista.add(p)
    const z = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.42), zapato); z.position.set(s * 0.24, 0.07, 0.08); golfista.add(z)
  }
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.3, 1.05, 7).translate(0, 0.52, 0), camisa)
  torso.position.y = 1.1; torso.rotation.x = 0.28
  golfista.add(torso)
  const cabeza = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), piel); cabeza.position.set(0, 2.38, 0.22)
  const visera = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.32, 0.16, 10), gorra); visera.position.set(0, 2.55, 0.22)
  const ala = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.3), gorra); ala.position.set(0, 2.5, 0.5)
  golfista.add(cabeza, visera, ala)
  const planoSwing = new THREE.Group()
  planoSwing.position.set(0, 1.95, 0.25)
  planoSwing.rotation.x = -0.5
  planoSwing.add(brazos)
  const brazo = new THREE.CylinderGeometry(0.1, 0.09, 0.95, 6).translate(0, -0.47, 0)
  for (const s of [-1, 1]) { const b = new THREE.Mesh(brazo, camisa); b.position.x = s * 0.12; b.rotation.z = s * 0.12; brazos.add(b) }
  const vara = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.25, 5).translate(0, -0.62, 0), m('#b9b9b9'))
  const cab = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.38), m('#3a3a3a')); cab.position.set(0, -1.25, 0.12)
  paloG.add(vara, cab); paloG.position.y = -0.9
  brazos.add(paloG)
  golfista.add(planoSwing)
  golfista.traverse((o) => { if (o.isMesh) o.castShadow = true })
  golfista.scale.setScalar(1.05)
  golfista.visible = false
  escena.add(golfista)
}
let swing = null
function poseGolfista() {
  if (!golfista.visible) return
  const putt = !!juego.enPutt
  let a = 0.15
  if (drag && juego.estado === 'apuntar') { const ap = juego.apunte; a = 0.15 - (ap ? (putt ? 0.7 : 2.5) * Math.pow(ap.p, 0.8) : 0) } // con la goma, el backswing
  if (swing) {
    const t = (performance.now() - swing.t0) / 1000, atras = swing.atras
    if (t < 0.14) a = atras + (2.15 * (putt ? 0.35 : 1) - atras) * (t / 0.14) ** 2 // baja y pega
    else a = 2.15 * (putt ? 0.35 : 1) - 0.2 * Math.sin((t - 0.14) * 4)
  }
  brazos.rotation.z = a
}

// ── los monos (los del motor: patrullan, cazan la pelota quieta, se la roban) ──
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
  const cola = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V3(0, 0.8, -0.5), V3(0, 0.6, -1.1), V3(0, 1.2, -1.5), V3(0, 1.7, -1.2), V3(0, 1.6, -0.9)]), 16, 0.07, 5), piel)
  g.add(cuerpo, cabeza, frente, cola)
  g.traverse((o) => { if (o.isMesh) o.castShadow = true })
  g.scale.setScalar(1.1)
  g.visible = false
  escena.add(g)
  return { g, ultimo: null, dir: 0, salto: 0 }
}
const monos3d = Array.from({ length: 8 }, crearMono)
function moverMonos3d(dt) {
  const lista = juego.ronda?.monos ?? []
  monos3d.forEach((m, i) => {
    const s = lista[i]
    if (!s || s.modo === 'aplastado' || juego.estado === 'boot') { m.g.visible = false; return }
    const p = s.pos
    if (m.ultimo) { const v = [p[0] - m.ultimo[0], p[1] - m.ultimo[1]]; if (Math.hypot(...v) > 1e-3) m.dir = Math.atan2(v[0], v[1]) }
    m.ultimo = [...p]
    const espera = s.espera > 0 && s.modo !== 'caza'
    m.g.visible = !espera || s.modo === 'caza' || armado(p) > 0.6
    const dif = Math.atan2(Math.sin(m.dir - m.g.rotation.y), Math.cos(m.dir - m.g.rotation.y))
    m.g.rotation.y += dif * Math.min(1, dt * 8)
    m.salto = Math.max(0, m.salto - dt)
    const corre = s.modo === 'caza' ? 16 : 9
    const tpose = cancha.monoBug === i
    const brinco = m.salto > 0 ? Math.abs(Math.sin(m.salto * 9)) * 1.6 : Math.abs(Math.sin(est.t * corre + i)) * (espera ? 0.03 : 0.2)
    m.g.position.set(p[0], alturaEn(inversa(p)) + brinco + (tpose ? 3 + Math.sin(est.tReal * 2) * 0.4 : 0), p[1])
    if (tpose) m.g.rotation.y += dt * 2
    const paso = espera ? 0 : Math.sin(est.t * corre + i)
    m.g.getObjectByName('pata-1').rotation.x = paso * 0.6
    m.g.getObjectByName('pata1').rotation.x = -paso * 0.6
    m.g.getObjectByName('brazo-1').rotation.set(tpose ? 0 : m.salto > 0 ? -2.6 : paso * 0.5, 0, tpose ? -1.57 : -0.35)
    m.g.getObjectByName('brazo1').rotation.set(tpose ? 0 : m.salto > 0 ? -2.6 : -paso * 0.5, 0, tpose ? 1.57 : 0.35)
  })
}

// ── la caída del green, en el putt: flechitas que corren para donde rueda (como en el juego) ──
const geoFlecha = (() => { const s = new THREE.Shape(); s.moveTo(0.32, 0); s.lineTo(-0.2, 0.22); s.lineTo(-0.08, 0); s.lineTo(-0.2, -0.22); s.closePath(); return new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2) })()
const MAXF = 420
const flechas = new THREE.InstancedMesh(geoFlecha, new THREE.MeshBasicMaterial({ color: '#10361f', transparent: true, opacity: 0.62, depthWrite: false }), MAXF)
flechas.frustumCulled = false
flechas.renderOrder = 4
escena.add(flechas)
let puntosCaida = []
function armarCaida() {
  const h = juego.ronda && M.hoyoActual(juego.ronda)
  puntosCaida = []
  if (!h) return
  for (let y = h.pin[1] - 28; y <= h.pin[1] + 28; y += 1.7) for (let x = h.pin[0] - 28; x <= h.pin[0] + 28; x += 1.7) {
    const p = [x + ((y * 0.37) % 0.85), y]
    if (letraBase(p) !== 'g' || puntosCaida.length >= MAXF) continue
    const v = M.caidaEn(HOYOS[juego.ronda.idx], p)
    puntosCaida.push({ p, v, fase: Math.random() })
  }
  // en las skins claras, flechas oscuras; en las oscuras, claras
  const g = SKINS[cancha.skinB].col[4], l = col(g).getHSL({}).l
  flechas.material.color.set(l > 0.45 ? '#10361f' : '#f4eeda')
}
function moverCaida(dt) {
  const ver = !!juego.enPutt && juego.estado === 'apuntar'
  flechas.visible = ver
  if (!ver) return
  for (let i = 0; i < MAXF; i++) {
    const c = puntosCaida[i]
    if (!c) { flechas.setMatrixAt(i, CERO); continue }
    const fuerza = Math.hypot(c.v[0], c.v[1])
    c.fase = (c.fase + dt * (0.35 + fuerza * 0.9)) % 1
    const u = norm(c.v), w = adelante(c.p)
    const x = w[0] + u[0] * (c.fase - 0.5) * 1.4, z = w[1] + u[1] * (c.fase - 0.5) * 1.4
    const k = Math.sin(c.fase * Math.PI) * (0.55 + Math.min(0.9, fuerza))
    _q.setFromEuler(_e.set(0, -Math.atan2(u[1], u[0]), 0))
    flechas.setMatrixAt(i, _m.compose(_p.set(x, alturaEn(inversa([x, z])) + 0.06, z), _q, _s.set(k, 1, k)))
  }
  flechas.instanceMatrix.needsUpdate = true
}

// ── el clima, en 3D: la luz, el cielo, las nubes, los charcos, la lluvia, los rayos, la nieve, el sol ──
const CLIMA_VIS = {
  soleado: { sol: 3.0, solCol: '#fff1cc', cielo: 1.05, fondo: '#0a2117', exp: 1.1, brillo: true },
  nuboso: { sol: 1.0, solCol: '#e9eef2', cielo: 1.55, fondo: '#18261f', exp: 0.98, nubes: 0.9 },
  seco: { sol: 3.1, solCol: '#ffe0aa', cielo: 1.0, fondo: '#1d1a0d', exp: 1.1, seco: 1, brillo: true },
  mojado: { sol: 1.5, solCol: '#e6eef0', cielo: 1.3, fondo: '#0d1f1a', exp: 1.0, mojado: 0.7, nubes: 0.3 },
  lluvia: { sol: 0.8, solCol: '#cfd9e2', cielo: 1.15, fondo: '#0c1820', exp: 0.95, mojado: 1, nubes: 0.6, oscuro: 0.2, lluvia: 0.55 },
  tormenta: { sol: 0.45, solCol: '#b8c6d6', cielo: 0.95, fondo: '#070d14', exp: 0.92, mojado: 1, nubes: 0.9, oscuro: 0.45, lluvia: 1, rayos: true },
  nieve: { sol: 1.9, solCol: '#eaf3ff', cielo: 1.35, fondo: '#1b2833', exp: 1.02, nieve: 1, copos: true },
}
const climaVis = () => CLIMA_VIS[juego.ronda?.clima?.id] ?? CLIMA_VIS.soleado
function aplicarClima() {
  const c = climaVis()
  sol.intensity = c.sol; sol.color.set(c.solCol)
  cielo.intensity = c.cielo
  escena.background.set(c.fondo); escena.fog.color.set(c.fondo)
  renderer.toneMappingExposure = c.exp
  U.uNubes.value = c.nubes ?? 0; U.uMojado.value = c.mojado ?? 0; U.uSeco.value = c.seco ?? 0; U.uOscuro.value = c.oscuro ?? 0; U.uNieve.value = c.nieve ?? 0
  matTerreno.roughness = 0.93 - 0.4 * (c.mojado ?? 0)
  bola.material.color.set(c.nieve ? '#ff7a1a' : '#ffffff'); bola.material.emissive.set(c.nieve ? '#ff7a1a' : '#ffffff')
  lluvia.visible = !!c.lluvia; copos.visible = !!c.copos
  $('#sol').classList.toggle('ve', !!c.brillo)
  const cl = M.climaDe(juego.ronda)
  $('#clima-txt').textContent = cl ? cl.nombre.replace(/[¡!]/g, '').replace(' en San Diego', '').toUpperCase() : ''
  pintarCharcos()
  document.querySelectorAll('#climas button').forEach((b) => b.classList.toggle('on', b.dataset.clima === juego.ronda?.clima?.id))
}
// la lluvia: rayitas que caen inclinadas con el viento, alrededor de lo que mira la cámara
const NLL = 1600
const lluviaGeo = new THREE.BufferGeometry()
lluviaGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NLL * 6), 3))
const lluvia = new THREE.LineSegments(lluviaGeo, new THREE.LineBasicMaterial({ color: '#cfe0ee', transparent: true, opacity: 0.45, depthWrite: false }))
lluvia.frustumCulled = false; lluvia.visible = false
escena.add(lluvia)
const gotas = Array.from({ length: NLL }, () => [Math.random() * 140 - 70, Math.random() * 60, Math.random() * 140 - 70])
// la nieve: copos que bajan despacito y se mecen
const NCO = 2200
const coposGeo = new THREE.BufferGeometry()
coposGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NCO * 3), 3))
const copos = new THREE.Points(coposGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 0.45, transparent: true, opacity: 0.9, depthWrite: false }))
copos.frustumCulled = false; copos.visible = false
escena.add(copos)
const copoS = Array.from({ length: NCO }, () => [Math.random() * 160 - 80, Math.random() * 50, Math.random() * 160 - 80, Math.random() * 6])
let rayo = null
const rayoLinea = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 9 }, () => V3())), new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0 }))
rayoLinea.frustumCulled = false
escena.add(rayoLinea)
let proxRayo = 6
function moverClima(dt) {
  const c = climaVis(), r = juego.ronda
  const v = r?.viento ?? { ang: 0, kmh: 0 }
  const wx = Math.cos(v.ang) * v.kmh * 0.35, wz = Math.sin(v.ang) * v.kmh * 0.35
  U.uNubeV.value.set(Math.cos(v.ang) * (2 + v.kmh * 0.4), Math.sin(v.ang) * (2 + v.kmh * 0.4))
  const foco = cam.mira
  if (lluvia.visible) {
    const n = Math.floor(NLL * c.lluvia), pa = lluviaGeo.attributes.position.array
    for (let i = 0; i < NLL; i++) {
      const g = gotas[i]
      g[1] -= 42 * dt; g[0] += wx * dt; g[2] += wz * dt
      if (g[1] < 0 || Math.abs(g[0]) > 70 || Math.abs(g[2]) > 70) { g[0] = Math.random() * 140 - 70; g[1] = 40 + Math.random() * 25; g[2] = Math.random() * 140 - 70 }
      const x = foco.x + g[0], y = g[1], z = foco.z + g[2]
      if (i >= n) { pa.fill(0, i * 6, i * 6 + 6); continue }
      pa[i * 6] = x; pa[i * 6 + 1] = y; pa[i * 6 + 2] = z
      pa[i * 6 + 3] = x - wx * 0.035; pa[i * 6 + 4] = y + 1.6; pa[i * 6 + 5] = z - wz * 0.035
    }
    lluviaGeo.attributes.position.needsUpdate = true
  }
  if (copos.visible) {
    const pa = coposGeo.attributes.position.array
    for (let i = 0; i < NCO; i++) {
      const g = copoS[i]
      g[1] -= (2.4 + (i % 5) * 0.3) * dt; g[0] += (wx * 0.25 + Math.sin(est.tReal * 1.3 + g[3]) * 0.6) * dt; g[2] += wz * 0.25 * dt
      if (g[1] < 0) { g[0] = Math.random() * 160 - 80; g[1] = 45 + Math.random() * 10; g[2] = Math.random() * 160 - 80 }
      pa[i * 3] = foco.x + g[0]; pa[i * 3 + 1] = g[1]; pa[i * 3 + 2] = foco.z + g[2]
    }
    coposGeo.attributes.position.needsUpdate = true
  }
  // la tormenta: rayos (el fogonazo, la línea quebrada y el trueno)
  if (c.rayos && juego.estado !== 'boot') {
    proxRayo -= dt
    if (proxRayo <= 0) {
      proxRayo = 5 + Math.random() * 7
      const x = foco.x + (Math.random() - 0.5) * 220, z = foco.z - 120 - Math.random() * 120
      const pts = []; let px = x, pz = z
      for (let i = 0; i < 9; i++) { pts.push(V3(px, 130 - i * 16, pz)); px += (Math.random() - 0.5) * 14; pz += (Math.random() - 0.5) * 6 }
      rayoLinea.geometry.setFromPoints(pts)
      rayo = { t0: est.tReal }
      setTimeout(() => S.trueno?.(), 350 + Math.random() * 600)
    }
  }
  if (rayo) {
    const u = est.tReal - rayo.t0
    const a = u < 0.06 ? 1 : u < 0.12 ? 0.2 : u < 0.2 ? 0.8 : Math.max(0, 0.8 - (u - 0.2) * 3)
    rayoLinea.material.opacity = a
    $('#flash').style.opacity = a * 0.5
    sol.intensity = c.sol + a * 6
    if (u > 0.5) { rayo = null; rayoLinea.material.opacity = 0; $('#flash').style.opacity = 0; sol.intensity = c.sol }
  }
  // el sol: un brillo del lado de donde viene la luz (arriba a la izquierda del dibujo), proyectado en la pantalla
  if (c.brillo) {
    const p = V3(foco.x + SOL_DIR.x * 900, SOL_DIR.y * 900, foco.z + SOL_DIR.z * 900).project(camara)
    const el = $('#sol')
    el.style.setProperty('--sx', `${((p.x + 1) / 2) * 100}%`)
    el.style.setProperty('--sy', `${((1 - p.y) / 2) * 100}%`)
  }
}
// los charcos del hoyo (los del motor: donde la pelota se frena de golpe)
const charcos = []
function pintarCharcos() {
  for (const c of charcos) escena.remove(c)
  charcos.length = 0
  const r = juego.ronda
  for (const q of r?.clima?.charcos?.[r.idx] ?? []) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(q.r, 28).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#a7bfd0', emissive: '#3d5566', emissiveIntensity: 0.35, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.72, polygonOffset: true, polygonOffsetFactor: -2 }))
    m.scale.set(1, 1, 0.75); m.rotation.y = q.ang ?? 0
    m.userData.p = q.pos
    m.receiveShadow = true
    escena.add(m); charcos.push(m)
  }
}
function moverCharcos() { for (const m of charcos) { const p = m.userData.p; m.position.set(p[0], alturaEn(inversa(p)) + 0.04, p[1]) } }

// ── la cámara: un riel suave (y los sobrevuelos) ──
const cam = { pos: V3(W / 2 + 30, 46, H + 72), mira: V3(W / 2, 0, H - 30), obj: null, ruta: null, orbita: 0, k: 3 }
function seguir(pose, k = 3.2) { cam.obj = pose; cam.k = k }
function sobrevolar(puntos, dur = 3.2, alFinal = null) { cam.ruta = { puntos, t0: est.tReal, dur, alFinal } }
function moverCamara(dt) {
  if (cam.ruta) {
    const r = cam.ruta, u = clamp((est.tReal - r.t0) / r.dur, 0, 1), e = easeIO(u)
    cam.pos.copy(new THREE.CatmullRomCurve3(r.puntos.map((p) => p.pos), false, 'centripetal').getPoint(e))
    cam.mira.copy(new THREE.CatmullRomCurve3(r.puntos.map((p) => p.mira), false, 'centripetal').getPoint(e))
    if (u >= 1) { cam.ruta = null; cam.obj = r.puntos[r.puntos.length - 1]; r.alFinal?.() }
  } else if (cam.obj) {
    const a = 1 - Math.exp(-dt * cam.k)
    cam.pos.lerp(cam.obj.pos, a); cam.mira.lerp(cam.obj.mira, a)
  }
  camara.position.copy(cam.pos)
  if (cam.orbita) {
    const c = cam.mira, d = cam.pos.clone().sub(c), ang = cam.orbita
    camara.position.set(c.x + d.x * Math.cos(ang) - d.z * Math.sin(ang), cam.pos.y, c.z + d.x * Math.sin(ang) + d.z * Math.cos(ang))
  }
  camara.lookAt(cam.mira)
  const r = clamp(camara.position.distanceTo(cam.mira) * 0.75, 40, 300)
  sombraEn(cam.mira.x, cam.mira.z, Math.round(r / 10) * 10)
}
// la pelota; mientras pasa la onda del deploy, va pegada a su punto de la cancha (de donde quedó a donde queda quieta)
const mundoBola = () => {
  if (juego.bolaBase) { const p = adelante(juego.bolaBase); return V3(p[0], alturaEn(juego.bolaBase) + RADIO_BOLA, p[1]) }
  const p = juego.ronda?.pelota ?? [W / 2, H - 50]
  return V3(p[0], alturaEn(inversa(p)) + RADIO_BOLA, p[1])
}
/**
 * Atrás de la pelota mirando a `hacia`, como la tele: la altura sale de la cuenta para que la pelota quede abajo (en
 * `bola`, sobre los botones) y `hacia` más arriba (en `mira`, debajo de la tarjeta). Así se ve dónde pica.
 */
function encuadre(B, hacia, L, { bola, mira, atras }) {
  const d = norm([hacia[0] - B.x, hacia[1] - B.z])
  const tanH = Math.tan(((camara.fov / 2) * Math.PI) / 180)
  const aBola = Math.atan(-bola * tanH), aMira = Math.atan(mira * tanH)
  // la diferencia de ángulos (de la cámara a la pelota y a `hacia`) tiene que ser aBola + aMira: la altura, por bisección
  const dif = (h) => Math.atan(h / atras) - Math.atan(h / (atras + L))
  let lo = 1, hi = Math.sqrt(atras * (atras + L))
  if (dif(hi) > aBola + aMira) for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; dif(m) < aBola + aMira ? (lo = m) : (hi = m) }
  const alto = (lo + hi) / 2
  const cabeceo = Math.atan(alto / atras) - aBola // cuánto mira para abajo
  const pos = V3(B.x - d[0] * atras, B.y + alto, B.z - d[1] * atras)
  return { pos, mira: V3(pos.x + d[0] * Math.cos(cabeceo) * 60, pos.y - Math.sin(cabeceo) * 60, pos.z + d[1] * Math.cos(cabeceo) * 60) }
}
/** Apuntando un tiro: la pelota abajo y a dónde va (o el hoyo) arriba. */
function poseApuntar(B, hacia, largo = null) {
  const L = clamp(largo ?? dist([B.x, B.z], hacia), 25, 330)
  return encuadre(B, hacia, L, { bola: -0.55, mira: 0.58, atras: 11 + L * 0.06 })
}
/** El putt: más cerca y más de arriba, para leer la caída; el hoyo por la mitad de la pantalla. */
function posePutt(B, pin) {
  const L = Math.max(1, dist([B.x, B.z], pin))
  return encuadre(B, pin, L, { bola: -0.45, mira: 0.3, atras: 4.5 + Math.min(L, 30) * 0.28 })
}
function poseCancha() { return { pos: V3(W / 2, 470, H / 2 + 330), mira: V3(W / 2, 0, H / 2 + 10) } }
function poseJuego() {
  const r = juego.ronda, B = mundoBola(), pin = M.hoyoActual(r).pin
  return juego.enPutt ? posePutt(B, pin) : poseApuntar(B, pin)
}

// ── el juego ──
const juego = {
  estado: 'boot', ronda: null, campo: campoBase, tiro: null, acc: 0, apunte: null, enPutt: false,
  ver: [1, 0], historial: [], poder: { revert: 1, bp: 1 }, versiones: 0, bugs: 0, reverts: 0,
  pro: (() => { try { return JSON.parse(localStorage.getItem('sdga-trampa-v1'))?.pro === true } catch { return false } })(),
}
const hoyo = () => M.hoyoActual(juego.ronda)
const verTxt = () => `v${juego.ver[0]}.${juego.ver[1]}`
let drag = null, destello = null, marcas = []
function pintarHud() {
  const r = juego.ronda
  if (r && !r.terminada) {
    const h = hoyo()
    $('#h-tit').textContent = `HOYO ${h.n}`
    $('#h-par').textContent = `PAR ${h.par}`
    $('#h-yd').textContent = `${Math.round(M.aYardas(r, dist(r.pelota, h.pin)))} YD`
    $('#golpes').textContent = r.golpes
  }
  $('#ver-n').textContent = verTxt()
  $('#revert-n').textContent = juego.poder.revert
  $('#revert').disabled = !(juego.estado === 'apuntar' && juego.poder.revert > 0 && juego.historial.length > 0)
  const bp = $('#bp'), vuela = juego.estado === 'tiro' && juego.tiro?.fase === 'vuelo' && juego.poder.bp > 0
  bp.disabled = !vuela && juego.estado !== 'pausa'
  bp.classList.toggle('vivo', vuela)
  bp.innerHTML = juego.estado === 'pausa' ? '▶ continuar' : `⏸ debug <span class="n">${juego.poder.bp}</span>`
  document.querySelectorAll('[data-hoyo]').forEach((b) => b.classList.toggle('on', +b.dataset.hoyo === r?.idx))
  $('#modo').classList.toggle('on', juego.pro)
  $('#ayuda').innerHTML = juego.estado === 'apuntar' ? (juego.enPutt ? 'PUTT<br><small>arrastrá para atrás: dirección y fuerza</small>' : `ARRASTRÁ PARA ATRÁS<br><small>${juego.pro ? 'MODO PRO · sin línea ni pique' : 'y soltá en el aro dorado'}</small>`) : ''
}
function pintarViento() {
  const r = juego.ronda
  if (!r) return
  const B = mundoBola(), v = r.viento
  const a = V3(B.x, B.y, B.z).project(camara), b = V3(B.x + Math.cos(v.ang) * 20, B.y, B.z + Math.sin(v.ang) * 20).project(camara)
  const ang = Math.atan2(-(b.y - a.y), b.x - a.x) // en pantalla
  $('#viento-flecha').style.transform = `rotate(${ang + Math.PI / 2}rad)`
  $('#viento-kmh').textContent = Math.round(v.kmh)
}
// LG relata (el del juego, y lo de Rorro siempre a costa de Rorro)
const LG = {
  bueno: ['Bueno, por lo menos el juego lo hizo bien.', 'Aprobado. Que no se acostumbre.', 'Mirá vos, el diseñador sabe pegarle.', 'LGTM. Ni lo toquen.'],
  malo: ['El cliente siempre tiene razón.', 'Hizo la cancha y no la conoce.', 'Eso no estaba en el Figma.', 'Otra reunión más por ese tiro.'],
  bugs: ['¿Eso es un bug o es así?', 'Funciona en mi máquina, dice.', 'QA, ¿dónde estabas?', 'Mandalo a producción igual.'],
  bp: ['Eso es trampa… pero la del mono.', 'Pausó el juego. En la vida real no se puede, Rorro.'],
  revert: ['Ctrl+Z en la vida real, por favor.', 'Revirtió. El cliente no se enteró.'],
  inicio: ['Bienvenidos a la cancha de Rorro. Todavía está en beta.', 'Ojo que se mueve. Es un feature.'],
}
let lgT = null
function decir(texto) {
  if (!texto) return
  $('#lg-txt').textContent = texto
  $('#lg').classList.add('ve')
  clearTimeout(lgT); lgT = setTimeout(() => $('#lg').classList.remove('ve'), 4800)
}
const decirDe = (tipo) => decir(elegir(LG[tipo]))
function veredicto(txt, tipo) {
  const v = $('#veredicto')
  v.textContent = txt; v.className = tipo; void v.offsetWidth; v.classList.add('ve')
  clearTimeout(veredicto.t); veredicto.t = setTimeout(() => v.classList.remove('ve'), 1400)
}
const hash = () => Math.random().toString(16).slice(2, 9)
function mostrarCommit({ tipo, titulo, lineas, desde = verTxt(), hacia = '' }) {
  const c = $('#commit')
  c.innerHTML = `<div class="c1">● commit <b>${hash()}</b> · ${desde} → <b>${hacia}</b></div><div class="c2 ${tipo}">${titulo}</div>` +
    lineas.map(([cl, t], i) => `<div class="linea ${cl}" style="animation-delay:${0.15 + i * 0.14}s">${cl === 'mas' ? '+ ' : cl === 'menos' ? '− ' : cl === 'err' ? '✗ ' : '# '}${t}</div>`).join('')
  c.classList.add('ve')
  lineas.forEach((_, i) => setTimeout(() => { C.tecla(); C.datos(3, { vol: 0.045 }) }, 150 + i * 140))
  clearTimeout(mostrarCommit.t); mostrarCommit.t = setTimeout(() => c.classList.remove('ve'), 4200)
}
let bandaT = null
function banda({ kicker, grande, banda: b, verso }, ms, luego) {
  $('#b-kicker').textContent = kicker; $('#b-grande').textContent = grande; $('#b-banda').textContent = b; $('#b-verso').textContent = verso ?? ''
  $('#banda').classList.add('ve')
  clearTimeout(bandaT); bandaT = setTimeout(() => { $('#banda').classList.remove('ve'); luego?.() }, ms)
}
function marcar(txt, pos, tono = 'oro') { marcas.push({ txt, pos: [...pos], t0: performance.now(), tono }) }

// ── las versiones: qué le hace a la cancha cada tiro ──
let idBump = 1
const nuevoBump = (cx, cy, r, tipo, vx, vy, amp = 1) => ({ id: idBump++, cx, cy, r, tipo, vx, vy, desde: 0, hasta: amp })
/** Una onda que cruza toda la cancha: largo de onda λ (yardas) y amplitud (yardas), con la dirección al azar. */
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
  green(B, P) { return dist(B, P) < 25 ? null : { cita: 'El green, ¿no lo podemos achicar un toque?', bumps: [nuevoBump(P[0], P[1], 14, 1, -3, 0)] } },
}
const CONSOLA = ["TypeError: Cannot read properties of undefined (reading 'green')", 'Warning: Each tree in a list should have a unique "key" prop.', 'Uncaught RangeError: Maximum call stack size exceeded (monos.js:42)', 'NaN yardas al pin', "ReferenceError: bunker is not defined", '404: textura_pasto_final_FINAL_v2.png']
const NOMBRE_ARBOL = { redondo: 'redondos', pino: 'pinos', cubo: 'cubos', chupetin: 'chupetines', cristal: 'cristales', cactus: 'cactus' }
/** Los bugs de una versión mala: en el piso (adelante, cerca de la línea), en los árboles y algún mono. */
function sortearBugs(B, P) {
  const u = norm([P[0] - B[0], P[1] - B[1]]), n = [-u[1], u[0]], L = dist(B, P)
  const bugs = []
  const cuantos = 1 + Math.floor(Math.random() * 3)
  const tipos = ['textura', 'zfight', 'wire', 'nan', 'flota', 'estirado', 'reves', 'mono'].sort(() => Math.random() - 0.5)
  for (const t of tipos.slice(0, cuantos)) {
    const c = [B[0] + u[0] * L * (0.3 + Math.random() * 0.5) + n[0] * (Math.random() - 0.5) * 40, B[1] + u[1] * L * (0.3 + Math.random() * 0.5) + n[1] * (Math.random() - 0.5) * 40]
    if (['textura', 'zfight', 'wire', 'nan'].includes(t)) {
      if (dist(c, P) < 16 || dist(c, B) < 12) continue
      bugs.push({ tipo: t, c, r: 5 + Math.random() * 6, suelo: { textura: 0, zfight: 1, wire: 2, nan: 3 }[t], nombre: { textura: 'textura faltante', zfight: 'z-fighting', wire: 'se ve el wireframe', nan: 'colores NaN' }[t] })
    } else if (t === 'mono') bugs.push({ tipo: 'mono', nombre: 'mono en pose T' })
    else {
      const ids = arboles.map((a, i) => [i, dist(a.q, c)]).filter(([, d]) => d < 14).map(([i]) => i).slice(0, 7)
      if (ids.length) bugs.push({ tipo: t, ids, nombre: { flota: 'árboles flotando', estirado: 'árboles estirados', reves: 'árboles al revés' }[t] })
    }
  }
  return bugs
}
const mapaBugsArbol = (bugs) => { const m = new Map(); for (const b of bugs) if (b.ids) for (const i of b.ids) m.set(i, b.tipo); return m }
function elegirSkin(limpio) {
  const ops = Object.keys(SKINS).filter((k) => SKINS[k].limpio === limpio && k !== cancha.skinB)
  return elegir(ops)
}
/**
 * Arma la versión que sigue. `bueno`: aprobada (se abre la calle, se arreglan los bugs, se revierte un cambio del
 * cliente, skin prolija); si no, cambios del cliente (todo se mueve: ondas grandes y dos pedidos; skin rara y bugs).
 * En el green (el próximo es un putt) no se mueve nada: cambia la skin y nada más.
 */
function armarVersion(bueno, B, P, enGreen) {
  const nuevos = [], quitar = [], lineas = []
  const viejasOndas = est.bumps.filter((b) => b.tipo === 2 && b.hasta).map((b) => b.id)
  if (!enGreen) {
    quitar.push(...viejasOndas)
    if (bueno) {
      const u = norm([P[0] - B[0], P[1] - B[1]]), n = [-u[1], u[0]], L = dist(B, P)
      for (const t of [0.22, 0.42, 0.62, 0.82]) {
        if (t * L < 14) continue
        for (const s of [-1, 1]) nuevos.push(nuevoBump(B[0] + u[0] * t * L + n[0] * s * 9, B[1] + u[1] * t * L + n[1] * s * 9, 13, 0, n[0] * s * 5.5, n[1] * s * 5.5))
      }
      nuevos.push(onda(170 + Math.random() * 60, 3.5))
      lineas.push(['mas', 'se abre la calle'])
      const ultimo = [...juego.historial].reverse().find((v) => v.tipo === 'mal' && !v.revertido)
      if (ultimo) { quitar.push(...ultimo.agregados.filter((id) => !viejasOndas.includes(id))); ultimo.revertido = true; lineas.push(['menos', `revert: "${ultimo.citas?.[0] ?? 'cambio del cliente'}"`]) }
    } else {
      // todo se mueve: dos o tres ondas grandes que cruzan la cancha, más dos pedidos del cliente
      const k = 2 + Math.floor(Math.random() * 2)
      for (let i = 0; i < k; i++) { const l = 120 + Math.random() * 110; nuevos.push(onda(l, Math.min(10, l * 0.055))) }
      const pedidos = Object.keys(CLIENTE).sort(() => Math.random() - 0.5)
      const citas = []
      for (const t of pedidos) { const c = CLIENTE[t](B, P); if (c) { nuevos.push(...c.bumps); citas.push(c.cita) } if (citas.length === 2) break }
      for (const c of citas) lineas.push(['mas', `"${c}"`])
      lineas.citas = citas
    }
  }
  const skin = elegirSkin(bueno)
  lineas.push(['mas', `skin: ${SKINS[skin].nombre} · árboles: ${NOMBRE_ARBOL[SKINS[skin].arbol]}`])
  let bugs = []
  if (bueno) { for (const b of cancha.bugsB) lineas.push(['menos', `fix: ${b.nombre}`]) }
  else {
    bugs = sortearBugs(B, P)
    for (const b of bugs) lineas.push(['err', b.nombre])
    if (bugs.length) lineas.push(['err', elegir(CONSOLA)])
  }
  return { tipo: bueno ? 'ok' : 'mal', nuevos, quitar, skin, bugs, lineas, citas: lineas.citas ?? [] }
}
/** Despliega una versión: la onda sale de la pelota y, a su paso, todo queda en la versión nueva (la física también, al final). */
function desplegar({ nuevos = [], quitar = [], skin, bugs, bolaVieja, bolaNueva, rebobina = false, alFinal }) {
  for (const b of est.bumps) b.desde = b.hasta
  for (const id of quitar) { const b = est.bumps.find((x) => x.id === id); if (b) b.hasta = 0 }
  est.bumps.push(...nuevos)
  while (est.bumps.filter((b) => b.hasta > 0).length > NB - 2) est.bumps.find((b) => b.hasta > 0).hasta = 0
  est.bumps = est.bumps.slice(-NB)
  est.bola0 = [...(bolaVieja ?? bolaNueva)]
  est.bola1 = [...bolaNueva]
  ponerSkins(cancha.skinB, skin ?? cancha.skinB)
  cancha.bugsA = cancha.bugsB; cancha.bugsB = bugs ?? cancha.bugsB
  cancha.arbolBugA = cancha.arbolBugB; cancha.arbolBugB = mapaBugsArbol(cancha.bugsB)
  const o = bolaNueva
  const lejos = Math.max(...[[0, 0], [W, 0], [0, H], [W, H]].map((c) => dist(c, o))) + est.swBanda + 4
  est.swO = [...o]; est.swSentido = rebobina ? -1 : 1; est.rebobina = rebobina ? 1 : 0; est.swVivo = 1
  const desdeA = rebobina ? lejos : -est.swBanda - 2, a1 = rebobina ? -est.swBanda - 2 : lejos, dur = 3.4
  est.swW = desdeA
  document.body.classList.toggle('rebobina', rebobina)
  const sonido = rebobina ? C.revert(dur) : C.deploy(dur)
  // la grilla del motor de la versión nueva, de a pedazos mientras pasa la onda
  const horno = hornear()
  let filas = null
  const t0 = est.tReal
  juego.barrido = () => {
    if (!filas) { const r = horno.next(); if (r.done) filas = r.value }
    const u = clamp((est.tReal - t0) / dur, 0, 1)
    est.swW = lerp(desdeA, a1, rebobina ? easeIO(u) : u ** 1.35)
    sonido?.avance(u)
    if (u >= 1) {
      while (!filas) { const r = horno.next(); if (r.done) filas = r.value }
      juego.barrido = null
      sonido?.fin()
      for (const b of est.bumps) b.desde = b.hasta
      est.bumps = est.bumps.filter((b) => b.hasta > 0.001)
      est.bola0 = [...est.bola1]
      est.swW = 1e5; est.swSentido = 1; est.swVivo = 0; est.rebobina = 0
      ponerSkins(cancha.skinB, cancha.skinB)
      cancha.bugsA = cancha.bugsB; cancha.arbolBugA = cancha.arbolBugB
      cancha.monoBug = cancha.bugsB.some((b) => b.tipo === 'mono') ? Math.floor(Math.random() * Math.max(1, juego.ronda?.monos.length ?? 1)) : null
      document.body.classList.remove('rebobina')
      juego.campo = campoCon(filas)
      if (cancha.bugsB.length && !rebobina) { document.body.classList.add('glitch'); setTimeout(() => document.body.classList.remove('glitch'), 750) }
      alFinal?.()
    }
  }
}
/** Después de cada tiro (la pelota quieta): la versión que sigue, según cómo quedó. */
function nuevaVersion(bueno) {
  const r = juego.ronda
  const P = hoyo().pin
  const enGreen = r.lie === 'green'
  const anclaVieja = [...est.bola1]
  const ancla = inversa(r.pelota, true) // el punto de la cancha donde quedó: ahí queda quieta
  const v = armarVersion(bueno, ancla, P, enGreen)
  const desde = verTxt(), hacia = `v${juego.ver[0]}.${juego.ver[1] + 1}`
  mostrarCommit({ tipo: v.tipo, titulo: bueno ? '✓ Aprobado · LGTM' : '✗ Cambios del cliente', lineas: v.lineas, desde, hacia })
  bueno ? C.aprobado() : C.cliente()
  const registro = { tipo: v.tipo, citas: v.citas, agregados: v.nuevos.map((b) => b.id), quitados: v.quitar.map((id) => ({ id, b: est.bumps.find((b) => b.id === id), amp: est.bumps.find((b) => b.id === id)?.hasta ?? 1 })), skin: cancha.skinB, bugs: cancha.bugsB }
  juego.estado = 'deploy'
  juego.bolaBase = ancla
  golfista.visible = false
  pintarHud()
  // la cámara se abre para ver la onda
  const q = ancla, L = dist(q, P), dd = norm([P[0] - q[0], P[1] - q[1]]), mid = [lerp(q[0], P[0], 0.45), lerp(q[1], P[1], 0.45)]
  if (!enGreen) seguir({ pos: V3(mid[0] - dd[0] * (60 + L * 0.5), 70 + L * 0.55, mid[1] - dd[1] * (60 + L * 0.5)), mira: V3(mid[0], 0, mid[1]) }, 2)
  desplegar({
    nuevos: v.nuevos, quitar: v.quitar, skin: v.skin, bugs: v.bugs, bolaVieja: anclaVieja, bolaNueva: ancla,
    alFinal: () => {
      juego.historial.push(registro)
      juego.ver = [juego.ver[0], juego.ver[1] + 1]
      juego.versiones++
      juego.bugs += v.bugs.length
      saltaVersion()
      r.pelota = [...ancla]
      juego.bolaBase = null
      if (v.bugs.length) decirDe('bugs')
      aApuntar()
    },
  })
}
function saltaVersion() { const v = $('#ver'); v.classList.remove('salta'); void v.offsetWidth; v.classList.add('salta'); C.version() }

// ── apuntar y pegar (como el juego: la goma para atrás, el latido y su sweet spot) ──
const ATRASO_PANTALLA = 20
function largoMax() { return Math.max(140, Math.min(260, Math.min(innerWidth, innerHeight) * 0.42)) }
/** El tiro que se está armando (lo mismo que `apunte` del juego, con el arrastre pasado a la cancha por la cámara de cuando empezó). */
function apunte() {
  if (!drag) return null
  const r = juego.ronda
  let px = drag.x0 - drag.x, py = drag.y0 - drag.y
  const len = Math.hypot(px, py)
  if (len < 8) return null
  const putt = M.enModoPutt(juego.campo, r)
  const u = len / drag.largo
  // la pantalla a la cancha: derecha y adelante de la cámara (al empezar a tirar)
  const wx = drag.der[0] * px + drag.ade[0] * -py, wy = drag.der[1] * px + drag.ade[1] * -py
  const ang = Math.atan2(wy, wx)
  const p = Math.min(1, Math.pow(u, putt ? 1.6 : 1.35))
  const tiempo = (performance.now() - drag.t0) / 1000
  const plan = M.planTiro(juego.campo, r, ang, p, 0, tiempo)
  const arbol = putt ? null : M.pinoEnLaSalida(juego.campo, r.pelota, plan)
  const latido = !putt
  const ventana = latido ? M.ventanaPerfecto(M.aYardas(r, dist(r.pelota, hoyo().pin))) : 0
  const soltada = latido ? M.soltadaLatido(drag.fase ?? 0, ventana) : null
  return { ang, p, putt, plan, arbol, alcance: plan.carry, disp: plan.disp, destino: plan.destino, fondo: !putt && p >= 0.97, latido, ventana, soltada, sweet: soltada?.nivel === 'perfecto', tiempo }
}
function pegar(a) {
  juego.estado = 'swing'
  swing = { t0: performance.now() + 60, atras: brazos.rotation.z }
  pintarHud()
  setTimeout(() => { if (juego.estado === 'swing') pegarYa(a) }, 200)
}
function pegarYa(a) {
  const r = juego.ronda
  swing = { t0: performance.now(), atras: brazos.rotation.z }
  const t = M.golpear(juego.campo, r, a.ang, a.p, rng, 0, a.tiempo, null, a.soltada ?? null)
  juego.tiro = t
  juego.acc = 0
  S.golpe(a.p, a.putt)
  const desde = r.desde ?? r.pelota
  if (t.perfecto && !a.putt) { marcar('PERFECTO', desde); S.perfecto() }
  else if (a.soltada) marcar(`${a.soltada.nivel === 'bueno' ? 'BUENO · ' : ''}${a.soltada.lado < 0 ? 'TEMPRANO' : 'TARDE'}`, desde, a.soltada.nivel === 'bueno' ? 'bueno' : 'pifia')
  const B = mundoBola()
  chispas([B.x, B.y, B.z], a.putt ? 0 : 10, ['#6f9636', '#a2bc43', '#5d432c'], 4, 5)
  estelaPts = []
  juego.estado = 'tiro'
  pintarHud()
}
function sonarEventos(t) {
  t._oidos ??= 0
  for (; t._oidos < t.eventos.length; t._oidos++) {
    const e = t.eventos[t._oidos]
    if (e.tipo === 'pique') {
      S.pique(e.terreno, (t.carry || 100) / 200)
      const p = [t.pos[0], alturaEn(inversa(t.pos)) + 0.1, t.pos[1]], id = juego.ronda.clima?.id
      if (e.terreno === 'bunker') chispas(p, 24, ['#f4e6c4', '#e9d7a9'], 6, 8)
      else if (id === 'nieve' && e.terreno !== 'green') { S.nieve?.(); chispas(p, 22, ['#ffffff', '#e8f0f8'], 5, 7) }
      else if (id === 'seco' && e.terreno !== 'green') chispas(p, 16, ['#c9a46a', '#b08850'], 4, 4)
      else if (['lluvia', 'tormenta', 'mojado'].includes(id) && e.terreno !== 'green') chispas(p, 14, ['#bcd6e8', '#9fc0d8'], 4, 5)
      else if (e.terreno !== 'green') chispas(p, 10, ['#6f9636', '#3e6b1f', '#5d432c'], 3, 4)
    } else if (e.tipo === 'palo') S.palo()
    else if (e.tipo === 'labio') S.labio()
    else if (e.tipo === 'vuelta') S.vuelta()
    else if (e.tipo === 'robo') S.robo()
    else if (e.tipo === 'charco') S.charco?.()
    else if (e.tipo === 'resbalon') S.resbalon?.()
    else if (e.tipo === 'backspin') { S.backspin(); marcar('BACKSPIN', t.pos) }
    else if (e.tipo === 'borde') { S.labio(); marcar('¡COLGANDO!', t.pos, 'bueno') }
    else if (e.tipo === 'bandera') { S.bandera(); marcar('¡AL PALO!', hoyo().pin) }
  }
}
function moverTiro(dt) {
  const t = juego.tiro
  if (!t || juego.estado !== 'tiro') return
  const pin = hoyo().pin
  juego.acc += dt
  while (juego.acc >= PASO && t.fase !== 'quieta') { M.avanzar(juego.campo, t, PASO, pin); juego.acc -= PASO }
  sonarEventos(t)
  S.rodar(t.fase === 'rodando' && !t.vuelta ? Math.hypot(t.v[0], t.v[1]) : 0)
  const piso = alturaEn(inversa(t.pos)) + RADIO_BOLA
  bola.position.set(t.pos[0], piso + (t.alt ?? 0), t.pos[1])
  if (t.modo === 'full' && t.fase === 'vuelo') estelaPts.push([bola.position.x, bola.position.y, bola.position.z])
  // la cámara: en el aire, atrás de la pelota; rodando, la acompaña; en el putt, bajita
  const d = t.modo === 'full' ? norm([t.desde[0] + t.carryVec[0] - t.desde[0], t.desde[1] + t.carryVec[1] - t.desde[1]]) : norm(t.v[0] || t.v[1] ? t.v : [pin[0] - t.pos[0], pin[1] - t.pos[1]])
  if (t.modo === 'full') seguir({ pos: V3(t.pos[0] - d[0] * 30, piso + (t.alt ?? 0) * 0.55 + 18, t.pos[1] - d[1] * 30), mira: V3(t.pos[0] + d[0] * 14, piso + (t.alt ?? 0) * 0.35, t.pos[1] + d[1] * 14) }, 3.4)
  else seguir(posePutt(bola.position, pin), 2.6)
  if (t.fase === 'quieta') { S.rodar(0); alReposo() }
}
function alReposo() {
  const r = juego.ronda, t = juego.tiro
  const h = hoyo()
  const desde = [...r.desde], lieDesde = r.lieDesde
  const res = M.resolverReposo(juego.campo, r, t, rng)
  juego.tiro = null
  if (res.tipo === 'embocada') return embocar(t)
  const dicho = M.comentar?.(rng, res, t, h, r.jugador, { desde, lieDesde }) ?? {}
  if (res.tipo === 'afuera') { veredicto('AFUERA · +1', 'mal'); S.multa?.() }
  else if (res.tipo === 'mono-ladron') { veredicto('¡SE LA ROBÓ UN MONO!', 'mal') }
  else if (res.tipo === 'mono-malo') { veredicto('EL MONO MALO · +1', 'mal'); S.robo() }
  else if (res.tipo === 'mono-bueno') { veredicto('¡EL MONO BUENO!', 'ok'); S.monoBueno?.() }
  else if (res.tipo === 'ajena') veredicto(`¡EN EL HOYO ${res.n}!`, 'ok')
  else veredicto(({ fairway: 'FAIRWAY ✓', green: 'GREEN ✓', tee: 'TEE', rough: 'ROUGH ✗', bunker: 'BUNKER ✗', bosque: 'BOSQUE ✗' })[r.lie] ?? r.lie.toUpperCase(), ['fairway', 'green'].includes(r.lie) ? 'ok' : 'mal')
  decir(dicho.lg ?? null)
  M.climaTrasTiro(juego.campo, r, rng)
  for (const m of monos3d) if (m.g.visible && Math.hypot(m.g.position.x - r.pelota[0], m.g.position.z - r.pelota[1]) < 16) m.salto = 1.2
  if (M.necesitaLP(r)) return levantar()
  const bueno = ['fairway', 'green'].includes(r.lie) && ['sigue', undefined, 'normal'].includes(res.tipo) || (res.tipo === 'mono-bueno')
  setTimeout(() => nuevaVersion(bueno && !['afuera', 'mono-ladron', 'mono-malo'].includes(res.tipo)), 650)
}
function aApuntar() {
  const r = juego.ronda
  juego.estado = 'apuntar'
  juego.enPutt = M.enModoPutt(juego.campo, r)
  swing = null
  ubicarGolfista()
  if (juego.enPutt) armarCaida()
  seguir(poseJuego(), 2.4)
  S.viento(r.viento.kmh) // el aire, como en el juego
  pintarHud()
}
function ubicarGolfista(ang = null) {
  const r = juego.ronda
  const B = mundoBola(), pin = hoyo().pin
  const a = ang ?? Math.atan2(pin[1] - B.z, pin[0] - B.x)
  const n = [-Math.sin(a), Math.cos(a)]
  golfista.visible = true
  const lejos = juego.enPutt ? 1.25 : 1.55
  const gp = [r.pelota[0] - n[0] * lejos, r.pelota[1] - n[1] * lejos]
  golfista.position.set(gp[0], alturaEn(inversa(gp)), gp[1])
  golfista.rotation.y = Math.atan2(n[0], n[1])
  paloG.scale.y = juego.enPutt ? 0.72 : 1
}
function embocar(t) {
  const r = juego.ronda
  S.embocada()
  const p = V3(...[hoyo().pin[0], alturaEn(inversa(hoyo().pin)) + 0.3, hoyo().pin[1]])
  chispas([p.x, p.y, p.z], 90, ['#e8c34a', '#f4eeda', '#c8352e', '#2f5fd0'], 7, 13)
  bola.visible = false
  juego.estado = 'resultado'
  const fila = M.cerrarHoyo(r, rng)
  const nombre = M.nombreResultado(fila.golpes, fila.par, false)
  S.resultado(nombre)
  mostrarCommit({ tipo: 'ok', titulo: `🚀 ${verTxt()} en producción`, lineas: [['mas', `hoyo ${fila.n}: ${fila.golpes} golpes (${nombre.toLowerCase()})`], ['com', 'merge a main']], hacia: 'main' })
  const { vsPar } = M.totales(r.tarjeta)
  banda({ kicker: `Hoyo ${fila.n} · ${fila.golpes} golpes · ${verTxt()}`, grande: nombre, banda: `VAS ${M.formatoPar(vsPar)}`, verso: M.fraseResultado?.(rng, nombre, r.jugador) ?? '' }, 2800, () => {
    if (r.terminada) tarjetaFinal()
    else empezarHoyo()
  })
  pintarHud()
}
function levantar() {
  const r = juego.ronda
  juego.estado = 'resultado'
  const n = M.levantar(r)
  S.lamento?.()
  banda({ kicker: `Levantaste en el ${n}`, grande: 'LP 💅', banda: 'VUELTA PERDIDA', verso: 'Ni el cliente la quiere ver.' }, 2600, tarjetaFinal)
}
function tarjetaFinal() {
  const r = juego.ronda
  const { golpes, vsPar, lp } = M.totales(r.tarjeta)
  $('#fin-total').textContent = lp ? 'LP 💅' : `${golpes} · ${M.formatoPar(vsPar)}`
  $('#fin-hoyos').innerHTML = r.tarjeta.map((f) => `<div>HOYO ${f.n} · PAR ${f.par}<i>${f.lp ? 'LP' : f.golpes}</i></div>`).join('')
  $('#fin-dev').textContent = `${juego.versiones} versiones · ${juego.bugs} bugs · ${juego.reverts} reverts`
  $('#fin').hidden = false
  S.viento(0); S.lluvia(0)
  S.musica?.('final')
}
/** Un hoyo nuevo: la cancha vuelve a la v1.0 (una rama nueva, la skin clásica) y el sobrevuelo de TV del green al tee. */
function empezarHoyo() {
  const r = juego.ronda
  const h = hoyo()
  juego.ver = [1, 0]; juego.historial = []; juego.poder = { revert: 1, bp: 1 }; juego.bolaBase = null
  est.bumps = []
  const tee = r.pelota
  est.bola0 = [...tee]; est.bola1 = [...tee]
  ponerSkins('clasico', 'clasico')
  cancha.bugsA = cancha.bugsB = []; cancha.arbolBugA = new Map(); cancha.arbolBugB = new Map(); cancha.monoBug = null
  juego.campo = campoBase
  bola.visible = true
  golfista.visible = false
  juego.enPutt = false
  juego.estado = 'sobrevuelo'
  aplicarClima()
  pintarHud()
  const fin = poseApuntar(mundoBola(), h.pin)
  const P = h.pin, d = norm([P[0] - tee[0], P[1] - tee[1]]), mid = [lerp(tee[0], P[0], 0.5), lerp(tee[1], P[1], 0.5)]
  C.pasada(4.2)
  const cl = M.climaDe(r)
  banda({ kicker: `La cancha de Rorro · ${cl ? cl.nombre.replace(/[¡!]/g, '').toLowerCase() : ''}${juego.pro ? ' · modo pro' : ''}`, grande: `HOYO ${h.n}`, banda: `PAR ${h.par} · ${h.yardas[r.tee]} YD`, verso: h.verso }, 3000)
  sobrevolar([
    { pos: cam.pos.clone(), mira: cam.mira.clone() },
    { pos: V3(P[0] + d[0] * 30, 42, P[1] + d[1] * 30), mira: V3(P[0], 0, P[1]) },
    { pos: V3(mid[0] + d[0] * 40 + d[1] * 30, 75, mid[1] + d[1] * 40 - d[0] * 30), mira: V3(mid[0], 0, mid[1]) },
    fin,
  ], 4.2, () => { aApuntar(); if (r.idx === 0) decirDe('inicio') })
}
function nuevaRonda(climaId = null) {
  const r = M.sortearBanderas(M.nuevaRonda(RORRO, rng), rng)
  r.pro = juego.pro
  const id = M.CLIMAS[climaId] ? climaId : M.CLIMAS[PARAMS.get('clima')] ? PARAMS.get('clima') : M.sortearClima(rng)
  M.ponerClima(campoBase, r, id, Math.floor(rng() * 4294967296))
  juego.ronda = r
  est.pins = r.hoyos.map((h) => [...h.pin])
  juego.versiones = 0; juego.bugs = 0; juego.reverts = 0
  aplicarClima()
  S.lluvia?.(id === 'tormenta' ? 1 : id === 'lluvia' ? 0.55 : 0)
  return r
}

// ── superpoderes de dev ──
function breakpoint() {
  if (juego.estado === 'pausa') return continuar()
  const t = juego.tiro
  if (juego.estado !== 'tiro' || juego.poder.bp < 1 || !t || t.fase !== 'vuelo' || t.modo !== 'full') return
  juego.poder.bp--
  juego.estado = 'pausa'
  document.body.classList.add('pausa')
  C.pausa()
  t.destinoOrig = [t.desde[0] + t.carryVec[0] + t.deriva[0], t.desde[1] + t.carryVec[1] + t.deriva[1]]
  t.nuevo = [...t.destinoOrig]
  // la cámara se va arriba, para ver la pelota congelada y a dónde iba (y se mece un poco)
  // (casi cenital: la pelota en el aire queda abajo y el destino arriba, para arrastrarlo bien)
  const B = bola.position, D = t.destinoOrig, L = Math.max(20, dist([B.x, B.z], D)), dd = norm([D[0] - B.x, D[1] - B.z])
  const mid = V3(lerp(B.x, D[0], 0.32), 0, lerp(B.z, D[1], 0.32))
  seguir({ pos: V3(mid.x - dd[0] * (L * 0.3 + 8), L * 1.15 + 42, mid.z - dd[1] * (L * 0.3 + 8)), mira: mid }, 2.6)
  cam.t0orbita = est.tReal
  cam.orbita = 0.0001
  decirDe('bp')
  pintarCodigo()
  pintarHud()
}
function pintarCodigo() {
  const t = juego.tiro, p = bola.position
  const f = (n) => `<span class="num">${n.toFixed(1)}</span>`
  $('#codigo').innerHTML = `<span class="stop">● Pausado en el depurador</span> <span class="com">· motor.js · avanzar()</span>\n` +
    `<span class="k">const</span> tiro = { pos: [${f(p.x)}, ${f(p.z)}], alt: ${f(t.alt ?? 0)}, u: ${f(t.t / t.T)} }\n` +
    `tiro.<span class="s">destino</span> = [${f(t.nuevo[0])}, ${f(t.nuevo[1])}] <span class="com">// ← arrastrá la cancha</span>`
}
function arrastrarDestino(p) {
  const t = juego.tiro
  const resta = dist([bola.position.x, bola.position.z], t.destinoOrig)
  const maxR = Math.max(10, resta * 0.38)
  const d = [p[0] - t.destinoOrig[0], p[1] - t.destinoOrig[1]], l = Math.hypot(...d)
  t.nuevo = l > maxR ? [t.destinoOrig[0] + (d[0] / l) * maxR, t.destinoOrig[1] + (d[1] / l) * maxR] : p
  pintarCodigo()
}
/** Sigue el vuelo al destino nuevo: el final de la curva del motor se corre y el control se acomoda para que no salte. */
function continuar() {
  const t = juego.tiro
  document.body.classList.remove('pausa')
  cam.pos.copy(camara.position); cam.orbita = 0
  const u = t.t / t.T, b1 = 2 * u * (1 - u), b2 = u * u
  const Cn = [t.nuevo[0] - t.desde[0] - t.deriva[0], t.nuevo[1] - t.desde[1] - t.deriva[1]]
  if (b1 > 0.04) t.controlVec = [t.controlVec[0] + ((t.carryVec[0] - Cn[0]) * b2) / b1, t.controlVec[1] + ((t.carryVec[1] - Cn[1]) * b2) / b1]
  t.carryVec = Cn
  t.carry = Math.hypot(...Cn)
  juego.estado = 'tiro'
  C.seguir()
  pintarHud()
}
function gitRevert() {
  if (juego.estado !== 'apuntar' || juego.poder.revert < 1) return
  const ultimo = juego.historial.pop()
  if (!ultimo) return
  juego.poder.revert--
  juego.reverts++
  juego.estado = 'deploy'
  decirDe('revert')
  const skinVieja = ultimo.skin ?? 'clasico'
  mostrarCommit({ tipo: 'rev', titulo: `↩ git revert ${verTxt()}`, lineas: [['menos', ultimo.tipo === 'mal' ? `"${ultimo.citas?.[0] ?? 'cambios del cliente'}"` : 'se abre la calle'], ['mas', `skin: ${SKINS[skinVieja].nombre}`], ['com', `vuelve la v${juego.ver[0]}.${Math.max(0, juego.ver[1] - 1)}`]], hacia: `v${juego.ver[0]}.${Math.max(0, juego.ver[1] - 1)}` })
  for (const q of ultimo.quitados) if (q.b && !est.bumps.includes(q.b)) { q.b.desde = 0; q.b.hasta = 0; est.bumps.push(q.b) }
  const bolaAhora = inversa(juego.ronda.pelota, true)
  juego.bolaBase = bolaAhora
  golfista.visible = false
  desplegar({
    nuevos: [], quitar: ultimo.agregados, skin: skinVieja, bugs: ultimo.bugs ?? [], bolaVieja: est.bola1, bolaNueva: bolaAhora, rebobina: true,
    alFinal: () => { juego.ver = [juego.ver[0], Math.max(0, juego.ver[1] - 1)]; saltaVersion(); juego.ronda.pelota = [...bolaAhora]; juego.bolaBase = null; aApuntar() },
  })
  for (const q of ultimo.quitados) { const b = est.bumps.find((x) => x.id === q.id); if (b) b.hasta = q.amp }
  seguir({ pos: V3(W / 2, 360, H / 2 + 260), mira: V3(W / 2, 0, H / 2) }, 1.6)
  pintarHud()
}
function simular(bueno) {
  if (juego.estado !== 'apuntar') return
  veredicto(bueno ? 'SIMULADO ✓' : 'SIMULADO ✗', bueno ? 'ok' : 'mal')
  decirDe(bueno ? 'bueno' : 'malo')
  nuevaVersion(bueno)
}

// ── la UI 2D, arriba de la cancha: la goma, el latido, la línea y el pique (o la flecha del PRO), los cartelitos ──
const ui = $('#ui2d'), g2 = ui.getContext('2d')
const CC = { cream: '#f4eeda', gold: '#e8c34a', red: '#bc4b3c', ink: 'rgba(12,43,28,.85)' }
let dpr = 1
function proyectar(x, y, z) { const v = V3(x, y, z).project(camara); return [((v.x + 1) / 2) * innerWidth, ((1 - v.y) / 2) * innerHeight, v.z < 1] }
const enPiso = (p, extra = 0.05) => { const q = inversa(p); return proyectar(p[0], alturaEn(q) + extra, p[1]) }
function radioBolaPx() { const B = bola.position; const a = proyectar(B.x, B.y, B.z), b = proyectar(B.x + RADIO_BOLA * bola.scale.x, B.y, B.z); return Math.max(4, Math.hypot(a[0] - b[0], a[1] - b[1])) }
const LATIDO_AFUERA = 78
function radioLatido(f, dorado) {
  const c = M.PERFECTO.centro, afuera = Math.max(LATIDO_AFUERA, dorado + 44)
  if (f <= c) return dorado + (afuera - dorado) * (c - f) / c
  return dorado * (1 - 0.3 * (f - c) / (1 - c))
}
function dibujarUI() {
  g2.setTransform(dpr, 0, 0, dpr, 0, 0)
  g2.clearRect(0, 0, innerWidth, innerHeight)
  const r = juego.ronda
  if (!r) return
  const a = juego.estado === 'apuntar' ? juego.apunte : null
  if (a) dibujarApunte(a)
  if (juego.estado === 'pausa' && juego.tiro?.nuevo) dibujarDepurador(juego.tiro)
  dibujarDestello()
  dibujarMarcas()
  // la bandera de lejos: dónde está el hoyo y a cuánto
  if (['apuntar', 'tiro'].includes(juego.estado) && !juego.enPutt) {
    const h = hoyo(), [x, y, ve] = enPiso(h.pin, ALTO_PALO + 0.6)
    const d = Math.round(M.aYardas(r, dist(r.pelota, h.pin)))
    if (ve && d > 45 && x > 0 && x < innerWidth && y > 0 && y < innerHeight) {
      g2.font = '13px Anton, "Arial Narrow", sans-serif'; g2.textAlign = 'center'
      const txt = `${d} YD`, w = g2.measureText(txt).width + 14
      g2.fillStyle = CC.ink; g2.beginPath(); g2.roundRect(x - w / 2, y - 26, w, 19, 9); g2.fill()
      g2.fillStyle = CC.gold; g2.fillText(txt, x, y - 12)
      g2.beginPath(); g2.moveTo(x - 5, y - 7); g2.lineTo(x + 5, y - 7); g2.lineTo(x, y - 1); g2.closePath(); g2.fillStyle = CC.ink; g2.fill()
    }
  }
}
function dibujarApunte(a) {
  const r = juego.ronda
  const B = bola.position
  const [bx, by] = proyectar(B.x, B.y, B.z)
  const col = a.fondo ? CC.red : CC.cream
  g2.lineCap = 'round'
  // la dirección del tiro en la pantalla (para la goma, que sale para atrás)
  const ade = proyectar(B.x + Math.cos(a.ang) * 6, B.y, B.z + Math.sin(a.ang) * 6)
  const dirS = Math.atan2(ade[1] - by, ade[0] - bx)
  if (juego.pro && !a.putt) flechaPro(a, bx, by, dirS, col)
  else if (a.putt) lineaPutt(a, B)
  else if (a.arbol) arbolEnLaSalida(a, bx, by)
  else trayectoria(a, B, col)
  goma(a, bx, by, dirS)
}
function trayectoria(a, B, col) {
  // la línea punteada del vuelo (en 3D, proyectada) y la zona de pique: ±1,5 desvíos en largo y en ancho
  const d = a.destino, hMax = 2 + a.alcance * 0.025 // un arco bajito: que se lea a dónde va (de atrás, el vuelo alto se sale de la pantalla)
  const yD = alturaEn(inversa(d)) + 0.1
  g2.strokeStyle = col; g2.lineWidth = 3; g2.setLineDash([1, 8])
  g2.beginPath()
  for (let i = 0; i <= 40; i++) {
    const s = i / 40
    const x = lerp(B.x, d[0], s), z = lerp(B.z, d[1], s), y = lerp(B.y, yD, s) + 4 * hMax * s * (1 - s)
    const [px, py] = proyectar(x, y, z)
    i ? g2.lineTo(px, py) : g2.moveTo(px, py)
  }
  g2.stroke(); g2.setLineDash([])
  const largo = Math.max(1.5 * a.disp.carry * a.alcance, 1.5), ancho = Math.max(a.alcance * Math.tan(Math.min(1.5 * a.disp.ang, 1.1)), 1.5)
  const cu = a.plan.cuerda, ux = Math.cos(cu), uy = Math.sin(cu)
  g2.beginPath()
  for (let i = 0; i <= 40; i++) {
    const t = (i / 40) * Math.PI * 2, l = Math.cos(t) * largo, w = Math.sin(t) * ancho
    const p = [d[0] + ux * l - uy * w, d[1] + uy * l + ux * w]
    const [px, py] = enPiso(p)
    i ? g2.lineTo(px, py) : g2.moveTo(px, py)
  }
  g2.closePath()
  g2.fillStyle = a.fondo ? 'rgba(188,75,60,.25)' : 'rgba(244,238,218,.2)'; g2.fill()
  g2.strokeStyle = col; g2.lineWidth = 2; g2.setLineDash([5, 5]); g2.stroke(); g2.setLineDash([])
  const [lx, ly] = enPiso(d, 0.2)
  const txt = `≈ ${Math.round(M.aYardas(juego.ronda, a.alcance))} YD${a.fondo ? ' · A FONDO' : ''}`
  g2.font = '16px Anton, "Arial Narrow", sans-serif'; g2.textAlign = 'center'
  const w = g2.measureText(txt).width + 16, y0 = Math.max(70, ly - 34)
  g2.fillStyle = CC.ink; g2.beginPath(); g2.roundRect(lx - w / 2, y0 - 16, w, 24, 12); g2.fill()
  g2.fillStyle = col; g2.fillText(txt, lx, y0 + 2)
}
function lineaPutt(a, B) {
  // putt: solo la dirección (sobre el green, en 3D) y la fuerza; la distancia la medís vos
  g2.setLineDash([1, 10])
  const pts = []
  for (let i = 1; i <= 16; i++) { const s = i * 0.5; const p = [B.x + Math.cos(a.ang) * s, B.z + Math.sin(a.ang) * s]; pts.push(enPiso(p, 0.03)) }
  for (const [w, c] of [[8, 'rgba(12,43,28,.8)'], [4.5, CC.cream]]) { g2.lineWidth = w; g2.strokeStyle = c; g2.beginPath(); pts.forEach(([x, y], i) => (i ? g2.lineTo(x, y) : g2.moveTo(x, y))); g2.stroke() }
  g2.setLineDash([])
}
function flechaPro(a, bx, by, dirS, col) {
  // el MODO PRO: sin líneas punteadas ni dónde cae; una flechita en la dirección
  const r0 = Math.max(14, radioBolaPx() + 4), L = r0 + 22
  const ex = bx + Math.cos(dirS) * L, ey = by + Math.sin(dirS) * L
  const flecha = () => { g2.beginPath(); g2.moveTo(bx + Math.cos(dirS) * r0, by + Math.sin(dirS) * r0); g2.lineTo(ex, ey); g2.moveTo(ex + Math.cos(dirS + 2.5) * 9, ey + Math.sin(dirS + 2.5) * 9); g2.lineTo(ex, ey); g2.lineTo(ex + Math.cos(dirS - 2.5) * 9, ey + Math.sin(dirS - 2.5) * 9) }
  g2.lineJoin = 'round'
  flecha(); g2.strokeStyle = 'rgba(12,43,28,.8)'; g2.lineWidth = 7; g2.stroke()
  flecha(); g2.strokeStyle = col; g2.lineWidth = 3.5; g2.stroke()
}
function arbolEnLaSalida(a, bx, by) {
  const [ax, ay] = enPiso(a.arbol.pos, 0.5), [px, py] = enPiso([a.arbol.pino.x, a.arbol.pino.y], 2)
  g2.strokeStyle = CC.red; g2.lineWidth = 3.5; g2.setLineDash([1, 8])
  g2.beginPath(); g2.moveTo(bx, by); g2.lineTo(ax, ay); g2.stroke(); g2.setLineDash([])
  const rr = 14
  g2.lineWidth = 3; g2.beginPath(); g2.arc(px, py, rr, 0, 7); g2.stroke()
  g2.beginPath(); g2.moveTo(px - 8, py - 8); g2.lineTo(px + 8, py + 8); g2.moveTo(px + 8, py - 8); g2.lineTo(px - 8, py + 8); g2.stroke()
  g2.font = '16px Anton, "Arial Narrow", sans-serif'; g2.textAlign = 'center'
  const txt = 'PEGA EN EL ÁRBOL 🌲', w = g2.measureText(txt).width + 16
  g2.fillStyle = CC.ink; g2.beginPath(); g2.roundRect(px - w / 2, py - rr - 34, w, 24, 12); g2.fill()
  g2.fillStyle = CC.red; g2.fillText(txt, px, py - rr - 16)
}
/** La goma: sale de la pelota para atrás (como una gomera) y se estira con la fuerza. A fondo, roja y tiembla. */
function goma(a, bx, by, dirS) {
  const exp = a.putt ? 1.6 : 1.35
  const largo = Math.max(84, Math.min(150, Math.min(innerWidth, innerHeight) * 0.3))
  const fondo = a.p >= 0.97
  const atras = dirS + Math.PI
  const ux = Math.cos(atras), uy = Math.sin(atras), nx = -uy, ny = ux
  const tiembla = fondo ? Math.sin(performance.now() / 22) * 2.2 : 0
  const L = largo * Math.pow(Math.min(1, a.p), 1 / exp) * (fondo ? 1.04 : 1)
  const r0 = Math.max(9, radioBolaPx() + 2)
  const ax = bx + ux * r0, ay = by + uy * r0
  const ex = bx + ux * (r0 + L) + nx * tiembla, ey = by + uy * (r0 + L) + ny * tiembla
  const color = fondo ? CC.red : a.p >= 0.5 ? CC.gold : CC.cream
  const grosor = Math.max(3, 11 - a.p * 7)
  g2.lineCap = 'round'
  g2.strokeStyle = CC.ink; g2.lineWidth = grosor + 4; g2.beginPath(); g2.moveTo(ax, ay); g2.lineTo(ex, ey); g2.stroke()
  const gr = g2.createLinearGradient(ax, ay, ex, ey); gr.addColorStop(0, CC.cream); gr.addColorStop(1, color)
  g2.strokeStyle = gr; g2.lineWidth = grosor; g2.beginPath(); g2.moveTo(ax, ay); g2.lineTo(ex, ey); g2.stroke()
  g2.fillStyle = '#0c2b1c'; g2.beginPath(); g2.arc(ex, ey, 8, 0, 7); g2.fill()
  g2.fillStyle = color; g2.beginPath(); g2.arc(ex, ey, 5.2, 0, 7); g2.fill()
  if (drag && fondo && !drag.fondo) { S.nudo(0, true); tic() }
  if (drag) drag.fondo = fondo
  if (drag && a.latido) dibujarLatido(a, bx, by)
}
/** El latido: un aro que se achica hasta el borde de la pelota (el aro dorado). Soltando ahí, sale perfecto. */
function dibujarLatido(a, x, y) {
  const f = (((drag.fase ?? 0) % 1) + 1) % 1
  const c = M.PERFECTO.centro, v = a.ventana, sweet = a.sweet
  const dorado = radioBolaPx() + 1.5
  const rapido = clamp((M.PERFECTO.lento - (drag.periodo ?? M.periodoLatido(a.p))) / (M.PERFECTO.lento - M.PERFECTO.rapido), 0, 1)
  const mez = (a1, b1) => Math.round(a1 + (b1 - a1) * rapido)
  const colAro = sweet ? CC.gold : `rgb(${mez(244, 214)},${mez(238, 92)},${mez(218, 74)})`
  const r1 = radioLatido(c - v, dorado)
  g2.fillStyle = sweet ? 'rgba(232,195,74,.42)' : 'rgba(232,195,74,.2)'
  g2.beginPath(); g2.arc(x, y, r1, 0, 7); g2.arc(x, y, dorado, 0, 7, true); g2.fill()
  g2.strokeStyle = 'rgba(12,43,28,.65)'; g2.lineWidth = 4; g2.beginPath(); g2.arc(x, y, dorado, 0, 7); g2.stroke()
  g2.strokeStyle = CC.gold; g2.lineWidth = sweet ? 2.8 : 1.8; g2.beginPath(); g2.arc(x, y, dorado, 0, 7); g2.stroke()
  const rr = radioLatido(f, dorado)
  g2.globalAlpha = Math.min(1, f / 0.1)
  g2.strokeStyle = 'rgba(12,43,28,.8)'; g2.lineWidth = 7.5; g2.beginPath(); g2.arc(x, y, rr, 0, 7); g2.stroke()
  g2.strokeStyle = colAro; g2.lineWidth = 4; g2.beginPath(); g2.arc(x, y, rr, 0, 7); g2.stroke()
  if (sweet) { g2.globalAlpha = 0.35; g2.strokeStyle = CC.gold; g2.lineWidth = 12; g2.beginPath(); g2.arc(x, y, rr, 0, 7); g2.stroke() }
  g2.globalAlpha = 1
}
/** Un círculo en el piso de la cancha (proyectado: se ve como una elipse). */
function anilloPiso(c, radio, pasos = 48) {
  g2.beginPath()
  for (let i = 0; i <= pasos; i++) {
    const a = (i / pasos) * Math.PI * 2, [x, y] = enPiso([c[0] + Math.cos(a) * radio, c[1] + Math.sin(a) * radio], 0.1)
    i ? g2.lineTo(x, y) : g2.moveTo(x, y)
  }
}
/** El depurador: hasta dónde se puede correr el destino, a dónde iba y a dónde va ahora (con el resto del vuelo). */
function dibujarDepurador(t) {
  const B = bola.position, D = t.destinoOrig, N = t.nuevo
  const maxR = Math.max(10, dist([B.x, B.z], D) * 0.38)
  g2.lineCap = 'round'
  anilloPiso(D, maxR); g2.fillStyle = 'rgba(255,138,122,.08)'; g2.fill()
  g2.setLineDash([6, 7]); g2.strokeStyle = 'rgba(255,138,122,.75)'; g2.lineWidth = 2; g2.stroke(); g2.setLineDash([])
  anilloPiso(D, 2.2); g2.strokeStyle = 'rgba(244,238,218,.55)'; g2.lineWidth = 2; g2.stroke()
  // el resto del vuelo, al destino nuevo
  const yN = alturaEn(inversa(N)) + 0.1, alt = B.y
  g2.setLineDash([1, 8]); g2.lineWidth = 3; g2.strokeStyle = CC.gold
  g2.beginPath()
  for (let i = 0; i <= 30; i++) {
    const u = i / 30, x = lerp(B.x, N[0], u), z = lerp(B.z, N[1], u), y = lerp(alt, yN, u * u)
    const [px, py] = proyectar(x, y, z)
    i ? g2.lineTo(px, py) : g2.moveTo(px, py)
  }
  g2.stroke(); g2.setLineDash([])
  // la mira
  const late = 1 + Math.sin(performance.now() / 160) * 0.12
  anilloPiso(N, 2.6 * late); g2.strokeStyle = 'rgba(12,43,28,.85)'; g2.lineWidth = 6; g2.stroke()
  anilloPiso(N, 2.6 * late); g2.strokeStyle = CC.gold; g2.lineWidth = 3; g2.stroke()
  const [nx, ny] = enPiso(N, 0.1)
  g2.strokeStyle = CC.gold; g2.lineWidth = 2
  g2.beginPath(); g2.moveTo(nx - 14, ny); g2.lineTo(nx - 5, ny); g2.moveTo(nx + 5, ny); g2.lineTo(nx + 14, ny); g2.moveTo(nx, ny - 10); g2.lineTo(nx, ny - 4); g2.moveTo(nx, ny + 4); g2.lineTo(nx, ny + 10); g2.stroke()
  g2.font = '13px Anton, "Arial Narrow", sans-serif'; g2.textAlign = 'center'
  const txt = dist(N, D) < 0.5 ? 'ARRASTRÁ LA CANCHA' : `DESTINO NUEVO · ${Math.round(M.aYardas(juego.ronda, dist(N, D)))} YD CORRIDO`
  const w = g2.measureText(txt).width + 16
  g2.fillStyle = CC.ink; g2.beginPath(); g2.roundRect(nx - w / 2, ny - 42, w, 22, 11); g2.fill()
  g2.fillStyle = CC.gold; g2.fillText(txt, nx, ny - 26)
}
function dibujarDestello() {
  if (!destello) return
  const u = (performance.now() - destello.t0) / 420
  if (u >= 1) { destello = null; return }
  const B = bola.position, [x, y] = proyectar(B.x, B.y, B.z)
  const c = destello.nivel === 'perfecto' ? '232,195,74' : '244,238,218', fuerza = destello.nivel === 'perfecto' ? 1 : destello.nivel === 'bueno' ? 0.6 : 0.25
  g2.strokeStyle = `rgba(${c},${(1 - u) * 0.9 * fuerza})`; g2.lineWidth = 5 * (1 - u) + 1
  g2.beginPath(); g2.arc(x, y, radioBolaPx() + 1.5 + u * 60, 0, 7); g2.stroke()
}
function dibujarMarcas() {
  const ahora = performance.now()
  marcas = marcas.filter((m) => ahora - m.t0 < 1900)
  g2.font = '13px Anton, "Arial Narrow", sans-serif'; g2.textAlign = 'left'; g2.textBaseline = 'middle'
  for (const m of marcas) {
    const u = (ahora - m.t0) / 1900
    const [x0, y0, ve] = enPiso(m.pos, 1)
    if (!ve) continue
    const x = x0 + 12, y = y0 - 14 - u * 18
    g2.globalAlpha = u < 0.08 ? u / 0.08 : 1 - Math.max(0, (u - 0.65) / 0.35)
    const w = g2.measureText(m.txt).width + 14
    g2.fillStyle = CC.ink; g2.beginPath(); g2.roundRect(x, y - 10, w, 20, 10); g2.fill()
    g2.fillStyle = m.tono === 'oro' ? CC.gold : m.tono === 'bueno' ? CC.cream : 'rgba(244,238,218,.72)'
    g2.fillText(m.txt, x + 7, y + 1)
  }
  g2.globalAlpha = 1; g2.textBaseline = 'alphabetic'
}
function tic() { try { navigator.vibrate?.(12) } catch {} }

// ── la intro: la cancha se compila sola ──
function compilar() {
  const arb = arboles.length.toLocaleString('es-AR'), bunk = FILAS.join('').split('b').length - 1
  const lineas = [
    '<div class="tit">LA CANCHA DE <em>RORRO</em></div>',
    '<span class="p">$</span> npm run cancha',
    `<span class="dim">›</span> leyendo cancha-grid.js · <span class="ok">${W} × ${H}</span> yardas`,
    `<span class="dim">›</span> plantando <span class="ok">${arb}</span> árboles (6 tipos)`,
    `<span class="dim">›</span> 3 greens con su caída · <span class="ok">${bunk.toLocaleString('es-AR')}</span> yardas de bunker`,
    `<span class="dim">›</span> el clima: <span class="ok">${(M.climaDe(juego.ronda)?.nombre ?? '').replace(/[¡!]/g, '').toLowerCase()}</span> · el motor del juego`,
    '<span class="ok">✓ compilado</span> <span class="dim">· v1.0 (en desarrollo)</span>',
  ]
  const el = $('#compila')
  el.innerHTML = ''
  lineas.forEach((l, i) => setTimeout(() => { const d = document.createElement('div'); d.innerHTML = l; d.className = 'linea'; d.style.animation = 'entra .25s ease forwards'; el.appendChild(d); C.tecla(); C.datos(4 + i, { vol: 0.05 }) }, 120 + i * 420))
  C.compilar(4.4)
  const t0 = est.tReal
  sobrevolar([
    { pos: V3(W / 2 + 30, 46, H + 72), mira: V3(W / 2, 0, H - 30) },
    { pos: V3(W / 2 + 70, 95, H * 0.66), mira: V3(W / 2 - 5, 0, H * 0.44) },
    { pos: V3(W / 2 + 45, 175, H * 0.36 + 70), mira: V3(W / 2, 0, H * 0.22) },
    poseCancha(),
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
  for (const a of arboles) if (a.popT < 0) a.popT = est.tReal - 1
  $('#compila').classList.add('fuera')
  $('#saltar').hidden = true
  document.body.classList.remove('intro')
  cam.ruta = null
  C.compilado()
  S.musica?.('juego')
  const id = juego.ronda?.clima?.id
  S.lluvia(id === 'tormenta' ? 1 : id === 'lluvia' ? 0.55 : 0) // (el audio recién se despertó con el toque)
  empezarHoyo()
}

// ── los toques ──
const raycaster = new THREE.Raycaster(), plano = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), _hit = new THREE.Vector3()
function alPiso(ev) {
  const r = lienzo.getBoundingClientRect()
  raycaster.setFromCamera(new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), camara)
  return raycaster.ray.intersectPlane(plano, _hit) ? [_hit.x, _hit.z] : null
}
/** La derecha y el adelante de la cámara, en la cancha (para pasar el arrastre de la pantalla al tiro). */
function ejesCamara() {
  const f = V3(); camara.getWorldDirection(f)
  const ade = norm([f.x, f.z])
  return { ade, der: [-ade[1], ade[0]] }
}
lienzo.addEventListener('pointerdown', (e) => {
  C.despertar(); S.despertar()
  if (juego.estado === 'pausa') { const p = alPiso(e); if (p) arrastrarDestino(p); drag = { pausa: true, id: e.pointerId }; return }
  if (juego.estado === 'armando') { terminarIntro(); return }
  if (juego.estado !== 'apuntar' || drag) return
  const largo = Math.max(90, Math.min(largoMax(), innerHeight - e.clientY - 14))
  drag = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, id: e.pointerId, t0: performance.now(), largo, ...ejesCamara() }
  lienzo.setPointerCapture(e.pointerId)
  S.cargaInicio()
  document.body.classList.add('apuntando')
})
lienzo.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return
  if (drag.pausa) { const p = alPiso(e); if (p) arrastrarDestino(p); return }
  drag.x = e.clientX; drag.y = e.clientY
})
lienzo.addEventListener('pointerup', (e) => {
  if (!drag || e.pointerId !== drag.id) return
  if (drag.pausa) { drag = null; return }
  let a = apunte()
  // el latido, en el momento real en que levantaste el dedo (con el atraso de la pantalla descontado)
  if (a?.latido) {
    const ya = performance.now()
    const t = e.timeStamp > ya - 1000 && e.timeStamp <= ya + 5 ? e.timeStamp : ya
    const f = (drag.fase ?? 0) + (t - ATRASO_PANTALLA - (drag.tFase ?? ya)) / 1000 / (drag.periodo ?? M.periodoLatido(a.p))
    a = { ...a, soltada: M.soltadaLatido(f, a.ventana) }
    destello = { t0: ya, nivel: a.soltada.nivel }
  }
  drag = null
  juego.apunte = null
  S.cargaFin()
  document.body.classList.remove('apuntando')
  if (a && juego.estado === 'apuntar') pegar(a)
  else if (juego.estado === 'apuntar') seguir(poseJuego(), 2.4)
})
lienzo.addEventListener('pointercancel', () => { if (drag && !drag.pausa) S.cargaFin(); drag = null; juego.apunte = null; document.body.classList.remove('apuntando') })
$('#bp').onclick = breakpoint
$('#revert').onclick = gitRevert
$('#saltar').onclick = terminarIntro
document.querySelectorAll('[data-hoyo]').forEach((b) => (b.onclick = () => {
  const r = juego.ronda
  if (!r || !['apuntar'].includes(juego.estado)) return
  // saltar a otro hoyo (para probar): la ronda sigue desde su tee, sin anotar
  r.idx = +b.dataset.hoyo; r.golpes = 0; r.pelota = [...M.teeDe(r)]; r.desde = [...r.pelota]; r.lie = 'tee'; r.lieDesde = 'tee'
  empezarHoyo()
}))
let vistaCancha = false
$('#vista').onclick = () => {
  vistaCancha = !vistaCancha
  $('#vista').classList.toggle('on', vistaCancha)
  if (vistaCancha) seguir(poseCancha(), 1.6)
  else if (juego.estado === 'apuntar') seguir(poseJuego(), 2.4)
}
$('#modo').onclick = () => {
  juego.pro = !juego.pro
  if (juego.ronda) juego.ronda.pro = juego.pro
  pintarHud()
  veredicto(juego.pro ? 'MODO PRO' : 'MODO NORMAL', 'ok')
}
const pintarSonido = () => { $('#sonido').textContent = S.prendido() ? '🔊' : '🔇' }
$('#sonido').onclick = () => { S.alternar(); C.alternar(); pintarSonido() }
pintarSonido()
$('#engranaje').onclick = () => $('#ajustes').classList.toggle('ve')
$('#sim-bueno').onclick = () => { $('#ajustes').classList.remove('ve'); simular(true) }
$('#sim-malo').onclick = () => { $('#ajustes').classList.remove('ve'); simular(false) }
$('#respira').onclick = () => { est.resp = est.resp ? 0 : 0.14; $('#respira').textContent = `~ respira: ${est.resp ? 'sí' : 'no'}` }
$('#climas').innerHTML = Object.entries(M.CLIMAS).map(([id, c]) => `<button data-clima="${id}">${c.nombre.replace(/[¡!]/g, '').replace(' en San Diego', '')}</button>`).join('')
document.querySelectorAll('#climas button').forEach((b) => (b.onclick = () => {
  const r = juego.ronda
  if (!r || juego.estado !== 'apuntar') return
  M.ponerClima(campoBase, r, b.dataset.clima, Math.floor(rng() * 4294967296))
  aplicarClima()
  S.lluvia?.(b.dataset.clima === 'tormenta' ? 1 : b.dataset.clima === 'lluvia' ? 0.55 : 0)
  veredicto(M.CLIMAS[b.dataset.clima].nombre.replace(/[¡!]/g, '').toUpperCase(), 'ok')
}))
$('#otra').onclick = () => { $('#fin').hidden = true; S.musica?.('juego'); nuevaRonda(); empezarHoyo() }

// ── el cuadro ──
function medir() {
  const w = innerWidth, h = innerHeight
  renderer.setSize(w, h, false)
  camara.aspect = w / h
  camara.fov = w / h < 0.75 ? 52 : 42
  camara.updateProjectionMatrix()
  dpr = Math.min(devicePixelRatio, 2)
  ui.width = w * dpr; ui.height = h * dpr
}
addEventListener('resize', medir)
medir()
// LG relata justo abajo de la tarjeta del hoyo y sus chips (en un celu angosto la tarjeta ocupa dos renglones)
// (sin el getBoundingClientRect: en la intro el HUD está corrido para arriba)
new ResizeObserver(() => { const e = $('#hud .izq'); document.documentElement.style.setProperty('--tarjeta-bajo', `${$('#hud').offsetTop + e.offsetTop + e.offsetHeight}px`) }).observe($('#hud .izq'))
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
  if (congelado) cam.orbita = 0.0001 + Math.sin((est.tReal - (cam.t0orbita ?? 0)) * 0.4) * 0.2
  if (juego.estado === 'boot') { cam.pos.set(W / 2 + 30 + Math.sin(est.tReal * 0.25) * 14, 46 + Math.sin(est.tReal * 0.4) * 4, H + 72); cam.mira.set(W / 2, 0, H - 30 - Math.sin(est.tReal * 0.2) * 10) }
  juego.armando?.()
  juego.barrido?.()
  const r = juego.ronda
  // apuntando: el tiro que se arma, el latido (más rápido cuanto más fuerte) y la cámara que se abre para ver el pique
  if (drag && !drag.pausa && juego.estado === 'apuntar') {
    const a = apunte()
    juego.apunte = a
    S.carga(a?.p ?? 0, 0)
    if (a?.latido) {
      const objetivo = M.periodoLatido(a.p)
      drag.periodo = drag.periodo == null ? objetivo : drag.periodo + (objetivo - drag.periodo) * Math.min(1, dt / 0.3)
      const ant = drag.fase ?? 0
      drag.fase = ant + dt / drag.periodo
      drag.tFase = performance.now()
      const cruza = (m) => Math.floor(ant - m) < Math.floor(drag.fase - m)
      if (cruza(M.PERFECTO.centro)) { S.latido(2); tic() } else if (cruza(M.PERFECTO.centro - 0.15)) S.latido(1); else if (cruza(M.PERFECTO.centro - 0.3)) S.latido(0)
    }
    if (a && !a.putt) {
      const B = mundoBola(), pin = hoyo().pin
      // MODO PRO: la cámara no sigue a dónde cae (eso cantaba el largo): se abre hasta el hoyo
      const L = juego.pro ? Math.min(dist(r.pelota, pin), 200 / hoyo().escala) : dist(r.pelota, a.destino) * 1.12
      const mezcla = [lerp(pin[0], a.destino[0], 0.55), lerp(pin[1], a.destino[1], 0.55)]
      seguir(poseApuntar(B, juego.pro ? pin : mezcla, Math.max(L, 30)), 2.2)
    }
    if (a) ubicarGolfista(a.ang)
  }
  // con la pelota quieta, los monos cazan (si llegan, se la llevan: al tee y +1)
  if (r && ['apuntar'].includes(juego.estado) && !drag) {
    // la tensión del juego: un tic que se acelera con el mono más cercano que viene
    let dm = null
    for (const m of r.monos) if (m.modo === 'caza' && !m.pancho) dm = Math.min(dm ?? Infinity, dist(m.pos, r.pelota))
    if (dm != null) S.tension(dm, M.alertaDe(r))
    const llego = M.moverMonos(r.monos, dt, r.pelota)
    if (llego) {
      S.robo(); veredicto('¡LLEGARON LOS MONOS!', 'mal')
      M.monosLlegaron(r)
      decir(elegir(M.RELATO?.monosLlegan ?? ['Se la llevaron.']))
      setTimeout(() => nuevaVersion(false), 600)
      juego.estado = 'deploy'
    }
  } else if (r && juego.estado !== 'tiro' && juego.estado !== 'pausa') M.moverMonos(r.monos, dt, null)
  moverTiro(dt)
  if (!juego.tiro && bola.visible && juego.estado !== 'resultado') bola.position.copy(mundoBola())
  // la pelota de lejos se ve más grande (si no, desaparece)
  const dc = camara.position.distanceTo(bola.position)
  bola.scale.setScalar(Math.max(1, dc / 70))
  moverCamara(dtR)
  moverArboles(dt)
  moverMonos3d(dt)
  moverBanderas(dtR)
  moverParticulas(dt)
  moverCaida(dt)
  moverCharcos()
  moverClima(dt)
  poseGolfista()
  if (juego.estado === 'tiro' || juego.estado === 'pausa') pintarEstela(); else if (estelaPts.length) { estelaPts.shift(); estelaPts.shift(); pintarEstela() }
  // el dron (el servo y el aire de la cámara, el raspado de la cancha): en la compilación, los sobrevuelos y la vista
  // de cámara; jugando, no (suena el juego)
  const velCam = dtR > 0 ? camara.position.distanceTo(posAntes) / dtR : 0
  posAntes.copy(camara.position)
  const dron = ['boot', 'armando', 'sobrevuelo'].includes(juego.estado) || vistaCancha
  const armandose = juego.estado === 'armando' ? 0.45 : 0
  C.movimiento(dron && !congelado ? velCam : 0, (dron ? Math.min(0.6, energiaArboles * 0.35) + armandose : 0) + est.swVivo * 0.4)
  C.zumbido(dron ? 1 : 0)
  if (r) pintarViento()
  subirUniforms()
  renderer.render(escena, camara)
  dibujarUI()
}
// arranca: la ronda (con su clima), la cámara al pie de la cancha en plano, y el botón (el audio necesita un toque)
nuevaRonda()
juego.estado = 'boot'
pintarHud()
$('#compila').innerHTML = `<div class="tit">LA CANCHA DE <em>RORRO</em></div><div class="dim">// La Trampa del Mono, hecha en código.<br>// Cada tiro la rehace: el bueno se aprueba, el malo trae cambios del cliente.</div><button class="btn oro" id="arrancar">▶ COMPILAR</button><div class="dim chico">con sonido 🔊</div>`
$('#saltar').hidden = true
$('#arrancar').onclick = () => { C.despertar(); S.despertar(); C.zumbido(0.5); juego.estado = 'armando'; $('#saltar').hidden = false; compilar() }
requestAnimationFrame(cuadro)
window.__rorro = { juego, est, cancha, ponerSkins, aplicarClima, sortearBugs, desplegar, SKINS, arboles, camara, cam, bola, simular, breakpoint, continuar, gitRevert, terminarIntro, nuevaRonda, empezarHoyo, inversa, adelante, M, apunteDe: (ang, p) => { const r = juego.ronda; return { ang, p, putt: M.enModoPutt(juego.campo, r), plan: M.planTiro(juego.campo, r, ang, p, 0, 0) } }, pegar, aApuntar }
