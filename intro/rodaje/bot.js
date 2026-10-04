// El bot del rodaje (corre en la página): elige el tiro como calibrar.mjs y lo pasa a un gesto en la pantalla.
window.__bot = (() => {
  const J = window.__J
  const M = J.M
  const campo = J.campo
  const vacio = { ...campo, hoyos: M.HOYOS.map((h) => ({ ...h, monos: [] })) }
  const calma = { ang: 0, kmh: 0 }
  const sinRuido = () => { let i = 0; return () => (i++ % 2 ? 0.25 : 0.5) }
  function probar(r, ang, p, q, tiempo, conViento) {
    const rr = { ...r, pelota: [...r.pelota], monos: [], viento: conViento ? r.viento : calma }
    const tiro = M.golpear(vacio, rr, ang, p, sinRuido(), q, tiempo)
    return M.simular(vacio, tiro, M.hoyoActual(r).pin)
  }
  function costo(r, t, objetivo) {
    if (objetivo) return M.dist(t.pos, objetivo.punto) + (objetivo.tipo && M.terreno(campo, t.pos).tipo !== objetivo.tipo ? 60 : 0)
    if (t.embocada) return -1e6
    const h = M.hoyoActual(r)
    const ter = M.terreno(campo, t.pos)
    const d = M.dist(t.pos, h.pin)
    const castigo = { afuera: 90, bosque: 45, bunker: 14, rough: 7 }[ter.tipo] ?? 0
    return (ter.tipo === 'green' && ter.hoyo === h.n ? d * 0.5 : d) + castigo
  }
  /** opciones: { objetivo: {punto, tipo}, viento: bool, corto: yardas (putt que queda corto), pMax } */
  function elegir(op = {}) {
    const r = J.ronda
    const h = M.hoyoActual(r)
    const base = Math.atan2(h.pin[1] - r.pelota[1], h.pin[0] - r.pelota[0])
    const hab = M.habilidadDe(r.jugador)
    const putt = M.enModoPutt(campo, r)
    let mejor = null
    if (putt && !op.objetivo) {
      const abre = hab?.id === 'comba' ? 26 : 3
      const paso = hab?.id === 'comba' ? 1 : 0.5
      const d = M.dist(r.pelota, h.pin)
      const pMax = Math.min(1, Math.sqrt(d / M.FISICA.distPuttMax) * 1.6 + 0.05)
      for (let g = -abre; g <= abre; g += paso) {
        for (let p = 0.01; p <= pMax; p += 0.004) {
          const t = probar(r, base + (g * Math.PI) / 180, p, 0, 0, op.viento)
          let c
          if (op.corto != null) c = t.embocada ? 1e6 : Math.abs(M.dist(t.pos, h.pin) - op.corto) + Math.abs(g) * 0.01
          else c = t.embocada ? -1e6 + Math.abs(p - 0.3) : M.dist(t.pos, h.pin)
          if (!mejor || c < mejor.c) mejor = { c, ang: base + (g * Math.PI) / 180, p, pos: t.pos, embocada: t.embocada }
        }
        if (mejor?.c < -1e5 && hab?.id !== 'comba') break
      }
      return { ...mejor, putt: true }
    }
    const abre = op.abre ?? (hab?.id === 'comba' ? 60 : 30)
    const pMax = op.pMax ?? 1.0001
    for (let g = -abre; g <= abre; g += op.pasoG ?? 1.5) {
      for (let p = op.pMin ?? 0.12; p <= pMax; p += 0.025) {
        const t = probar(r, base + (g * Math.PI) / 180, p, 1, 0, op.viento)
        const c = costo(r, t, op.objetivo)
        if (!mejor || c < mejor.c) mejor = { c, ang: base + (g * Math.PI) / 180, p, pos: t.pos, embocada: t.embocada }
      }
    }
    return { ...mejor, putt: putt }
  }
  /** el gesto en pantalla para (ang, p): desde la pelota, para atrás */
  function gesto(ang, p, putt) {
    const rot = J.cam.rot
    const d = [Math.cos(ang + rot), Math.sin(ang + rot)]
    const [bx, by] = J.w2s(J.ronda.pelota)
    const largo = Math.max(90, Math.min(J.largoMax(), J.H - by - 14))
    const len = largo * Math.pow(Math.min(1, p), 1 / (putt ? 1.6 : 1.35))
    return { x0: bx, y0: by, x1: bx - d[0] * len, y1: by - d[1] * len, len, largo }
  }
  function estado() {
    const r = J.ronda
    if (!r) return { estado: J.estado }
    const h = r.terminada ? null : M.hoyoActual(r)
    return {
      estado: J.estado, hoyo: h?.n, golpes: r.golpes, lie: r.lie, pelota: r.pelota.map((v) => +v.toFixed(1)),
      alPin: h ? +(M.dist(r.pelota, h.pin) * h.escala).toFixed(1) : null, tarjeta: r.tarjeta.map((f) => f.golpes),
      cazan: r.monos.filter((s) => s.modo === 'caza').length, viento: r.viento.kmh, terminada: r.terminada,
      anim: J.anim?.tipo ?? null, calma: !!r.calma, golpeMago: r.golpeMago,
      pant: J.w2s(r.pelota).map((v) => Math.round(v)),
      pantAnim: J.anim?.desde ? J.w2s(J.anim.desde).map((v) => Math.round(v)) : J.anim?.mono ? J.w2s(J.anim.mono.pos).map((v) => Math.round(v)) : null,
      esc: +J.cam.esc.toFixed(2),
    }
  }
  return { elegir, gesto, estado, probar }
})()
