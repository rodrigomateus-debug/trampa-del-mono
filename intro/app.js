// La intro dentro de la app: la misma escena 3D y los mismos textos que el video, en vivo y al ritmo de la canción.
// Primera vez: pantalla de entrada con EMPEZAR (intro con sonido) o SALTAR. Durante la intro, SALTAR.
// Al final queda la pantalla de inicio: el logo fijo, el jugador caminando para siempre y el riff de la canción
// en loop (compases 16 a 23, de corrido), hasta que tocás EMPEZAR y aparece la portada del juego.
// Las veces siguientes la app abre directo en la pantalla de inicio (con "VER INTRO").
// Adentro de la SDGApp (en un iframe) no hay puerta: mientras carga se ve el logo y la primera vez la intro
// arranca sola. Con sonido si el teléfono deja; si no, muda y el botón de sonido late (un toque y entra la canción).
// Se saltea con ?sinintro. Si no hay WebGL, no se muestra.
import * as THREE from './assets/vendor/three.module.min.js'
import { crearEscena } from './escena-core.js'
import { MARKUP, CSS, CSS_VERTICAL } from './app-overlay.js'

const BASE = new URL('./', import.meta.url).href
const VISTA = 'sdga-trampa-intro-v1' // ya vio la intro en este teléfono
const FRASES = [
  'Buscando tu pelota en el rough…',
  'Calculando handicaps… y excusas',
  'Pidiendo silencio en el tee…',
  'Culpando al viento por el slice…',
  'Rastrillando el bunker que dejaste…',
]

const raiz = document.getElementById('intro-app')
const enApp = window.parent !== window // adentro de la SDGApp
function cargarScript(src) {
  return new Promise((ok, mal) => {
    const s = document.createElement('script')
    s.src = src
    s.onload = ok
    s.onerror = mal
    document.head.appendChild(s)
  })
}

function leerVista() {
  try {
    return localStorage.getItem(VISTA) === '1'
  } catch {
    return false
  }
}
function marcarVista() {
  try {
    localStorage.setItem(VISTA, '1')
  } catch {}
}

