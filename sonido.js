// El sonido del juego (Web Audio). Mientras jugás, casi nada: acordes muy suaves, alguna nota suelta y pajaritos
// (para concentrarse). La canción de la intro (intro/assets/trampa-del-mono.mp3) suena solo en la tarjeta final.
// Los efectos se sintetizan acá (sin archivos): carga del tiro, golpe, pique según el terreno, embocada,
// monos, viento… Todo pasa por un master con mute (se recuerda en el teléfono).
// Celu en silencio: por defecto el audio web respeta la tecla de silencio, así que el juego no suena. Si el jugador
// toca 🔊 para prenderlo, se fuerza el modo "reproducción" (suena aunque el celu esté en silencio, como un video).
const CANCION = 'intro/assets/trampa-del-mono.mp3'
const COMPAS = 1.3285, C0 = 0.92
const c = (n) => C0 + COMPAS * n
const CLAVE = 'sdga-trampa-sonido'

let ctx = null, master = null, musicaGain = null, sfx = null, ruidoBuf = null
let buffer = null, cargando = null, fuenteMusica = null, modoMusica = null
let vientoNodo = null, vientoGain = null, cargaOsc = null, cargaGain = null
let silencio = null
let activo = (() => { try { return localStorage.getItem(CLAVE) !== '0' } catch { return true } })()
let forzado = false // lo prendió a mano: suena aunque el celu esté en silencio

export const prendido = () => activo

