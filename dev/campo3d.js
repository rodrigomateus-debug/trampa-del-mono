// 🥃 La cancha de Rorro, sin three (lo usan cancha3d.js y las pruebas): el mapa del juego en capas, el relieve de los
// greens (sale de las caídas del motor: la pelota rueda para donde baja), la deformación de cada versión (la misma
// cuenta que el shader) y la grilla del motor, que se hornea en cada versión: la física juega en la cancha que se ve.
import * as M from './motor.js'

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
export function muestra(a, x, y) {
  const fx = clamp(x - 0.5, 0, W - 1), fy = clamp(y - 0.5, 0, H - 1)
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(W - 1, x0 + 1), y1 = Math.min(H - 1, y0 + 1)
  const tx = fx - x0, ty = fy - y0
  return lerp(lerp(a[y0 * W + x0], a[y0 * W + x1], tx), lerp(a[y1 * W + x0], a[y1 * W + x1], tx), ty)
}

/**
 * El relieve de los greens, hecho con las caídas del juego: en cada celda del green la pendiente es la caída del motor
 * (`caidaEn`, para donde rueda la pelota) por `RELIEVE.k`; como las zonas se mezclan, no es exacta, así que se busca la
 * altura que mejor la cumple (Poisson, por Gauss-Seidel). Así lo que se ve (para dónde baja) y las flechitas dicen lo
 * mismo que hace la pelota. El green queda un poco arriba (`plato`) y baja suave hasta la cancha en `falda` yardas,
 * con el collar (el pasto un poco más largo que lo rodea) en las primeras `collar`.
 */
export const RELIEVE = { k: 0.045, plato: 0.16, falda: 8, collar: 2, vueltas: 260 }
/** La caída del motor en cada celda de los greens (x, y por celda; 0 afuera): para la grilla del green en el putt. */
export const CAIDA_GREEN = new Float32Array(N * 2)
function relieveGreens() {
  const z = new Float32Array(N).fill(NaN)
  const R = RELIEVE
  for (const h of M.HOYOS) {
    // el green de este hoyo: las 'g' conectadas al pin
    const i0 = Math.floor(h.pin[1]) * W + Math.floor(h.pin[0])
    const celdas = [], visto = new Set([i0])
    const cola = [i0]
    while (cola.length) {
      const i = cola.pop()
      if (FILAS[Math.floor(i / W)][i % W] !== 'g') continue
      celdas.push(i)
      const x = i % W, y = Math.floor(i / W)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, j = ny * W + nx
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || visto.has(j) || Math.hypot(nx - h.pin[0], ny - h.pin[1]) > 45) continue
        visto.add(j); cola.push(j)
      }
    }
    const v = new Map(celdas.map((i) => [i, M.caidaEn(h, [(i % W) + 0.5, Math.floor(i / W) + 0.5])]))
    for (const [i, c] of v) { CAIDA_GREEN[i * 2] = c[0]; CAIDA_GREEN[i * 2 + 1] = c[1] }
    for (const i of celdas) z[i] = 0
    for (let it = 0; it < R.vueltas; it++) {
      for (const i of celdas) {
        const x = i % W, y = Math.floor(i / W), vi = v.get(i)
        let s = 0, n = 0
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const j = (y + dy) * W + (x + dx), vj = v.get(j)
          if (!vj) continue
          // baja para donde rueda: z_j = z_i − k · (caída media) · (paso)
          s += z[j] + R.k * ((vi[0] + vj[0]) / 2 * dx + (vi[1] + vj[1]) / 2 * dy)
          n++
        }
        if (n) z[i] += 1.85 * (s / n - z[i]) // sobre-relajado: converge mucho más rápido
      }
    }
    let min = Infinity
    for (const i of celdas) min = Math.min(min, z[i])
    for (const i of celdas) z[i] = z[i] - min + R.plato
  }
  // afuera del green: la falda (el valor del green más cercano, que se apaga con la distancia)
  const d = new Float32Array(N).fill(Infinity), val = new Float32Array(N)
  let borde = []
  for (let i = 0; i < N; i++) if (!Number.isNaN(z[i])) { d[i] = 0; val[i] = z[i]; borde.push(i) }
  for (let paso = 1; paso <= R.falda + 1 && borde.length; paso++) {
    const nuevo = []
    for (const i of borde) {
      const x = i % W, y = Math.floor(i / W)
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy
        if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= W || ny >= H) continue
        const j = ny * W + nx, dd = d[i] + (dx && dy ? 1.414 : 1)
        if (dd < d[j]) { if (d[j] === Infinity) nuevo.push(j); d[j] = dd; val[j] = val[i] }
      }
    }
    borde = nuevo
  }
  const relieve = new Float32Array(N), collar = new Float32Array(N), cerca = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    if (d[i] === Infinity) { cerca[i] = 99; continue }
    cerca[i] = d[i]
    relieve[i] = d[i] === 0 ? val[i] : val[i] * (1 - ss(0, R.falda, d[i]))
    collar[i] = d[i] > 0 && d[i] <= R.collar ? 1 : 0
  }
  return { relieve, collar, cerca }
}
const RG = relieveGreens()
/**
 * Los cajones de salida, como en el juego de siempre (`cajonTee`): de la marca azul a la amarilla, 8 yd más largo y 9 de
 * ancho, sumados a los tees del dibujo. Las amarillas (las de Rorro, por su handicap) quedaban afuera del tee dibujado
 * y salía del rough.
 */
