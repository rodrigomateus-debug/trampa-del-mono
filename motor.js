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
  distPuttMax: 32, // el putt más largo (a fondo desde lejos); de cerca, el tope baja (`puttMaxDe`)
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
// clavada: la que pica justo en el hoyo, de aire; prob: la que pasa rodando rápido por la boca; centro: el chip que llega
// rodando entra como un putt solo a esta distancia del centro; vuelta: el chip que da la vuelta al hoyo (la corbata)
// entra solo esta parte de las veces (2026-10-08: clavada era 0,8 y prob 0,7, sin centro ni vuelta: los chips entraban
// muchísimo)
export const CHIP = { clavada: 0.35, max: 10, prob: 0.25, centro: 0.18, vuelta: 0.25 }
// El juego corto (2026-10-08): el error de un tiro no baja de `largo` yd de largo y `ancho` yd de costado (un desvío, a
// error 1 = handicap 10; se escala con el handicap como todo el error, pero no menos de `minimo`: un scratch también le
// erra a un chip). Antes era proporcional al largo y un chip de 15 yd
// caía en medio metro: se metían muchísimos. La zona de pique lo muestra.
export const CORTO = { largo: 3, ancho: 1.8, minimo: 0.6, hasta: 100, transicion: 40 } // entero hasta 60 yd; a 100, nada
/** Un número 0–1 propio de cada tiro (de dónde sale y adónde va): la "suerte" del chip in. */
export function suerteDe(tiro) {
  const x = Math.sin(tiro.desde[0] * 12.9898 + tiro.desde[1] * 78.233 + tiro.carryVec[0] * 37.719 + tiro.carryVec[1] * 4.581) * 43758.5453
  return x - Math.floor(x)
}
/**
 * El palo de la bandera (2026-10-08): un tiro completo que baja sobre el hoyo puede pegarle al palo antes de tocar el
 * piso (a menos de `radio` yd del palo y por debajo de `alto` yd). Si igual caía en la boca, entra como la que entra
 * de aire; si no, abajo cae adentro (hasta `CHIP.clavada`) y cuanto más arriba le pega, más rebota: sale para atrás y para un costado, a `rebote` yd/s. Los
 * putts no: se patean sin bandera. La flecha del Sueco, el tiro de Deme y Demetrio no le pegan.
 */
