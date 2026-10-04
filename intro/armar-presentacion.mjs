// node intro/armar-presentacion.mjs — arma intro/compositions/presentacion.html: la presentación oficial de la app
// (16:9, 1920×1080, la canción entera: 128,8 s). Parte de la intro horizontal (index.html) y le suma el juego de
// verdad, grabado cuadro por cuadro (assets/juego/*.mp4, ver rodaje/), con los tiempos de cada toma en
// assets/juego/tomas.json. Todo va a tempo: c(n) = el compás n de la canción (cues.js).
import fs from 'node:fs'

const aqui = (p) => new URL(p, import.meta.url)
let h = fs.readFileSync(aqui('index.html'), 'utf8')
const TOMAS = JSON.parse(fs.readFileSync(aqui('assets/juego/tomas.json'), 'utf8'))

const COMPAS = 1.3285
const C0 = 0.92
const r3 = (x) => Math.round(x * 1000) / 1000
const c = (n) => r3(C0 + COMPAS * n)
const B = COMPAS / 4 // una negra
const FIN = 128.8

/** la marca `nombre` (la k-ésima) de una toma, en segundos del video */
function marca(toma, nombre, k = 0) {
  const t = TOMAS[toma]
  if (!t) throw new Error('falta la toma ' + toma)
  const m = t.marcas.filter((x) => x.nombre === nombre)[k]
  if (!m) throw new Error(`falta la marca ${nombre}[${k}] en ${toma}`)
  return m.t
}

function cambiar(a, b) {
  if (!h.includes(a)) throw new Error('no encontré: ' + a.slice(0, 80))
  h = h.replace(a, b)
}

// ── tiempos de la presentación ──
const P = {
  app: c(25), // del ojo del logo al juego
  estribillo: c(40),
  mapa: { desde: c(52), hasta: c(56) },
  plantel: c(56),
  habilidades: c(64),
  tarjeta: c(80),
  ranking: c(85),
  cierre: c(88),
  FIN,
}
P.ocultas = [[P.mapa.desde, P.mapa.hasta], [c(40), c(42)]]

const secciones = []
const guion = [] // líneas del timeline (JS)
const T = (s) => guion.push(s)

// ── piezas ──
const linea = (t) => `<span class="linea"><span class="pal">${t}</span></span>`
const lineas = (ts) => ts.map(linea).join('')
let nVid = 0
/** un pedazo de una toma: arranca en `inicio` (composición), dura `dur`, desde `desde` segundos del video */
function vid(toma, desde, inicio, dur, clase = '') {
  const t = TOMAS[toma]
  if (!t) throw new Error('falta la toma ' + toma)
  if (desde < 0) throw new Error(`${toma}: desde negativo (${desde})`)
  if (desde + dur > t.dur + 0.05) throw new Error(`${toma}: se pasa del video (${r3(desde + dur)} > ${t.dur})`)
  nVid++
  return `<video id="v${nVid}" class="clip vid ${clase}" src="assets/juego/${t.archivo}" muted playsinline data-start="${r3(inicio)}" data-duration="${r3(dur)}" data-media-start="${r3(desde)}" data-track-index="${20 + (nVid % 6)}"></video>`
}
/**
 * zoom dentro de la pantalla (como un screen recording con zoom): keyframes [{ t, s, p: [x, y] px CSS del celu, d }].
 * El punto p va al centro de la pantalla, sin dejar ver bordes. `ancho` = ancho de la pantalla en la composición.
 */
