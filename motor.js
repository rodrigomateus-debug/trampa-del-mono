// La Trampa del Mono (SDGA) — motor puro: sin DOM, el azar entra siempre por `rng`.
// Unidades: yardas. x crece a la derecha, y hacia abajo (como el mapa). Ángulos en radianes (atan2).
// La cancha es el dibujo cancha.webp: su terreno, yarda por yarda, está en cancha-grid.js.
import { CANCHA } from './cancha-grid.js'

export const MUNDO = { w: CANCHA.ancho, h: CANCHA.alto }
export const MAX_GOLPES = 10 // al décimo golpe sin embocar: LP automático
export const CHANCE_MONO_BUENO = 0.08
export const NETO_SIN_FIRMA = 110
export const SEGUNDOS_FIRMA = 10

// Las perillas de la dificultad viven acá (calibradas con un bot que apunta perfecto).
export const FISICA = {
  carryMax: 235, // driver a fondo desde el fairway
  distPuttMax: 32,
  alturaPino: 9, // debajo de esta altura la pelota choca los pinos (el arco del tiro pasa por arriba)
  radioHoyo: 0.22, // el centro del hoyo
  bocaHoyo: 0.66, // el hoyo como se dibuja (3× el centro): la pelota que pasa por acá siempre reacciona
  velEmbocar: 2, // por el borde de la boca entra hasta 0,7× esto (1,4 yd/s). Más rápido: corbata o labio
  medioHoyo: 0.3, // "por el medio": a menos de esto del centro no hay corbata, entra de una
  velMedio: 3.8, // por el medio entra hasta esto (la que se pasaría ~3 yd). Más fuerte: salta por arriba
  vientoMax: 30, // km/h
  vientoYd: 1, // yardas de deriva por km/h en un tiro de carryMax
  factorLie: { tee: 1, fairway: 1, green: 1, rough: 0.7, bunker: 0.5, bosque: 0.5, afuera: 1 },
  roce: { tee: 9, fairway: 9, green: 2.2, rough: 26, bunker: 70, bosque: 45, afuera: 9 },
  pique: { tee: 1, fairway: 1, green: 0.5, rough: 0.5, bunker: 0.05, bosque: 0.2, afuera: 1 },
  // error humano (desvío estándar): ángulo en grados, carry en fracción
  error: {
    angBase: 2, angPotencia: 3.5, angRough: 2, angBunker: 3.5, angFondo: 6,
    carryBase: 0.045, carryRough: 0.05, carryBunker: 0.07, carryFondo: 0.04,
    puttDist: 0.07, puttAng: 0.025,
  },
}

// La corbata: la pelota que pasa por la boca del hoyo un poco pasada da la vuelta alrededor del hoyo
// (más vuelta cuanto más al centro), se frena y sale cortita para cualquier lado; si venía justa, entra.
// max = más rápido que esto salta por arriba (labio); radio = por dónde gira; freno = cuánto pierde por segundo;
// salida = velocidad mínima con la que sale (para que no quede adentro de la boca); entra = margen sobre el límite;
// muerta = si en la vuelta se frena por debajo de esto, se cae adentro.
export const VUELTA = { max: 5, radio: 0.6, freno: 0.6, salida: 1.7, entra: 0.5, muerta: 0.5 }
// Desde afuera del green (tiros completos) un tiro perfecto tiene que poder entrar, aunque llegue más
// rápido que un putt: si CAE en la boca, entra con probabilidad `clavada` (más cerca del centro, más);
// si llega rodando, hasta `max` yd/s tiene chance (más centrada y más lenta, más chance, hasta `prob`).
// La suerte de cada tiro sale del tiro mismo (suerteDe): determinista, sin tocar el rng.
export const CHIP = { clavada: 0.8, max: 10, prob: 0.7 }
/** Un número 0–1 propio de cada tiro (de dónde sale y adónde va): la "suerte" del chip in. */
export function suerteDe(tiro) {
  const x = Math.sin(tiro.desde[0] * 12.9898 + tiro.desde[1] * 78.233 + tiro.carryVec[0] * 37.719 + tiro.carryVec[1] * 4.581) * 43758.5453
  return x - Math.floor(x)
}
/** La chance de entrar de un tiro completo que cae a d yardas del centro del hoyo. */
export function chanceClavada(d) {
  if (d >= FISICA.bocaHoyo) return 0
  if (d <= FISICA.radioHoyo) return CHIP.clavada
  return CHIP.clavada * 0.6 * (1 - (d - FISICA.radioHoyo) / (FISICA.bocaHoyo - FISICA.radioHoyo))
}
/** La chance de entrar de un tiro completo que pasa RODANDO a d yardas del centro a v yd/s (más rápido que un putt). */
export function chanceRodando(d, v) {
  const lim = limiteEmbocar(d)
  if (v >= CHIP.max || d >= FISICA.bocaHoyo) return 0
  return CHIP.prob * (1 - d / FISICA.bocaHoyo) * (1 - Math.max(0, v - lim) / (CHIP.max - lim))
}

/**
 * Hasta qué velocidad entra la pelota que pasa a d yardas del centro del hoyo: por el medio (hasta
 * `medioHoyo`) todo lo que no venga muy pasado (`velMedio`); de ahí al borde de la boca baja hasta 0,7 × velEmbocar.
 */
export function limiteEmbocar(d) {
  if (d <= FISICA.medioHoyo) return FISICA.velMedio
  const t = Math.min(1, (d - FISICA.medioHoyo) / (FISICA.bocaHoyo - FISICA.medioHoyo))
  return FISICA.velMedio + (FISICA.velEmbocar * 0.7 - FISICA.velMedio) * t
}

// Monos que cruzan de pinos a pinos: si la pelota (baja) les pega, se la llevan.
// Cuando la pelota se frena cerca (alerta), salen a buscarla: si llegan antes de que pegues, es LP.
// minimo = segundos que siempre tenés para pegar: el que está muy cerca se acerca despacio, al acecho.
export const MONO = { vel: 18, pausa: 3, radio: 3.2, altura: 8, velCaza: 12, alerta: 60, reaccion: 1, minimo: 3 }

// ── habilidades por jugador (por apodo, como en la app) ──
export const HABILIDADES = {
  'El Mago Rodal': { id: 'comba', adulado: true, nombre: 'Golpes de mago', texto: 'Nunca derecho: cada golpe le toca uno de 5 efectos (mirá cuál antes de pegar). El putt siempre lleva comba.' },
  'Mike Queboni (Đ)': { id: 'bomba', nombre: 'Drive al green', texto: 'A fondo desde el tee el óvalo late: soltá cuando está más chico y llega al green.' },
  'El Sueco': { id: 'derecho', nombre: 'Siempre derecho', texto: 'Mati no la tuerce nunca: todo sale derecho, hasta el putt.' },
  'Fito (Đ)': { id: 'aguila', nombre: 'Chip in', texto: 'Drive y hierros con el pulso a mil: soltá en el embudo y sale derecha. Cerca del green, imán: si la chipeás al green, entra.' },
  // del chat del SDGA:
  Lechu: { id: 'dadas', nombre: 'Contando todas las dadas', texto: 'Joaco no falla los putts de 3 metros o menos: le pegues como le pegues, entra.' },
  'El Ninja (Đ)': { id: 'tradicion', nombre: 'La tradición', texto: 'Un LP por vuelta no te hace perder: levantás, +1 y dropeás en el fairway. El segundo, sí.' },
  'El Perro': { id: 'perro', nombre: 'Va a buscarla', texto: 'Los greens están habilitados (sin caída) y si va al bosque el perro te la trae al fairway sin multa. Tarda: el reloj corre.' },
  Mugre: { id: 'panchitos', nombre: 'Tirar panchos', texto: 'A la Mugre los monos la huelen de lejos y vienen más. Pero tiene 3 panchos por hoyo: se los tirás, van, comen un segundo y vuelven.' },
  Liberty: { id: 'approach', nombre: 'Si no era por el approach', texto: 'El drive sale derecho siempre. Los approach (de 30 a 100 yd del hoyo) tienen el triple de error.' },
  LG: { id: 'calma', nombre: 'El que se enoja pierde', texto: 'Después de un mal tiro no se enoja: el próximo sale sin error.' },
}
export const habilidadDe = (jugador) => HABILIDADES[jugador?.apodo] ?? null

// ── nivel de dificultad = handicap del jugador elegido ──
// Más handicap: más error (tiro y putt) y un poco menos de distancia. HCP 7 ≈ el juego base.
export const HCP_SIN_CARGAR = 18
export const NIVELES = ['Paseo', 'Normal', 'Difícil', 'Muy difícil', 'Trampa total'] // hasta HCP 5, 10, 15, 20, más
export function dificultad(hcp) {
  const h = hcp ?? HCP_SIN_CARGAR
  const nivel = h < 5 ? 1 : h < 10 ? 2 : h < 15 ? 3 : h < 20 ? 4 : 5
  return { hcp: h, cargado: hcp != null, error: 0.75 + h * 0.035, distancia: (DRIVE.max - DRIVE.porHcp * h) / DRIVE.max, nivel, nombre: NIVELES[nivel - 1] }
}
/**
 * La dificultad medida (promedio vs. par del bot de calibrar.mjs) en los mismos 5 niveles. `nivel` la fija a mano
 * (Fito: el bot acierta el embudo la mitad de las veces, la gente casi nunca → Trampa total).
 */
