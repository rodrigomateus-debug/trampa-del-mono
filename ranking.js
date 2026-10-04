// Dónde se guardan las marcas del ranking (el orden y el armado están en motor.js: armarRanking).
//
// UN SOLO RANKING, el de la SDGApp (FedE Cup): tabla `trampa_marcas` + vista `trampa_ranking` en su
// Supabase (ver supabase/migration.sql del repo patmig124/FEDECUP). Se llega por dos lados:
//   · Adentro de la app (iframe): la app dice quién juega y guarda las vueltas (puente postMessage).
//   · Suelto (GitHub Pages / instalado): entrás con Google contra el MISMO Supabase. Es la misma cuenta
//     que en la app: si ya elegiste tu jugador allá, acá sos ese jugador y entrás al ranking SDGA.
// Sin la anon key cargada (o sin conexión), las vueltas quedan en este teléfono, como antes.
export const SUPABASE = {
  url: 'https://zibtxqzhecpgbrezsmgi.supabase.co',
  anonKey: '', // la anon/publishable key de la app (es pública por diseño; la misma que VITE_SUPABASE_ANON_KEY)
}
export const compartido = () => !!(SUPABASE.url && SUPABASE.anonKey)

const CLAVE = 'sdga-trampa-marcas-v1'
function locales() {
  try { return JSON.parse(localStorage.getItem(CLAVE)) || [] } catch { return [] }
}
function guardarLocal(m) {
  try { localStorage.setItem(CLAVE, JSON.stringify([...locales(), m].slice(-500))) } catch {}
}
const leerLS = (k) => { try { return JSON.parse(localStorage.getItem(k)) } catch { return null } }
const escribirLS = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)) } catch {} }

// ── quién juega ──────────────────────────────────────────────────────────────
// `puente.identidad` = { uid, alias, sdga } venga de la app (iframe) o del login propio (suelto).
// `puente.enApp` = adentro de la SDGApp (las vueltas las guarda la app; hay "volver a la app").
export const puente = { activo: false, enApp: false, identidad: null }
const alEntrarCbs = []
/** Avisa cuando se sabe quién juega (una vez). Si ya se sabe, avisa enseguida. */
export function alEntrar(cb) {
  if (puente.activo) cb(puente.identidad)
  else alEntrarCbs.push(cb)
}
function entro(identidad, enApp) {
  const nueva = !puente.activo
  puente.activo = true
  puente.enApp = enApp
  puente.identidad = identidad
  if (nueva) alEntrarCbs.splice(0).forEach((cb) => cb(identidad))
}

/** Nombre + inicial del apellido de la cuenta de Google ("Juan G."), igual que la app. */
export function aliasDeGoogle(meta, email) {
  const completo = String(meta?.full_name || meta?.name || '').trim()
  const nombre = String(meta?.given_name || completo.split(/\s+/)[0] || '').trim()
  const apellido = String(meta?.family_name || completo.split(/\s+/).slice(1).join(' ') || '').trim()
  const recortar = (s) => s.trim().replace(/\s+/g, ' ').slice(0, 24)
  if (nombre) return recortar(apellido ? `${nombre} ${apellido.charAt(0).toUpperCase()}.` : nombre)
  return recortar(String(email ?? '').split('@')[0] ?? '') || 'Jugador'
}