function zoomVid(idVid, ancho, alto, kfs) {
  const k = ancho / 390
  for (const { t, s, p = [195, 422], d = 0.5, ease = 'power3.inOut' } of kfs) {
    const lim = (v, m) => Math.max(-m, Math.min(m, v))
    const x = lim(-(p[0] * k - ancho / 2) * s, ((s - 1) * ancho) / 2)
    const y = lim(-(p[1] * k - alto / 2) * s, ((s - 1) * alto) / 2)
    T(`tl.to("#${idVid}", { scale: ${r3(s)}, x: ${r3(x)}, y: ${r3(y)}, duration: ${r3(d)}, ease: "${ease}" }, ${r3(t)});`)
  }
}
/** un efecto del juego (sonido.js, sacado a mp3 con rodaje/sfx.cjs) en el segundo t de la composición */
const SFX_DUR = { golpe: 1.2, putt: 0.8, embocada: 1.6, birdie: 2.2, robo: 1.6, vienen: 1.4, monobueno: 1.6, perro: 0.8, pancho: 1.0, firma: 0.8, marshall: 0.9, swipe: 0.5, tap: 0.3, cuenta3: 0.6, cuentaYa: 1.4, palo: 0.6, lamento: 2.0 }
const sonidos = []
function sfx(nombre, t, vol = 0.6) {
  if (t < 0 || t > FIN) return
  sonidos.push(`<audio class="sfx" id="sfx${sonidos.length}" src="assets/juego/sfx/${nombre}.mp3" data-start="${r3(t)}" data-duration="${SFX_DUR[nombre]}" data-volume="${vol}" data-track-index="${12 + (sonidos.length % 4)}"></audio>`)
}
/** un teléfono con su pantalla (los videos van adentro, uno detrás de otro) */
function tel(id, { ancho = 440, x, y, inicio, dur, videos, extra = '' }) {
  const pant = ancho - 26
  const alto = Math.round((pant * 844) / 390) + 26
  ventana(id, inicio, dur)
  return `<div id="${id}" class="capa oculto tel-sec">
        <div class="tel" id="${id}-t" style="left:${x}px;top:${y}px;width:${ancho}px;height:${alto}px"><div class="tel-cuerpo"><div class="tel-pantalla">${videos.join('')}</div><div class="tel-brillo"></div></div></div>${extra}
      </div>`
}
/** un contenedor sin tiempo propio (adentro hay videos con su data-start): se ve solo en [inicio, inicio + dur) */
function ventana(id, inicio, dur) {
  T(`tl.set("#${id}", { visibility: "visible" }, ${r3(inicio)}); tl.set("#${id}", { visibility: "hidden" }, ${r3(inicio + dur)});`)
}
/** geometría de un teléfono: dónde cae en la composición un punto (x, y) de la pantalla del juego (en px CSS del celu) */
function geo({ ancho = 440, x, y }) {
  const k = (ancho - 26) / 390
  const alto = Math.round(((ancho - 26) * 844) / 390) + 26
  return { k, cx: x + ancho / 2, cy: y + alto / 2, punto: (px, py) => [x + 13 + px * k, y + 13 + py * k] }
}
/** para enfocar: escala `s` alrededor del centro del teléfono y el punto (px, py) de la pantalla queda en `destino` */
function enfoque(g, [px, py], s, destino) {
  const [ax, ay] = g.punto(px, py)
  return { scale: s, x: r3(destino[0] - g.cx - (ax - g.cx) * s), y: r3(destino[1] - g.cy - (ay - g.cy) * s) }
}
/** la cabecera de una función: chip, título grande, banda dorada y una línea */
function cab(id, inicio, dur, { kick, n, tit, banda, txt, x = 120, y = null, ancho = 960 }) {
  return `<section id="${id}" class="clip cab-sec" data-start="${r3(inicio)}" data-duration="${r3(dur)}" data-track-index="2">
        <div class="cab" style="left:${x}px;width:${ancho}px;${y == null ? 'top:50%;margin-top:-210px' : `top:${y}px`}">
          <span class="kick">${n ? `<b>${n}</b>` : ''}${kick}</span>
          <div class="tit">${lineas(tit)}</div>
          ${banda ? `<span class="banda"><i></i><span>${banda}</span></span>` : ''}
          ${txt ? `<span class="txt">${txt}</span>` : ''}
        </div>
      </section>`
}
const ojoSvg = (clase = '', id = '') => `<svg class="ojo ${clase}" ${id ? `id="${id}" ` : ''}viewBox="0 0 100 158" aria-hidden="true"><g class="parpado"><ellipse cx="50" cy="79" rx="49" ry="78" fill="#f4eeda" /><g fill="#e7dfc2"><circle cx="22" cy="40" r="6" /><circle cx="48" cy="22" r="6" /><circle cx="76" cy="38" r="6" /><circle cx="16" cy="78" r="6" /><circle cx="84" cy="80" r="6" /><circle cx="24" cy="118" r="6" /><circle cx="50" cy="136" r="6" /><circle cx="77" cy="118" r="6" /></g><g class="pupila"><ellipse cx="50" cy="84" rx="27" ry="31" fill="#e8c34a" /><ellipse cx="50" cy="84" rx="17" ry="21" fill="#0c2b1c" /><circle cx="58" cy="74" r="6" fill="#ffffff" /></g></g></svg>`
const par = (id, x, y, s) => `<div class="par" id="${id}" style="left:${x}px;top:${y}px;font-size:${Math.round(80 * s)}px">${ojoSvg()}${ojoSvg()}</div>`


// ═════════════════ 1 · del logo al juego: el ojo de MONO ═════════════════
// el ojo de la segunda O (medido en la intro en c(24.75): 1350,357 · 127×200) crece hasta que la pupila tapa todo
secciones.push(`<section id="buceo" class="clip" data-start="${c(24.7)}" data-duration="${r3(P.app + 0.5 - c(24.7))}" data-track-index="7">${ojoSvg('', 'ojo-buceo')}</section>`)
T(`tl.fromTo("#ojo-buceo", { opacity: 0 }, { opacity: 1, duration: 0.06, ease: "none" }, ${c(24.75)});`)
T(`tl.fromTo("#ojo-buceo", { scale: 1 }, { scale: 90, duration: ${r3(P.app - c(24.75))}, ease: "expo.in", transformOrigin: "50% 53.2%" }, ${c(24.75)});`)
T(`tl.to("#buceo", { opacity: 0, duration: 0.45, ease: "power2.out" }, ${r3(P.app + 0.05)});`)

// ═════════════════ 2 · cómo se juega (verso 1) ═════════════════
// un teléfono a la derecha con la vuelta de El Sueco (una sola toma: portada, mazo, cuenta, drive) y la letra a la izquierda
const TV = { ancho: 440, x: 1210, y: 79 }
const gv = geo(TV)
const V = 'vuelta'
const ya = marca(V, 'cuenta') + 3 // el ¡YA! (la cuenta es de a un segundo)
const drive = marca(V, 'golpe', 0)
const tVuelta = []
// V1: portada, el nombre y JUGAR (c25–c27) y el mazo (c27–c30), sin cortes
const v1 = marca(V, 'nombre') - 0.75
tVuelta.push(vid(V, v1, P.app, c(30) - P.app))
// V3: HOYO 15 y la cuenta regresiva, cortada a tempo: banda (2 negras), 3, 2, 1 (una negra cada uno), ¡YA! (3 negras)
const v3 = [
  [marca(V, 'banda') + 0.35, 2],
  [marca(V, 'cuenta') + 0.05, 1],
  [marca(V, 'cuenta') + 1.05, 1],
  [marca(V, 'cuenta') + 2.05, 1],
  [ya + 0.02, 3],
]
let tc = c(30)
for (const [desde, negras] of v3) {
  tVuelta.push(vid(V, desde, tc, negras * B))
  tc = r3(tc + negras * B)
}
// V4: el drive, soltado justo en c(34) ("la pelota vuela…"), hasta c(36)
tVuelta.push(vid(V, drive - (c(34) - c(32)), c(32), c(36) - c(32)))
// V5 / V6: los monos (otras tomas)
const robo = marca('robo', 'golpe')
const roboPant = TOMAS.robo.pant // dónde le pega al mono (px CSS del celu)
const roboDesde = TOMAS.robo.desde
tVuelta.push(vid('robo', roboDesde, c(36), c(38) - c(36)))
zoomVid('v' + nVid, 414, 896, [{ t: c(36), s: 1.6, p: roboPant, d: 0.01 }, { t: c(36) + 0.25, s: 3.2, p: roboPant, d: 1.0 }])
const llegan = marca('ladron', 'llegan')
tVuelta.push(vid('ladron', llegan - (c(40) - c(38)), c(38), c(40) - c(38)))
secciones.push(tel('tel-v', { ...TV, inicio: P.app, dur: P.estribillo - P.app + 0.02, videos: tVuelta }))