export const CAJON_TEE = { largo: 8, ancho: 9 }
function cajonesTee() {
  const a = capa('e')
  for (const h of M.HOYOS) {
    const A = h.tees.azul, B = h.tees.amarilla, l = Math.hypot(B[0] - A[0], B[1] - A[1])
    const u = [(B[0] - A[0]) / l, (B[1] - A[1]) / l], c = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2]
    const L = (l + CAJON_TEE.largo) / 2, An = CAJON_TEE.ancho / 2, R = Math.ceil(L + An)
    for (let y = Math.max(0, Math.floor(c[1] - R)); y < Math.min(H, c[1] + R); y++) for (let x = Math.max(0, Math.floor(c[0] - R)); x < Math.min(W, c[0] + R); x++) {
      const dx = x + 0.5 - c[0], dy = y + 0.5 - c[1]
      if (Math.abs(dx * u[0] + dy * u[1]) <= L && Math.abs(-dx * u[1] + dy * u[0]) <= An) a[y * W + x] = 1
    }
  }
  return a
}
export const CAPA = {
  calle: suavizar(capa('f')), green: suavizar(capa('g'), 1), bunker: suavizar(capa('b')), tee: suavizar(cajonesTee()),
  afuera: suavizar(capa('x')), arbol: suavizar(capa('t'), 3),
  relieve: suavizar(RG.relieve, 2), collar: suavizar(RG.collar, 1),
  // la cancha no se mueve en los greens ni cerca (de 5 a 12 yardas del borde, se va soltando): el putt es el putt
  quieta: suavizar(RG.cerca.map((c) => ss(5, 12, c)), 1),
}

