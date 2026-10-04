// Reloj virtual para grabar el juego cuadro por cuadro: performance.now, timers, requestAnimationFrame,
// animaciones CSS / WAAPI y SMIL avanzan solo cuando el rodaje llama a __vt.paso(ms).
(() => {
  const SEED = (window.__SEMILLA = (window.__SEMILLA_INI ?? 7) >>> 0)
  let a = SEED || 1
  Math.random = function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  let now = 0
  const T0 = 1759500000000
  performance.now = () => now
  Date.now = () => T0 + now
  const timers = new Map()
  let tid = 1
  // un rAF de verdad que no hace nada: mantiene a Chrome sacando cuadros (si no, el mouse queda esperando uno)
  // (solo cuando hace falta: cada cuadro de verdad cuesta caro en 3x)
  const rafNativo = window.requestAnimationFrame.bind(window)
  let quedan = 0, corriendo = false
  function bucle() { if (--quedan > 0) rafNativo(bucle); else corriendo = false }
  window.__tic = (n = 12) => { quedan = Math.max(quedan, n); if (!corriendo) { corriendo = true; rafNativo(bucle) } }
  let rafQ = []
  let rid = 1
  window.setTimeout = (fn, ms = 0, ...args) => { const id = tid++; timers.set(id, { at: now + Math.max(0, +ms || 0), fn, args, cada: 0 }); return id }
  window.setInterval = (fn, ms = 0, ...args) => { const id = tid++; const c = Math.max(1, +ms || 0); timers.set(id, { at: now + c, fn, args, cada: c }); return id }
  window.clearTimeout = window.clearInterval = (id) => { timers.delete(id) }
  window.requestAnimationFrame = (fn) => { const id = rid++; rafQ.push({ id, fn }); return id }
  window.cancelAnimationFrame = (id) => { rafQ = rafQ.filter((r) => r.id !== id) }
  window.requestIdleCallback = (fn) => window.setTimeout(() => fn({ didTimeout: false, timeRemaining: () => 10 }), 1)
  function timersHasta(t) {
    for (let guard = 0; guard < 10000; guard++) {
      let id = null, x = null
      for (const [k, v] of timers) if (v.at <= t && (!x || v.at < x.at || (v.at === x.at && k < id))) { id = k; x = v }
      if (!x) break
      now = Math.max(now, x.at)
      if (x.cada) x.at += x.cada
      else timers.delete(id)
      try { typeof x.fn === 'function' ? x.fn(...x.args) : (0, eval)(x.fn) } catch (e) { console.error('timer', e) }
    }
    now = t
  }
  // animaciones: se pausan al aparecer y se ponen en el tiempo virtual
  const vistas = new WeakMap()
  const svgs = new WeakMap()
  function animaciones() {
    for (const an of document.getAnimations()) {
      let s = vistas.get(an)
      if (!s) { s = { t0: now }; vistas.set(an, s); try { an.pause() } catch {} }
      try { an.currentTime = now - s.t0 } catch {}
    }
    for (const svg of document.querySelectorAll('svg')) {
      if (svg.ownerSVGElement) continue
      let s = svgs.get(svg)
      if (s == null) { s = now; svgs.set(svg, s); try { svg.pauseAnimations() } catch {} }
      try { svg.setCurrentTime((now - s) / 1000) } catch {}
    }
  }
  // el dedo: un círculo como el de las grabaciones de pantalla del iPhone
  const dedo = { x: 0, y: 0, abajo: false, v: 0, toque: -1e9, tx: 0, ty: 0 }
  addEventListener('pointerdown', (e) => { dedo.abajo = true; dedo.x = e.clientX; dedo.y = e.clientY; dedo.toque = now; dedo.tx = e.clientX; dedo.ty = e.clientY }, true)
  addEventListener('pointermove', (e) => { dedo.x = e.clientX; dedo.y = e.clientY }, true)
  addEventListener('pointerup', (e) => { dedo.abajo = false; dedo.x = e.clientX; dedo.y = e.clientY }, true)
  let el = null, onda = null
  function pintarDedo(dt) {
    if (!document.body) return
    if (!el) {
      el = document.createElement('div')
      el.style.cssText = 'position:fixed;left:0;top:0;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(255,255,255,.5);border:2.5px solid #fff;box-shadow:0 0 0 1.5px rgba(12,43,28,.45);pointer-events:none;z-index:2147483647;opacity:0;transition:none'
      onda = document.createElement('div')
      onda.style.cssText = 'position:fixed;left:0;top:0;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:2.5px solid rgba(255,255,255,.95);box-shadow:0 0 0 1px rgba(12,43,28,.3);pointer-events:none;z-index:2147483646;opacity:0;transition:none'
      document.body.append(onda, el)
    }
    if (window.__dedoApagado) { el.style.opacity = 0; onda.style.opacity = 0; return }
    const obj = dedo.abajo ? 1 : 0
    dedo.v += (obj - dedo.v) * Math.min(1, dt / (dedo.abajo ? 0.06 : 0.14))
    const k = 0.7 + 0.3 * dedo.v
    el.style.opacity = dedo.v.toFixed(3)
    el.style.transform = `translate(${dedo.x}px,${dedo.y}px) scale(${k.toFixed(3)})`
    const u = (now - dedo.toque) / 450
    if (u >= 0 && u <= 1) {
      onda.style.opacity = (0.8 * (1 - u)).toFixed(3)
      onda.style.transform = `translate(${dedo.tx}px,${dedo.ty}px) scale(${(1 + u * 1.4).toFixed(3)})`
    } else onda.style.opacity = 0
  }
  window.__vt = {
    get now() { return now },
    paso(ms) {
      timersHasta(now + ms)
      const q = rafQ
      rafQ = []
      for (const r of q) { try { r.fn(now) } catch (e) { console.error('raf', e) } }
      pintarDedo(ms / 1000)
      animaciones()
    },
  }
})()