// ── adentro de la SDGApp ─────────────────────────────────────────────────────
// La app abre el juego en un iframe y le habla por postMessage. El juego nunca ve una clave ni un token.
//   juego → app: trampa:hola · trampa:leer {id} · trampa:anotar {id, marca} · trampa:cerrar
//   app → juego: sdga:identidad {uid, alias, sdga, match?} · sdga:marco {top, bottom} · sdga:marcas {id, marcas, error} · sdga:anotada {id, ok}
//   el match: juego → app trampa:match {id, accion, datos} · app → juego sdga:match {id, ok, datos} (ver más abajo)
const enMarco = typeof window !== 'undefined' && window.parent !== window
let origenApp = null
const esperando = new Map()
let pedidos = 0
if (enMarco) {
  window.addEventListener('message', (e) => {
    if (e.source !== window.parent || !e.data || typeof e.data !== 'object') return
    const d = e.data
    if (d.tipo === 'sdga:identidad' && d.uid && d.alias) {
      origenApp = e.origin
      entro({ uid: String(d.uid), alias: String(d.alias).slice(0, 24), sdga: !!d.sdga, match: d.match === true }, true)
    } else if (d.tipo === 'sdga:marco') {
      // los bordes seguros del teléfono (adentro del iframe env() da 0): el juego va de borde a borde
      origenApp ??= e.origin
      const px = (n) => `${Math.max(0, Math.min(80, Number(n) || 0))}px`
      document.documentElement.style.setProperty('--safe-top', px(d.top))
      document.documentElement.style.setProperty('--safe-bot', px(d.bottom))
    } else if ((d.tipo === 'sdga:marcas' || d.tipo === 'sdga:anotada' || d.tipo === 'sdga:conteo' || d.tipo === 'sdga:match') && esperando.has(d.id)) {
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
/** Un aviso suelto a la app (p. ej. el color de arriba de la pantalla, para teñir la barra de estado). */
export const avisarApp = (d) => { if (origenApp) window.parent.postMessage(d, origenApp) }

/** El link para abrir el match: adentro de la app, la pantalla del juego de la app (la misma base: dev o producción); suelto, el juego. */
export const linkMatch = () => (origenApp ? `${origenApp}/#/juegos/trampa?match=1` : `${location.origin}${location.pathname}?match=1`)

/** El botón "volver a la SDGApp". */
export const volverALaApp = () => { if (origenApp) window.parent.postMessage({ tipo: 'trampa:cerrar' }, origenApp) }

// ── suelto: login con Google contra el Supabase de la app (OAuth PKCE, sin librerías) ─────────
const SESION = 'sdga-trampa-sesion-v1'
const PKCE = 'sdga-trampa-pkce-v1'
let sesion = leerLS(SESION)

/** ¿El juego suelto pide login? (con la key cargada y fuera de la app) */
export const pideLogin = () => compartido() && !enMarco

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const aquiMismo = () => location.origin + location.pathname

/** Te manda a Google (vía Supabase) y vuelve acá con `?code=`. */
export async function entrarConGoogle() {
  if (!compartido()) return
  const verificador = b64url(crypto.getRandomValues(new Uint8Array(48)))
  const desafio = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verificador))))
  escribirLS(PKCE, verificador)
  const q = new URLSearchParams({ provider: 'google', redirect_to: aquiMismo(), code_challenge: desafio, code_challenge_method: 's256' })
  location.assign(`${SUPABASE.url}/auth/v1/authorize?${q}`)
}