// ── la deformación ──
// Componentes (`bumps`), cada uno con su amplitud de antes (`desde`) y la de la versión nueva (`hasta`):
// tipo 0: un bulto que corre lo que está cerca (centro, radio, vector); tipo 1: un bulto que infla (o achica si es
// negativo); tipo 2: una onda que cruza toda la cancha (vector de onda en cx, cy; fase en r; amplitud en vx, vy).
// Los greens (y alrededor) no se mueven nunca. Más la respiración (solo se ve; quieta donde está la pelota).
export const NB = 36
export const est = {
  bumps: [],
  bola: [0, 0], // la pelota, en la cancha base (ahí no respira)
  swO: [0, 0], swSentido: 1, swW: 1e5, swBanda: 22, swVivo: 0, rebobina: 0, // la onda de la versión (un círculo)
  t: 0, resp: 0.1,
  armaO: [W / 2, H + 30], armaD: [0, -1], armaW: H + 200, armaBanda: 26, // la cancha se arma (de abajo para arriba)
}
export const avance = (q) => { const d = dist(q, est.swO); return clamp((est.swSentido > 0 ? est.swW - d : d - est.swW) / est.swBanda, 0, 1) }
export const armado = (q) => clamp((est.armaW - ((q[0] - est.armaO[0]) * est.armaD[0] + (q[1] - est.armaO[1]) * est.armaD[1])) / est.armaBanda, 0, 1)
/** El desplazamiento en q. `final`: el de la versión que viene, sin respiración (para la grilla del motor). */
export function desplazo(q, final = false, respira = true) {
  // en los greens (y cerca) no se mueve nada: ni se calcula
  const qq = muestra(CAPA.quieta, q[0], q[1])
  if (qq < 1e-4 || (!est.bumps.length && (final || !respira || !est.resp))) return [0, 0]
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
  if (!final && respira && est.resp) {
    const t = est.t, r = est.resp * ss(3, 9, dist(q, est.bola))
    dx += r * (Math.sin(q[1] * 0.061 + t * 0.9) + 0.5 * Math.sin(q[0] * 0.11 - t * 1.3))
    dy += r * (Math.cos(q[0] * 0.07 + t * 0.7) + 0.5 * Math.cos(q[1] * 0.09 + t * 1.1))
  }
  return [dx * qq, dy * qq]
}
export const adelante = (q, final = false) => { const d = desplazo(q, final); return [q[0] + d[0], q[1] + d[1]] }
/** Como `adelante`, sin la respiración (los árboles: así no hay que moverlos en cada cuadro). */
export const adelanteQuieto = (q) => { const d = desplazo(q, false, false); return [q[0] + d[0], q[1] + d[1]] }
export function inversa(p, final = false) { let q = p; for (let i = 0; i < 4; i++) { const d = desplazo(q, final); q = [p[0] - d[0], p[1] - d[1]] } return q }
/** La altura de la cancha armada y quieta en q (sin la ola de la versión): para las normales del terreno. */
export function alturaBase(q) {
  const fw = ss(0.3, 0.7, muestra(CAPA.calle, q[0], q[1])), te = ss(0.3, 0.7, muestra(CAPA.tee, q[0], q[1]))
  const bk = ss(0.25, 0.7, muestra(CAPA.bunker, q[0], q[1]))
  const fu = ss(0.3, 0.7, muestra(CAPA.afuera, q[0], q[1])), ar = muestra(CAPA.arbol, q[0], q[1])
  return lerp(fw * 0.1 + te * 0.35 + muestra(CAPA.relieve, q[0], q[1]) - bk * 0.9 + ar * 0.2, -4.5, fu)
}
/** La altura del terreno en q (yardas), como el shader (con la ola de la versión y la cancha que se arma). */
export function alturaEn(q) {
  const fw = ss(0.3, 0.7, muestra(CAPA.calle, q[0], q[1])), te = ss(0.3, 0.7, muestra(CAPA.tee, q[0], q[1]))
  const bk = ss(0.25, 0.7, muestra(CAPA.bunker, q[0], q[1]))
  const fu = ss(0.3, 0.7, muestra(CAPA.afuera, q[0], q[1])), ar = muestra(CAPA.arbol, q[0], q[1])
  let h = fw * 0.1 + te * 0.35 + muestra(CAPA.relieve, q[0], q[1]) - bk * 0.9 + ar * 0.2
  h = lerp(h, -4.5, fu)
  if (est.swVivo) h += est.swVivo * 0.9 * Math.exp(-(((dist(q, est.swO) - est.swW) / 3.2) ** 2)) * (1 - fu)
  return h * armado(q)
}

// ── la grilla del motor: la cancha de la versión que viene, celda por celda (de a pedazos, para no trabar el cuadro) ──
export function* hornear(ms = 2.5) {
  if (!est.bumps.some((b) => b.hasta)) return FILAS
  const out = new Array(H)
  const ahora = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
  let t0 = ahora()
  for (let y = 0; y < H; y++) {
    let fila = ''
    for (let x = 0; x < W; x++) fila += letraBase(inversa([x + 0.5, y + 0.5], true))
    out[y] = fila
    // de a poquito: unos milisegundos por cuadro (si no, el vuelo se traba)
    if (ahora() - t0 > ms) { yield y / H; t0 = ahora() }
  }
  return out
}
export const campoCon = (filas) => (filas === FILAS ? campoBase : { ...campoBase, cancha: { ...campoBase.cancha, filas } })