export function dificultadReal(prom, nivel = null) {
  nivel ??= prom < 1.5 ? 1 : prom < 2.5 ? 2 : prom < 3.3 ? 3 : prom < 4 ? 4 : 5
  return { nivel, nombre: NIVELES[nivel - 1], prom }
}
// la comba de Rodal: cuánto se cierra la curva (grados entre la salida y dónde cae) y qué parte del error lateral le queda
export const COMBA = { angulo: 30, error: 0.5 }
// Los golpes del Mago: nunca derecho. A cada golpe (menos el putt) le toca uno al azar, y se ve antes de pegar.
// curva = grados entre la salida y dónde cae; lado = para dónde se cierra ('bandera', 'izq' o 'der');
// carry, alto y rueda = veces lo normal; rasante = vuela bajo, así que choca pinos y monos.
export const GOLPES_MAGO = [
  { id: 'comba', emoji: '🪄', nombre: 'Comba de mago', texto: 'Se cierra 30° hacia la bandera: apuntá afuera', curva: COMBA.angulo, lado: 'bandera', carry: 1, alto: 1, rueda: 1 },
  { id: 'gancho', emoji: '↩️', nombre: 'Gancho', texto: 'Dobla 45° a la izquierda: apuntá a la derecha', curva: 45, lado: 'izq', carry: 1, alto: 1, rueda: 1 },
  { id: 'slice', emoji: '↪️', nombre: 'Slice', texto: 'Dobla 45° a la derecha: apuntá a la izquierda', curva: 45, lado: 'der', carry: 1, alto: 1, rueda: 1 },
  { id: 'globo', emoji: '🎈', nombre: 'Globo', texto: 'Altísimo, vuela menos y se clava donde cae', curva: 15, lado: 'bandera', carry: 0.8, alto: 2.5, rueda: 0.1 },
  { id: 'vibora', emoji: '🐍', nombre: 'Viborita', texto: 'Rasante: vuela poco, rueda una banda y no pasa los pinos', curva: 20, lado: 'bandera', carry: 0.6, alto: 0.3, rueda: 2.5, rasante: true },
]
// el putt del Mago siempre dobla hacia el hoyo: giro = radianes por segundo que gira mientras rueda
export const PUTT_MAGO = { giro: 0.3 }
// la bomba de Miguelón: desde el tee su driver llega a `carry` yardas reales (con el rodaje, el green del 15 desde las
// azules); pasando `zona` yardas el óvalo late (periodo, en segundos) y es perfecta si suelta con precisión >= perfecta
export const BOMBA = { carry: 365, zona: 285, perfecta: 0.93, periodo: 0.9, angPerfecta: 1, angBase: 3, angMala: 14 }
// el Águila (Fito): la línea de tiro se sacude ±amplitud grados cada `periodo` s; si suelta con el desvío dentro de
// ±ventana (el embudo) sale derecha. A `chip` yardas o menos del hoyo, si cae en el green el imán la mete.
// (`alLado`: dónde la dejaría un imán que no la mete; hoy siempre la mete.)
// Mati (El Sueco): sin error de dirección (pega lo que pega su handicap)
export const AGUILA = { amplitud: 25, periodo: 0.7, ventana: 5, chip: 40, alLado: 0.85, metida: 4 }
// Lechu (Joaco): el putt desde DADA yardas o menos (3 metros) entra siempre, le pegue como le pegue. El Perro: tarda `segundos` en traerla. Liberty: approach entre `desde` y `hasta` yd, error x`error`.
export const DADA = 3.28 // 3 metros
export const PERRO = { segundos: 4 }
// Mugre: los monos lo huelen desde `alerta` yd; `panchos` por hoyo; los tira a `tiro` yd (para el lado de los monos) y comen `comer` s
export const MUGRE = { alerta: 90, panchos: 3, tiro: 26, comer: 1 }
export const APPROACH = { desde: 30, hasta: 100, error: 3 }

// Los tres hoyos del dibujo (posiciones en yardas = píxeles / 4): 15 sube, 16 baja, 17 sube.
// tee = la marca blanca (en el 17, la roja); calle = eje del fairway; monos = de árboles a árboles.
export const HOYOS = [
  {
    n: 15,
    par: 4,
    tee: [56.9, 397.8],
    azul: [57.5, 404.8], // la marca azul del dibujo
    yardas: { negra: 412, azul: 392, blanca: 376, amarilla: 360 },
    pin: [35.4, 46.3],
    verso: 'Pero al llegar al quince, cambia la situación.',
    calle: [[58, 278], [50, 237.5], [47.5, 186], [46.3, 135], [43.8, 80]],
    caida: [0.55, -0.35],
    monos: [{ a: [26.5, 200.5], b: [72.5, 195.5], fase: 0 }, { a: [22.5, 106.5], b: [62.5, 117.5], fase: 11 }],
  },
  {
    n: 16,
    par: 4,
    tee: [71.9, 46.3],
    azul: [67.8, 30.5], // el 16 no tiene marca azul: la del fondo del tee (la roja del dibujo)
    yardas: { negra: 435, azul: 415, blanca: 395, amarilla: 380 },
    pin: [104.6, 393],
    verso: 'El dieciséis no es más fácil, te desafía sin piedad.',
    calle: [[105, 172.5], [105.5, 222.5], [106.3, 275], [104.5, 325], [103.8, 347.5]],
    caida: [-0.5, 0.45],
    monos: [{ a: [75.5, 225.5], b: [130.5, 220.5], fase: 4 }, { a: [77.5, 315.5], b: [128.5, 323.5], fase: 15 }],
  },
  {
    n: 17,
    par: 3,
    tee: [149.3, 322.9],
    azul: [151.2, 356.4],
    yardas: { negra: 223, azul: 208, blanca: 188, amarilla: 170 },
    pin: [150.2, 78.6],
    verso: 'El diecisiete llega, pensás que vas a escapar…',
    calle: [[148.8, 265], [151.3, 212.5], [155, 162.5], [156.3, 120]],
    caida: [0.45, 0.55],
    monos: [{ a: [124.5, 174.5], b: [180.5, 172.5], fase: 7 }, { a: [129.5, 271.5], b: [174.5, 264.5], fase: 18 }],
  },
]
export const PAR_TOTAL = HOYOS.reduce((s, h) => s + h.par, 0)

// ── yardas reales ──
// El dibujo no respeta las distancias reales (el 17 está dibujado mucho más largo). Cada hoyo tiene su escala
// (yardas reales por yarda del dibujo), sacada del tee azul: desde el azul, la distancia al hoyo es la de la tarjeta.
// Los tees blanco y amarillo van sobre la línea azul → hoyo, a sus yardas de la tarjeta.
export const COLORES_TEE = { azul: 'AZULES', blanca: 'BLANCAS', amarilla: 'AMARILLAS' }
for (const h of HOYOS) {
  const d = Math.hypot(h.azul[0] - h.pin[0], h.azul[1] - h.pin[1])
  h.escala = h.yardas.azul / d
  const u = [(h.azul[0] - h.pin[0]) / d, (h.azul[1] - h.pin[1]) / d]
  const en = (yd) => [h.pin[0] + (u[0] * yd) / h.escala, h.pin[1] + (u[1] * yd) / h.escala]
  h.tees = { azul: [...h.azul], blanca: en(h.yardas.blanca), amarilla: en(h.yardas.amarilla) }
}
/** De qué tee sale según el handicap: hasta 5 de las azules, hasta 14 de las blancas, si no de las amarillas. */
export const colorTee = (jugador) => {
  const h = jugador?.hcp ?? HCP_SIN_CARGAR
  return h <= 5 ? 'azul' : h <= 14 ? 'blanca' : 'amarilla'
}
/** El tee de la ronda en el hoyo actual (o en `h`). */
export const teeDe = (r, h = HOYOS[r.idx]) => h.tees[r.tee ?? 'blanca']
/** Yardas reales de una distancia del dibujo, en el hoyo que se juega. */
export const aYardas = (r, d) => d * (HOYOS[Math.min(r.idx, HOYOS.length - 1)].escala)

// El drive (carry máximo, en yardas reales) según el handicap: ~273 con HCP 0 (con el rodaje, ~300) y ~241 con HCP 22
// (~265 con el rodaje; a fondo y con error, promedian 230–250).
export const DRIVE = { max: 273, porHcp: 1.45 }
export const carryDe = (hcp) => DRIVE.max - DRIVE.porHcp * (hcp ?? HCP_SIN_CARGAR)

// ── geometría ───────────────────────────────────────────────────────────
export function dentro(poly, [x, y]) {
  let ok = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ok = !ok
  }
  return ok
}
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
const difAng = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b))

function cercanoEnSegmento(p, a, b) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0
  return [a[0] + t * dx, a[1] + t * dy]
}

// ── azar ────────────────────────────────────────────────────────────────
export function rngDesde(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function gauss(rng) {
  let u = 0
  while (!u) u = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng())
}
export const elegir = (rng, lista) => lista[Math.floor(rng() * lista.length)]

