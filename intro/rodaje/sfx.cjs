// Saca los efectos del juego (sonido.js, Web Audio sintetizado) a WAV, con un OfflineAudioContext
const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright-core')
const OUT = path.resolve(__dirname, '../assets/juego/sfx')
fs.mkdirSync(OUT, { recursive: true })
const SONIDOS = {
  golpe: ['golpe', [1, false], 1.2],
  putt: ['golpe', [0.4, true], 0.8],
  embocada: ['embocada', [], 1.6],
  birdie: ['resultado', ['Birdie'], 2.2],
  robo: ['robo', [], 1.6],
  vienen: ['monosVienen', [], 1.4],
  monobueno: ['monoBueno', [], 1.6],
  perro: ['perro', [], 0.8],
  pancho: ['pancho', [], 1.0],
  firma: ['firma', [], 0.8],
  marshall: ['marshall', [], 0.9],
  swipe: ['swipe', [], 0.5],
  tap: ['tap', [], 0.3],
  cuenta3: ['cuenta', [3], 0.6],
  cuentaYa: ['cuenta', [0], 1.4],
  palo: ['palo', [], 0.6],
  lamento: ['lamento', [], 2.0],
}
function wav(chs, sr) {
  const n = chs[0].length, nc = chs.length
  const b = Buffer.alloc(44 + n * nc * 2)
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * nc * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12)
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(nc, 22); b.writeUInt32LE(sr, 24)
  b.writeUInt32LE(sr * nc * 2, 28); b.writeUInt16LE(nc * 2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * nc * 2, 40)
  for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(chs[c][i] * 32767))), 44 + (i * nc + c) * 2)
  return b
}
;(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
  for (const [nombre, [fn, args, dur]] of Object.entries(SONIDOS)) {
    const p = await b.newPage()
    await p.addInitScript((dur) => {
      window.__dur = dur
      window.AudioContext = class extends OfflineAudioContext { constructor() { super(2, Math.ceil(44100 * window.__dur), 44100); window.__ctx = this } resume() { return Promise.resolve() } }
    }, dur)
    await p.goto('http://127.0.0.1:8765/manifest.webmanifest')
    const datos = await p.evaluate(async ([fn, args]) => {
      const S = await import('/sonido.js')
      S.despertar()
      S[fn](...args)
      const buf = await window.__ctx.startRendering()
      return [Array.from(buf.getChannelData(0)), Array.from(buf.getChannelData(1))]
    }, [fn, args])
    fs.writeFileSync(`${OUT}/${nombre}.wav`, wav(datos, 44100))
    const pico = Math.max(...datos[0].map(Math.abs))
    console.log(nombre, 'pico', pico.toFixed(3))
    await p.close()
  }
  await b.close()
})().catch((e) => { console.error('FALLO', e); process.exit(1) })
