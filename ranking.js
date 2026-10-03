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

/** Todas las marcas: las del grupo si hay Supabase; si no (o si falla la conexión), las de este teléfono. */
export async function leerMarcas() {
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
  if (!compartido()) return { ok: true, compartido: false }
  try {
    const res = await fetch(`${SUPABASE.url}/rest/v1/${SUPABASE.tabla}`, { method: 'POST', headers: { ...cabeceras(), Prefer: 'return=minimal' }, body: JSON.stringify(aFila(m)) })
    return { ok: res.ok, compartido: true }
  } catch {
    return { ok: false, compartido: true }
  }
}