async function iniciar() {
  // ---------- armado del DOM ----------
  const estilo = document.createElement('style')
  estilo.textContent = (CSS + '\n' + CSS_VERTICAL + '\n' + CSS_APP).replaceAll('assets/', BASE + 'assets/')
  document.head.appendChild(estilo)
  raiz.innerHTML = `
    <canvas class="ia-lienzo"></canvas>
    <div class="ia-ojos"></div>
    <div class="ia-escenario">${MARKUP.replaceAll('assets/', BASE + 'assets/')}</div>
    <div class="ia-ui">
      <button class="ia-sonido" type="button" aria-label="Sonido" hidden>🔊</button>
      <button class="ia-saltar" type="button" hidden>SALTAR ›</button>
      <div class="ia-inicio" hidden>
        <button class="ia-btn ia-empezar" type="button">EMPEZAR</button>
        <button class="ia-link ia-reintro" type="button">VER INTRO ▶</button>
      </div>
      <div class="ia-puerta">
        <img src="${BASE}assets/sdga-logo.svg" alt="SDGA" width="200" height="46">
        <span class="ia-presenta">PRESENTA</span>
        <span class="ia-frase">${FRASES[Math.floor(Math.random() * FRASES.length)]}</span>
        <div class="ia-botones">
          <button class="ia-btn ia-ir" type="button" disabled>▶ EMPEZAR</button>
          <button class="ia-btn ia-ghost ia-saltar-puerta" type="button" disabled>SALTAR</button>
        </div>
        <span class="ia-tip">Subí el volumen 🔊</span>
      </div>
    </div>`
  const $ = (s) => raiz.querySelector(s)
  if (enApp) raiz.classList.add('en-app') // la puerta queda solo como pantalla de carga (sin botones)
  const escenario = $('.ia-escenario')
  // en la app, arriba del título: de quién es (el video no lo tiene). El logo oficial del SDGA con su ’s (la S del logo, chica)
  escenario.querySelector('#logo-caja')?.insertAdjacentHTML('afterbegin', `<img id="logo-de" src="${BASE}assets/sdga-s-logo.svg" alt="SDGA’s" width="253" height="48">`)
  const lienzo = $('.ia-lienzo')
  // grano, viñeta y fundidos a pantalla completa (no solo dentro del escenario escalado)
  for (const id of ['grano', 'vineta', 'flash', 'negro', 'fundido']) {
    const el = escenario.querySelector('#' + id)
    if (el) raiz.insertBefore(el, $('.ia-ui'))
  }

  // ---------- librerías y canción ----------
  if (!window.gsap) await cargarScript(BASE + 'assets/vendor/gsap.min.js')
  if (!window.CUES) await cargarScript(BASE + 'cues.js')
  if (!window.armarTextos) await cargarScript(BASE + 'textos.js')
  const Q = window.CUES
  const B = Q.COMPAS / 4

  const audio = await prepararAudio(BASE + 'assets/trampa-del-mono.mp3', Q).catch(() => null)

  // ---------- escena y textos ----------
  let W = 0
  let H = 0
  let vertical = true
  const pr = Math.min(window.devicePixelRatio || 1, 1.5)
  const escena = crearEscena(THREE, { canvas: lienzo, vertical: true, ancho: 1080, alto: 1920, cues: Q, infinito: true, pixelRatio: pr })
  await escena.listo
  const tl = window.armarTextos()
  tl.fromTo('#intro-app #logo-de', { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' }, Q.logo + 0.3)
  tl.pause()
  const idle = armarIdle(Q)
  const clips = Array.from(escenario.querySelectorAll('[data-start]')).map((el) => ({
    el,
    desde: +el.dataset.start,
    hasta: el.id === 'logo' ? Infinity : +el.dataset.start + +el.dataset.duration,
  }))

  function medir() {
    W = window.innerWidth
    H = window.innerHeight
    vertical = W / H < 1
    raiz.classList.toggle('vertical', vertical)
    escena.tamano(W, H, vertical, pr)
    const [ew, eh] = vertical ? [1080, 1920] : [1920, 1080]
    const k = Math.min(W / ew, H / eh)
    escenario.style.width = ew + 'px'
    escenario.style.height = eh + 'px'
    escenario.style.transform = `translate(${(W - ew * k) / 2}px, ${(H - eh * k) / 2}px) scale(${k})`
  }
  medir()
  window.addEventListener('resize', medir)

  // ---------- reloj: el de la canción si suena, si no el del teléfono ----------
  const reloj = { fuente: 'perf', t0: 0, base: 0 }
  const ahora = () => (reloj.fuente === 'audio' ? audio.ctx.currentTime : performance.now() / 1000)
  const tVis = () => reloj.base + (ahora() - reloj.t0)
  function ponerReloj(base, conAudio) {
    reloj.fuente = conAudio ? 'audio' : 'perf'
    reloj.t0 = ahora()
    reloj.base = base
  }
  // dónde va la canción para un tiempo de imagen dado (después del logo, el loop 16–23)
  const LOOP = Q.logo - Q.drop
  const posCancion = (t) => (t < Q.logo ? t : Q.drop + ((t - Q.logo) % LOOP))

  let estado = 'puerta'
  let raf = 0
  let quieto = false
  let sonido = !!audio

  function tocarDesde(t) {
    if (!audio) return ponerReloj(t, false)
    audio.tocar(posCancion(t), sonido ? 1 : 0)
    ponerReloj(t, true)
  }

  function cuadro() {
    raf = requestAnimationFrame(cuadro)
    let t = tVis()
    if (estado === 'intro' && t >= Q.logo) aInicio()
    escena.render(t)
    for (const c of clips) c.el.style.visibility = t >= c.desde && t < c.hasta ? 'visible' : 'hidden'
    const finTextos = Q.FIN - 0.75 // antes del fundido del video
    if (t < finTextos) {
      quieto = false
      tl.seek(t, false)
    } else {
      if (!quieto) tl.seek(finTextos, false)
      quieto = true
      idle.seek((t - finTextos) % idle.duration(), false)
    }
    // EMPEZAR late con la negra
    if (estado === 'inicio') {
      const f = (((t - Q.C0) / B) % 1 + 1) % 1
      empezar.style.transform = `scale(${1 + 0.05 * Math.exp(-f * 7)})`
    }
    ojos.actualizar(t, estado === 'inicio' && t > Q.logo + 1.3)
  }

  // ---------- estados ----------
  const puerta = $('.ia-puerta')
  const saltar = $('.ia-saltar')
  const inicio = $('.ia-inicio')
  const empezar = $('.ia-empezar')
  const btnSonido = $('.ia-sonido')
  const pintarSonido = () => (btnSonido.textContent = sonido ? '🔊' : '🔇')

  function correr() {
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(cuadro)
  }
  // ver la intro siempre es un toque explícito: arranca con música
  function verIntro() {
    ojos.vaciar()
    sonido = !!audio
    pintarSonido()
    if (audio) audio.despertar()
    estado = 'intro'
    puerta.hidden = true
    inicio.hidden = true
    inicio.classList.remove('visible')
    saltar.hidden = false
    btnSonido.hidden = !audio
    tocarDesde(0)
    correr()
  }
  // adentro de la app, la primera vez: la intro sola, sin la puerta
  async function arrancarSola() {
    puerta.hidden = true
    if (audio) {
      audio.despertar()
      await new Promise((ok) => setTimeout(ok, 150))
      if (audio.ctx.state === 'running') return verIntro() // el teléfono deja sonar: con la canción
    }
    // sin un toque no suena: arranca muda, con el reloj del teléfono, y el botón de sonido pide que lo toquen
    ojos.vaciar()
    sonido = false
    pintarSonido()
    estado = 'intro'
    inicio.hidden = true
    inicio.classList.remove('visible')
    saltar.hidden = false
    btnSonido.hidden = !audio
    btnSonido.classList.toggle('pide', !!audio)
    ponerReloj(0, false)
    correr()
  }
  function aInicio(desdeSalto) {
    estado = 'inicio'
    marcarVista()
    puerta.hidden = true
    saltar.hidden = true
    btnSonido.hidden = !audio
    if (desdeSalto) tocarDesde(Q.logo)
    inicio.hidden = false
    encuadrar()
    // el botón aparece cuando el logo ya está armado
    setTimeout(() => inicio.classList.add('visible'), desdeSalto ? 1400 : 1600)
    correr()
  }
  function cerrar() {
    estado = 'cerrado'
    ojos.vaciar()
    raiz.classList.add('cerrando')
    if (audio) audio.apagar(0.6)
    setTimeout(() => {
      if (audio) audio.dormir()
      cancelAnimationFrame(raf)
      raiz.hidden = true
      raiz.classList.remove('cerrando')
    }, 550)
  }
  function abrir() {
    raiz.hidden = false
    verIntro()
  }
  window.trampaIntro = { abrir }

  // ---------- pantalla de inicio: el jugador entre el logo y el botón, los ojos en los huecos ----------
  let jugadorCaja = null
  function encuadrar() {
    if (!vertical) {
      escena.encuadrarTitulo(null)
      jugadorCaja = null
    } else {
      const tag = escenario.querySelector('#logo-tag').getBoundingClientRect()
      const btn = inicio.getBoundingClientRect()
      const arriba = tag.bottom / H
      const abajo = (btn.height ? btn.top : H * 0.82) / H
      const alto = Math.max(0.12, Math.min(0.3, (abajo - arriba) * 0.8))
      const cy = (arriba + abajo) / 2
      escena.encuadrarTitulo({ cy, alto, fov: 36 })
      jugadorCaja = { x: W / 2 - alto * H * 0.4, y: (cy - alto * 0.62) * H, w: alto * H * 0.8, h: alto * H * 1.24 }
    }
    ojos.lugares([escenario.querySelector('#logo-caja'), escenario.querySelector('#logo-de'), inicio, btnSonido].filter(Boolean), jugadorCaja, W, H)
  }
  window.addEventListener('resize', () => {
    if (estado === 'inicio') encuadrar()
  })
  const ojos = crearOjos($('.ia-ojos'), Q)

  $('.ia-ir').addEventListener('click', verIntro)
  $('.ia-saltar-puerta').addEventListener('click', () => {
    if (audio) audio.despertar()
    aInicio(true)
  })
  saltar.addEventListener('click', () => aInicio(true))
  empezar.addEventListener('click', cerrar)
  $('.ia-reintro').addEventListener('click', verIntro)
  btnSonido.addEventListener('click', () => {
    btnSonido.classList.remove('pide')
    sonido = !sonido
    pintarSonido()
    if (!audio) return
    audio.despertar()
    if (!audio.sonando()) {
      // venía sin sonido (abrió directo en el inicio): arranca la canción en fase con la imagen
      const t = tVis()
      audio.tocar(posCancion(t), 1)
      ponerReloj(t, true)
    } else audio.volumen(sonido ? 1 : 0)
  })
  document.getElementById('ver-intro')?.addEventListener('click', abrir)

  // ---------- arranque ----------
  if (leerVista()) {
    // ya la vio: directo a la pantalla de inicio, sin sonido hasta que lo pida
    sonido = false
    pintarSonido()
    ponerReloj(Q.logo, false)
    aInicio(false)
  } else if (enApp) {
    arrancarSola()
  } else {
    pintarSonido()
    raiz.querySelector('.ia-ir').disabled = false
    raiz.querySelector('.ia-saltar-puerta').disabled = false
    raiz.querySelector('.ia-frase').textContent = 'Lista la intro, con la canción de la Trampa'
    // primer cuadro de fondo, quieto
    ponerReloj(0, false)
    escena.render(0)
  }
}

// un WAV de silencio para el truco del iPhone (ver despertar)
function wavSilencio(seg = 1, sr = 8000) {
  const n = Math.floor(seg * sr)
  const buf = new ArrayBuffer(44 + n)
  const v = new DataView(buf)
  const txt = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  txt(0, 'RIFF')
  v.setUint32(4, 36 + n, true)
  txt(8, 'WAVE')
  txt(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true) // PCM
  v.setUint16(22, 1, true) // mono
  v.setUint32(24, sr, true)
  v.setUint32(28, sr, true)
  v.setUint16(32, 1, true)
  v.setUint16(34, 8, true)
  txt(36, 'data')
  v.setUint32(40, n, true)
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128)
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }))
}