/** Hay que llamarlo desde un toque (JUGAR, etc.): crea el audio y lo despierta (en iPhone, aunque esté en silencio). */
export function despertar() {
  if (!ctx) {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    ctx = new Ctx()
    master = ctx.createGain()
    master.gain.value = activo ? 1 : 0
    master.connect(ctx.destination)
    // un compresor suave para que los efectos no saturen
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.ratio.value = 3
    comp.connect(master)
    sfx = ctx.createGain()
    sfx.gain.value = 0.9
    sfx.connect(comp)
    musicaGain = ctx.createGain()
    musicaGain.gain.value = 0
    musicaGain.connect(master)
    ruidoBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const d = ruidoBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  if (forzado && activo) forzarReproduccion()
  cargarCancion()
}
/** iPhone: que suene como un video aunque esté la tecla de silencio (solo si lo pidió con el botón). */
function forzarReproduccion() {
  try { if (navigator.audioSession) { navigator.audioSession.type = 'playback'; return } } catch {}
  if (!silencio) {
    silencio = document.createElement('audio')
    silencio.src = wavSilencio()
    silencio.loop = true
    silencio.setAttribute('playsinline', '')
    silencio.style.display = 'none'
    document.body.appendChild(silencio)
  }
  silencio.play().catch(() => {})
}

/** El botón 🔊/🔇 (se llama desde el toque). Prenderlo a mano lo hace sonar aunque el celu esté en silencio. */
export function alternar() {
  activo = !activo
  try { localStorage.setItem(CLAVE, activo ? '1' : '0') } catch {}
  despertar()
  if (activo) { forzado = true; forzarReproduccion() }
  else if (silencio) silencio.pause()
  if (master) master.gain.setTargetAtTime(activo ? 1 : 0, ctx.currentTime, 0.05)
  if (activo && modoMusica && !fuenteMusica) musica(modoMusica, true)
  return activo
}

function cargarCancion() {
  if (buffer || cargando || !ctx) return cargando
  cargando = fetch(CANCION).then((r) => r.arrayBuffer()).then((ab) => new Promise((ok, mal) => ctx.decodeAudioData(ab, ok, mal)))
    .then((b) => { buffer = b; if (modoMusica) musica(modoMusica, true) })
    .catch(() => { cargando = null })
  return cargando
}

/**
 * La música: 'juego' (el loop, bajito, para no tapar los efectos), 'final' (la canción desde que vuelve la banda)
 * o null (se apaga).
 */
export function musica(modo, forzar = false) {
  if (!ctx) return
  if (modo === modoMusica && !forzar) return
  modoMusica = modo
  const t = ctx.currentTime
  if (fuenteMusica) {
    const vieja = fuenteMusica
    musicaGain.gain.setTargetAtTime(0, t, 0.25)
    setTimeout(() => { try { vieja.stop() } catch {} }, 900)
    fuenteMusica = null
  }
  ambiente(modo === 'juego')
  if (modo !== 'final' || !buffer) return
  // la canción, solo en la tarjeta final (desde que vuelve la banda)
  const f = ctx.createBufferSource()
  f.buffer = buffer
  f.start(t + 0.05, c(24))
  f.connect(musicaGain)
  fuenteMusica = f
  musicaGain.gain.cancelScheduledValues(t)
  musicaGain.gain.setValueAtTime(0, t)
  musicaGain.gain.linearRampToValueAtTime(0.38, t + 1.2)
}
/** Baja la música un momento (para que se escuche un efecto grande). */
export function agachar(seg = 1.5) {
  if (!ctx) return
  const t = ctx.currentTime
  if (modoMusica === 'final') {
    musicaGain.gain.cancelScheduledValues(t)
    musicaGain.gain.setTargetAtTime(0.38 * 0.3, t, 0.05)
    musicaGain.gain.setTargetAtTime(0.38, t + seg, 0.4)
  }
  if (ambGain) {
    ambGain.gain.cancelScheduledValues(t)
    ambGain.gain.setTargetAtTime(0.0001, t, 0.05)
    ambGain.gain.setTargetAtTime(AMB_VOL, t + seg, 0.6)
  }
}

// ── el fondo mientras jugás: casi nada, para concentrarse ──
// Como los juegos de golf: acordes muy suaves y lentos (un acorde cada ~7 s, con ataque y caída larguísimos),
// alguna nota suelta de vez en cuando y pajaritos de la cancha. Nada de ritmo ni melodía que distraiga.
const AMB_VOL = 0.55
let ambGain = null, ambTimer = 0, ambPaso = 0, pajaroTimer = 0
// Do mayor 7 → La menor 9 → Fa mayor 7 → Sol sus (en registro medio-grave, todo con triángulos filtrados)
const ACORDES = [[130.81, 196, 246.94, 329.63], [110, 164.81, 246.94, 261.63], [87.31, 174.61, 220, 329.63], [98, 146.83, 196, 261.63]]
const NOTAS = [523.25, 587.33, 659.25, 783.99, 880, 1046.5] // pentatónica de Do, para las notas sueltas
function ambiente(prender) {
  clearInterval(ambTimer)
  clearTimeout(pajaroTimer)
  // el fondo que estaba (también al volver a prenderlo: con el 🔊 o cuando termina de cargar la canción) se apaga y se
  // suelta; antes quedaba conectado y su acorde se pisaba con el nuevo
  if (ambGain) { ambGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.8); const g = ambGain; setTimeout(() => g.disconnect(), 4000); ambGain = null }
  if (!prender) return
  ambGain = ctx.createGain()
  ambGain.gain.value = 0.0001
  const fl = ctx.createBiquadFilter()
  fl.type = 'lowpass'; fl.frequency.value = 1400; fl.Q.value = 0.3
  ambGain.connect(fl).connect(musicaGain)
  musicaGain.gain.cancelScheduledValues(ctx.currentTime)
  musicaGain.gain.setTargetAtTime(1, ctx.currentTime, 0.1)
  ambGain.gain.setTargetAtTime(AMB_VOL, ctx.currentTime, 2)
  const destino = ambGain
  const acorde = () => {
    if (!ambGain || ambGain !== destino) return
    const notas = ACORDES[ambPaso++ % ACORDES.length]
    const t = ctx.currentTime
    notas.forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.type = i === 0 ? 'sine' : 'triangle'
      o.frequency.value = f
      o.detune.value = (Math.random() - 0.5) * 8
      g.gain.setValueAtTime(0.0001, t)
      g.gain.linearRampToValueAtTime(i === 0 ? 0.035 : 0.018, t + 2.5) // entra despacito
      g.gain.linearRampToValueAtTime(0.0001, t + 8.5) // y se va solo
      o.connect(g).connect(destino)
      o.start(t); o.stop(t + 8.6)
    })
    // a veces, una nota suelta arriba (como una gota)
    if (Math.random() < 0.55) {
      const f = NOTAS[Math.floor(Math.random() * NOTAS.length)]
      tono(f, 2.2, { vol: 0.02, at: 2 + Math.random() * 3, ataque: 0.01, destino })
    }
  }
  acorde()
  ambTimer = setInterval(acorde, 7000)
  const pajaro = () => {
    if (!ambGain || ambGain !== destino) return
    const t = ctx.currentTime, n = 2 + Math.floor(Math.random() * 3), base = 2600 + Math.random() * 1400
    for (let i = 0; i < n; i++) tono(base, 0.09, { vol: 0.012, f2: base * (1.25 + Math.random() * 0.2), at: i * 0.13, ataque: 0.01, destino: sfx })
    pajaroTimer = setTimeout(pajaro, 4000 + Math.random() * 9000)
  }
  pajaroTimer = setTimeout(pajaro, 3000)
}

