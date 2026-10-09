// El MATCH de prueba: una SDGApp de mentira, para probar el match y las bananas sin cuenta ni base.
//
// Se usa en la SDGApp de dev sin Google (modo DEV: la identidad llega como "dev:…" y la app no deja jugar matches)
// y suelto con ?probar=match. Nunca en producción (ahí no hay identidades "dev:").
//
// Contesta los mismos pedidos que el puente de la app (`trampa:match` con su acción, `trampa:anotar`…) con la misma
// forma, y aplica las mismas reglas que las funciones de la base (ver "las bananas" en supabase/migration.sql de la
// SDGApp): 10 al empezar, la mesada, los premios con el tope del día, el hoyo en uno y el pozo, la apuesta reservada,
// el que gana se lleva todo menos 1, rechazar cuesta 1, vence a las 48 h, abandonar es LP. Todo queda en este teléfono.
//
// Los rivales son de mentira: cuando les llega un desafío lo juegan solos a los pocos segundos (abrí MATCH de nuevo
// para ver el resultado), y siempre hay uno que te desafió a vos, con su pelota grabada.

const CLAVE = 'sdga-trampa-prueba-v1'
const RIVALES = [
  { user_id: 'prueba:mono', nombre: 'El Mono (prueba)', sdga: true, nivel: 11.5 },
  { user_id: 'prueba:patmig', nombre: 'Patmig (prueba)', sdga: true, nivel: 12.5 },
  { user_id: 'prueba:lechu', nombre: 'Lechu (prueba)', sdga: true, nivel: 13.5 },
]
const PARES = [4, 4, 3]
const H = 3600e3
const MONO = 'mono'
// los rivales de mentira juegan su parte a los RESPONDEN ms de que les llega
const RESPONDEN = 6000

const ahora = () => Date.now()
const iso = (t = ahora()) => new Date(t).toISOString()
const diaAR = (t = ahora()) => new Date(t - 3 * H).toISOString().slice(0, 10)
const lunesAR = (t = ahora()) => { const d = new Date(t - 3 * H); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10) }
const id = () => (crypto.randomUUID ? crypto.randomUUID() : `p${Math.random().toString(16).slice(2)}${ahora()}`)
const azar = (a, b) => a + Math.floor(Math.random() * (b - a + 1))

class No extends Error {}

/**
 * La app de mentira para `yo` ({ uid, alias }). `hoyos` = los hoyos del juego (M.HOYOS: tee y pin, para grabar la
 * pelota de los rivales de mentira) y `muestraMs` cada cuánto va una muestra de la grabación.
 */