// la canción con Web Audio: el loop 16–23 queda pegado, sin cortes
async function prepararAudio(url, Q) {
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return null
  const ctx = new Ctx()
  // En iPhone Web Audio respeta la tecla de silencio. Para que suene como un video (en "reproducción"):
  // la Audio Session API donde existe, y si no, un <audio> de silencio en loop que pone la sesión en reproducción.
  let silencio = null
  const datos = await (await fetch(url)).arrayBuffer()
  const buffer = await new Promise((ok, mal) => ctx.decodeAudioData(datos, ok, mal))
  const ganancia = ctx.createGain()
  ganancia.connect(ctx.destination)
  let fuente = null
  return {
    ctx,
    // llamar dentro de un toque
    despertar() {
      try {
        if (navigator.audioSession) navigator.audioSession.type = 'playback'
      } catch {}
      if (!silencio) {
        silencio = document.createElement('audio')
        silencio.src = wavSilencio()
        silencio.loop = true
        silencio.preload = 'auto'
        silencio.setAttribute('playsinline', '')
        silencio.setAttribute('x-webkit-airplay', 'deny')
        silencio.disableRemotePlayback = true
        silencio.style.display = 'none'
        document.body.appendChild(silencio)
      }
      silencio.play().catch(() => {})
      if (ctx.state !== 'running') ctx.resume()
    },
    dormir() {
      if (silencio) silencio.pause()
    },
    sonando: () => !!fuente,
    tocar(desde, vol) {
      if (fuente) fuente.stop()
      fuente = ctx.createBufferSource()
      fuente.buffer = buffer
      fuente.loop = true
      fuente.loopStart = Q.drop
      fuente.loopEnd = Q.logo
      fuente.connect(ganancia)
      ganancia.gain.cancelScheduledValues(ctx.currentTime)
      ganancia.gain.setValueAtTime(vol, ctx.currentTime)
      fuente.start(0, desde)
    },
    volumen(v) {
      ganancia.gain.cancelScheduledValues(ctx.currentTime)
      ganancia.gain.setTargetAtTime(v, ctx.currentTime, 0.08)
    },
    apagar(seg) {
      if (!fuente) return
      const f = fuente
      ganancia.gain.cancelScheduledValues(ctx.currentTime)
      ganancia.gain.setValueAtTime(ganancia.gain.value, ctx.currentTime)
      ganancia.gain.linearRampToValueAtTime(0, ctx.currentTime + seg)
      f.stop(ctx.currentTime + seg + 0.05)
      fuente = null
    },
  }
}