// ── piezas ──
function tono(f, dur, { tipo = 'sine', vol = 0.3, at = 0, f2 = null, ataque = 0.005, destino = sfx } = {}) {
  if (!ctx) return
  const t = ctx.currentTime + at
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = tipo
  o.frequency.setValueAtTime(f, t)
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + ataque)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(destino)
  o.start(t)
  o.stop(t + dur + 0.05)
}
function ruido(dur, { filtro = 'bandpass', f = 1000, q = 1, vol = 0.3, at = 0, f2 = null, ataque = 0.004 } = {}) {
  if (!ctx) return
  const t = ctx.currentTime + at
  const s = ctx.createBufferSource()
  s.buffer = ruidoBuf
  const fl = ctx.createBiquadFilter()
  fl.type = filtro
  fl.frequency.setValueAtTime(f, t)
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur)
  fl.Q.value = q
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + ataque)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  s.connect(fl).connect(g).connect(sfx)
  s.start(t, Math.random())
  s.stop(t + dur + 0.05)
}
const campana = (f, at = 0, vol = 0.18) => { tono(f, 0.9, { vol, at, ataque: 0.004 }); tono(f * 2.01, 0.5, { vol: vol * 0.35, at }) }

// ── interfaz ──
export const tap = () => { tono(1100, 0.05, { vol: 0.12, tipo: 'triangle' }); ruido(0.03, { f: 3000, vol: 0.05 }) }
// la Ruleta: el tic de cada cara que pasa y el "¡ese!" cuando cae
export const ruletaTic = () => { tono(1500, 0.03, { vol: 0.09, tipo: 'triangle' }); ruido(0.02, { f: 4200, vol: 0.04 }) }
export function ruletaCae() { tono(392, 0.12, { vol: 0.16, tipo: 'triangle' }); campana(783.99, 0.08, 0.14); campana(1174.66, 0.16, 0.12) }
// la Dickyllamada: suena el teléfono (dos ring) y atiende con un acorde tierno
export function dickyllamada() {
  for (const at of [0, 0.42]) for (let i = 0; i < 6; i++) tono(i % 2 ? 1660 : 1320, 0.05, { vol: 0.07, tipo: 'triangle', at: at + i * 0.05 })
  ;[523.25, 659.25, 783.99].forEach((f, i) => campana(f, 0.9 + i * 0.09, 0.1))
}
export const swipe = () => ruido(0.22, { f: 600, f2: 2400, q: 0.8, vol: 0.12, ataque: 0.06 })
/** Cuenta regresiva: 3, 2, 1 graves y el ¡YA! agudo, con acorde. */
export function cuenta(n) {
  if (n > 0) tono(523.25, 0.18, { vol: 0.25, tipo: 'square', ataque: 0.004 })
  else { tono(1046.5, 0.35, { vol: 0.25, tipo: 'square' }); tono(1318.5, 0.35, { vol: 0.12, tipo: 'triangle' }); tono(1568, 0.35, { vol: 0.1, tipo: 'triangle' }) }
}