// las cabeceras de cada función
const CABS = [
  ['f-entra', c(25), c(27), { n: '01', kick: 'LA APP', tit: ['PONÉ TU NOMBRE', 'Y A LA CANCHA'], banda: 'SDGA TOUR · HOYOS 15 · 16 · 17', txt: 'Los tres hoyos que más tarjetas rompieron en San Diego, en el celu.' }],
  ['f-plantel', c(27), c(30), { n: '02', kick: 'EL PLANTEL', tit: ['ELEGÍ', 'TU PLAYER'], banda: '10 PLAYERS DEL SDGA', txt: 'Del más fácil al más difícil: los medimos jugando 60 vueltas con cada uno.' }],
  ['f-cuenta', c(30), c(32), { n: '03', kick: 'CONTRA RELOJ', tit: ['3, 2, 1…', '¡YA!'], banda: 'AL MILISEGUNDO', txt: 'El reloj corre hasta que cae el último putt del 17.' }],
  ['f-tiro', c(32), c(36), { n: '04', kick: 'EL TIRO', tit: ['TIRÁ PARA ATRÁS', 'Y SOLTÁ'], banda: 'COMO UNA GOMERA', txt: 'El óvalo es donde puede caer. Con viento, rough al 70% y bunker al 50%.' }],
  ['f-robo', c(36), c(38), { n: '05', kick: 'LOS MONOS', tit: ['SE LA LLEVAN', 'AL VUELO'], banda: '+1 Y A DROPEAR', txt: 'Cruzan de pinos a pinos: si la pelota les pega, chau.' }],
  ['f-vienen', c(38), c(40), { n: '06', kick: '¡VIENEN LOS MONOS!', tit: ['PEGALE ANTES', 'QUE LLEGUEN'], banda: 'O AL TEE CON +1', txt: 'Si la pelota queda cerca de los pinos, salen a buscarla.' }],
]
for (const [id, a, b, d] of CABS) secciones.push(cab(id, a, b - a, d))

// los efectos: la cuenta, el drive, los monos
for (let k = 0; k < 3; k++) sfx('cuenta3', c(30) + (2 + k) * B, 0.55)
sfx('cuentaYa', c(30) + 5 * B, 0.6)
sfx('golpe', c(34), 0.75)
sfx('robo', c(40), 0.7)

// coreografía del teléfono del verso
T(`tl.fromTo("#p-velo", { opacity: 0 }, { opacity: 1, duration: 0.5, ease: "power2.out" }, ${P.app});`)
T(`tl.fromTo("#tel-v-t", { y: 760, rotationY: -38, rotationX: 10, scale: 0.8, transformPerspective: 2400 }, { y: 0, rotationY: -14, rotationX: 3, scale: 1, duration: 0.9, ease: "back.out(1.3)" }, ${r3(P.app + 0.05)});`)
// el mazo: un poquito más cerca y de frente
T(`tl.to("#tel-v-t", { rotationY: -6, rotationX: 0, scale: 1.06, x: -40, duration: 0.6, ease: "power3.inOut" }, ${c(27)});`)
// la cuenta: el teléfono de frente, golpes a tempo
T(`tl.to("#tel-v-t", { rotationY: 0, scale: 1, x: 0, duration: 0.4, ease: "power3.out" }, ${c(30)});`)
for (let k = 2; k < 6; k++) T(`tl.fromTo("#tel-v-t", { scale: 1.035 }, { scale: 1, duration: ${r3(B * 0.9)}, ease: "power2.out" }, ${r3(c(30) + k * B)});`)
// el drive: el dedo apoya en la pelota → zoom a la pelota y el óvalo; suelta en c(34) → se abre de golpe
const tDedo = c(34) - 1.37 // apoya el dedo (ver jugadas.cjs: 0,12 + 0,6 + 0,3 + 0,35 antes de soltar)
const pelotaV = TOMAS[V].pelota // dónde está la pelota en la pantalla al apuntar (px CSS del celu)
const zoomTiro = enfoque(gv, [pelotaV[0], pelotaV[1] - 120], 1.3, [1380, 520])
T(`tl.to("#tel-v-t", ${JSON.stringify({ ...zoomTiro, duration: 0.55, ease: 'power3.inOut' })}, ${r3(tDedo - 0.15)});`)
T(`tl.to("#tel-v-t", { scale: 1, x: 0, y: 0, duration: 0.5, ease: "back.out(1.4)" }, ${r3(c(34) + 0.04)});`)
T(`tl.fromTo("#estela", { opacity: 0.9, scaleX: 0 }, { opacity: 0, scaleX: 1, duration: 0.5, ease: "power2.out", transformOrigin: "100% 50%" }, ${c(34)});`)
// los monos: el teléfono se inclina para el otro lado
T(`tl.to("#tel-v-t", { rotationY: -10, rotationX: 2, duration: 0.5, ease: "power2.inOut" }, ${c(36)});`)
// en c(40) el teléfono se viene encima: la pantalla llena el cuadro (sigue la misma toma, ahora entera)
T(`tl.to("#tel-v-t", { rotationY: 0, rotationX: 0, duration: 0.4, ease: "power2.inOut" }, ${r3(c(39.5) - 0.4)});`)
const pelotaL = TOMAS.ladron.pelota
// la pantalla completa del estribillo: el video a lo ancho (×4,92) con la pelota a 600 px de alto (sin dejar ver bordes)
const SF = 1920 / 390
const topFull = r3(Math.min(0, Math.max(1080 - 844 * SF, 600 - pelotaL[1] * SF)))
// el teléfono se agranda hasta coincidir con esa pantalla completa (mismo punto, misma escala)
const metida = enfoque(gv, pelotaL, SF / gv.k, [960 + (pelotaL[0] - 195) * SF, topFull + pelotaL[1] * SF])
T(`tl.to("#tel-v-t", ${JSON.stringify({ ...metida, duration: r3(c(40) - c(39.5)), ease: 'expo.in' })}, ${c(39.5)});`)