export const PALO_BANDERA = { radio: 0.2, alto: 2.4, rebote: [1.6, 3.2] }
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
// Cada green tiene un sector pronunciado (`fuerte`, 2026-10-08): ahí cae `fuerte` veces más, en una campana más chica
// (`anchoFuerte`): la pelota se va más y las flechitas corren más rápido; el resto, como siempre.
export const CAIDA = { ancho: 8, fuerte: 2.2, anchoFuerte: 6 }
/** La caída del green en ese punto (yd/s²). Sin zonas, la del hoyo. */
export function caidaEn(h, p) {
  if (!h.caidas?.length) return h.caida
  let sx = 0, sy = 0, sw = 0
  for (const z of h.caidas) {
    const d2 = (p[0] - z.p[0]) ** 2 + (p[1] - z.p[1]) ** 2
    const a = z.fuerte ? CAIDA.anchoFuerte : CAIDA.ancho // el sector pronunciado es más chico
    const w = Math.exp(-d2 / (2 * a * a)) + 1e-9
    const k = z.fuerte ? CAIDA.fuerte : 1
    sx += z.v[0] * k * w
    sy += z.v[1] * k * w
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
  'El Mago Rodal': { id: 'comba', adulado: true, nombre: 'Golpes de mago', texto: 'Nunca derecho: antes de cada golpe elegís cuál (Flop, Baby Draw, Una cortada al medio o el Dibuje maestro, que dibujás con el dedo). En el green, putt con draw o con fade.' },
  'Mike Queboni (Đ)': { id: 'bomba', corto: 'Desde el tee, la bomba al green.',  nombre: 'Drive al green', texto: 'Desde el tee, la bomba: la goma llega mucho más lejos (405 yd). Soltá en el sweet spot del latido y sale perfecta: al green. Ojo con la furia: si no pega la calle con el primero, no llega al green con el segundo o hace bogey, la barra se llena de a media. Llena, revolea el palo y el próximo tiro sale para cualquier lado.' },
  Tito: { id: 'viento', corto: 'Maneja el viento en vivo.', nombre: 'Tranqui, yo lo suspendo', texto: 'Tito Esperanza maneja el viento en vivo: mientras la pelota vuela, cada swipe en la pantalla es una ráfaga para ese lado (más largo, más fuerte) y la pelota se va para ahí. Las ráfagas se suman y se calman solas. Eso sí: en el green el putt es ultra sensible, un milímetro del dedo cambia la línea y la fuerza.' },
  Mapache: { id: 'caos', corto: 'Le pega increíble… si no aparece algo.', nombre: 'Tiros increíbles (y la mala suerte)', texto: 'Juanpa Pielach le pega increíble: la mitad del error. Pero cada tiro fuera del green, una de dos veces aparece algo: un árbol que la frena en el aire, una ráfaga que la corre o un carrito que viene de costado, se la lleva y la deja más allá. Antes de pegar ves lo que se viene (y para qué lado), y después de una sorpresa el próximo sale limpio. Y cuando la está por meter (también en el green), a veces sale un mapache del hoyo, la frena y se va rajando: la deja casi dada.' },
  'El Sueco': { id: 'derecho', corto: 'El drive con pulso; después, la flecha.', nombre: 'La flecha', texto: 'El drive, con el pulso de Fito: la línea se sacude y si soltás en el embudo sale derecha. Desde el segundo tiro, una flecha: va derecho y atraviesa todo, hasta los árboles. El putt, derecho.' },
  'Fito (Đ)': { id: 'aguila', corto: 'El embudo y el chip in: cerca del green, la mete.',  nombre: 'Chip in', texto: 'Drive y hierros con el pulso a mil: soltá en el embudo y sale derecha. Cerca del green, imán: si la chipeás al green, entra.' },
  // del chat del SDGA:
  Lechu: { id: 'dadas', nombre: 'Contando todas las dadas', texto: 'Joaco no falla los putts de 15 metros o menos: le pegues como le pegues, entra.' },
  'El Ninja (Đ)': { id: 'tradicion', corto: 'Su reset del hoyo, si todavía no lo usaste.',  nombre: 'Reset ninja', texto: 'Una vez por vuelta, su LP no levanta: resetea el hoyo. Volvés al tee con cero golpes, sin multa, como si no hubiera pasado nada. Es el botón 🥷 RESET.' },
  'El Perro': { id: 'perro', nombre: 'Va a buscarla', texto: 'Los greens están habilitados (sin caída) y si va al bosque el perro te la trae al fairway sin multa. Tarda: el reloj corre.' },
  Mugre: { id: 'panchitos', nombre: 'Tirar panchos', texto: 'A la Mugre los monos la huelen de lejos y vienen más. Pero tiene 3 panchos por hoyo: se los tirás, van, comen un segundo y vuelven.' },
  Liberty: { id: 'approach', nombre: 'Si no era por el approach', texto: 'El drive sale derecho siempre. Los approach (de 30 a 100 yd del hoyo) tienen el triple de error.' },
  Grandpa: { id: 'deme', nombre: 'Invocar a Deme', texto: 'Maxi, una vez por vuelta (no desde el tee): llama a Deme, el mentor. Te enseña a agarrar el palo y el próximo tiro entra de una, le pegues como le pegues.' },
  'El Flaco Ordoñez': { id: 'carrito', nombre: 'El carrito y la racha de Marcos', texto: 'Marcos se mueve en su carrito verde: después de cada tiro lo manejás vos hasta la pelota (al green va caminando, y al próximo tee lo lleva solo). Los árboles no se atraviesan; si se traba, RESET: vuelve al medio del fairway más cercano. El reloj corre. Y la racha: cada tiro bueno lo festeja a los gritos y el próximo sale con menos error (cada vez menos, hasta la mitad y un poco más); uno malo la corta.' },
  LG: { id: 'calma', nombre: 'El que se enoja pierde', texto: 'Después de un mal tiro no se enoja: el próximo sale sin error.' },
  'Taiu (Đ)': { id: 'reves', corto: 'Bombas y approach perfectos… empujando al revés.',  nombre: 'Al revés', texto: 'Taiu juega bárbaro: bombas desde el tee como Miguelón (la goma llega más lejos; en el sweet spot, perfecta) y approach perfectos (de 30 a 100 yd, sin error). Lo único: tiene los controles al revés. En vez de tirar para atrás, empujás para adelante (dedo para arriba, sale para arriba)… pero izquierda y derecha, cruzadas: dedo a la derecha, sale a la izquierda. La fuerza, como siempre. El putt también.' },
  Rorro: { id: 'codigo', corto: 'Su cancha en 3D, que se rehace cada 10 segundos.', nombre: 'La cancha en código', texto: 'Rorro juega en su cancha, hecha en código y en 3D, y cada 10 segundos la cancha se rehace (un deploy; el reloj avisa). Si el último tiro lo soltaste en el latido, se aprueba: se abre la calle y se arreglan los bugs. Si no, cambios del cliente: todo se mueve, otra skin y algún bug. Los greens no se mueven, pero en el green el hoyo se puede mudar. Dos poderes de dev por hoyo: ⏸ DEBUG en el aire (congela la pelota y le corrés el destino) y ↩ REVERT (vuelve a la cancha anterior). Y en cada vuelta se copia una habilidad de otro: elegís entre tres al azar.' },
  'La Ruleta': { id: 'ruleta', nombre: 'Un player por tiro', texto: 'Cada tiro lo pega un player del mazo al azar, con su handicap y su habilidad. Nunca el mismo dos veces seguidas: antes de cada golpe gira la ruleta y te dice quién pega.' },
  'Demetrio López': { id: 'retro', nombre: 'Golf de 1960', texto: 'Juega en la cancha de cuando era pro, sin monos. Cada tiro va exactamente adonde apuntás: sin dispersión, sin viento, sin árboles, sin caída, sin labios. Birdie, águila u hoyo en uno, como cualquiera; pero nunca más que par: el tiro para par entra siempre, esté donde esté.' },
}
// 🦅 Fito de pase en el Equipo 5 (2026-10-09): la misma habilidad que Fito
HABILIDADES['Fito (5)'] = HABILIDADES['Fito (Đ)']
/** La habilidad del que pega. Rorro, en cada vuelta, juega con la de otro (`prestada`: el apodo de quién la copió). */
export const habilidadDe = (jugador) => HABILIDADES[jugador?.prestada ?? jugador?.apodo] ?? null
/** Las que Rorro no puede copiar: la suya, la Ruleta, la de Demetrio (otra cancha) y el carrito de Marcos (no hay en 3D). */
export const SIN_PRESTAR = ['codigo', 'ruleta', 'retro', 'carrito']
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
// Los golpes del Mago: antes de cada golpe (fuera del green) elegís uno de 4, y queda elegido hasta que lo cambies.
// curva = grados entre la salida y dónde cae; lado = para dónde se cierra ('bandera', 'izq' o 'der');
// carry, alto y rueda = veces lo normal. El Dibuje maestro (dibujo) no tiene curva: la pelota vuela por la línea
// que dibujás con el dedo (suavizada, y hasta donde te da el carry). Todos vuelan por arriba de los pinos.
// (2026-10-06, pedido de Rorro: antes eran 5 al azar; el globo pasó a Flop, el gancho a Baby Draw, el slice a
// Una cortada al medio y la viborita, al Dibuje maestro.)
export const GOLPES_MAGO = [
  { id: 'flop', emoji: '🎈', nombre: 'Flop', texto: 'Altísimo: vuela menos y se clava donde cae', curva: 15, lado: 'bandera', carry: 0.8, alto: 2.5, rueda: 0.1 },
  { id: 'draw', emoji: '↩️', nombre: 'Baby Draw', texto: 'Dobla 45° a la izquierda: apuntá a la derecha', curva: 45, lado: 'izq', carry: 1, alto: 1, rueda: 1 },
  { id: 'cortada', emoji: '↪️', nombre: 'Una cortada al medio', texto: 'Dobla 45° a la derecha: apuntá a la izquierda', curva: 45, lado: 'der', carry: 1, alto: 1, rueda: 1 },
  { id: 'dibuje', emoji: '✍️', nombre: 'Dibuje maestro', texto: 'Dibujá con el dedo el vuelo, de la pelota a donde cae', dibujo: true, carry: 1, alto: 1, rueda: 1 },
]
// el putt del Mago: con draw dobla a la izquierda, con fade a la derecha (giro = radianes por segundo mientras rueda)
export const PUTT_MAGO = { giro: 0.3 }
// la furia de Miguelón: una barra de `mitades` mitades. Se carga media si el primer tiro del hoyo no queda en la calle
// ni en el green, media si el segundo no queda en el green (o no entra) y media si el hoyo termina en bogey o peor.
// Llena: revolea el palo y el próximo tiro (o putt) sale con la dispersión del peor handicap × `extra`; después, a cero.
// sacado, el latido late `latido` veces más rápido y la ventana del sweet spot es `ventana` de la normal: casi imposible
export const FURIA = { mitades: 2, extra: 1.6, latido: 0.75, ventana: 0.3 }
// la mala suerte de Juanpa (el Mapache): en cada tiro fuera del green, con chance `chance`, una sorpresa (árbol, ráfaga
// o carrito, una de tres). El árbol y la ráfaga pasan entre `desde` y `hasta` del vuelo; la ráfaga la corre de costado
// `rafaga` yardas reales y el carrito, al picar, se la lleva `carrito` yardas reales en `carritoT` segundos.
// `error`: la mitad del error de su handicap (le pega increíble)
export const SORPRESA = { chance: 0.5, desde: 0.35, hasta: 0.8, rafaga: [12, 26], carrito: [12, 24], carritoT: 1.2, error: 0.5 }
export const SORPRESAS = ['arbol', 'rafaga', 'carrito']
// y en cualquier tiro (también los putts), con chance `chance`: si la pelota iba a entrar, sale un mapache del hoyo,
// la frena y se va rajando. La deja casi dada: a `dada` yardas reales del hoyo, del lado de donde venía
export const MAPACHE = { chance: 0.35, dada: [1, 1.6] }
// ── el clima del día: se sortea en cada vuelta (en un match, sale de la semilla: los dos juegan el mismo día) ──
// prob = chance de que toque en la primera tirada (la nieve, el easter egg: 1 de cada 100; después, ver NIEVE). Lo que cambia cada uno:
// carry = cuánto vuela (se ve al apuntar); pique / roce = cuánto rueda al caer y cuánto lo frena el pasto (fuera del
// green); green = cuánto frena el green (más = greens lentos: el putt se queda corto de la línea; menos = rápidos);
// charcos = cuántos charcos por hoyo en la calle (si cae o rueda en uno, se frena de golpe); barro = chance de que la
// pelota quede con barro al parar en la calle o el rough (el próximo tiro sale con `barroError` × el error);
// resbalon = chance por tiro de que se resbale el palo (la pega finita: sale derecho pero vuela `resbalonCarry` de lo
// que iba); vientoMin =
// km/h mínimos; vientoCambia = el viento cambia en cada tiro; siesta = los monos salen más tarde y más lentos (× vel);
// sinMonos = no hay monos (se escondieron)
export const CLIMAS = {
  soleado: { nombre: 'Soleado pleno', prob: 0.22, carry: 1.05, green: 0.85, siesta: 0.6, corto: 'Vuela más · greens rápidos · monos dormidos', texto: 'La pelota vuela un poco más, los greens están rápidos y los monos duermen la siesta: salen tarde y lentos.' },
  nuboso: { nombre: 'Nublado', prob: 0.22, vientoCambia: true, corto: 'El viento cambia en cada tiro', texto: 'El viento cambia en cada tiro, de dirección y de fuerza: mirá la flecha antes de pegar.' },
  seco: { nombre: 'Día seco', prob: 0.16, pique: 1.7, roce: 0.6, corto: 'Pica alto y rueda una barbaridad', texto: 'La cancha está durísima: la pelota pica alto y rueda una barbaridad. Pegale corto.' },
  mojado: { nombre: 'Día mojado', prob: 0.16, pique: 0.3, green: 1.2, charcos: 2, barro: 0.3, corto: 'Se clava · greens lentos · charcos y barro', texto: 'Llovió anoche: la pelota se clava y casi no rueda, los greens están lentos y a veces queda con barro: el tiro siguiente sale para cualquier lado.' },
  lluvia: { nombre: 'Lluvia', prob: 0.14, carry: 0.95, pique: 0.5, green: 1.15, charcos: 4, corto: 'Vuela menos · rueda poco · charcos', texto: 'Llueve: la pelota vuela un poco menos, rueda poco, los greens están lentos y hay charcos en la calle: si cae o rueda en uno, se frena de golpe.' },
  tormenta: { nombre: 'Lluvia intensa', prob: 0.09, carry: 0.9, pique: 0.4, green: 1.3, charcos: 7, resbalon: 0.2, vientoMin: 15, sinMonos: true, corto: 'Vuela menos · viento fuerte · el palo resbala', texto: '¡Diluvia! Viento fuerte, charcos por todos lados, greens lentísimos y el palo mojado resbala: a veces la pegás finita y sale cortita. Los monos se escondieron.' },
  nieve: { nombre: '¡Nevó en San Diego!', prob: 0.01, carry: 0.95, pique: 0.08, roce: 3, green: 1.25, siesta: 0.5, corto: 'Pelota naranja · se clava donde cae', texto: 'Pasa una vez cada veinte vueltas. La pelota (naranja) se clava en la nieve donde cae, en el green rueda lento y los monos, muertos de frío, andan en cámara lenta.' },
}
export const CLIMA_EFECTO = { barroError: 1.8, resbalonCarry: 0.55, charco: [2.2, 4.2] }
// la chance de la nieve desde cada fecha (antes de la primera, 1 de cada 100: la `prob` de CLIMAS). Hoy, 1 de cada 20.
// Para que no cambie nada más (el clima de un match sale de su semilla: un desafío pendiente o un replay tienen que
// seguir igual), el sorteo es el de siempre y, si no nevó, una segunda tirada sacada del mismo número la convierte en
// nieve con la chance que falta. Cada desafío, con la chance de su fecha
export const NIEVE = [
  { desde: Date.parse('2026-10-10T03:40:00Z'), prob: 0.1 },
  { desde: Date.parse('2026-10-10T03:44:00Z'), prob: 0.05 },
]
/** La chance de que nieve en una vuelta (o un desafío) de esa fecha. */
export const chanceNieve = (fecha) => NIEVE.reduce((p, n) => (fecha >= n.desde ? n.prob : p), CLIMAS.nieve.prob)
/** El clima del día, sorteado según `prob` y NIEVE (la nieve, 1 de cada 20). `fecha`: la del desafío, en un match. */
export function sortearClima(rng, fecha = Date.now()) {
  const u0 = rng()
  let u = u0, id = 'nuboso'
  for (const [k, c] of Object.entries(CLIMAS)) {
    if (u < c.prob) { id = k; break }
    u -= c.prob
  }
  const base = CLIMAS.nieve.prob, p = chanceNieve(fecha)
  if (id === 'nieve' || !(p > base)) return id
  const u2 = mezclar(Math.floor(u0 * 4294967296), 0x6e696576) / 4294967296
  return u2 < (p - base) / (1 - base) ? 'nieve' : id
}
/** Un número 32 bits a partir de otros (para que el clima de cada tiro salga igual en los dos lados de un match). */
const mezclar = (...ns) => ns.reduce((h, n) => Math.imul(h ^ (n >>> 0), 0x9e3779b1) >>> 0, 0x811c9dc5)
/**
 * Pone el clima en la ronda: los charcos de cada hoyo (en la calle, sorteados con `semilla`), los km/h mínimos del
 * viento, los monos (dormidos o escondidos). Con la misma semilla, los mismos charcos (el match).
 */
export function ponerClima(campo, r, id, semilla) {
  const c = CLIMAS[id] ?? CLIMAS.nuboso
  const rng = rngDesde(semilla)
  r.clima = { id, semilla: semilla >>> 0, charcos: (r.hoyos ?? HOYOS).map((h) => charcosDe(campo, h, c.charcos ?? 0, rng)) }
  if (c.sinMonos) r.monos = []
  else if (c.siesta) for (const s of r.monos) s.siesta = c.siesta
  vientoDelClima(r)
  return r
}
/** El clima, sus perillas (o null si no hay clima). */
export const climaDe = (r) => (r?.clima ? CLIMAS[r.clima.id] : null)
function charcosDe(campo, h, n, rng) {
  const out = []
  for (let k = 0; k < n * 25 && out.length < n; k++) {
    const i = Math.floor(rng() * (h.calle.length - 1))
    const t = rng()
    const a = h.calle[i], b = h.calle[i + 1]
    const p = [a[0] + (b[0] - a[0]) * t + (rng() - 0.5) * 14, a[1] + (b[1] - a[1]) * t + (rng() - 0.5) * 14]
    const [r0, r1] = CLIMA_EFECTO.charco
    const radio = r0 + rng() * (r1 - r0)
    if (celda(campo, p) !== 'f' || out.some((q) => dist(q.pos, p) < q.r + radio + 2)) continue
    out.push({ pos: p, r: radio, ang: rng() * Math.PI })
  }
  return out
}
/**
 * El viento que tuvo un match en el hoyo `idx` después de `golpes` golpes en ese hoyo (para el replay): el del hoyo,
 * que sale de la semilla, con el mínimo del clima; nublado, el que cambió después de cada tiro (climaTrasTiro). Sin
 * clima (un match de antes del clima), el del hoyo tal cual.
 */
export function vientoDelMatch(cond, clima, idx, golpes = 0) {
  const r = { clima, idx, golpes: 0, lie: 'green', terminada: false, viento: { ...cond.vientos[idx] } }
  if (!clima) return r.viento
  vientoDelClima(r)
  if (golpes > 0) { r.golpes = golpes; climaTrasTiro(null, r, () => 1) }
  return r.viento
}
/** El viento según el clima: con lluvia intensa, nunca menos de `vientoMin`. */
function vientoDelClima(r) {
  const c = climaDe(r)
  if (c?.vientoMin && r.viento.kmh < c.vientoMin) r.viento = { ...r.viento, kmh: c.vientoMin + Math.round((r.viento.kmh / FISICA.vientoMax) * (FISICA.vientoMax - c.vientoMin)) }
}
/** ¿Hay un charco en ese punto del hoyo `idx`? */
export function charcoEn(clima, idx, p) {
  return clima?.charcos?.[idx]?.find((q) => dist(q.pos, p) < q.r) ?? null
}
/**
 * Después de cada tiro (la pelota quieta, ya resuelto): el viento nuevo si está nublado (el mismo en los dos lados de
 * un match, sale de la semilla y el número de golpe) y el barro si el día está mojado.
 */
export function climaTrasTiro(campo, r, rng) {
  const c = climaDe(r)
  if (!c || r.terminada) return null
  let barro = false
  if (c.barro && ['fairway', 'rough'].includes(r.lie) && rng() < c.barro) { r.barro = true; barro = true }
  if (c.vientoCambia) {
    r.viento = vientoAleatorio(rngDesde(mezclar(r.clima.semilla, r.idx, r.golpes)))
    vientoDelClima(r)
  }
  return { barro, viento: !!c.vientoCambia }
}

// la flecha de El Sueco (del segundo tiro en adelante): vuela más bajo y más rápido que un tiro normal
export const FLECHA = { alto: 0.35, tiempo: 0.6 }
export const PUTTS_MAGO = [
  { id: 'draw', emoji: '↩️', nombre: 'Putt con draw', texto: 'Dobla a la izquierda mientras rueda: apuntá a la derecha del hoyo', lado: -1 },
  { id: 'fade', emoji: '↪️', nombre: 'Putt con fade', texto: 'Dobla a la derecha mientras rueda: apuntá a la izquierda del hoyo', lado: 1 },
]
// el Dibuje maestro: la línea se remuestrea cada `paso` yardas del dibujo, se suaviza `pasadas` veces y queda en
// `puntos` puntos; con menos de `minimo` yardas no hay tiro
export const DIBUJO = { paso: 1.5, pasadas: 14, puntos: 48, minimo: 4 }
// la bomba de Miguelón (y de Taiu): desde el tee su driver vuela hasta `carry` yardas reales: llega a los dos par 4 desde
// las azules (el 16, 415 yd, a fondo; el 15, 392, con un poco menos; 2026-10-06, antes 365 y al 16 no llegaba). Pasando
// `zona` yardas es la bomba: se abre (`ang` grados × el error del handicap) y mal pegada queda corta (`largo`). Desde el
// 2026-10-08, el perfecto sale del latido como para todos (antes, del óvalo que latía): la bomba perfecta llega al green

export const BOMBA = { carry: 405, zona: 285, ang: 6, largo: 0.1 }
// el Águila (Fito): la línea de tiro se sacude ±amplitud grados cada `periodo` s; si suelta con el desvío dentro de
// ±ventana (el embudo) sale derecha. A `chip` yardas reales o menos del hoyo, si cae en el green el imán la mete.
// (`alLado`: dónde la dejaría un imán que no la mete; hoy siempre la mete.)
// Mati (El Sueco): sin error de dirección (pega lo que pega su handicap)
export const AGUILA = { amplitud: 25, periodo: 0.7, ventana: 5, chip: 40, alLado: 0.85, metida: 4 }
// Lechu (Joaco): el putt desde DADA yardas o menos (15 metros; hasta el 2026-10-09 eran 3) entra siempre, le pegue como le pegue. El Perro: tarda `segundos` en traerla. Liberty: approach entre `desde` y `hasta` yd, error x`error`.
// DADA, AGUILA.chip y APPROACH van en yardas REALES (las del marcador): se comparan con la distancia del dibujo × la escala del hoyo.
export const DADA = 16.4 // 15 metros
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
    caidas: [{ p: [40, 31], v: [-0.5, 0.3], fuerte: true }, { p: [29, 43], v: [0.55, -0.35] }, { p: [39, 53], v: [0.3, 0.55] }],
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
    caidas: [{ p: [105, 386], v: [0.45, 0.4] }, { p: [107, 401], v: [-0.5, 0.45] }, { p: [118, 414], v: [-0.3, -0.5], fuerte: true }, { p: [103, 420], v: [0.5, -0.3] }],
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
    caidas: [{ p: [149, 65], v: [0.45, 0.55] }, { p: [155, 89], v: [-0.55, -0.2], fuerte: true }],
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
// Los árboles y el afuera no se atraviesan: de costado el carrito RASPA y sigue por el borde (pierde un poco), de
// frente CHOCA (rebota). En el rough y el bunker anda más lento; por el SENDERO de carritos, más rápido. `llegar` = a
// cuántas yardas de la pelota se baja (en el bosque, `llegarBosque`: el último tramo lo hace a pie); a `estacionar`
// yardas, si la ve, estaciona solo.
// El DERRAPE carga un mini turbo: coleando y doblando `carga[0]` s (o `carga[1]`, el fuerte), al soltar sale disparado
// (`turbito` yd/s más, por `turbitoSeg[n]` s). Una CÁSCARA de banana lo hace dar un trompo (`trompo` s, sin agarre).
export const CARRITO = {
  vmax: 16, turbo: 48, acel: 10, acelTurbo: 18, atras: 6, freno: 30, frenoMotor: 16, roce: 5, giro: 2.3, largo: 2.6,
  agarre: 12, agarreColea: 1.6, colea: 20, coleaFreno: 8, // agarre lateral (por segundo) y desde qué velocidad colea
  terreno: { rough: 0.7, bunker: 0.45 },
  sendero: 1.3, // por el sendero de carritos
  raspa: 1.6, // raspando un árbol de costado pierde velocidad (por segundo)
  deFrente: 0.35, // si lo que queda para seguir por el borde es menos que esto del paso, es de frente: choque
  llegar: 4, llegarBosque: 10, estacionar: 14,
  facil: 24, // manejo fácil: acelera solo hasta acá
  carga: [0.5, 1.1], turbito: [7, 13], turbitoSeg: [0.6, 1],
  trompo: 1, giroTrompo: 11,
}
const NO_SE_PASA = new Set(['t', 'x'])
/** El carrito donde Marcos se baja: al lado de la pelota, mirando para donde va. */
export function crearCarro(pos, ang = -Math.PI / 2) {
  return { pos: [...pos], ang, v: 0, vl: 0, colea: false }
}
/**
 * Un paso del carrito. `mando` = { acelerar, frenar, reversa, izq, der } (true/false) y, opcional, `tope` (hasta dónde
 * acelera: el manejo fácil). Muta el carro (`v` = velocidad hacia adelante, `vl` = de costado, `colea` = si está
 * derrapando, `carga` = el mini turbo que junta, `turbito`/`trompo` = los segundos que le quedan, `ev` = lo que pasó en
 * este paso: 'turbito1'/'turbito2'); devuelve 'choque' (de frente contra un árbol o el afuera, con `impacto` = la
 * velocidad), 'roce' (de costado: sigue por el borde) o null.
 */
export function manejar(campo, carro, mando, dt) {
  const c = CARRITO
  carro.ev = null
  const trompo = (carro.trompo ?? 0) > 0
  if (trompo) { carro.trompo = Math.max(0, carro.trompo - dt); mando = {} }
  if ((carro.turbito ?? 0) > 0) carro.turbito = Math.max(0, carro.turbito - dt)
  const piso = enSendero(campo, carro.pos) ? c.sendero : c.terreno[terreno(campo, carro.pos).tipo] ?? 1
  const base = c.vmax * piso
  const extra = carro.turbito > 0 ? carro.turboExtra ?? c.turbito[0] : 0
  const tope = (mando.tope != null ? Math.max(mando.tope * piso, base) : c.turbo * piso) + extra
  let v = carro.v
  if (mando.frenar) v -= Math.sign(v) * Math.min(Math.abs(v), c.freno * dt)
  else if (mando.acelerar && !mando.reversa) {
    if (v < 0) v += c.frenoMotor * dt
    else if (v < base) v = Math.min(base + 0.01, v + c.acel * dt)
    else if (v < tope) v = Math.min(tope, v + c.acelTurbo * Math.max(0.5, 1 - (v - base) / Math.max(1, tope - base)) * dt) // turbo: de menos a más
  } else if (mando.reversa && !mando.acelerar) v = Math.max(-c.atras, v - (v > 0 ? c.frenoMotor : c.acel) * dt)
  else v -= Math.sign(v) * Math.min(Math.abs(v), (c.roce + Math.abs(v) * 0.08 + (trompo ? 6 : 0)) * dt) // suelta: se frena solo
  if (v > tope) v = Math.max(tope, v - c.freno * dt) // entró al rough rápido (o se acabó el turbito): frena
  // dobla según la velocidad (quieto no dobla; en reversa, al revés). La velocidad de antes queda: si no agarra, colea
  const giro = (mando.der ? 1 : 0) - (mando.izq ? 1 : 0)
  const wx = Math.cos(carro.ang) * v - Math.sin(carro.ang) * (carro.vl ?? 0)
  const wy = Math.sin(carro.ang) * v + Math.cos(carro.ang) * (carro.vl ?? 0)
  if (trompo) carro.ang += (carro.trompoDir ?? 1) * c.giroTrompo * dt * Math.min(1, carro.trompo / 0.3 + 0.2) // gira como un trompo
  else carro.ang += giro * c.giro * dt * Math.max(-1, Math.min(1, v / 4))
  const f = [Math.cos(carro.ang), Math.sin(carro.ang)], l = [-f[1], f[0]]
  v = wx * f[0] + wy * f[1]
  let vl = wx * l[0] + wy * l[1]
  const suelta = giro !== 0 && (Math.abs(v) > c.colea || (mando.frenar && Math.abs(v) > c.coleaFreno))
  vl *= Math.exp(-(trompo ? 0.4 : suelta ? c.agarreColea : c.agarre) * dt)
  v -= Math.sign(v) * Math.min(Math.abs(v), Math.abs(vl) * 0.25 * dt) // de costado, la goma frena un poco
  carro.v = v
  carro.vl = vl
  carro.colea = Math.abs(vl) > 2.5
  // el derrape carga el mini turbo; al soltar (o al dejar de colear), si llegó, sale disparado
  if (carro.colea && giro !== 0 && v > 0 && !trompo) carro.carga = (carro.carga ?? 0) + dt
  else if (carro.carga) {
    const n = carro.carga >= c.carga[1] ? 2 : carro.carga >= c.carga[0] ? 1 : 0
    carro.carga = 0
    if (n && v > 0) {
      carro.turboExtra = c.turbito[n - 1]
      carro.turbito = c.turbitoSeg[n - 1]
      carro.v = v = v + c.turbito[n - 1]
      carro.ev = `turbito${n}`
    }
  }
  const nueva = [carro.pos[0] + (f[0] * v + l[0] * vl) * dt, carro.pos[1] + (f[1] * v + l[1] * vl) * dt]
  // la trompa (o la cola, en reversa) y el centro no pueden entrar a un árbol
  const punta = Math.sign(v || 1) * c.largo * 0.5
  const pasa = (p, k = 1) => !NO_SE_PASA.has(celda(campo, p)) && !NO_SE_PASA.has(celda(campo, [p[0] + f[0] * punta * k, p[1] + f[1] * punta * k]))
  if (pasa(nueva)) { carro.pos = nueva; return null }
  // de costado: sigue por el borde (en x o en y, lo que quede libre), raspando y con la trompa que se acomoda
  const dx = nueva[0] - carro.pos[0], dy = nueva[1] - carro.pos[1], paso = Math.hypot(dx, dy)
  let borde = null
  for (const [ex, ey] of [[dx, 0], [0, dy]]) {
    const m = Math.hypot(ex, ey)
    if (paso > 1e-4 && m > paso * c.deFrente && (!borde || m > borde.m)) {
      const p = [carro.pos[0] + ex, carro.pos[1] + ey]
      if (pasa(p, 0.6)) borde = { p, m, ex, ey }
    }
  }
  if (borde && !trompo) {
    const k = Math.exp(-c.raspa * dt) / dt
    const sx = borde.ex * k, sy = borde.ey * k
    carro.pos = borde.p
    // sigue con la velocidad que le queda por el borde, y la trompa se acomoda para ese lado
    const dir = Math.atan2(sy, sx) + (v < 0 ? Math.PI : 0)
    carro.ang += difAng(dir, carro.ang) * Math.min(1, 10 * dt)
    carro.v = Math.sign(v) * Math.hypot(sx, sy)
    carro.vl = 0
    carro.colea = false
    return 'roce'
  }
  carro.impacto = Math.abs(v)
  carro.v = -v * 0.25 // rebota un poquito
  carro.vl = 0
  carro.colea = false
  carro.carga = 0
  return 'choque'
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

/**
 * RESET (el carrito trabado): al medio del fairway más cercano (en la fila de esa celda, el centro del tramo de fairway),
 * quieto y mirando a `hacia` (la pelota). Devuelve la posición nueva (o null si no hay fairway cerca).
 */
export function rescatarCarro(campo, carro, hacia = null) {
  const f = campo.cancha.filas
  const [cx, cy] = carro.pos
  let mejor = null
  for (let rad = 0; rad <= 80 && !mejor; rad += 1) {
    for (let y = Math.max(0, Math.floor(cy - rad)); y <= Math.min(f.length - 1, Math.floor(cy + rad)); y++) {
      for (let x = Math.max(0, Math.floor(cx - rad)); x <= Math.min(f[y].length - 1, Math.floor(cx + rad)); x++) {
        if (f[y][x] !== 'f') continue
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
        if (d <= rad + 0.5 && (!mejor || d < mejor.d)) mejor = { x, y, d }
      }
    }
  }
  if (!mejor) return null
  let x0 = mejor.x, x1 = mejor.x
  while (f[mejor.y][x0 - 1] === 'f') x0--
  while (f[mejor.y][x1 + 1] === 'f') x1++
  const pos = [(x0 + x1 + 1) / 2, mejor.y + 0.5]
  Object.assign(carro, { pos, v: 0, vl: 0, colea: false, ang: hacia ? Math.atan2(hacia[1] - pos[1], hacia[0] - pos[0]) : carro.ang })
  return pos
}
/** ¿Llegó a la pelota? (en el bosque alcanza con acercarse: el último tramo, a pie) */
export function carroLlego(campo, carro, pelota) {
  const lejos = NO_SE_PASA.has(celda(campo, pelota)) ? CARRITO.llegarBosque : CARRITO.llegar
  return dist(carro.pos, pelota) <= lejos
}
export const usaCarrito = (r) => habilidadDe(r.jugador)?.id === 'carrito'

// ── el carrito: el mapa para manejar, el sendero, la ruta (el GPS), el piloto y estacionar ──
// El mapa de una cancha: qué celdas no se pasan y a cuántas yardas (hasta 4) está el árbol más cercano de cada una.
const MAPAS = new WeakMap()
function mapaDe(campo) {
  const filas = campo.cancha.filas
  let m = MAPAS.get(filas)
  if (m) return m
  const AL = filas.length, AN = Math.max(...filas.map((f) => f.length))
  const bloq = new Uint8Array(AN * AL), cerca = new Uint8Array(AN * AL).fill(9)
  let borde = []
  for (let y = 0; y < AL; y++) for (let x = 0; x < AN; x++) {
    if (NO_SE_PASA.has(filas[y][x] ?? 'x')) { bloq[y * AN + x] = 1; cerca[y * AN + x] = 0; borde.push(y * AN + x) }
  }
  for (let d = 1; d <= 4 && borde.length; d++) {
    const otro = []
    for (const i of borde) {
      const x = i % AN, y = (i - x) / AN
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const nx = x + ox, ny = y + oy
        if (nx < 0 || ny < 0 || nx >= AN || ny >= AL) continue
        const j = ny * AN + nx
        if (cerca[j] > d) { cerca[j] = d; otro.push(j) }
      }
    }
    borde = otro
  }
  m = { filas, AN, AL, bloq, cerca }
  MAPAS.set(filas, m)
  return m
}
/** El montículo de A* (de menor a mayor `f`). */
function monticulo() {
  const a = []
  return {
    get n() { return a.length },
    push(e) { a.push(e); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p } },
    pop() {
      const top = a[0], ult = a.pop()
      if (a.length) {
        a[0] = ult
        let i = 0
        for (;;) {
          const l = 2 * i + 1, r = l + 1
          let m = i
          if (l < a.length && a[l][0] < a[m][0]) m = l
          if (r < a.length && a[r][0] < a[m][0]) m = r
          if (m === i) break
          ;[a[m], a[i]] = [a[i], a[m]]
          i = m
        }
      }
      return top
    },
  }
}
/**
 * A* en la grilla (8 vecinos, sin cortar esquinas de árbol): de `desde` hasta la primera celda que cumpla `meta`.
 * `costo(i, j, paso)` = lo que cuesta pisar la celda j (Infinity = no se pasa). Devuelve los centros de celda, o null.
 */
