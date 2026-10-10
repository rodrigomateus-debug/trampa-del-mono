// La cancha de Rorro, sin three: el mapa del juego en capas, la deformación (la misma cuenta que el shader), las skins
// de cada versión y la grilla que usa el motor. La grilla se hornea en cada versión (la cancha deformada, celda por
// celda): así la física del juego (pique, pinos, bunkers, afuera) juega en la cancha que se ve.
import * as M from '../motor.js'

export const campoBase = M.crearCampo()
export const FILAS = campoBase.cancha.filas
export const W = FILAS[0].length, H = FILAS.length, N = W * H
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x))
export const lerp = (a, b, t) => a + (b - a) * t
export const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
export const norm = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l] }
export const letraBase = (q) => (FILAS[Math.floor(q[1])] ?? '')[Math.floor(q[0])] ?? 'x'

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
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out[y * W + x] = (tmp[Math.max(0, y - 1) * W + x] + tmp[y * W + x] + tmp[Math.min(H - 1, y + 1) * W + x]) / 3
    src = out
  }
  return src
}
export const CAPA = { calle: suavizar(capa('f')), green: suavizar(capa('g')), bunker: suavizar(capa('b')), tee: suavizar(capa('e')), afuera: suavizar(capa('x')), arbol: suavizar(capa('t'), 3) }
// la caída de cada green, hecha relieve: baja para donde rueda la pelota (las zonas de caída del juego, mezcladas suave)
{
  const K = 0.075, caida = new Float32Array(N)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (FILAS[y][x] !== 'g') continue
    const p = [x + 0.5, y + 0.5]
    const h = M.HOYOS.reduce((a, b) => (dist(b.pin, p) < dist(a.pin, p) ? b : a))
    const zonas = h.caidas?.length ? h.caidas : [{ p: h.pin, v: h.caida }]
    let s = 0, sw = 0
    for (const z of zonas) {
      const w = Math.exp(-((p[0] - z.p[0]) ** 2 + (p[1] - z.p[1]) ** 2) / (2 * 9 * 9)) + 1e-9
      s += w * -((p[0] - z.p[0]) * z.v[0] + (p[1] - z.p[1]) * z.v[1]) * K * (z.fuerte ? 1.6 : 1)
      sw += w
    }
    caida[y * W + x] = s / sw
  }
  CAPA.caida = suavizar(caida, 2)
}
export function muestra(a, x, y) {
  const fx = clamp(x - 0.5, 0, W - 1), fy = clamp(y - 0.5, 0, H - 1)
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(W - 1, x0 + 1), y1 = Math.min(H - 1, y0 + 1)
  const tx = fx - x0, ty = fy - y0
  return lerp(lerp(a[y0 * W + x0], a[y0 * W + x1], tx), lerp(a[y1 * W + x0], a[y1 * W + x1], tx), ty)
}