// notas sobre la pantalla (de frente, sin zoom)
const notas = [
  ['n-reloj', 'EL RELOJ', TOMAS[V].hud.reloj, 'arriba', c(35) + 0.1, c(36) - 0.1],
  ['n-viento', 'EL VIENTO', TOMAS[V].hud.viento, 'abajo', c(35) + 0.35, c(36) - 0.1],
]
for (const [id, txt, pt, lado, a, b] of notas) {
  const [x, y] = gv.punto(pt[0], pt[1])
  secciones.push(`<section id="${id}" class="clip nota-sec" data-start="${r3(a)}" data-duration="${r3(b - a)}" data-track-index="8"><div class="nota ${lado}" style="left:${r3(x)}px;top:${r3(y)}px"><i></i><b></b><span>${txt}</span></div></section>`)
  T(`tl.fromTo("#${id} .nota", { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.25, ease: "power3.out" }, ${r3(a)});`)
}
// la estela del drive (un trazo crema que cruza)
secciones.push(`<section id="estela-sec" class="clip" data-start="${c(34)}" data-duration="0.6" data-track-index="8"><div id="estela"></div></section>`)

// ═════════════════ 3 · estribillo ═════════════════
// C1a (c40–c42): la toma de los monos a pantalla completa; C1b (c42–c44): la escena 3D, de noche, cruzan los monos
const full = (id, toma, desde, inicio, dur, centro) => {
  // el video del juego (390×844) estirado a lo ancho: 1920 px → la pantalla se ve 4,92 veces más grande
  const top = r3(Math.min(0, Math.max(1080 - 844 * SF, 600 - centro[1] * SF)))
  ventana(id, inicio, dur)
  return `<div id="${id}" class="capa oculto full"><div class="full-in" style="top:${top}px">${vid(toma, desde, inicio, dur)}</div></div>`
}
secciones.push(full('full-ladron', 'ladron', llegan, c(40), c(42) - c(40), pelotaL))
T(`tl.fromTo("#full-ladron .full-in", { scale: 1.06 }, { scale: 1, duration: ${r3(c(42) - c(40))}, ease: "power1.out", transformOrigin: "50% 40%" }, ${c(40)});`)
const CORO = [
  ['coro1', c(40), c(44), ['¡ES LA TRAMPA', 'DEL MONO!'], 'DONDE TODO SE VA'],
  ['coro2', c(44), c(48), ['ENTRE ÁRBOLES Y SOMBRAS'], 'TU SUERTE CAERÁ'],
  ['coro3', c(48), c(52), ['HACERLE POCO', 'ES CASI UN MILAGRO'], null],
  ['coro4', c(52), c(56), ['EN SAN DIEGO', 'TE ESPERA'], 'CON SU ABRAZO MACABRO'],
]
for (const [id, a, b, tit, banda] of CORO) {
  secciones.push(`<section id="${id}" class="clip coro" data-start="${r3(a)}" data-duration="${r3(b - a)}" data-track-index="3">
        <div class="coro-tit">${lineas(tit)}</div>${banda ? `<span class="banda grande"><i></i><span>${banda}</span></span>` : ''}
      </section>`)
}
T(`tl.fromTo("#flash", { opacity: 0 }, { opacity: 0.9, duration: 0.03, ease: "none" }, ${r3(P.estribillo - 0.02)});`)
T(`tl.to("#flash", { opacity: 0, duration: 0.35, ease: "power2.out" }, ${r3(P.estribillo + 0.03)});`)
T(`tl.set("#p-velo", { opacity: 0 }, ${P.estribillo});`)
T(`tl.set("#p-velo", { opacity: 1 }, ${c(44)});`)
// la letra del estribillo: palabra por palabra, a tempo (una línea cada dos negras)
for (const [id, a, , , banda] of CORO) {
  T(`gsap.utils.toArray("#${id} .pal").forEach(function (el, i) { tl.fromTo(el, { yPercent: 110, scale: 1.25, opacity: 0 }, { yPercent: 0, scale: 1, opacity: 1, duration: 0.26, ease: "expo.out", transformOrigin: "0% 80%" }, ${r3(a)} + i * ${r3(2 * B)}); });`)
  if (banda) T(`banda("#${id} .banda", ${r3(a + 6 * B)});`)
}
// la +1 del ladrón
secciones.push(`<section id="mas1" class="clip" data-start="${r3(c(40) + 0.5)}" data-duration="${r3(c(42) - c(40) - 0.5)}" data-track-index="9"><span class="sello">+1</span></section>`)
T(`tl.fromTo("#mas1 .sello", { scale: 3, rotation: -18, opacity: 0 }, { scale: 1, rotation: -8, opacity: 1, duration: 0.3, ease: "back.out(2.5)" }, ${r3(c(40) + 0.5)});`)

// C2 (c44–c48): tres pantallas que entran a tempo: el Mono malo, el Mono bueno, el Perro
const TRI = TOMAS.triptico // [{ toma, desde, tit, sub }]
TRI.forEach(({ toma, desde, tit, sub }, i) => {
  const a = r3(c(44) + i * 2 * B)
  ventana(`tri${i}`, a, c(48) - a)
  secciones.push(`<div id="tri${i}" class="oculto tri" style="left:${90 + i * 600}px">
        <div class="tri-pant">${vid(toma, desde, a, c(48) - a)}</div><div class="tri-pie"><b>${tit}</b><span>${sub}</span></div>
      </div>`)
  if (TRI[i].zoom) zoomVid('v' + nVid, 560, 1212, TRI[i].zoom.map((z) => ({ ...z, t: a + (z.t - desde) })))
  T(`tl.fromTo("#tri${i}", { yPercent: 105, rotation: ${(i - 1) * 4} }, { yPercent: 0, rotation: ${(i - 1) * 1.2}, duration: 0.45, ease: "back.out(1.4)" }, ${a});`)
})
T(`tl.to(".tri", { yPercent: -110, duration: 0.35, ease: "power3.in", stagger: 0.05 }, ${r3(c(48) - 0.42)});`)