// ── cancha ──────────────────────────────────────────────────────────────
// Letras de cancha-grid.js: x afuera · . rough · f fairway · g green · b bunker · t árboles · e tee
export function crearCampo() {
  return { hoyos: HOYOS, cancha: CANCHA }
}

/** La letra de la cancha en ese punto (fuera del dibujo es afuera). */
export function celda(campo, [x, y]) {
  const fila = campo.cancha.filas[Math.floor(y)]
  return (fila && fila[Math.floor(x)]) || 'x'
}

/** El árbol en ese punto (la yarda de árbol, como un círculo para rebotar), o null. */
export function pinoEn(campo, p) {
  if (celda(campo, p) !== 't') return null
  return { x: Math.floor(p[0]) + 0.5, y: Math.floor(p[1]) + 0.5, r: 0.72 }
}

const TIPOS = { x: 'afuera', g: 'green', b: 'bunker', e: 'tee', f: 'fairway', t: 'bosque', '.': 'rough' }

/** Qué hay debajo de la pelota. `hoyo` dice de qué hoyo es (para "jugando desde el 16"). */
export function terreno(campo, p) {
  const tipo = TIPOS[celda(campo, p)] ?? 'rough'
  if (tipo === 'afuera' || tipo === 'bosque') return { tipo, hoyo: null }
  if (tipo === 'green') return { tipo, hoyo: masCerca(campo, p, (h) => [h.pin]) }
  if (tipo === 'tee') return { tipo, hoyo: masCerca(campo, p, (h) => [h.tee]) }
  return { tipo, hoyo: masCerca(campo, p, (h) => [h.tee, ...h.calle, h.pin]) }
}

/** El hoyo cuyo recorrido (puntos unidos) queda más cerca. */
function masCerca(campo, p, puntos) {
  let mejor = null
  let dMejor = Infinity
  for (const h of campo.hoyos) {
    const ext = puntos(h)
    for (let i = 0; i < ext.length; i++) {
      const q = i < ext.length - 1 ? cercanoEnSegmento(p, ext[i], ext[i + 1]) : ext[i]
      const d = dist(q, p)
      if (d < dMejor) { dMejor = d; mejor = h.n }
    }
  }
  return mejor
}

export function vientoAleatorio(rng) {
  return { ang: rng() * 2 * Math.PI, kmh: Math.round(rng() * FISICA.vientoMax) }
}

// ── monos ───────────────────────────────────────────────────────────────
/** Los monos de los tres hoyos, cada uno arrancando en su lado de pinos (fase = cuánto espera al principio). */
export function crearMonos() {
  return HOYOS.flatMap((h) => h.monos.map((m) => ({ m, hoyo: h.n, pos: [...m.a], hacia: 'b', espera: m.fase % 6, modo: 'ronda', reaccion: 0 })))
}
/** Un mono está "en la cancha" (se lo puede golpear) cuando camina o caza; esperando en los pinos, no. */
export const monoActivo = (s) => s.modo === 'caza' || s.espera <= 0

function caminar(s, destino, vel, dt) {
  const d = dist(s.pos, destino)
  const paso = vel * dt
  if (d <= paso) {
    s.pos = [...destino]
    return true
  }
  s.pos = [s.pos[0] + ((destino[0] - s.pos[0]) / d) * paso, s.pos[1] + ((destino[1] - s.pos[1]) / d) * paso]
  return false
}

/** Mueve los monos. Con la pelota, los que cazan van hacia ella: devuelve el primero que llega (o null). */
export function moverMonos(monos, dt, pelota) {
  let llego = null
  for (const s of monos) {
    if (s.modo === 'caza') {
      if (s.pancho) {
        // la Mugre le tiró un pancho: va, se lo come y después vuelve a la pelota (más rápido)
        if (caminar(s, s.pancho, MONO.velCaza, dt)) {
          s.comiendo -= dt
          if (s.comiendo <= 0) { s.pancho = null; s.velCaza = MONO.velCaza }
        }
        continue
      }
      if (!pelota) continue
      if (s.reaccion > 0) { s.reaccion -= dt; continue }
      caminar(s, pelota, s.velCaza, dt)
      if (!llego && dist(s.pos, pelota) < MONO.radio * 0.8) llego = s
      continue
    }
    if (s.espera > 0) { s.espera -= dt; continue }
    if (caminar(s, s.m[s.hacia], MONO.vel, dt)) {
      s.espera = MONO.pausa
      s.hacia = s.hacia === 'a' ? 'b' : 'a'
    }
  }
  return llego
}
/** La pelota quedó quieta: los monos que están cerca salen a buscarla. Devuelve cuántos. */
export function despertarMonos(monos, pelota, alerta = MONO.alerta) {
  let n = 0
  for (const s of monos) {
    if (dist(s.pos, pelota) > alerta) continue
    if (s.modo !== 'caza') {
      s.modo = 'caza'
      s.reaccion = MONO.reaccion
      const falta = Math.max(0, dist(s.pos, pelota) - MONO.radio * 0.8)
      s.velCaza = Math.min(MONO.velCaza, falta / (MONO.minimo - MONO.reaccion))
    }
    n++
  }
  return n
}
/** Se pegó (o terminó el hoyo): los que cazaban vuelven a su recorrido. */
export function calmarMonos(monos) {
  for (const s of monos) if (s.modo === 'caza') { s.modo = 'ronda'; s.espera = 0; s.pancho = null }
}

/** La alerta de los monos para este jugador (a la Mugre la huelen de más lejos). */
export const alertaDe = (r) => (habilidadDe(r.jugador)?.id === 'panchitos' ? MUGRE.alerta : MONO.alerta)

/**
 * La Mugre tira un pancho: cae del lado de donde vienen los monos (más allá de ellos) y todos los que la están
 * cazando van a comerlo. Devuelve dónde cayó, o null si no quedan panchos o no viene ningún mono.
 */
export function tirarPancho(r) {
  const cazan = r.monos.filter((s) => s.modo === 'caza' && !s.pancho)
  if (!r.panchos || !cazan.length) return null
  let dx = 0, dy = 0, lejos = 0
  for (const s of cazan) {
    const d = dist(s.pos, r.pelota) || 1
    dx += (s.pos[0] - r.pelota[0]) / d
    dy += (s.pos[1] - r.pelota[1]) / d
    lejos = Math.max(lejos, d)
  }
  const n = Math.hypot(dx, dy) || 1
  const a = Math.max(MUGRE.tiro, lejos + 10)
  const pos = [r.pelota[0] + (dx / n) * a, r.pelota[1] + (dy / n) * a]
  for (const s of cazan) { s.pancho = [...pos]; s.comiendo = MUGRE.comer; s.reaccion = 0 }
  r.panchos -= 1
  return pos
}

// ── tiro ────────────────────────────────────────────────────────────────
/** Desvío estándar del tiro (lo que dibuja la zona de pique). */
export function dispersion(lie, potencia) {
  const e = FISICA.error
  const fondo = potencia >= 0.97
  const grados = e.angBase + e.angPotencia * potencia * potencia + (lie === 'rough' ? e.angRough : 0) + (lie === 'bunker' ? e.angBunker : 0) + (fondo ? e.angFondo : 0)
  const carry = e.carryBase + (lie === 'rough' ? e.carryRough : 0) + (lie === 'bunker' ? e.carryBunker : 0) + (fondo ? e.carryFondo : 0)
  return { ang: (grados * Math.PI) / 180, carry, fondo }
}

function planBase(angulo, potencia, lie) {
  return { putt: false, cuerda: angulo, carry: potencia * FISICA.carryMax * (FISICA.factorLie[lie] ?? 1), disp: dispersion(lie, potencia), control: null }
}

/**
 * Lo que ve el jugador al apuntar (sin error ni viento): dónde pica, la curva si la hay y la zona de pique.
 * Acá entran las habilidades: la comba de Rodal y la bomba de Miguelón (`precision` 0..1, del latido del óvalo).
 */