function aEstrella(m, desde, hasta, meta, costo, minimo = 1) {
  const { AN, AL } = m
  const cl = (v, n) => Math.max(0, Math.min(n - 1, Math.floor(v)))
  const s = cl(desde[1], AL) * AN + cl(desde[0], AN)
  const tx = hasta[0], ty = hasta[1]
  const g = new Float32Array(AN * AL).fill(Infinity), de = new Int32Array(AN * AL).fill(-1)
  const cerrado = new Uint8Array(AN * AL)
  const h = (x, y) => Math.hypot(x + 0.5 - tx, y + 0.5 - ty) * minimo
  const abiertos = monticulo()
  g[s] = 0
  abiertos.push([h(s % AN, (s / AN) | 0), s])
  while (abiertos.n) {
    const [, i] = abiertos.pop()
    if (cerrado[i]) continue
    cerrado[i] = 1
    const x = i % AN, y = (i - x) / AN
    if (meta(x, y, i)) {
      const pts = []
      for (let k = i; k !== -1; k = de[k]) pts.push([(k % AN) + 0.5, Math.floor(k / AN) + 0.5])
      return pts.reverse()
    }
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      if (!ox && !oy) continue
      const nx = x + ox, ny = y + oy
      if (nx < 0 || ny < 0 || nx >= AN || ny >= AL) continue
      const j = ny * AN + nx
      if (cerrado[j]) continue
      if (ox && oy && (m.bloq[y * AN + nx] || m.bloq[ny * AN + x])) continue
      const paso = ox && oy ? Math.SQRT2 : 1
      const c = costo(i, j, paso)
      if (!(c < Infinity)) continue
      const ng = g[i] + c
      if (ng < g[j]) { g[j] = ng; de[j] = i; abiertos.push([ng + h(nx, ny), j]) }
    }
  }
  return null
}
/** ¿Se ve derecho de `a` a `b`? (ninguna celda que no se pasa; con `margen`, además lejos de los árboles) */
function seVe(m, a, b, margen = 0, prohibida = null) {
  const n = Math.max(1, Math.ceil(dist(a, b) * 2.5))
  for (let k = 0; k <= n; k++) {
    const x = Math.floor(a[0] + ((b[0] - a[0]) * k) / n), y = Math.floor(a[1] + ((b[1] - a[1]) * k) / n)
    if (x < 0 || y < 0 || x >= m.AN || y >= m.AL) return false
    const i = y * m.AN + x
    if (m.bloq[i] || m.cerca[i] < margen || (prohibida && prohibida.has(m.filas[y][x]))) return false
  }
  return true
}
/** Tira de la cuerda: de cada punto, derecho al más lejano que se ve (lejos de los árboles si se puede). */
function estirar(m, pts, margen = 2, prohibida = null) {
  if (!pts || pts.length < 3) return pts
  const out = [pts[0]]
  let i = 0
  while (i < pts.length - 1) {
    let j = i + 1
    for (let k = pts.length - 1; k > i + 1; k--) if (seVe(m, pts[i], pts[k], margen, prohibida)) { j = k; break }
    out.push(pts[j])
    i = j
  }
  return out
}
/** Chaikin: redondea las esquinas (para dibujar y para que el sendero sea una curva). */
function redondear(pts, veces = 2) {
  let p = pts
  for (let v = 0; v < veces && p.length > 2; v++) {
    const q = [p[0]]
    for (let i = 0; i < p.length - 1; i++) {
      const [a, b] = [p[i], p[i + 1]]
      q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75])
    }
    q.push(p.at(-1))
    p = q
  }
  return p
}
const largoDe = (pts) => pts.reduce((s, p, i) => (i ? s + dist(p, pts[i - 1]) : 0), 0)

// El SENDERO de carritos (como en las canchas de verdad): uno por hoyo, del costado del tee al costado del green, por el
// rough al lado del fairway (a ~`lado` yd del borde), lejos de los árboles, sin pisar bunkers ni greens. Solo en la
// cancha de verdad (cancha-grid.js). Por el sendero el carrito anda `CARRITO.sendero` veces más rápido.
export const SENDERO = { ancho: 1.3, lado: 3 }
const SENDEROS = new WeakMap()
export function senderos(campo) {
  const filas = campo.cancha.filas
  if (filas !== CANCHA.filas) return null
  let s = SENDEROS.get(filas)
  if (s) return s
  const m = mapaDe(campo), { AN, AL } = m
  // a cuántas celdas del fairway está cada celda (hasta 12)
  const aCalle = new Uint8Array(AN * AL).fill(99)
  let borde = []
  for (let i = 0; i < AN * AL; i++) if (filas[(i / AN) | 0][i % AN] === 'f') { aCalle[i] = 0; borde.push(i) }
  for (let d = 1; d <= 12 && borde.length; d++) {
    const otro = []
    for (const i of borde) {
      const x = i % AN, y = (i - x) / AN
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + ox, ny = y + oy
        if (nx < 0 || ny < 0 || nx >= AN || ny >= AL) continue
        const j = ny * AN + nx
        if (aCalle[j] > d) { aCalle[j] = d; otro.push(j) }
      }
    }
    borde = otro
  }
  const letra = (i) => filas[(i / AN) | 0][i % AN]
  const costo = (i, j, paso) => {
    const t = letra(j)
    if (m.bloq[j] || t === 'b' || t === 'g') return Infinity
    const lejos = m.cerca[j] <= 1 ? 8 : m.cerca[j] === 2 ? 2.5 : 0
    const base = t === 'f' ? 3 : 1 + Math.abs(Math.min(12, aCalle[j]) - SENDERO.lado) * 0.3
    return paso * (base + lejos)
  }
  const lineas = []
  for (const h of HOYOS) {
    // sale del costado del tee (el de adelante) y llega al costado del green (antes de entrar)
    const ida = Math.atan2(h.pin[1] - h.tees.amarilla[1], h.pin[0] - h.tees.amarilla[0])
    const ini = [h.tees.amarilla[0] + Math.cos(ida) * 6, h.tees.amarilla[1] + Math.sin(ida) * 6]
    const gr = h.calle.at(-1)
    const pts = aEstrella(m, ini, h.pin, (x, y, i) => Math.hypot(x + 0.5 - h.pin[0], y + 0.5 - h.pin[1]) < dist(gr, h.pin) * 0.55 + 6 && letra(i) !== 'g', costo, 1)
    if (!pts) continue
    const curva = redondear(estirar(m, pts, 3, new Set(['f', 'b', 'g'])), 3)
    lineas.push({ hoyo: h.n, pts: curva })
  }
  // la máscara: las celdas a menos de `ancho` yd de la línea
  const mascara = new Uint8Array(AN * AL)
  for (const { pts } of lineas) for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]]
    const n = Math.ceil(dist(a, b) * 3)
    for (let k = 0; k <= n; k++) {
      const px = a[0] + ((b[0] - a[0]) * k) / n, py = a[1] + ((b[1] - a[1]) * k) / n
      for (let y = Math.floor(py - SENDERO.ancho); y <= Math.floor(py + SENDERO.ancho); y++) for (let x = Math.floor(px - SENDERO.ancho); x <= Math.floor(px + SENDERO.ancho); x++) {
        if (x < 0 || y < 0 || x >= AN || y >= AL || m.bloq[y * AN + x]) continue
        if (Math.hypot(x + 0.5 - px, y + 0.5 - py) <= SENDERO.ancho) mascara[y * AN + x] = 1
      }
    }
  }
  s = { lineas, mascara, AN }
  SENDEROS.set(filas, s)
  return s
}
/** ¿Está arriba del sendero de carritos? */
export function enSendero(campo, p) {
  const s = senderos(campo)
  if (!s) return false
  const x = Math.floor(p[0]), y = Math.floor(p[1])
  return x >= 0 && y >= 0 && x < s.AN && !!s.mascara[y * s.AN + x]
}

/**
 * La RUTA del carrito (el GPS): el camino más corto de `desde` a la pelota que esquiva los árboles (con aire: cerca de
 * una copa cuesta más), prefiere el sendero y el fairway y evita el bunker y el green. Termina al lado de la pelota (en
 * el bosque, donde se baja). Devuelve los puntos (estirados en rectas, el primero es `desde`), o null.
 */
export function rutaCarrito(campo, desde, pelota) {
  const m = mapaDe(campo), sen = senderos(campo)
  const enBosque = NO_SE_PASA.has(celda(campo, pelota))
  const llega = enBosque ? CARRITO.llegarBosque - 1.5 : CARRITO.llegar - 1
  const PISO = { f: 1, e: 1, '.': 1.25, b: 2.2, g: 2.5 }
  const ini = Math.floor(desde[1]) * m.AN + Math.floor(desde[0])
  const costo = (i, j, paso) => {
    if (m.bloq[j] && j !== ini) return Infinity
    const t = m.filas[(j / m.AN) | 0][j % m.AN]
    const lejos = m.cerca[j] <= 1 ? 12 : m.cerca[j] === 2 ? 2.5 : m.cerca[j] === 3 ? 0.5 : 0
    return paso * ((sen?.mascara[j] ? 0.75 : PISO[t] ?? 1.25) + lejos)
  }
  const pts = aEstrella(m, desde, pelota, (x, y, i) => !m.bloq[i] && Math.hypot(x + 0.5 - pelota[0], y + 0.5 - pelota[1]) <= llega, costo, 0.75)
  if (!pts) return null
  pts[0] = [...desde]
  const ruta = estirar(m, pts, 2)
  // el último punto, la pelota (o donde se baja en el bosque)
  if (!enBosque) ruta[ruta.length - 1] = [...pelota]
  return ruta
}
/**
 * Dónde está el carrito sobre la ruta: `lejos` = a cuántas yd de la línea, `seg` = el tramo, y `punto` = el que está
 * `adelante` yd más adelante sobre la ruta (al que hay que apuntar).
 */
export function sobreRuta(ruta, pos, adelante = 6) {
  let mejor = { lejos: Infinity, seg: 0, u: 0 }
  for (let i = 1; i < ruta.length; i++) {
    const q = cercanoEnSegmento(pos, ruta[i - 1], ruta[i])
    const d = dist(q, pos)
    if (d < mejor.lejos - 1e-6 || (Math.abs(d - mejor.lejos) < 1e-6 && i > mejor.seg)) mejor = { lejos: d, seg: i, q }
  }
  if (!mejor.q) return { lejos: dist(pos, ruta[0]), seg: 0, punto: ruta[0], resta: 0 }
  let falta = adelante, p = mejor.q, i = mejor.seg
  while (i < ruta.length) {
    const d = dist(p, ruta[i])
    if (d >= falta) { p = [p[0] + ((ruta[i][0] - p[0]) * falta) / d, p[1] + ((ruta[i][1] - p[1]) * falta) / d]; falta = 0; break }
    falta -= d
    p = ruta[i]
    i++
  }
  // lo que falta por la ruta hasta el final, y la próxima esquina (a cuántas yd y cuánto dobla)
  let resta = dist(mejor.q, ruta[mejor.seg])
  for (let k = mejor.seg + 1; k < ruta.length; k++) resta += dist(ruta[k - 1], ruta[k])
  const sg = mejor.seg, esquina = sg < ruta.length - 1
    ? { dist: dist(mejor.q, ruta[sg]), giro: Math.abs(difAng(Math.atan2(ruta[sg + 1][1] - ruta[sg][1], ruta[sg + 1][0] - ruta[sg][0]), Math.atan2(ruta[sg][1] - ruta[sg - 1][1], ruta[sg][0] - ruta[sg - 1][0]))) }
    : null
  return { lejos: mejor.lejos, seg: mejor.seg, punto: p, resta, esquina }
}
/** ¿Hay que recalcular la ruta? (se fue lejos de la línea) */
export const fueraDeRuta = (ruta, pos) => !ruta || sobreRuta(ruta, pos, 0).lejos > 7

/** ¿Hay árbol (o afuera) derecho adelante, a menos de `d` yd? Devuelve a cuántas, o null. */
function arbolAdelante(campo, pos, ang, d) {
  for (let k = 1.5; k <= d; k += 0.5) if (NO_SE_PASA.has(celda(campo, [pos[0] + Math.cos(ang) * k, pos[1] + Math.sin(ang) * k]))) return k
  return null
}
/**
 * El PILOTO: arma el `mando` para seguir la ruta. `volante`: null = maneja solo (LLEVAME); -1/0/1 = dobla el que
 * juega (manejo fácil), y con 0 la AYUDA lo corrige si va derecho a un árbol. Acelera solo hasta `tope`, frena para
 * doblar cerrado (manejando solo) y, si se traba contra algo, sale marcha atrás un ratito. Esquiva las cáscaras de
 * `cascaras` (manejando solo). Guarda lo suyo en `carro.piloto`.
 */
export function conducir(campo, carro, { ruta, pelota, volante = null, tope = CARRITO.vmax, frenar = false, cascaras = [] }, dt) {
  const p = (carro.piloto ??= { atras: 0, quieto: 0 })
  const mando = { acelerar: false, frenar: false, reversa: false, izq: false, der: false, tope }
  const v = carro.v
  // el punto a seguir: unos metros más adelante sobre la ruta, pero que se vea derecho (en las esquinas, más cerca)
  const m = mapaDe(campo)
  let sr = null
  if (ruta) for (let adelante = 5 + Math.max(0, v) * 0.35; ; adelante -= 1.5) {
    sr = sobreRuta(ruta, carro.pos, Math.max(1.5, adelante))
    if (adelante <= 1.5 || seVe(m, carro.pos, sr.punto, 2)) break
  }
  let obj = sr ? sr.punto : pelota
  // manejando solo: si hay una cáscara cerca de la línea, apunta al costado
  if (volante == null) for (const k of cascaras) {
    if (!k.viva || dist(k.pos, carro.pos) > 16) continue
    const q = cercanoEnSegmento(k.pos, carro.pos, obj)
    if (dist(q, k.pos) < 2.4) {
      const d = [obj[0] - carro.pos[0], obj[1] - carro.pos[1]], n = Math.hypot(d[0], d[1]) || 1
      const lado = (k.pos[0] - carro.pos[0]) * -d[1] + (k.pos[1] - carro.pos[1]) * d[0] > 0 ? -1 : 1
      obj = [k.pos[0] + (-d[1] / n) * 3.2 * lado, k.pos[1] + (d[0] / n) * 3.2 * lado]
    }
  }
  const e = difAng(Math.atan2(obj[1] - carro.pos[1], obj[0] - carro.pos[0]), carro.ang)
  // trabado: marcha atrás, con la trompa que gira hacia donde hay que ir
  if (p.atras > 0) {
    p.atras -= dt
    mando.reversa = true
    mando[e > 0 ? 'izq' : 'der'] = Math.abs(e) > 0.1
    return mando
  }
  if (frenar) { mando.frenar = true; return mando }
  // la velocidad: derecho, a fondo (hasta el tope); doblando cerrado, despacio (manejando solo); cerca, frena
  const dPel = pelota ? dist(carro.pos, pelota) : Infinity
  let quiere = tope
  if (volante == null) {
    quiere = Math.abs(e) > 0.9 ? 6 : Math.abs(e) > 0.45 ? 10 : tope
    // se viene una esquina cerrada: frena antes
    if (sr?.esquina && sr.esquina.giro > 0.5 && sr.esquina.dist < 4 + v * 0.9) quiere = Math.min(quiere, sr.esquina.giro > 1.2 ? 6 : 9)
  }
  quiere = Math.min(quiere, 7 + dPel * 0.6)
  if (v < quiere) mando.acelerar = true
  else if (v > quiere + 4) mando.frenar = true
  // el volante
  if (volante == null) { mando.der = e > 0.06; mando.izq = e < -0.06 }
  else if (volante) { mando.der = volante > 0; mando.izq = volante < 0 }
  else {
    // la ayuda: si va derecho a un árbol, dobla para el lado de la ruta (o para el que esté más libre)
    const choca = v > 3 && arbolAdelante(campo, carro.pos, carro.ang, 3 + v * 0.55)
    if (choca) {
      let lado = Math.sign(e)
      if (Math.abs(e) < 0.08) {
        const iz = arbolAdelante(campo, carro.pos, carro.ang - 0.5, 12) ?? 99, de = arbolAdelante(campo, carro.pos, carro.ang + 0.5, 12) ?? 99
        lado = de >= iz ? 1 : -1
      }
      mando.der = lado > 0
      mando.izq = lado < 0
      p.ayuda = true
    } else p.ayuda = false
  }
  // ¿se trabó? (quiere andar y no anda)
  if (mando.acelerar && Math.abs(v) < 1) p.quieto += dt
  else p.quieto = 0
  if (p.quieto > 0.45) { p.quieto = 0; p.atras = 0.75 }
  return mando
}

/**
 * ESTACIONAR: a `CARRITO.estacionar` yd de la pelota, si la ve derecho, el lugar donde se baja: a 3,6 yd de la pelota,
 * del lado de donde viene (en el bosque, lo más cerca que se pueda sin entrar), mirando al hoyo. O null.
 */
export function puntoEstacionar(campo, carro, pelota, pin) {
  const d = dist(carro.pos, pelota)
  if (d > CARRITO.estacionar) return null
  const m = mapaDe(campo)
  const enBosque = NO_SE_PASA.has(celda(campo, pelota))
  const u = d > 0.01 ? [(carro.pos[0] - pelota[0]) / d, (carro.pos[1] - pelota[1]) / d] : [1, 0]
  const cabe = (p) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].every(([ox, oy]) => !NO_SE_PASA.has(celda(campo, [p[0] + ox, p[1] + oy])))
  for (const giro of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.4, -2.4]) {
    const ux = u[0] * Math.cos(giro) - u[1] * Math.sin(giro), uy = u[0] * Math.sin(giro) + u[1] * Math.cos(giro)
    for (let k = enBosque ? 1.5 : 3.6; k <= (enBosque ? CARRITO.llegarBosque - 0.5 : 3.9); k += 0.3) {
      const p = [pelota[0] + ux * k, pelota[1] + uy * k]
      if (!cabe(p) || !seVe(m, carro.pos, p)) continue
      return { pos: p, ang: Math.atan2(pin[1] - p[1], pin[0] - p[0]) }
    }
  }
  return null
}

// ── las CÁSCARAS: al subirte al carrito, los monos que andan cerca tiran cáscaras de banana sobre la ruta. Si pisás una
// andando, el carrito da un trompo (sin multa: el susto y la velocidad que perdés). Los que manejan solos las esquivan.
export const CASCARA = { chance: 0.4, max: 2, radio: 1.5, vel: 3, alcance: 70 }
/** Tira las cáscaras de este tramo (en `r.cascaras`): { pos, desde (el mono que la tiró), viva }. Devuelve cuántas. */
export function tirarCascaras(r, ruta, rng) {
  r.cascaras = []
  if (!ruta || rng() > CASCARA.chance) return 0
  const largo = largoDe(ruta)
  if (largo < 50) return 0
  const n = 1 + Math.floor(rng() * CASCARA.max)
  for (let i = 0; i < n; i++) {
    // en algún lugar del medio del camino (ni pegada al carrito ni a la pelota)
    let falta = largo * (0.3 + rng() * 0.5), pos = null
    for (let k = 1; k < ruta.length && !pos; k++) {
      const d = dist(ruta[k - 1], ruta[k])
      if (d >= falta) pos = [ruta[k - 1][0] + ((ruta[k][0] - ruta[k - 1][0]) * falta) / d, ruta[k - 1][1] + ((ruta[k][1] - ruta[k - 1][1]) * falta) / d]
      else falta -= d
    }
    if (!pos) continue
    // la tira el mono más cercano que anda por ahí (si no hay ninguno, no hay cáscara)
    let mono = null
    for (const s of r.monos ?? []) if (s.modo !== 'aplastado' && dist(s.pos, pos) < CASCARA.alcance && (!mono || dist(s.pos, pos) < dist(mono.pos, pos))) mono = s
    if (!mono) continue
    if (r.cascaras.some((k) => dist(k.pos, pos) < 12)) continue
    r.cascaras.push({ pos, desde: [...mono.pos], viva: true })
  }
  return r.cascaras.length
}
/** El carrito pisó una cáscara (andando): trompo. Devuelve la cáscara, o null. */
export function pisarCascara(r) {
  const c = r.carro
  if (!c || !r.cascaras?.length || Math.abs(c.v) < CASCARA.vel || c.trompo > 0) return null
  for (const k of r.cascaras) {
    if (!k.viva || dist(k.pos, c.pos) > CASCARA.radio) continue
    k.viva = false
    c.trompo = CARRITO.trompo
    c.trompoDir = (c.vl ?? 0) >= 0 ? 1 : -1
    c.carga = 0
    return k
  }
  return null
}

// ── la BOCINA: los monos cerca del carrito se asustan y salen corriendo para el otro lado un rato ──
export const BOCINA = { radio: 40, susto: 3.5, vel: 20, espera: 2.5 }
/** ¡Bocinazo! Devuelve cuántos monos se espantaron. */
export function bocina(r) {
  if (!r.carro) return 0
  let n = 0
  for (const s of r.monos) {
    if (s.modo === 'aplastado' || !monoActivo(s) || dist(s.pos, r.carro.pos) > BOCINA.radio) continue
    s.modo = 'huye'
    s.susto = BOCINA.susto
    s.huyeDe = [...r.carro.pos]
    s.pancho = null
    s.espera = 0
    n++
  }
  return n
}

// ── la racha y el volante: un choque de frente fuerte (a `vel` yd/s o más) le baja un escalón a la racha de Marcos ──
export const CHOQUE_RACHA = { vel: 7 }
export function chocarRacha(r, impacto) {
  if (!usaCarrito(r) || r.prestado || !(r.racha > 0) || !(impacto >= CHOQUE_RACHA.vel)) return false
  r.racha -= 1
  return true
}