// C3 (c48–c52): el birdie. Approach al green y el putt que da la vuelta al hoyo y entra justo en c(51)
const TB = { ancho: 470, x: 1300, y: 25 }
const approach = marca(V, 'golpe', 1)
const adentro = TOMAS[V].adentro // cuando cae la pelota
const birdie = []
birdie.push(vid(V, approach - 0.9, c(48), c(50) - c(48)))
birdie.push(vid(V, adentro - (c(51) - c(50)), c(50), c(52) - c(50)))
secciones.push(tel('tel-b', { ...TB, inicio: c(48), dur: c(52) - c(48), videos: birdie }))
T(`tl.fromTo("#tel-b-t", { x: 700, rotationY: -40, transformPerspective: 2400 }, { x: 0, rotationY: -8, duration: 0.6, ease: "back.out(1.2)" }, ${c(48)});`)
T(`tl.to("#tel-b-t", { rotationY: 0, scale: 1.04, duration: 0.5, ease: "power2.inOut" }, ${c(50)});`)
T(`tl.fromTo("#tel-b-t", { scale: 1.12 }, { scale: 1.04, duration: 0.5, ease: "back.out(2)" }, ${c(51)});`)
T(`tl.to("#tel-b-t", { x: -1400, rotationY: 30, duration: 0.4, ease: "power3.in" }, ${r3(c(52) - 0.4)});`)
sfx('embocada', c(51) - 0.05, 0.8)
sfx('birdie', c(51) + 0.15, 0.55)
secciones.push(`<section id="milagro" class="clip" data-start="${c(51)}" data-duration="${r3(c(52) - c(51))}" data-track-index="9"><span class="sello dorado">¡BIRDIE!</span></section>`)
T(`tl.fromTo("#milagro .sello", { scale: 2.6, rotation: 10, opacity: 0 }, { scale: 1, rotation: -6, opacity: 1, duration: 0.3, ease: "back.out(2.4)" }, ${c(51)});`)

// C4 (c52–c56): el vuelo sobre el dibujo de la cancha (mapa.js)
secciones.push(`<section id="mapa-sec" class="clip" data-start="${P.mapa.desde}" data-duration="${r3(P.mapa.hasta - P.mapa.desde)}" data-track-index="4">
        <canvas id="mapa" width="1920" height="1080"></canvas>
        ${[15, 16, 17].map((n, i) => `<div class="mapa-cartel" id="mapa-h${n}"><b>HOYO ${n}</b><span>PAR ${[4, 4, 3][i]} · ${[392, 415, 208][i]} YD</span></div>`).join('')}
        <div id="mapa-vineta"></div>
      </section>`)
T(`tl.fromTo("#mapa-sec", { opacity: 0 }, { opacity: 1, duration: 0.25, ease: "power2.out" }, ${P.mapa.desde});`)

// ═════════════════ 4 · el plantel (el corte: la canción baja) ═════════════════
const CARTAS = TOMAS.cartas // [archivo, apodo]
const NC = CARTAS.length
secciones.push(`<section id="plantel" class="clip" data-start="${P.plantel}" data-duration="${r3(P.habilidades - P.plantel)}" data-track-index="3">
        <div id="anillo-caja"><div id="anillo">${CARTAS.map(([f], i) => `<img class="carta" src="assets/juego/cartas/${f}" alt="" style="transform: rotateY(${r3((360 / NC) * i)}deg) translateZ(860px)" />`).join('')}</div></div>
      </section>`)
secciones.push(cab('f-plantel2', r3(P.plantel + 0.2), r3(c(62) - P.plantel - 0.2), { kick: 'EL PLANTEL', tit: ['ELEGÍ CON QUIÉN SUFRIR'], banda: '10 PLAYERS DEL SDGA', x: 110, y: 50, ancho: 1700 }))
T(`tl.fromTo("#anillo", { rotationY: 20 }, { rotationY: -160, duration: ${r3(c(62) - P.plantel)}, ease: "none" }, ${P.plantel});`)
T(`tl.to("#anillo", { rotationY: -520, duration: ${r3(c(64) - c(62))}, ease: "power3.in" }, ${c(62)});`)
T(`tl.to("#anillo-caja", { opacity: 0.3, duration: 0.3, ease: "power2.out" }, ${c(62)});`)
T(`tl.to("#anillo-caja", { scale: 0.2, opacity: 0, duration: 0.45, ease: "power3.in" }, ${r3(c(64) - 0.45)});`)
T(`tl.fromTo("#plantel", { opacity: 0 }, { opacity: 1, duration: 0.6, ease: "power2.out" }, ${P.plantel});`)
secciones.push(`<section id="cada-uno" class="clip" data-start="${c(62)}" data-duration="${r3(c(64) - c(62))}" data-track-index="9">
        <div class="slam">${lineas(['CADA UNO CON', 'SU HABILIDAD'])}</div><span class="banda grande"><i></i><span>SACADAS DEL CHAT</span></span>
      </section>`)
T(`gsap.utils.toArray("#cada-uno .pal").forEach(function (el, i) { tl.fromTo(el, { scale: 2.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.24, ease: "expo.out" }, ${c(62)} + i * ${r3(2 * B)}); });`)
T(`banda("#cada-uno .banda", ${c(63)});`)