export function planTiro(campo, r, angulo, potencia, precision = 0, tiempo = 0) {
  potencia = Math.max(0, Math.min(1, potencia))
  const b = r.pelota
  const dif = dificultad(r.jugador?.hcp)
  const hab = habilidadDe(r.jugador)
  if (enModoPutt(campo, r)) {
    const carry = potencia * FISICA.distPuttMax
    // el putt del Mago dobla hacia el hoyo: apuntando a la derecha del hoyo gira a la izquierda, y al revés
    const pin = hoyoActual(r).pin
    const giro = hab?.id === 'comba' ? (difAng(angulo, Math.atan2(pin[1] - b[1], pin[0] - b[0])) >= 0 ? -1 : 1) * PUTT_MAGO.giro : 0
    const noLaFalla = hab?.id === 'dadas' && dist(b, pin) <= DADA
    return { putt: true, cuerda: angulo, carry, destino: [b[0] + Math.cos(angulo) * carry, b[1] + Math.sin(angulo) * carry], control: null, disp: null, error: dif.error, recto: hab?.id === 'derecho' || !!r.calma, giro, noLaFalla }
  }
  const tee = r.lie === 'tee'
  const plan = planBase(angulo, potencia, r.lie)
  // el carry en yardas reales (según el handicap) pasado a yardas del dibujo con la escala del hoyo
  const escala = hoyoActual(r).escala
  plan.carry = (potencia * carryDe(r.jugador?.hcp) * (FISICA.factorLie[r.lie] ?? 1)) / escala
  plan.disp = { ...plan.disp, ang: plan.disp.ang * dif.error, carry: plan.disp.carry * dif.error }
  if (hab?.id === 'bomba' && tee) plan.carry = (potencia * BOMBA.carry) / escala
  if (hab?.id === 'bomba' && tee && plan.carry * escala > BOMBA.zona) {
    const q = Math.max(0, Math.min(1, precision))
    plan.bomba = true
    plan.perfecta = q >= BOMBA.perfecta
    const grados = plan.perfecta ? BOMBA.angPerfecta : BOMBA.angBase + BOMBA.angMala * (1 - q)
    plan.disp = { ang: ((grados * Math.PI) / 180) * dif.error, carry: (plan.perfecta ? 0.02 : 0.05 + 0.15 * (1 - q)) * dif.error, fondo: false }
  }
  if (hab?.id === 'approach') {
    // Liberty: el drive, perfecto; el approach, una tragedia
    const d = dist(b, hoyoActual(r).pin)
    if (tee) plan.disp = { ...plan.disp, ang: 0, carry: plan.disp.carry * 0.5 }
    else if (d >= APPROACH.desde && d <= APPROACH.hasta) { plan.disp = { ...plan.disp, ang: plan.disp.ang * APPROACH.error, carry: plan.disp.carry * APPROACH.error }; plan.approach = true }
  }
  if (r.calma) {
    // LG no se enoja: después de un mal tiro, este sale sin error
    plan.disp = { ...plan.disp, ang: 0, carry: 0 }
    plan.calma = true
  }
  if (hab?.id === 'derecho') {
    plan.disp = { ...plan.disp, ang: 0 } // siempre derecho
  }
  if (hab?.id === 'comba') {
    // nunca derecho: sale por donde apunta y se cierra según el golpe que le tocó
    // (curva = Bézier con el control sobre la línea de salida; lado 1 = cae a la izquierda de la salida)
    const g = golpeMagoDe(r) ?? GOLPES_MAGO[0]
    const pin = hoyoActual(r).pin
    const lado = g.lado === 'izq' ? 1 : g.lado === 'der' ? -1 : difAng(angulo, Math.atan2(pin[1] - b[1], pin[0] - b[0])) >= 0 ? 1 : -1
    const beta = (g.curva * Math.PI) / 180
    plan.carry *= g.carry
    const l = plan.carry / (2 * Math.cos(beta))
    plan.comba = true
    plan.golpe = g.id
    plan.alto = g.alto
    plan.rueda = g.rueda
    plan.rasante = !!g.rasante
    plan.cuerda = angulo - lado * beta
    plan.control = [b[0] + Math.cos(angulo) * l, b[1] + Math.sin(angulo) * l]
    plan.disp = { ...plan.disp, ang: plan.disp.ang * COMBA.error }
  }
  if (hab?.id === 'aguila') {
    // la línea de tiro se sacude; `tiempo` = segundos desde que empezó a apuntar
    const desvio = AGUILA.amplitud * Math.sin((2 * Math.PI * tiempo) / AGUILA.periodo)
    const enVentana = Math.abs(desvio) <= AGUILA.ventana
    const pin = hoyoActual(r).pin
    plan.aguila = { desvio, enVentana }
    plan.cuerda = angulo + (desvio * Math.PI) / 180
    if (enVentana) plan.disp = { ...plan.disp, ang: 0 } // sale derecha
    // cerca del green el imán la mete (antes la dejaba dada al lado; pedido de Rorro, 2026-10-04: "así es más justo")
    if (dist(b, pin) <= AGUILA.chip) plan.iman = { meter: true }
  }
  plan.destino = [b[0] + Math.cos(plan.cuerda) * plan.carry, b[1] + Math.sin(plan.cuerda) * plan.carry]
  return plan
}

/** Arma el tiro. El aim que ve el jugador es `angulo` y `potencia` (o el `plan` de planTiro); acá se suma el error humano y el viento. */
export function lanzar(campo, { pelota, angulo, potencia, viento, putt, lie, rng, plan }) {
  potencia = Math.max(0, Math.min(1, potencia))
  if (putt) {
    const e = plan?.error ?? 1
    const d = potencia * FISICA.distPuttMax * (1 + gauss(rng) * FISICA.error.puttDist * e)
    const a = angulo + (plan?.recto ? 0 : gauss(rng) * FISICA.error.puttAng * e)
    const v0 = Math.sqrt(2 * FISICA.roce.green * Math.max(0, d))
    return { modo: 'putt', fase: 'rodando', pos: [...pelota], alt: 0, v: [Math.cos(a) * v0, Math.sin(a) * v0], carry: 0, giro: plan?.giro ?? 0, labio: false, eventos: [] }
  }
  const p = plan ?? planBase(angulo, potencia, lie)
  const err = gauss(rng) * p.disp.ang
  const g = gauss(rng)
  // una bomba mal pegada nunca va más lejos: se queda corta
  const carry = Math.max(0, p.carry * (p.bomba ? 1 - Math.abs(g) * p.disp.carry : 1 + g * p.disp.carry))
  const a = p.cuerda + err
  const carryVec = [Math.cos(a) * carry, Math.sin(a) * carry]
  let controlVec = [carryVec[0] / 2, carryVec[1] / 2] // recto: el control en el medio
  if (p.control) {
    const k = p.carry ? carry / p.carry : 0
    const cx = p.control[0] - pelota[0]
    const cy = p.control[1] - pelota[1]
    controlVec = [(cx * Math.cos(err) - cy * Math.sin(err)) * k, (cx * Math.sin(err) + cy * Math.cos(err)) * k]
  }
  const kv = viento.kmh * FISICA.vientoYd * (carry / FISICA.carryMax)
  return {
    modo: 'full',
    fase: 'vuelo',
    desde: [...pelota],
    carryVec,
    controlVec,
    deriva: [Math.cos(viento.ang) * kv, Math.sin(viento.ang) * kv],
    carry,
    bomba: !!p.bomba,
    perfecta: !!p.perfecta,
    comba: !!p.comba,
    golpe: p.golpe ?? null,
    approach: !!p.approach,
    liberty: lie === 'tee' && !p.putt,
    rasante: !!p.rasante,
    rueda: p.rueda ?? 1,
    derecha: !!p.aguila?.enVentana,
    iman: p.iman ?? null,
    // el globo del Mago tarda más en bajar; la viborita va rápida y al ras
    T: (0.8 + carry / 140) * ((p.alto ?? 1) > 1 ? 1.5 : (p.alto ?? 1) < 1 ? 0.75 : 1),
    hMax: (8 + carry * 0.12) * (p.alto ?? 1),
    t: 0,
    pos: [...pelota],
    alt: 0,
    v: [0, 0],
    labio: false,
    eventos: [],
  }
}

function robo(tiro) {
  if (!tiro.monos || tiro.alt >= MONO.altura) return false
  const m = tiro.monos.find((s) => monoActivo(s) && dist(s.pos, tiro.pos) < MONO.radio)
  if (!m) return false
  tiro.robada = m
  tiro.alt = 0
  tiro.v = [0, 0]
  tiro.fase = 'quieta'
  tiro.eventos.push({ tipo: 'robo' })
  return true
}