// ── el match (desafíos) ──
// El que desafía juega una vez y su vuelta queda grabada; el desafiado juega después con el fantasma al lado.
// Los dos juegan con las MISMAS condiciones: el viento de cada hoyo y dónde está cada bandera salen de una
// semilla (no del player que elija cada uno). El error de los tiros y los monos, no: eso es de cada uno.
export const MATCH = { muestraMs: 100, maxMuestras: 6000 }
/** El viento de cada hoyo, las banderas y el clima de un match, a partir de su semilla (y la fecha del desafío: NIEVE). */
export function condicionesMatch(semilla, fecha = Date.now()) {
  const rv = rngDesde(semilla), rb = rngDesde((semilla ^ 0x5bd1e995) >>> 0)
  const vientos = HOYOS.map(() => vientoAleatorio(rv))
  const conBanderas = sortearBanderas({}, rb)
  const rc = rngDesde((semilla ^ 0x27d4eb2f) >>> 0) // el clima: otra tirada, así el viento y las banderas no cambian
  const clima = sortearClima(rc, fecha)
  return { semilla, vientos, pines: conBanderas.hoyos.map((h) => ({ pin: [...h.pin], bandera: h.bandera })), clima, semillaClima: Math.floor(rc() * 4294967296) }
}
// el MODO PRO del match: sin líneas punteadas ni zona de pique (no ves dónde cae). Va marcado en la semilla del
// desafío (los 16 bits de abajo = `marca`), así viaja con el match sin tocar la base: el que responde juega igual
export const PRO = { marca: 0xb0ca }
export const esPro = (semilla) => ((semilla >>> 0) & 0xffff) === PRO.marca
export const semillaPro = (semilla) => (((semilla >>> 0) & 0xffff0000) | PRO.marca) >>> 0
/**
 * Pone las condiciones del match en la ronda (banderas y el viento del primer hoyo; los siguientes, en cerrarHoyo).
 * El clima lo pone la página después (ponerClima con cond.clima y cond.semillaClima): necesita la cancha.
 */
export function aplicarMatch(r, cond) {
  r.match = cond
  r.pro = esPro(cond.semilla)
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
  // los dos levantaron: gana el que aguantó más (el tiempo hasta que levantó; el que abandonó sin jugar no tiene).
  // Sin tiempo los dos (los matches de antes del 9/10/2026), empate. Igual en la base: trampa_bananas_ganador
  if (ga == null && gb == null) {
    const ta = a?.ms ?? 0, tb = b?.ms ?? 0
    return ta === tb ? 0 : ta > tb ? 1 : -1
  }
  if (ga == null) return -1
  if (gb == null) return 1
  if (ga !== gb) return ga < gb ? 1 : -1
  if ((a.ms ?? Infinity) !== (b.ms ?? Infinity)) return (a.ms ?? Infinity) < (b.ms ?? Infinity) ? 1 : -1
  return 0
}
/** Si el match lo definió el aguante: los dos levantaron y uno aguantó más. */
export const porAguante = (a, b) => (a?.golpes ?? null) == null && (b?.golpes ?? null) == null && (a?.ms ?? 0) !== (b?.ms ?? 0)
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
// Tito: con la pelota en el aire maneja el viento a swipes. Su vuelo dura `tiempo` veces más (para que dé tiempo) y el
// viento lo mueve `fuerza` yardas por km/h en un tiro de carryMax, parejo con el largo (también en el approach). Cada
// ráfaga se calma sola: el viento se apaga con constante `calma` segundos (2026-10-07: antes era un joystick)
export const TITO = { tiempo: 1.45, fuerza: 2, calma: 0.9 }
const vientoDe = (v) => ({ ang: Math.atan2(v.wy, v.wx), kmh: Math.hypot(v.wx, v.wy) })
// Tito, en el green: el putt es ultra sensible al dedo. Lo que el dedo se corre de la línea al hoyo se multiplica por
// `angulo` (y si no apuntás justo al hoyo, la línea se va enseguida para cualquier lado), y a fondo se llega
// arrastrando 1/`fuerza` de lo normal (un milímetro de más y se pasa de largo)
export const TITO_PUTT = { angulo: 3.5, fuerza: 4 }
/** El putt de Tito: el ángulo y la fuerza (0..1+, arrastre / largo) que da el dedo, amplificados. `ref` es el ángulo al hoyo. */
export function puttDeTito(ang, u, ref) {
  const d = Math.atan2(Math.sin(ang - ref), Math.cos(ang - ref))
  const k = Math.max(-Math.PI, Math.min(Math.PI, d * TITO_PUTT.angulo))
  return { ang: ref + k, u: u * TITO_PUTT.fuerza }
}
/** Tito, en el aire: el viento pasa a ser este (y con él, para dónde se va la pelota que vuela). */
export function soplarEnVivo(r, tiro, ang, kmh) {
  if (!controlarViento(r, ang, kmh)) return false
  if (tiro?.vivo) { tiro.vivo.wx = Math.cos(r.viento.ang) * r.viento.kmh; tiro.vivo.wy = Math.sin(r.viento.ang) * r.viento.kmh }
  return true
}
/** Tito, un swipe: una ráfaga para ese lado que se suma al viento que hay (hasta FISICA.vientoMax). */
export function rafagaTito(r, tiro, ang, kmh) {
  if (habilidadDe(r.jugador)?.id !== 'viento' || !tiro?.vivo) return false
  const v = tiro.vivo
  v.wx += Math.cos(ang) * kmh
  v.wy += Math.sin(ang) * kmh
  const m = Math.hypot(v.wx, v.wy)
  if (m > FISICA.vientoMax) { v.wx *= FISICA.vientoMax / m; v.wy *= FISICA.vientoMax / m }
  const w = vientoDe(v)
  controlarViento(r, w.ang, w.kmh)
  return true
}
/** El viento de ahora en el tiro de Tito (para mostrarlo). */
export const vientoVivo = (tiro) => (tiro?.vivo ? vientoDe(tiro.vivo) : null)
/** Tito Esperanza: él decide el viento (para dónde sopla, en ángulo de la cancha, y de 0 a FISICA.vientoMax km/h). */
export function controlarViento(r, ang, kmh) {
  if (habilidadDe(r.jugador)?.id !== 'viento') return false
  const a = Math.atan2(Math.sin(ang), Math.cos(ang))
  r.viento = { ang: a < 0 ? a + 2 * Math.PI : a, kmh: Math.round(Math.max(0, Math.min(FISICA.vientoMax, kmh))) }
  return true
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
    if (s.modo === 'huye') {
      // la bocina de Marcos: corre para el otro lado y, pasado el susto, vuelve a su recorrido
      s.susto -= dt
      const d = dist(s.pos, s.huyeDe) || 1
      s.pos = [s.pos[0] + ((s.pos[0] - s.huyeDe[0]) / d) * BOCINA.vel * dt, s.pos[1] + ((s.pos[1] - s.huyeDe[1]) / d) * BOCINA.vel * dt]
      if (s.susto <= 0) { s.modo = 'ronda'; s.espera = 0; s.huyeDe = null }
      continue
    }
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
    if (caminar(s, s.m[s.hacia], MONO.vel * (s.siesta ?? 1), dt)) {
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
    if (s.modo === 'aplastado' || s.modo === 'huye' || dist(s.pos, pelota) > alerta) continue
    if (s.modo !== 'caza') {
      s.modo = 'caza'
      s.reaccion = MONO.reaccion / (s.siesta ?? 1) // el clima: con sol (o nieve) salen tarde y lentos
      const falta = Math.max(0, dist(s.pos, pelota) - MONO.radio * 0.8)
      s.velCaza = Math.min(MONO.velCaza, falta / (MONO.minimo - MONO.reaccion)) * (s.siesta ?? 1)
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
 * Acá entran las habilidades: la comba de Rodal y la bomba de Miguelón (`precision`: ya no se usa, era el latido del
 * óvalo de la bomba).
 */
export function planTiro(campo, r, angulo, potencia, precision = 0, tiempo = 0, ruta = null) {
  potencia = Math.max(0, Math.min(1, potencia))
  const b = r.pelota
  const hab = habilidadDe(r.jugador)
  // Miguelón sacado: la dispersión más grande que hay (la del peor handicap, y más) y la bomba, la peor
  const furioso = hab?.id === 'bomba' && !!r.furia?.enojado
  const dif = furioso ? { ...dificultad(r.jugador?.hcp), error: DISPERSION_HCP.error * FURIA.extra } : dificultad(r.jugador?.hcp)
  if (furioso) precision = 0
  if (enModoPutt(campo, r)) {
    const puttMax = puttMaxDe(dist(b, hoyoActual(r).pin))
    const carry = potencia * puttMax * (r.blando ? MUFA.blando : 1) // ablandado por un Dicky: corto
    // el putt del Mago: con draw dobla a la izquierda (ángulo menor), con fade a la derecha
    const pin = hoyoActual(r).pin
    const giro = hab?.id === 'comba' ? puttMagoDe(r).lado * PUTT_MAGO.giro : 0
    // los 15 metros son reales (los que muestra el marcador): la distancia del dibujo pasa por la escala del hoyo. Las
    // dadas son de Joaco; con la lechuza (el easter egg), una para cualquiera
    const enDada = dist(b, pin) * hoyoActual(r).escala <= DADA
    const propia = hab?.id === 'dadas' && !r.ofendido
    const noLaFalla = enDada && (propia || !!r.lechuza)
    const lechuza = enDada && !propia && !!r.lechuza
    const retro = hab?.id === 'retro'
    return { putt: true, puttMax, cuerda: angulo, carry, destino: [b[0] + Math.cos(angulo) * carry, b[1] + Math.sin(angulo) * carry], control: null, disp: null, error: retro ? 0 : dif.error * (hab?.id === 'caos' ? SORPRESA.error : 1) * (r.mufa ? MUFA.error : 1) * (hab?.id === 'carrito' ? factorRacha(r) : 1), recto: retro || hab?.id === 'derecho' || !!r.calma, giro, noLaFalla, lechuza, furia: furioso, mufa: !!r.mufa, blando: !!r.blando }
  }
  const tee = desdeLaSalida(campo, r)
  const plan = planBase(angulo, potencia, r.lie)
  plan.salida = tee
  plan.furia = furioso
  // el carry en yardas reales (según el handicap) pasado a yardas del dibujo con la escala del hoyo
  const escala = hoyoActual(r).escala
  const par = hoyoActual(r).par
  plan.carry = (potencia * carryMaxDe(r.jugador?.hcp, par) * (FISICA.factorLie[r.lie] ?? 1)) / escala
  plan.real = FISICA.factorReal[r.lie] ?? 1 // el bunker: la mitad de lo que se ve
  plan.disp = { ...plan.disp, ang: plan.disp.ang * dif.error, carry: plan.disp.carry * dif.error }
  // la bomba: Miguelón y Taiu (la Rana)
  const bombero = hab?.id === 'bomba' || hab?.id === 'reves'
  if (bombero && tee) plan.carry = (potencia * (par === 3 ? carryPar3De(r.jugador?.hcp) : BOMBA.carry)) / escala // en el par 3, sin bomba
  const clima = climaDe(r)
  if (clima?.carry && hab?.id !== 'retro') plan.carry *= clima.carry // el clima: con calor vuela más; con lluvia, menos (se ve al apuntar)
  if (bombero && tee && plan.carry * escala > BOMBA.zona) {
    // la bomba: el tope más largo (la goma llega a BOMBA.carry); el perfecto, del latido, como para todos
    plan.bomba = true
    plan.disp = { ang: ((BOMBA.ang * Math.PI) / 180) * dif.error, carry: BOMBA.largo * dif.error, fondo: false }
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
  if (hab?.id === 'caos') plan.disp = { ...plan.disp, ang: plan.disp.ang * SORPRESA.error, carry: plan.disp.carry * SORPRESA.error }
  // Marcos: con racha, menos error (cada tiro bueno seguido, un poco menos)
  if (hab?.id === 'carrito' && r.racha) { const k = factorRacha(r); plan.disp = { ...plan.disp, ang: plan.disp.ang * k, carry: plan.disp.carry * k }; plan.racha = r.racha }
  if (hab?.id === 'derecho' && !tee) {
    // El Sueco, desde el segundo tiro: una flecha. Derecho (sin error de dirección), bajo y rápido, y atraviesa
    // todo: los pinos y los monos que se cruzan en el vuelo (2026-10-07, antes era "siempre derecho" también el drive)
    plan.disp = { ...plan.disp, ang: 0 }
    plan.flecha = true
  }
  // Demetrio: pega perfecto (ni error de dirección ni de largo) y llega a lo que se ve, también desde el bunker
  if (hab?.id === 'retro') { plan.disp = { ...plan.disp, ang: 0, carry: 0 }; plan.real = 1; plan.exacto = true }
  if (hab?.id === 'comba') {
    // nunca derecho: sale por donde apunta y se cierra según el golpe que le tocó
    // (curva = Bézier con el control sobre la línea de salida; lado 1 = cae a la izquierda de la salida)
    const g = golpeMagoDe(r) ?? GOLPES_MAGO[0]
    if (g.dibujo) return planDibujo(r, g, angulo, potencia, plan, ruta, escala, par)
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
  if (hab?.id === 'aguila' || (hab?.id === 'derecho' && tee)) {
    // la línea de tiro se sacude; `tiempo` = segundos desde que empezó a apuntar (Fito siempre; El Sueco, en el drive)
    const desvio = AGUILA.amplitud * Math.sin((2 * Math.PI * tiempo) / AGUILA.periodo)
    const enVentana = Math.abs(desvio) <= AGUILA.ventana
    const pin = hoyoActual(r).pin
    plan.aguila = { desvio, enVentana }
    plan.cuerda = angulo + (desvio * Math.PI) / 180
    if (enVentana) plan.disp = { ...plan.disp, ang: 0 } // sale derecha
    // cerca del green el imán la mete (antes la dejaba dada al lado; pedido de Rorro, 2026-10-04: "así es más justo")
    // AGUILA.chip son yardas reales; `radio` = hasta dónde tira el imán, en yardas del dibujo. El imán es solo de Fito
    if (hab?.id === 'aguila' && dist(b, pin) * escala <= AGUILA.chip) plan.iman = { meter: true, radio: AGUILA.chip / escala }
  }
  // el juego corto: el error no baja de un mínimo en yardas (un chip de 15 yd no cae en un pañuelo), según el handicap
  // (y un scratch también le erra: no menos de `CORTO.minimo`). También la flecha del Sueco, de cerca. No los tiros sin
  // error de una habilidad (LG sin error, el approach de Taiu, Demetrio, el embudo de Fito) ni la bomba
  const sinError = plan.calma || plan.approachPerfecto || plan.exacto || plan.bomba || plan.aguila?.enVentana
  const cy = plan.carry * escala
  // (y el perfecto de cerca sale con `PERFECTO.errorCorto`, no con un cuarto: de cerca el latido es lento y la ventana ancha)
  if (cy < CORTO.hasta) plan.errorPerfecto = PERFECTO.error + (PERFECTO.errorCorto - PERFECTO.error) * Math.min(1, (CORTO.hasta - cy) / CORTO.transicion)
  if (!sinError && cy > 1 && cy < CORTO.hasta) {
    const e = Math.max(dif.error, CORTO.minimo) * Math.min(1, (CORTO.hasta - cy) / CORTO.transicion) // solo de cerca
    plan.disp = { ...plan.disp, carry: Math.max(plan.disp.carry, (CORTO.largo * e) / cy), ang: Math.max(plan.disp.ang, Math.atan((CORTO.ancho * e) / cy)) }
  }
  // 😈 mufado por el Equipo 5: más error (y el latido más rápido: ver la página). 🥺 Ablandado por un Dicky: sale corto
  if (r.mufa) { plan.disp = { ...plan.disp, ang: plan.disp.ang * MUFA.error, carry: plan.disp.carry * MUFA.error }; plan.mufa = true }
  if (r.blando) { plan.carry *= MUFA.blando; plan.blando = true }
  plan.destino = [b[0] + Math.cos(plan.cuerda) * plan.carry, b[1] + Math.sin(plan.cuerda) * plan.carry]
  return plan
}

/**
 * El Dibuje maestro: la pelota vuela por la línea dibujada (de la pelota en adelante), suavizada y cortada donde se le
 * acaba el carry (el de pegarle a fondo). Sin línea (el bot, o mientras no dibujó), una recta con `angulo` y `potencia`.
 * Vuela por arriba de los pinos y le queda la mitad del error, como a los otros golpes del Mago.
 */
function planDibujo(r, g, angulo, potencia, plan, ruta, escala, par) {
  const b = r.pelota
  const max = (carryMaxDe(r.jugador?.hcp, par) * (FISICA.factorLie[r.lie] ?? 1) * g.carry) / escala
  const crudo = ruta?.length ? ruta : [b, [b[0] + Math.cos(angulo) * plan.carry, b[1] + Math.sin(angulo) * plan.carry]]
  const pts = suavizarRuta(b, crudo, max)
  const largo = largoRuta(pts)
  const fin = pts[pts.length - 1]
  plan.comba = true
  plan.dibujo = true
  plan.golpe = g.id
  plan.alto = g.alto
  plan.rueda = g.rueda
  plan.rasante = false
  plan.ruta = largo >= DIBUJO.minimo / escala ? pts : null
  plan.carry = largo
  plan.cuerda = Math.atan2(fin[1] - b[1], fin[0] - b[0])
  plan.control = null
  plan.disp = { ...plan.disp, ang: plan.disp.ang * COMBA.error }
  plan.destino = [...fin]
  return plan
}
const largoRuta = (pts) => pts.reduce((s, p, i) => (i ? s + dist(pts[i - 1], p) : 0), 0)
/**
 * La línea del Dibuje maestro, prolija: arranca en la pelota, se remuestrea parejo, se suaviza (un zigzag queda en
 * eses suaves, el principio y el final no se mueven) y se corta a `max` yardas de recorrido.
 */
export function suavizarRuta(desde, crudo, max = Infinity) {
  let pts = [[...desde], ...crudo.filter((p) => dist(p, desde) > 0.01)]
  if (pts.length < 2) return [[...desde], [...desde]]
  // remuestreo cada DIBUJO.paso (o más fino si la línea es corta)
  const total = largoRuta(pts)
  const paso = Math.max(0.05, Math.min(DIBUJO.paso, total / 12))
  const parejo = [pts[0]]
  let resto = paso
  for (let i = 1; i < pts.length; i++) {
    let [ax, ay] = pts[i - 1]
    const [bx, by] = pts[i]
    let d = Math.hypot(bx - ax, by - ay)
    while (d >= resto) {
      const k = resto / d
      ax += (bx - ax) * k
      ay += (by - ay) * k
      parejo.push([ax, ay])
      d -= resto
      resto = paso
    }
    resto -= d
  }
  if (dist(parejo[parejo.length - 1], pts[pts.length - 1]) > 1e-6) parejo.push([...pts[pts.length - 1]])
  pts = parejo
  // suavizado: promedio con los vecinos (las puntas quedan fijas)
  for (let k = 0; k < DIBUJO.pasadas; k++) {
    pts = pts.map((p, i) => (i === 0 || i === pts.length - 1 ? p : [(pts[i - 1][0] + 2 * p[0] + pts[i + 1][0]) / 4, (pts[i - 1][1] + 2 * p[1] + pts[i + 1][1]) / 4]))
  }
  // corta donde se acaba el carry
  const out = [pts[0]]
  let van = 0
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1], pts[i])
    if (van + d >= max) {
      const k = (max - van) / (d || 1)
      out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k])
      break
    }
    van += d
    out.push(pts[i])
  }
  // y queda en DIBUJO.puntos puntos parejos (para el vuelo)
  const L = largoRuta(out)
  if (L <= 0) return [[...desde], [...desde]]
  const res = []
  for (let j = 0; j < DIBUJO.puntos; j++) res.push(puntoEnRuta(out, (L * j) / (DIBUJO.puntos - 1)))
  return res
}
/** El punto a `s` yardas de recorrido de la línea. */
function puntoEnRuta(pts, s) {
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1], pts[i])
    if (s <= d || i === pts.length - 1) {
      const k = d ? Math.min(1, s / d) : 0
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k]
    }
    s -= d
  }
  return [...pts[pts.length - 1]]
}

/**
 * El tope del putt (yardas a fondo) según lo lejos que está el hoyo: de cerca, la goma entera es un putt corto y lo
 * dosificás fino (de 3 yd, el tope es 12: a fondo se pasa 4 veces, no 10). Desde 13 yd, el de siempre. La física del
 * putt no cambia (el error es proporcional a lo que le pegás), así que el bot y la calibración dan lo mismo.
 */