// ═════════════════ 5 · las habilidades, de a dos ═════════════════
const HAB = TOMAS.habilidades // [{ toma, desde, apodo, foto, emoji, nombre, texto }]
const PARES = [[0, 1], [2, 3], [4, 5], [6, 7]]
PARES.forEach(([ia, ib], k) => {
  const a = c(64 + 4 * k)
  const b = c(68 + 4 * k)
  ;[ia, ib].forEach((ih, lado) => {
    const hab = HAB[ih]
    if (!hab) return
    const ent = r3(a + lado * 2 * B)
    const x = lado ? 990 : 530
    const id = `hab${ih}`
    const placa = `<div class="placa ${lado ? 'der' : 'izq'}" id="${id}-p"><img class="foto" src="assets/juego/caras/${hab.foto}" alt="" /><b>${hab.apodo}</b><span class="banda"><i></i><span>${hab.emoji} ${hab.nombre}</span></span><span class="txt">${hab.texto}</span></div>`
    // pedazos de la toma, uno detrás de otro (el último estira hasta el final del lugar); cada uno con su zoom
    const videos = []
    const zooms = []
    let t0 = ent
    hab.segs.forEach((sg, j) => {
      const ultimo = j === hab.segs.length - 1
      const dur = ultimo ? b - t0 : Math.min(sg.hasta - sg.desde, b - t0)
      if (dur <= 0.05) return
      videos.push(vid(hab.toma, sg.desde, t0, dur))
      if (sg.zoom) zooms.push(['v' + nVid, sg.zoom.map((z) => ({ ...z, t: t0 + (z.t - sg.desde) }))])
      for (const [nombre, tm, vol] of sg.sfx || []) sfx(nombre, t0 + (tm - sg.desde), vol)
      t0 = r3(t0 + dur)
    })
    secciones.push(tel(id, { ancho: 400, x, y: 107, inicio: ent, dur: b - ent, videos, extra: placa }))
    for (const [idv, kf] of zooms) zoomVid(idv, 374, (374 * 844) / 390, kf)
    T(`tl.fromTo("#${id}-t", { y: 900, rotationY: ${lado ? 30 : -30}, transformPerspective: 2200 }, { y: 0, rotationY: ${lado ? 8 : -8}, duration: 0.55, ease: "back.out(1.3)" }, ${ent});`)
    T(`tl.fromTo("#${id}-p > *", { opacity: 0, x: ${lado ? 40 : -40} }, { opacity: 1, x: 0, duration: 0.35, ease: "power3.out", stagger: 0.07 }, ${r3(ent + 0.15)});`)
    T(`tl.to("#${id}-t", { y: 1000, rotationY: ${lado ? -20 : 20}, duration: 0.35, ease: "power3.in" }, ${r3(b - 0.36)});`)
    T(`tl.to("#${id}-p", { opacity: 0, duration: 0.25, ease: "power2.in" }, ${r3(b - 0.3)});`)
  })
})

// ═════════════════ 6 · la tarjeta, el Marshall y el ranking ═════════════════
const firma = marca('firma', 'firmo')
const TT = { ancho: 420, x: 860, y: 98 }
const TM = { ancho: 420, x: 1380, y: 98 }
secciones.push(tel('tel-firma', { ...TT, inicio: P.tarjeta, dur: P.ranking - P.tarjeta, videos: [vid('firma', Math.max(0, firma - 2.4), P.tarjeta, P.ranking - P.tarjeta)] }))
zoomVid('v' + nVid, 394, (394 * 844) / 390, [{ t: P.tarjeta, s: 1.22, p: [195, 400], d: 0.01 }])
const marshall = marca('marshall', 'marshall')
const tMar = r3(P.tarjeta + 4 * B)
secciones.push(tel('tel-marshall', { ...TM, inicio: tMar, dur: P.ranking - tMar, videos: [vid('marshall', marshall - 1.8, tMar, P.ranking - tMar)] }))
zoomVid('v' + nVid, 394, (394 * 844) / 390, [{ t: tMar, s: 1.22, p: [195, 400], d: 0.01 }])
secciones.push(cab('f-tarjeta', P.tarjeta, P.ranking - P.tarjeta, { n: '07', kick: 'LA TARJETA', tit: ['FIRMALA EN', '10 SEGUNDOS'], banda: 'O EL MARSHALL TE PONE 110', txt: 'Comunicado oficial del SDGA Intelligence Center. Es inapelable.', x: 110, ancho: 700 }))
T(`tl.fromTo("#tel-firma-t", { y: 900, rotationY: -25, transformPerspective: 2200 }, { y: 0, rotationY: -6, duration: 0.6, ease: "back.out(1.3)" }, ${P.tarjeta});`)
T(`tl.fromTo("#tel-marshall-t", { y: 900, rotationY: 25, transformPerspective: 2200 }, { y: 0, rotationY: 6, duration: 0.6, ease: "back.out(1.3)" }, ${tMar});`)
T(`tl.to(["#tel-firma-t", "#tel-marshall-t"], { y: 1000, duration: 0.35, ease: "power3.in", stagger: 0.06 }, ${r3(P.ranking - 0.42)});`)
// el ranking (en el corte de la canción): el teléfono al medio y la imagen para compartir
const rk = marca('firma', 'ranking')
const TR = { ancho: 440, x: 1060, y: 79 }
secciones.push(tel('tel-rk', { ...TR, inicio: P.ranking, dur: P.cierre - P.ranking, videos: [vid('firma', Math.min(rk - 1.45, TOMAS.firma.dur - (P.cierre - P.ranking) - 0.03), P.ranking, P.cierre - P.ranking)] }))
secciones.push(cab('f-ranking', P.ranking, P.cierre - P.ranking, { n: '08', kick: 'EL RANKING', tit: ['SÉ EL', 'PRIMERO'], banda: 'GOLPES, DESPUÉS TIEMPO', txt: 'Una tabla general y una por jugador. Y compartí tu vuelta en el grupo.', x: 110, ancho: 760 }))
secciones.push(`<section id="resumen-sec" class="clip" data-start="${r3(P.ranking + 3 * B)}" data-duration="${r3(P.cierre - P.ranking - 3 * B)}" data-track-index="9"><img id="resumen-img" src="assets/juego/resumen.png" alt="" /></section>`)
T(`tl.fromTo("#tel-rk-t", { scale: 0.6, opacity: 0, rotationY: -30, transformPerspective: 2200 }, { scale: 1, opacity: 1, rotationY: -10, duration: 0.7, ease: "back.out(1.3)" }, ${P.ranking});`)
T(`tl.fromTo("#resumen-img", { y: 700, rotation: 14 }, { y: 0, rotation: 7, duration: 0.6, ease: "back.out(1.4)" }, ${r3(P.ranking + 3 * B)});`)
T(`tl.to(["#tel-rk-t", "#resumen-img"], { scale: 0.2, opacity: 0, duration: 0.4, ease: "power3.in", stagger: 0.05 }, ${r3(P.cierre - 0.45)});`)
T(`tl.to("#p-velo", { opacity: 0, duration: 0.5, ease: "power2.inOut" }, ${r3(P.cierre - 0.3)});`)