// ── la deformación ──
// Componentes (`bumps`), cada uno con su amplitud de antes (`desde`) y la de la versión nueva (`hasta`):
// tipo 0: un bulto que corre lo que está cerca (centro, radio, vector); tipo 1: un bulto que infla (o achica si es
// negativo); tipo 2: una onda que cruza toda la cancha (vector de onda en cx, cy; fase en r; amplitud en vx, vy).
// Más la respiración (solo visual) y las zonas quietas: la pelota y los tres hoyos no se mueven nunca.
export const NB = 36
export const est = {
  bumps: [],
  bola0: [0, 0], bola1: [0, 0], pins: M.HOYOS.map((h) => [...h.pin]),
  swO: [0, 0], swSentido: 1, swW: 1e5, swBanda: 22, swVivo: 0, rebobina: 0, // la onda del deploy (un círculo)
  t: 0, resp: 0.14,
  armaO: [W / 2, H + 30], armaD: [0, -1], armaW: -40, armaBanda: 26, // la compilación (de abajo para arriba)
}
export const avance = (q) => { const d = dist(q, est.swO); return clamp((est.swSentido > 0 ? est.swW - d : d - est.swW) / est.swBanda, 0, 1) }
export const armado = (q) => clamp((est.armaW - ((q[0] - est.armaO[0]) * est.armaD[0] + (q[1] - est.armaO[1]) * est.armaD[1])) / est.armaBanda, 0, 1)
const quieto = (q, c, r0, r1) => ss(r0, r1, dist(q, c))
/** El desplazamiento en q. `final`: el de la versión que viene, sin respiración (para la grilla del motor). */
export function desplazo(q, final = false) {
  const k = final ? 1 : avance(q)
  let dx = 0, dy = 0
  for (const b of est.bumps) {
    const amp = final ? b.hasta : lerp(b.desde, b.hasta, k)
    if (!amp) continue
    if (b.tipo === 2) { const s = Math.sin(b.cx * q[0] + b.cy * q[1] + b.r) * amp; dx += b.vx * s; dy += b.vy * s; continue }
    const ex = q[0] - b.cx, ey = q[1] - b.cy
    const w = Math.exp(-(ex * ex + ey * ey) / (b.r * b.r)) * amp
    if (b.tipo === 0) { dx += b.vx * w; dy += b.vy * w } else { dx += (ex / b.r) * b.vx * w; dy += (ey / b.r) * b.vx * w }
  }
  if (!final) {
    const t = est.t
    dx += est.resp * (Math.sin(q[1] * 0.061 + t * 0.9) + 0.5 * Math.sin(q[0] * 0.11 - t * 1.3))
    dy += est.resp * (Math.cos(q[0] * 0.07 + t * 0.7) + 0.5 * Math.cos(q[1] * 0.09 + t * 1.1))
  }
  const qb = final ? quieto(q, est.bola1, 4, 10) : lerp(quieto(q, est.bola0, 4, 10), quieto(q, est.bola1, 4, 10), k)
  const qp = quieto(q, est.pins[0], 5, 11) * quieto(q, est.pins[1], 5, 11) * quieto(q, est.pins[2], 5, 11)
  return [dx * qb * qp, dy * qb * qp]
}
export const adelante = (q) => { const d = desplazo(q); return [q[0] + d[0], q[1] + d[1]] }
export function inversa(p, final = false) { let q = p; for (let i = 0; i < 4; i++) { const d = desplazo(q, final); q = [p[0] - d[0], p[1] - d[1]] } return q }
/** La altura del terreno en q (yardas), como el shader (con la ola del deploy y la compilación). */
export function alturaEn(q) {
  const fw = ss(0.3, 0.7, muestra(CAPA.calle, q[0], q[1])), gr = ss(0.3, 0.7, muestra(CAPA.green, q[0], q[1]))
  const bk = ss(0.25, 0.7, muestra(CAPA.bunker, q[0], q[1])), te = ss(0.3, 0.7, muestra(CAPA.tee, q[0], q[1]))
  const fu = ss(0.3, 0.7, muestra(CAPA.afuera, q[0], q[1])), ar = muestra(CAPA.arbol, q[0], q[1])
  let h = fw * 0.12 + te * 0.5 + gr * (0.32 + muestra(CAPA.caida, q[0], q[1])) - bk * 1.15 + ar * 0.25
  h = lerp(h, -4.5, fu)
  if (est.swVivo) h += est.swVivo * 1.3 * Math.exp(-(((dist(q, est.swO) - est.swW) / 3.2) ** 2)) * (1 - fu)
  return h * armado(q)
}

// ── la grilla del motor: la cancha de la versión que viene, celda por celda (de a pedazos, para no trabar el cuadro) ──
export function* hornear() {
  if (!est.bumps.some((b) => b.hasta)) return FILAS
  const out = new Array(H)
  for (let y = 0; y < H; y++) {
    let fila = ''
    for (let x = 0; x < W; x++) fila += letraBase(inversa([x + 0.5, y + 0.5], true))
    out[y] = fila
    if (y % 20 === 19) yield y / H
  }
  return out
}
export const campoCon = (filas) => (filas === FILAS ? campoBase : { ...campoBase, cancha: { ...campoBase.cancha, filas } })