/** Un paso de física. Muta `tiro`; devuelve la fase ('vuelo' | 'rodando' | 'quieta'). */
export function avanzar(campo, tiro, dt, pin) {
  if (tiro.monos && tiro.fase !== 'quieta') moverMonos(tiro.monos, dt, null) // los monos siguen caminando mientras vuela
  if (tiro.fase === 'vuelo') {
    tiro.t = Math.min(tiro.t + dt, tiro.T)
    const u = tiro.t / tiro.T
    const prev = tiro.pos
    // Bézier cuadrática (recta si el control está en el medio) + la deriva del viento
    const b1 = 2 * u * (1 - u)
    const b2 = u * u
    tiro.pos = [
      tiro.desde[0] + tiro.controlVec[0] * b1 + tiro.carryVec[0] * b2 + tiro.deriva[0] * b2,
      tiro.desde[1] + tiro.controlVec[1] * b1 + tiro.carryVec[1] * b2 + tiro.deriva[1] * b2,
    ]
    tiro.alt = 4 * tiro.hMax * u * (1 - u)
    if (u > 0.02 && robo(tiro)) return tiro.fase
    // los golpes del Mago vuelan por arriba de los pinos (menos la viborita, que va al ras)
    const pino = (!tiro.comba || tiro.rasante) && u > 0.02 && u < 1 && tiro.alt < FISICA.alturaPino ? pinoEn(campo, tiro.pos) : null
    // el pino que tiene la pelota debajo de la copa no la frena al salir
    if (pino && Math.hypot(pino.x - tiro.desde[0], pino.y - tiro.desde[1]) >= pino.r) {
      tiro.eventos.push({ tipo: 'palo' })
      tiro.alt = 0
      const d = Math.hypot(tiro.pos[0] - prev[0], tiro.pos[1] - prev[1]) || 1
      tiro.v = [(-(tiro.pos[0] - prev[0]) / d) * 2, (-(tiro.pos[1] - prev[1]) / d) * 2] // rebota para atrás
      tiro.fase = 'rodando'
      return tiro.fase
    }
    if (u >= 1) {
      tiro.alt = 0
      const t = terreno(campo, tiro.pos).tipo
      tiro.eventos.push({ tipo: 'pique', terreno: t })
      if (t === 'afuera') {
        tiro.fase = 'quieta'
        return tiro.fase
      }
      // cayó en la boca del hoyo: puede quedar adentro de aire
      if (pin && tiro.modo === 'full' && suerteDe(tiro) < chanceClavada(dist(tiro.pos, pin))) {
        tiro.pos = [...pin]
        tiro.v = [0, 0]
        tiro.embocada = true
        tiro.eventos.push({ tipo: 'clavada' }, { tipo: 'embocada' })
        tiro.fase = 'quieta'
        return tiro.fase
      }
      // rueda en la dirección con la que llega; la comba del Mago, en cambio, pica y sigue derecho a la bandera
      const k = tiro.comba ? 0 : 1
      const dx = tiro.carryVec[0] - k * tiro.controlVec[0] + tiro.deriva[0]
      const dy = tiro.carryVec[1] - k * tiro.controlVec[1] + tiro.deriva[1]
      const d = Math.hypot(dx, dy) || 1
      const vel = Math.sqrt(1.8 * tiro.carry) * FISICA.pique[t] * (tiro.rueda ?? 1)
      tiro.v = [(dx / d) * vel, (dy / d) * vel]
      tiro.fase = 'rodando'
    }
    return tiro.fase
  }
  if (tiro.fase !== 'rodando') return tiro.fase
  if (tiro.vuelta && !tiro.vuelta.hecha) return darVuelta(tiro, dt, pin)

  const ter = terreno(campo, tiro.pos)
  if (ter.tipo === 'afuera') {
    tiro.v = [0, 0]
    tiro.fase = 'quieta'
    return tiro.fase
  }
  if (ter.tipo === 'green' && tiro.iman && pin && dist(tiro.pos, pin) < 40) {
    if (!tiro.iman.aplicado) {
      // el chip del Águila: al tocar el green va derecho a quedar al lado del hoyo (o adentro, si fue perfecto)
      tiro.iman.aplicado = true
      const d0 = dist(tiro.pos, pin) || 1
      const meta = tiro.iman.meter ? [...pin] : [pin[0] + ((tiro.pos[0] - pin[0]) / d0) * AGUILA.alLado, pin[1] + ((tiro.pos[1] - pin[1]) / d0) * AGUILA.alLado]
      const d = dist(tiro.pos, meta)
      const v = Math.sqrt(2 * FISICA.roce.green * d) + (tiro.iman.meter ? 0.1 : 0)
      tiro.v = [((meta[0] - tiro.pos[0]) / (d || 1)) * v, ((meta[1] - tiro.pos[1]) / (d || 1)) * v]
    }
  } else if (ter.tipo === 'green' && !tiro.greenPlano) {
    const h = campo.hoyos.find((x) => x.n === ter.hoyo)
    tiro.v = [tiro.v[0] + h.caida[0] * dt, tiro.v[1] + h.caida[1] * dt]
  }
  if (tiro.giro) {
    // el putt del Mago: la pelota va doblando mientras rueda (más se nota cuando va despacio)
    const g = tiro.giro * dt
    tiro.v = [tiro.v[0] * Math.cos(g) - tiro.v[1] * Math.sin(g), tiro.v[0] * Math.sin(g) + tiro.v[1] * Math.cos(g)]
  }
  const a = FISICA.roce[ter.tipo]
  const vel = Math.hypot(tiro.v[0], tiro.v[1])
  if (vel <= a * dt) {
    tiro.v = [0, 0]
    tiro.fase = 'quieta'
    if (pin && dist(tiro.pos, pin) < FISICA.bocaHoyo) {
      // se frenó adentro del hoyo: cae
      tiro.pos = [...pin]
      tiro.embocada = true
      tiro.eventos.push({ tipo: 'embocada' })
    }
    return tiro.fase
  }
  const k = (vel - a * dt) / vel
  tiro.v = [tiro.v[0] * k, tiro.v[1] * k]
  const prev = tiro.pos
  tiro.pos = [prev[0] + tiro.v[0] * dt, prev[1] + tiro.v[1] * dt]
  if (robo(tiro)) return tiro.fase

  // recién salida de la corbata, la pelota todavía está en la boca: no la vuelve a agarrar hasta salir
  const saliendo = (tiro.vuelta || tiro.salto) && dist(prev, pin) < FISICA.bocaHoyo + 0.01
  const cerca = pin && !saliendo ? cercanoEnSegmento(pin, prev, tiro.pos) : null
  // se decide en el punto más cercano al centro: mientras se sigue acercando, todavía no
  if (cerca && dist(cerca, pin) < FISICA.bocaHoyo && dist(cerca, tiro.pos) > 1e-9) {
    const v = Math.hypot(tiro.v[0], tiro.v[1])
    const d = dist(cerca, pin)
    // desde afuera del green, llegando rápido, tiene su chance (si no, sigue: corbata o labio)
    if (v < limiteEmbocar(d) || (tiro.modo === 'full' && suerteDe(tiro) < chanceRodando(d, v))) {
      tiro.pos = [...pin]
      tiro.v = [0, 0]
      tiro.embocada = true
      tiro.eventos.push({ tipo: 'embocada' })
      tiro.fase = 'quieta'
      return tiro.fase
    }
    // por el medio no hay corbata: o entró (arriba) o venía muy fuerte y salta por arriba
    if (v < VUELTA.max && d > FISICA.medioHoyo && !tiro.vuelta && !tiro.salto) {
      // la corbata: arranca a girar alrededor del hoyo desde donde pasó más cerca
      tiro.labio = true
      tiro.eventos.push({ tipo: 'vuelta' })
      let p = [cerca[0] - pin[0], cerca[1] - pin[1]]
      const s = p[0] * tiro.v[1] - p[1] * tiro.v[0] >= 0 ? 1 : -1 // gira para donde iba
      tiro.vuelta = {
        ang: Math.atan2(p[1], p[0]),
        s,
        falta: Math.PI * (0.5 + 0.9 * (1 - Math.min(1, (d - FISICA.medioHoyo) / (FISICA.bocaHoyo - FISICA.medioHoyo)))), // de un cuarto (borde) a casi tres cuartos de vuelta (cerca del medio)
        vel: v * 0.65, // el golpe contra el borde la frena
        entra: v < limiteEmbocar(d) + VUELTA.entra,
      }
      tiro.pos = [pin[0] + Math.cos(tiro.vuelta.ang) * VUELTA.radio, pin[1] + Math.sin(tiro.vuelta.ang) * VUELTA.radio]
      return tiro.fase
    }
    if (!tiro.labio) {
      // muy pasada: salta por arriba del borde, se desvía y se frena un poco
      tiro.labio = true
      tiro.salto = true
      tiro.eventos.push({ tipo: 'labio' })
      const lado = tiro.v[0] * (pin[1] - prev[1]) - tiro.v[1] * (pin[0] - prev[0]) > 0 ? -1 : 1
      const g = 0.4 * lado
      tiro.v = [(tiro.v[0] * Math.cos(g) - tiro.v[1] * Math.sin(g)) * 0.7, (tiro.v[0] * Math.sin(g) + tiro.v[1] * Math.cos(g)) * 0.7]
    }
  }

  const pino = pinoEn(campo, tiro.pos)
  if (pino) {
    const nx0 = tiro.pos[0] - pino.x
    const ny0 = tiro.pos[1] - pino.y
    const nd = Math.hypot(nx0, ny0) || 1
    const nx = nx0 / nd
    const ny = ny0 / nd
    const vn = tiro.v[0] * nx + tiro.v[1] * ny
    if (vn < 0) {
      tiro.v = [(tiro.v[0] - 2 * vn * nx) * 0.35, (tiro.v[1] - 2 * vn * ny) * 0.35]
      tiro.pos = [pino.x + nx * (pino.r + 0.05), pino.y + ny * (pino.r + 0.05)] // que no quede debajo de la copa
      if (!tiro.eventos.some((e) => e.tipo === 'palo')) tiro.eventos.push({ tipo: 'palo' })
    }
  }
  return tiro.fase
}

/** Un paso de la corbata: gira pegada al borde, frenándose; al final entra o sale tangente, cortita. */
function darVuelta(tiro, dt, pin) {
  const vu = tiro.vuelta
  const paso = (vu.vel * dt) / VUELTA.radio
  vu.ang += vu.s * paso
  vu.falta -= paso
  vu.vel *= Math.exp(-VUELTA.freno * dt)
  tiro.pos = [pin[0] + Math.cos(vu.ang) * VUELTA.radio, pin[1] + Math.sin(vu.ang) * VUELTA.radio]
  tiro.v = [-Math.sin(vu.ang) * vu.s * vu.vel, Math.cos(vu.ang) * vu.s * vu.vel]
  if (vu.falta > 0 && vu.vel > VUELTA.muerta) return tiro.fase
  vu.hecha = true
  if (vu.entra || vu.vel <= VUELTA.muerta) {
    tiro.pos = [...pin]
    tiro.v = [0, 0]
    tiro.embocada = true
    tiro.eventos.push({ tipo: 'embocada' })
    tiro.fase = 'quieta'
    return tiro.fase
  }
  const sale = Math.max(VUELTA.salida, vu.vel * 0.6)
  tiro.v = [-Math.sin(vu.ang) * vu.s * sale, Math.cos(vu.ang) * vu.s * sale]
  return tiro.fase
}