// ═════════════════ 7 · el cierre: la pantalla de inicio ═════════════════
const PARES_CIERRE = [[90, 120, 1.1], [330, 330, 0.8], [140, 560, 0.9], [1660, 110, 1.0], [1520, 350, 0.85], [1710, 580, 1.1], [560, 70, 0.7], [1300, 60, 0.75]]
const lt = (txt) => txt.split('').map((l) => (l === ' ' ? '<span class="esp"></span>' : `<span class="lt" data-layout-allow-overlap>${l}</span>`)).join('')
secciones.push(`<section id="cierre" class="clip" data-start="${P.cierre}" data-duration="${r3(FIN - P.cierre)}" data-track-index="3">
        <div id="cl-pares">${PARES_CIERRE.map(([x, y, s], i) => par('pc' + i, x, y, s)).join('')}</div>
        <div id="cl-caja">
          <div id="cl-l1">${lt('LA TRAMPA')}</div>
          <div id="cl-l2">${lt('DEL M')}${ojoSvg('lt', 'cl-ojo-1')}<span class="lt" data-layout-allow-overlap>N</span>${ojoSvg('lt', 'cl-ojo-2')}</div>
          <span id="cl-banda" class="banda" data-layout-allow-overlap><i></i><span>SAN DIEGO · HOYOS 15 · 16 · 17</span></span>
        </div>
        <div id="cl-boton-caja"><span id="cl-boton">JUGALA YA</span><span id="cl-url">rodrigomateus-debug.github.io/trampa-del-mono</span></div>
        <div id="cl-icono-caja"><img id="cl-icono" src="assets/icono-app.png" alt="" /><span>Agregala a la pantalla<br />de inicio del celu</span></div>
        <div id="cl-qr-caja"><div id="cl-qr"><img src="assets/qr.svg" alt="" /></div><span>Escaneá y jugá</span></div>
      </section>`)
const L2 = P.cierre
T(`tl.set("#flash", { opacity: 1 }, ${r3(L2 - 0.01)});`)
T(`tl.to("#flash", { opacity: 0, duration: 0.45, ease: "power2.out" }, ${r3(L2 + 0.02)});`)
T(`tl.fromTo("#cl-l1 .lt", { yPercent: -130, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.42, ease: "back.out(2.2)", stagger: 0.03 }, ${r3(L2 + 0.02)});`)
T(`tl.fromTo("#cl-l2 .lt", { scale: 1.9, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.34, ease: "power4.out", stagger: 0.045, transformOrigin: "50% 80%" }, ${r3(L2 + 0.16)});`)
T(`banda("#cl-banda", ${r3(L2 + 0.55)});`)
T(`tl.fromTo("#cierre .ojo.lt .pupila", { scale: 0, transformOrigin: "50% 53%" }, { scale: 1, duration: 0.3, ease: "back.out(3)", stagger: 0.06 }, ${c(89)});`)
T(`tl.fromTo("#cl-boton-caja > *", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.45, ease: "back.out(2)", stagger: 0.12 }, ${c(89)});`)
T(`tl.fromTo("#cl-icono-caja > *", { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.45, ease: "back.out(2)", stagger: 0.1 }, ${c(89.5)});`)
T(`tl.fromTo("#cl-qr-caja > *", { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.45, ease: "back.out(2)", stagger: 0.1 }, ${c(90)});`)
// JUGALA YA late con la negra
T(`for (var k = 0; ${c(90)} + k * ${r3(B)} < ${c(93)}; k++) tl.fromTo("#cl-boton", { scale: 1.07 }, { scale: 1, duration: ${r3(B * 0.9)}, ease: "power2.out" }, ${c(90)} + k * ${r3(B)});`)
// los ojos del logo miran para los costados
T(`tl.to("#cierre .ojo.lt .pupila", { x: -15, y: 2, duration: 0.22, ease: "power3.out" }, ${c(91)});`)
T(`tl.to("#cierre .ojo.lt .pupila", { x: 15, y: 2, duration: 0.22, ease: "power3.out" }, ${c(92)});`)
// pares de ojos en los huecos: se abren de a uno, miran al jugador y parpadean
T(`${JSON.stringify(PARES_CIERRE)}.forEach(function (p, i) {
          var el = "#pc" + i;
          var dx = 960 - p[0], dy = 600 - p[1], n = Math.sqrt(dx * dx + dy * dy) || 1;
          var mx = (dx / n) * 15, my = (dy / n) * 12;
          tl.set(el, { scaleY: 0.04, opacity: 0 }, ${L2});
          var t = ${c(89)} + ((i * 3) % 8) * ${r3(B)};
          tl.set(el, { opacity: 1 }, t);
          tl.fromTo(el, { scaleY: 0.04 }, { scaleY: 1, duration: 0.18, ease: "back.out(3)" }, t);
          tl.fromTo(el + " .pupila", { x: 0, y: 0 }, { x: mx, y: my, duration: 0.2, ease: "power3.out" }, t + 0.2);
          tl.to(el, { scaleY: 0.06, duration: 0.06, ease: "power2.in" }, t + 1.6 + i * 0.13);
          tl.to(el, { scaleY: 1, duration: 0.1, ease: "power2.out" }, t + 1.66 + i * 0.13);
        });`)
