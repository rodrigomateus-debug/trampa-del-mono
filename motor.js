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
  vientoExp: 2, // la deriva crece con el cuadrado del largo: el drive se lo lleva, el approach de 50 yd casi ni se mueve
  factorLie: { tee: 1, fairway: 1, green: 1, rough: 0.7, bunker: 1, bosque: 0.5, afuera: 1 }, // lo que se ve al apuntar
  // y lo que de verdad sale: desde el bunker la línea muestra el tiro entero, pero la pelota llega a la mitad
  factorReal: { bunker: 0.5 },
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

// La caída del green, fluida como en uno real: cada hoyo tiene de 2 a 4 zonas (`caidas`, un punto y su caída en
// yd/s²) y en cada lugar del green la caída es la mezcla de todas, pesada por cercanía (campana de `ancho` yardas).
export const CAIDA = { ancho: 8 }
/** La caída del green en ese punto (yd/s²). Sin zonas, la del hoyo. */
export function caidaEn(h, p) {
  if (!h.caidas?.length) return h.caida
  let sx = 0, sy = 0, sw = 0
  for (const z of h.caidas) {
    const d2 = (p[0] - z.p[0]) ** 2 + (p[1] - z.p[1]) ** 2
    const w = Math.exp(-d2 / (2 * CAIDA.ancho * CAIDA.ancho)) + 1e-9
    sx += z.v[0] * w
    sy += z.v[1] * w
    sw += w
  }
  return [sx / sw, sy / sw]
}

// Monos que cruzan de pinos a pinos: si la pelota (baja) les pega, se la llevan.
// Cuando la pelota se frena cerca (alerta), salen a buscarla: si llegan antes de que pegues, es LP.
// minimo = segundos que siempre tenés para pegar: el que está muy cerca se acerca despacio, al acecho.
export const MONO = { vel: 18, pausa: 3, radio: 3.2, altura: 8, velCaza: 12, alerta: 60, reaccion: 1, minimo: 3 }

// ── habilidades por jugador (por apodo, como en la app) ──
export const HABILIDADES = {
  'El Mago Rodal': { id: 'comba', adulado: true, nombre: 'Golpes de mago', texto: 'Nunca derecho: cada golpe le toca uno de 5 efectos (mirá cuál antes de pegar). El putt siempre lleva comba.' },
  'Mike Queboni (Đ)': { id: 'bomba', corto: 'Desde el tee, la bomba al green.',  nombre: 'Drive al green', texto: 'A fondo desde el tee el óvalo late: soltá cuando está más chico y llega al green.' },
  'El Sueco': { id: 'derecho', nombre: 'Siempre derecho', texto: 'Mati no la tuerce nunca: todo sale derecho, hasta el putt.' },
  'Fito (Đ)': { id: 'aguila', corto: 'El embudo y el chip in: cerca del green, la mete.',  nombre: 'Chip in', texto: 'Drive y hierros con el pulso a mil: soltá en el embudo y sale derecha. Cerca del green, imán: si la chipeás al green, entra.' },
  // del chat del SDGA:
  Lechu: { id: 'dadas', nombre: 'Contando todas las dadas', texto: 'Joaco no falla los putts de 3 metros o menos: le pegues como le pegues, entra.' },
  'El Ninja (Đ)': { id: 'tradicion', corto: 'Su reset del hoyo, si todavía no lo usaste.',  nombre: 'Reset ninja', texto: 'Una vez por vuelta, su LP no levanta: resetea el hoyo. Volvés al tee con cero golpes, sin multa, como si no hubiera pasado nada. Es el botón 🥷 RESET.' },
  'El Perro': { id: 'perro', nombre: 'Va a buscarla', texto: 'Los greens están habilitados (sin caída) y si va al bosque el perro te la trae al fairway sin multa. Tarda: el reloj corre.' },
  Mugre: { id: 'panchitos', nombre: 'Tirar panchos', texto: 'A la Mugre los monos la huelen de lejos y vienen más. Pero tiene 3 panchos por hoyo: se los tirás, van, comen un segundo y vuelven.' },
  Liberty: { id: 'approach', nombre: 'Si no era por el approach', texto: 'El drive sale derecho siempre. Los approach (de 30 a 100 yd del hoyo) tienen el triple de error.' },
  Grandpa: { id: 'deme', nombre: 'Invocar a Deme', texto: 'Maxi, una vez por vuelta (no desde el tee): llama a Deme, el mentor. Te enseña a agarrar el palo y el próximo tiro entra de una, le pegues como le pegues.' },
  'El Flaco Ordoñez': { id: 'carrito', nombre: 'El carrito de Marcos', texto: 'Marcos se mueve en su carrito verde: después de cada tiro (y de tee a tee) lo manejás vos hasta la pelota. Los árboles no se atraviesan. El reloj corre.' },
  LG: { id: 'calma', nombre: 'El que se enoja pierde', texto: 'Después de un mal tiro no se enoja: el próximo sale sin error.' },
  'Taiu (Đ)': { id: 'reves', corto: 'Bombas y approach perfectos… empujando al revés.',  nombre: 'Al revés', texto: 'Taiu juega bárbaro: bombas desde el tee como Miguelón (soltá en el latido) y approach perfectos (de 30 a 100 yd, sin error). Lo único: tiene los controles al revés. En vez de tirar para atrás, empujás para adelante (dedo para arriba, sale para arriba)… pero izquierda y derecha, cruzadas: dedo a la derecha, sale a la izquierda. La fuerza, como siempre. El putt también.' },
  'La Ruleta': { id: 'ruleta', nombre: 'Un player por tiro', texto: 'Cada tiro lo pega un player del mazo al azar, con su handicap y su habilidad. Nunca el mismo dos veces seguidas: antes de cada golpe gira la ruleta y te dice quién pega.' },
  'Demetrio López': { id: 'retro', nombre: 'Golf de 1960', texto: 'Juega en la cancha de cuando era pro, sin monos. Cada tiro va exactamente adonde apuntás: sin dispersión, sin viento, sin árboles, sin caída, sin labios. Birdie, águila u hoyo en uno, como cualquiera; pero nunca más que par: el tiro para par entra siempre, esté donde esté.' },
}
export const habilidadDe = (jugador) => HABILIDADES[jugador?.apodo] ?? null
/** Taiu (la Rana): los controles al revés (lo resuelve la página al leer el arrastre; el motor recibe el tiro que sale). */
export const alReves = (jugador) => habilidadDe(jugador)?.id === 'reves'
/**
 * Del arrastre en pantalla al tiro, con los controles al revés (pedido de Rorro, 2026-10-06): no es gomera, es empuje
 * (dedo para arriba, tiro para arriba), pero izquierda y derecha cruzadas (dedo a la derecha, tiro a la izquierda).
 * La fuerza no cambia. `px, py` = el vector del tiro normal (del dedo a donde empezó); `u` = largo / largo a fondo.
 */
export function invertirArrastre(px, py, u) {
  return { px, py: -py, u }
}

// ── nivel de dificultad = handicap del jugador elegido ──
// Más handicap: más error (tiro y putt) y un poco menos de distancia.
export const HCP_SIN_CARGAR = 18
// La dispersión (el error de cada tiro y cada putt, sin contar las habilidades) sale SOLO del handicap:
// con 0 la pelota va exacta adonde apuntás, y crece en línea recta hasta HCP `tope`; de ahí para arriba, todos igual.
// `error` es el multiplicador en el tope (HCP 10 ≈ el juego base de antes). Los handicaps "plus" (negativos) cuentan como 0.
export const DISPERSION_HCP = { tope: 25, error: 2.5 }
export const errorDe = (hcp) => (Math.min(DISPERSION_HCP.tope, Math.max(0, hcp)) / DISPERSION_HCP.tope) * DISPERSION_HCP.error
export const NIVELES = ['Paseo', 'Normal', 'Difícil', 'Muy difícil', 'Trampa total'] // hasta HCP 5, 10, 15, 20, más
export function dificultad(hcp) {
  const h = hcp ?? HCP_SIN_CARGAR
  const nivel = h < 5 ? 1 : h < 10 ? 2 : h < 15 ? 3 : h < 20 ? 4 : 5
  return { hcp: h, cargado: hcp != null, error: errorDe(h), distancia: (DRIVE.max - DRIVE.porHcp * h) / DRIVE.max, nivel, nombre: NIVELES[nivel - 1] }
}
/**
 * La dificultad medida (promedio vs. par del bot de calibrar.mjs) en los mismos 5 niveles. `nivel` la fija a mano
 * (Fito: el bot acierta el embudo la mitad de las veces, la gente casi nunca → Trampa total).
 */
