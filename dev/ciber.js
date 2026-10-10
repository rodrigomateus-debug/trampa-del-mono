// 🥃 El sonido de la cancha de Rorro (la intro, las versiones y los poderes de dev): cibernético y sucio (grunge), todo sintetizado en vivo con Web Audio (sin archivos).
// La cadena: lo que suena pasa por una distorsión (tanh), un "bitcrush" (la amplitud en escalones) y un pasabajos, y
// algunos efectos además por un eco. Hay dos capas que nunca se apagan y siguen el movimiento: el servo de la cámara
// (agudo y fuerte cuanto más rápido se mueve) y el raspado de la cancha (cuando se deforma, cruje). Arriba de eso, los
// efectos de cada cosa: compilar, deploy, revert, breakpoint, el golpe, el pique, los monos…
// El 🔊/🔇 es el mismo del juego (se guarda en el teléfono con la misma clave).
const CLAVE = 'sdga-trampa-sonido'
let ac = null, salida = null, sucio = null, limpio = null, eco = null, ruidoB = null
let prendido = (() => { try { return localStorage.getItem(CLAVE) !== '0' } catch { return true } })()
const capas = {}
let pausaHum = null

export const sonando = () => prendido
let vol = 1 // el volumen general (en el juego, lo de Rorro va más bajo que en la intro)
/** El 🔊/🔇 del juego (sin tocar lo guardado: eso lo hace sonido.js). */
export function ponerSonido(si) {
  prendido = !!si
  if (salida) salida.gain.setTargetAtTime(prendido ? vol : 0, ac.currentTime, 0.05)
}
export function volumen(v) {
  vol = v
  if (salida) salida.gain.setTargetAtTime(prendido ? vol : 0, ac.currentTime, 0.4)
}
export function alternar() {
  prendido = !prendido
  try { localStorage.setItem(CLAVE, prendido ? '1' : '0') } catch {}
  despertar()
  if (prendido) try { if (navigator.audioSession) navigator.audioSession.type = 'playback' } catch {}
  if (salida) salida.gain.setTargetAtTime(prendido ? vol : 0, ac.currentTime, 0.05)
}

function curvaSucia(k = 3) {
  const n = 2048, c = new Float32Array(n)
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k) }
  return c
}
function curvaBits(niveles = 24) {
  const n = 4096, c = new Float32Array(n)
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.round(x * niveles) / niveles }
  return c
}
/** Hay que llamarlo desde un toque: crea el audio (en iPhone, lo despierta). */
export function despertar() {
  if (!ac) {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    ac = new Ctx()
    const comp = ac.createDynamicsCompressor()
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2
    salida = ac.createGain(); salida.gain.value = prendido ? vol : 0
    comp.connect(salida).connect(ac.destination)
    // lo sucio: distorsión → escalones (bits) → pasabajos
    sucio = ac.createGain(); sucio.gain.value = 0.9
    const dist = ac.createWaveShaper(); dist.curve = curvaSucia(2.6); dist.oversample = '2x'
    const bits = ac.createWaveShaper(); bits.curve = curvaBits(20)
    const pb = ac.createBiquadFilter(); pb.type = 'lowpass'; pb.frequency.value = 9000; pb.Q.value = 0.4
    sucio.connect(dist).connect(bits).connect(pb).connect(comp)
    limpio = ac.createGain(); limpio.gain.value = 0.9; limpio.connect(comp)
    // el eco (un poco de espacio, filtrado y con repeticiones que se ensucian)
    eco = ac.createGain(); eco.gain.value = 0.5
    const d = ac.createDelay(1); d.delayTime.value = 0.19
    const fb = ac.createGain(); fb.gain.value = 0.38
    const fe = ac.createBiquadFilter(); fe.type = 'bandpass'; fe.frequency.value = 1600; fe.Q.value = 0.7
    eco.connect(d); d.connect(fe).connect(fb).connect(d); fe.connect(sucio)
    ruidoB = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate)
    const r = ruidoB.getChannelData(0)
    for (let i = 0; i < r.length; i++) r[i] = Math.random() * 2 - 1
    capasVivas()
  }
  if (ac.state !== 'running') ac.resume().catch(() => {})
}
const ahora = () => ac.currentTime