// c(93): baja la canción → se cierran todos los ojos; c(94): el último golpe → se abren de una y el logo late
T(`tl.to("#cierre .parpado", { scaleY: 0.06, duration: 0.12, ease: "power2.in", transformOrigin: "50% 50%" }, ${c(93)});`)
T(`tl.to(".par", { scaleY: 0.05, duration: 0.12, ease: "power2.in" }, ${c(93)});`)
T(`tl.to("#cierre .parpado", { scaleY: 1, duration: 0.16, ease: "back.out(3)" }, ${c(94)});`)
T(`tl.to("#cierre .ojo.lt .pupila", { x: 0, y: 0, duration: 0.01 }, ${c(94)});`)
T(`tl.to(".par", { scaleY: 1, duration: 0.16, ease: "back.out(3)" }, ${c(94)});`)
T(`tl.fromTo("#cl-caja", { scale: 1.08 }, { scale: 1, duration: 0.5, ease: "power3.out" }, ${c(94)});`)
T(`tl.fromTo("#flash", { opacity: 0.55 }, { opacity: 0, duration: 0.4, ease: "power2.out" }, ${c(94)});`)
T(`tl.to("#fundido", { opacity: 1, duration: 0.7, ease: "power2.in" }, ${r3(FIN - 0.7)});`)

// ═════════════════ armado del archivo ═════════════════
cambiar('<title>La Trampa del Mono — Intro</title>', '<title>La Trampa del Mono — Presentación oficial</title>')
cambiar(
  `      window.__hf.buildReady["escena-trampa"] = new Promise(function (resolve) {
        window.__resolverEscena = resolve;
      });`,
  `      window.__hf.buildReady["escena-trampa"] = new Promise(function (resolve) {
        window.__resolverEscena = resolve;
      });
      window.__hf.buildReady["mapa-trampa"] = new Promise(function (resolve) {
        window.__resolverMapa = resolve;
      });
      // tiempos de la presentación (en compases de la canción; ver armar-presentacion.mjs)
      window.PRESENTACION = ${JSON.stringify(P)};`,
)
cambiar('<script type="module" src="escena.js"></script>', '<script type="module" src="escena-presentacion.js"></script>\n    <script type="module" src="mapa.js"></script>')
cambiar('data-composition-id="main" data-start="0" data-width="1920" data-height="1080" data-duration="36.8"', `data-composition-id="presentacion" data-start="0" data-width="1920" data-height="1080" data-duration="${FIN}"`)
cambiar('<section id="logo" class="clip" data-start="31.48" data-duration="5.32"', `<section id="logo" class="clip" data-start="31.48" data-duration="${r3(P.app + 0.1 - 31.48)}"`)
cambiar(/data-duration="36\.8"\n(\s*)data-track-index="10"/.exec(h)[0], `data-duration="${FIN}"\n$1data-track-index="10"`)
cambiar(`{"t":36.1,"v":1},{"t":36.8,"v":0}`, `{"t":${r3(FIN - 0.5)},"v":1},{"t":${FIN},"v":0}`)
cambiar('<canvas id="escena" width="1920" height="1080"></canvas>\n', '<canvas id="escena" width="1920" height="1080"></canvas>\n      <div id="p-velo" class="capa"></div>\n')
cambiar('      <div id="flash" class="capa"></div>', `      ${secciones.join('\n      ')}\n      <div id="flash" class="capa"></div>`)
cambiar('      <!-- overlay:hasta -->', `      <!-- overlay:hasta -->\n      ${sonidos.join('\n      ')}`)
cambiar('    </style>', fs.readFileSync(aqui('presentacion.css'), 'utf8') + '    </style>')
cambiar(
  /    <script>\n      window\.__timelines\["main"\] = window\.armarTextos\(\);\n    <\/script>/.exec(h)[0],
  `    <script>
      (function () {
        var tl = window.armarTextos({ sinFundido: true });
        function banda(sel, t) {
          tl.fromTo(sel + " i", { scaleX: 0, transformOrigin: "0% 50%" }, { scaleX: 1, duration: 0.3, ease: "power3.inOut" }, t);
          tl.fromTo(sel + " span", { yPercent: 110 }, { yPercent: 0, duration: 0.26, ease: "power3.out" }, t + 0.16);
        }
        // las cabeceras de las funciones: chip, palabras, banda y línea; se van al final
        gsap.utils.toArray(".cab-sec").forEach(function (sec) {
          var t = parseFloat(sec.getAttribute("data-start"));
          var d = parseFloat(sec.getAttribute("data-duration"));
          var q = function (s) { return sec.querySelectorAll(s); };
          tl.fromTo(q(".kick"), { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.3, ease: "power3.out" }, t);
          gsap.utils.toArray(q(".tit .pal")).forEach(function (el, i) {
            tl.fromTo(el, { yPercent: 108, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.34, ease: "back.out(1.6)" }, t + 0.04 + i * ${r3(B * 0.5)});
          });
          if (q(".banda").length) banda("#" + sec.id + " .banda", t + ${r3(B)});
          tl.fromTo(q(".txt"), { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" }, t + ${r3(B * 1.5)});
          tl.to(q(".cab"), { opacity: 0, x: -30, duration: 0.2, ease: "power2.in" }, t + d - 0.22);
        });
        // el grano sigue corriendo toda la presentación (más suave sobre el juego)
        tl.fromTo("#grano", { backgroundPosition: "0px 0px" }, { backgroundPosition: "9311px 6113px", duration: ${r3(FIN - 36.8)}, ease: "steps(${Math.floor((FIN - 36.8) * 12)})", immediateRender: false }, 36.8);
        tl.to("#grano", { opacity: 0.07, duration: 0.5 }, ${P.app});
        ${guion.join('\n        ')}
        window.__timelines["presentacion"] = tl;
      })();
    </script>`,
)

fs.writeFileSync(aqui('compositions/presentacion.html'), h)
console.log(`intro/compositions/presentacion.html listo (${h.length} bytes, ${nVid} videos)`)