export function dificultadReal(prom, nivel = null) {
  nivel ??= prom < 0.7 ? 1 : prom < 1.3 ? 2 : prom < 2 ? 3 : prom < 3 ? 4 : 5
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
// la bomba de Miguelón (y de Taiu): desde el tee su driver vuela hasta `carry` yardas reales: llega a los dos par 4 desde
// las azules (el 16, 415 yd, a fondo; el 15, 392, con un poco menos; 2026-10-06, antes 365 y al 16 no llegaba); pasando `zona` yardas el óvalo late (periodo, en segundos) y es perfecta si suelta con precisión >= perfecta
export const BOMBA = { carry: 405, zona: 285, perfecta: 0.93, periodo: 0.9, angPerfecta: 1, angBase: 3, angMala: 14 }
// el Águila (Fito): la línea de tiro se sacude ±amplitud grados cada `periodo` s; si suelta con el desvío dentro de
// ±ventana (el embudo) sale derecha. A `chip` yardas reales o menos del hoyo, si cae en el green el imán la mete.
// (`alLado`: dónde la dejaría un imán que no la mete; hoy siempre la mete.)
// Mati (El Sueco): sin error de dirección (pega lo que pega su handicap)
export const AGUILA = { amplitud: 25, periodo: 0.7, ventana: 5, chip: 40, alLado: 0.85, metida: 4 }
// Lechu (Joaco): el putt desde DADA yardas o menos (3 metros) entra siempre, le pegue como le pegue. El Perro: tarda `segundos` en traerla. Liberty: approach entre `desde` y `hasta` yd, error x`error`.
// DADA, AGUILA.chip y APPROACH van en yardas REALES (las del marcador): se comparan con la distancia del dibujo × la escala del hoyo.
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
    // la caída cambia por zonas (centros de cada parte del green; se mezclan suave, ver caidaEn)
    caidas: [{ p: [40, 31], v: [-0.5, 0.3] }, { p: [29, 43], v: [0.55, -0.35] }, { p: [39, 53], v: [0.3, 0.55] }],
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
    caidas: [{ p: [105, 386], v: [0.45, 0.4] }, { p: [107, 401], v: [-0.5, 0.45] }, { p: [118, 414], v: [-0.3, -0.5] }, { p: [103, 420], v: [0.5, -0.3] }],
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
    caidas: [{ p: [149, 65], v: [0.45, 0.55] }, { p: [155, 89], v: [-0.55, -0.2] }],
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
// En el par 3 (el 17) no hay driver: el palo más largo llega de `max` yd (hcp 0) a `min` yd (hcp `hcpMin` o más).
export const PAR3 = { max: 240, min: 200, hcpMin: 24 }
export const carryPar3De = (hcp) => PAR3.max - (PAR3.max - PAR3.min) * Math.min(1, Math.max(0, (hcp ?? HCP_SIN_CARGAR) / PAR3.hcpMin))
/** Lo más lejos que llega a fondo en este hoyo (yardas reales). */
export const carryMaxDe = (hcp, par) => (par === 3 ? Math.min(carryDe(hcp), carryPar3De(hcp)) : carryDe(hcp))

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

// ── el carrito de Marcos ──
// Se maneja con acelerar, freno, reversa e izquierda/derecha. Velocidades en yardas del dibujo por segundo:
// acelera fuerte hasta `vmax` y, si seguís apretando, de menos a más hasta el `turbo` (el triple). Rápido y doblando
// (o frenando y doblando) pierde agarre y COLEA: la cola se va para afuera y la velocidad no sigue a la trompa.
// Los árboles y el afuera no se atraviesan (rebota); en el rough y el bunker anda más lento. `llegar` = a cuántas
// yardas de la pelota se baja (en el bosque, `llegarBosque`: el último tramo lo hace a pie).
export const CARRITO = {
  vmax: 16, turbo: 48, acel: 10, acelTurbo: 18, atras: 6, freno: 30, frenoMotor: 16, roce: 5, giro: 2.3, largo: 2.6,
  agarre: 12, agarreColea: 1.6, colea: 20, coleaFreno: 8, // agarre lateral (por segundo) y desde qué velocidad colea
  terreno: { rough: 0.7, bunker: 0.45 },
  llegar: 4, llegarBosque: 10,
}
const NO_SE_PASA = new Set(['t', 'x'])
/** El carrito donde Marcos se baja: al lado de la pelota, mirando para donde va. */
export function crearCarro(pos, ang = -Math.PI / 2) {
  return { pos: [...pos], ang, v: 0, vl: 0, colea: false }
}
/**
 * Un paso del carrito. `mando` = { acelerar, frenar, reversa, izq, der } (true/false). Muta el carro (`v` = velocidad
 * hacia adelante, `vl` = de costado, `colea` = si está derrapando); devuelve 'choque' si se pegó contra un árbol o el afuera.
 */
export function manejar(campo, carro, mando, dt) {
  const c = CARRITO
  const piso = c.terreno[terreno(campo, carro.pos).tipo] ?? 1
  const base = c.vmax * piso, tope = c.turbo * piso
  let v = carro.v
  if (mando.frenar) v -= Math.sign(v) * Math.min(Math.abs(v), c.freno * dt)
  else if (mando.acelerar && !mando.reversa) {
    if (v < 0) v += c.frenoMotor * dt
    else if (v < base) v = Math.min(base + 0.01, v + c.acel * dt)
    else v = Math.min(tope, v + c.acelTurbo * Math.max(0.5, 1 - (v - base) / (tope - base)) * dt) // turbo: de menos a más
  } else if (mando.reversa && !mando.acelerar) v = Math.max(-c.atras, v - (v > 0 ? c.frenoMotor : c.acel) * dt)
  else v -= Math.sign(v) * Math.min(Math.abs(v), (c.roce + Math.abs(v) * 0.08) * dt) // suelta: se frena solo
  if (v > tope) v = Math.max(tope, v - c.freno * dt) // entró al rough rápido: frena
  // dobla según la velocidad (quieto no dobla; en reversa, al revés). La velocidad de antes queda: si no agarra, colea
  const giro = (mando.der ? 1 : 0) - (mando.izq ? 1 : 0)
  const wx = Math.cos(carro.ang) * v - Math.sin(carro.ang) * (carro.vl ?? 0)
  const wy = Math.sin(carro.ang) * v + Math.cos(carro.ang) * (carro.vl ?? 0)
  carro.ang += giro * c.giro * dt * Math.max(-1, Math.min(1, v / 4))
  const f = [Math.cos(carro.ang), Math.sin(carro.ang)], l = [-f[1], f[0]]
  v = wx * f[0] + wy * f[1]
  let vl = wx * l[0] + wy * l[1]
  const suelta = giro !== 0 && (Math.abs(v) > c.colea || (mando.frenar && Math.abs(v) > c.coleaFreno))
  vl *= Math.exp(-(suelta ? c.agarreColea : c.agarre) * dt)
  v -= Math.sign(v) * Math.min(Math.abs(v), Math.abs(vl) * 0.25 * dt) // de costado, la goma frena un poco
  carro.v = v
  carro.vl = vl
  carro.colea = Math.abs(vl) > 2.5
  const nueva = [carro.pos[0] + (f[0] * v + l[0] * vl) * dt, carro.pos[1] + (f[1] * v + l[1] * vl) * dt]
  // la trompa (o la cola, en reversa) y el centro no pueden entrar a un árbol
  const punta = Math.sign(v || 1) * c.largo * 0.5
  const frente = [nueva[0] + f[0] * punta, nueva[1] + f[1] * punta]
  if (NO_SE_PASA.has(celda(campo, nueva)) || NO_SE_PASA.has(celda(campo, frente))) {
    carro.v = -v * 0.25 // rebota un poquito
    carro.vl = 0
    carro.colea = false
    return 'choque'
  }
  carro.pos = nueva
  return null
}
// Los monos persiguen el carrito; si lo pisás andando, queda aplastado ahí (el resto de la ronda) y es un golpe de multa.
export const ATROPELLO = { radio: 2, vel: 2 }
/** Los monos que el carrito pisó en este paso (cada uno, +1 golpe). */
export function atropellar(r) {
  const c = r.carro
  const pisados = []
  if (!c || Math.abs(c.v) < ATROPELLO.vel) return pisados
  for (const s of r.monos) {
    if (!monoActivo(s) || dist(s.pos, c.pos) > ATROPELLO.radio) continue
    s.modo = 'aplastado'
    s.pancho = null
    s.aplastadoAng = c.ang
    r.golpes += 1
    r.aplastados = (r.aplastados ?? 0) + 1
    pisados.push(s)
  }
  return pisados
}
/** Arriba del carrito: los monos cercanos salen a buscarlo a él (no a la pelota). */
export const perseguirCarro = (r) => despertarMonos(r.monos, r.carro.pos, alertaDe(r))

/** El carrito estacionado al lado de una salida (al empezar, o al volver al tee porque los monos se la llevaron). */
export const carroAlLado = (p) => crearCarro([p[0] + 2.5, p[1] + 2])

/** ¿Llegó a la pelota? (en el bosque alcanza con acercarse: el último tramo, a pie) */
export function carroLlego(campo, carro, pelota) {
  const lejos = NO_SE_PASA.has(celda(campo, pelota)) ? CARRITO.llegarBosque : CARRITO.llegar
  return dist(carro.pos, pelota) <= lejos
}
export const usaCarrito = (r) => habilidadDe(r.jugador)?.id === 'carrito'

// ── el match (desafíos) ──
// El que desafía juega una vez y su vuelta queda grabada; el desafiado juega después con el fantasma al lado.
// Los dos juegan con las MISMAS condiciones: el viento de cada hoyo y dónde está cada bandera salen de una
// semilla (no del player que elija cada uno). El error de los tiros y los monos, no: eso es de cada uno.
export const MATCH = { muestraMs: 100, maxMuestras: 6000 }
/** El viento de cada hoyo y las banderas de un match, a partir de su semilla. */
export function condicionesMatch(semilla) {
  const rv = rngDesde(semilla), rb = rngDesde((semilla ^ 0x5bd1e995) >>> 0)
  const vientos = HOYOS.map(() => vientoAleatorio(rv))
  const conBanderas = sortearBanderas({}, rb)
  return { semilla, vientos, pines: conBanderas.hoyos.map((h) => ({ pin: [...h.pin], bandera: h.bandera })) }
}
/** Pone las condiciones del match en la ronda (banderas y el viento del primer hoyo; los siguientes, en cerrarHoyo). */
export function aplicarMatch(r, cond) {
  r.match = cond
  r.hoyos = HOYOS.map((h, i) => ({ ...h, pin: [...cond.pines[i].pin], bandera: cond.pines[i].bandera }))
  r.viento = { ...cond.vientos[r.idx] }
  if (r.ruleta) r.ruleta.rng = rngDesde((cond.semilla ^ 0x2545f491) >>> 0) // la Ruleta: la misma tanda de players para los dos
  return r
}
/**
 * La grabación del fantasma: muestras [ms, hoyo, x, y, altura, golpes totales], una cada `muestraMs` y solo si
 * algo cambió (la pelota quieta no ocupa lugar).
 */
export function grabar(g, ms, idx, pos, alt, golpes) {
  const u = g[g.length - 1]
  if (u && ms - u[0] < MATCH.muestraMs) return g
  const m = [Math.round(ms), idx, Math.round(pos[0] * 10) / 10, Math.round(pos[1] * 10) / 10, Math.round(alt || 0), golpes]
  if (u && u[1] === m[1] && u[2] === m[2] && u[3] === m[3] && u[4] === m[4] && u[5] === m[5]) return g
  if (g.length < MATCH.maxMuestras) g.push(m)
  return g
}
/**
 * Dónde está el fantasma a los `ms` de su vuelta: entre dos muestras seguidas del mismo hoyo, interpolado; si
 * entre una y otra pasó un rato (la pelota quieta), se queda en la primera hasta que se mueve.
 */
export function fantasmaEn(g, ms) {
  if (!g?.length) return null
  let lo = 0, hi = g.length - 1
  if (ms < g[0][0]) return { idx: g[0][1], pos: [g[0][2], g[0][3]], alt: g[0][4], golpes: g[0][5], fin: false }
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (g[m][0] <= ms) lo = m; else hi = m - 1 }
  const a = g[lo], b = g[lo + 1]
  if (!b) return { idx: a[1], pos: [a[2], a[3]], alt: a[4], golpes: a[5], fin: true }
  if (b[1] !== a[1] || b[0] - a[0] > MATCH.muestraMs * 2.5) return { idx: a[1], pos: [a[2], a[3]], alt: a[4], golpes: a[5], fin: false }
  const u = (ms - a[0]) / (b[0] - a[0])
  return { idx: a[1], pos: [a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u], alt: a[4] + (b[4] - a[4]) * u, golpes: a[5], fin: false }
}
/**
 * El marcador del fantasma hasta `ms`: los golpes de cada hoyo (cada muestra lleva los golpes ACUMULADOS de la vuelta,
 * así que los de un hoyo = el acumulado al terminarlo − el del hoyo anterior). `porHoyo[k]` es null si todavía no llegó
 * a ese hoyo; el del hoyo que está jugando va contando en vivo. `idx` = el hoyo que juega, `fin` = ya terminó.
 */