// ── piezas ──
function env(g, t, { a = 0.005, pico = 0.3, d = 0.2, sostiene = 0 } = {}) {
  g.gain.cancelScheduledValues(t)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, pico), t + a)
  if (sostiene) g.gain.setValueAtTime(pico, t + a + sostiene)
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + sostiene + d)
}
function osc(tipo, f, { at = 0, dur = 0.2, f2 = null, curva = 'exp', vol = 0.2, a = 0.004, destino = sucio, filtro = null, detune = 0 } = {}) {
  if (!ac) return
  const t = ahora() + at
  const o = ac.createOscillator(); o.type = tipo; o.frequency.setValueAtTime(f, t); o.detune.value = detune
  if (f2 != null) curva === 'exp' ? o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + dur) : o.frequency.linearRampToValueAtTime(f2, t + dur)
  const g = ac.createGain()
  env(g, t, { a, pico: vol, d: dur })
  let n = o
  if (filtro) { const fl = ac.createBiquadFilter(); fl.type = filtro.tipo ?? 'lowpass'; fl.frequency.setValueAtTime(filtro.f, t); if (filtro.f2) fl.frequency.exponentialRampToValueAtTime(filtro.f2, t + dur); fl.Q.value = filtro.q ?? 1; n.connect(fl); n = fl }
  n.connect(g).connect(destino)
  o.start(t); o.stop(t + a + dur + 0.05)
  return o
}
function ruido(dur, { at = 0, f = 1200, f2 = null, q = 1, tipo = 'bandpass', vol = 0.2, a = 0.004, destino = sucio, sostiene = 0 } = {}) {
  if (!ac) return
  const t = ahora() + at
  const s = ac.createBufferSource(); s.buffer = ruidoB; s.loop = true
  const fl = ac.createBiquadFilter(); fl.type = tipo; fl.frequency.setValueAtTime(f, t); fl.Q.value = q
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + a + sostiene + dur)
  const g = ac.createGain(); env(g, t, { a, pico: vol, d: dur, sostiene })
  s.connect(fl).connect(g).connect(destino)
  s.start(t, Math.random() * 1.5); s.stop(t + a + sostiene + dur + 0.05)
}
/** Un metal: parciales inarmónicos que se apagan rápido (el "clank" de las máquinas). */
function metal(f = 320, { at = 0, vol = 0.12, dur = 0.5 } = {}) {
  for (const [k, v] of [[1, 1], [2.76, 0.6], [5.4, 0.4], [8.93, 0.25]]) osc('sine', f * k, { at, dur: dur / Math.sqrt(k), vol: vol * v, a: 0.001, destino: limpio })
  ruido(0.04, { at, f: 5000, q: 0.8, vol: vol * 0.8, a: 0.001 })
}
const azar = (a, b) => a + Math.random() * (b - a)