export const PUTT_MAX = { min: 12, porYarda: 2, extra: 6 }
export const puttMaxDe = (d) => Math.max(PUTT_MAX.min, Math.min(FISICA.distPuttMax, d * PUTT_MAX.porYarda + PUTT_MAX.extra))

/** Arma el tiro. El aim que ve el jugador es `angulo` y `potencia` (o el `plan` de planTiro); acá se suma el error humano y el viento. */
export function lanzar(campo, { pelota, angulo, potencia, viento, putt, lie, rng, plan }) {
  potencia = Math.max(0, Math.min(1, potencia))
  if (putt) {
    const e = plan?.error ?? 1
    const d = potencia * (plan?.puttMax ?? FISICA.distPuttMax) * (1 + gauss(rng) * FISICA.error.puttDist * e)
    const a = angulo + (plan?.recto ? 0 : gauss(rng) * FISICA.error.puttAng * e)
    const v0 = Math.sqrt(2 * FISICA.roce.green * Math.max(0, d))
    return { modo: 'putt', fase: 'rodando', pos: [...pelota], alt: 0, v: [Math.cos(a) * v0, Math.sin(a) * v0], carry: 0, giro: plan?.giro ?? 0, labio: false, eventos: [] }
  }
  const p = plan ?? planBase(angulo, potencia, lie)
  // el error del tiro, en desvíos: el perfecto (soltó en el sweet spot del latido) sale con un cuarto, no con cero; el
  // bueno, con `errorBueno`. Un tiro sin error (Demetrio, LG sin error, el de Deme) sale perfecto siempre: es real.
  // Con el latido, el lado del error lo decide cuándo soltó: temprano, a la izquierda; tarde, a la derecha
  const k = p.perfecto ? p.errorPerfecto ?? PERFECTO.error : p.bueno ? PERFECTO.errorBueno : 1
  let ze = gauss(rng) * k
  const g = gauss(rng) * k
  if (p.lado && !p.perfecto) ze = Math.abs(ze) * p.lado
  const perfecto = !!p.perfecto || !(p.disp.ang > 0 || p.disp.carry > 0)
  const err = ze * p.disp.ang
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
  // el Dibuje maestro: la línea, desde la pelota, girada por el error y estirada o acortada como el carry
  let ruta = null
  if (p.ruta) {
    const k = p.carry ? carry / p.carry : 0
    const c = Math.cos(err), s = Math.sin(err)
    ruta = p.ruta.map(([x, y]) => {
      const dx = x - pelota[0], dy = y - pelota[1]
      return [(dx * c - dy * s) * k, (dx * s + dy * c) * k]
    })
    const fin = ruta[ruta.length - 1]
    carryVec[0] = fin[0]
    carryVec[1] = fin[1]
    controlVec = [fin[0] / 2, fin[1] / 2]
  }
  return {
    modo: 'full',
    fase: 'vuelo',
    desde: [...pelota],
    carryVec,
    controlVec,
    deriva: [Math.cos(viento.ang) * kv, Math.sin(viento.ang) * kv],
    carry,
    bomba: !!p.bomba,
    perfecta: !!p.bomba && perfecto, // la bomba perfecta (para el relato)
    perfecto,
    bueno: !perfecto && !!p.bueno,
    lado: p.lado ?? 0,
    comba: !!p.comba,
    golpe: p.golpe ?? null,
    ruta, // el Dibuje maestro: el vuelo, punto a punto (relativo a `desde`), a velocidad pareja
    approach: !!p.approach,
    salida: p.salida ?? lie === 'tee', // el tiro de salida (desde el tee del hoyo que se juega, no el de otro)
    liberty: (p.salida ?? lie === 'tee') && !p.putt,
    rasante: !!p.rasante,
    rueda: p.rueda ?? 1,
    derecha: !!p.aguila?.enVentana,
    flecha: !!p.flecha, // El Sueco: atraviesa pinos y monos
    iman: p.iman ?? null,
    // el globo del Mago tarda más en bajar; la viborita va rápida y al ras
    T: (0.8 + (ruta ? largoRuta(ruta) : carry) / 140) * ((p.alto ?? 1) > 1 ? 1.5 : (p.alto ?? 1) < 1 ? 0.75 : 1) * (p.flecha ? FLECHA.tiempo : 1),
    hMax: (8 + carry * 0.12) * (p.alto ?? 1) * (p.flecha ? FLECHA.alto : 1),
    t: 0,
    pos: [...pelota],
    alt: 0,
    v: [0, 0],
    labio: false,
    eventos: [],
  }
}