// ── las skins: cada versión cambia la paleta, el dibujo del pasto (patrón) y el tipo de árbol ──
// col: rough (2), calle (2), green (2), bunker, tee, afuera (2), tierra. patrón: 0 franjas de corte · 1 diagonales ·
// 2 cuadros · 3 pixelado · 4 ondas · 5 grilla
export const SKINS = {
  clasico: { nombre: 'Clásico', limpio: true, patron: 0, arbol: 'redondo', col: ['#3f6b25', '#4f7d2d', '#8fb444', '#a3c652', '#5f9e3d', '#71b04a', '#efe2bf', '#6a9a3b', '#0c2b1c', '#11372a', '#5d432c'], verdes: ['#2c5a1d', '#3a6b24', '#4b7d2c', '#24491a', '#5a8a33', '#33621f'] },
  pinar: { nombre: 'Pinar', limpio: true, patron: 1, arbol: 'pino', col: ['#2f5a2a', '#3f6d33', '#7fa548', '#93b858', '#4f9548', '#5fa656', '#efe4c8', '#5c8f45', '#0a2418', '#0f3022', '#4a3624'], verdes: ['#1d4a2a', '#245734', '#2e6a3e', '#173d24', '#356f45'] },
  otono: { nombre: 'Otoño', limpio: true, patron: 2, arbol: 'redondo', col: ['#6b6a24', '#7d7a2e', '#b2b552', '#c4c562', '#6fa046', '#80b052', '#f3e3c0', '#8a9a3e', '#2a1d0e', '#352512', '#6a4a2c'], verdes: ['#c2581f', '#d9822b', '#a63d1c', '#e3a93a', '#8a2f1a', '#cf6a25'] },
  desierto: { nombre: 'Desierto', limpio: true, patron: 4, arbol: 'cactus', col: ['#c99e5a', '#d7ae6e', '#9fb04e', '#b0c05e', '#6faa4c', '#7fbb58', '#f6ead0', '#9aa84a', '#3a2412', '#47301a', '#8a5a30'], verdes: ['#3f7a3a', '#4d8a44', '#356b32', '#5a9a50'] },
  oscuro: { nombre: 'Modo oscuro', limpio: false, patron: 5, arbol: 'cristal', col: ['#170a2e', '#22104a', '#0e5f6a', '#14808f', '#1fd6c9', '#3ff0e0', '#ff4fd8', '#3a1a6e', '#05020c', '#0b0518', '#2a0f45'], verdes: ['#ff3fd2', '#b84dff', '#3fe0ff', '#ff7ae6', '#7a5cff'] },
  pastel: { nombre: 'Pastel', limpio: false, patron: 3, arbol: 'chupetin', col: ['#f2b8cf', '#f5c6da', '#b9eedf', '#cdf5ea', '#a7e889', '#bdf2a4', '#fff3c4', '#d3b8f0', '#5a3f6e', '#674a7d', '#a77cb8'], verdes: ['#c99cf2', '#9fd3f7', '#f7a8c8', '#ffd59a', '#a8f0c8'] },
  wireframe: { nombre: 'Wireframe', limpio: false, patron: 5, arbol: 'cubo', col: ['#c9ced4', '#d3d8dd', '#e9edf1', '#f2f5f7', '#bdf0cf', '#ccf5da', '#ffffff', '#b4bcc6', '#3a4048', '#444b54', '#7a828c'], verdes: ['#9aa3ad', '#b1b9c2', '#8a939d', '#c2c9d0'] },
  invertido: { nombre: 'Colores invertidos', limpio: false, patron: 1, arbol: 'pino', col: ['#c4a2e0', '#d0b2ea', '#5d3a9e', '#6f48b2', '#432a7a', '#52358e', '#0b1a3b', '#c08fdb', '#f3d4e3', '#f8e2ec', '#a27fc0'], verdes: ['#d3a5ff', '#a5d8ff', '#ffd3a5', '#a5ffd3'] },
}
export const TIPOS_ARBOL = ['redondo', 'pino', 'cubo', 'chupetin', 'cristal', 'cactus']
