// Jugadas para el rodaje: tirar como una persona (dedo en la pelota, tira para atrás, acomoda, suelta).
const suave = (u) => 0.5 - 0.5 * Math.cos(Math.PI * u)
const sale = (u) => 1 - Math.pow(1 - u, 3)

async function trazo(r, x1, y1, s, ease = suave) {
  const x0 = r.mouse.x, y0 = r.mouse.y
  const k = Math.max(1, Math.round(s * 30))
  for (let i = 1; i <= k; i++) { const u = ease(i / k); await r.mover(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u); await r.cuadro() }
}
const est = (r) => r.page.evaluate(() => __bot.estado())

/** espera a poder apuntar (cámara quieta) */
async function aApuntar(r, pausa = 0.7, tope = 60) {
  await r.hasta(() => __J.estado === 'apuntar' && !__J.anim, null, tope)
  await r.seg(pausa)
  // la cámara quieta (si no, el ángulo del gesto cambia mientras se tira)
  await r.hasta(() => { const c = __J.cam, o = __J.obj; return Math.abs(Math.atan2(Math.sin(c.rot - o.rot), Math.cos(c.rot - o.rot))) < 0.0015 && Math.abs(c.esc - o.esc) / o.esc < 0.01 && Math.hypot(c.cx - o.cx, c.cy - o.cy) < 0.3 }, null, 6)
}

/** un tiro entero. op: elegir (opciones del bot), sobre (cuánto se pasa al tirar), mantener (s), pausa */
async function tirar(r, op = {}) {
  // con los monos viniendo no hay tiempo: se apura (llegan en 3 s como mínimo)
  const apuro = (await r.page.evaluate(() => __J.ronda.monos.some((s) => s.modo === 'caza'))) && !op.sinApuro
  if (apuro) op = { ...op, pausa: 0.1, tirar: 0.3, mantener: Math.min(op.mantener ?? 0.15, 0.15) }
  await aApuntar(r, op.pausa ?? 0.7)
  const t = op.tiro ?? (await r.page.evaluate((o) => __bot.elegir(o), { viento: true, ...(op.elegir || {}) }))
  const g = await r.page.evaluate(([a, p, pu]) => __bot.gesto(a, p, pu), [t.ang, t.p, t.putt])
  const sobre = op.sobre ?? (t.putt ? 1.15 : 1.12)
  await r.bajar(g.x0, g.y0)
  await r.seg(0.12)
  await trazo(r, g.x0 + (g.x1 - g.x0) * sobre, g.y0 + (g.y1 - g.y0) * sobre, op.tirar ?? 0.6, sale)
  await trazo(r, g.x1, g.y1, 0.3)
  const hab = await r.page.evaluate(() => __J.M.habilidadDe(__J.ronda.jugador)?.id)
  const info = await r.page.evaluate(() => { const a = __J.apunte(); return a ? { bomba: !!a.plan.bomba, aguila: !!a.plan.aguila } : {} })
  if (info.bomba) {
    await r.seg(0.5)
    for (let i = 0; i < 90; i++) {
      const q = await r.page.evaluate(() => __J.apunte()?.q ?? 0)
      if (q >= 0.97) break
      if (q > 0.85) { await r.micro(8); continue }
      await r.cuadro()
    }
  } else if (info.aguila) {
    await r.seg(apuro ? 0.05 : op.mantener ?? 0.9)
    for (let i = 0; i < 400; i++) {
      const d = await r.page.evaluate(() => __J.apunte()?.plan.aguila?.desvio ?? 99)
      if (Math.abs(d) <= (op.ventana ?? 1.5)) break
      await r.micro(3)
      if (i % 11 === 10) await r.cuadro()
    }
  } else await r.seg(op.mantener ?? 0.35)
  const ap = await r.page.evaluate(() => { const a = __J.apunte(); return a ? { p: +a.p.toFixed(3), q: +(a.q || 0).toFixed(2), destino: a.destino.map((v) => +v.toFixed(1)), perfecta: a.plan.perfecta, enVentana: a.plan.aguila?.enVentana } : null })
  await r.subir()
  r.marca('golpe', { esperado: t.pos?.map((v) => +v.toFixed(1)), ...ap })
  return t
}

/** espera que termine el tiro (pelota quieta y lo que siga: monos, perro, banda) */
async function esperarTiro(r, tope = 20) {
  await r.hasta(() => __J.estado !== 'tiro', null, tope)
  const e = await est(r)
  r.marca('quieta', e)
  return e
}

module.exports = { trazo, tirar, aApuntar, esperarTiro, est, suave, sale }