// ── el tiro ──
/** Mientras tirás para atrás: un tono que sube con la potencia (y un clic al llegar a fondo). */
export function cargaInicio() {
  if (!ctx || cargaOsc) return
  cargaOsc = ctx.createOscillator()
  cargaOsc.type = 'triangle'
  cargaGain = ctx.createGain()
  cargaGain.gain.value = 0
  const fl = ctx.createBiquadFilter()
  fl.type = 'lowpass'
  fl.frequency.value = 1800
  cargaOsc.connect(fl).connect(cargaGain).connect(sfx)
  cargaOsc.frequency.value = 180
  cargaOsc.start()
  cargaInicio.fondo = false
}
export function carga(p, latido = 0) {
  if (!cargaOsc) return
  const t = ctx.currentTime
  cargaOsc.frequency.setTargetAtTime(180 + p * 520 + latido * 120, t, 0.03)
  cargaGain.gain.setTargetAtTime(0.03 + p * 0.06, t, 0.04)
  if (p >= 0.97 && !cargaInicio.fondo) { cargaInicio.fondo = true; tono(1600, 0.06, { vol: 0.15, tipo: 'square' }) }
  if (p < 0.9) cargaInicio.fondo = false
}
export function cargaFin() {
  if (!cargaOsc) return
  const o = cargaOsc, g = cargaGain
  g.gain.setTargetAtTime(0, ctx.currentTime, 0.02)
  setTimeout(() => { try { o.stop() } catch {} }, 150)
  cargaOsc = null
}
/** El golpe: con el driver, "thwack" (más fuerte con la potencia); con el putter, un "toc". */
export function golpe(p, putt) {
  if (putt) {
    tono(900, 0.07, { vol: 0.08 + p * 0.2, f2: 600, tipo: 'sine', ataque: 0.002 })
    ruido(0.03, { f: 2500, q: 2, vol: 0.06 + p * 0.1, ataque: 0.001 })
    return
  }
  ruido(0.05, { f: 3200, q: 1.2, vol: 0.25 + p * 0.35, ataque: 0.001 })
  tono(140, 0.12, { vol: 0.25 + p * 0.25, f2: 60, ataque: 0.002 })
  // el silbido de la pelota que se va
  ruido(0.5 + p * 0.5, { f: 2800, f2: 700, q: 3, vol: 0.05 + p * 0.07, at: 0.03, ataque: 0.05 })
}
/** La pelota pica: suena distinto según dónde cae. */
export function pique(terreno, fuerza = 1) {
  const v = Math.min(1, 0.4 + fuerza * 0.6)
  if (terreno === 'bunker') ruido(0.35, { filtro: 'highpass', f: 2500, vol: 0.18 * v, ataque: 0.01 })
  else if (terreno === 'green') { tono(700, 0.05, { vol: 0.1 * v }); ruido(0.04, { f: 1500, vol: 0.05 * v }) }
  else if (terreno === 'rough') ruido(0.18, { filtro: 'lowpass', f: 900, vol: 0.22 * v, ataque: 0.004 })
  else if (terreno === 'afuera') tono(220, 0.3, { vol: 0.12, f2: 110, tipo: 'sawtooth' })
  else { ruido(0.08, { filtro: 'lowpass', f: 700, vol: 0.25 * v }); tono(110, 0.08, { vol: 0.15 * v, f2: 70 }) }
}
/** Pegó en un árbol: un golpe de madera y las hojas. */
export function palo() {
  tono(520, 0.08, { vol: 0.25, f2: 380, tipo: 'triangle', ataque: 0.001 })
  tono(880, 0.05, { vol: 0.12, ataque: 0.001 })
  ruido(0.4, { filtro: 'highpass', f: 3500, vol: 0.08, at: 0.03, ataque: 0.05 })
}
export const labio = () => { tono(1900, 0.25, { vol: 0.14, tipo: 'triangle' }); tono(2850, 0.18, { vol: 0.06 }) }
/** La corbata: la pelota raspa el borde mientras da la vuelta, cada vez más lento. */
export function vuelta() {
  let at = 0
  for (let i = 0; i < 9; i++) {
    tono(2100 - i * 90, 0.05, { vol: 0.09 - i * 0.006, tipo: 'triangle', at, ataque: 0.002 })
    at += 0.07 + i * 0.012
  }
}
/** Adentro: el traqueteo de la taza y unas campanas. */
export function embocada() {
  agachar(2)
  for (let i = 0; i < 3; i++) tono(2400 - i * 300, 0.04, { vol: 0.12, tipo: 'triangle', at: i * 0.07, ataque: 0.001 })
  ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => campana(f, 0.25 + i * 0.09))
}
/** El resultado del hoyo: fanfarria para birdie o mejor, dos notas para el par, "wah wah" para el bogey o peor. */
export function resultado(nombre) {
  if (['BIRDIE', 'EAGLE', 'ALBATROS', 'HOYO EN UNO'].includes(nombre)) {
    agachar(3)
    const notas = nombre === 'BIRDIE' ? [523.25, 659.25, 783.99, 1046.5] : [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568]
    notas.forEach((f, i) => { tono(f, 0.28, { vol: 0.14, tipo: 'square', at: 0.5 + i * 0.1 }); tono(f / 2, 0.3, { vol: 0.08, tipo: 'triangle', at: 0.5 + i * 0.1 }) })
  } else if (nombre === 'PAR') { tono(659.25, 0.18, { vol: 0.12, tipo: 'triangle', at: 0.5 }); tono(987.77, 0.3, { vol: 0.12, tipo: 'triangle', at: 0.68 }) }
  else lamento(0.5)
}
/** El trombón triste (bogey, LP). */
export function lamento(at = 0) {
  ;[392, 370, 349.23].forEach((f, i) => tono(f, 0.3, { vol: 0.1, tipo: 'sawtooth', at: at + i * 0.28 }))
  tono(329.63, 0.8, { vol: 0.1, tipo: 'sawtooth', at: at + 0.84, f2: 300 })
}

