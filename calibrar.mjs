// node calibrar.mjs [vueltas] [apodo…] — juega vueltas enteras con un bot por cada jugador del mazo y mide
// la dificultad real (promedio vs. par, % de LP). El bot apunta bien (prueba ángulos y potencias sin error
// ni viento y elige el mejor) pero no compensa el viento, y en las habilidades con timing (el embudo de Fito,
// el latido de Miguelón) acierta a veces, como una persona. Con los monos que salen a cazar, siempre llega a pegar.
import * as M from './motor.js'
import { PLANTEL, EN_PRUEBA } from './plantel.js'

const campo = M.crearCampo()
const vacio = { ...campo, hoyos: M.HOYOS.map((h) => ({ ...h, monos: [] })) }
const calma = { ang: 0, kmh: 0 }
const sinRuido = () => { let i = 0; return () => (i++ % 2 ? 0.25 : 0.5) }

/** Qué tan buena es una posición final (menos es mejor): yardas al hoyo + castigos por lie. */
function costo(r, t) {
  if (t.embocada) return -1e6
  const h = M.hoyoActual(r)
  const ter = M.terreno(campo, t.pos)
  const d = M.dist(t.pos, h.pin)
  const castigo = { afuera: 90, bosque: 45, bunker: 14, rough: 7 }[ter.tipo] ?? 0
  // en el green del hoyo, cada yarda vale menos (se patea)
  return (ter.tipo === 'green' && ter.hoyo === h.n ? d * 0.5 : d) + castigo
}

/** Prueba el tiro sin error ni viento, sobre una copia de la ronda. */
function probar(r, ang, p, q, tiempo) {
  const rr = { ...r, pelota: [...r.pelota], monos: [], viento: calma }
  const tiro = M.golpear(vacio, rr, ang, p, sinRuido(), q, tiempo)
  return M.simular(vacio, tiro, M.hoyoActual(r).pin)
}

function elegirTiro(r) {
  const h = M.hoyoActual(r)
  const base = Math.atan2(h.pin[1] - r.pelota[1], h.pin[0] - r.pelota[0])
  const hab = M.habilidadDe(r.jugador)
  let mejor = null
  if (M.enModoPutt(campo, r)) {
    const abre = hab?.id === 'comba' ? 26 : 3
    const paso = hab?.id === 'comba' ? 1 : 0.5
    const d = M.dist(r.pelota, h.pin)
    const pMax = Math.min(1, Math.sqrt(d / M.FISICA.distPuttMax) * 1.6 + 0.05)
    for (let g = -abre; g <= abre; g += paso) {
      // como una persona: de las fuerzas que entran, la del medio (ni al límite de corta ni de pasada),
      // y la línea con más margen de fuerza
      const entran = []
      for (let p = 0.01; p <= pMax; p += 0.006) {
        const t = probar(r, base + (g * Math.PI) / 180, p, 0, 0)
        if (t.embocada) entran.push(p)
        const c = t.embocada ? -1e6 : M.dist(t.pos, h.pin)
        if (!t.embocada && (!mejor || c < mejor.c)) mejor = { c, ang: base + (g * Math.PI) / 180, p }
      }
      if (entran.length) {
        const c = -1e6 - entran.length
        if (!mejor || c < mejor.c) mejor = { c, ang: base + (g * Math.PI) / 180, p: entran[Math.floor(entran.length / 2)] }
      }
      if (mejor?.c < -1e5 && hab?.id !== 'comba') break
    }
    return mejor
  }
  const abre = hab?.id === 'comba' ? 54 : 27
  for (let g = -abre; g <= abre; g += 3) {
    for (let p = 0.15; p <= 1.0001; p += 0.05) {
      const t = probar(r, base + (g * Math.PI) / 180, p, 1, 0)
      const c = costo(r, t)
      if (!mejor || c < mejor.c) mejor = { c, ang: base + (g * Math.PI) / 180, p }
    }
  }
  return mejor
}

/** Una vuelta entera. Devuelve el total vs. par (null si fue LP) y los golpes por hoyo. */
export function jugarVuelta(jugador, seed) {
  const rng = M.rngDesde(seed)
  const r = M.nuevaRonda(jugador, rng)
  while (!r.terminada) {
    if (M.necesitaLP(r)) { M.levantar(r); break }
    const t = elegirTiro(r)
    // timing humano: Miguelón suelta el latido con precisión entre 0,5 y 1; Fito cae en el embudo la mitad de las veces
    const q = 0.5 + 0.5 * rng()
    const tiempo = rng() < 0.5 ? 0 : rng() * M.AGUILA.periodo
    const tiro = M.simular(campo, M.golpear(campo, r, t.ang, t.p, rng, q, tiempo), M.hoyoActual(r).pin)
    const res = M.resolverReposo(campo, r, tiro, rng)
    if (res.tipo === 'embocada') M.cerrarHoyo(r, rng)
    else M.despertarMonosDe(r), M.calmarMonos(r.monos)
  }
  const t = M.totales(r.tarjeta)
  return { vsPar: t.vsPar, hoyos: r.tarjeta.map((f) => f.golpes) }
}

// ── línea de comandos ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const vueltas = +(process.argv[2] ?? 20)
  const nombres = process.argv.slice(3)
  const lista = PLANTEL.filter((j) => (nombres.length ? nombres.includes(j.apodo) : EN_PRUEBA.includes(j.apodo)))
  for (const j of lista) {
    const res = Array.from({ length: vueltas }, (_, i) => jugarVuelta(j, 1000 + i))
    const ok = res.filter((x) => x.vsPar != null)
    const prom = ok.reduce((s, x) => s + x.vsPar, 0) / (ok.length || 1)
    const mejor = Math.min(...ok.map((x) => x.vsPar))
    const porHoyo = [0, 1, 2].map((k) => (ok.reduce((s, x) => s + x.hoyos[k], 0) / (ok.length || 1)).toFixed(2))
    console.log(JSON.stringify({ apodo: j.apodo, hcp: j.hcp, vueltas, prom: +prom.toFixed(2), mejor, lp: `${Math.round((100 * (vueltas - ok.length)) / vueltas)}%`, porHoyo }))
  }
}
