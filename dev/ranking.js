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
/** Las vueltas firmadas en este teléfono (con el hoyo por hoyo, que la base de la SDGApp no guarda). */
export const marcasDelTelefono = () => locales()
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

// ── los handicaps reales (los de la FedE Cup) ────────────────────────────────
// La app manda el HCP index de cada jugador del club (players.handicap, el que cada uno carga en su perfil).
// Llegan por nombre; el juego los pisa en su plantel (los que no están en la app quedan con el de plantel.js).
/** Normaliza un nombre para cruzar el plantel con los jugadores de la app ("El Ninja (Đ)" = "el ninja (đ)"). */
export const claveNombre = (s) => String(s ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase()
/** Map nombre normalizado → hcp. Descarta lo raro sin tirar: hasta 300 filas, hcp numérico entre -10 y 54. */
export function validarHandicaps(raw) {
  const m = new Map()
  if (!Array.isArray(raw)) return m
  for (const f of raw.slice(0, 300)) {
    const nombre = claveNombre(f?.nombre)
    const hcp = typeof f?.hcp === 'number' ? f.hcp : NaN
    if (nombre && Number.isFinite(hcp) && hcp >= -10 && hcp <= 54) m.set(nombre, Math.round(hcp * 10) / 10)
  }
  return m
}
let plantelApp = null
const alPlantelCbs = []
/** Avisa cada vez que la app manda los handicaps (y enseguida, si ya llegaron). */
export function alPlantel(cb) {
  alPlantelCbs.push(cb)
  if (plantelApp) cb(plantelApp)
}

// ── adentro de la SDGApp ─────────────────────────────────────────────────────
// La app abre el juego en un iframe y le habla por postMessage. El juego nunca ve una clave ni un token.
//   juego → app: trampa:hola · trampa:leer {id} · trampa:anotar {id, marca} · trampa:cerrar
//   app → juego: sdga:identidad {uid, alias, sdga, match?} · sdga:marco {top, bottom} · sdga:marcas {id, marcas, error} · sdga:anotada {id, ok}
//   el match: juego → app trampa:match {id, accion, datos} · app → juego sdga:match {id, ok, datos} (ver más abajo)
//   los handicaps: app → juego sdga:plantel {handicaps: [{nombre, hcp}]} (el HCP index de cada uno en la FedE Cup, ver alPlantel)
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
    } else if (d.tipo === 'sdga:plantel') {
      origenApp ??= e.origin
      const handicaps = validarHandicaps(d.handicaps)
      if (handicaps.size) { plantelApp = handicaps; alPlantelCbs.forEach((cb) => cb(handicaps)) }
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
  // el match de prueba (ver usarPrueba): el match y las firmas los contesta la app de mentira; el resto, la app de verdad
  if (prueba && (tipo === 'trampa:match' || tipo === 'trampa:anotar' || !origenApp)) return prueba.pedir(tipo, datos)
  const id = `p${++pedidos}`
  return new Promise((ok) => {
    const t = setTimeout(() => { esperando.delete(id); ok(null) }, 10000)
    esperando.set(id, (d) => { clearTimeout(t); ok(d) })
    window.parent.postMessage({ tipo, id, ...datos }, origenApp)
  })
}
/**
 * El MATCH de prueba (prueba.js): sin cuenta (la SDGApp de dev en modo DEV, "dev:…") o suelto con ?probar=match, una
 * app de mentira contesta acá mismo, con rivales y bananas simulados que quedan en el teléfono. Con `identidad`, entra
 * con ella (suelto no hay app que la mande). Nunca en producción.
 */
let prueba = null
export function usarPrueba(p, identidad = null) {
  prueba = p
  if (identidad) entro(identidad, true)
}
export const enPrueba = () => !!prueba
/** Suelto, en prueba: no hay app de verdad atrás (sin "volver a la SDGApp"). */
export const pruebaSuelta = () => !!prueba && !origenApp
/** Un aviso suelto a la app (p. ej. el color de arriba de la pantalla, para teñir la barra de estado). */
export const avisarApp = (d) => { if (origenApp) window.parent.postMessage(d, origenApp) }

/**
 * El link para abrir el match: adentro de la app, la pantalla del juego de la app (la misma base: dev o producción); suelto,
 * el juego. Con `replay` (el id de un match jugado), abre directo su replay.
 */