/** Corre un tiro entero de una (tests y simulaciones). */
export function simular(campo, tiro, pin, dt = 1 / 60) {
  for (let i = 0; i < 20000 && tiro.fase !== 'quieta'; i++) avanzar(campo, tiro, dt, pin)
  return tiro
}

// ── ronda ───────────────────────────────────────────────────────────────
export function nuevaRonda(jugador, rng) {
  const tee = colorTee(jugador)
  const r = {
    jugador,
    tee, // azul, blanca o amarilla (según el handicap)
    idx: 0,
    golpes: 0,
    pelota: [...HOYOS[0].tees[tee]],
    lie: 'tee',
    desde: [...HOYOS[0].tees[tee]],
    lieDesde: 'tee',
    viento: vientoAleatorio(rng),
    tarjeta: [],
    monosMalos: 0,
    monosBuenos: 0,
    robos: 0,
    monos: crearMonos(),
    golpeMago: null, // el golpe que le toca al Mago en el próximo tiro
    panchos: habilidadDe(jugador)?.id === 'panchitos' ? MUGRE.panchos : 0,
    t0: null, // performance.now() de la largada (lo pone la página)
    ms: null, // el tiempo de la vuelta: de la largada al último putt
    terminada: false,
  }
  if (habilidadDe(jugador)?.id === 'comba') r.golpeMago = sortearGolpeMago(rng, null)
  return r
}
/** El golpe del Mago para el próximo tiro: al azar, distinto del anterior. */
export function sortearGolpeMago(rng, antes) {
  return elegir(rng, GOLPES_MAGO.filter((g) => g.id !== antes)).id
}
export const golpeMagoDe = (r) => GOLPES_MAGO.find((g) => g.id === r.golpeMago) ?? null
export const hoyoActual = (r) => HOYOS[r.idx]
export const enModoPutt = (campo, r) => r.lie === 'green' && terreno(campo, r.pelota).hoyo === hoyoActual(r).n

/**
 * El árbol contra el que pega el tiro apuntado en la SALIDA (la primera mitad del vuelo, todavía bajo),
 * sin error ni viento: para marcarlo al apuntar. Null si no pega (o si pasa por arriba).
 */
export function pinoEnLaSalida(campo, pelota, plan) {
  if (!plan || plan.putt || (plan.comba && !plan.rasante) || !plan.carry) return null
  const carryVec = [Math.cos(plan.cuerda) * plan.carry, Math.sin(plan.cuerda) * plan.carry]
  const controlVec = plan.control ? [plan.control[0] - pelota[0], plan.control[1] - pelota[1]] : [carryVec[0] / 2, carryVec[1] / 2]
  const hMax = (8 + plan.carry * 0.12) * (plan.alto ?? 1)
  const n = Math.ceil(plan.carry / 0.25)
  for (let i = 1; i <= n / 2; i++) {
    const u = i / n
    const alt = 4 * hMax * u * (1 - u)
    if (alt >= FISICA.alturaPino) break // ya pasa por arriba de los pinos
    const b1 = 2 * u * (1 - u)
    const b2 = u * u
    const pos = [pelota[0] + controlVec[0] * b1 + carryVec[0] * b2, pelota[1] + controlVec[1] * b1 + carryVec[1] * b2]
    const pino = pinoEn(campo, pos)
    // el de abajo de la copa (la pelota debajo del árbol) no la frena al salir, como en el vuelo
    if (pino && Math.hypot(pino.x - pelota[0], pino.y - pelota[1]) >= pino.r) return { pos, pino, u }
  }
  return null
}

/** Pegarle: cuenta el golpe y devuelve el tiro para animarlo con `avanzar` (que también mueve los monos). */
export function golpear(campo, r, angulo, potencia, rng, precision = 0, tiempo = 0) {
  const plan = planTiro(campo, r, angulo, potencia, precision, tiempo)
  r.desde = [...r.pelota]
  r.lieDesde = r.lie
  r.golpes += 1
  calmarMonos(r.monos)
  const tiro = lanzar(campo, { pelota: r.pelota, angulo, potencia, viento: r.viento, putt: plan.putt, lie: r.lie, rng, plan })
  tiro.monos = r.monos
  const hab = habilidadDe(r.jugador)
  tiro.greenPlano = hab?.id === 'perro'
  tiro.calma = !!r.calma
  r.calma = false
  // Joaco: de 3 metros no la falla. Le pegue como le pegue, la pelota va al hoyo (el imán, metiéndola)
  if (plan.noLaFalla) tiro.iman = { meter: true, lechu: true }
  if (r.golpeMago && !plan.putt) r.golpeMago = sortearGolpeMago(rng, r.golpeMago) // el próximo, otro efecto
  return tiro
}

/** Los monos llegaron a la pelota antes de que le pegues: se la llevan y volvés al tee del hoyo con un golpe de multa. */
export function monosLlegaron(r) {
  const h = hoyoActual(r)
  calmarMonos(r.monos)
  r.robos += 1
  r.golpes += 1
  r.pelota = [...teeDe(r)]
  r.desde = [...teeDe(r)]
  r.lie = 'tee'
  r.lieDesde = 'tee'
  return { tipo: 'reinicio', n: h.n }
}

function puntoEnCalle(hoyo, p) {
  let mejor = hoyo.calle[0]
  for (let i = 0; i < hoyo.calle.length - 1; i++) {
    const q = cercanoEnSegmento(p, hoyo.calle[i], hoyo.calle[i + 1])
    if (dist(q, p) < dist(mejor, p)) mejor = q
  }
  return [...mejor]
}

/** Salida libre: los primeros metros hacia la bandera (donde la pelota va baja) sin árboles. */
function salidaLibre(campo, q, pin) {
  const d = dist(q, pin) || 1
  for (let s = 1.5; s <= Math.min(18, d); s += 1.5) {
    if (pinoEn(campo, [q[0] + ((pin[0] - q[0]) / d) * s, q[1] + ((pin[1] - q[1]) / d) * s])) return false
  }
  return true
}

/**
 * Drop del Mono: el rough (o fairway) más cercano sin árbol encima, sin acercarse al hoyo
 * y con salida libre hacia la bandera (si no, se trababa detrás del mismo grupo de árboles).
 */
export function dropMono(campo, p, pin) {
  const dp = dist(p, pin)
  let reserva = null
  for (let r = 2; r <= 60; r += 2) {
    let mejor = null
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * 2 * Math.PI
      const q = [p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r]
      const t = terreno(campo, q).tipo
      if ((t !== 'rough' && t !== 'fairway') || pinoEn(campo, q)) continue
      reserva ??= q
      if (dist(q, pin) < dp - 1 || !salidaLibre(campo, q, pin)) continue
      if (!mejor || dist(q, pin) < dist(mejor, pin)) mejor = q
    }
    if (mejor) return mejor
  }
  return reserva
}

/**
 * La pelota quedó quieta: decide qué pasa (embocó, se la robó un mono, afuera, Mono malo, Mono bueno o se sigue).
 * Suma penalidades y mueve la pelota de la ronda.
 */
export function resolverReposo(campo, r, tiro, rng) {
  const res = resolver(campo, r, tiro, rng)
  // LG: si fue un mal tiro, el próximo sale sin error
  if (habilidadDe(r.jugador)?.id === 'calma') r.calma = esMalo(res, tiro)
  return res
}
const esMalo = (res, tiro) => ['afuera', 'mono-malo', 'mono-ladron'].includes(res.tipo) || ['rough', 'bunker'].includes(res.terreno) || tiro.eventos.some((e) => e.tipo === 'palo')

function resolver(campo, r, tiro, rng) {
  const hoyo = hoyoActual(r)
  if (tiro.embocada) return { tipo: 'embocada' }
  if (tiro.robada) {
    // se la llevó: +1 y se dropea donde le pegó al mono
    const t = terreno(campo, tiro.pos).tipo
    const drop = t === 'bosque' || t === 'afuera' ? dropMono(campo, tiro.pos, hoyo.pin) : [...tiro.pos]
    r.golpes += 1
    r.robos += 1
    r.pelota = drop ?? [...r.desde]
    r.lie = drop ? terreno(campo, r.pelota).tipo : r.lieDesde
    return { tipo: 'mono-ladron', desde: [...tiro.pos], mono: tiro.robada }
  }
  const ter = terreno(campo, tiro.pos)
  if (ter.tipo === 'afuera') {
    r.golpes += 1
    r.pelota = [...r.desde]
    r.lie = r.lieDesde
    return { tipo: 'afuera' }
  }
  if (ter.tipo === 'bosque' && habilidadDe(r.jugador)?.id === 'perro') {
    // el perro va a buscarla y la trae al fairway, sin multa
    r.pelota = puntoEnCalle(hoyo, tiro.pos)
    r.lie = terreno(campo, r.pelota).tipo
    return { tipo: 'perro', desde: [...tiro.pos] }
  }
  if (ter.tipo === 'bosque') {
    if (rng() < CHANCE_MONO_BUENO) {
      r.pelota = puntoEnCalle(hoyo, tiro.pos)
      r.lie = terreno(campo, r.pelota).tipo
      r.monosBuenos += 1
      return { tipo: 'mono-bueno', desde: [...tiro.pos] }
    }
    const drop = dropMono(campo, tiro.pos, hoyo.pin)
    r.golpes += 1
    r.pelota = drop ?? [...r.desde]
    r.lie = drop ? terreno(campo, drop).tipo : r.lieDesde
    r.monosMalos += 1
    return { tipo: 'mono-malo', desde: [...tiro.pos] }
  }
  r.pelota = [...tiro.pos]
  r.lie = ter.tipo
  return { tipo: 'normal', terreno: ter.tipo, ajeno: ter.hoyo && ter.hoyo !== hoyo.n ? ter.hoyo : null }
}