export function marcadorFantasma(g, ms) {
  const porHoyo = HOYOS.map(() => null)
  if (!g?.length || ms < g[0][0]) return { porHoyo, idx: g?.[0]?.[1] ?? 0, total: 0, fin: false }
  let lo = 0, hi = g.length - 1
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (g[m][0] <= ms) lo = m; else hi = m - 1 }
  const ultimo = new Map() // hoyo → acumulado en su última muestra
  for (let i = 0; i <= lo; i++) ultimo.set(g[i][1], g[i][5] ?? 0)
  let antes = 0
  for (let k = 0; k < porHoyo.length; k++) {
    if (!ultimo.has(k)) break
    porHoyo[k] = Math.max(0, ultimo.get(k) - antes)
    antes = ultimo.get(k)
  }
  return { porHoyo, idx: Math.min(g[lo][1], porHoyo.length - 1), total: g[lo][5] ?? 0, fin: lo === g.length - 1 }
}
/** Quién gana el match: 1 gana `a`, −1 gana `b`, 0 empate. Menos golpes; a igual golpes, el más rápido; LP (golpes null) pierde. */
export function ganadorMatch(a, b) {
  const ga = a?.golpes ?? null, gb = b?.golpes ?? null
  if (ga == null && gb == null) return 0
  if (ga == null) return -1
  if (gb == null) return 1
  if (ga !== gb) return ga < gb ? 1 : -1
  if ((a.ms ?? Infinity) !== (b.ms ?? Infinity)) return (a.ms ?? Infinity) < (b.ms ?? Infinity) ? 1 : -1
  return 0
}
/** Si el match lo definió el tiempo: los dos con los mismos golpes (ninguno LP) y distinto tiempo. */
export function porTiempo(a, b) {
  const ga = a?.golpes ?? null
  return ga != null && ga === (b?.golpes ?? null) && (a.ms ?? Infinity) !== (b.ms ?? Infinity)
}