// ── monos ──
/** "Uh uh ah ah": sílabas con la voz del mono (sierra filtrada que sube y baja). */
function chillido(at = 0, n = 4, agudo = 1) {
  if (!ctx) return
  for (let i = 0; i < n; i++) {
    const t = ctx.currentTime + at + i * 0.13
    const o = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain()
    o.type = 'sawtooth'
    const base = (i < n / 2 ? 380 : 620) * agudo
    o.frequency.setValueAtTime(base, t)
    o.frequency.exponentialRampToValueAtTime(base * 1.5, t + 0.08)
    fl.type = 'bandpass'; fl.frequency.value = i < n / 2 ? 900 : 1600; fl.Q.value = 4
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.015)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11)
    o.connect(fl).connect(g).connect(sfx)
    o.start(t); o.stop(t + 0.14)
  }
}
export const monosVienen = () => chillido(0, 4, 1)
/** Se la robaron: risa del mono (sílabas rápidas que bajan). */
export function robo() { chillido(0, 6, 1.3); tono(600, 0.5, { vol: 0.08, f2: 200, tipo: 'triangle', at: 0.6 }) }
/** El Mono bueno: un glissando mágico para arriba. */
export function monoBueno() { [659.25, 783.99, 987.77, 1318.5, 1567.98].forEach((f, i) => campana(f, i * 0.07, 0.12)) }
/** 🤫 El hoyo equivocado brilla: un acorde misterioso que se abre y un brillo de campanitas. */
export function secreto() {
  agachar(6)
  ;[311.13, 369.99, 466.16, 554.37].forEach((f, i) => tono(f, 1.1, { vol: 0.07, tipo: 'triangle', at: i * 0.12 }))
  ;[1567.98, 1975.53, 2349.32, 2637.02, 3135.96, 2637.02, 2349.32, 3135.96].forEach((f, i) => campana(f, 0.5 + i * 0.09, 0.07))
  ruido(1.6, { f: 4000, f2: 9000, q: 0.6, vol: 0.05, ataque: 0.6, at: 0.3 })
}
/** Tocaste DESBLOQUEAR: un tono que sube (lo que dura el temblor). */
export function cargarSecreto() {
  tono(196, 0.65, { vol: 0.08, tipo: 'sawtooth', f2: 784 })
  tono(294, 0.65, { vol: 0.05, tipo: 'triangle', f2: 1175 })
  ruido(0.65, { f: 800, f2: 7000, q: 0.7, vol: 0.08, ataque: 0.5 })
}
/** ¡Desbloqueado! Platillo, fanfarria de bronces y campanas. */
export function revelar() {
  agachar(5)
  ruido(1.4, { filtro: 'highpass', f: 5000, vol: 0.12, ataque: 0.003 })
  tono(65.41, 0.6, { vol: 0.22, tipo: 'sine', f2: 45 })
  const acordes = [[523.25, 659.25, 783.99], [587.33, 739.99, 880], [659.25, 830.61, 987.77], [783.99, 987.77, 1174.66, 1567.98]]
  acordes.forEach((ac, k) => ac.forEach((f) => { tono(f, k === 3 ? 1.2 : 0.18, { vol: 0.07, tipo: 'square', at: 0.08 + k * 0.16 }); tono(f / 2, k === 3 ? 1.2 : 0.2, { vol: 0.06, tipo: 'sawtooth', at: 0.08 + k * 0.16 }) }))
  ;[1046.5, 1318.5, 1567.98, 2093, 2637.02].forEach((f, i) => campana(f, 0.75 + i * 0.07, 0.1))
}
/** Tensión: un "tic" que se acelera cuanto más cerca está el mono más cercano (lo llama el juego en cada cuadro). */
let proxTic = 0
export function tension(dist, alerta) {
  if (!ctx || dist == null) return
  const ahora = ctx.currentTime
  if (ahora < proxTic) return
  const u = Math.max(0, Math.min(1, dist / alerta))
  proxTic = ahora + 0.18 + u * 0.7
  tono(u < 0.3 ? 1300 : 950, 0.04, { vol: 0.05 + (1 - u) * 0.07, tipo: 'square' })
}
export const perro = () => { [0, 0.22].forEach((at) => { tono(480, 0.09, { vol: 0.2, tipo: 'sawtooth', f2: 320, at }); ruido(0.08, { f: 1200, q: 2, vol: 0.1, at }) }) }
export function pancho() { ruido(0.25, { f: 900, f2: 2600, vol: 0.1, ataque: 0.04 }); [0.4, 0.6].forEach((at) => tono(170, 0.12, { vol: 0.14, f2: 120, at })) }