/** Se queda colgando en el borde del hoyo (afuera, justo): el próximo es un putt de nada. */
function alBorde(tiro, pin) {
  const d = dist(tiro.pos, pin)
  const ux = d > 1e-6 ? (tiro.pos[0] - pin[0]) / d : 0, uy = d > 1e-6 ? (tiro.pos[1] - pin[1]) / d : 1
  tiro.pos = [pin[0] + ux * (FISICA.bocaHoyo + 0.02), pin[1] + uy * (FISICA.bocaHoyo + 0.02)]
  tiro.v = [0, 0]
  tiro.fase = 'quieta'
  tiro.eventos.push({ tipo: 'borde' })
  return tiro.fase
}
/** Pegó en el palo de la bandera: abajo cae adentro; arriba, rebota para atrás y para un costado (la suerte, del tiro). */
function alPalo(tiro, prev, pin) {
  tiro.pegoPalo = { alt: tiro.alt }
  tiro.eventos.push({ tipo: 'bandera' })
  const x = Math.sin(suerteDe(tiro) * 9301.17 + 0.5) * 43758.5453
  const suerte = x - Math.floor(x)
  const abajo = 1 - tiro.alt / PALO_BANDERA.alto
  // si de todos modos caía en la boca del hoyo, entra como la que entra de aire (pegarle al palo no la saca); si no,
  // cuanto más abajo le pega, más cae
  const n = tiro.ruta?.length ?? 0
  const cae = n ? [tiro.desde[0] + tiro.ruta[n - 1][0] + tiro.deriva[0], tiro.desde[1] + tiro.ruta[n - 1][1] + tiro.deriva[1]]
    : [tiro.desde[0] + tiro.carryVec[0] + tiro.deriva[0], tiro.desde[1] + tiro.carryVec[1] + tiro.deriva[1]]
  if (suerte < Math.max(chanceClavada(dist(cae, pin)), CHIP.clavada * abajo)) {
    if (atajaMapache(tiro, pin)) return tiro.fase
    tiro.pos = [...pin]
    tiro.alt = 0
    tiro.v = [0, 0]
    tiro.embocada = true
    tiro.eventos.push({ tipo: 'embocada' })
    tiro.fase = 'quieta'
    return tiro.fase
  }
  // rebota: para atrás, desviada para un lado (afuera de la boca, para que no la vuelva a agarrar de una)
  const dx = tiro.pos[0] - prev[0], dy = tiro.pos[1] - prev[1], d = Math.hypot(dx, dy) || 1
  const a = Math.atan2(-dy / d, -dx / d) + (suerte - 0.5) * 2.4
  const [v0, v1] = PALO_BANDERA.rebote
  const vel = v0 + (v1 - v0) * abajo * 0.5 + (v1 - v0) * 0.5 * suerte
  tiro.pos = [pin[0] + Math.cos(a) * (FISICA.bocaHoyo + 0.05), pin[1] + Math.sin(a) * (FISICA.bocaHoyo + 0.05)]
  tiro.alt = 0
  tiro.v = [Math.cos(a) * vel, Math.sin(a) * vel]
  tiro.labio = true // ya pasó por el hoyo: no hay corbata ni labio de vuelta
  tiro.fase = 'rodando'
  return tiro.fase
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
  if (tiro.fase === 'carrito') {
    // el carrito de Juanpa se la lleva de costado y la deja
    const s = tiro.sorpresa
    s.t += dt
    const k = Math.min(1, s.t / SORPRESA.carritoT)
    const e = k * k * (3 - 2 * k)
    tiro.pos = [s.de[0] + s.vec[0] * e, s.de[1] + s.vec[1] * e]
    if (k >= 1) {
      tiro.v = [0, 0]
      tiro.fase = 'quieta'
      tiro.eventos.push({ tipo: 'carrito' })
    }
    return tiro.fase
  }
  if (tiro.fase === 'vuelo') {
    const u0 = tiro.t / tiro.T
    tiro.t = Math.min(tiro.t + dt, tiro.T)
    const u = tiro.t / tiro.T
    if (tiro.vivo) {
      // Tito: la deriva se suma con el viento de este momento (a viento parejo, termina igual que u² × el total) y el
      // viento se va calmando solo
      const um = (u0 + u) / 2, du = u - u0, v = tiro.vivo
      tiro.deriva = [tiro.deriva[0] + v.wx * v.k * 2 * um * du, tiro.deriva[1] + v.wy * v.k * 2 * um * du]
      const calma = Math.exp(-dt / TITO.calma)
      v.wx *= calma
      v.wy *= calma
    }
    const fd = tiro.vivo ? 1 : u * u // con viento en vivo la deriva ya viene sumada
    const prev = tiro.pos
    // Bézier cuadrática (recta si el control está en el medio) + la deriva del viento
    const b1 = 2 * u * (1 - u)
    const b2 = u * u
    if (tiro.ruta) {
      // el Dibuje maestro: por la línea dibujada (a velocidad pareja) + la deriva del viento
      const q = puntoEnRuta(tiro.ruta, u * (tiro.rutaLargo ??= largoRuta(tiro.ruta)))
      tiro.pos = [tiro.desde[0] + q[0] + tiro.deriva[0] * b2, tiro.desde[1] + q[1] + tiro.deriva[1] * b2]
    } else
    tiro.pos = [
      tiro.desde[0] + tiro.controlVec[0] * b1 + tiro.carryVec[0] * b2 + tiro.deriva[0] * fd,
      tiro.desde[1] + tiro.controlVec[1] * b1 + tiro.carryVec[1] * b2 + tiro.deriva[1] * fd,
    ]
    tiro.alt = 4 * tiro.hMax * u * (1 - u)
    const sp = tiro.sorpresa
    if (sp?.tipo === 'rafaga' && u > sp.u) {
      // la ráfaga: la corre de costado, de golpe pero suave
      const k = Math.min(1, (u - sp.u) / Math.max(0.05, 1 - sp.u))
      const e = k * k * (3 - 2 * k)
      tiro.pos = [tiro.pos[0] + sp.vec[0] * e, tiro.pos[1] + sp.vec[1] * e]
      if (!sp.hecho) { sp.hecho = true; tiro.eventos.push({ tipo: 'rafaga' }) }
    }
    if (sp?.tipo === 'arbol' && u >= sp.u && !sp.hecho) {
      // el árbol que aparece: la frena en el aire y cae ahí, al pie
      sp.hecho = true
      sp.pos = [...tiro.pos]
      tiro.alt = 0
      tiro.v = [0, 0]
      tiro.fase = 'quieta'
      tiro.eventos.push({ tipo: 'arbol' })
      return tiro.fase
    }
    if (u > 0.02 && !tiro.alHoyo && !tiro.flecha && robo(tiro)) return tiro.fase // el tiro de Deme (o el de par de Demetrio) no lo para nadie
    // el palo de la bandera: bajando sobre el hoyo, le pega
    if (pin && tiro.modo === 'full' && !tiro.alHoyo && !tiro.exacto && !tiro.flecha && !tiro.pegoPalo && u > 0.5 && tiro.alt < PALO_BANDERA.alto) {
      const c = cercanoEnSegmento(pin, prev, tiro.pos)
      if (dist(c, pin) < PALO_BANDERA.radio) return alPalo(tiro, prev, pin)
    }
    // los golpes del Mago vuelan por arriba de los pinos (menos la viborita, que va al ras)
    const pino = !tiro.alHoyo && !tiro.exacto && !tiro.flecha && (!tiro.comba || tiro.rasante) && u > 0.02 && u < 1 && tiro.alt < FISICA.alturaPino ? pinoEn(campo, tiro.pos) : null
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
        if (atajaMapache(tiro, pin)) return tiro.fase
        tiro.pos = [...pin]
        tiro.v = [0, 0]
        tiro.embocada = true
        tiro.eventos.push({ tipo: 'clavada' }, { tipo: 'embocada' })
        tiro.fase = 'quieta'
        return tiro.fase
      }
      // el carrito de Juanpa: pasa justo, la levanta y se la lleva
      if (tiro.sorpresa?.tipo === 'carrito' && !tiro.sorpresa.hecho) {
        tiro.sorpresa.hecho = true
        tiro.sorpresa.de = [...tiro.pos]
        tiro.sorpresa.t = 0
        tiro.v = [0, 0]
        tiro.fase = 'carrito'
        return tiro.fase
      }
      // rueda en la dirección con la que llega; la comba del Mago, en cambio, pica y sigue derecho a la bandera
      // (el Dibuje maestro: para donde iba el final de la línea)
      const k = tiro.comba ? 0 : 1
      const n = tiro.ruta?.length ?? 0
      const dx = n > 1 ? tiro.ruta[n - 1][0] - tiro.ruta[n - 2][0] : tiro.carryVec[0] - k * tiro.controlVec[0] + tiro.deriva[0]
      const dy = n > 1 ? tiro.ruta[n - 1][1] - tiro.ruta[n - 2][1] : tiro.carryVec[1] - k * tiro.controlVec[1] + tiro.deriva[1]
      const d = Math.hypot(dx, dy) || 1
      // el clima: cae en un charco y ahí queda (plop); si no, pica según cómo está la cancha
      if (tiro.clima && t !== 'green' && charcoEn(tiro.clima, tiro.climaIdx, tiro.pos)) return alCharco(tiro)
      const pique = t === 'green' ? 1 : tiro.clima?.c.pique ?? 1
      const vel = Math.sqrt(1.8 * tiro.carry) * FISICA.pique[t] * (tiro.rueda ?? 1) * pique
      tiro.v = [(dx / d) * vel, (dy / d) * vel]
      // el backspin: pica y vuelve para atrás (un poquito torcido), lo justo para recorrer `backspin.d` yardas en plano
      // (con el roce de ahí); la caída del green lo lleva mientras rueda
      if (tiro.backspin && BACKSPIN.en.includes(t)) {
        const vb = Math.sqrt(2 * roceDe(tiro, t) * tiro.backspin.d)
        const a = Math.atan2(-dy, -dx) + tiro.backspin.desvio
        tiro.v = [Math.cos(a) * vb, Math.sin(a) * vb]
        tiro.eventos.push({ tipo: 'backspin' })
      }
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
      const v = Math.sqrt(2 * roceDe(tiro, 'green') * d) + (tiro.iman.meter ? 0.1 : 0)
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
  const a = roceDe(tiro, ter.tipo)
  const vel = Math.hypot(tiro.v[0], tiro.v[1])
  if (vel <= a * dt) {
    tiro.v = [0, 0]
    tiro.fase = 'quieta'
    const otro = (tiro.ajenos ?? []).find((a) => dist(tiro.pos, a.pin) < FISICA.bocaHoyo)
    if (otro) return caerAjeno(tiro, otro)
    if (pin && dist(tiro.pos, pin) < FISICA.bocaHoyo) {
      // el chip (un tiro completo) que se frena lejos del centro queda colgando en el borde (la boca del dibujo es mucho
      // más grande que un hoyo de verdad); el putt, cae
      if (tiro.modo === 'full' && dist(tiro.pos, pin) > CHIP.centro) return alBorde(tiro, pin)
      if (atajaMapache(tiro, pin)) return tiro.fase
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
  // el clima: rodando entra a un charco y se frena de golpe
  if (tiro.clima && ter.tipo !== 'green' && charcoEn(tiro.clima, tiro.climaIdx, tiro.pos)) return alCharco(tiro)
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
    // un tiro completo que llega rodando (el chip) entra como un putt solo si pasa cerca del centro (`CHIP.centro`): la
    // boca del dibujo es mucho más grande que un hoyo de verdad y, si no, se metían muchísimos chips
    const comoPutt = v < limiteEmbocar(d) && (tiro.modo !== 'full' || d <= CHIP.centro)
    if (tiro.exacto || comoPutt || (tiro.modo === 'full' && suerteDe(tiro) < chanceRodando(d, v))) {
      if (atajaMapache(tiro, pin)) return tiro.fase
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
        // el chip que da la vuelta casi siempre sale (llega con más velocidad y menos derecho que un putt)
        entra: v < limiteEmbocar(d) + VUELTA.entra && (tiro.modo !== 'full' || suerteDe(tiro) < CHIP.vuelta),
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
/**
 * Juanpa: iba a entrar, pero sale un mapache del hoyo y la frena. La pelota queda casi dada, del lado de donde venía
 * (nunca más atrás de donde salió ni adentro de la boca), y el mapache se va rajando (lo dibuja la página).
 */
function atajaMapache(tiro, pin) {
  const m = tiro.mapache
  if (!m || m.hecho || !pin) return false
  m.hecho = true
  const de = m.de ?? tiro.desde ?? tiro.pos, d = dist(de, pin)
  const u = d > 1e-6 ? [(pin[0] - de[0]) / d, (pin[1] - de[1]) / d] : [1, 0]
  const k = Math.max(FISICA.bocaHoyo + 0.15, Math.min(m.m, d * 0.8))
  tiro.pos = [pin[0] - u[0] * k, pin[1] - u[1] * k]
  tiro.v = [0, 0]
  tiro.alt = 0
  m.pos = [...tiro.pos]
  m.dir = u
  tiro.eventos.push({ tipo: 'mapache' })
  tiro.fase = 'quieta'
  return true
}
/** El roce del pasto con el clima del día (Deme, Demetrio y el tiro que va solo al hoyo no lo sienten). */
function roceDe(tiro, tipo) {
  const c = tiro.alHoyo || tiro.exacto ? null : tiro.clima?.c
  return FISICA.roce[tipo] * (tipo === 'green' ? c?.green ?? 1 : c?.roce ?? 1)
}
/** Al charco: se frena de golpe, ahí mismo. */
function alCharco(tiro) {
  tiro.v = [0, 0]
  tiro.alt = 0
  tiro.eventos.push({ tipo: 'charco' })
  tiro.fase = 'quieta'
  return tiro.fase
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
  // el chip que se queda sin velocidad dando la vuelta y no entra, queda colgando en el borde
  if (!vu.entra && vu.vel <= VUELTA.muerta && tiro.modo === 'full') return alBorde(tiro, pin)
  if (vu.entra || vu.vel <= VUELTA.muerta) {
    if (atajaMapache(tiro, pin)) return tiro.fase
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
    golpeMago: null, // el golpe del Mago elegido para el próximo tiro (fuera del green)
    puttMago: 'draw', // y el putt (draw o fade)
    panchos: habilidadDe(jugador)?.id === 'panchitos' ? MUGRE.panchos : 0,
    t0: null, // performance.now() de la largada (lo pone la página)
    ms: null, // el tiempo de la vuelta: de la largada al último putt
    terminada: false,
  }
  if (habilidadDe(jugador)?.id === 'comba') r.golpeMago = GOLPE_MAGO_INICIAL
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
export function progresoDesbloqueo(req, records, jugados = []) {
  const items = req.con.map((apodo) => {
    // Rorro: alcanza con haber jugado una vuelta con cada uno (una firmada también cuenta)
    if (req.jugar) {
      const ok = (req.alias?.[apodo] ?? [apodo]).some((a) => jugados?.includes?.(a) || records?.[a] != null)
      return { apodo, mejor: null, ok, jugado: ok }
    }
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
  r.golpeMago = id === 'comba' ? r.golpeMagoRuleta ?? GOLPE_MAGO_INICIAL : null
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
/** El golpe del Mago de entrada (después queda el último que elegiste). */
export const GOLPE_MAGO_INICIAL = 'draw'
export const golpeMagoDe = (r) => GOLPES_MAGO.find((g) => g.id === r.golpeMago) ?? null
export const puttMagoDe = (r) => PUTTS_MAGO.find((g) => g.id === r.puttMago) ?? PUTTS_MAGO[0]
/** Elegir el golpe del Mago: uno de GOLPES_MAGO (fuera del green) o de PUTTS_MAGO (en el green). */
export function elegirGolpeMago(campo, r, id) {
  if (habilidadDe(r.jugador)?.id !== 'comba') return false
  if (enModoPutt(campo, r)) {
    if (!PUTTS_MAGO.some((g) => g.id === id)) return false
    r.puttMago = id
  } else {
    if (!GOLPES_MAGO.some((g) => g.id === id)) return false
    r.golpeMago = id
    if (r.ruleta) r.golpeMagoRuleta = id // la Ruleta: si vuelve a salir el Mago, con el que elegiste
  }
  return true
}
// La ronda puede traer sus propias banderas (`sortearBanderas`): entonces el hoyo es su copia, con su `pin`.
export const hoyoActual = (r) => (r.hoyos ?? HOYOS)[r.idx]
export const enModoPutt = (campo, r) => r.lie === 'green' && terreno(campo, r.pelota).hoyo === hoyoActual(r).n

/**
 * El árbol contra el que pega el tiro apuntado en la SALIDA (la primera mitad del vuelo, todavía bajo),
 * sin error ni viento: para marcarlo al apuntar. Null si no pega (o si pasa por arriba).
 */
export function pinoEnLaSalida(campo, pelota, plan) {
  if (!plan || plan.putt || plan.exacto || plan.flecha || (plan.comba && !plan.rasante) || !plan.carry) return null // a Demetrio los árboles no lo tocan
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

/**
 * Juanpa: lo que se le va a cruzar en el próximo tiro, sorteado al empezar a apuntar (así se ve antes de pegar y se
 * puede jugar): { tipo, lado (1 = derecha de la línea del tiro, −1 = izquierda), u, m (yardas reales) } o null (limpio).
 * Después de una sorpresa, el próximo tiro sale limpio seguro. Queda en r.proxSorpresa hasta que pega.
 */
export function prepararSorpresa(campo, r, rng, tipo = null) {
  if (habilidadDe(r.jugador)?.id !== 'caos' || enModoPutt(campo, r)) return (r.proxSorpresa = null)
  if (!tipo && (r.sorpresaAnterior || rng() >= SORPRESA.chance)) return (r.proxSorpresa = null)
  tipo ??= elegir(rng, SORPRESAS)
  const u = SORPRESA.desde + rng() * (SORPRESA.hasta - SORPRESA.desde)
  const [a, b] = tipo === 'carrito' ? SORPRESA.carrito : SORPRESA.rafaga
  return (r.proxSorpresa = { tipo, lado: rng() < 0.5 ? 1 : -1, u: tipo === 'carrito' ? 1 : u, m: a + rng() * (b - a) })
}
/** La sorpresa anunciada, ya en el tiro: de costado a la línea del tiro, para el lado que se avisó. */
export function armarSorpresa(r, tiro, s) {
  const d = Math.hypot(tiro.carryVec[0], tiro.carryVec[1]) || 1
  const n = [-tiro.carryVec[1] / d, tiro.carryVec[0] / d] // perpendicular a la línea del tiro, para la derecha
  const m = (s.m / hoyoActual(r).escala) * s.lado
  return { tipo: s.tipo, lado: s.lado, u: s.u, vec: [n[0] * m, n[1] * m], hecho: false }
}
/** Sortear y armar de una (para probar una sorpresa en particular). */
export function sortearSorpresa(campo, r, tiro, rng, tipo = null) {
  const s = prepararSorpresa(campo, { ...r, sorpresaAnterior: false }, rng, tipo ?? elegir(rng, SORPRESAS))
  return armarSorpresa(r, tiro, s)
}
/** Dónde está la pelota en el vuelo (u de 0 a 1), sin contar las sorpresas: para que la página dibuje dónde aparece el árbol. */
export function posVuelo(tiro, u) {
  if (tiro.ruta) {
    const q = puntoEnRuta(tiro.ruta, u * (tiro.rutaLargo ??= largoRuta(tiro.ruta)))
    return [tiro.desde[0] + q[0] + tiro.deriva[0] * u * u, tiro.desde[1] + q[1] + tiro.deriva[1] * u * u]
  }
  const b1 = 2 * u * (1 - u), b2 = u * u
  return [tiro.desde[0] + tiro.controlVec[0] * b1 + (tiro.carryVec[0] + tiro.deriva[0]) * b2, tiro.desde[1] + tiro.controlVec[1] * b1 + (tiro.carryVec[1] + tiro.deriva[1]) * b2]
}

/** Pegarle: cuenta el golpe y devuelve el tiro para animarlo con `avanzar` (que también mueve los monos). */
export function golpear(campo, r, angulo, potencia, rng, precision = 0, tiempo = 0, ruta = null, soltada = null) {
  const plan = planTiro(campo, r, angulo, potencia, precision, tiempo, ruta)
  // cómo soltó en el latido (`soltadaLatido`; `true` = perfecto): no en el putt, la bomba de Miguelón ni el Dibuje
  const s = soltada === true ? { nivel: 'perfecto', lado: 0 } : soltada
  if (s && !plan.putt && !ruta) { // Miguelón sacado: el aro aparece, pero casi imposible (ver FURIA)
    if (s.nivel === 'perfecto') plan.perfecto = true
    else if (s.nivel === 'bueno') plan.bueno = true
    if (s.lado) plan.lado = s.lado
  }
  r.desde = [...r.pelota]
  r.lieDesde = r.lie
  r.golpes += 1
  r.tirosHoyo = (r.tirosHoyo ?? 0) + 1 // los tiros de verdad en este hoyo (sin las multas): la furia mira el 1.º y el 2.º
  // Miguelón: el tiro sacado ya salió; la barra vuelve a cero
  if (plan.furia) r.furia = { nivel: 0, enojado: false, evento: null }
  if (r.ruleta) r.ruletaToca = true // pegó: el próximo tiro, gira la Ruleta
  calmarMonos(r.monos)
  // Maxi invocó a Deme: este tiro, pegue como pegue, va derecho al hoyo y entra (sin error, sin viento)
  if (r.deme?.listo) { r.deme.listo = false; const t = tiroAlHoyo(campo, r, plan, rng); t.deme = true; return t }
  const hab = habilidadDe(r.jugador)
  // Demetrio: el tiro para par entra siempre, esté donde esté
  if (hab?.id === 'retro' && r.golpes >= hoyoActual(r).par) { const t = tiroAlHoyo(campo, r, plan, rng); t.retro = true; return t }
  const retro = hab?.id === 'retro'
  // el clima: la pelota con barro (día mojado) le agranda el error a este tiro; el palo que resbala (lluvia intensa):
  // la pega finita y sale cortita
  const clima = climaDe(r)
  let barro = false, resbalo = false
  if (r.barro) { r.barro = false; barro = !plan.putt && !retro }
  // el resbalón sale de la semilla del clima, el hoyo y el número de golpe: en un match, a los dos les resbala en el
  // mismo golpe (y no toca el azar del tiro)
  if (clima?.resbalon && !plan.putt && !retro && rngDesde(mezclar(r.clima.semilla, r.idx, r.golpes, 7))() < clima.resbalon) resbalo = true
  if (barro && plan.disp) plan.disp = { ...plan.disp, ang: plan.disp.ang * CLIMA_EFECTO.barroError, carry: plan.disp.carry * CLIMA_EFECTO.barroError }
  if (resbalo) plan.carry *= CLIMA_EFECTO.resbalonCarry
  const tiro = lanzar(campo, { pelota: r.pelota, angulo, potencia, viento: retro ? { ang: 0, kmh: 0 } : r.viento, putt: plan.putt, lie: r.lie, rng, plan })
  if (r.clima) { tiro.clima = { c: clima, charcos: r.clima.charcos }; tiro.climaIdx = r.idx }
  if (barro) { tiro.barro = true; tiro.eventos.push({ tipo: 'barro' }) }
  if (resbalo) { tiro.resbalo = true; tiro.eventos.push({ tipo: 'resbalon' }) }
  tiro.monos = r.monos
  tiro.furia = !!plan.furia
  // Tito: el viento lo maneja en vivo (arranca con el que hay); la deriva se va sumando en el vuelo
  if (hab?.id === 'viento' && !plan.putt && tiro.modo === 'full') {
    tiro.vivo = { wx: Math.cos(r.viento.ang) * r.viento.kmh, wy: Math.sin(r.viento.ang) * r.viento.kmh, k: FISICA.vientoYd * TITO.fuerza * (tiro.carry / FISICA.carryMax) }
    tiro.deriva = [0, 0]
    tiro.T *= TITO.tiempo
  }
  // Juanpa: lo que se anunció al apuntar (si no se sorteó, ahora); después de una sorpresa, el próximo sale limpio
  if (hab?.id === 'caos' && !plan.putt) {
    const sp = r.proxSorpresa !== undefined ? r.proxSorpresa : prepararSorpresa(campo, r, rng)
    if (sp) tiro.sorpresa = armarSorpresa(r, tiro, sp)
    r.sorpresaAnterior = !!sp
    r.proxSorpresa = undefined
  }
  if (hab?.id === 'caos' && rng() < MAPACHE.chance) {
    const [a, b] = MAPACHE.dada
    tiro.mapache = { m: (a + rng() * (b - a)) / hoyoActual(r).escala, de: [...r.desde], hecho: false } // de: de dónde salió (los putts no traen `desde`)
  }
  tiro.exacto = retro // Demetrio: queda exactamente donde apuntó (ver avanzar)
  // el tiro perfecto vuelve si cae en el green (backspin), menos el drive del 15 y el 16. El azar sale del tiro (no gasta)
  const hb = hoyoActual(r)
  if (tiro.modo === 'full' && tiro.perfecto && !retro && !(tiro.salida && hb.par !== 3)) {
    const x = Math.sin(suerteDe(tiro) * 7919.3 + 1.7) * 43758.5453, u = x - Math.floor(x)
    const y = Math.sin(u * 3571.9 + 0.3) * 43758.5453, w = y - Math.floor(y)
    const [a0, a1] = BACKSPIN.azar
    tiro.backspin = { d: (yardasBackspin(tiro.carry * hb.escala) * (a0 + (a1 - a0) * u)) / hb.escala, desvio: (w - 0.5) * 2 * BACKSPIN.desvio }
  }
  tiro.ajenos = (r.hoyos ?? HOYOS).filter((h) => h.n !== hoyoActual(r).n).map((h) => ({ n: h.n, pin: h.pin }))
  tiro.greenPlano = hab?.id === 'perro' || retro // a Demetrio la caída del green tampoco le hace nada
  tiro.calma = !!r.calma
  r.calma = false
  // la mufa y el ablandado son de un tiro
  tiro.mufa = !!r.mufa
  tiro.blando = !!r.blando
  r.mufa = false
  r.blando = false
  if (r.prestado) tiro.prestado = r.jugador.apodo // la Dickyllamada: este lo pegó el Dicky que atendió
  // Joaco: de 15 metros no la falla. Le pegue como le pegue, la pelota va al hoyo (el imán, metiéndola). La dada de la
  // lechuza es una sola: se gasta acá
  if (plan.noLaFalla) tiro.iman = { meter: true, lechu: true, lechuza: !!plan.lechuza }
  if (plan.lechuza) r.lechuza = false
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
    tiro = lanzar(campo, { pelota: r.pelota, angulo: ang, potencia: 0.2, viento: calma, putt: true, lie: r.lie, rng, plan: { ...plan, recto: true, giro: 0, puttMax: FISICA.distPuttMax } })
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
  // (si LG pegó prestado —atendió la Dickyllamada—, su calma no queda para el que juega; ofendido —la interna—, sin calma)
  if (habilidadDe(r.jugador)?.id === 'calma') r.calma = !r.prestado && !r.ofendido && esMalo(res, tiro)
  r.ultimoMalo = esMalo(res, tiro) // (para LG cuando pega de compañero en la Mejor pelota)
  // Marcos: la racha (lo prestado de la Dickyllamada no la toca: ese tiro no es de él)
  if (habilidadDe(r.jugador)?.id === 'carrito' && !r.prestado) {
    const antes = r.racha ?? 0
    r.racha = esMalo(res, tiro) ? 0 : esBueno(res) ? Math.min(RACHA.max, antes + 1) : antes
    res.racha = { antes, ahora: r.racha, bueno: esBueno(res) && !esMalo(res, tiro) }
  }
  cargarFuria(campo, r, tiro, res)
  devolverDicky(r) // la Dickyllamada: el Dicky que te pegó el tiro te devuelve el palo
  return res
}
/** Miguelón: después del 1.º y el 2.º tiro del hoyo, ¿se calienta? (ver FURIA) */
function cargarFuria(campo, r, tiro, res) {
  if (habilidadDe(r.jugador)?.id !== 'bomba' || res.tipo === 'embocada') return
  const n = r.tirosHoyo ?? 0
  if (n !== 1 && n !== 2) return
  const h = hoyoActual(r)
  const ter = terreno(campo, tiro.pos)
  const multa = ['afuera', 'mono-malo', 'mono-ladron', 'ajena'].includes(res.tipo)
  const enGreen = ter.tipo === 'green' && ter.hoyo === h.n
  const bien = !multa && (enGreen || (n === 1 && ter.tipo === 'fairway'))
  if (!bien) sumarFuria(r, n === 1 ? 'primero' : 'segundo')
}
/** Media barra más de furia. Llena: se enoja (el próximo tiro, sacado). El evento queda para que lo muestre la página. */
export function sumarFuria(r, motivo) {
  r.furia ??= { nivel: 0, enojado: false, evento: null }
  if (r.furia.enojado) return r.furia
  r.furia.nivel = Math.min(FURIA.mitades, r.furia.nivel + 1)
  r.furia.enojado = r.furia.nivel >= FURIA.mitades
  r.furia.evento = { motivo, nivel: r.furia.nivel, estalla: r.furia.enojado }
  return r.furia
}
const esMalo = (res, tiro) => ['afuera', 'mono-malo', 'mono-ladron'].includes(res.tipo) || ['rough', 'bunker'].includes(res.terreno) || tiro.eventos.some((e) => e.tipo === 'palo')
const esBueno = (res) => res.tipo === 'embocada' || ['fairway', 'green'].includes(res.terreno)
// ── 📣 Marcos: la racha (buildup). Cada tiro bueno (a la calle, al green o adentro) lo festeja a los gritos y el
// próximo sale con menos error: −15% por cada uno seguido, hasta 4 (−60%). Uno malo (rough, bunker, afuera, al palo,
// los monos) la corta; los del medio la dejan como está ──
export const RACHA = { paso: 0.15, max: 4 }
export const factorRacha = (r) => 1 - RACHA.paso * Math.min(RACHA.max, r?.racha ?? 0)
// lo que grita (del chat: "Bien papá!!!!", "Que grande!!", "Crack!!", "Que batacazo!!"; y su frase de la carta)
export const GRITOS_MARCOS = ['¡ENTRÁ, BOLIVIANA!!!', '¡BIEN PAPÁ!!!!', '¡QUÉ GRANDE!!', '¡CRACK!!', '¡QUÉ BATACAZO!!', '¡VAMOOOOS!!', '¡NO PODÍA SER OTRO!!', '¡ESAAAA!!!']

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
  r.tirosHoyo = 0
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
  // Miguelón: bogey o peor, media barra de furia
  if (habilidadDe(r.jugador)?.id === 'bomba' && fila.golpes - fila.par >= 1) sumarFuria(r, 'bogey')
  r.tirosHoyo = 0
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
    vientoDelClima(r)
    if (r.panchos || habilidadDe(r.jugador)?.id === 'panchitos') r.panchos = MUGRE.panchos
    // Marcos: el carrito lo espera en el próximo tee (no hace falta manejar de green a tee)
    if (r.carro) r.carro = carroAlLado(r.pelota)
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
 * golpes a más; los que no firmaron ninguna, al final) o 'lp' (el mayor % de LP primero). `de` saca las stats de cada fila.
 */
const ORDEN_STATS = {
  vueltas: (a, b) => b.jugadas - a.jugadas || (a.promGolpes ?? Infinity) - (b.promGolpes ?? Infinity),
  promedio: (a, b) => (a.promGolpes ?? Infinity) - (b.promGolpes ?? Infinity) || b.jugadas - a.jugadas,
  lp: (a, b) => b.pctLP - a.pctLP || b.lps - a.lps || b.jugadas - a.jugadas,
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

/** ¿La vuelta se jugó en MODO PRO? (va marcada en el detalle: compite solo en el ranking PRO) */
export const esMarcaPro = (m) => m?.detalle?.pro === true
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
  dada: ['Esas Joaco no las falla', 'De quince metros, la Lechuza no perdona', 'Adentro, como corresponde al campeón', 'Contando todas las dadas'],
  ninjaReset: ['Acá no pasó nada 🥷', 'Reset ninja: de nuevo en el tee, cero golpes', 'El Ninja borró el hoyo. Nadie vio nada', 'LP ninja: el hoyo empieza de nuevo'],
  perro: ['¡El perro la trajo! Al fairway, sin multa', 'Buen perro. La vida no es mucho más que esto', 'Perrolo fue a buscarla'],
  approach: ['Si no era por el approach ganaba', 'Los wedges ya van a funcionar', 'El approach, otra vez'],
  liberty: ['Drive de Liberty: al medio, como siempre', 'Ese drive no lo pega nadie'],
  calma: ['LG no se enoja: el que se enoja pierde', 'LG respira. Ahora sale derecha', 'Tranquilo LG, el que se enoja pierde'],
  lgSolo: ['LG la pega como LG', 'Con el ESDIGIA esto no pasa', 'LG relata a LG: Tremendo', 'QUE HOMBRE LG'],
  mugre: ['Lurrrrrrpin', 'Lurrrrpin. Hermoso'],
  pancho: ['¡Pancho! Los monos van a comer', 'Pagamos los terceros tiempos', 'Panchito para el mono. Lurrrrpin'],
  // LG relata de hincha del Equipo 5 (del chat del SDGA): a los Dicky les festeja los errores y les cuesta reconocerles
  // los buenos; al Equipo 5, relato de gol
  contraDicky: ['Tenía que ser un Dicky', 'Dicky Toontos', '#BastaDeDickyTontos', 'Mucho Dicky, la verdad', 'Otra pérdida para los Dicky', 'Los Dicky están empezando a desaparecer'],
  dickyBien: ['Bien… para ser Dicky', 'Lástima que es Dicky', 'Hasta un Dicky la pega a veces', 'Ese tiro no parece de un Dicky'],
  e5Bien: ['¡EQUIPO 5 EN LLAMAS!', '#EQUIPO5 🏆', 'QUE HOMBRE. Siempre Equipo 5', 'Así juega el Equipo 5. Tremendo'],
  e5Mal: ['No está muy bien el #Equipo5, pero ya va a mejorar', 'Quieren desestabilizar al #Equipo5', 'Culpa de un Dicky, seguro'],
}
// y el resultado del hoyo, también de hincha (a veces)
export const HINCHA_RESULTADO = {
  dicky: { BIRDIE: ['Birdie… de un Dicky. Que no se acostumbre'], BOGEY: ['Bogey. Tenía que ser un Dicky'], 'DOBLE BOGEY': ['Doble de Dicky. Clásico'], 'TRIPLE BOGEY': ['Triple. Dicky Toontos'] },
  e5: { EAGLE: ['EAGLE. EL EQUIPO 5 EN LLAMAS 🔥'], BIRDIE: ['BIRDIE DEL #EQUIPO5 🏆'], PAR: ['Par del Equipo 5. Como corresponde'], BOGEY: ['Bogey. Ya va a mejorar el #Equipo5'] },
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

/**
 * El palo que tiene el jugador en la mano (solo para el dibujo): el putter en el green; el driver en la salida de los
 * par 4 (15 y 16) y un hierro en la del par 3 (17); de ahí, un hierro, y a `PALOS.wedge` yardas del hoyo o menos, un wedge.
 */
export const PALOS = { wedge: 50 }

/**
 * El LATIDO de la potencia: mientras estirás, alrededor de la pelota un aro se achica a velocidad pareja hacia un aro
 * fijo dorado, lo pasa un poquito y vuelve a empezar. Cuanto más fuerte le vas a pegar, más rápido late (de `lento`
 * segundos por latido con lo más suave a `rapido` a fondo). El aro llega al dorado en `centro` del latido: soltar ahí
 * (± `ventana`, un poco más de margen para el lado de tarde: `tarde`) es el tiro PERFECTO, y cerca (× `bueno`) es
 * BUENO. Cerca del hoyo las ventanas son más anchas (hasta × `cerca` a `junto` yd o menos).
 * - PERFECTO: sale con `error` × su error de siempre (un cuarto; en el juego corto, `errorCorto`: no es cero, y como el error depende del handicap, el
 *   perfecto de un handicap alto se abre más que el de uno bajo). Los tiros sin error (Demetrio, LG sin error, el tiro
 *   de Deme) salen perfectos siempre. Si cae en el green, además, backspin (ver BACKSPIN; menos el drive).
 * - BUENO: sale con `errorBueno` × su error.
 * - Y el lado del error lo decide cuándo soltaste (como en el golf de verdad): temprano, la cara cerrada, se va a la
 *   izquierda (hook); tarde, abierta, a la derecha (slice). El largo, como siempre.
 */
// (2026-10-08, pedido de Rorro: "un poco más difícil los golpes perfectos": la ventana de 0,07 a 0,06, el margen de tarde
// de ×1,25 a ×1,15 y la de cerca del hoyo de ×1,6 a ×1,4; el BUENO queda casi igual de ancho, × 2,6)
export const PERFECTO = { lento: 1.2, rapido: 0.42, centro: 0.85, ventana: 0.06, tarde: 1.15, bueno: 2.6, cerca: 1.4, lejos: 150, junto: 30, error: 0.25, errorCorto: 0.5, errorBueno: 0.6 }
/** Segundos por latido con esta potencia (0 a 1). */
export const periodoLatido = (p) => PERFECTO.lento + (PERFECTO.rapido - PERFECTO.lento) * Math.max(0, Math.min(1, p))
/** La ventana del sweet spot (fracción del latido, para el lado de temprano) según lo lejos del hoyo (yardas reales). */
export const ventanaPerfecto = (yd) => PERFECTO.ventana * (1 + (PERFECTO.cerca - 1) * Math.max(0, Math.min(1, (PERFECTO.lejos - yd) / (PERFECTO.lejos - PERFECTO.junto))))
/**
 * Cómo soltó: `fase` cuenta latidos (en cada uno, el aro llega al dorado en `centro`). Devuelve { nivel: 'perfecto' |
 * 'bueno' | null, lado: -1 (temprano) | 1 (tarde), d } (d: cuánto antes o después, en fracción del latido).
 */
export function soltadaLatido(fase, ventana) {
  const f = ((fase % 1) + 1) % 1
  // < 0: el aro todavía no llegó (temprano); > 0: ya pasó (tarde). Cuando vuelve a empezar (grande), es temprano del
  // próximo: así lo ves
  const d = f - PERFECTO.centro
  const v = d < 0 ? ventana : ventana * PERFECTO.tarde
  const nivel = Math.abs(d) <= v ? 'perfecto' : Math.abs(d) <= v * PERFECTO.bueno ? 'bueno' : null
  return { nivel, lado: d < 0 ? -1 : 1, d }
}
/** ¿Está en el sweet spot? */
export const enSweetSpot = (fase, ventana) => soltadaLatido(fase, ventana).nivel === 'perfecto'
/**
 * El backspin (2026-10-08, rehecho): todo tiro perfecto que cae en el green vuelve, menos el drive (la salida de los par
 * 4: 15 y 16). Cuánto, según el palo: con el wedge (hasta `largo` yd) `base` + `porYarda` × el largo, hasta `tope`; los
 * hierros, cada vez menos (`baja` por yarda, no menos de `minimo`). Con azar (× `azar`) y un poquito torcido (± `desvio`
 * radianes); mientras vuelve, la caída del green la lleva como a cualquier pelota.
 */
export const BACKSPIN = { base: 1.5, porYarda: 0.03, tope: 4.8, largo: 110, baja: 0.02, minimo: 0.6, azar: [0.5, 1.35], desvio: 0.2, en: ['green'] }
/** Las yardas que vuelve un tiro perfecto de `yd` yardas reales (sin el azar). */
export const yardasBackspin = (yd) => yd <= BACKSPIN.largo ? Math.min(BACKSPIN.tope, BACKSPIN.base + BACKSPIN.porYarda * yd) : Math.max(BACKSPIN.minimo, BACKSPIN.tope - BACKSPIN.baja * (yd - BACKSPIN.largo))
export function paloDe(campo, r) {
  if (enModoPutt(campo, r)) return 'putter'
  if (desdeLaSalida(campo, r)) return hoyoActual(r).par === 3 ? 'hierro' : 'driver'
  return aYardas(r, dist(r.pelota, hoyoActual(r).pin)) <= PALOS.wedge ? 'wedge' : 'hierro'
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
export function dickyllamar(r, dicky, atiende = dicky) {
  if (!puedeDickyllamar(r) || !dicky?.dicky || dicky.apodo === r.jugador.apodo) return false
  // `atiende`: el que atiende de verdad (la interna: a veces te atiende el Equipo 5 y pega él)
  r.dickyllamada = { apodo: dicky.apodo, atendio: atiende.apodo, n: hoyoActual(r).n }
  r.prestado = { antes: r.jugador, golpeMago: r.golpeMago }
  r.jugador = atiende
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

// ── 🦉📺 el Equipo 5 (Joaco "Lechu" Castelli y Lucas "LG" Guarino): los rivales de siempre de los Dicky ──
// Los Dicky son amor; el Equipo 5, chicana y competencia. Las frases salen del chat del SDGA (2023–2026).
export const esEquipo5 = (j) => j?.equipo === 5
/** Cómo se llaman en las frases: las cartas son Lechu y LG, pero se dicen Joaco y Lucas. */
export const NOMBRE_E5 = { Lechu: 'Joaco', LG: 'Lucas', 'Fito (5)': 'Fito' }
const nombreDe = (j) => NOMBRE_E5[j?.apodo] ?? String(j?.apodo ?? '').replace(/ \(Đ\)$/, '')
/** Cada cuánto: el Equipo 5 se cuela a chicanear (en vez del Dicky de siempre) y el compañero aparece en el Equipo 5. */
export const E5 = { chicana: 0.28, vestuario: 0.6, vuelve: 0.3 }
/** El compañero del Equipo 5 de `j` (Lechu ↔ LG; Fito de pase → LG, su hermano: `compa`), de la lista `todos`. */
export function compaE5(j, todos) {
  if (!esEquipo5(j)) return null
  if (j.compa) return todos.find((x) => x.apodo === j.compa) ?? null
  return todos.find((x) => esEquipo5(x) && x.apodo !== j.apodo && !x.pase) ?? null
}
// la chicana al Dicky que juega (n = su nombre), según cómo le salió el tiro
export const CHICANA = {
  todos: [
    () => 'Dicky? ¿Qué es eso? ¿Se come? 🤔',
    () => 'Perdón, no les sigo el hilo… ¿qué son los Dicky?',
    () => 'Los veo muy divididos a los Dicky',
    () => 'Siempre peleándose entre ellos los Dicky',
    () => 'Desde ayer hay olor a Dicky en la cancha… ESTÁN DE VUELTA',
    () => '#BastaDeDickyTontos',
    (n) => `Mucho Dicky, ${n}. Lo voy a meditar`,
  ],
  mal: [
    () => 'Tenía que ser un Dicky',
    () => 'Jajaja, tenía que ser un Dicky tonto',
    () => 'LOS ODIO, DICKY TONTOS',
    () => '¿Qué esperabas de un Dicky tonto?',
    (n) => `No esperaba menos de un Dicky cebollita, ${n}`,
    () => 'Eternos cebollitas los Dicky',
    () => 'Los perdedores de los Dicky Toontos, che',
    () => 'Otra pérdida para los Dicky',
  ],
  bien: [
    () => 'Ese no lo pegó un Dicky. Un Dicky no pudo haber sido',
    (n) => `Qué lástima que sos Dicky, ${n}`,
    (n) => `Bien, ${n}… para ser Dicky`,
    (n) => `Ese tiro es muy Equipo 5. Venite, ${n}: te haría muy bien`,
    () => 'Pero tenemos algo que nunca van a tener los Dicky… 🏆🏆🏆',
  ],
}
// las de cada uno, y las que le tiran a un Dicky en especial (Lucas y Fito son hermanos)
export const CHICANA_PROPIA = {
  Lechu: [() => 'El cazador de Dicky. Preguntale al Ninja y a Taiu si me conocen 🦉', () => 'Guarida lejos de los Dicky 🦉', () => 'Droi droi droi 🦉'],
  LG: [() => 'Yo podría ser marker del dúo Dicky. Escucho ofertas por privado 📺', () => 'Hago la pregunta boluda: ¿qué es un Dicky? 📺', () => 'LOS ODIO, DICKY TONTOS 📺'],
}
export const CHICANA_A = {
  'Fito (Đ)': { LG: [() => 'Fito, salimos del mismo vientre… pero sos Dicky 📺', () => 'Mi hermano, el más Dicky de los Dicky 📺'], Lechu: [() => 'Los Dicky se prenden en la lucha: Fito está para el PGA 🦉', () => '¿Cómo sigue el cancherito de Fito? 🦉'] },
  'Mike Queboni (Đ)': { Lechu: [() => '¿El Dicky cobarde de Miguelón juega hoy? 🦉'], LG: [() => 'Más Dicky que Miguelón no hay 📺'] },
  'El Ninja (Đ)': { LG: [() => 'El Ninja es el Dicky menos tonto de todos 📺'], Lechu: [() => 'El Ninja, mi abogado personal. El único Dicky que vale la pena 🦉'] },
  'Taiu (Đ)': { Lechu: [() => 'Taiu pasó a la lista de deudores del #Equipo5 🦉'], LG: [() => '¿Taiu? Lástima que es Dicky 📺'] },
}
// lo que le contesta el Dicky que aparece después (e = Joaco o Lucas): con amor, y su toque
export const DICKY_CONTESTA = [
  (e) => `A vos también te quiero, ${e} 💛`,
  (e) => `Te quiero igual, ${e}. Aunque seas Equipo 5 💚`,
  (e) => `Tanto odio es amor, ${e}. Vení que te abrazo 🤗`,
  (e) => `Algún día vas a ser Dicky, ${e}. Te esperamos 💛`,
  () => 'Lo celosos que están los del Equipo 5… 💚',
  () => 'Equipo 5 tenía que ser. Igual los queremos 💛',
]
export const DICKY_CONTESTA_PROPIA = {
  'Fito (Đ)': { todos: [(e) => `Cheee, qué tontos son los Equipo 5… te quiero igual, ${e} 🦅`], Lucas: [() => 'Te quiero, hermano. Salimos del mismo vientre 💛'] },
  'Mike Queboni (Đ)': { todos: [(e) => `Pero qué bonito que sos cuando te enojás, ${e}, ehh 🍯`], Joaco: [() => 'Que Joaco nos odie me da energía 🍯'] },
  'El Ninja (Đ)': { todos: [() => 'Contra el Equipo 5 no podemos perder 🥷', (e) => `Te cuido desde las sombras… a vos también, ${e} 🥷`] },
  'Taiu (Đ)': { todos: [(e) => `Croac, ${e}. En rana quiere decir te quiero igual 🐸`], Joaco: [() => 'Te voy a meter un drivazo, Joaco 🐸'] },
}
// jugando con uno del Equipo 5, el compañero: aliento de vestuario (no ternura). n = el que juega
export const VESTUARIO = {
  todos: [
    (n) => `Si es con vos le juego a cualquiera, ${n}`,
    () => 'La pareja revelación: 🦉-📺',
    () => 'El #Equipo5 sale a la cancha con 📺 y 🦉',
    () => 'Somos una familia ya. #Equipo5',
    () => '¡Siempre Equipo 5!',
    (n) => `Que lo miren los Dicky por TV, ${n} 📺`,
    () => 'El Equipo 5 está listo para seguir ganando',
  ],
  bien: [
    () => '¡EQUIPO 5 EN LLAMAS! 🔥',
    () => 'El #Equipo5 es el ÚNICO equipo que tiene un título 🏆🏆',
    (n) => `Repite título, ${n}, ¿no? 🏆`,
    () => 'Así juega el Equipo 5. Que aprendan los Dicky',
    () => 'El Equipo 5 cumple sus promesas',
  ],
  mal: [
    () => 'No está muy bien el #Equipo5, pero ya va a mejorar',
    () => 'Quieren desestabilizar al #Equipo5 a toda costa',
    (n) => `Tranqui, ${n}: el #Equipo5 agarra la punta mañana`,
    () => 'Eso fue culpa de un Dicky. Seguro',
    (n) => `El que se enoja pierde, ${n}. Respirá`,
  ],
  // la Mejor pelota: cuando la armás, y después, si quedó la del compañero (el que habla) o la tuya
  arma: [() => 'El #Equipo5 utiliza su excepción: fourball 🦉📺', (n) => `Dale, ${n}: pegamos los dos y elegís la mejor`, () => 'Fourball del Equipo 5. Que miren los Dicky'],
  // cuando le toca pegar al compañero (desde el mismo lugar); después de un mal tiro, Lucas no se enoja (sale sin error)
  segunda: [(n) => `Ahora yo, ${n}. Mirá y aprendé`, () => 'Mi turno. Fourball del #Equipo5', (n) => `Dejame a mí, ${n}. Después elegís`],
  armaCalma: [(n) => `Tranqui, ${n}: el que se enoja pierde. El mío sale derecho 📺`, () => 'Yo no me enojo. Este lo pego derecho 📺', (n) => `Respirá, ${n}. Dejá que LG la pega sin error`],
  // y cuando elegiste: la del compañero (el que habla) o la tuya
  compa: [(n) => `Buena elección, ${n}: la mía. #Equipo5`, () => 'Para eso está el compañero. Fourball del Equipo 5', () => 'Mejor pelota: la mía. De nada 😌'],
  tuya: [(n) => `Quedate con la tuya, ${n}. Así juega el Equipo 5`, () => 'Mejor tarjeta Guarino/Castelli 🏆', (n) => `La tuya era mejor, ${n}. Yo te cuidaba la espalda`],
}
// Lucas con Fito de pase: los hermanos en el mismo equipo
export const VESTUARIO_HERMANOS = [() => 'Fourball Guarino-Guarino 🦅📺', () => 'Salimos del mismo vientre, hermano. Ahora del mismo equipo', () => 'Mamá estaría orgullosa: los dos en el #Equipo5', () => 'Bienvenido al #Equipo5, ex Dicky 🫶']
// los Dicky a Fito de pase: que vuelva (con amor, como siempre). n = Fito
export const VUELVE = [(n) => `Volvé, ${n}. Te extrañamos 💛`, (n) => `Esa remera no te queda, ${n}. Volvé a casa 🤗`, () => 'Los Dicky te esperamos con los brazos abiertos 💚', (n) => `¿Te pidieron el pase, ${n}? Nosotros no te cobramos nada 💛`]
export const VUELVE_PROPIA = {
  'Mike Queboni (Đ)': [() => 'Pero qué bonito eras de Dicky, ehh 🍯'],
  'El Ninja (Đ)': [() => 'Te sigo cuidando desde las sombras… traidor 🥷'],
  'Taiu (Đ)': [() => 'Croac. Hasta la rana te extraña 🐸'],
}
/** Lo que le dice el Dicky `quien` a Fito de pase en el Equipo 5. */
export const fraseVuelve = (rng, quien, j) => deLaLista(rng, VUELVE, VUELVE_PROPIA[quien], 0.4)(nombreDe(j))
// las de cada uno (el que habla): Lucas le habla a Joaco y Joaco a Lucas
export const VESTUARIO_PROPIA = {
  LG: [() => 'GORRA DEL LECHUZA INVITATIONAL, SÍ O SÍ 🦉', () => 'Todo de Joaco, yo no hice nada 📺', () => 'Lo que diga el capitán 🦉'],
  Lechu: [() => '📺📺📺📺📺📺', () => 'Tamo en el driving con 📺📺', () => 'Droi droi droi 🦉'],
}
const deLaLista = (rng, base, propias, p = 0.34) => elegir(rng, propias?.length && rng() < p ? propias : base)
/** Lo que le tira `quien` (Lechu o LG) al Dicky que juega (`para`), según cómo salió el tiro (`momentoDicky`). */
export function fraseChicana(rng, quien, para, momento = 'todos') {
  const propias = [...(CHICANA_PROPIA[quien] ?? []), ...(CHICANA_A[para?.apodo]?.[quien] ?? [])]
  return deLaLista(rng, CHICANA[momento] ?? CHICANA.todos, propias)(nombreDe(para))
}
/** Lo que le contesta el Dicky `quien` a `e5` (Lechu o LG) después de su chicana. */
export function contestaDicky(rng, quien, e5) {
  const e = nombreDe(e5)
  const suyas = DICKY_CONTESTA_PROPIA[quien] ?? {}
  return deLaLista(rng, DICKY_CONTESTA, [...(suyas[e] ?? []), ...(suyas.todos ?? [])], 0.5)(e)
}
/** Lo que le dice `quien` (el compañero del Equipo 5) al que juega (`para`). `momento`: bien / mal / todos, o arma / segunda / armaCalma / compa / tuya (la Mejor pelota). */
export function fraseVestuario(rng, quien, para, momento = 'todos') {
  if (['arma', 'segunda', 'armaCalma', 'compa', 'tuya'].includes(momento)) return elegir(rng, VESTUARIO[momento])(nombreDe(para))
  const propias = para?.pase || quien?.pase ? VESTUARIO_HERMANOS : VESTUARIO_PROPIA[quien]
  return deLaLista(rng, VESTUARIO[momento] ?? VESTUARIO.todos, propias)(nombreDe(para))
}

// ── 🤝 la interna: a veces te atiende el equipo equivocado. En la Dickyllamada atiende Joaco o Lucas ("Equivocado, habla
// el #Equipo5") y te pega él; en la Mejor pelota se cuela un Dicky y tira una tercera pelota "por amor": si te quedás con
// esa, el Equipo 5 se ofende y perdés tu habilidad el resto de la vuelta ──
export const INTERNA = { atiende: 0.2, tercera: 0.2 }
export const INTERNA_DICE = {
  // el del Equipo 5 que atiende la Dickyllamada (n = el Dicky que llamó)
  atiende: [() => 'Equivocado, habla el #Equipo5 🦉', (n) => `¿Dicky? No, ${n}: acá Equipo 5. Igual te la pego 😏`, () => 'Me desviaron la llamada. Dejá, te la pego yo 📺'],
  ayuda: [(n) => `De nada, ${n}. Ahora le debés una al #Equipo5 😏`, () => 'Contale a los Dicky quién te salvó', () => 'Para que veas cómo pega el Equipo 5'],
  // el Dicky que se cuela en la Mejor pelota (n = el que juega) y, si elegiste la suya, lo que dice
  tercera: [(n) => `¿Y si te quedás con la mía, ${n}? Te la tiré con amor 💛`, () => 'Yo también quiero jugar el fourball 🤗', (n) => `${n}, una pelota de regalo. Sin rencor 💚`],
  elegida: [() => '¡Elegiste el amor! 💛', (n) => `Sabía que en el fondo eras Dicky, ${n} 🤗`],
  // el compañero del Equipo 5, ofendido (n = el que juega)
  ofendido: [(n) => `¿La de un Dicky, ${n}? Me ofendiste. Sin habilidad hasta el final 😤`, () => 'Traición al #Equipo5. Arreglátelas solo 😤', (n) => `${n}, eso no se hace. El Equipo 5 no perdona 😤`],
}
/** Lo que dice cada uno en la interna: `que` = atiende / ayuda / tercera / elegida / ofendido; `j` = a quién le habla. */
export const fraseInterna = (rng, que, j) => elegir(rng, INTERNA_DICE[que])(nombreDe(j))

// ── 😈 la mufa y el abrazo: cuando el Equipo 5 chicanea a un Dicky, le mufa el próximo tiro (más error, el latido más
// rápido), salvo que toques ABRAZO a tiempo (`ventana` ms): entra un Dicky y la corta. Al revés, jugando con el Equipo 5 a
// veces se cuela un Dicky a ablandarte con amor: el próximo tiro sale corto, salvo que toques ¡FUERA, DICKY! a tiempo ──
export const MUFA = { ventana: 4000, error: 1.7, latido: 0.75, blando: 0.85, ablandar: 0.22 }
// el Dicky que te abraza a tiempo (e = Joaco o Lucas, el que mufó)
export const ABRAZO = [(e) => `¡Abrazo grupal! La mufa de ${e} no entra acá 💛`, () => 'Vení que te abrazo. Mufa cancelada 🤗', (e) => `${e}, con amor no hay mufa que valga 💚`, () => 'El amor vence a la mufa 💛']
// después de un tiro mufado (no llegaste al abrazo): el Dicky que viene
export const CONSUELO_MUFA = [(e) => `Esa fue la mufa de ${e}, no vos 💛`, () => 'Mufa del Equipo 5. Vos jugás bárbaro igual 💚', (e) => `No le hagas caso a ${e}. Te quiero igual 🤗`]
// el Dicky que se cuela a ablandar al que juega con el Equipo 5 (n = el que juega)
export const ABLANDA = [(n) => `Pegale suavecito, ${n}. Con amor 💛`, () => '¿Para qué tanta fuerza? Abrazame 🤗', () => 'Respirá. No hace falta ganarle a nadie 💚', (n) => `${n}, ¿y si dejamos la rivalidad y nos damos un abrazo? 🤗`]
export const ABLANDA_PROPIA = {
  'Fito (Đ)': { Lucas: [() => 'Hermano, aflojá. Te quiero 💛'] },
  'Taiu (Đ)': { todos: [() => 'Croac… despacito, que el hoyo no se va 🐸'] },
  'El Ninja (Đ)': { todos: [() => 'Shh… suavecito. Nadie te apura 🥷'] },
  'Mike Queboni (Đ)': { todos: [() => 'Tranquilo, bonito. Despacito y con miel 🍯'] },
}
// el compañero, cuando lo espantás a tiempo (n = el que juega) y cuando no llegaste (te ablandaron)
export const ESPANTA = [(n) => `¡No te ablandes, ${n}! #Equipo5`, () => '¡Fuera, Dicky! Guarida lejos de los Dicky 🦉', () => '#BastaDeDickyTontos 🔥', (n) => `Ni un abrazo, ${n}. Somos Equipo 5`]
export const ABLANDADO = [(n) => `Te ablandaron, ${n}. Tenía que ser un Dicky`, (n) => `¿Un abrazo de un Dicky? Así no, ${n}`, () => 'Mucho amor, poca distancia. Dicky tenía que ser']
/** El Dicky `quien` le dice algo a `e5` o al que juega: `que` = 'abrazo' | 'consuelo' (e = el que mufó) o 'ablanda' (al que juega). */
export function fraseDickyE5(rng, quien, que, j) {
  const n = nombreDe(j)
  if (que === 'abrazo') return elegir(rng, ABRAZO)(n)
  if (que === 'consuelo') return elegir(rng, CONSUELO_MUFA)(n)
  const suyas = ABLANDA_PROPIA[quien] ?? {}
  return deLaLista(rng, ABLANDA, [...(suyas[n] ?? []), ...(suyas.todos ?? [])], 0.4)(n)
}
/** El compañero del Equipo 5: 'espanta' (lo espantaste a tiempo) o 'ablandado' (te ablandaron). n = el que juega. */
export const fraseCompaE5 = (rng, que, j) => elegir(rng, que === 'espanta' ? ESPANTA : ABLANDADO)(nombreDe(j))

// ── ⚔️ el Clásico de la semana: los Dicky contra el Equipo 5, entre todos. Cada vuelta firmada con una carta Dicky suma
// para los Dicky y con una del Equipo 5 para el Equipo 5, pero solo si es bajo par (pedido de Rorro: que nadie sume
// firmando tarjetas con LP): un punto por cada golpe bajo par (doble si la firmaste un sábado entre las 9 y las 10: ver
// SABADO); de cada uno, hasta 5 vueltas por día para cada equipo. La
// semana, de lunes a domingo en hora argentina. Las mismas reglas que la base
// (`trampa_clasico_puntos`), que con eso le paga 2 bananas a los que jugaron para el que ganó ──
export const CLASICO = { porDia: 5, premio: 2, tz: -3 } // la hora argentina: UTC−3 (sin horario de verano)
const DIA = 864e5
/** El lunes 00:00 (hora argentina) de la semana de `t` (ms); con `atras`, de tantas semanas antes. En ms. */
export function lunesDe(t, atras = 0) {
  const off = CLASICO.tz * 3600e3
  const local = new Date(t + off) // sus campos UTC son la hora argentina
  const dow = (local.getUTCDay() + 6) % 7 // 0 = lunes
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - dow - 7 * atras) - off
}
/**
 * El marcador de la semana que arranca el lunes `desde` (ms), con las vueltas firmadas `marcas` ({ uid, usuario, apodo,
 * vsPar, fecha }). `equipoDe(apodo)` → 'dicky' | 'e5' | null. Devuelve { desde, hasta, dicky, e5, ganador, aportes:
 * { dicky: [{ quien, nombre, pts }], e5: [...] } } (los aportes, de mayor a menor).
 */
export function clasico(marcas, desde, equipoDe) {
  const hasta = desde + 7 * DIA
  const off = CLASICO.tz * 3600e3
  const grupos = new Map() // quien → equipo → día → [puntos]
  const nombres = new Map()
  for (const m of marcas ?? []) {
    const t = Date.parse(m.fecha)
    if (!(t >= desde && t < hasta) || !(m.vsPar < 0)) continue // solo las bajo par (par, sobre par y LP no suman)
    const eq = equipoDe(m.apodo)
    if (eq !== 'dicky' && eq !== 'e5') continue
    const quien = m.uid ?? `u:${String(m.usuario ?? '').trim().toLowerCase()}`
    if (!nombres.has(quien)) nombres.set(quien, m.usuario)
    const dia = Math.floor((t + off) / DIA)
    const porEq = grupos.get(quien) ?? new Map()
    grupos.set(quien, porEq)
    const porDia = porEq.get(eq) ?? new Map()
    porEq.set(eq, porDia)
    porDia.set(dia, [...(porDia.get(dia) ?? []), -m.vsPar * (esSabado9(t) ? SABADO.clasico : 1)])
  }
  const aportes = { dicky: [], e5: [] }
  for (const [quien, porEq] of grupos) {
    for (const [eq, porDia] of porEq) {
      let pts = 0
      for (const lista of porDia.values()) pts += lista.sort((a, b) => b - a).slice(0, CLASICO.porDia).reduce((a, b) => a + b, 0)
      aportes[eq].push({ quien, nombre: nombres.get(quien), pts })
    }
  }
  for (const eq of ['dicky', 'e5']) aportes[eq].sort((a, b) => b.pts - a.pts)
  const dicky = aportes.dicky.reduce((a, x) => a + x.pts, 0), e5 = aportes.e5.reduce((a, x) => a + x.pts, 0)
  return { desde, hasta, dicky, e5, ganador: dicky > e5 ? 'dicky' : e5 > dicky ? 'e5' : null, aportes }
}
// LG relata el resultado (de hincha del Equipo 5, como siempre)
export const LG_CLASICO = {
  dicky: ['Ganaron los Dicky. Suerte de principiante', 'Tenía que ser… ganaron los Dicky', 'Los Dicky ganaron. Que no se acostumbren'],
  e5: ['¡EQUIPO 5, SEÑORES! #BastaDeDickyTontos', 'El #Equipo5 cumple sus promesas 🏆', 'Ganó el Equipo 5. El único equipo con título 🏆'],
  empate: ['Empate. Nadie cobra: el mono se ríe', 'Empate. Quieren desestabilizar al #Equipo5'],
}

// ── ⛳ Sábado 9 AM (un easter egg): la hora sagrada del SDGA. En el grupo, todas las semanas, "Sabado 9 am" y la lista
// (cada uno la copia y se anota con su número y su emoji); "Sabadiki - 9AM", la de los Dicky. Un sábado entre las 9 y
// las 10 (hora argentina): la vuelta arranca con la lista de los que ya jugaron a esa hora y vos al final; con un Dicky,
// el Sabadiki, con los cuatro en el tee. Las vueltas firmadas a esa hora suman doble en el Clásico (y la base, igual) ──
export const SABADO = { dia: 6, hora: 9, clasico: 2, lista: 9 }
/** ¿`t` (ms) es un sábado entre las 9 y las 10, hora argentina? */
export function esSabado9(t) {
  const local = new Date(t + CLASICO.tz * 3600e3) // sus campos UTC son la hora argentina
  return local.getUTCDay() === SABADO.dia && local.getUTCHours() === SABADO.hora
}
/** El sábado 9 AM de `t` o, si no es sábado 9 AM, el último que hubo: [desde, hasta) en ms. */
export function ventanaSabado(t) {
  const off = CLASICO.tz * 3600e3
  const local = new Date(t + off)
  const atras = (local.getUTCDay() - SABADO.dia + 7) % 7
  let desde = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - atras, SABADO.hora) - off
  if (desde > t) desde -= 7 * DIA
  return [desde, desde + 3600e3]
}
/**
 * La lista del sábado 9 AM de `t`: los que firmaron una vuelta a esa hora, cada uno una vez, en el orden en que se
 * anotaron (la primera vuelta de cada uno). [{ quien, uid, usuario, apodo, emoji, fecha }].
 */
export function listaSabado(marcas, t) {
  const [desde, hasta] = ventanaSabado(t)
  const vistos = new Map()
  for (const m of [...(marcas ?? [])].sort((a, b) => Date.parse(a.fecha) - Date.parse(b.fecha))) {
    const f = Date.parse(m.fecha)
    if (!(f >= desde && f < hasta)) continue
    const quien = duenoDe(m)
    if (!vistos.has(quien)) vistos.set(quien, { quien, uid: m.uid, usuario: m.usuario, apodo: m.apodo, emoji: m.emoji, fecha: m.fecha })
  }
  return [...vistos.values()]
}
export const SABADO_DICE = {
  lista: ['Sabado 9 am', 'SABADO 9:00 am ⛳', 'Sabado 9 am (vuelve la magia)', 'Sabado 9 am en algún lado', 'Sabado 9 am adonde sea'],
  sabadiki: ['Sabadiki - 9AM'],
  // LG, en el relato
  lg: ['Sábado 9 AM. Los de siempre', 'Sábado 9 AM: vuelve la magia', 'Primera salida 9:06', 'Sábado 9 AM. Mañana llevo bochas'],
  // los cuatro Dicky, en el tee
  dicky: ['¡Sabadiki! Los cuatro, como siempre 💛', 'Sabadiki - 9AM. Nos anotamos todos 💛', 'Sábado, 9 AM y los cuatro Dicky. No hay plan mejor 💛'],
}

// ── 🦉 la lechuza escondida (un easter egg; del chat: "¿Temporada de lechuzas?", "cazador de lechuzas", "MINI LECHUZITA
// GOLFISTA"). En algunas vueltas (no en un MATCH ni en MODO PRO), en uno de los primeros tiros, se asoma un búho en un
// árbol, un ratito, y se va volando. Si lo tocás a tiempo, tu próximo putt de 15 metros o menos entra: la dada de Joaco
// (`r.lechuza`, ver planTiro), y Joaco te lo dice ──
export const LECHUZA = { prob: 0.18, tiros: 8, ms: 3200 }
export const LECHUZA_DICE = {
  todos: ['¿Temporada de lechuzas? 🦉 Te dejo una dada', 'Cazador de lechuzas 🦉 La próxima de 15 metros, adentro', 'MINI LECHUZITA GOLFISTA 🦉 Te presto una dada', 'La lechuza te banca: una dada, cortesía del #Equipo5 🦉'],
  dicky: ['¿Un Dicky cazando lechuzas? Por esta vez te dejo una dada 🦉', 'Una dada para un Dicky… que no se haga costumbre 🦉'],
  lechu: ['Una lechuza ayudando a otra 🦉', 'Ya tengo mis dadas… igual me la guardo 🦉'],
}
/** Lo que dice Joaco cuando cazás la lechuza (jugando con `jugador`). */
export function fraseLechuza(rng, jugador) {
  if (jugador?.apodo === 'Lechu') return elegir(rng, LECHUZA_DICE.lechu)
  return elegir(rng, jugador?.dicky ? LECHUZA_DICE.dicky : LECHUZA_DICE.todos)
}

// ── 🦉📺 la Mejor pelota del Equipo 5 (una por vuelta, "fourball: Guarino-Castelli, mejor tarjeta"): pegás vos, después
// el compañero desde el mismo lugar (también lo apuntás vos), cada uno con su handicap y su habilidad, y elegís con cuál
// te quedás. Cuenta un golpe ──
export const puedeMejorPelota = (r) => esEquipo5(r.jugador) && !r.mejorPelota?.usada && !r.prestado && !r.terminada
/** Arma la Mejor pelota con `compa`: el próximo tiro lo pegan los dos. Devuelve false si no se puede. */
export function armarMejorPelota(r, compa) {
  if (!puedeMejorPelota(r) || !esEquipo5(compa) || compa.apodo === r.jugador.apodo) return false
  r.mejorPelota = { compa, armada: true, usada: false }
  return true
}
/** La desarma (antes de pegar no se gasta). */
export function desarmarMejorPelota(r) {
  if (r.mejorPelota && !r.mejorPelota.usada) r.mejorPelota = null
}
export const mejorPelotaArmada = (r) => !!r.mejorPelota?.armada && !r.mejorPelota.usada && puedeMejorPelota(r)
/** ¿El compañero pega sin error? LG, después de un mal tiro (el que se enoja pierde), como cuando juega él. */
export const compaSinError = (r) => habilidadDe(r.mejorPelota?.compa)?.id === 'calma' && !!r.ultimoMalo
/**
 * El tiro del compañero (el segundo): desde donde está la pelota de la ronda (la tuya ya salió, pero `r.pelota` todavía
 * es de donde pegaste), con el golpe que armaste vos (`soltada`: cómo soltaste en el latido). Le pega sobre una copia de
 * la ronda (no cuenta golpe, no toca los monos ni el barro) y su pelota no la roban en el aire. Con su habilidad: las
 * dadas de Joaco y, si el tiro anterior salió mal, LG sin error. Gasta la Mejor pelota.
 */
export function golpeCompa(campo, r, angulo, potencia, rng, precision = 0, tiempo = 0, soltada = null) {
  const t = golpeDe(campo, r, r.mejorPelota.compa, angulo, potencia, rng, precision, tiempo, soltada, compaSinError(r))
  t.compa = t.de
  r.mejorPelota.armada = false
  r.mejorPelota.usada = true
  return t
}
/** Un tiro de `jugador` desde donde está la pelota de la ronda, sobre una copia (no cuenta golpe, no toca los monos). */
export function golpeDe(campo, r, jugador, angulo, potencia, rng, precision = 0, tiempo = 0, soltada = null, calma = false) {
  const copia = { ...r, jugador, monos: [], golpeMago: null, deme: null, furia: null, calma, mufa: false, blando: false, lechuza: false, barro: false, proxSorpresa: undefined, ruleta: null, ruletaToca: false, prestado: null, carro: null }
  const t = golpear(campo, copia, angulo, potencia, rng, precision, tiempo, null, soltada)
  t.monos = null
  t.de = jugador.apodo
  return t
}
/** Cuánto cuesta dónde quedó una pelota (para elegir la mejor): por las yardas al hoyo, peor fuera de la calle; con multa, mucho más. */
export const LIE_MEJOR = { green: 1, fairway: 1.1, tee: 1.1, rough: 1.35, bunker: 1.7 }
export function valorPelota(campo, r, t) {
  if (t.embocada) return -1
  const h = hoyoActual(r)
  const yd = dist(t.pos, h.pin) * (h.escala ?? 1)
  if (t.robada) return 1000 + yd
  const ter = terreno(campo, t.pos)
  if (ter.tipo === 'afuera') return 2000 + yd
  if (ter.tipo === 'bosque') return 600 + yd
  if (t.ajena) return 30 + yd * LIE_MEJOR.rough
  return yd * (LIE_MEJOR[ter.tipo] ?? LIE_MEJOR.rough)
}
/** Dónde quedó una pelota (para elegir): { tipo: adentro / afuera / robada / bosque / ajena / normal, yd reales al hoyo, lie, n, multa }. */
export function dondeQuedo(campo, r, t) {
  const h = hoyoActual(r)
  const yd = dist(t.pos, h.pin) * (h.escala ?? 1)
  if (t.embocada) return { tipo: 'adentro', yd: 0, multa: 0 }
  if (t.robada) return { tipo: 'robada', yd, multa: 1 }
  if (t.ajena) return { tipo: 'ajena', yd, n: t.ajena, multa: 0 }
  const ter = terreno(campo, t.pos)
  if (ter.tipo === 'afuera' || ter.tipo === 'bosque') return { tipo: ter.tipo, yd, multa: 1 }
  return { tipo: 'normal', yd, lie: ter.tipo, multa: 0 }
}
/** De las dos, la mejor (la que se recomienda): la que cuesta menos (si empatan, la tuya). */
export const mejorDeLasDos = (campo, r, mia, delCompa) => (valorPelota(campo, r, delCompa) < valorPelota(campo, r, mia) ? delCompa : mia)

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
  let usada = null // de qué lista salió (las de siempre dejan que LG relate de hincha; las de una habilidad, no)
  const de = (k) => { usada = k; return elegir(rng, RELATO[k]) }
  let lg
  if (res.tipo === 'afuera') lg = de('afuera')
  else if (res.tipo === 'mono-malo') lg = de('monoMalo')
  else if (res.tipo === 'mono-bueno') lg = de('monoBueno')
  else if (res.tipo === 'mono-ladron') lg = de('monoLadron')
  else if (res.tipo === 'perro') lg = de('perro')
  else if (hab?.id === 'calma' && malo) lg = de('calma')
  else if (tiro.approach && ['rough', 'bunker'].includes(res.terreno)) lg = de('approach')
  else if (hab?.id === 'approach' && tiro.liberty && res.terreno === 'fairway') lg = de('liberty')
  else if (hab?.id === 'calma' && ['fairway', 'green'].includes(res.terreno) && rng() < 0.5) lg = de('lgSolo')
  else if (res.tipo === 'embocada') lg = null // lo dice el resultado del hoyo
  else if (palo) lg = de('palo')
  else if (tiro.vuelta) lg = de('corbata')
  else if (tiro.labio) lg = de('labio')
  else if (res.ajeno) lg = de('ajeno').replace('{n}', res.ajeno)
  else if (tiro.modo === 'putt') lg = de('putt')
  else if (tiro.iman?.aplicado) lg = de('iman')
  else if (tiro.perfecta && ['green', 'fairway'].includes(res.terreno)) lg = de('bombaPerfecta')
  else if (tiro.comba && res.terreno === 'fairway') lg = de('combaMago')
  else if (res.terreno === 'bunker') lg = de(hoyo.n === 16 && tiro.pos[1] < 300 ? 'bunkerDicky' : 'bunker')
  else if (res.terreno === 'rough') lg = de('rough')
  else if (res.terreno === 'green') lg = de('green')
  else lg = de(tiro.carry > 200 ? 'bomba' : 'fairway')
  // LG, hincha del Equipo 5: a los Dicky les festeja los errores (y les cuesta reconocer los buenos); al Equipo 5, de gol
  if (lg && RELATO_COMUN.has(usada)) lg = hinchada(rng, jugador, malo, !malo && tiro.modo !== 'putt' && ['fairway', 'green'].includes(res.terreno)) ?? lg
  const verso = res.tipo.startsWith('mono') || res.tipo === 'perro' ? elegir(rng, VERSOS_BOSQUE) : null
  return { lg, excusa, verso }
}

// las listas de siempre (no las de una habilidad ni las de algo raro: el labio, la corbata, el green ajeno)
const RELATO_COMUN = new Set(['afuera', 'monoMalo', 'monoBueno', 'monoLadron', 'palo', 'putt', 'bunker', 'bunkerDicky', 'rough', 'green', 'bomba', 'fairway'])
/** LG de hincha (o null: relata como siempre). */
function hinchada(rng, jugador, malo, bien) {
  if (jugador?.dicky) return malo && rng() < 0.45 ? elegir(rng, RELATO.contraDicky) : bien && rng() < 0.3 ? elegir(rng, RELATO.dickyBien) : null
  if (esEquipo5(jugador)) return malo && rng() < 0.4 ? elegir(rng, RELATO.e5Mal) : bien && rng() < 0.35 ? elegir(rng, RELATO.e5Bien) : null
  return null
}

/** La frase del resultado del hoyo (con Rodal, adulación; con un Dicky o el Equipo 5, a veces de hincha). */
export function fraseResultado(rng, nombre, jugador) {
  const tabla = habilidadDe(jugador)?.adulado ? ADULACION.resultado : POR_RESULTADO
  const hincha = (jugador?.dicky ? HINCHA_RESULTADO.dicky : esEquipo5(jugador) ? HINCHA_RESULTADO.e5 : null)?.[nombre]
  if (hincha && rng() < 0.4) return elegir(rng, hincha)
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