export function crearPrueba({ yo, hoyos, muestraMs = 100 }) {
  const leer = () => { try { return JSON.parse(localStorage.getItem(CLAVE)) || null } catch { return null } }
  const st = leer() ?? { movs: [], desafios: [] }
  const guardar = () => { try { localStorage.setItem(CLAVE, JSON.stringify(st)) } catch {} }
  const nombreDe = (uid) => (uid === yo.uid ? yo.alias : RIVALES.find((r) => r.user_id === uid)?.nombre ?? '—')
  const esRival = (uid) => RIVALES.some((r) => r.user_id === uid)

  const mover = (uid, monto, motivo, desafio = null, detalle = null) => { if (monto) st.movs.push({ uid, monto, motivo, desafio, detalle, fecha: iso(), dia: diaAR(), semana: motivo === 'mesada' ? lunesAR() : null }) }
  const saldo = (uid) => st.movs.filter((m) => m.uid === uid).reduce((a, m) => a + m.monto, 0)
  const reservadas = (uid) => st.desafios.filter((d) => d.apuesta > 0 && ((d.retador_id === uid && ['jugando', 'pendiente', 'respondiendo'].includes(d.estado)) || (d.rival_id === uid && d.estado === 'respondiendo'))).reduce((a, d) => a + d.apuesta, 0)
  function alDia(uid) {
    if (!st.movs.some((m) => m.uid === uid && m.motivo === 'inicial')) mover(uid, 10, 'inicial')
    if (saldo(uid) + reservadas(uid) < 10 && !st.movs.some((m) => m.uid === uid && m.motivo === 'mesada' && m.semana === lunesAR())) mover(uid, 3, 'mesada')
  }
  // quién ganó, visto por el que desafió (1 / −1 / 0): menos golpes; si empatan, el más rápido; LP pierde
  function ganador(d) {
    const a = d.retador_lp || d.retador_golpes == null, b = d.rival_lp || d.rival_golpes == null
    if (a && b) return 0
    if (a) return -1
    if (b) return 1
    if (d.retador_golpes !== d.rival_golpes) return d.retador_golpes < d.rival_golpes ? 1 : -1
    const ma = d.retador_ms ?? Infinity, mb = d.rival_ms ?? Infinity
    return ma === mb ? 0 : ma < mb ? 1 : -1
  }
  function pagar(d) {
    if (!(d.apuesta > 0)) return
    const g = ganador(d)
    if (g === 0) { mover(d.retador_id, d.apuesta, 'devolucion', d.id); mover(d.rival_id, d.apuesta, 'devolucion', d.id); return }
    mover(g > 0 ? d.retador_id : d.rival_id, 2 * d.apuesta - 1, 'cobro', d.id)
    mover(MONO, 1, 'comision', d.id)
  }
  function rechazo(d) {
    if (!(d.apuesta > 0)) return 0
    mover(d.retador_id, d.apuesta, 'devolucion', d.id)
    if (saldo(d.rival_id) < 1) return 0
    mover(d.rival_id, -1, 'rechazo', d.id)
    mover(MONO, 1, 'rechazo', d.id)
    return 1
  }

  // la pelota grabada de un rival de mentira: hoyo por hoyo, de la salida a la bandera, golpe a golpe
  function grabar(porHoyo) {
    const g = []
    let ms = 0
    porHoyo.forEach((golpes, idx) => {
      const h = hoyos[idx]
      for (let k = 0; k < golpes; k++) {
        const a = [h.tee[0] + ((h.pin[0] - h.tee[0]) * k) / golpes, h.tee[1] + ((h.pin[1] - h.tee[1]) * k) / golpes]
        const b = [h.tee[0] + ((h.pin[0] - h.tee[0]) * (k + 1)) / golpes, h.tee[1] + ((h.pin[1] - h.tee[1]) * (k + 1)) / golpes]
        const lado = (k % 2 ? 1 : -1) * Math.min(6, golpes - k)
        for (let s = 0; s <= 12; s++) {
          const u = s / 12
          g.push([ms, idx, Math.round((a[0] + (b[0] - a[0]) * u + lado * Math.sin(Math.PI * u) * 0.4) * 10) / 10, Math.round((a[1] + (b[1] - a[1]) * u) * 10) / 10, Math.round(Math.sin(Math.PI * u) * 8 * 10) / 10, k + 1])
          ms += muestraMs * 2
        }
        ms += 2500
      }
    })
    return { fantasma: g, ms }
  }
  // cómo juega un rival de mentira (cerca del par, a veces mejor)
  function vueltaDe(rival) {
    const nivel = RIVALES.find((r) => r.user_id === rival)?.nivel ?? 12
    const porHoyo = PARES.map((p) => Math.max(2, p + azar(-1, 2) + (Math.random() < (nivel - 11) / 4 ? 1 : 0)))
    const golpes = porHoyo.reduce((a, b) => a + b, 0)
    const { fantasma, ms } = grabar(porHoyo)
    return { golpes, vs_par: golpes - 11, ms, fantasma }
  }

  // lo que la base hace sola: los rivales de mentira contestan, lo colgado se cierra, siempre hay uno que te desafió
  function mantenimiento() {
    const t = ahora()
    for (const d of st.desafios) {
      if (d.estado === 'jugando' && t - Date.parse(d.created_at) > 2 * H) Object.assign(d, { estado: 'pendiente', retador_lp: true, retador_golpes: null, retador_vs_par: null, retador_ms: null, enviado_at: iso() })
      if (d.estado === 'pendiente' && d.apuesta > 0 && d.enviado_at && t - Date.parse(d.enviado_at) > 48 * H) { d.estado = 'vencido'; rechazo(d) }
      if (d.estado === 'respondiendo' && t - Date.parse(d.aceptado_at) > 2 * H) { Object.assign(d, { estado: 'jugado', rival_lp: true, rival_golpes: null, rival_vs_par: null, rival_ms: null, jugado_at: iso() }); pagar(d) }
      // un rival de mentira contesta lo que le mandaste
      if (d.estado === 'pendiente' && esRival(d.rival_id) && t - Date.parse(d.enviado_at ?? d.created_at) > RESPONDEN) {
        const v = vueltaDe(d.rival_id)
        if (d.apuesta > 0) { alDia(d.rival_id); mover(d.rival_id, -d.apuesta, 'reserva', d.id) }
        Object.assign(d, { estado: 'jugado', rival_apodo: d.retador_apodo, rival_emoji: d.retador_emoji, rival_golpes: v.golpes, rival_vs_par: v.vs_par, rival_ms: v.ms, rival_lp: false, rival_fantasma: v.fantasma, aceptado_at: iso(), jugado_at: iso() })
        pagar(d)
      }
    }
    // siempre hay un desafío para vos (con bananas o por el honor), de alguno de los de mentira
    if (!st.desafios.some((d) => d.rival_id === yo.uid && d.estado === 'pendiente')) {
      const r = RIVALES[(st.desafios.length + 1) % RIVALES.length]
      const apuesta = [3, 0, 5, 2][st.desafios.length % 4]
      alDia(r.user_id)
      if (apuesta > saldo(r.user_id)) return
      const v = vueltaDe(r.user_id)
      const d = {
        id: id(), retador_id: r.user_id, retador_alias: r.nombre, retador_apodo: 'Lechu', retador_emoji: '🦉', retador_golpes: v.golpes, retador_vs_par: v.vs_par, retador_ms: v.ms, retador_lp: false,
        rival_id: yo.uid, rival_alias: yo.alias, rival_apodo: null, rival_emoji: null, rival_golpes: null, rival_vs_par: null, rival_ms: null, rival_lp: false,
        semilla: azar(0, 4294967295), estado: 'pendiente', created_at: iso(), jugado_at: null, apuesta, enviado_at: iso(), aceptado_at: null, retador_ruleta: null, rival_ruleta: null, fantasma: v.fantasma, rival_fantasma: null,
      }
      if (apuesta > 0) mover(r.user_id, -apuesta, 'reserva', d.id)
      st.desafios.push(d)
    }
  }

  const sinGrabaciones = ({ fantasma, rival_fantasma, ...d }) => d
  const delDesafio = (dId, quien, campo = 'rival_id') => st.desafios.find((x) => x.id === dId && x[campo] === quien)

  // ── las acciones: la misma forma que el puente de la app ──
  function match(accion, d = {}) {
    alDia(yo.uid)
    mantenimiento()
    switch (accion) {
      case 'rivales': return RIVALES.map(({ nivel, ...r }) => r)
      case 'desafios': return st.desafios.filter((x) => x.retador_id === yo.uid || x.rival_id === yo.uid).sort((a, b) => b.created_at.localeCompare(a.created_at)).map(sinGrabaciones)
      case 'fantasma': return delDesafio(d.desafioId, yo.uid)?.fantasma ?? delDesafio(d.desafioId, yo.uid, 'retador_id')?.fantasma ?? null
      case 'replay': { const x = st.desafios.find((y) => y.id === d.desafioId); return x ? { retador: x.fantasma, rival: x.rival_fantasma } : null }
      case 'ranking': {
        const filas = new Map()
        for (const x of st.desafios.filter((y) => y.estado === 'jugado')) {
          for (const [uid, otro, signo] of [[x.retador_id, x.rival_id, 1], [x.rival_id, x.retador_id, -1]]) {
            const f = filas.get(uid) ?? { user_id: uid, nombre: nombreDe(uid), sdga: true, jugados: 0, ganados: 0, empatados: 0, perdidos: 0, ultimo: x.jugado_at, rivales: new Map() }
            const g = ganador(x) * signo
            f.jugados++; f[g > 0 ? 'ganados' : g < 0 ? 'perdidos' : 'empatados']++
            const c = f.rivales.get(otro) ?? { nombre: nombreDe(otro), g: 0, e: 0, p: 0 }
            c[g > 0 ? 'g' : g < 0 ? 'p' : 'e']++
            f.rivales.set(otro, c)
            filas.set(uid, f)
          }
        }
        return [...filas.values()].map((f) => ({ ...f, rivales: [...f.rivales.values()] }))
      }
      case 'desafiar': {
        const x = { id: id(), retador_id: yo.uid, retador_alias: yo.alias, retador_apodo: d.apodo, retador_emoji: d.emoji, retador_golpes: d.golpes, retador_vs_par: d.vsPar, retador_ms: d.ms, retador_lp: !!d.lp, rival_id: d.rivalId, rival_alias: d.rivalAlias, semilla: d.semilla, estado: 'pendiente', created_at: iso(), enviado_at: iso(), jugado_at: null, apuesta: 0, fantasma: d.fantasma ?? [], retador_ruleta: d.ruleta ?? null }
        st.desafios.push(x)
        return { id: x.id }
      }
      case 'responder': {
        const x = st.desafios.find((y) => y.id === d.desafioId && y.rival_id === yo.uid && y.estado === 'pendiente' && !(y.apuesta > 0))
        if (!x) throw new No('el desafío ya no está pendiente')
        Object.assign(x, { rival_apodo: d.apodo, rival_emoji: d.emoji, rival_golpes: d.golpes, rival_vs_par: d.vsPar, rival_ms: d.ms, rival_lp: !!d.lp, rival_fantasma: d.fantasma ?? null, rival_ruleta: d.ruleta ?? null, estado: 'jugado', jugado_at: iso() })
        return null
      }
      case 'bananas': {
        const movs = st.movs.filter((m) => m.uid === yo.uid).slice(-30).reverse()
        return { saldo: saldo(yo.uid), reservadas: reservadas(yo.uid), pozo: saldo(MONO), premiosHoy: st.movs.filter((m) => m.uid === yo.uid && m.motivo === 'premio' && m.dia === diaAR()).reduce((a, m) => a + m.monto, 0), movimientos: movs.map(({ uid, dia, semana, ...m }) => m) }
      }
      case 'bananasRanking': return [{ user_id: yo.uid, nombre: yo.alias, sdga: true }, ...RIVALES].map((r) => { alDia(r.user_id); return { user_id: r.user_id, nombre: r.nombre, sdga: true, saldo: saldo(r.user_id), total: saldo(r.user_id) + reservadas(r.user_id), abrio: true } })
      case 'apostar': {
        if (!(d.apuesta >= 2)) throw new No('la apuesta es de 2 bananas para arriba')
        alDia(d.rivalId)
        if (st.desafios.some((x) => x.apuesta > 0 && ['jugando', 'pendiente', 'respondiendo'].includes(x.estado) && [x.retador_id, x.rival_id].includes(d.rivalId) && [x.retador_id, x.rival_id].includes(yo.uid))) throw new No('ya hay un desafío con bananas abierto entre ustedes')
        if (saldo(yo.uid) < d.apuesta) throw new No('no te alcanzan las bananas')
        if (saldo(d.rivalId) < d.apuesta) throw new No('al rival no le alcanzan las bananas')
        const x = { id: id(), retador_id: yo.uid, retador_alias: yo.alias, retador_apodo: d.apodo, retador_emoji: d.emoji, retador_golpes: null, retador_vs_par: null, retador_ms: null, retador_lp: true, rival_id: d.rivalId, rival_alias: d.rivalAlias, semilla: d.semilla, estado: 'jugando', created_at: iso(), enviado_at: null, aceptado_at: null, jugado_at: null, apuesta: d.apuesta, fantasma: [] }
        st.desafios.push(x)
        mover(yo.uid, -d.apuesta, 'reserva', x.id)
        return { id: x.id }
      }
      case 'enviar': {
        const x = delDesafio(d.desafioId, yo.uid, 'retador_id')
        if (!x || x.estado !== 'jugando') throw new No('el desafío ya no está para mandar')
        Object.assign(x, { retador_golpes: d.golpes, retador_vs_par: d.vsPar, retador_ms: d.ms, retador_lp: !!d.lp, fantasma: d.fantasma ?? [], retador_ruleta: d.ruleta ?? null, estado: 'pendiente', enviado_at: iso() })
        return null
      }
      case 'aceptar': {
        const x = delDesafio(d.desafioId, yo.uid)
        if (!x || x.estado !== 'pendiente' || !(x.apuesta > 0)) throw new No('el desafío ya no está pendiente')
        if (saldo(yo.uid) < x.apuesta) throw new No('no te alcanzan las bananas')
        mover(yo.uid, -x.apuesta, 'reserva', x.id)
        Object.assign(x, { estado: 'respondiendo', aceptado_at: iso() })
        return null
      }
      case 'completar': {
        const x = delDesafio(d.desafioId, yo.uid)
        if (!x || x.estado !== 'respondiendo') throw new No('el desafío ya no está para anotar')
        Object.assign(x, { rival_apodo: d.apodo, rival_emoji: d.emoji, rival_golpes: d.golpes, rival_vs_par: d.vsPar, rival_ms: d.ms, rival_lp: !!d.lp, rival_fantasma: d.fantasma ?? null, rival_ruleta: d.ruleta ?? null, estado: 'jugado', jugado_at: iso() })
        pagar(x)
        return { gano: -ganador(x), apuesta: x.apuesta }
      }
      case 'rechazar': {
        const x = delDesafio(d.desafioId, yo.uid)
        if (!x || x.estado !== 'pendiente') throw new No('el desafío ya no está pendiente')
        x.estado = 'rechazado'
        return { costo: rechazo(x) }
      }
      default: throw new No('acción desconocida')
    }
  }
  // los premios de la vuelta firmada, como el trigger de la base (Demetrio no suma en el modo normal; en PRO, sí)
  function premios(marca) {
    alDia(yo.uid)
    if (marca?.apodo === 'Demetrio López' && !marca?.detalle?.pro) return
    const hoyosV = marca?.detalle?.hoyos
    let premio = 0, unos = 0
    const por = []
    if (Array.isArray(hoyosV) && hoyosV.length === 3) {
      hoyosV.forEach((g, i) => {
        if (g === 1) unos++
        else if (g <= PARES[i] - 2) { premio += 3; por.push('aguila') }
        else if (g === PARES[i] - 1) { premio += 1; por.push('birdie') }
      })
    }
    if (marca?.vsPar < 0) { premio += 2; por.push('bajo_par') }
    const ya = st.movs.filter((m) => m.uid === yo.uid && m.motivo === 'premio' && m.dia === diaAR()).reduce((a, m) => a + m.monto, 0)
    mover(yo.uid, Math.min(premio, Math.max(0, 5 - ya)), 'premio', null, { por })
    if (unos && marca?.detalle?.pro) {
      const pozo = saldo(MONO)
      mover(MONO, -pozo, 'pozo')
      mover(yo.uid, Math.max(pozo, 10) + 10 * (unos - 1), 'pozo', null, { pozo })
    } else if (unos) mover(yo.uid, 10 * unos, 'hoyo_en_uno')
  }

  /** Contesta un pedido del puente como la app (`sdga:match` {ok, datos, error}, `sdga:anotada` {ok}, …). */
  async function pedir(tipo, datos = {}) {
    await new Promise((r) => setTimeout(r, 120)) // como si fuera por la red
    try {
      if (tipo === 'trampa:match') { const r = match(datos.accion, datos.datos ?? {}); guardar(); return { ok: true, datos: r } }
      if (tipo === 'trampa:anotar') { premios(datos.marca); guardar(); return { ok: true } }
      if (tipo === 'trampa:leer' || tipo === 'trampa:conteo') return { error: true } // el ranking y el conteo, los del teléfono
      return null
    } catch (e) {
      guardar()
      return tipo === 'trampa:match' ? { ok: false, error: e instanceof No ? e.message : 'no se pudo' } : { ok: false }
    }
  }
  /** Empezar de cero (todo lo de prueba). */
  const borrar = () => { st.movs = []; st.desafios = []; guardar() }
  return { pedir, borrar, rivales: RIVALES }
}