export const necesitaLP = (r) => r.golpes >= MAX_GOLPES

/** El Ninja: el primer LP de la vuelta no la pierde (+1 y drop en el fairway). */
export const tieneLPNinja = (r) => habilidadDe(r.jugador)?.id === 'tradicion' && !r.lpNinja
export function lpNinja(campo, r) {
  const h = hoyoActual(r)
  calmarMonos(r.monos)
  r.lpNinja = h.n
  r.golpes += 1
  // al fairway del hoyo: el punto de la calle más cerca de la pelota que no quede más cerca de la bandera
  const dp = dist(r.pelota, h.pin)
  let mejor = null
  for (let i = 0; i < h.calle.length - 1; i++) {
    for (let k = 0; k <= 20; k++) {
      const [a, b] = [h.calle[i], h.calle[i + 1]]
      const q = [a[0] + ((b[0] - a[0]) * k) / 20, a[1] + ((b[1] - a[1]) * k) / 20]
      if (dist(q, h.pin) < dp - 1) continue
      if (!mejor || dist(q, r.pelota) < dist(mejor, r.pelota)) mejor = q
    }
  }
  // si toda la calle queda más cerca (por ejemplo, desde el tee), se dropea ahí mismo
  if (mejor) r.pelota = mejor
  r.lie = terreno(campo, r.pelota).tipo
  return h.n
}

/** LP: levantar la pelota es perder la vuelta entera. Este hoyo y los que faltan quedan LP. */
export function levantar(r) {
  calmarMonos(r.monos)
  r.lp = hoyoActual(r).n
  for (const h of HOYOS.slice(r.idx)) r.tarjeta.push({ n: h.n, par: h.par, golpes: null, lp: true })
  r.idx = HOYOS.length
  r.terminada = true
  return r.lp
}

/** Anota el hoyo embocado en la tarjeta y prepara el siguiente. */
export function cerrarHoyo(r, rng) {
  const h = hoyoActual(r)
  calmarMonos(r.monos)
  const fila = { n: h.n, par: h.par, golpes: r.golpes, lp: false }
  r.tarjeta.push(fila)
  r.idx += 1
  if (r.idx >= HOYOS.length) {
    r.terminada = true
  } else {
    const sig = HOYOS[r.idx]
    r.golpes = 0
    r.pelota = [...teeDe(r, sig)]
    r.desde = [...teeDe(r, sig)]
    r.lie = 'tee'
    r.lieDesde = 'tee'
    r.viento = vientoAleatorio(rng)
    if (r.panchos || habilidadDe(r.jugador)?.id === 'panchitos') r.panchos = MUGRE.panchos
  }
  return fila
}

// ── score ───────────────────────────────────────────────────────────────
export function totales(tarjeta) {
  const par = tarjeta.reduce((s, f) => s + f.par, 0)
  const lp = tarjeta.some((f) => f.lp)
  const golpes = lp ? null : tarjeta.reduce((s, f) => s + f.golpes, 0)
  return { golpes, par, vsPar: lp ? null : golpes - par, lp }
}
// ── ranking: arriba el de menos golpes; a igual golpes, el más rápido (al milisegundo) ──
export const compararMarcas = (a, b) => a.golpes - b.golpes || a.ms - b.ms

/** La marca de una vuelta para el ranking (null si fue LP o no tiene tiempo). */
export function marcaDe(r, usuario) {
  const t = totales(r.tarjeta)
  if (t.lp || r.ms == null || !r.terminada) return null
  return { usuario: String(usuario ?? '').trim(), apodo: r.jugador.apodo, emoji: r.jugador.emoji, golpes: t.golpes, vsPar: t.vsPar, ms: Math.round(r.ms) }
}

/** De quién es una marca: el usuario de la SDGApp (uid) si viene de ahí; si no, el nombre que puso. */
export const duenoDe = (m) => (m.uid ? `uid:${m.uid}` : String(m.usuario ?? '').trim().toLowerCase())

/** El ranking: la mejor marca de cada usuario, ordenada. Con `apodo`, solo las vueltas con ese jugador. */
export function armarRanking(marcas, apodo = null) {
  const mejor = new Map()
  for (const m of marcas) {
    if (apodo && m.apodo !== apodo) continue
    if (!(m.golpes > 0 && m.ms > 0) || !m.usuario) continue
    const k = duenoDe(m)
    if (!mejor.has(k) || compararMarcas(m, mejor.get(k)) < 0) mejor.set(k, m)
  }
  return [...mejor.values()].sort(compararMarcas).map((m, i) => ({ ...m, pos: i + 1 }))
}

/** `1:23.456` (minutos, segundos y milisegundos). */
export function formatoTiempo(ms) {
  const t = Math.max(0, Math.round(ms ?? 0))
  return `${Math.floor(t / 60000)}:${String(Math.floor(t / 1000) % 60).padStart(2, '0')}.${String(t % 1000).padStart(3, '0')}`
}

/** Formato del SDGA: `+3`, `E`, `−2` (signo menos de verdad); una vuelta levantada es LP. */
export const formatoPar = (n) => (n == null ? 'LP' : n === 0 ? 'E' : n > 0 ? `+${n}` : `−${-n}`)

export function nombreResultado(golpes, par, lp) {
  if (lp) return 'LP'
  if (golpes === 1) return 'HOYO EN UNO'
  const d = golpes - par
  return { [-3]: 'ALBATROS', [-2]: 'EAGLE', [-1]: 'BIRDIE', 0: 'PAR', 1: 'BOGEY', 2: 'DOBLE BOGEY', 3: 'TRIPLE BOGEY' }[d] ?? `+${d}`
}