// ── las capas que siguen el movimiento ──
function capasVivas() {
  // el servo de la cámara: un serrucho grave con vibrato + aire filtrado; el volumen y el tono siguen la velocidad
  const servo = ac.createOscillator(); servo.type = 'sawtooth'; servo.frequency.value = 55
  const vib = ac.createOscillator(); vib.frequency.value = 17; const vibG = ac.createGain(); vibG.gain.value = 3
  vib.connect(vibG).connect(servo.frequency)
  const servoF = ac.createBiquadFilter(); servoF.type = 'lowpass'; servoF.frequency.value = 400; servoF.Q.value = 6
  const servoG = ac.createGain(); servoG.gain.value = 0
  servo.connect(servoF).connect(servoG).connect(sucio)
  const aire = ac.createBufferSource(); aire.buffer = ruidoB; aire.loop = true
  const aireF = ac.createBiquadFilter(); aireF.type = 'bandpass'; aireF.frequency.value = 500; aireF.Q.value = 1.4
  const aireG = ac.createGain(); aireG.gain.value = 0
  aire.connect(aireF).connect(aireG).connect(limpio)
  // el raspado de la cancha: ruido sucio cortado a pulsos (como un motor paso a paso)
  const raspa = ac.createBufferSource(); raspa.buffer = ruidoB; raspa.loop = true
  const raspaF = ac.createBiquadFilter(); raspaF.type = 'bandpass'; raspaF.frequency.value = 700; raspaF.Q.value = 3
  const pulso = ac.createOscillator(); pulso.type = 'square'; pulso.frequency.value = 23
  const pulsoG = ac.createGain(); pulsoG.gain.value = 0.5
  const am = ac.createGain(); am.gain.value = 0.5
  pulso.connect(pulsoG).connect(am.gain)
  const raspaG = ac.createGain(); raspaG.gain.value = 0
  raspa.connect(raspaF).connect(am).connect(raspaG).connect(sucio)
  // el zumbido de fondo: dos serruchos casi iguales (batido) muy filtrados, que respiran despacio
  const z1 = ac.createOscillator(), z2 = ac.createOscillator(), sub = ac.createOscillator()
  z1.type = z2.type = 'sawtooth'; z1.frequency.value = 55; z2.frequency.value = 55.35; sub.type = 'sine'; sub.frequency.value = 27.5
  const zF = ac.createBiquadFilter(); zF.type = 'lowpass'; zF.frequency.value = 220; zF.Q.value = 3
  const lfo = ac.createOscillator(); lfo.frequency.value = 0.07; const lfoG = ac.createGain(); lfoG.gain.value = 140
  lfo.connect(lfoG).connect(zF.frequency)
  const zG = ac.createGain(); zG.gain.value = 0
  z1.connect(zF); z2.connect(zF); sub.connect(zF); zF.connect(zG).connect(limpio)
  for (const n of [servo, vib, aire, raspa, pulso, z1, z2, sub, lfo]) n.start()
  Object.assign(capas, { servo, servoF, servoG, aireF, aireG, raspaF, raspaG, pulso, zG, zF })
}
/** Cada cuadro: la velocidad de la cámara (yardas/s) y cuánto se está moviendo la cancha (0 a 1). */
export function movimiento(velCam, cancha) {
  if (!ac || !capas.servo || !Number.isFinite(velCam) || !Number.isFinite(cancha)) return
  const t = ahora(), v = Math.min(velCam, 400)
  capas.servo.frequency.setTargetAtTime(48 + v * 0.55, t, 0.08)
  capas.servoF.frequency.setTargetAtTime(260 + v * 9, t, 0.08)
  capas.servoG.gain.setTargetAtTime(Math.min(0.11, v * 0.0009), t, 0.1)
  capas.aireF.frequency.setTargetAtTime(380 + v * 7, t, 0.1)
  capas.aireG.gain.setTargetAtTime(Math.min(0.2, v * 0.0016), t, 0.12)
  const c = Math.min(1, cancha)
  capas.raspaG.gain.setTargetAtTime(c * 0.34, t, 0.06)
  capas.raspaF.frequency.setTargetAtTime(500 + c * 1400, t, 0.06)
  capas.pulso.frequency.setTargetAtTime(14 + c * 30, t, 0.06)
}
export function zumbido(nivel = 1) { if (capas.zG) capas.zG.gain.setTargetAtTime(0.09 * nivel, ahora(), 1.2) }