export function salir() {
  const tk = sesion?.access_token
  sesion = null
  escribirLS(SESION, null)
  if (tk) fetch(`${SUPABASE.url}/auth/v1/logout`, { method: 'POST', headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${tk}` } }).catch(() => {})
  location.reload()
}

async function pedirToken(tipo, cuerpo) {
  const res = await fetch(`${SUPABASE.url}/auth/v1/token?grant_type=${tipo}`, {
    method: 'POST',
    headers: { apikey: SUPABASE.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  })
  if (!res.ok) throw new Error(`auth ${res.status}`)
  const s = await res.json()
  sesion = { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at ?? Math.floor(Date.now() / 1000) + (s.expires_in ?? 3600), user: s.user }
  escribirLS(SESION, sesion)
  return sesion
}

/** Un token vigente (lo renueva si está por vencer), o null si no hay sesión. */
async function token() {
  if (!sesion) return null
  if (sesion.expires_at - Date.now() / 1000 > 60) return sesion.access_token
  try {
    return (await pedirToken('refresh_token', { refresh_token: sesion.refresh_token })).access_token
  } catch {
    sesion = null
    escribirLS(SESION, null)
    return null
  }
}

const cabeceras = (tk) => ({ apikey: SUPABASE.anonKey, Authorization: `Bearer ${tk || SUPABASE.anonKey}`, 'Content-Type': 'application/json' })

/**
 * Al abrir suelto: canjea el `?code=` si vuelve de Google y averigua quién sos. Crea/toca tu fila de
 * `users` como hace la app (es la misma cuenta): si tenés jugador, jugás con su nombre y sos SDGA.
 */
async function arrancarSuelto() {
  if (!pideLogin()) return
  const url = new URL(location.href)
  const code = url.searchParams.get('code')
  if (code) {
    url.searchParams.delete('code')
    history.replaceState(null, '', url.pathname + url.search + url.hash)
    const verificador = leerLS(PKCE)
    escribirLS(PKCE, null)
    if (verificador) await pedirToken('pkce', { auth_code: code, code_verifier: verificador }).catch(() => null)
  }
  const tk = await token()
  if (!tk || !sesion?.user?.id) return
  const u = sesion.user
  let jugador = null
  try {
    const res = await fetch(`${SUPABASE.url}/rest/v1/users?on_conflict=id&select=player_id,player:players(name)`, {
      method: 'POST',
      headers: { ...cabeceras(tk), Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ id: u.id, email: u.email ?? '', last_seen_at: new Date().toISOString() }),
    })
    if (res.ok) jugador = (await res.json())?.[0]?.player?.name ?? null
  } catch {}
  entro({ uid: u.id, alias: (jugador ?? aliasDeGoogle(u.user_metadata, u.email)).slice(0, 24), sdga: !!jugador }, false)
}
/** Se resuelve cuando ya se sabe si hay sesión (suelto) — para no mostrar "Entrar" de más. */
export const listo = arrancarSuelto().catch(() => {})

// ── leer y anotar ────────────────────────────────────────────────────────────
const deVista = (f) => ({ uid: f.user_id, usuario: f.player_name ?? f.alias, apodo: f.apodo, emoji: f.emoji, golpes: f.golpes, vsPar: f.vs_par, ms: f.ms, fecha: f.created_at, sdga: f.sdga === true })

/** Todas las marcas: las de la SDGApp (por la app o directo); si no se puede, las de este teléfono. */
export async function leerMarcas() {
  if (puente.enApp) {
    const r = await pedirApp('trampa:leer')
    if (!r || r.error || !Array.isArray(r.marcas)) return { marcas: locales(), compartido: false, error: true }
    return { marcas: r.marcas, compartido: true, app: true }
  }
  if (!compartido()) return { marcas: locales(), compartido: false }
  try {
    const q = 'select=user_id,alias,apodo,emoji,golpes,vs_par,ms,created_at,player_name,sdga&order=created_at.desc&limit=5000'
    const res = await fetch(`${SUPABASE.url}/rest/v1/trampa_ranking?${q}`, { headers: cabeceras(await token()) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return { marcas: (await res.json()).map(deVista), compartido: true, app: true }
  } catch {
    return { marcas: locales(), compartido: false, error: true }
  }
}

/** Anota una vuelta firmada (siempre queda también en el teléfono). */
export async function anotar(marca) {
  const m = { ...marca, fecha: new Date().toISOString() }
  guardarLocal(m)
  if (puente.enApp) {
    const r = await pedirApp('trampa:anotar', { marca: { apodo: m.apodo, emoji: m.emoji, golpes: m.golpes, vsPar: m.vsPar, ms: m.ms } })
    return { ok: !!r?.ok, compartido: true }
  }
  const tk = compartido() ? await token() : null
  if (!tk || !puente.identidad) return { ok: true, compartido: false }
  try {
    const res = await fetch(`${SUPABASE.url}/rest/v1/trampa_marcas`, {
      method: 'POST',
      headers: { ...cabeceras(tk), Prefer: 'return=minimal' },
      body: JSON.stringify({ user_id: puente.identidad.uid, alias: puente.identidad.alias, apodo: m.apodo, emoji: m.emoji, golpes: m.golpes, vs_par: m.vsPar, ms: m.ms }),
    })
    return { ok: res.ok, compartido: true }
  } catch {
    return { ok: false, compartido: true }
  }
}

// ── el conteo: cuántas vueltas se jugaron y cuántas fueron LP ──────────────────
// Cuenta TODA vuelta que llega a la tarjeta final (firmada o no, LP incluido). Siempre en el teléfono;
// con la SDGApp (o logueado suelto), también en `trampa_vueltas` y se lee el conteo de todos de la
// vista `trampa_conteo` (user_id, apodo, jugadas, lps).
const CONTEO = 'sdga-trampa-conteo-v1'
/** Lo de este teléfono: { jugadas, lps, por: { [apodo]: { jugadas, lps } } } */
export function conteoLocal() {
  const c = leerLS(CONTEO)
  return c && typeof c === 'object' ? { jugadas: c.jugadas | 0, lps: c.lps | 0, por: c.por ?? {} } : { jugadas: 0, lps: 0, por: {} }
}
export async function contarVuelta({ apodo, lp }) {
  const c = conteoLocal()
  const p = (c.por[apodo] ??= { jugadas: 0, lps: 0 })
  c.jugadas++, p.jugadas++
  if (lp) c.lps++, p.lps++
  escribirLS(CONTEO, c)
  if (puente.enApp) return avisarApp({ tipo: 'trampa:vuelta', vuelta: { apodo, lp: !!lp } }) // sin respuesta
  const tk = compartido() ? await token() : null
  if (!tk || !puente.identidad) return
  fetch(`${SUPABASE.url}/rest/v1/trampa_vueltas`, {
    method: 'POST',
    headers: { ...cabeceras(tk), Prefer: 'return=minimal' },
    body: JSON.stringify({ user_id: puente.identidad.uid, apodo, lp: !!lp }),
  }).catch(() => {})
}
/** El conteo de todos (filas por usuario y player), o null si no hay base. */
export async function leerConteo() {
  if (puente.enApp) {
    const r = await pedirApp('trampa:conteo')
    return r && !r.error && Array.isArray(r.filas) ? r.filas : null
  }
  if (!compartido()) return null
  try {
    const res = await fetch(`${SUPABASE.url}/rest/v1/trampa_conteo?select=user_id,apodo,jugadas,lps`, { headers: cabeceras(await token()) })
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

// ── el match: desafíos ─────────────────────────────────────────────────────────
// Tabla `trampa_desafios` (una fila por desafío) y vista `trampa_rivales` (a quién se puede desafiar), en el
// Supabase de la app. Adentro de la app va todo por el puente (`trampa:match` con una `accion`); suelto, directo.
const COLS_DESAFIO = 'id,retador_id,retador_alias,retador_apodo,retador_emoji,retador_golpes,retador_vs_par,retador_ms,retador_lp,rival_id,rival_alias,rival_apodo,rival_emoji,rival_golpes,rival_vs_par,rival_ms,rival_lp,semilla,estado,created_at,jugado_at'
/** Una fila de la base → el desafío del juego. */
export const deFilaDesafio = (f) => ({
  id: f.id, semilla: Number(f.semilla), estado: f.estado, fecha: f.created_at, jugadoFecha: f.jugado_at ?? null,
  retador: { uid: f.retador_id, alias: f.retador_alias, apodo: f.retador_apodo, emoji: f.retador_emoji, golpes: f.retador_golpes, vsPar: f.retador_vs_par, ms: f.retador_ms, lp: !!f.retador_lp },
  rival: { uid: f.rival_id, alias: f.rival_alias, apodo: f.rival_apodo ?? null, emoji: f.rival_emoji ?? null, golpes: f.rival_golpes ?? null, vsPar: f.rival_vs_par ?? null, ms: f.rival_ms ?? null, lp: !!f.rival_lp },
})
/** ¿Se puede jugar el match? Adentro de la app, solo si la app lo anuncia (`match: true` en la identidad: hoy, la de dev);
 *  suelto, con la base y la sesión. */
export const hayMatch = () => (puente.enApp ? !!puente.identidad?.match : compartido() && !!puente.identidad)

async function rest(ruta, { metodo = 'GET', cuerpo, prefer } = {}) {
  const tk = await token()
  if (!tk) throw new Error('sin sesión')
  const res = await fetch(`${SUPABASE.url}/rest/v1/${ruta}`, {
    method: metodo,
    headers: { ...cabeceras(tk), ...(prefer ? { Prefer: prefer } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.status === 204 ? null : res.json()
}
async function porApp(accion, datos) {
  const r = await pedirApp('trampa:match', { accion, datos })
  if (!r || !r.ok) throw new Error(r?.error || 'sin respuesta de la app')
  return r.datos
}

/** A quién se puede desafiar: [{ uid, nombre, sdga }] (sin vos). */
export async function leerRivales() {
  const filas = puente.enApp ? await porApp('rivales') : await rest('trampa_rivales?select=user_id,nombre,sdga&order=nombre')
  const yo = puente.identidad?.uid
  return (filas ?? []).map((f) => ({ uid: f.user_id ?? f.uid, nombre: f.nombre, sdga: !!f.sdga })).filter((f) => f.uid && f.uid !== yo)
}
/** Manda un desafío ya jugado (con la grabación del fantasma). Devuelve el id. */
export async function crearDesafio({ rival, semilla, apodo, emoji, golpes, vsPar, ms, lp, fantasma }) {
  const yo = puente.identidad
  const datos = { rivalId: rival.uid, rivalAlias: rival.nombre, semilla, apodo, emoji, golpes, vsPar, ms, lp: !!lp, fantasma }
  if (puente.enApp) return (await porApp('desafiar', datos))?.id ?? null
  const fila = {
    retador_id: yo.uid, retador_alias: yo.alias, retador_apodo: apodo, retador_emoji: emoji, retador_golpes: golpes, retador_vs_par: vsPar, retador_ms: ms, retador_lp: !!lp,
    rival_id: rival.uid, rival_alias: rival.nombre, semilla, fantasma,
  }
  const r = await rest('trampa_desafios?select=id', { metodo: 'POST', cuerpo: fila, prefer: 'return=representation' })
  return r?.[0]?.id ?? null
}
/** Mis desafíos (los que hice y los que me hicieron), sin la grabación. */
export async function leerDesafios() {
  if (puente.enApp) return ((await porApp('desafios')) ?? []).map(deFilaDesafio)
  const uid = puente.identidad?.uid
  const filas = await rest(`trampa_desafios?select=${COLS_DESAFIO}&or=(retador_id.eq.${uid},rival_id.eq.${uid})&order=created_at.desc&limit=100`)
  return (filas ?? []).map(deFilaDesafio)
}
/** La grabación del que desafió, para jugar con su fantasma. */
export async function leerFantasma(id) {
  if (puente.enApp) return (await porApp('fantasma', { desafioId: id })) ?? null
  const filas = await rest(`trampa_desafios?select=fantasma&id=eq.${encodeURIComponent(id)}`)
  return filas?.[0]?.fantasma ?? null
}
/** El desafiado jugó: anota su vuelta y el match queda cerrado. */
export async function responderDesafio(id, { apodo, emoji, golpes, vsPar, ms, lp }) {
  const datos = { desafioId: id, apodo, emoji, golpes, vsPar, ms, lp: !!lp }
  if (puente.enApp) { await porApp('responder', datos); return true }
  const uid = puente.identidad?.uid
  await rest(`trampa_desafios?id=eq.${encodeURIComponent(id)}&rival_id=eq.${uid}&estado=eq.pendiente`, {
    metodo: 'PATCH', prefer: 'return=minimal',
    cuerpo: { rival_apodo: apodo, rival_emoji: emoji, rival_golpes: golpes, rival_vs_par: vsPar, rival_ms: ms, rival_lp: !!lp, estado: 'jugado', jugado_at: new Date().toISOString() },
  })
  return true
}

