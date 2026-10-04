// Rodaje: abre el juego con el reloj virtual y graba cuadros a 30 fps (dos pasos de 1/60 por cuadro).
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { chromium } = require('playwright-core')
const FUENTES = require('./fuentes.cjs')
const RELOJ = fs.readFileSync(__dirname + '/reloj.js', 'utf8')
const RAIZ = path.resolve(__dirname, '../..')
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const TOMAS = process.env.TOMAS || path.join(__dirname, 'tomas')
const BASE = 'http://127.0.0.1:8765/'

const EXPONER = `
window.__J = {
  get estado() { return estado }, get ronda() { return ronda }, get tiro() { return tiro }, get anim() { return anim },
  get cam() { return cam }, get obj() { return obj }, get drag() { return drag }, get pancho() { return pancho },
  get W() { return W }, get H() { return H }, M, campo, w2s, s2wVec, vistaApuntar, apunte, PLANTEL, datos, largoMax,
  get mazoI() { return mazoI }, empezar, siguienteTiro, banda, cerrarBanda, medir, tarjetaFinal,
}
`

async function abrir({ semilla = 7, ancho = 390, alto = 844, dpr = 3, datos = null, url = 'index.html?sinintro' } = {}) {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--disable-gpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] })
  const ctx = await browser.newContext({ viewport: { width: ancho, height: alto }, deviceScaleFactor: dpr, ignoreHTTPSErrors: true })
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: FUENTES }))
  await ctx.route(BASE + 'index.html*', async (r) => {
    let h = fs.readFileSync(RAIZ + '/index.html', 'utf8')
    h = h.replace('Math.min(window.devicePixelRatio || 1, 2)', 'Math.min(window.devicePixelRatio || 1, 3)')
    // el juego se actualiza a 60 Hz pero se dibuja una vez por cuadro de video (dibujar en 3x es lo caro)
    if (!h.includes('  actualizar(dt)\n  dibujar()\n')) throw new Error('no encontré el ciclo')
    h = h.replace('  actualizar(dt)\n  dibujar()\n', '  actualizar(dt)\n  if (!window.__sinDibujo) dibujar()\n')
    const marca = 'Object.assign(cam, obj)\nrequestAnimationFrame(cuadro)'
    if (!h.includes(marca)) throw new Error('no encontré el final del juego')
    h = h.replace(marca, 'Object.assign(cam, obj)\n' + EXPONER + 'requestAnimationFrame(cuadro)')
    r.fulfill({ contentType: 'text/html; charset=utf-8', body: h })
  })
  await ctx.addInitScript(`window.__SEMILLA_INI = ${semilla};` + (datos ? `try { localStorage.setItem('sdga-trampa-v1', ${JSON.stringify(JSON.stringify(datos))}) } catch {}` : '') + RELOJ)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('pageerror:', e.message))
  page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()) })
  await page.goto(BASE + url)
  await page.waitForFunction(() => window.__J && document.fonts.status === 'loaded')
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(800) // imágenes (la cancha)
  const cdp = await ctx.newCDPSession(page)
  await page.addScriptTag({ content: fs.readFileSync(__dirname + '/bot.js', 'utf8') })
  const r = new Rodaje(browser, page, cdp, { ancho, alto, dpr })
  await r.pasos(6)
  return r
}