// ── el viento: un colchón de ruido que sube con los km/h y va en ráfagas ──
export function viento(kmh) {
  if (!ctx) return
  const objetivo = kmh ? 0.012 + (kmh / 30) * 0.05 : 0
  if (!vientoNodo) {
    vientoNodo = ctx.createBufferSource()
    vientoNodo.buffer = ruidoBuf
    vientoNodo.loop = true
    const fl = ctx.createBiquadFilter()
    fl.type = 'bandpass'; fl.frequency.value = 500; fl.Q.value = 0.6
    const lfo = ctx.createOscillator(), lfoG = ctx.createGain()
    lfo.frequency.value = 0.18; lfoG.gain.value = 280
    lfo.connect(lfoG).connect(fl.frequency); lfo.start()
    vientoGain = ctx.createGain(); vientoGain.gain.value = 0
    vientoNodo.connect(fl).connect(vientoGain).connect(sfx)
    vientoNodo.start()
  }
  vientoGain.gain.setTargetAtTime(objetivo, ctx.currentTime, 0.6)
}

// ── el final ──
export const firma = () => { ruido(0.12, { filtro: 'lowpass', f: 500, vol: 0.3 }); tono(90, 0.15, { vol: 0.25, f2: 50 }); ruido(0.3, { f: 4000, q: 0.7, vol: 0.05, at: 0.1 }) }
export const marshall = () => { tono(180, 0.5, { vol: 0.16, tipo: 'square' }); tono(185, 0.5, { vol: 0.12, tipo: 'sawtooth' }) }

// un WAV de silencio para el truco del iPhone
function wavSilencio() {
  const n = 800, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf)
  const s = (o, t) => [...t].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)))
  s(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); s(8, 'WAVE'); s(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true)
  v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); s(36, 'data'); v.setUint32(40, n * 2, true)
  let b = ''
  new Uint8Array(buf).forEach((x) => (b += String.fromCharCode(x)))
  return 'data:audio/wav;base64,' + btoa(b)
}

/** Para pruebas: el estado del audio y la salida (para grabar una muestra). */
export const _debug = () => ({ ctx, master, cancion: !!buffer, musica: modoMusica, activo })