// ── los efectos ──
export function tecla() { if (!ac) return; ruido(0.012, { f: 6000, q: 0.7, vol: 0.12, a: 0.001, destino: limpio }); osc('square', azar(1800, 2600), { dur: 0.018, vol: 0.05, a: 0.001 }) }
/** Una ráfaga de datos: bips cuadrados al azar, rotos. */
export function datos(n = 8, { at = 0, vol = 0.07 } = {}) {
  if (!ac) return
  for (let i = 0; i < n; i++) osc('square', [880, 1320, 1760, 2640, 3520][Math.floor(Math.random() * 5)] * (Math.random() < 0.2 ? 0.5 : 1), { at: at + i * azar(0.018, 0.045), dur: azar(0.012, 0.04), vol: vol * azar(0.6, 1), a: 0.001 })
}
/** La compilación: un motor que arranca y sube (serrucho distorsionado con el filtro que se abre) y datos por todos lados. */
export function compilar(dur = 4.3) {
  if (!ac) return
  osc('sawtooth', 36, { dur, f2: 140, vol: 0.2, a: 0.3, filtro: { f: 140, f2: 2600, q: 8 } })
  osc('square', 72, { dur, f2: 280, vol: 0.06, a: 0.3, detune: 12, filtro: { f: 300, f2: 3000, q: 4 } })
  ruido(dur, { f: 300, f2: 4200, q: 2.5, vol: 0.12, a: 0.6 })
  for (let k = 0; k < dur / 0.33; k++) datos(5 + Math.floor(Math.random() * 6), { at: k * 0.33 + azar(0, 0.1), vol: 0.05 })
}
/** Compilado: el golpe que traba todo en su lugar (acorde de quinta distorsionado, metal y sub). */
export function compilado() {
  if (!ac) return
  for (const f of [55, 82.4, 110, 164.8]) osc('sawtooth', f, { dur: 1.2, vol: 0.11, a: 0.004, filtro: { f: 2400, f2: 300, q: 2 } })
  osc('sine', 110, { dur: 0.6, f2: 32, vol: 0.5, a: 0.002, destino: limpio })
  metal(260, { vol: 0.16, dur: 0.9 })
  ruido(0.5, { f: 3000, f2: 200, q: 0.8, vol: 0.18, a: 0.002, destino: eco })
}
/** El deploy: un servo hidráulico que barre la cancha. Devuelve con qué seguir el barrido (u de 0 a 1) y cerrarlo. */
export function deploy(dur = 2.9) {
  if (!ac) return null
  const t = ahora()
  ruido(0.5, { f: 5200, q: 0.6, tipo: 'highpass', vol: 0.16, a: 0.005 }) // el pssst hidráulico
  const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 62
  const o2 = ac.createOscillator(); o2.type = 'square'; o2.frequency.value = 124.5
  const v = ac.createOscillator(); v.frequency.value = 19; const vg = ac.createGain(); vg.gain.value = 4
  v.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency)
  const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 5; f.frequency.value = 300
  const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.26, t + 0.25)
  o.connect(f); o2.connect(f); f.connect(g).connect(sucio)
  const ge = ac.createGain(); ge.gain.value = 0.25; f.connect(ge).connect(eco)
  for (const n of [o, o2, v]) n.start(t)
  return {
    avance(u) { const tt = ahora(); f.frequency.setTargetAtTime(280 + Math.sin(u * Math.PI) * 1700, tt, 0.05); o.frequency.setTargetAtTime(58 + u * 40, tt, 0.1); o2.frequency.setTargetAtTime(116 + u * 80, tt, 0.1) },
    fin() {
      const tt = ahora()
      g.gain.cancelScheduledValues(tt); g.gain.setValueAtTime(g.gain.value, tt); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.18)
      for (const n of [o, o2, v]) n.stop(tt + 0.25)
      metal(210, { vol: 0.2, dur: 0.7 }) // ¡clank!: trabó
      osc('sine', 96, { dur: 0.3, f2: 38, vol: 0.45, a: 0.002, destino: limpio })
      datos(6, { at: 0.08, vol: 0.05 })
    },
  }
}
/** El revert: una cinta que rebobina (chirridos que bajan, todo para atrás) y frena. */
export function revert(dur = 2.9) {
  if (!ac) return null
  const t = ahora()
  const o = ac.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(2600, t); o.frequency.exponentialRampToValueAtTime(240, t + dur)
  const lfo = ac.createOscillator(); lfo.type = 'sawtooth'; lfo.frequency.value = 13; const lg = ac.createGain(); lg.gain.value = 600
  lfo.connect(lg).connect(o.frequency)
  const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 3000; f.Q.value = 3
  const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.15)
  o.connect(f).connect(g).connect(sucio)
  o.start(t); lfo.start(t)
  ruido(dur * 0.8, { f: 800, f2: 5000, q: 1.2, vol: 0.14, a: dur * 0.7 }) // la cinta que vuelve (crece y corta)
  return {
    avance(u) { f.frequency.setTargetAtTime(3200 - u * 2400, ahora(), 0.05) },
    fin() { const tt = ahora(); g.gain.cancelScheduledValues(tt); g.gain.setValueAtTime(g.gain.value, tt); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.1); o.stop(tt + 0.15); lfo.stop(tt + 0.15); osc('sine', 180, { dur: 0.25, f2: 60, vol: 0.3, destino: limpio }); tecla() },
  }
}
/** El breakpoint: la cinta frena (todo baja de golpe), un glitch y un zumbido roto mientras está pausado. */
export function pausa() {
  if (!ac) return
  osc('sawtooth', 330, { dur: 0.55, f2: 22, vol: 0.2, a: 0.002, filtro: { f: 3000, f2: 120, q: 3 } })
  for (let i = 0; i < 9; i++) ruido(0.018, { at: 0.04 + i * 0.033, f: azar(800, 6000), q: 2, vol: 0.18, a: 0.001 })
  metal(700, { at: 0.02, vol: 0.08, dur: 0.3 })
  const t = ahora() + 0.45
  const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = 110
  const am = ac.createOscillator(); am.type = 'square'; am.frequency.value = 7.5
  const amg = ac.createGain(); amg.gain.value = 0.5; const g0 = ac.createGain(); g0.gain.value = 0.5
  am.connect(amg).connect(g0.gain)
  const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.3)
  o.connect(g0).connect(g).connect(sucio)
  o.start(t); am.start(t)
  pausaHum = { o, am, g }
  if (capas.zF) capas.zF.frequency.setTargetAtTime(70, ahora(), 0.2) // el fondo se ahoga
}
/** Seguir: la cinta arranca de nuevo. */
export function seguir() {
  if (!ac) return
  if (pausaHum) { const t = ahora(); pausaHum.g.gain.cancelScheduledValues(t); pausaHum.g.gain.setValueAtTime(pausaHum.g.gain.value, t); pausaHum.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1); pausaHum.o.stop(t + 0.15); pausaHum.am.stop(t + 0.15); pausaHum = null }
  osc('sawtooth', 22, { dur: 0.4, f2: 330, vol: 0.18, a: 0.002, filtro: { f: 150, f2: 3500, q: 3 } })
  datos(5, { at: 0.05 })
  if (capas.zF) capas.zF.frequency.setTargetAtTime(220, ahora(), 0.4)
}
/** El golpe: el clic del palo, el sub y una cola láser que se va (más fuerte cuanto más fuerte le pegó). */
export function golpe(p = 0.6, putt = false) {
  if (!ac) return
  if (putt) { osc('triangle', 1200, { dur: 0.05, f2: 700, vol: 0.12, a: 0.001, destino: limpio }); tecla(); return }
  ruido(0.06, { f: 3800, q: 1, vol: 0.4 * (0.5 + p), a: 0.001 })
  osc('sine', 150, { dur: 0.16, f2: 45, vol: 0.5 * (0.5 + p), a: 0.002, destino: limpio })
  osc('square', 2400, { at: 0.02, dur: 0.35 + p * 0.3, f2: 180, vol: 0.06, a: 0.002, destino: eco })
  osc('sawtooth', 1200, { at: 0.02, dur: 0.6 + p * 0.4, f2: 90, vol: 0.05, a: 0.002, filtro: { f: 4000, f2: 300, q: 6 } })
}
/** La pelota en el aire: un silbido filtrado que sube y baja. */
export function vuelo(dur = 1.5) { if (!ac) return; ruido(dur * 0.9, { f: 900, f2: 2600, q: 4, vol: 0.06, a: dur * 0.4, sostiene: 0 }) }
/** El pique: un golpe y un glitch (en el bunker, arena rota; en el green, un tic). */
export function pique(tipo = 'calle', fuerza = 1) {
  if (!ac) return
  const v = 0.5 + fuerza * 0.5
  if (tipo === 'green') { osc('sine', 260, { dur: 0.08, f2: 160, vol: 0.3 * v, a: 0.002, destino: limpio }); tecla(); return }
  if (tipo === 'bunker') { ruido(0.4, { f: 2600, q: 0.6, tipo: 'highpass', vol: 0.3 * v }); for (let i = 0; i < 4; i++) ruido(0.02, { at: 0.06 + i * 0.05, f: 1800, q: 3, vol: 0.15 }) ; return }
  osc('sine', 120, { dur: 0.14, f2: 50, vol: 0.4 * v, a: 0.002, destino: limpio })
  ruido(0.12, { f: 700, q: 1, tipo: 'lowpass', vol: 0.25 * v })
  for (let i = 0; i < 3; i++) ruido(0.015, { at: 0.08 + i * 0.045, f: azar(1500, 4000), q: 4, vol: 0.12 }) // el glitch
}
export function bosque() { if (!ac) return; osc('triangle', 420, { dur: 0.1, f2: 260, vol: 0.3, a: 0.001 }); ruido(0.5, { f: 3200, tipo: 'highpass', vol: 0.12, a: 0.02 }); datos(4, { at: 0.1, vol: 0.05 }) }
/** Error: un zumbador de dos serruchos desafinados. */
export function error() { if (!ac) return; osc('sawtooth', 98, { dur: 0.4, vol: 0.16, a: 0.003, filtro: { f: 900, q: 2 } }); osc('sawtooth', 103.5, { dur: 0.4, vol: 0.16, a: 0.003, filtro: { f: 900, q: 2 } }) }
/** Aprobado: un acorde mayor de cuadradas, limpio, que sube. */
export function aprobado() { if (!ac) return; [659.3, 830.6, 987.8, 1318.5].forEach((f, i) => osc('square', f, { at: i * 0.05, dur: 0.22, vol: 0.05, a: 0.002, destino: eco })) }
/** Cambios del cliente: el mismo acorde pero menor, roto y para abajo. */
export function cliente() { if (!ac) return; [659.3, 622.3, 493.9, 329.6].forEach((f, i) => osc('sawtooth', f, { at: i * 0.07, dur: 0.25, vol: 0.06, a: 0.002, filtro: { f: 2500, f2: 600 } })); datos(6, { at: 0.2 }) }
/** Sube la versión: un golpe corto de acorde distorsionado y un bip. */
export function version() { if (!ac) return; for (const f of [164.8, 246.9, 329.6]) osc('sawtooth', f, { dur: 0.22, vol: 0.07, a: 0.002, filtro: { f: 3000, f2: 500, q: 2 } }); osc('square', 1976, { at: 0.05, dur: 0.06, vol: 0.06 }) }
/** Un mono robot: "uh uh" con formantes y un anillo metálico. */
export function mono() {
  if (!ac) return
  for (const [at, f0] of [[0, 210], [0.2, 260]]) {
    const t = ahora() + at
    const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f0 * 0.8, t); o.frequency.exponentialRampToValueAtTime(f0 * 1.25, t + 0.08); o.frequency.exponentialRampToValueAtTime(f0 * 0.9, t + 0.17)
    const ring = ac.createOscillator(); ring.frequency.value = 33; const rg = ac.createGain(); rg.gain.value = 0
    ring.connect(rg.gain)
    const f1 = ac.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 750; f1.Q.value = 6
    const f2 = ac.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1150; f2.Q.value = 6
    const g = ac.createGain(); env(g, t, { a: 0.01, pico: 0.35, d: 0.17 })
    o.connect(rg); rg.connect(f1); rg.connect(f2); f1.connect(g); f2.connect(g); g.connect(sucio)
    o.start(t); ring.start(t); o.stop(t + 0.25); ring.stop(t + 0.25)
  }
}
/** Adentro: un arpegio cuadrado, roto, con eco, y el sub. */
export function embocada() {
  if (!ac) return
  osc('sine', 330, { dur: 0.18, f2: 220, vol: 0.3, destino: limpio })
  ;[659.3, 784, 987.8, 1318.5, 1568, 1975.5].forEach((f, i) => osc('square', f, { at: 0.12 + i * 0.07, dur: 0.18, vol: 0.06, a: 0.002, destino: eco }))
  osc('sine', 82.4, { at: 0.12, dur: 0.8, f2: 41, vol: 0.4, destino: limpio })
  ruido(0.8, { at: 0.12, f: 6000, f2: 800, q: 0.7, vol: 0.12, a: 0.01, destino: eco })
}
/** La cuenta del deploy del reloj (3, 2, 1): un bip de alarma que sube, con un glitch. */
export function cuenta(n = 3) {
  if (!ac) return
  const f = { 3: 880, 2: 1046.5, 1: 1318.5 }[n] ?? 880
  osc('square', f, { dur: 0.09, vol: 0.07, a: 0.002 })
  osc('square', f * 1.5, { at: 0.11, dur: 0.06, vol: 0.05, a: 0.002 })
  datos(3, { at: 0.05, vol: 0.04 })
}
/** El hoyo que se muda: el palo sale (un chupón que sube), vuela (aire) y cae en el lugar nuevo (un golpe seco). */
export function hoyo(dur = 1.5) {
  if (!ac) return
  osc('sine', 180, { dur: 0.22, f2: 900, vol: 0.18, a: 0.004, destino: limpio })
  ruido(dur * 0.5, { at: 0.3, f: 600, f2: 2400, q: 1.5, vol: 0.08, a: dur * 0.2 })
  osc('sine', 140, { at: dur * 0.8, dur: 0.25, f2: 50, vol: 0.4, a: 0.002, destino: limpio })
  metal(420, { at: dur * 0.8, vol: 0.08, dur: 0.4 })
}
export function tap() { if (!ac) return; osc('square', 1400, { dur: 0.03, vol: 0.05, a: 0.001 }); tecla() }
/** El sobrevuelo: una pasada de aire grave (el resto lo hace la capa del servo, que sigue la cámara). */
export function pasada(dur = 4) { if (!ac) return; ruido(dur, { f: 180, f2: 1400, q: 1.1, tipo: 'lowpass', vol: 0.07, a: dur * 0.45 }) }