export const linkMatch = (replay = null) => {
  const q = `?match=1${replay ? `&replay=${encodeURIComponent(replay)}` : ''}`
  return origenApp ? `${origenApp}/#/juegos/trampa${q}` : `${location.origin}${location.pathname}${q}`
}

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
const deVista = (f) => ({ uid: f.user_id, usuario: f.player_name ?? f.alias, apodo: f.apodo, emoji: f.emoji, golpes: f.golpes, vsPar: f.vs_par, ms: f.ms, fecha: f.created_at, sdga: f.sdga === true, detalle: f.detalle ?? null })
// `detalle` (hoyo por hoyo y los monos) es una columna nueva de trampa_marcas: mientras la base no la tenga,
// se lee y se anota sin ella (PostgREST da 400 por una columna que no existe). Ver PENDIENTES-TRAMPA.md en la SDGApp.
const COLS_MARCAS = 'user_id,alias,apodo,emoji,golpes,vs_par,ms,created_at,player_name,sdga'

/** Todas las marcas: las de la SDGApp (por la app o directo); si no se puede, las de este teléfono. */
export async function leerMarcas() {
  if (puente.enApp) {
    const r = await pedirApp('trampa:leer')
    if (!r || r.error || !Array.isArray(r.marcas)) return { marcas: locales(), compartido: false, error: true }
    return { marcas: r.marcas, compartido: true, app: true }
  }
  if (!compartido()) return { marcas: locales(), compartido: false }
  try {
    const h = { headers: cabeceras(await token()) }
    const url = (cols) => `${SUPABASE.url}/rest/v1/trampa_ranking?select=${cols}&order=created_at.desc&limit=5000`
    let res = await fetch(url(COLS_MARCAS + ',detalle'), h)
    if (res.status === 400) res = await fetch(url(COLS_MARCAS), h) // la base todavía no tiene `detalle`
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
    // `detalle` lo guarda la app cuando su base tenga la columna (antes, lo ignora)
    const r = await pedirApp('trampa:anotar', { marca: { apodo: m.apodo, emoji: m.emoji, golpes: m.golpes, vsPar: m.vsPar, ms: m.ms, ...(m.detalle ? { detalle: m.detalle } : {}) } })
    return { ok: !!r?.ok, compartido: true }
  }
  const tk = compartido() ? await token() : null
  if (!tk || !puente.identidad) return { ok: true, compartido: false }
  try {
    const fila = { user_id: puente.identidad.uid, alias: puente.identidad.alias, apodo: m.apodo, emoji: m.emoji, golpes: m.golpes, vs_par: m.vsPar, ms: m.ms }
    const post = (cuerpo) => fetch(`${SUPABASE.url}/rest/v1/trampa_marcas`, { method: 'POST', headers: { ...cabeceras(tk), Prefer: 'return=minimal' }, body: JSON.stringify(cuerpo) })
    let res = await post(m.detalle ? { ...fila, detalle: m.detalle } : fila)
    if (res.status === 400 && m.detalle) res = await post(fila) // la base todavía no tiene `detalle`: la vuelta entra igual
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
  // las bananas (0 = por el honor), cuándo le llegó al otro y cuándo aceptó (sin las columnas en la base: 0 y null)
  apuesta: Math.max(0, Math.floor(+f.apuesta || 0)), enviadoFecha: f.enviado_at ?? null, aceptadoFecha: f.aceptado_at ?? null,
  retador: { uid: f.retador_id, alias: f.retador_alias, apodo: f.retador_apodo, emoji: f.retador_emoji, golpes: f.retador_golpes, vsPar: f.retador_vs_par, ms: f.retador_ms, lp: !!f.retador_lp, ruleta: ruletaOk(f.retador_ruleta) },
  rival: { uid: f.rival_id, alias: f.rival_alias, apodo: f.rival_apodo ?? null, emoji: f.rival_emoji ?? null, golpes: f.rival_golpes ?? null, vsPar: f.rival_vs_par ?? null, ms: f.rival_ms ?? null, lp: !!f.rival_lp, ruleta: ruletaOk(f.rival_ruleta) },
})
/** La Ruleta de una vuelta del match (quién pegó cada tiro, por hoyo: [["El Sueco","LG"],["Lechu"],["Mugre"]]), o null. */
function ruletaOk(x) {
  return Array.isArray(x) && x.length && x.every((h) => Array.isArray(h) && h.every((a) => typeof a === 'string')) ? x : null
}
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
export async function crearDesafio({ rival, semilla, apodo, emoji, golpes, vsPar, ms, lp, fantasma, ruleta = null }) {
  const yo = puente.identidad
  const datos = { rivalId: rival.uid, rivalAlias: rival.nombre, semilla, apodo, emoji, golpes, vsPar, ms, lp: !!lp, fantasma, ...(ruleta ? { ruleta } : {}) }
  if (puente.enApp) return (await porApp('desafiar', datos))?.id ?? null
  const fila = {
    retador_id: yo.uid, retador_alias: yo.alias, retador_apodo: apodo, retador_emoji: emoji, retador_golpes: golpes, retador_vs_par: vsPar, retador_ms: ms, retador_lp: !!lp,
    rival_id: rival.uid, rival_alias: rival.nombre, semilla, fantasma,
  }
  const crear = (cuerpo) => rest('trampa_desafios?select=id', { metodo: 'POST', cuerpo, prefer: 'return=representation' })
  let r
  try {
    r = await crear(ruleta ? { ...fila, retador_ruleta: ruleta } : fila)
  } catch (e) {
    if (!ruleta || !/HTTP 400/.test(String(e?.message))) throw e
    r = await crear(fila) // una base sin la columna de la Ruleta: el desafío va igual
  }
  return r?.[0]?.id ?? null
}
/** Mis desafíos (los que hice y los que me hicieron), sin la grabación. */
export async function leerDesafios() {
  if (puente.enApp) return ((await porApp('desafios')) ?? []).map(deFilaDesafio)
  const uid = puente.identidad?.uid
  const leer = (cols) => rest(`trampa_desafios?select=${cols}&or=(retador_id.eq.${uid},rival_id.eq.${uid})&order=created_at.desc&limit=100`)
  // con las bananas y la Ruleta; una base sin esas columnas contesta 400 y se lee sin ellas
  let filas = null
  const intentos = [`${COLS_DESAFIO},retador_ruleta,rival_ruleta,apuesta,enviado_at,aceptado_at`, `${COLS_DESAFIO},retador_ruleta,rival_ruleta`, COLS_DESAFIO]
  for (let i = 0; i < intentos.length && !filas; i++) {
    try { filas = await leer(intentos[i]) } catch (e) {
      if (i === intentos.length - 1 || !/HTTP 400/.test(String(e?.message))) throw e
    }
  }
  return (filas ?? []).map(deFilaDesafio)
}
/** La grabación del que desafió, para jugar con su fantasma. */
export async function leerFantasma(id) {
  if (puente.enApp) return (await porApp('fantasma', { desafioId: id })) ?? null
  const filas = await rest(`trampa_desafios?select=fantasma&id=eq.${encodeURIComponent(id)}`)
  return filas?.[0]?.fantasma ?? null
}
/**
 * El ranking de matches de todos (vista `trampa_match_ranking`: totales por jugador, sin los desafíos de nadie):
 * [{ uid, nombre, sdga, jugados, ganados, empatados, perdidos, ultimo, rivales: [{ nombre, g, e, p }] }].
 * Si la app o la base todavía no lo tienen, tira un error con `pronto = true`.
 */