// ── banderas ──
// La bandera cambia de lugar en cada ronda: en cualquier parte del green a `margen` yardas o más del borde. Esa zona
// se parte en tres tercios a lo largo de la línea del tee al green; el color dice en cuál está: roja adelante (el
// tercio más cerca del tee), blanca en el medio y azul al fondo.
export const BANDERA = { margen: 6, colores: ['roja', 'blanca', 'azul'] }
const POSICIONES = new Map()
/** Los lugares posibles para la bandera de un hoyo, en sus tres tercios: [[...adelante], [...medio], [...fondo]]. */
export function posicionesBandera(h) {
  if (POSICIONES.has(h.n)) return POSICIONES.get(h.n)
  const campo = crearCampo()
  const verde = new Set()
  const celdas = []
  const [px, py] = h.pin.map(Math.floor)
  for (let y = py - 50; y <= py + 50; y++) for (let x = px - 50; x <= px + 50; x++) {
    const t = terreno(campo, [x + 0.5, y + 0.5])
    if (t.tipo === 'green' && t.hoyo === h.n) { verde.add(y * 10000 + x); celdas.push([x, y]) }
  }
  // del tee al centro del green: para partirlo en tercios
  const cx = celdas.reduce((s, c) => s + c[0], 0) / celdas.length + 0.5
  const cy = celdas.reduce((s, c) => s + c[1], 0) / celdas.length + 0.5
  const dl = Math.hypot(cx - h.azul[0], cy - h.azul[1])
  const u = [(cx - h.azul[0]) / dl, (cy - h.azul[1]) / dl]
  const proy = (x, y) => (x + 0.5) * u[0] + (y + 0.5) * u[1]
  const m = BANDERA.margen
  const validas = celdas.filter(([x, y]) => {
    for (let dy = -m; dy <= m; dy++) for (let dx = -m; dx <= m; dx++) {
      if (dx * dx + dy * dy <= m * m && !verde.has((y + dy) * 10000 + (x + dx))) return false
    }
    return true
  })
  // los tercios se cuentan sobre la parte del green donde puede ir la bandera (las puntas angostas no cuentan):
  // así en los tres hoyos pueden salir los tres colores
  let lo = Infinity, hi = -Infinity
  for (const [x, y] of validas) { const q = proy(x, y); lo = Math.min(lo, q); hi = Math.max(hi, q) }
  const tercios = [[], [], []]
  for (const [x, y] of validas) tercios[Math.min(2, Math.floor(((proy(x, y) - lo) / (hi - lo)) * 3))].push([x + 0.5, y + 0.5])
  const res = { tercios, lo, hi, u }
  POSICIONES.set(h.n, res)
  return res
}
/** El color de la bandera según en qué tercio del green está. */
export function colorBandera(h, pin) {
  const { lo, hi, u } = posicionesBandera(h)
  const k = Math.max(0, Math.min(2, Math.floor(((pin[0] * u[0] + pin[1] * u[1] - lo) / (hi - lo)) * 3)))
  return BANDERA.colores[k]
}
/** Sortea dónde está la bandera de cada hoyo en esta ronda (un tercio al azar y un lugar al azar en ese tercio). */
export function sortearBanderas(r, rng) {
  r.hoyos = HOYOS.map((h) => {
    const { tercios } = posicionesBandera(h)
    const hay = [0, 1, 2].filter((k) => tercios[k].length)
    const k = elegir(rng, hay)
    return { ...h, pin: [...elegir(rng, tercios[k])], bandera: BANDERA.colores[k] }
  })
  return r
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
export const monoActivo = (s) => s.modo !== 'aplastado' && (s.modo === 'caza' || s.espera <= 0)

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
    if (s.modo === 'aplastado') continue // el que pisó el carrito de Marcos queda ahí
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
    if (s.modo === 'aplastado' || dist(s.pos, pelota) > alerta) continue
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

/** El tiro de salida de cada hoyo: ahí los monos no salen a cazar (te dejan pegar tranquilo desde el tee). */
export const esSalida = (r) => r.golpes === 0 && r.lie === 'tee'
/**
 * ¿Pega desde el tee del hoyo que se juega? (la bomba de Miguelón, el drive de Liberty, "drive" en el relato).
 * La pelota que quedó en el tee de OTRO hoyo se juega como cualquier otra, no como salida.
 */
export const desdeLaSalida = (campo, r) => r.lie === 'tee' && terreno(campo, r.pelota).hoyo === hoyoActual(r).n
/** Los monos cercanos salen a buscar la pelota, menos en la salida. Devuelve cuántos vienen. */
export function despertarMonosDe(r) {
  if (esSalida(r)) return 0
  return despertarMonos(r.monos, r.pelota, alertaDe(r))
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
    // los 3 metros son reales (los que muestra el marcador): la distancia del dibujo pasa por la escala del hoyo
    const noLaFalla = hab?.id === 'dadas' && dist(b, pin) * hoyoActual(r).escala <= DADA
    const retro = hab?.id === 'retro'
    return { putt: true, cuerda: angulo, carry, destino: [b[0] + Math.cos(angulo) * carry, b[1] + Math.sin(angulo) * carry], control: null, disp: null, error: retro ? 0 : dif.error, recto: retro || hab?.id === 'derecho' || !!r.calma, giro, noLaFalla }
  }
  const tee = desdeLaSalida(campo, r)
  const plan = planBase(angulo, potencia, r.lie)
  plan.salida = tee
  // el carry en yardas reales (según el handicap) pasado a yardas del dibujo con la escala del hoyo
  const escala = hoyoActual(r).escala
  const par = hoyoActual(r).par
  plan.carry = (potencia * carryMaxDe(r.jugador?.hcp, par) * (FISICA.factorLie[r.lie] ?? 1)) / escala
  plan.real = FISICA.factorReal[r.lie] ?? 1 // el bunker: la mitad de lo que se ve
  plan.disp = { ...plan.disp, ang: plan.disp.ang * dif.error, carry: plan.disp.carry * dif.error }
  // la bomba: Miguelón y Taiu (la Rana)
  const bombero = hab?.id === 'bomba' || hab?.id === 'reves'
  if (bombero && tee) plan.carry = (potencia * (par === 3 ? carryPar3De(r.jugador?.hcp) : BOMBA.carry)) / escala // en el par 3, sin bomba
  if (bombero && tee && plan.carry * escala > BOMBA.zona) {
    const q = Math.max(0, Math.min(1, precision))
    plan.bomba = true
    plan.perfecta = q >= BOMBA.perfecta
    const grados = plan.perfecta ? BOMBA.angPerfecta : BOMBA.angBase + BOMBA.angMala * (1 - q)
    plan.disp = { ang: ((grados * Math.PI) / 180) * dif.error, carry: (plan.perfecta ? 0.02 : 0.05 + 0.15 * (1 - q)) * dif.error, fondo: false }
  }
  if (hab?.id === 'approach') {
    // Liberty: el drive, perfecto; el approach, una tragedia
    const d = dist(b, hoyoActual(r).pin) * escala // yardas reales
    if (tee) plan.disp = { ...plan.disp, ang: 0, carry: plan.disp.carry * 0.5 }
    else if (d >= APPROACH.desde && d <= APPROACH.hasta) { plan.disp = { ...plan.disp, ang: plan.disp.ang * APPROACH.error, carry: plan.disp.carry * APPROACH.error }; plan.approach = true }
  }
  if (hab?.id === 'reves' && !tee) {
    // Taiu: el approach, perfecto (de 30 a 100 yd reales del hoyo, sin error; el viento sí)
    const d = dist(b, hoyoActual(r).pin) * escala
    if (d >= APPROACH.desde && d <= APPROACH.hasta) { plan.disp = { ...plan.disp, ang: 0, carry: 0 }; plan.approachPerfecto = true }
  }
  if (r.calma) {
    // LG no se enoja: después de un mal tiro, este sale sin error
    plan.disp = { ...plan.disp, ang: 0, carry: 0 }
    plan.calma = true
  }
  if (hab?.id === 'derecho') {
    plan.disp = { ...plan.disp, ang: 0 } // siempre derecho
  }
  // Demetrio: pega perfecto (ni error de dirección ni de largo) y llega a lo que se ve, también desde el bunker
  if (hab?.id === 'retro') { plan.disp = { ...plan.disp, ang: 0, carry: 0 }; plan.real = 1; plan.exacto = true }
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
    // AGUILA.chip son yardas reales; `radio` = hasta dónde tira el imán, en yardas del dibujo
    if (dist(b, pin) * escala <= AGUILA.chip) plan.iman = { meter: true, radio: AGUILA.chip / escala }
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
  const carry = Math.max(0, p.carry * (p.real ?? FISICA.factorReal[lie] ?? 1) * (p.bomba ? 1 - Math.abs(g) * p.disp.carry : 1 + g * p.disp.carry))
  const a = p.cuerda + err
  const carryVec = [Math.cos(a) * carry, Math.sin(a) * carry]
  let controlVec = [carryVec[0] / 2, carryVec[1] / 2] // recto: el control en el medio
  if (p.control) {
    const k = p.carry ? carry / p.carry : 0
    const cx = p.control[0] - pelota[0]
    const cy = p.control[1] - pelota[1]
    controlVec = [(cx * Math.cos(err) - cy * Math.sin(err)) * k, (cx * Math.sin(err) + cy * Math.cos(err)) * k]
  }
  const kv = viento.kmh * FISICA.vientoYd * Math.pow(carry / FISICA.carryMax, FISICA.vientoExp)
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
    salida: p.salida ?? lie === 'tee', // el tiro de salida (desde el tee del hoyo que se juega, no el de otro)
    liberty: (p.salida ?? lie === 'tee') && !p.putt,
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
    if (u > 0.02 && !tiro.alHoyo && robo(tiro)) return tiro.fase // el tiro de Deme (o el de par de Demetrio) no lo para nadie
    // los golpes del Mago vuelan por arriba de los pinos (menos la viborita, que va al ras)
    const pino = !tiro.alHoyo && !tiro.exacto && (!tiro.comba || tiro.rasante) && u > 0.02 && u < 1 && tiro.alt < FISICA.alturaPino ? pinoEn(campo, tiro.pos) : null
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
      // Demetrio: pica exactamente donde apuntó y ahí se queda (si es la boca de un hoyo, adentro)
      if (tiro.exacto) {
        const otro = (tiro.ajenos ?? []).find((a) => dist(tiro.pos, a.pin) < FISICA.bocaHoyo)
        if (otro) return caerAjeno(tiro, otro)
        tiro.v = [0, 0]
        tiro.fase = 'quieta'
        if (pin && dist(tiro.pos, pin) < FISICA.bocaHoyo) {
          tiro.pos = [...pin]
          tiro.embocada = true
          tiro.eventos.push({ tipo: 'clavada' }, { tipo: 'embocada' })
        }
        return tiro.fase
      }
      // cayó en la boca de OTRO hoyo (de los que no se juegan)
      const otro = !tiro.alHoyo && tiro.modo === 'full' ? (tiro.ajenos ?? []).find((a) => suerteDe(tiro) < chanceClavada(dist(tiro.pos, a.pin))) : null
      if (otro) return caerAjeno(tiro, otro)
      // cayó en la boca del hoyo: puede quedar adentro de aire
      if (pin && tiro.modo === 'full' && (tiro.alHoyo || suerteDe(tiro) < chanceClavada(dist(tiro.pos, pin)))) {
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
  if (ter.tipo === 'green' && tiro.iman && pin && dist(tiro.pos, pin) < (tiro.iman.radio ?? AGUILA.chip)) {
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
    const c = caidaEn(h, tiro.pos)
    tiro.v = [tiro.v[0] + c[0] * dt, tiro.v[1] + c[1] * dt]
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
    const otro = (tiro.ajenos ?? []).find((a) => dist(tiro.pos, a.pin) < FISICA.bocaHoyo)
    if (otro) return caerAjeno(tiro, otro)
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
  const otro = pasaPorOtroHoyo(tiro, prev)
  if (otro) return caerAjeno(tiro, otro)

  // recién salida de la corbata, la pelota todavía está en la boca: no la vuelve a agarrar hasta salir
  const saliendo = (tiro.vuelta || tiro.salto) && dist(prev, pin) < FISICA.bocaHoyo + 0.01
  const cerca = pin && !saliendo ? cercanoEnSegmento(pin, prev, tiro.pos) : null
  // se decide en el punto más cercano al centro: mientras se sigue acercando, todavía no
  if (cerca && dist(cerca, pin) < FISICA.bocaHoyo && dist(cerca, tiro.pos) > 1e-9) {
    const v = Math.hypot(tiro.v[0], tiro.v[1])
    const d = dist(cerca, pin)
    // desde afuera del green, llegando rápido, tiene su chance (si no, sigue: corbata o labio)
    // Demetrio: si la línea pasa por la boca, entra (sin labios ni corbatas)
    if (tiro.exacto || v < limiteEmbocar(d) || (tiro.modo === 'full' && suerteDe(tiro) < chanceRodando(d, v))) {
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

/**
 * La boca de OTRO hoyo (uno que no se juega): la pelota que pasa rodando se decide una vez, en el punto
 * más cercano al centro, con las mismas reglas que el hoyo propio (sin corbata). Devuelve ese hoyo o null.
 */
function pasaPorOtroHoyo(tiro, prev) {
  for (const a of tiro.ajenos ?? []) {
    if (tiro.ajenosVistos?.includes(a.n)) continue
    const cerca = cercanoEnSegmento(a.pin, prev, tiro.pos)
    const d = dist(cerca, a.pin)
    if (d >= FISICA.bocaHoyo || dist(cerca, tiro.pos) <= 1e-9) continue
    ;(tiro.ajenosVistos ??= []).push(a.n)
    const v = Math.hypot(tiro.v[0], tiro.v[1])
    if (tiro.exacto || v < limiteEmbocar(d) || (tiro.modo === 'full' && suerteDe(tiro) < chanceRodando(d, v))) return a
  }
  return null
}
function caerAjeno(tiro, a) {
  tiro.pos = [...a.pin]
  tiro.v = [0, 0]
  tiro.alt = 0
  tiro.ajena = a.n
  tiro.eventos.push({ tipo: 'ajena', n: a.n })
  tiro.fase = 'quieta'
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
  const ruleta = esRuleta(jugador)
  const tee = ruleta ? 'blanca' : colorTee(jugador) // en la Ruleta pega cada uno, de las blancas para todos
  const r = {
    jugador, // el que pega (en la Ruleta, cambia en cada tiro; ver turnoRuleta)
    carta: jugador, // la que elegiste en el mazo: la de la tarjeta, el ranking y el récord
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
  // Marcos arranca con el carrito estacionado al lado del tee del 15
  if (habilidadDe(jugador)?.id === 'carrito') r.carro = carroAlLado(r.pelota)
  if (habilidadDe(jugador)?.id === 'deme') r.deme = { usado: false, listo: false }
  if (habilidadDe(jugador)?.id === 'retro') r.monos = [] // 1960: en la cancha de Demetrio no hay monos
  // la Ruleta: hasta que gire por primera vez, "pega" la carta de la Ruleta (sin habilidad)
  if (ruleta) { r.ruleta = { pool: jugador.pool ?? [], tiros: [], rng: null }; r.ruletaToca = true }
  return r
}

// ── desbloqueos: un player que se gana con vueltas firmadas (Taiu: −1 o mejor con cada uno de los otros Dicky) ──
/** `req` = { con: [apodos], vsPar }; `records` = { [apodo]: mejor vsPar firmado }. Cómo vas con cada uno. */
export function progresoDesbloqueo(req, records) {
  const items = req.con.map((apodo) => {
    const mejor = records?.[apodo] ?? null
    return { apodo, mejor, ok: mejor != null && mejor <= req.vsPar }
  })
  return { items, hechos: items.filter((i) => i.ok).length, listo: items.every((i) => i.ok) }
}

// ── La Ruleta: cada tiro lo pega un player distinto ──
export const esRuleta = (j) => habilidadDe(j)?.id === 'ruleta'
/** La carta de la vuelta (la del mazo). En la Ruleta, `r.jugador` es el que pega ahora; la carta es la Ruleta. */
export const cartaDe = (r) => r.carta ?? r.jugador
/**
 * Gira la Ruleta si toca (al empezar y después de cada golpe; no si no pegaste: los monos que te la roban
 * antes de pegar o el LP del Ninja no cuentan como tiro). Sale cualquiera del mazo menos el que pegó el
 * anterior, y la ronda queda lista para él: el golpe del Mago, los panchos de la Mugre, el carrito de Marcos
 * (estacionado donde pegó el anterior: maneja hasta la pelota) y el Deme de Maxi (uno por vuelta, de cualquiera).
 * En un match la Ruleta sale de la semilla (`r.ruleta.rng`): los dos juegan con la misma tanda.
 * Devuelve el que pega, o null si no giró.
 */
export function turnoRuleta(r, rng) {
  if (!r.ruleta || !r.ruletaToca || r.terminada) return null
  r.ruletaToca = false
  const antes = r.jugador
  const pool = r.ruleta.pool.filter((j) => j.apodo !== antes?.apodo)
  if (!pool.length) return null
  const j = elegir(r.ruleta.rng ?? rng, pool)
  r.jugador = j
  const id = habilidadDe(j)?.id
  r.golpeMago = id === 'comba' ? sortearGolpeMago(rng, null) : null
  r.panchos = id === 'panchitos' ? MUGRE.panchos : 0
  r.carro = id === 'carrito' ? carroAlLado(r.desde) : null
  if (id === 'deme') r.deme ??= { usado: false, listo: false }
  r.ruleta.tiros.push({ n: hoyoActual(r).n, apodo: j.apodo, emoji: j.emoji })
  return j
}
/** Quién pegó cada tiro, por hoyo: [{ n, tiros: [{ apodo, emoji }] }] (para la tarjeta y lo que se comparte). */
export function tirosRuleta(r) {
  if (!r.ruleta) return []
  // si terminó levantando, el último que salió no llegó a pegar: no va
  const tiros = r.terminada && !r.ruletaToca ? r.ruleta.tiros.slice(0, -1) : r.ruleta.tiros
  const por = []
  for (const t of tiros) {
    let h = por.find((x) => x.n === t.n)
    if (!h) por.push((h = { n: t.n, tiros: [] }))
    h.tiros.push(t)
  }
  return por
}
/** El golpe del Mago para el próximo tiro: al azar, distinto del anterior. */
export function sortearGolpeMago(rng, antes) {
  return elegir(rng, GOLPES_MAGO.filter((g) => g.id !== antes)).id
}
export const golpeMagoDe = (r) => GOLPES_MAGO.find((g) => g.id === r.golpeMago) ?? null
// La ronda puede traer sus propias banderas (`sortearBanderas`): entonces el hoyo es su copia, con su `pin`.
export const hoyoActual = (r) => (r.hoyos ?? HOYOS)[r.idx]
export const enModoPutt = (campo, r) => r.lie === 'green' && terreno(campo, r.pelota).hoyo === hoyoActual(r).n

/**
 * El árbol contra el que pega el tiro apuntado en la SALIDA (la primera mitad del vuelo, todavía bajo),
 * sin error ni viento: para marcarlo al apuntar. Null si no pega (o si pasa por arriba).
 */
export function pinoEnLaSalida(campo, pelota, plan) {
  if (!plan || plan.putt || plan.exacto || (plan.comba && !plan.rasante) || !plan.carry) return null // a Demetrio los árboles no lo tocan
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
  if (r.ruleta) r.ruletaToca = true // pegó: el próximo tiro, gira la Ruleta
  calmarMonos(r.monos)
  // Maxi invocó a Deme: este tiro, pegue como pegue, va derecho al hoyo y entra (sin error, sin viento)
  if (r.deme?.listo) { r.deme.listo = false; const t = tiroAlHoyo(campo, r, plan, rng); t.deme = true; return t }
  const hab = habilidadDe(r.jugador)
  // Demetrio: el tiro para par entra siempre, esté donde esté
  if (hab?.id === 'retro' && r.golpes >= hoyoActual(r).par) { const t = tiroAlHoyo(campo, r, plan, rng); t.retro = true; return t }
  const retro = hab?.id === 'retro'
  const tiro = lanzar(campo, { pelota: r.pelota, angulo, potencia, viento: retro ? { ang: 0, kmh: 0 } : r.viento, putt: plan.putt, lie: r.lie, rng, plan })
  tiro.monos = r.monos
  tiro.exacto = retro // Demetrio: queda exactamente donde apuntó (ver avanzar)
  tiro.ajenos = (r.hoyos ?? HOYOS).filter((h) => h.n !== hoyoActual(r).n).map((h) => ({ n: h.n, pin: h.pin }))
  tiro.greenPlano = hab?.id === 'perro' || retro // a Demetrio la caída del green tampoco le hace nada
  tiro.calma = !!r.calma
  r.calma = false
  if (r.prestado) tiro.prestado = r.jugador.apodo // la Dickyllamada: este lo pegó el Dicky que atendió
  // Joaco: de 3 metros no la falla. Le pegue como le pegue, la pelota va al hoyo (el imán, metiéndola)
  if (plan.noLaFalla) tiro.iman = { meter: true, lechu: true }
  if (r.golpeMago && !plan.putt) r.golpeMago = sortearGolpeMago(rng, r.golpeMago) // el próximo, otro efecto
  return tiro
}

// ── Deme, el mentor (la habilidad de Maxi Vacca, "Grandpa") ──
/** ¿Puede llamar a Deme ahora? Una vez por vuelta y nunca desde el tee (en la salida, Deme no viene). */
export const puedeInvocarDeme = (r) => habilidadDe(r.jugador)?.id === 'deme' && !!r.deme && !r.deme.usado && !r.deme.listo && r.lie !== 'tee'
/** Deme le dio el consejo: el próximo tiro es el de Deme. */
export function invocarDeme(r) {
  if (!puedeInvocarDeme(r)) return false
  r.deme.usado = true
  r.deme.listo = true
  return true
}
/** Derecho al hoyo desde donde esté y adentro (el tiro de Deme y el de par de Demetrio); en el green, el putt rueda solo adentro. */
function tiroAlHoyo(campo, r, plan, rng) {
  const pin = hoyoActual(r).pin
  const ang = Math.atan2(pin[1] - r.pelota[1], pin[0] - r.pelota[0])
  const calma = { ang: 0, kmh: 0 }
  let tiro
  if (plan.putt) {
    tiro = lanzar(campo, { pelota: r.pelota, angulo: ang, potencia: 0.2, viento: calma, putt: true, lie: r.lie, rng, plan: { ...plan, recto: true, giro: 0 } })
    tiro.iman = { meter: true, deme: true }
  } else {
    const derecho = { putt: false, cuerda: ang, carry: dist(r.pelota, pin), disp: { ang: 0, carry: 0 }, control: null, real: 1, alto: 1.3 }
    tiro = lanzar(campo, { pelota: r.pelota, angulo: ang, potencia: 1, viento: calma, putt: false, lie: r.lie, rng, plan: derecho })
  }
  tiro.alHoyo = true
  tiro.monos = r.monos
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
  // Marcos no maneja de vuelta hasta el tee: arranca de nuevo con el carrito ahí
  if (r.carro) r.carro = carroAlLado(r.pelota)
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
  devolverDicky(r) // la Dickyllamada: el Dicky que te pegó el tiro te devuelve el palo
  return res
}
const esMalo = (res, tiro) => ['afuera', 'mono-malo', 'mono-ladron'].includes(res.tipo) || ['rough', 'bunker'].includes(res.terreno) || tiro.eventos.some((e) => e.tipo === 'palo')

function resolver(campo, r, tiro, rng) {
  const hoyo = hoyoActual(r)
  if (tiro.embocada) return { tipo: 'embocada' }
  if (tiro.ajena) {
    // en el hoyo de OTRO: el golpe cuenta y se sigue jugando el propio. Alivio sin multa, afuera de ese green
    const otro = (r.hoyos ?? HOYOS).find((h) => h.n === tiro.ajena)
    r.ajenas = (r.ajenas ?? 0) + 1
    r.pelota = alivioDeGreen(campo, otro.pin, hoyo.pin) ?? [...r.desde]
    r.lie = terreno(campo, r.pelota).tipo
    return { tipo: 'ajena', n: tiro.ajena, jugando: hoyo.n, desde: [...otro.pin] }
  }
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
  // en la cancha de Demetrio (1960) no hay monos: del bosque se juega como está
  if (ter.tipo === 'bosque' && habilidadDe(r.jugador)?.id !== 'retro') {
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

/** Alivio del green equivocado: el fairway o rough sin árbol más cerca de `p`, del lado del hoyo que se juega. */
export function alivioDeGreen(campo, p, pin) {
  for (let r = 1; r <= 40; r += 0.5) {
    let mejor = null
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * 2 * Math.PI
      const q = [p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r]
      const t = terreno(campo, q).tipo
      if ((t !== 'fairway' && t !== 'rough') || pinoEn(campo, q)) continue
      if (!mejor || dist(q, pin) < dist(mejor, pin)) mejor = q
    }
    if (mejor) return mejor
  }
  return null
}

export const necesitaLP = (r) => r.golpes >= MAX_GOLPES

/**
 * El Ninja: su LP no levanta, resetea el hoyo (uno por vuelta). Vuelve al tee del hoyo que se juega con cero golpes,
 * sin multa (y los monos que venían, a su recorrido). Solo si ya pegó algo en este hoyo: desde el tee no tiene sentido.
 */
export const puedeResetNinja = (r) => habilidadDe(r.jugador)?.id === 'tradicion' && !r.resetNinja && r.golpes > 0 && !r.terminada
export function resetNinja(r) {
  const h = hoyoActual(r)
  calmarMonos(r.monos)
  r.resetNinja = h.n
  r.golpes = 0
  r.pelota = [...teeDe(r, h)]
  r.desde = [...r.pelota]
  r.lie = 'tee'
  r.lieDesde = 'tee'
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
  // Demetrio no hace más que par (ni con una multa)
  const fila = { n: h.n, par: h.par, golpes: habilidadDe(r.jugador)?.id === 'retro' ? Math.min(r.golpes, h.par) : r.golpes, lp: false }
  r.tarjeta.push(fila)
  r.idx += 1
  if (r.idx >= HOYOS.length) {
    r.terminada = true
  } else {
    const sig = hoyoActual(r)
    r.golpes = 0
    r.pelota = [...teeDe(r, sig)]
    r.desde = [...teeDe(r, sig)]
    r.lie = 'tee'
    r.lieDesde = 'tee'
    r.viento = r.match ? { ...r.match.vientos[r.idx] } : vientoAleatorio(rng) // en un match, el mismo viento para los dos
    if (r.panchos || habilidadDe(r.jugador)?.id === 'panchitos') r.panchos = MUGRE.panchos
  }
  return fila
}

// ── score ───────────────────────────────────────────────────────────────
export function totales(tarjeta) {
  const par = tarjeta.reduce((s, f) => s + f.par, 0)
  const lp = tarjeta.some((f) => f.lp)
  // Marcos: la apuesta de "¿jugaste con Rorro?" (−1 o +1 al total; ver apostarRorro)
  const golpes = lp ? null : tarjeta.reduce((s, f) => s + f.golpes, 0) + (tarjeta.rorro ?? 0)
  return { golpes, par, vsPar: lp ? null : golpes - par, lp }
}
/**
 * Marcos, al final de la vuelta: "¿Jugaste con Rorro?". Si dice que sí es una apuesta: 50 y 50 de que le reste
 * un golpe al total o de que le sume uno. Queda en la tarjeta (`tarjeta.rorro`, que `totales` suma). Devuelve −1 o +1.
 */
export function apostarRorro(r, rng) {
  r.tarjeta.rorro = rng() < 0.5 ? -1 : 1
  return r.tarjeta.rorro
}

// ── stats: vueltas, LP y promedio, en total y por player ──
/**
 * Los órdenes de las stats (players o usuarios): 'vueltas' (más jugados primero, el de siempre), 'promedio' (de menos
 * golpes a más; los que no firmaron ninguna, al final) o 'lp' (más LP primero). `de` saca las stats de cada fila.
 */
const ORDEN_STATS = {
  vueltas: (a, b) => b.jugadas - a.jugadas || (a.promGolpes ?? Infinity) - (b.promGolpes ?? Infinity),
  promedio: (a, b) => (a.promGolpes ?? Infinity) - (b.promGolpes ?? Infinity) || b.jugadas - a.jugadas,
  lp: (a, b) => b.lps - a.lps || b.pctLP - a.pctLP || b.jugadas - a.jugadas,
}
export function ordenarStats(lista, orden = 'vueltas', de = (x) => x) {
  const cmp = ORDEN_STATS[orden] ?? ORDEN_STATS.vueltas
  // Infinity - Infinity da NaN: cuenta como empate y sigue con el próximo criterio
  return [...lista].sort((a, b) => cmp(de(a), de(b)) || 0)
}

/**
 * `conteo` = [{ apodo, jugadas, lps }] (cada vuelta que llegó a la tarjeta final, firmada o no, LP incluido);
 * `marcas` = [{ apodo, golpes, vsPar }] (las vueltas firmadas). El promedio sale de las firmadas (las LP no tienen
 * score). Si una vuelta firmada es de antes del conteo, igual cuenta como jugada.
 */
export function estadisticas(conteo, marcas) {
  const por = new Map()
  const fila = (apodo) => {
    if (!por.has(apodo)) por.set(apodo, { apodo, jugadas: 0, lps: 0, firmadas: 0, sumaPar: 0, sumaGolpes: 0 })
    return por.get(apodo)
  }
  for (const c of conteo ?? []) { if (!c?.apodo) continue; const f = fila(c.apodo); f.jugadas += c.jugadas ?? 0; f.lps += c.lps ?? 0 }
  for (const m of marcas ?? []) {
    if (!m?.apodo || !(m.golpes > 0) || m.vsPar == null) continue
    const f = fila(m.apodo)
    f.firmadas += 1
    f.sumaPar += m.vsPar
    f.sumaGolpes += m.golpes
  }
  const cerrar = (f) => {
    const jugadas = Math.max(f.jugadas, f.firmadas + f.lps)
    return { apodo: f.apodo, jugadas, lps: f.lps, firmadas: f.firmadas, pctLP: jugadas ? f.lps / jugadas : 0, prom: f.firmadas ? f.sumaPar / f.firmadas : null, promGolpes: f.firmadas ? f.sumaGolpes / f.firmadas : null }
  }
  const lista = ordenarStats([...por.values()].map(cerrar).filter((f) => f.jugadas > 0))
  const suma = [...por.values()].reduce((t, f) => ({ apodo: null, jugadas: t.jugadas + f.jugadas, lps: t.lps + f.lps, firmadas: t.firmadas + f.firmadas, sumaPar: t.sumaPar + f.sumaPar, sumaGolpes: t.sumaGolpes + f.sumaGolpes }), { apodo: null, jugadas: 0, lps: 0, firmadas: 0, sumaPar: 0, sumaGolpes: 0 })
  // el total: cada player ya ajustado (jugadas >= firmadas + LP)
  const total = cerrar(suma)
  total.jugadas = lista.reduce((t, f) => t + f.jugadas, 0)
  total.pctLP = total.jugadas ? total.lps / total.jugadas : 0
  return { total, por: lista }
}
/** Un promedio vs. par con un decimal: "+2,3", "−0,5", "E". */
export const formatoProm = (v) => (v == null ? '—' : Math.abs(v) < 0.05 ? 'E' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1).replace('.', ',')}`)

// ── ranking: arriba el de menos golpes; a igual golpes, el más rápido (al milisegundo) ──
export const compararMarcas = (a, b) => a.golpes - b.golpes || a.ms - b.ms

/** La marca de una vuelta para el ranking (null si fue LP o no tiene tiempo). */
export function marcaDe(r, usuario) {
  const t = totales(r.tarjeta)
  if (t.lp || r.ms == null || !r.terminada) return null
  const j = cartaDe(r)
  return { usuario: String(usuario ?? '').trim(), apodo: j.apodo, emoji: j.emoji, golpes: t.golpes, vsPar: t.vsPar, ms: Math.round(r.ms) }
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
  ninjaReset: ['Acá no pasó nada 🥷', 'Reset ninja: de nuevo en el tee, cero golpes', 'El Ninja borró el hoyo. Nadie vio nada', 'LP ninja: el hoyo empieza de nuevo'],
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
// Con Rodal, Lucas (LG) aparece en pantalla y solo lo adula, pegue como pegue. Las frases van con el tiro: el drive
// se adula como drive, el approach como approach y el putt como putt (antes le decía "¡qué bomba!" a un putt).
export const ADULACION = {
  drive: {
    bueno: ['¡QUÉ BOMBA, RODI!', 'Ese drive lo escucharon en Pilar', 'Swing de manual, Mago. Bajala de ahí', 'Largo y derecho, como su palmarés', 'Ni DeChambeau la saca así', 'Drive de pentacampeón, señores', 'Con ese drive se compra un lote en el fairway'],
    malo: ['Drive táctico: abrió el hoyo para el segundo', 'La quiso hacer interesante, el Mago', 'Ese fairway le quedaba chico a semejante drive', 'Un drive de Penta no se mide en yardas', 'El árbol se corrió, yo lo vi', 'Le pegó tan fuerte que el viento se asustó'],
  },
  hierro: {
    bueno: ['Qué hierro, por favor', 'Hierro de exhibición, Rodi', 'Así se ataca una bandera', 'Le pegó con el palo y con el alma', 'Ese hierro va al museo del club', 'Contacto puro. Sonó a gloria'],
    malo: ['Hierro valiente: buscó el ángulo para el chip', 'La dejó donde nadie la busca: genio', 'Ni el viento entiende lo que pensó el Mago', 'Solo él ve esa línea', 'Táctica de pentacampeón: guarda lo mejor para después'],
  },
  approach: {
    bueno: ['Approach de seda, Mago', 'La tocó como a una guitarra', 'Qué manos, Rodi. Qué manos', 'Pegó un approach y aplaudió el green', 'Toque de cirujano', 'Así se juega cerca del green'],
    malo: ['Approach táctico: deja un putt para lucirse', 'La hizo difícil para que tenga gracia', 'Hasta el bunker quería tocar una pelota del Mago', 'Un approach que pocos entienden', 'El green se movió, Rodi. No fuiste vos'],
  },
  putt: {
    bueno: ['Qué toque: la dejó dada', 'Lag putt de manual, Rodi', 'La acarició. Es arte', 'Leyó la caída con los ojos cerrados', 'Velocidad perfecta, como siempre'],
    malo: ['Putt valiente: los cobardes la dejan corta', 'Lo leyó perfecto: el green se equivocó', 'Ese green no está a su altura, Mago', 'Le dio un paseíto por el green: generoso', 'La línea era buena, el pasto no'],
    corbata: ['Hasta la corbata le queda linda, Rodi', 'La pelota dio la vuelta para verlo mejor', 'Una corbata de seda, Mago'],
  },
  embocada: {
    putt: ['¡ADENTRO! Ni la miró', 'Embocó como respira', 'Putt de pentacampeón, señores', 'La vio entrar antes de pegarle', 'Ese putt va al resumen del año'],
    chip: ['¡CHIP IN! Obvio. Es el Mago', 'La metió de afuera. Clase mundial', 'Magia pura: de afuera del green, adentro'],
    hoyoEnUno: ['¡HOYO EN UNO! Lo sabíamos todos', 'Hoyo en uno. Normal para el Mago'],
  },
  mono: ['Hasta el Mono quería una foto con el Mago', 'El Mono se llevó un recuerdo del pentacampeón', 'Los monos también son fans, Rodi'],
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

/** Qué tiro fue: el drive (tee de par 4), el hierro (tee del par 3 o de más de 110 yd), el approach o el putt. */
export function tipoDeTiro(tiro, hoyo, desde, lieDesde) {
  if (tiro.modo === 'putt') return 'putt'
  if (tiro.salida ?? lieDesde === 'tee') return hoyo.par === 3 ? 'hierro' : 'drive'
  const yd = desde ? dist(desde, hoyo.pin) * (hoyo.escala ?? 1) : Infinity
  return yd > 110 ? 'hierro' : 'approach'
}

/** Lo que Lucas le dice a Rodal después del tiro (con el tipo de tiro y cómo salió). */
export function adular(rng, res, tiro, hoyo, { desde, lieDesde } = {}) {
  const tipo = tipoDeTiro(tiro, hoyo, desde, lieDesde)
  if (res.tipo === 'embocada') return elegir(rng, tipo === 'putt' ? ADULACION.embocada.putt : (tiro.salida ?? lieDesde === 'tee') ? ADULACION.embocada.hoyoEnUno : ADULACION.embocada.chip)
  if (res.tipo === 'afuera') return elegir(rng, ADULACION.afuera)
  if (res.tipo?.startsWith('mono')) return elegir(rng, ADULACION.mono)
  if (tipo === 'putt') {
    if (tiro.vuelta) return elegir(rng, ADULACION.putt.corbata)
    return elegir(rng, dist(tiro.pos, hoyo.pin) <= 1.5 ? ADULACION.putt.bueno : ADULACION.putt.malo)
  }
  const malo = ['rough', 'bunker', 'bosque'].includes(res.terreno) || tiro.eventos.some((e) => e.tipo === 'palo')
  return elegir(rng, ADULACION[tipo][malo ? 'malo' : 'bueno'])
}

// ── la Dickyllamada: el Dicky que juega llama a otro Dicky, que aparece y le dice algo tierno (no lo adula: lo quiere) ──
export const DICKY_AMOR = {
  todos: [
    (n) => `${n}, respirá. Acá estamos todos con vos 💛`,
    (n) => `Pase lo que pase en este tiro, ${n}, sos un Dicky. Y eso no te lo saca nadie`,
    (n) => `Te quiero, ${n}. Pegale tranquilo`,
    () => 'Si sale mal, te abrazo. Si sale bien, te abrazo más fuerte 🤗',
    () => 'No estás solo en la Trampa: estamos todos los Dicky',
    (n) => `Ni el Mono te saca lo que valés, ${n}`,
    () => 'Un abrazo desde el 19. Te guardo una birra fría 🍺',
    () => 'Sos mi Dicky favorito. No se lo digas a los otros 🤫',
    () => 'Cerrá los ojos un segundo… listo. Ahora pegale con el corazón 💚',
    (n) => `Hagas lo que hagas, ${n}, te banco`,
    () => 'Lo lindo es jugarla juntos. El score es lo de menos',
    (n) => `Qué lindo verte jugar, ${n}`,
  ],
  // después de un buen tiro
  bien: [
    (n) => `¡Eso, ${n}! Qué orgullo verte jugar así 💛`,
    () => 'Te salió hermoso. Te mando un abrazo enorme 🤗',
    (n) => `${n}, sos lo más. Y no lo digo por el tiro`,
    () => 'Qué lindo tiro. Me emocioné un poquito 🥹',
  ],
  // después de un mal tiro (afuera, Mono, rough, bunker): consuelo, nunca reto
  mal: [
    (n) => `No pasa nada, ${n}. Te quiero igual 💚`,
    () => 'Un tiro no te define. Vení que te abrazo 🤗',
    (n) => `Tranqui, ${n}. Respirá, que el próximo sale`,
    () => 'Hasta los mejores van al rough. Y vos sos de los mejores 💛',
    () => 'Ese no cuenta para el corazón',
  ],
  // el que atiende la Dickyllamada (antes de pegarte el tiro) y después de pegarlo
  atiende: [() => 'Dejá, este te lo pego yo 💛', (n) => `Ya voy, ${n}. Pasame el palo`, () => 'Atendí al primer ring. ¿Qué necesitás? 📞'],
  ayuda: [() => 'Para eso están los amigos 💛', (n) => `Te la dejé ahí, ${n}. Ahora seguí vos`, () => 'Hoy por vos, mañana por mí 🤝', () => 'Los Dicky no se dejan solos nunca'],
  'Fito (Đ)': [(n) => `${n}, si no es green es chip in. Y si no, te quiero igual 🦅`, () => 'Volá tranquilo, que el Águila te cuida 🦅'],
  'Mike Queboni (Đ)': [(n) => `Pero qué bonito que sos, ${n}, ehh 🍯`, () => 'Te mando un abrazo con miel. Dulce como tu swing 🍯'],
  'El Ninja (Đ)': [() => 'Shh… el Ninja te cuida desde las sombras 🥷', (n) => `Nadie me ve, ${n}, pero siempre estoy con vos 🥷`],
  'Taiu (Đ)': [() => 'Croac. En rana quiere decir te quiero 🐸', (n) => `${n}, salto al hoyo con vos si hace falta 🐸`],
}
/**
 * Lo que le dice `quien` (otro Dicky) a `para` (el que juega). `momento`: 'bien' / 'mal' (después de un tiro),
 * 'atiende' / 'ayuda' (la Dickyllamada) o 'todos'. Después de un tiro, una de cada tres veces dice algo suyo.
 */
export function fraseDicky(rng, quien, para, momento = 'todos') {
  const n = String(para?.apodo ?? '').replace(/ \(Đ\)$/, '')
  const propias = DICKY_AMOR[quien] ?? []
  const base = DICKY_AMOR[momento] ?? DICKY_AMOR.todos
  const lista = !['atiende', 'ayuda'].includes(momento) && propias.length && rng() < 0.34 ? propias : base
  return elegir(rng, lista)(n)
}
/** Cómo salió el tiro para el Dicky que mira: 'bien', 'mal' o 'todos' (ni fu ni fa). */
export function momentoDicky(res) {
  if (['embocada', 'mono-bueno'].includes(res.tipo) || ['fairway', 'green'].includes(res.terreno)) return 'bien'
  if (['afuera', 'mono-malo', 'mono-ladron'].includes(res.tipo) || ['rough', 'bunker', 'bosque'].includes(res.terreno)) return 'mal'
  return 'todos'
}

// ── la Dickyllamada: una vez por vuelta, el Dicky que juega llama a otro Dicky que le pega el próximo tiro ──
// (con el handicap y la habilidad del que atiende: la bomba de Miguelón, el embudo de Fito, el revés de Taiu…)
export const puedeDickyllamar = (r) => !!r.jugador?.dicky && !r.dickyllamada && !r.prestado && !r.terminada
/** Llama a `dicky`: el próximo golpe lo pega él. Devuelve false si no se puede (ya la usó, no es Dicky, es él mismo). */
export function dickyllamar(r, dicky) {
  if (!puedeDickyllamar(r) || !dicky?.dicky || dicky.apodo === r.jugador.apodo) return false
  r.dickyllamada = { apodo: dicky.apodo, n: hoyoActual(r).n }
  r.prestado = { antes: r.jugador, golpeMago: r.golpeMago }
  r.jugador = dicky
  r.golpeMago = null
  return true
}
/** Después del golpe prestado (cuando la pelota se frena), vuelve el que jugaba. */
function devolverDicky(r) {
  if (!r.prestado) return
  r.jugador = r.prestado.antes
  r.golpeMago = r.prestado.golpeMago
  r.prestado = null
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

/**
 * Qué dice LG 📺 después de un tiro, y si el jugador pone una excusa. Con Rodal, LG no relata arriba: Lucas aparece
 * en pantalla y lo adula (`lucas`). `ctx` = de dónde y de qué lie salió el tiro (para saber si fue drive, approach o putt).
 */
export function comentar(rng, res, tiro, hoyo, jugador, ctx = {}) {
  if (habilidadDe(jugador)?.adulado) return { lg: null, excusa: null, verso: null, lucas: adular(rng, res, tiro, hoyo, ctx) }
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
  const j = cartaDe(r)
  const score = r.lp ? `LP 💅 (levantó en el ${r.lp})` : firmada ? formatoPar(vsPar) : `${NETO_SIN_FIRMA} neto (no firmó la tarjeta)`
  const hoyos = r.tarjeta.map((f) => (f.lp ? 'LP' : f.golpes)).join(' · ') + (r.tarjeta.rorro ? ` · 🥃 Rorro ${r.tarjeta.rorro > 0 ? '+1' : '−1'}` : '')
  return [
    '⛳ LA TRAMPA DEL MONO · SDGA',
    j.ruleta ? `${j.emoji} ${j.apodo} (un player por tiro): ${score} (${hoyos})` : `${j.emoji} ${j.apodo} (HCP ${j.hcp ?? '—'}): ${score} (${hoyos})`,
    ...tirosRuleta(r).map((h) => `   ${h.n}: ${h.tiros.map((t) => t.emoji).join(' → ')}`),
    ...(r.ms != null && !r.lp ? [`⏱ ${formatoTiempo(r.ms)}`] : []),
    `🐒 Monos: ${r.monosMalos} malos, ${r.monosBuenos} buenos, ${r.robos} robos`,
    'Hacerle poco a este tramo es casi un milagro.',
    '👉 Jugalo en la SDGApp: fedecup.vercel.app (Más → Juegos)',
  ].join('\n')
}