// los ojos del MONO siguen mirando para todos lados mientras la pantalla de inicio queda en loop (4 compases)
function armarIdle(Q) {
  const c = Q.COMPAS
  const idle = gsap.timeline({ paused: true })
  idle.to('#intro-app .pupila', { x: -15, y: 2, duration: 0.22, ease: 'power3.out' }, c * 0.5)
  idle.to('#intro-app .pupila', { x: 15, y: 2, duration: 0.22, ease: 'power3.out' }, c * 1.5)
  idle.to('#intro-app .pupila', { x: 0, y: 18, duration: 0.22, ease: 'power3.out' }, c * 2.5)
  idle.to('#intro-app .pupila', { x: 0, y: 0, duration: 0.22, ease: 'power3.out' }, c * 3)
  idle.to('#intro-app .parpado', { scaleY: 0.07, duration: 0.07, ease: 'power2.in' }, c * 3.4)
  idle.to('#intro-app .parpado', { scaleY: 1, duration: 0.12, ease: 'power2.out' }, c * 3.4 + 0.07)
  idle.set({}, {}, c * 4)
  return idle
}

const CSS_APP = `
@font-face { font-family: "Anton"; src: url("assets/fonts/anton-400.woff2") format("woff2"); font-weight: 400; font-display: swap; }
@font-face { font-family: "Archivo"; src: url("assets/fonts/archivo-600.woff2") format("woff2"); font-weight: 600; font-display: swap; }
@font-face { font-family: "Archivo"; src: url("assets/fonts/archivo-700.woff2") format("woff2"); font-weight: 700; font-display: swap; }
@font-face { font-family: "Archivo"; src: url("assets/fonts/archivo-800.woff2") format("woff2"); font-weight: 800; font-display: swap; }
#intro-app #logo-sdga { display: none; } /* en la app ese lugar es del botón EMPEZAR */
#intro-app #logo-de { position: absolute; left: 50%; bottom: 100%; translate: -50% 0; margin-bottom: 18px; width: 230px; height: auto; display: block;
  filter: drop-shadow(0 4px 14px rgba(5, 18, 11, .55)); }
#intro-app.vertical #logo-de { width: 210px; margin-bottom: 16px; }
#intro-app { position: fixed; inset: 0; z-index: 60; overflow: hidden; background: #0c2b1c; color: #f4eeda;
  --green-950: #0c2b1c; --green-900: #14402a; --green-700: #1c5638; --green-300: #6fae87; --cream: #f4eeda;
  --cream-dark: #e7dfc2; --gold: #e8c34a; --gold-dark: #c9a22e;
  --display: "Anton", "Arial Narrow", sans-serif; --body: "Archivo", "Helvetica Neue", sans-serif;
  transition: opacity .5s ease; -webkit-tap-highlight-color: transparent; }
#intro-app[hidden] { display: none; }
#intro-app.cerrando { opacity: 0; pointer-events: none; }
#intro-app .ia-lienzo { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
#intro-app .ia-escenario { position: absolute; left: 0; top: 0; transform-origin: 0 0; overflow: hidden; pointer-events: none; }
#intro-app .ia-ui { position: absolute; inset: 0; pointer-events: none; }
#intro-app .ia-ui > * { pointer-events: auto; }
#intro-app .ia-ui [hidden] { display: none !important; }
#intro-app .ia-btn { font: 400 30px/1 var(--display); letter-spacing: .06em; padding: 18px 46px 16px; border: 0; border-radius: 999px;
  background: var(--gold); color: var(--green-900); box-shadow: 0 6px 20px rgba(12, 43, 28, .35); cursor: pointer; }
#intro-app .ia-btn:disabled { opacity: .45; cursor: default; }
#intro-app .ia-btn:active:not(:disabled) { scale: .97; }
#intro-app .ia-ghost { background: transparent; color: var(--cream); box-shadow: inset 0 0 0 2px rgba(244, 238, 218, .55); font-size: 22px; padding: 14px 34px 12px; }
#intro-app .ia-puerta { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 18px; padding: 24px; text-align: center;
  background: radial-gradient(120% 90% at 50% 0%, rgba(255, 255, 255, .06), transparent 60%), linear-gradient(160deg, #1F5F3E, #17492F); }
#intro-app .ia-puerta img { width: 200px; height: auto; }
#intro-app .ia-presenta { font: 800 15px/1 var(--body); letter-spacing: .6em; padding: 8px 8px 7px calc(.6em + 8px); background: var(--green-900); border-radius: 6px; }
#intro-app .ia-frase { font: 600 16px/1.4 var(--body); margin-top: 28px; min-height: 1.4em; }
#intro-app .ia-botones { display: flex; flex-direction: column; align-items: center; gap: 14px; margin-top: 8px; }
#intro-app .ia-tip { font: 600 13px/1.3 var(--body); letter-spacing: .08em; opacity: .85; }
#intro-app .ia-saltar, #intro-app .ia-sonido { position: absolute; border: 0; cursor: pointer;
  background: var(--green-900); color: var(--cream); box-shadow: 0 2px 0 rgba(12, 43, 28, .25); }
#intro-app .ia-saltar { right: 16px; bottom: calc(18px + env(safe-area-inset-bottom, 0px)); font: 800 15px/1 var(--body); letter-spacing: .18em; padding: 13px 18px 12px 20px; border-radius: 999px; }
#intro-app.en-app .ia-botones, #intro-app.en-app .ia-tip { display: none; }
#intro-app .ia-sonido.pide { animation: ia-pide 1.1s ease-in-out infinite; }
#intro-app .ia-sonido.pide::after { content: 'Tocá para escuchar'; position: absolute; left: 56px; top: 50%; translate: 0 -50%; white-space: nowrap;
  font: 800 12px/1 var(--body); letter-spacing: .12em; text-transform: uppercase; color: var(--cream); background: var(--green-900); padding: 8px 10px 7px; border-radius: 6px; }
@keyframes ia-pide { 0%, 100% { box-shadow: 0 0 0 0 rgba(232, 195, 74, .7); } 50% { box-shadow: 0 0 0 10px rgba(232, 195, 74, 0); } }
#intro-app .ia-sonido { left: 14px; top: calc(14px + env(safe-area-inset-top, 0px)); width: 46px; height: 46px; border-radius: 50%; font-size: 20px; line-height: 46px; padding: 0; }
#intro-app .ia-inicio { position: absolute; left: 0; right: 0; bottom: calc(8vh + env(safe-area-inset-bottom, 0px));
  display: flex; flex-direction: column; align-items: center; gap: 16px; opacity: 0; transition: opacity .6s ease; }
#intro-app .ia-inicio.visible { opacity: 1; }
#intro-app .ia-empezar { font-size: 36px; padding: 20px 64px 18px; }
#intro-app .ia-ojos { position: absolute; inset: 0; pointer-events: none; }
#intro-app .ia-par { position: absolute; display: flex; gap: .1em; transform-origin: 50% 50%; opacity: 0;
  filter: drop-shadow(0 0 .3em rgba(232, 195, 74, .28)); will-change: transform; }
#intro-app .ia-par svg { display: block; width: .465em; height: .735em; }
#intro-app .ia-link { border: 0; background: var(--green-900); color: var(--cream); font: 800 13px/1 var(--body); letter-spacing: .2em;
  padding: 10px 16px 9px; border-radius: 6px; cursor: pointer; }
`