// ── voz ─────────────────────────────────────────────────────────────────
export const RELATO = {
  bomba: ['QUE BOMBA!', 'Tremendo', 'QUE HOMBRE', 'Uff, qué bomba'],
  fairway: ['Hermoso', 'Al medio. Tremendo', 'Qué lindo', 'Hermoso, al medio'],
  rough: ['Uff', 'Rough. Se complica', 'Al rough. Nada que no arregle un approach'],
  bunker: ['A la arena. Rastrillalo después', 'Bunker. Uff', 'Bunker. Nadie vio nada'],
  bunkerDicky: ['El cross bunker del 16 es muy dicky'],
  green: ['En el green. Ahora no la tres-puttees', 'Green. Hermoso', 'Al green. Tremendo'],
  ajeno: ['Jugando desde el {n}, clásico', 'Visitando el {n}. Clásico'],
  afuera: ['AFUERA. Golpe y distancia', 'Esa no vuelve más'],
  palo: ['¡PALO! Le pegó al pino', 'Pino. Uff'],
  labio: ['Uff, el labio', 'Saltó por arriba del hoyo'],
  corbata: ['¡LA CORBATA! Le dio la vuelta y la escupió', 'Dio la vuelta entera y no quiso', '¡Corbata! Se la quedó mirando'],
  monoMalo: ['El Mono te la robó. +1 y dropeá en el rough'],
  monoBueno: ['¡MONO BUENO! Te la devolvió al medio del fairway'],
  bombaPerfecta: ['¡LA BOMBA DE MIGUELÓN! QUE HOMBRE', 'Miguelón la puso en el green. Tremendo'],
  combaMago: ['Magia pura. La comba del Mago', 'La comba de Rodal. Hermoso'],
  monosLlegan: ['¡Llegaron los monos! Se la llevaron: al tee con un golpe de multa', 'Te la robaron los monos. Había que pegarle: de vuelta al tee, +1'],
  chipIn: ['¡CHIP IN! Si no es green es chip in', 'QUE HOMBRE EL ÁGUILA'],
  iman: ['Imán del Águila: dada', 'La dejó al lado, como siempre', 'Fito la deja dada'],
  monoLadron: ['¡LE PEGASTE A UN MONO! Se la llevó. +1', 'Un mono se la robó al vuelo. +1', 'Mono ladrón. +1 y dropeá ahí'],
  lp: ['Entraste en la lista LP 💅'],
  putt: ['Uff, le faltó', 'Casi', 'Se pasó. Uff'],
  dada: ['Esas Joaco no las falla', 'De tres metros, la Lechuza no perdona', 'Adentro, como corresponde al campeón', 'Contando todas las dadas'],
  ninjaLP: ['Manteniendo viva la tradición de un LP por finde', 'El Ninja levantó. Tradición Dicky', 'LP de Ninja: +1 y a seguir'],
  perro: ['¡El perro la trajo! Al fairway, sin multa', 'Buen perro. La vida no es mucho más que esto', 'Perrolo fue a buscarla'],
  approach: ['Si no era por el approach ganaba', 'Los wedges ya van a funcionar', 'El approach, otra vez'],
  liberty: ['Drive de Liberty: al medio, como siempre', 'Ese drive no lo pega nadie'],
  calma: ['LG no se enoja: el que se enoja pierde', 'LG respira. Ahora sale derecha', 'Tranquilo LG, el que se enoja pierde'],
  lgSolo: ['LG la pega como LG', 'Con el ESDIGIA esto no pasa', 'LG relata a LG: Tremendo', 'QUE HOMBRE LG'],
  mugre: ['Lurrrrrrpin', 'Lurrrrpin. Hermoso'],
  pancho: ['¡Pancho! Los monos van a comer', 'Pagamos los terceros tiempos', 'Panchito para el mono. Lurrrrpin'],
}
export const VERSOS_BOSQUE = [
  'Los árboles te miran, te rodean en silencio',
  'Entre ramas y hojas, tu score se desploma',
  'Cada árbol es un guardián, cada rama una trampa',
  'El bosque te atrapa, no hay escape ni huida',
  'Tu pelota se esconde, es una batalla perdida',
]
export const EXCUSAS = [
  'Culpa del viento',
  'Se movió alguien en el backswing',
  'Me tira la espalda',
  'Pelota nueva, no la conocía',
  'Me distrajo la sirena',
  'Viene lluvia, no me concentro',
  'El tobillo, viste',
  'Estaba pensando en el asado',
]
export const POR_RESULTADO = {
  'HOYO EN UNO': ['¡¡HOYO EN UNO!! Y sin testigos del SDGA…'],
  ALBATROS: ['ALBATROS. Nadie te va a creer'],
  EAGLE: ['EAGLE!! QUE HOMBRE'],
  BIRDIE: ['BIRDIE! QUE HOMBRE', 'Birdie. Tremendo'],
  PAR: ['Par y a casa', 'Par. Hermoso'],
  BOGEY: ['Bogey. Nada grave', 'Bogey. Uff'],
  'DOBLE BOGEY': ['Si no caés en doble, un triple te alcanza'],
  'TRIPLE BOGEY': ['Un triple te alcanzó'],
  LP: ['Entraste en la lista LP 💅'],
  otro: ['La Trampa del Mono siempre tendrá la razón'],
}
// Con Rodal, LG solo lo adula: pegue como pegue.
export const ADULACION = {
  bueno: ['QUE BOMBA RODI!', 'El Rey del Match, señores', 'Penta, Penta, Penta', 'Magia pura', 'Clase mundial', 'Ni Tiger la pega así', 'El Mago no falla', 'Hermoso, como todo lo que hace Rodi'],
  malo: ['Lo hizo a propósito: estaba leyendo el viento', 'Hasta desde ahí se nota la clase del Mago', 'Ese árbol se movió, Rodi', 'Una genialidad que pocos entienden', 'Penta es Penta: él sabe por qué', 'Táctica de pentacampeón', 'El Mago está jugando otro deporte', 'Nadie pega ese tiro, solo él'],
  mono: ['Hasta el Mono quería una foto con el Mago', 'El Mono se llevó un recuerdo del pentacampeón'],
  afuera: ['La mandó a saludar a la hinchada', 'Un regalito para los de afuera: humilde el Mago'],
  resultado: {
    'HOYO EN UNO': ['Obvio. Es el Mago'],
    EAGLE: ['Eagle del Rey del Match. Normal'],
    BIRDIE: ['BIRDIE DEL REY DEL MATCH'],
    PAR: ['Par de pentacampeón'],
    BOGEY: ['Bogey del Mago: vale como birdie'],
    'DOBLE BOGEY': ['Doble con estilo: solo él puede'],
    'TRIPLE BOGEY': ['Triple heroico, digno de Penta'],
    otro: ['El Mago siempre gana'],
  },
}

export const FRASES_CARGA = [
  'Buscando tu pelota en el rough…',
  'Calculando handicaps… y excusas',
  'Pidiendo silencio en el tee…',
  'Culpando al viento por el slice…',
  'Rastrillando el bunker que dejaste…',
  'Enfriando las birras del hoyo 19…',
  'Planchando la Boina Verde…',
]

/** Qué dice LG 📺 después de un tiro, y si el jugador pone una excusa. Con Rodal, solo adulación. */
export function comentar(rng, res, tiro, hoyo, jugador) {
  if (habilidadDe(jugador)?.adulado) {
    if (res.tipo === 'embocada') return { lg: null, excusa: null, verso: null }
    const pool = res.tipo === 'afuera' ? ADULACION.afuera : res.tipo.startsWith('mono') ? ADULACION.mono
      : ['rough', 'bunker'].includes(res.terreno) || tiro.eventos.some((e) => e.tipo === 'palo') ? ADULACION.malo : ADULACION.bueno
    return { lg: elegir(rng, pool), excusa: null, verso: null }
  }
  const hab = habilidadDe(jugador)
  const malo = esMalo(res, tiro)
  // LG no pone excusas: el que se enoja pierde
  const excusa = malo && res.tipo !== 'perro' && hab?.id !== 'calma' && rng() < 0.6 ? elegir(rng, EXCUSAS) : null
  const palo = tiro.eventos.some((e) => e.tipo === 'palo')
  let lg
  if (res.tipo === 'afuera') lg = elegir(rng, RELATO.afuera)
  else if (res.tipo === 'mono-malo') lg = elegir(rng, RELATO.monoMalo)
  else if (res.tipo === 'mono-bueno') lg = elegir(rng, RELATO.monoBueno)
  else if (res.tipo === 'mono-ladron') lg = elegir(rng, RELATO.monoLadron)
  else if (res.tipo === 'perro') lg = elegir(rng, RELATO.perro)
  else if (hab?.id === 'calma' && malo) lg = elegir(rng, RELATO.calma)
  else if (tiro.approach && ['rough', 'bunker'].includes(res.terreno)) lg = elegir(rng, RELATO.approach)
  else if (hab?.id === 'approach' && tiro.liberty && res.terreno === 'fairway') lg = elegir(rng, RELATO.liberty)
  else if (hab?.id === 'calma' && ['fairway', 'green'].includes(res.terreno) && rng() < 0.5) lg = elegir(rng, RELATO.lgSolo)
  else if (res.tipo === 'embocada') lg = null // lo dice el resultado del hoyo
  else if (palo) lg = elegir(rng, RELATO.palo)
  else if (tiro.vuelta) lg = elegir(rng, RELATO.corbata)
  else if (tiro.labio) lg = elegir(rng, RELATO.labio)
  else if (res.ajeno) lg = elegir(rng, RELATO.ajeno).replace('{n}', res.ajeno)
  else if (tiro.modo === 'putt') lg = elegir(rng, RELATO.putt)
  else if (tiro.iman?.aplicado) lg = elegir(rng, RELATO.iman)
  else if (tiro.perfecta && ['green', 'fairway'].includes(res.terreno)) lg = elegir(rng, RELATO.bombaPerfecta)
  else if (tiro.comba && res.terreno === 'fairway') lg = elegir(rng, RELATO.combaMago)
  else if (res.terreno === 'bunker') lg = elegir(rng, hoyo.n === 16 && tiro.pos[1] < 300 ? RELATO.bunkerDicky : RELATO.bunker)
  else if (res.terreno === 'rough') lg = elegir(rng, RELATO.rough)
  else if (res.terreno === 'green') lg = elegir(rng, RELATO.green)
  else lg = elegir(rng, tiro.carry > 200 ? RELATO.bomba : RELATO.fairway)
  const verso = res.tipo.startsWith('mono') || res.tipo === 'perro' ? elegir(rng, VERSOS_BOSQUE) : null
  return { lg, excusa, verso }
}

/** La frase del resultado del hoyo (con Rodal, adulación). */
export function fraseResultado(rng, nombre, jugador) {
  const tabla = habilidadDe(jugador)?.adulado ? ADULACION.resultado : POR_RESULTADO
  return elegir(rng, tabla[nombre] ?? tabla.otro)
}

export function textoCompartir(r, firmada) {
  const { vsPar } = totales(r.tarjeta)
  const j = r.jugador
  const score = r.lp ? `LP 💅 (levantó en el ${r.lp})` : firmada ? formatoPar(vsPar) : `${NETO_SIN_FIRMA} neto (no firmó la tarjeta)`
  const hoyos = r.tarjeta.map((f) => (f.lp ? 'LP' : f.golpes)).join(' · ')
  return [
    '⛳ LA TRAMPA DEL MONO · SDGA',
    `${j.emoji} ${j.apodo} (HCP ${j.hcp ?? '—'}): ${score} (${hoyos})`,
    ...(r.ms != null && !r.lp ? [`⏱ ${formatoTiempo(r.ms)}`] : []),
    `🐒 Monos: ${r.monosMalos} malos, ${r.monosBuenos} buenos, ${r.robos} robos`,
    'Hacerle poco a este tramo es casi un milagro.',
    '👉 Jugalo en la SDGApp: fedecup.vercel.app (Más → Juegos)',
  ].join('\n')
}