export async function leerRankingMatch() {
  let filas
  try {
    filas = puente.enApp ? await porApp('ranking') : await rest('trampa_match_ranking?select=user_id,nombre,sdga,jugados,ganados,empatados,perdidos,ultimo,rivales')
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (/desconocida|HTTP 404|HTTP 400/.test(msg)) e.pronto = true
    throw e
  }
  return (filas ?? []).map((f) => ({
    uid: f.user_id ?? f.uid, nombre: f.nombre ?? '—', sdga: !!f.sdga,
    jugados: +f.jugados || 0, ganados: +f.ganados || 0, empatados: +f.empatados || 0, perdidos: +f.perdidos || 0,
    ultimo: f.ultimo ?? null, rivales: Array.isArray(f.rivales) ? f.rivales : [],
  })).filter((f) => f.uid && f.jugados > 0)
}
/**
 * El desafiado jugó: anota su vuelta (con su grabación, para el replay) y el match queda cerrado.
 * Si la base todavía no tiene `rival_fantasma`, anota igual sin la grabación (el replay muestra solo al que desafió).
 */
export async function responderDesafio(id, { apodo, emoji, golpes, vsPar, ms, lp, fantasma, ruleta = null }) {
  const datos = { desafioId: id, apodo, emoji, golpes, vsPar, ms, lp: !!lp, ...(Array.isArray(fantasma) ? { fantasma } : {}), ...(ruleta ? { ruleta } : {}) }
  if (puente.enApp) { await porApp('responder', datos); return true }
  const uid = puente.identidad?.uid
  const ruta = `trampa_desafios?id=eq.${encodeURIComponent(id)}&rival_id=eq.${uid}&estado=eq.pendiente`
  const cuerpo = { rival_apodo: apodo, rival_emoji: emoji, rival_golpes: golpes, rival_vs_par: vsPar, rival_ms: ms, rival_lp: !!lp, estado: 'jugado', jugado_at: new Date().toISOString() }
  // con la grabación (el replay) y la Ruleta; si la base todavía no tiene alguna de esas columnas, se anota sin ella
  const intentos = [
    { ...cuerpo, ...(Array.isArray(fantasma) ? { rival_fantasma: fantasma } : {}), ...(ruleta ? { rival_ruleta: ruleta } : {}) },
    ...(ruleta && Array.isArray(fantasma) ? [{ ...cuerpo, rival_fantasma: fantasma }] : []),
    ...(ruleta || Array.isArray(fantasma) ? [cuerpo] : []),
  ]
  for (let i = 0; i < intentos.length; i++) {
    try {
      await rest(ruta, { metodo: 'PATCH', prefer: 'return=minimal', cuerpo: intentos[i] })
      return true
    } catch (e) {
      if (i === intentos.length - 1 || !/HTTP 400/.test(String(e?.message))) throw e
    }
  }
  return true
}
/**
 * Las dos grabaciones de un match jugado, para el replay: { retador, rival } (rival en null si el match es de antes
 * de que se grabara la vuelta del desafiado, o si la app / la base todavía no la guardan).
 */