// ---------- ojos de mono que se abren y se cierran en los huecos de la pantalla de inicio ----------
const OJO = `<svg viewBox="0 0 100 158" aria-hidden="true"><ellipse cx="50" cy="79" rx="49" ry="78" fill="#f4eeda"/><g fill="#e7dfc2"><circle cx="22" cy="40" r="6"/><circle cx="48" cy="22" r="6"/><circle cx="76" cy="38" r="6"/><circle cx="16" cy="78" r="6"/><circle cx="84" cy="80" r="6"/><circle cx="24" cy="118" r="6"/><circle cx="50" cy="136" r="6"/><circle cx="77" cy="118" r="6"/></g><g class="pu"><ellipse cx="50" cy="84" rx="27" ry="31" fill="#e8c34a"/><ellipse cx="50" cy="84" rx="17" ry="21" fill="#0c2b1c"/><circle cx="58" cy="74" r="6" fill="#fff"/></g></svg>`

function crearOjos(capa, Q) {
  const B = Q.COMPAS / 4
  let libres = []
  let base = 30
  let blanco = { x: 0, y: 0 } // adonde miran: el jugador
  const pares = []
  let proximo = 0
  const choca = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  const caja = (el, m) => {
    const r = el.getBoundingClientRect()
    return { x: r.left - m, y: r.top - m, w: r.width + 2 * m, h: r.height + 2 * m }
  }
  const sigNegra = (t, n = 0) => Q.C0 + (Math.ceil((t - Q.C0) / B) + n) * B

  function nuevo(t) {
    const ocupados = pares.map((p) => p.lugar)
    const opciones = libres.filter((l) => ocupados.every((o) => Math.hypot(o.x - l.x, o.y - l.y) > base * 2.4))
    if (!opciones.length) return
    const lugar = opciones[Math.floor(Math.random() * opciones.length)]
    const s = 0.7 + Math.random() * 0.6
    const el = document.createElement('div')
    el.className = 'ia-par'
    el.innerHTML = OJO + OJO
    el.style.fontSize = base * s + 'px'
    el.style.left = lugar.x + (base * 1.3 * 1.08 - base * s * 1.08) / 2 + 'px'
    el.style.top = lugar.y + (base * 1.3 * 0.75 - base * s * 0.75) / 2 + 'px'
    capa.appendChild(el)
    const abre = sigNegra(t, Math.floor(Math.random() * 3))
    const cierra = abre + (6 + Math.floor(Math.random() * 10)) * B
    // cada dos negras miran a otro lado; casi siempre vuelven al jugador
    const miradas = []
    for (let k = 0; k < 12; k++) {
      const r = Math.random()
      miradas.push(r < 0.5 ? null : [(Math.random() - 0.5) * 30, (Math.random() - 0.5) * 22])
    }
    const parpadeo = abre + (2 + Math.floor(Math.random() * 3)) * B * 2 + B * 0.5
    pares.push({ el, pus: Array.from(el.querySelectorAll('.pu')), lugar, abre, cierra, miradas, parpadeo, px: 0, py: 0 })
  }

  return {
    lugares(evitarEls, jugador, W, H) {
      base = Math.max(22, Math.min(W, H * 0.6) * 0.1)
      const pw = base * 1.3 * 1.08
      const ph = base * 1.3 * 0.75
      const evitar = evitarEls.filter(Boolean).map((e) => caja(e, 14))
      if (jugador) evitar.push(jugador)
      blanco = jugador ? { x: jugador.x + jugador.w / 2, y: jugador.y + jugador.h * 0.3 } : { x: W / 2, y: H * 0.7 }
      libres = []
      for (let y = 56; y + ph < H - 16; y += ph * 1.25)
        for (let x = 16; x + pw < W - 16; x += pw * 1.2) {
          const r = { x, y, w: pw, h: ph }
          if (!evitar.some((e) => choca(r, e))) libres.push({ x, y })
        }
      this.vaciar()
    },
    vaciar() {
      for (const p of pares) p.el.remove()
      pares.length = 0
      proximo = 0
    },
    actualizar(t, activos) {
      capa.style.display = activos ? '' : 'none'
      if (!activos) return
      const max = Math.max(3, Math.min(8, Math.floor(libres.length / 4)))
      // a lo sumo uno nuevo por negra, así se van abriendo de a uno
      if (pares.length < max && t >= proximo) {
        nuevo(t)
        proximo = sigNegra(t, 1)
      }
      for (let i = pares.length - 1; i >= 0; i--) {
        const p = pares[i]
        let a
        if (t < p.abre) a = 0
        else if (t < p.abre + 0.18) {
          const u = (t - p.abre) / 0.18
          a = 1 + 2.7 * Math.pow(u - 1, 3) + 1.7 * Math.pow(u - 1, 2) // abre con rebote
        } else if (t < p.cierra) a = 1
        else if (t < p.cierra + 0.12) a = 1 - (t - p.cierra) / 0.12
        else {
          p.el.remove()
          pares.splice(i, 1)
          continue
        }
        if (Math.abs(t - p.parpadeo) < 0.07) a *= 0.06
        p.el.style.opacity = a > 0.01 ? '1' : '0'
        p.el.style.transform = `scaleY(${Math.max(0.04, a)})`
        // la mirada: al jugador, o a donde le toque en esta negra doble
        const k = Math.max(0, Math.floor((t - p.abre) / (2 * B))) % p.miradas.length
        let objetivo = p.miradas[k]
        if (!objetivo) {
          const r = p.el.getBoundingClientRect()
          const dx = blanco.x - (r.left + r.width / 2)
          const dy = blanco.y - (r.top + r.height / 2)
          const n = Math.hypot(dx, dy) || 1
          objetivo = [(dx / n) * 15, (dy / n) * 12]
        }
        p.px += (objetivo[0] - p.px) * 0.35
        p.py += (objetivo[1] - p.py) * 0.35
        for (const pu of p.pus) pu.setAttribute('transform', `translate(${p.px.toFixed(1)} ${p.py.toFixed(1)})`)
      }
    },
  }
}

// ---------- arranque (al final: usa todo lo de arriba) ----------
if (raiz && ['sinintro', 'match'].some((k) => new URLSearchParams(location.search).has(k))) raiz.remove() // con ?match la app te manda directo a tus desafíos
else if (raiz)
  iniciar().catch((e) => {
    console.warn('intro: no se pudo armar', e)
    raiz.remove()
  })
