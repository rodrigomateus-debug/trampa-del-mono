// La intro dentro de la app: la misma escena 3D y los mismos textos que el video, en vivo y al ritmo de la canción.
// Primera vez: pantalla de entrada con EMPEZAR (intro con sonido) o SALTAR. Durante la intro, SALTAR.
// Al final queda la pantalla de inicio: el logo fijo, el jugador caminando para siempre y el riff de la canción
// en loop (compases 16 a 23, de corrido), hasta que tocás EMPEZAR y aparece la portada del juego.
// Las veces siguientes la app abre directo en la pantalla de inicio (con "VER INTRO").
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
  const escenario = $('.ia-escenario')
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
  function verIntro() {
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
  function aInicio(desdeSalto) {
    estado = 'inicio'
    marcarVista()
    puerta.hidden = true
    saltar.hidden = true
    btnSonido.hidden = !audio
    if (desdeSalto) tocarDesde(Q.logo)
    inicio.hidden = false
    // el botón aparece cuando el logo ya está armado
    setTimeout(() => inicio.classList.add('visible'), desdeSalto ? 1400 : 1600)
    correr()
  }
  function cerrar() {
    estado = 'cerrado'
    raiz.classList.add('cerrando')
    if (audio) audio.apagar(0.6)
    setTimeout(() => {
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

  $('.ia-ir').addEventListener('click', verIntro)
  $('.ia-saltar-puerta').addEventListener('click', () => {
    if (audio) audio.despertar()
    aInicio(true)
  })
  saltar.addEventListener('click', () => aInicio(true))
  empezar.addEventListener('click', cerrar)
  $('.ia-reintro').addEventListener('click', verIntro)
  btnSonido.addEventListener('click', () => {
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

// la canción con Web Audio: el loop 16–23 queda pegado, sin cortes
async function prepararAudio(url, Q) {
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return null
  const ctx = new Ctx()
  const datos = await (await fetch(url)).arrayBuffer()
  const buffer = await new Promise((ok, mal) => ctx.decodeAudioData(datos, ok, mal))
  const ganancia = ctx.createGain()
  ganancia.connect(ctx.destination)
  let fuente = null
  return {
    ctx,
    despertar() {
      if (ctx.state !== 'running') ctx.resume()
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
#intro-app .ia-saltar, #intro-app .ia-sonido { position: absolute; top: calc(14px + env(safe-area-inset-top, 0px)); border: 0; cursor: pointer;
  background: var(--green-900); color: var(--cream); box-shadow: 0 2px 0 rgba(12, 43, 28, .25); }
#intro-app .ia-saltar { right: 14px; font: 800 15px/1 var(--body); letter-spacing: .18em; padding: 13px 18px 12px 20px; border-radius: 999px; }
#intro-app .ia-sonido { left: 14px; width: 46px; height: 46px; border-radius: 50%; font-size: 20px; line-height: 46px; padding: 0; }
#intro-app .ia-inicio { position: absolute; left: 0; right: 0; bottom: calc(8vh + env(safe-area-inset-bottom, 0px));
  display: flex; flex-direction: column; align-items: center; gap: 16px; opacity: 0; transition: opacity .6s ease; }
#intro-app .ia-inicio.visible { opacity: 1; }
#intro-app .ia-empezar { font-size: 36px; padding: 20px 64px 18px; }
#intro-app .ia-link { border: 0; background: var(--green-900); color: var(--cream); font: 800 13px/1 var(--body); letter-spacing: .2em;
  padding: 10px 16px 9px; border-radius: 6px; cursor: pointer; }
`

// ---------- arranque (al final: usa todo lo de arriba) ----------
if (raiz && new URLSearchParams(location.search).has('sinintro')) raiz.remove()
else if (raiz)
  iniciar().catch((e) => {
    console.warn('intro: no se pudo armar', e)
    raiz.remove()
  })