// ── las skins: cada versión cambia la paleta, el dibujo del pasto (patrón) y el tipo de árbol ──
// patrón: 0 rayas de corte · 1 diagonales · 2 cuadros · 3 pixelado · 4 ondas · 5 grilla
export const SKINS = {
  clasico: { nombre: 'Clásico', limpio: true, patron: 0, arbol: 'redondo', col: ['#3e6b1f', '#6f9636', '#a2bc43', '#b7cd4e', '#bcd558', '#cbe066', '#f4e6c4', '#3f7029', '#0c2b1c', '#11372a', '#5d432c'], verdes: ['#2c5a1d', '#3a6b24', '#4b7d2c', '#24491a', '#5a8a33', '#33621f'] },
  pinar: { nombre: 'Pinar', limpio: true, patron: 1, arbol: 'pino', col: ['#2f5a2a', '#4f7a3a', '#8fb04a', '#a3c25a', '#a9cf5c', '#bbdc6c', '#efe4c8', '#2f6125', '#0a2418', '#0f3022', '#4a3624'], verdes: ['#1d4a2a', '#245734', '#2e6a3e', '#173d24', '#356f45'] },
  otono: { nombre: 'Otoño', limpio: true, patron: 2, arbol: 'redondo', col: ['#6b6a24', '#94883a', '#b7b752', '#c9c662', '#bfd060', '#cddc6e', '#f3e3c0', '#5d6b28', '#2a1d0e', '#352512', '#6a4a2c'], verdes: ['#c2581f', '#d9822b', '#a63d1c', '#e3a93a', '#8a2f1a', '#cf6a25'] },
  desierto: { nombre: 'Desierto', limpio: true, patron: 4, arbol: 'cactus', col: ['#c99e5a', '#dbb676', '#9fb04e', '#b0c05e', '#8fc254', '#a1d066', '#f6ead0', '#7a8a3a', '#3a2412', '#47301a', '#8a5a30'], verdes: ['#3f7a3a', '#4d8a44', '#356b32', '#5a9a50'] },
  oscuro: { nombre: 'Modo oscuro', limpio: false, patron: 5, arbol: 'cristal', col: ['#170a2e', '#2a1250', '#0e5f6a', '#14808f', '#1fd6c9', '#3ff0e0', '#ff4fd8', '#3a1a6e', '#05020c', '#0b0518', '#2a0f45'], verdes: ['#ff3fd2', '#b84dff', '#3fe0ff', '#ff7ae6', '#7a5cff'] },
  pastel: { nombre: 'Pastel', limpio: false, patron: 3, arbol: 'chupetin', col: ['#f2b8cf', '#f7cfe0', '#b9eedf', '#cdf5ea', '#c7f29a', '#d6f8b0', '#fff3c4', '#d3b8f0', '#5a3f6e', '#674a7d', '#a77cb8'], verdes: ['#c99cf2', '#9fd3f7', '#f7a8c8', '#ffd59a', '#a8f0c8'] },
  wireframe: { nombre: 'Wireframe', limpio: false, patron: 5, arbol: 'cubo', col: ['#c9ced4', '#d8dde2', '#e9edf1', '#f2f5f7', '#bdf0cf', '#ccf5da', '#ffffff', '#b4bcc6', '#3a4048', '#444b54', '#7a828c'], verdes: ['#9aa3ad', '#b1b9c2', '#8a939d', '#c2c9d0'] },
  invertido: { nombre: 'Colores invertidos', limpio: false, patron: 1, arbol: 'pino', col: ['#c4a2e0', '#d8bdf0', '#5d3a9e', '#6f48b2', '#432a7a', '#52358e', '#0b1a3b', '#c08fdb', '#f3d4e3', '#f8e2ec', '#a27fc0'], verdes: ['#d3a5ff', '#a5d8ff', '#ffd3a5', '#a5ffd3'] },
}
export const TIPOS_ARBOL = ['redondo', 'pino', 'cubo', 'chupetin', 'cristal', 'cactus']