export async function leerReplay(id) {
  const lista = (g) => (Array.isArray(g) ? g : null)
  if (puente.enApp) {
    try {
      const r = await porApp('replay', { desafioId: id })
      return { retador: lista(r?.retador), rival: lista(r?.rival) }
    } catch (e) {
      // una app que todavía no sabe de replays: con la grabación del que desafió alcanza para verlo
      if (!/desconocida/.test(String(e?.message))) throw e
      return { retador: lista(await porApp('fantasma', { desafioId: id })), rival: null }
    }
  }
  const sel = (cols) => rest(`trampa_desafios?select=${cols}&id=eq.${encodeURIComponent(id)}`)
  let filas
  try { filas = await sel('fantasma,rival_fantasma') } catch (e) {
    if (!/HTTP 400/.test(String(e?.message))) throw e
    filas = await sel('fantasma')
  }
  return { retador: lista(filas?.[0]?.fantasma), rival: lista(filas?.[0]?.rival_fantasma) }
}


// ── las bananas 🍌 (8/10/2026) ──────────────────────────────────────────────────────────────────────
// Las monedas del match. Todo lo que mueve bananas son funciones de la base de la SDGApp (ver supabase/migration.sql
// del repo de la app, "las bananas"), que chequean las reglas: el juego solo pide. Adentro de la app, por el puente;
// suelto, por REST (/rpc). Si la app o la base todavía no las tienen, tiran error y el juego sigue sin bananas.
async function rpc(fn, args = {}) {
  const tk = await token()
  if (!tk) throw new Error('sin sesión')
  const res = await fetch(`${SUPABASE.url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: cabeceras(tk), body: JSON.stringify(args) })
  const cuerpo = res.status === 204 ? null : await res.json().catch(() => null)
  // un "no" de la base (no te alcanzan, ya no está…) viene con su mensaje: se muestra tal cual
  if (!res.ok) throw new Error(cuerpo?.code === 'P0001' && cuerpo?.message ? cuerpo.message : `HTTP ${res.status}`)
  return cuerpo
}
/**
 * ⚔️ El Clásico de la semana pasada (Dicky contra el Equipo 5) y, si jugaste para el que ganó y todavía no cobraste, tus
 * 2 bananas: { semana, dicky, e5, ganador: 'dicky' | 'e5' | null, cobraste }. Sin la base nueva (o sin la app nueva), error.
 */
export async function cobrarClasico() {
  const r = puente.enApp ? await porApp('clasico') : await rpc('trampa_clasico_cobrar')
  if (!r || typeof r !== 'object') throw new Error('sin clásico')
  return { semana: r.semana ?? null, dicky: Math.floor(+r.dicky || 0), e5: Math.floor(+r.e5 || 0), ganador: r.ganador === 'dicky' || r.ganador === 'e5' ? r.ganador : null, cobraste: Math.floor(+r.cobraste || 0) }
}
// ── 👕 la camiseta (9/10/2026): a quién bancás en el Clásico, los Dicky o el Equipo 5. Elegirla, la primera vez, es
// gratis; cambiarla ("pedir el pase") cuesta bananas: las reglas y el precio, en la base. Sin la base nueva (o la app
// nueva), error: el juego la guarda en el teléfono ──
const equipoOk = (e) => (e === 'dicky' || e === 'e5' ? e : null)
/** La tuya: { equipo: 'dicky' | 'e5' | null (todavía no elegiste), costo (de cambiarla), cambios }. */
export async function leerCamiseta() {
  const c = puente.enApp ? await porApp('camiseta') : await rpc('trampa_camiseta_estado')
  if (!c || typeof c !== 'object') throw new Error('sin camiseta')
  return { equipo: equipoOk(c.equipo), costo: Math.floor(+c.costo || 0), cambios: Math.floor(+c.cambios || 0) }
}
/** Elegirla o cambiarla: { equipo, costo (lo que pagaste), saldo }. Si no te alcanzan, el "no" de la base. */
export async function elegirCamiseta(equipo) {
  const r = puente.enApp ? await porApp('camisetaElegir', { equipo }) : await rpc('trampa_camiseta_elegir', { p_equipo: equipo })
  if (!r || !equipoOk(r.equipo)) throw new Error('sin camiseta')
  return { equipo: r.equipo, costo: Math.floor(+r.costo || 0), saldo: Math.floor(+r.saldo || 0) }
}
/** Las camisetas de todos: Map uid → 'dicky' | 'e5'. */
export async function leerCamisetas() {
  const filas = puente.enApp ? await porApp('camisetas') : await rpc('trampa_camisetas_todas')
  return new Map((Array.isArray(filas) ? filas : []).filter((f) => equipoOk(f?.equipo) && (f.user_id ?? f.uid)).map((f) => [f.user_id ?? f.uid, f.equipo]))
}
// ── 🏆 la Final del club (24/10/2026): El Sueco contra Taiu. A quién bancás y el tablero (las vueltas y los matches de
// uno contra el otro), en la base. Sin la base nueva (o la app nueva), error: el juego sigue con lo del teléfono ──
const ladoOk = (l) => (l === 'El Sueco' || l === 'Taiu (Đ)' ? l : null)
const aportesOk = (a) => (Array.isArray(a) ? a : []).map((x) => ({ quien: x?.uid ?? null, nombre: x?.nombre ?? '?', pts: Math.floor(+x?.pts || 0), matches: Math.floor(+x?.matches || 0) }))
/**
 * { puntos: { 'El Sueco', 'Taiu (Đ)' }, aportes: { lado: [{ quien, nombre, pts, matches }] }, matches: [{ lado, gano,
 * perdio, fecha }], hinchas: Map uid → lado, mio: tu lado o null }.
 */
export async function leerFinal() {
  const t = puente.enApp ? await porApp('final') : await rpc('trampa_final_tablero')
  if (!t || typeof t !== 'object' || !t.puntos) throw new Error('sin final')
  return {
    puntos: { 'El Sueco': Math.floor(+t.puntos['El Sueco'] || 0), 'Taiu (Đ)': Math.floor(+t.puntos['Taiu (Đ)'] || 0) },
    aportes: { 'El Sueco': aportesOk(t.aportes?.['El Sueco']), 'Taiu (Đ)': aportesOk(t.aportes?.['Taiu (Đ)']) },
    matches: (Array.isArray(t.matches) ? t.matches : []).filter((m) => ladoOk(m?.lado)),
    hinchas: new Map((Array.isArray(t.hinchas) ? t.hinchas : []).filter((h) => h?.uid && ladoOk(h.lado)).map((h) => [h.uid, h.lado])),
    mio: ladoOk(t.mio),
  }
}
/** Elegir a quién bancás (gratis). Devuelve el lado. */
export async function elegirFinalBase(lado) {
  const r = puente.enApp ? await porApp('finalElegir', { lado }) : await rpc('trampa_final_elegir', { p_lado: lado })
  if (!ladoOk(r?.lado)) throw new Error('sin final')
  return r.lado
}
/**
 * ⚔️ El Clásico de una semana según la base (las vueltas y los matches clásicos): { semana, dicky, e5, ganador,
 * aportes: { dicky: [{ quien, nombre, pts, matches }], e5 }, clasicos: [{ equipo, gano, perdio, fecha }] }.
 */
export async function leerClasicoSemana(atras = 0) {
  const r = puente.enApp ? await porApp('clasicoSemana', { atras }) : await rpc('trampa_clasico_semana', { p_atras: atras })
  if (!r || typeof r !== 'object') throw new Error('sin clásico')
  const n = (x) => Math.floor(+x || 0)
  const ap = (l) => (Array.isArray(l) ? l : []).map((x) => ({ quien: x.uid ?? null, nombre: x.nombre ?? '—', pts: n(x.pts), matches: n(x.matches) }))
  return {
    semana: r.semana ?? null, dicky: n(r.dicky), e5: n(r.e5), ganador: equipoOk(r.ganador),
    aportes: { dicky: ap(r.aportes?.dicky), e5: ap(r.aportes?.e5) },
    clasicos: (Array.isArray(r.clasicos) ? r.clasicos : []).filter((c) => equipoOk(c?.equipo)),
  }
}
/**
 * Tus bananas: { saldo, reservadas, pozo, premiosHoy, donadasHoy, donarTope, movimientos: [{ monto, motivo, desafio, detalle,
 * fecha }] }. `donarTope` es null si la base todavía no tiene donar (ahí no se muestra el botón).
 */
export async function leerBananas() {
  const b = puente.enApp ? await porApp('bananas') : await rpc('trampa_bananas_estado')
  if (!b || typeof b !== 'object') throw new Error('sin bananas')
  const n = (x) => Math.floor(+x || 0)
  return {
    saldo: n(b.saldo), reservadas: n(b.reservadas), pozo: n(b.pozo), premiosHoy: n(b.premiosHoy),
    donadasHoy: n(b.donadasHoy), donarTope: b.donarTope == null ? null : n(b.donarTope),
    movimientos: Array.isArray(b.movimientos) ? b.movimientos : [],
  }
}
/** Las bananas de todos: [{ uid, nombre, sdga, saldo (para apostar), total (con las apostadas), abrio }]. */
export async function leerRankingBananas() {
  const filas = puente.enApp ? await porApp('bananasRanking') : await rpc('trampa_bananas_ranking')
  return (Array.isArray(filas) ? filas : []).map((f) => ({ uid: f.user_id, nombre: f.nombre ?? '—', sdga: !!f.sdga, saldo: Math.floor(+f.saldo || 0), total: Math.floor(+f.total || 0), abrio: !!f.abrio })).filter((f) => f.uid)
}
/** Arranca un desafío con bananas (antes de jugar tu vuelta): quedan reservadas. Devuelve el id del desafío. */
export async function empezarApuesta({ rival, semilla, apodo, emoji, apuesta }) {
  if (puente.enApp) return (await porApp('apostar', { rivalId: rival.uid, rivalAlias: rival.nombre, apodo, emoji, semilla, apuesta }))?.id ?? null
  return rpc('trampa_desafio_empezar', { p_rival: rival.uid, p_rival_alias: rival.nombre, p_alias: puente.identidad?.alias, p_apodo: apodo, p_emoji: emoji, p_semilla: semilla, p_apuesta: apuesta })
}
/** Terminaste la vuelta de un desafío con bananas: le llega al otro (con tu resultado y tu grabación). */
export async function enviarApuesta(id, { golpes, vsPar, ms, lp, fantasma, ruleta = null, apodo, emoji }) {
  if (puente.enApp) { await porApp('enviar', { desafioId: id, apodo, emoji, golpes, vsPar, ms, lp: !!lp, fantasma, ...(ruleta ? { ruleta } : {}) }); return true }
  await rpc('trampa_desafio_enviar', { p_id: id, p_golpes: golpes, p_vs_par: vsPar, p_ms: ms, p_lp: !!lp, p_fantasma: fantasma, p_ruleta: ruleta })
  return true
}
/** Aceptás un desafío con bananas: ponés lo mismo (queda reservado) y jugás. */
export async function aceptarApuesta(id) {
  if (puente.enApp) await porApp('aceptar', { desafioId: id })
  else await rpc('trampa_desafio_aceptar', { p_id: id })
  return true
}
/** Terminaste de responder un desafío con bananas: se anota y se paga. Devuelve { gano (visto por vos), apuesta }. */
export async function completarApuesta(id, { apodo, emoji, golpes, vsPar, ms, lp, fantasma, ruleta = null }) {
  const r = puente.enApp
    ? await porApp('completar', { desafioId: id, apodo, emoji, golpes, vsPar, ms, lp: !!lp, ...(Array.isArray(fantasma) ? { fantasma } : {}), ...(ruleta ? { ruleta } : {}) })
    : await rpc('trampa_desafio_completar', { p_id: id, p_apodo: apodo, p_emoji: emoji, p_golpes: golpes, p_vs_par: vsPar, p_ms: ms, p_lp: !!lp, p_fantasma: Array.isArray(fantasma) ? fantasma : null, p_ruleta: ruleta })
  return { gano: Math.sign(+r?.gano || 0), apuesta: Math.floor(+r?.apuesta || 0) }
}
/** Rechazás un desafío (con bananas te cuesta 1, que va al mono; por el honor, nada). Devuelve { costo }. */
export async function rechazarDesafio(id) {
  const r = puente.enApp ? await porApp('rechazar', { desafioId: id }) : { costo: await rpc('trampa_desafio_rechazar', { p_id: id }) }
  return { costo: Math.floor(+r?.costo || 0) }
}
/**
 * 🎁 Donás `cantidad` bananas a `uid` (10/10/2026): hasta 10 por día en total, de las disponibles; las reglas, en la base
 * (`trampa_bananas_donar`). Devuelve { cantidad, para, nombre, saldo (el tuyo, después), donadasHoy, tope }. Si no se puede
 * (el tope del día, no te alcanzan), el "no" de la base.
 */
export async function donarBananas(uid, cantidad) {
  const r = puente.enApp
    ? await porApp('donar', { paraId: uid, cantidad })
    : await rpc('trampa_bananas_donar', { p_para: uid, p_cantidad: cantidad, p_alias: puente.identidad?.alias ?? null })
  if (!r || typeof r !== 'object') throw new Error('no se pudo donar')
  const n = (x) => Math.floor(+x || 0)
  return { cantidad: n(r.cantidad), para: r.para ?? uid, nombre: r.nombre ?? null, saldo: n(r.saldo), donadasHoy: n(r.donadasHoy), tope: n(r.tope) }
}

// ── el FOURBALL ⚔️ (19/10/2026): 2 contra 2, mejor y suma ────────────────────────────────────────────────────────
// Dos parejas, a distancia como el match. Todo lo hacen funciones de la base de la SDGApp ("el FOURBALL" en
// supabase/migration.sql): quién puede tomarlo, una vuelta por lugar, quién ve los golpes de quién y los vencimientos.
// El juego pide y cuenta los puntos (motor.js `resultadoFourball`). Adentro de la app, por el puente; suelto, por REST
// (/rpc). Si la app o la base todavía no lo tienen, el error lleva `pronto = true` (la pestaña dice que ya viene).
// (20/10/2026) Un lugar puede quedar vacío ("No puedo", hasta que se elige otro): llega sin `uid`. Si el que no pudo
// nunca fue reemplazado y venció, llega con `uid` null y su vuelta de LP: cuenta como que no jugó.
const ladoFb = (x) => {
  const vuelta = x?.vuelta && typeof x.vuelta === 'object' ? x.vuelta : null
  return x && (x.uid || vuelta) ? { uid: x.uid ?? null, alias: x.alias ?? '—', vuelta } : null
}
/** Un fourball de la base (visto por vos) → el del juego. `para` = la pareja desafiada (solo ellos lo pueden tomar). */
export const deFilaFourball = (f) => (f && f.id ? {
  id: f.id, semilla: Number(f.semilla) >>> 0, estado: f.estado, fecha: f.fecha ?? null, tomadoFecha: f.tomadoFecha ?? null, jugadoFecha: f.jugadoFecha ?? null,
  lugar: ['a1', 'a2', 'b1', 'b2'].includes(f.lugar) ? f.lugar : null, a1: ladoFb(f.a1), a2: ladoFb(f.a2), b1: ladoFb(f.b1), b2: ladoFb(f.b2),
  para: Array.isArray(f.para) && f.para.length === 2 && f.para.every((p) => p?.uid) ? f.para.map((p) => ({ uid: p.uid, alias: p.alias ?? '—' })) : null,
  revanchaDe: f.revanchaDe ?? null, bajadoPor: f.bajadoPor ?? null,
} : null)
function prontoFb(e) {
  if (/desconocida|HTTP 404|HTTP 400|Could not find|sin respuesta/.test(String(e?.message ?? ''))) e.pronto = true
  throw e
}
async function fb(accion, fn, datos = {}, args = {}) {
  try { return puente.enApp ? await porApp(accion, datos) : await rpc(fn, args) } catch (e) { return prontoFb(e) }
}
/** Tus fourball (los que armaste, en los que te eligieron y los que tomaste), sin grabaciones. */
export async function leerFourballs() {
  const r = await fb('fourballMios', 'trampa_fourball_mios')
  return (Array.isArray(r) ? r : []).map(deFilaFourball).filter(Boolean)
}
/** Los que buscan rival (de otros), sin los golpes. */
export async function leerFourballsAbiertos() {
  const r = await fb('fourballAbiertos', 'trampa_fourball_abiertos')
  return (Array.isArray(r) ? r : []).map(deFilaFourball).filter(Boolean)
}
/** Uno solo (el del link de WhatsApp). */
export async function leerFourball(id) {
  return deFilaFourball(await fb('fourballUno', 'trampa_fourball_uno', { fourballId: id }, { p_id: id }))
}
/**
 * Armás uno: con `companero` ({ uid, nombre }), la semilla y tu vuelta ya jugada: `vuelta` = { apodo, emoji, hoyos:
 * [g15, g16, g17] (null = no lo terminaste), golpes, vsPar, ms, lp }. Devuelve el id. (20/10/2026) Con `rivales`
 * ([{ uid }, { uid }]) es un desafío a esa pareja (solo ellos lo pueden tomar); con `revanchaDe`, la revancha de ese.
 */
export async function crearFourball({ companero, semilla, vuelta, fantasma, rivales = null, revanchaDe = null }) {
  const reto = rivales?.length === 2 ? [rivales[0].uid, rivales[1].uid] : null
  const r = await fb('fourballCrear', 'trampa_fourball_crear',
    { companeroId: companero.uid, semilla, vuelta, fantasma: fantasma ?? [], ...(reto ? { rivalesIds: reto } : {}), ...(revanchaDe ? { revanchaDe } : {}) },
    { p_companero: companero.uid, p_alias: puente.identidad?.alias ?? null, p_semilla: semilla, p_vuelta: vuelta, p_fantasma: fantasma ?? [],
      ...(reto ? { p_rival1: reto[0], p_rival2: reto[1] } : {}), ...(revanchaDe ? { p_revancha: revanchaDe } : {}) })
  return puente.enApp ? r?.id ?? null : r ?? null
}
/**
 * Lo tomás con tu compañero (el primero que lo toma se lo queda). Devuelve el fourball. En un desafío a tu pareja,
 * `companero` = null: es el otro de la pareja (lo pone la base).
 */
export async function tomarFourball(id, companero) {
  return deFilaFourball(await fb('fourballTomar', 'trampa_fourball_tomar', { fourballId: id, companeroId: companero?.uid ?? null },
    { p_id: id, p_companero: companero?.uid ?? null, p_alias: puente.identidad?.alias ?? null }))
}
/**
 * "No puedo" (antes de jugar): tu lugar queda vacío y el que lo armó (o el que lo tomó) elige otro. Si es un desafío a
 * tu pareja y todavía no lo aceptaron, lo rechaza (queda cancelado). Devuelve el fourball.
 */
export async function noPuedoFourball(id) {
  return deFilaFourball(await fb('fourballNoPuedo', 'trampa_fourball_no_puedo', { fourballId: id }, { p_id: id }))
}
/** Otro compañero ({ uid, nombre }), porque el tuyo no pudo. Devuelve el fourball. */
export async function companeroFourball(id, companero) {
  return deFilaFourball(await fb('fourballCompanero', 'trampa_fourball_companero', { fourballId: id, companeroId: companero.uid },
    { p_id: id, p_companero: companero.uid, p_alias: puente.identidad?.alias ?? null }))
}
/** Bajarlo: el que lo armó, mientras nadie lo tomó (queda cancelado). Devuelve el fourball. */
export async function bajarFourball(id) {
  return deFilaFourball(await fb('fourballBajar', 'trampa_fourball_bajar', { fourballId: id }, { p_id: id }))
}
/** Los jugados de todos (los últimos 500, con las vueltas): para el ranking del fourball (motor.js `rankingFourball`). */
export async function leerFourballsJugados() {
  const r = await fb('fourballJugados', 'trampa_fourball_jugados')
  return (Array.isArray(r) ? r : []).filter((f) => f?.id).map((f) => ({ id: f.id, fecha: f.fecha ?? null, a1: ladoFb(f.a1), a2: ladoFb(f.a2), b1: ladoFb(f.b1), b2: ladoFb(f.b2) }))
}
/** Jugaste tu vuelta: se anota (cuando jugaron los cuatro, queda jugado). Devuelve el fourball (ya con los golpes de todos). */
export async function jugarFourball(id, { vuelta, fantasma }) {
  return deFilaFourball(await fb('fourballJugar', 'trampa_fourball_jugar', { fourballId: id, vuelta, fantasma: Array.isArray(fantasma) ? fantasma : [] },
    { p_id: id, p_vuelta: vuelta, p_fantasma: Array.isArray(fantasma) ? fantasma : null }))
}
/** Las grabaciones de los que ya jugaron: { a1, a2, b1, b2 } (null el que no jugó). */
export async function leerFantasmasFourball(id) {
  const r = await fb('fourballFantasmas', 'trampa_fourball_fantasmas', { fourballId: id }, { p_id: id })
  const g = (x) => (Array.isArray(x) ? x : null)
  return { a1: g(r?.a1), a2: g(r?.a2), b1: g(r?.b1), b2: g(r?.b2) }
}
/** El link para el fourball (tomarlo o jugar tu vuelta): adentro de la app, la pantalla del juego de la app; suelto, el juego. */
export const linkFourball = (id) => `${linkMatch()}&fourball=${encodeURIComponent(id)}`