class Rodaje {
  constructor(browser, page, cdp, vp) {
    this.browser = browser; this.page = page; this.cdp = cdp; this.vp = vp
    this.dir = null; this.n = 0; this.marcas = []; this.toma = null
    this.mouse = { x: vp.ancho / 2, y: vp.alto / 2, abajo: false }
    this.tv = 0 // tiempo virtual del último cuadro
    this.sinFotos = false
  }
  /** avanza un cuadro de video (1/30 s) y, si está grabando, lo saca */
  async cuadro() {
    this.tv += 1000 / 30
    await this.page.evaluate((t) => {
      while (window.__vt.now < t - 1e-6) {
        const ms = Math.min(1000 / 60, t - window.__vt.now)
        window.__sinDibujo = window.__vt.now + ms < t - 1e-6
        window.__vt.paso(ms)
      }
      window.__sinDibujo = false
    }, this.tv)
    if (this.dir && !this.sinFotos) {
      const { data } = await this.cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 93, optimizeForSpeed: true, clip: { x: 0, y: 0, width: this.vp.ancho, height: this.vp.alto, scale: this.vp.dpr } })
      fs.writeFileSync(path.join(this.dir, String(this.n).padStart(5, '0') + '.jpg'), Buffer.from(data, 'base64'))
    }
    this.n++
  }
  /** avanza ms dentro del cuadro actual (sin pasar al siguiente) */
  async micro(ms) {
    const tope = this.tv + 1000 / 30 - 0.5
    return this.page.evaluate(([ms, tope]) => { const t = Math.min(window.__vt.now + ms, tope); window.__sinDibujo = true; while (window.__vt.now < t - 1e-6) window.__vt.paso(Math.min(1000 / 60, t - window.__vt.now)); window.__sinDibujo = false; return window.__vt.now }, [ms, tope])
  }
  async pasos(k) { for (let i = 0; i < k; i++) await this.cuadro() }
  async seg(s) { await this.pasos(Math.round(s * 30)) }
  /** espera (grabando) hasta que se cumpla f() en la página, con tope en segundos */
  async hasta(f, arg, tope = 30) {
    for (let i = 0; i < tope * 30; i++) {
      if (await this.page.evaluate(f, arg)) return true
      await this.cuadro()
    }
    console.log('  (tope esperando)', String(f).slice(0, 80))
    return false
  }
  grabar(nombre) {
    this.toma = nombre
    this.dir = path.join(TOMAS, nombre)
    fs.rmSync(this.dir, { recursive: true, force: true })
    fs.mkdirSync(this.dir, { recursive: true })
    this.n = 0
    this.marcas = []
    this.t0 = Date.now()
  }
  marca(nombre, info) { const m = { nombre, t: +(this.n / 30).toFixed(3), ...(info || {}) }; this.marcas.push(m); console.log('  marca', ((Date.now() - (this.t0 || 0)) / 1000).toFixed(1) + 's', JSON.stringify(m).slice(0, 300)) }
  cortar() {
    if (!this.dir) return
    fs.writeFileSync(path.join(this.dir, 'marcas.json'), JSON.stringify({ toma: this.toma, cuadros: this.n, marcas: this.marcas }, null, 1))
    console.log(`  toma ${this.toma}: ${this.n} cuadros (${(this.n / 30).toFixed(1)} s) en ${((Date.now() - this.t0) / 1000).toFixed(0)} s`)
    this.dir = null
  }
  // ── el dedo ──
  async tic() { await this.page.evaluate(() => window.__tic(12)) }
  async mover(x, y) { this.mouse.x = x; this.mouse.y = y; await this.tic(); await this.page.mouse.move(x, y) }
  async bajar(x, y) { await this.mover(x, y); await this.tic(); await this.page.mouse.down(); this.mouse.abajo = true }
  async subir() { await this.tic(); await this.page.mouse.up(); this.mouse.abajo = false }
  /** arrastre con easing: de (x0,y0) a (x1,y1) en s segundos (moviendo una vez por cuadro) */
  async arrastrar(x0, y0, x1, y1, s, { soltar = true, ease = (u) => 0.5 - 0.5 * Math.cos(Math.PI * u), antes = 0.12 } = {}) {
    await this.bajar(x0, y0)
    await this.seg(antes)
    const k = Math.max(1, Math.round(s * 30))
    for (let i = 1; i <= k; i++) { const u = ease(i / k); await this.mover(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u); await this.cuadro() }
    if (soltar) await this.subir()
  }
  /** toque sobre un elemento (o un punto): baja, espera un poquito, sube */
  async tocar(sel, { dx = 0, dy = 0, quieto = 0.1 } = {}) {
    let x, y
    if (typeof sel === 'string') {
      const b = await this.page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }, sel)
      if (!b) throw new Error('no está ' + sel)
      x = b.x + dx; y = b.y + dy
    } else [x, y] = sel
    // el dedo llega desde donde estaba
    await this.mover(x, y)
    await this.bajar(x, y)
    await this.seg(quieto)
    await this.subir()
  }
  /** cambia la densidad de píxeles al vuelo (explorar en 1x, grabar en 3x): el juego rehace el canvas */
  async densidad(k) {
    await this.cdp.send('Emulation.setDeviceMetricsOverride', { width: this.vp.ancho, height: this.vp.alto, deviceScaleFactor: k, mobile: false })
    await this.page.evaluate(() => { __J.medir() })
    this.vp.dpr = k
  }
  async escribir(txt, cada = 0.13) { for (const ch of txt) { await this.tic(); await this.page.keyboard.type(ch); await this.seg(cada) } }
  async cerrar() { this.cortar(); await this.browser.close() }
}

/** arma un mp4 con los cuadros de una toma */
function armarVideo(nombre, salida, { crf = 16, escala = null } = {}) {
  const dir = path.join(TOMAS, nombre)
  const vf = ['pad=ceil(iw/2)*2:ceil(ih/2)*2']
  if (escala) vf.unshift(`scale=${escala}:flags=lanczos`)
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', '30', '-i', path.join(dir, '%05d.jpg'), '-vf', vf.join(','), '-c:v', 'libx264', '-preset', 'medium', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', salida])
  return salida
}

module.exports = { abrir, armarVideo }
