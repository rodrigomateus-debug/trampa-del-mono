// Dónde se guardan las marcas del ranking (el orden y el armado están en motor.js: armarRanking).
// Sin SUPABASE completo quedan en este teléfono. Para que sea del grupo: correr supabase.sql en el
// proyecto y completar url + anonKey (la anon key es pública; la tabla solo deja leer y anotar).
export const SUPABASE = { url: '', anonKey: '', tabla: 'trampa_marcas' }
export const compartido = () => !!(SUPABASE.url && SUPABASE.anonKey)

const CLAVE = 'sdga-trampa-marcas-v1'
function locales() {
  try { return JSON.parse(localStorage.getItem(CLAVE)) || [] } catch { return [] }
}
function guardarLocal(m) {
  try { localStorage.setItem(CLAVE, JSON.stringify([...locales(), m].slice(-500))) } catch {}
}

const cabeceras = () => ({ apikey: SUPABASE.anonKey, Authorization: `Bearer ${SUPABASE.anonKey}`, 'Content-Type': 'application/json' })
const aFila = (m) => ({ usuario: m.usuario, apodo: m.apodo, emoji: m.emoji, golpes: m.golpes, vs_par: m.vsPar, ms: m.ms })
const deFila = (f) => ({ usuario: f.usuario, apodo: f.apodo, emoji: f.emoji, golpes: f.golpes, vsPar: f.vs_par, ms: f.ms, fecha: f.creado })

// ── adentro de la SDGApp ─────────────────────────────────────────────────────
// La app abre el juego en un iframe y le habla por postMessage: le pasa quién juega (su login de
// Google: socio del SDGA o jugador de afuera) y guarda las marcas en SU base. El juego nunca ve una
// clave ni un token: pide y anota, y la app contesta. Sin app (GitHub Pages suelto), todo sigue igual.
//   juego → app: trampa:hola · trampa:leer {id} · trampa:anotar {id, marca} · trampa:cerrar
//   app → juego: sdga:identidad {uid, alias, sdga} · sdga:marcas {id, marcas, error} · sdga:anotada {id, ok}
export const puente = { activo: false, identidad: null }
const enMarco = typeof window !== 'undefined' && window.parent !== window
let origenApp = null
const esperando = new Map()
let pedidos = 0
const alEntrarCbs = []
/** Avisa cuando la app dijo quién juega (una vez). Si ya lo dijo, avisa enseguida. */
export function alEntrar(cb) {
  if (puente.activo) cb(puente.identidad)
  else alEntrarCbs.push(cb)
}
if (enMarco) {
  window.addEventListener('message', (e) => {
    if (e.source !== window.parent || !e.data || typeof e.data !== 'object') return
    const d = e.data
    if (d.tipo === 'sdga:identidad' && d.uid && d.alias) {
      origenApp = e.origin
      const nueva = !puente.activo
      puente.activo = true
      puente.identidad = { uid: String(d.uid), alias: String(d.alias).slice(0, 24), sdga: !!d.sdga }
      if (nueva) alEntrarCbs.splice(0).forEach((cb) => cb(puente.identidad))
    } else if ((d.tipo === 'sdga:marcas' || d.tipo === 'sdga:anotada') && esperando.has(d.id)) {
      esperando.get(d.id)(d)
      esperando.delete(d.id)
    }
  })
  window.parent.postMessage({ tipo: 'trampa:hola', v: 1 }, '*')
}
function pedirApp(tipo, datos = {}) {
  const id = `p${++pedidos}`
  return new Promise((ok) => {
    const t = setTimeout(() => { esperando.delete(id); ok(null) }, 10000)
    esperando.set(id, (d) => { clearTimeout(t); ok(d) })
    window.parent.postMessage({ tipo, id, ...datos }, origenApp)
  })
}
/** El botón "volver a la SDGApp". */
export const volverALaApp = () => { if (origenApp) window.parent.postMessage({ tipo: 'trampa:cerrar' }, origenApp) }

/** Todas las marcas: las del grupo si hay Supabase; si no (o si falla la conexión), las de este teléfono. */
export async function leerMarcas() {
  if (puente.activo) {
    const r = await pedirApp('trampa:leer')
    if (!r || r.error || !Array.isArray(r.marcas)) return { marcas: locales(), compartido: false, error: true }
    return { marcas: r.marcas, compartido: true, app: true }
  }
  if (!compartido()) return { marcas: locales(), compartido: false }
  try {
    const url = `${SUPABASE.url}/rest/v1/${SUPABASE.tabla}?select=usuario,apodo,emoji,golpes,vs_par,ms,creado&order=golpes.asc,ms.asc&limit=2000`
    const res = await fetch(url, { headers: cabeceras() })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return { marcas: (await res.json()).map(deFila), compartido: true }
  } catch {
    return { marcas: locales(), compartido: false, error: true }
  }
}

/** Anota una vuelta firmada (siempre queda también en el teléfono). */
export async function anotar(marca) {
  const m = { ...marca, fecha: new Date().toISOString() }
  guardarLocal(m)
  if (puente.activo) {
    const r = await pedirApp('trampa:anotar', { marca: { apodo: m.apodo, emoji: m.emoji, golpes: m.golpes, vsPar: m.vsPar, ms: m.ms } })
    return { ok: !!r?.ok, compartido: true }
  }
  if (!compartido()) return { ok: true, compartido: false }
  try {
    const res = await fetch(`${SUPABASE.url}/rest/v1/${SUPABASE.tabla}`, { method: 'POST', headers: { ...cabeceras(), Prefer: 'return=minimal' }, body: JSON.stringify(aFila(m)) })
    return { ok: res.ok, compartido: true }
  } catch {
    return { ok: false, compartido: true }
  }
}
