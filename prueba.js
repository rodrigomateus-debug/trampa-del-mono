// El MATCH de prueba: una SDGApp de mentira, para probar el match y las bananas sin cuenta ni base.
//
// Se usa en la SDGApp de dev sin Google (modo DEV: la identidad llega como "dev:…" y la app no deja jugar matches)
// y suelto con ?probar=match. Nunca en producción (ahí no hay identidades "dev:").
//
// Contesta los mismos pedidos que el puente de la app (`trampa:match` con su acción, `trampa:anotar`…) con la misma
// forma, y aplica las mismas reglas que las funciones de la base (ver "las bananas" en supabase/migration.sql de la
// SDGApp): 10 al empezar, la mesada, los premios con el tope del día, el hoyo en uno y el pozo, la apuesta reservada,
// el que gana se lleva todo menos 1, rechazar cuesta 1, vence a las 48 h, abandonar es LP, donar hasta 10 por día. Todo
// queda en este teléfono.
//
// Los rivales son de mentira: cuando les llega un desafío lo juegan solos a los pocos segundos (abrí MATCH de nuevo
// para ver el resultado), y siempre hay uno que te desafió a vos, con su pelota grabada. En el fourball, lo mismo (ver
// "el FOURBALL de mentira", más abajo).

const CLAVE = 'sdga-trampa-prueba-v1'
const RIVALES = [
  { user_id: 'prueba:mono', nombre: 'El Mono (prueba)', sdga: true, nivel: 11.5 },
  { user_id: 'prueba:patmig', nombre: 'Patmig (prueba)', sdga: true, nivel: 12.5 },
  { user_id: 'prueba:lechu', nombre: 'Lechu (prueba)', sdga: true, nivel: 13.5 },
]
// 👕 las camisetas de los rivales de mentira (la tuya, la que elijas)
const CAMISETAS = { 'prueba:mono': 'dicky', 'prueba:patmig': 'e5', 'prueba:lechu': 'e5' }
// 🏆 la Final: a quién bancan los rivales de mentira (el Mono, a Taiu; Patmig y Lechu, al Sueco)
const HINCHAS_FINAL = { 'prueba:mono': 'Taiu (Đ)', 'prueba:patmig': 'El Sueco', 'prueba:lechu': 'El Sueco' }
const PARES = [4, 4, 3]
const H = 3600e3
const MONO = 'mono'
// los rivales de mentira juegan su parte a los RESPONDEN ms de que les llega
const RESPONDEN = 6000
// 🎁 donar: cuántas por día, entre todas (como `trampa_donar_tope` en la base)
const DONAR_TOPE = 10

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
export function crearPrueba({ yo, hoyos, muestraMs = 100, pines = null, final = false }) {
  const leer = () => { try { return JSON.parse(localStorage.getItem(CLAVE)) || null } catch { return null } }
  const st = leer() ?? { movs: [], desafios: [] }
  const guardar = () => { try { localStorage.setItem(CLAVE, JSON.stringify(st)) } catch {} }
  const nombreDe = (uid) => (uid === yo.uid ? yo.alias : RIVALES.find((r) => r.user_id === uid)?.nombre ?? '—')
  const esRival = (uid) => RIVALES.some((r) => r.user_id === uid)

  const mover = (uid, monto, motivo, desafio = null, detalle = null) => { if (monto) st.movs.push({ uid, monto, motivo, desafio, detalle, fecha: iso(), dia: diaAR(), semana: motivo === 'mesada' ? lunesAR() : null }) }
  const saldo = (uid) => st.movs.filter((m) => m.uid === uid).reduce((a, m) => a + m.monto, 0)
  const donadasHoy = () => -st.movs.filter((m) => m.uid === yo.uid && m.motivo === 'donacion' && m.monto < 0 && m.dia === diaAR()).reduce((a, m) => a + m.monto, 0)
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

  // la pelota grabada de un rival de mentira: hoyo por hoyo, de la salida a la bandera, golpe a golpe (cada muestra
  // lleva los golpes ACUMULADOS de la vuelta, como la del juego: de ahí sale el hoyo a hoyo)
  // (`pin`: las banderas del match, si se saben —el fourball—; si no, las de siempre)
  function grabar(porHoyo, pin = null) {
    const g = []
    let ms = 0, antes = 0
    porHoyo.forEach((golpes, idx) => {
      const h = pin ? { ...hoyos[idx % hoyos.length], pin: pin[idx] ?? hoyos[idx % hoyos.length].pin } : hoyos[idx % hoyos.length] // (🏆 la Final: 6 hoyos, dos vueltas)
      for (let k = 0; k < golpes; k++) {
        const a = [h.tee[0] + ((h.pin[0] - h.tee[0]) * k) / golpes, h.tee[1] + ((h.pin[1] - h.tee[1]) * k) / golpes]
        const b = [h.tee[0] + ((h.pin[0] - h.tee[0]) * (k + 1)) / golpes, h.tee[1] + ((h.pin[1] - h.tee[1]) * (k + 1)) / golpes]
        const lado = (k % 2 ? 1 : -1) * Math.min(6, golpes - k)
        for (let s = 0; s <= 12; s++) {
          const u = s / 12
          g.push([ms, idx, Math.round((a[0] + (b[0] - a[0]) * u + lado * Math.sin(Math.PI * u) * 0.4) * 10) / 10, Math.round((a[1] + (b[1] - a[1]) * u) * 10) / 10, Math.round(Math.sin(Math.PI * u) * 8 * 10) / 10, antes + k + 1])
          ms += muestraMs * 2
        }
        ms += 2500
      }
      antes += golpes
    })
    return { fantasma: g, ms }
  }
  // cómo juega un rival de mentira (cerca del par, a veces mejor)
  function vueltaDe(rival, pin = null, vueltas = 1) {
    const nivel = RIVALES.find((r) => r.user_id === rival)?.nivel ?? 12
    const pares = Array.from({ length: vueltas }, () => PARES).flat()
    const porHoyo = pares.map((p) => Math.max(2, p + azar(-1, 2) + (Math.random() < (nivel - 11) / 4 ? 1 : 0)))
    const golpes = porHoyo.reduce((a, b) => a + b, 0)
    const { fantasma, ms } = grabar(porHoyo, pin)
    return { golpes, vs_par: golpes - pares.reduce((a, b) => a + b, 0), ms, fantasma, porHoyo }
  }
  // 🏆 la Final: un desafío de 6 hoyos (se ve en la grabación) y con uno de los dos players: el que responde juega con el otro
  const FINALISTAS = { 'El Sueco': ['Taiu (Đ)', '🐸'], 'Taiu (Đ)': ['El Sueco', '🇸🇪'] }
  const deSeis = (g) => Array.isArray(g) && (g.some((m) => m[1] > 3) || g.filter((m) => m[1] === 3).length > 1)

  // ── el FOURBALL ⚔️ de mentira (como "el fourball" de la base, con lo del 20/10): los de mentira juegan su parte solos a
  // los pocos segundos, con el player del que lo armó (los cuatro, el mismo); una pareja de mentira toma el que armaste (o
  // acepta tu desafío; si Patmig está en la pareja desafiada, lo rechaza); Patmig, cuando es tu compañero, dice "No puedo"
  // (una vez por fourball) y el de mentira que se queda sin compañero elige otro. Siempre hay uno buscando rival, otro en
  // el que te eligieron, un desafío de El Mono y Lechu a vos y a Patmig, y uno jugado para el ranking y la revancha ──
  st.fourballs ??= []
  const LUGARES = ['a1', 'a2', 'b1', 'b2']
  const PATMIG = 'prueba:patmig'
  const lugarDe = (f, uid) => LUGARES.find((l) => f[`${l}_id`] === uid) ?? null
  const enPara = (f, uid) => !!f.para1_id && (f.para1_id === uid || f.para2_id === uid)
  const vivoFb = (f) => f.estado === 'abierto' || f.estado === 'tomado'
  const vueltaFb = (uid, carta = ['Lechu', '🦉'], semilla = null) => {
    const v = vueltaDe(uid, semilla != null && pines ? pines(semilla) : null) // (terminan en la bandera del match, como las de verdad)
    return { vuelta: { apodo: carta[0], emoji: carta[1], hoyos: v.porHoyo, golpes: v.golpes, vsPar: v.vs_par, ms: v.ms, lp: false }, fantasma: v.fantasma }
  }
  const CARTAS = [['Lechu', '🦉'], ['LG', '📺'], ['El Sueco', '🇸🇪'], ['Mapache', '🦝']]
  const NO_JUGO = () => ({ apodo: null, emoji: null, hoyos: [null, null, null], golpes: null, vsPar: null, ms: null, lp: true, noJugo: true })
  function nuevoFb(a1, a2, extra = {}) {
    const f = { id: id(), semilla: azar(0, 4294967295), estado: 'abierto', created_at: iso(), tomado_at: null, jugado_at: null, a1_id: a1, a1_alias: nombreDe(a1), a2_id: a2, a2_alias: a2 ? nombreDe(a2) : null, b1_id: null, b1_alias: null, b2_id: null, b2_alias: null, a1: null, a2: null, b1: null, b2: null, para1_id: null, para1_alias: null, para2_id: null, para2_alias: null, revancha_de: null, bajado_por: null, ...extra }
    st.fourballs.push(f)
    return f
  }
  const reservarFb = (f, r1, r2) => Object.assign(f, { para1_id: r1, para1_alias: nombreDe(r1), para2_id: r2, para2_alias: nombreDe(r2) })
  const terminarSiJugaron = (f) => { if (LUGARES.every((x) => f[x])) Object.assign(f, { estado: 'jugado', jugado_at: iso() }) }
  // (con el player de los cuatro: el del que lo armó)
  function jugarFb(f, l, uid, carta) {
    const { vuelta, fantasma } = vueltaFb(uid, f.a1 ? [f.a1.apodo, f.a1.emoji] : carta, f.semilla)
    f[l] = vuelta; f[`${l}_fantasma`] = fantasma; f[`${l}_t`] = ahora()
    terminarSiJugaron(f)
  }
  // visto por mí (como `trampa_fourball_visto`): las vueltas de los otros, sin golpes mientras yo no jugué; un lugar vacío
  // que no jugó, null; vacío con la vuelta del que no jugó a tiempo, sin uid
  function vistoFb(f) {
    const mio = lugarDe(f, yo.uid)
    const ve = (mio && f[mio]) || ['jugado', 'vencido', 'cancelado'].includes(f.estado)
    const lado = (l) => (!f[`${l}_id`] && !f[l] ? null : { uid: f[`${l}_id`] ?? null, alias: f[`${l}_alias`] ?? '—', vuelta: !f[l] ? null : ve || l === mio ? f[l] : { apodo: f[l].apodo, emoji: f[l].emoji, oculta: true } })
    return {
      id: f.id, semilla: f.semilla, estado: f.estado, fecha: f.created_at, tomadoFecha: f.tomado_at, jugadoFecha: f.jugado_at, lugar: mio,
      revanchaDe: f.revancha_de ?? null, bajadoPor: f.bajado_por ?? null,
      para: f.para1_id ? [{ uid: f.para1_id, alias: f.para1_alias }, { uid: f.para2_id, alias: f.para2_alias }] : null,
      a1: lado('a1'), a2: lado('a2'), b1: lado('b1'), b2: lado('b2'),
    }
  }
  // el de mentira que se quedó sin compañero elige otro de mentira que no esté en el fourball
  function otroCompaneroFb(f, l) {
    const fuera = new Set([...LUGARES.map((x) => f[`${x}_id`]), f.para1_id, f.para2_id].filter(Boolean))
    const otro = RIVALES.map((r) => r.user_id).find((u) => !fuera.has(u))
    if (otro) Object.assign(f, { [`${l}_id`]: otro, [`${l}_alias`]: nombreDe(otro), [`${l}_desde`]: ahora() })
  }
  function mantenimientoFb() {
    const t = ahora()
    for (const f of st.fourballs) {
      if (f.estado === 'abierto' && t - Date.parse(f.created_at) > 7 * 24 * H) { f.estado = 'vencido'; continue }
      if (f.estado === 'tomado' && t - Date.parse(f.tomado_at) > 48 * H) {
        for (const l of LUGARES) f[l] ??= NO_JUGO()
        Object.assign(f, { estado: 'jugado', jugado_at: iso() })
        continue
      }
      if (!vivoFb(f)) continue
      // los de mentira juegan su parte (a los pocos segundos de que les toca); Patmig, si sos su compañero, "No puedo"
      LUGARES.forEach((l, k) => {
        const uid = f[`${l}_id`]
        if (!uid || f[l] || !esRival(uid) || !vivoFb(f) || (l[0] === 'b' && f.estado !== 'tomado')) return
        const desde = Math.max(Date.parse(l[0] === 'a' ? f.created_at : f.tomado_at ?? f.created_at), f[`${l}_desde`] ?? 0)
        if (t - desde <= RESPONDEN * (1 + (k % 2))) return
        const compa = { a1: 'a2', a2: 'a1', b1: 'b2', b2: 'b1' }[l]
        if (uid === PATMIG && (l === 'a2' || l === 'b2') && f[`${compa}_id`] === yo.uid && !f.para1_id && !f.patmigNoPudo) {
          Object.assign(f, { [`${l}_id`]: null, [`${l}_alias`]: null, patmigNoPudo: true, vacio_t: t })
          return
        }
        jugarFb(f, l, uid, CARTAS[(k + 1) % CARTAS.length])
      })
      // el de mentira que lo armó (o lo tomó) y se quedó sin compañero elige otro (al ratito)
      for (const [l, c] of [['a2', 'a1'], ['b2', 'b1']]) {
        if (vivoFb(f) && !f[`${l}_id`] && f[`${c}_id`] && esRival(f[`${c}_id`]) && (c === 'a1' || f.estado === 'tomado') && t - (f.vacio_t ?? 0) > RESPONDEN) otroCompaneroFb(f, l)
      }
      if (f.estado !== 'abierto' || !f.a2_id || t - Date.parse(f.created_at) <= RESPONDEN * 2) continue
      // tu desafío a una pareja de mentira: lo aceptan (si está Patmig y no es una revancha, lo rechaza)
      if (f.para1_id && esRival(f.para1_id) && esRival(f.para2_id) && f.a1) {
        if ((f.para1_id === PATMIG || f.para2_id === PATMIG) && !f.revancha_de) Object.assign(f, { estado: 'cancelado', bajado_por: PATMIG })
        else Object.assign(f, { b1_id: f.para1_id, b1_alias: f.para1_alias, b2_id: f.para2_id, b2_alias: f.para2_alias, estado: 'tomado', tomado_at: iso() })
        continue
      }
      if (f.para1_id) continue
      // una pareja de mentira toma el que armaste vos (cuando ya jugaste), y el que armó uno de mentira con vos (cuando
      // jugaron los dos)
      const mio = f.a1_id === yo.uid && f.a1, conmigo = f.a2_id === yo.uid && f.a1 && f.a2 && esRival(f.a1_id)
      if (mio || conmigo) {
        const libres = RIVALES.map((r) => r.user_id).filter((u) => u !== f.a1_id && u !== f.a2_id)
        if (libres.length >= 2) Object.assign(f, { b1_id: libres[0], b1_alias: nombreDe(libres[0]), b2_id: libres[1], b2_alias: nombreDe(libres[1]), estado: 'tomado', tomado_at: iso() })
      }
    }
    // siempre hay uno buscando rival (de dos de mentira, con uno que ya jugó), otro en el que te eligieron de compañero, el
    // desafío de El Mono y Lechu a vos y a Patmig, y (una vez) uno jugado: vos y Lechu contra El Mono y Patmig
    if (!st.fourballs.some((f) => f.estado === 'abierto' && !lugarDe(f, yo.uid) && !f.para1_id)) {
      const f = nuevoFb('prueba:mono', PATMIG)
      jugarFb(f, 'a1', 'prueba:mono', CARTAS[2])
    }
    if (!st.fourballs.some((f) => f.a2_id === yo.uid && !f.a2 && vivoFb(f))) {
      const f = nuevoFb('prueba:lechu', yo.uid)
      jugarFb(f, 'a1', 'prueba:lechu', CARTAS[0])
    }
    if (!st.fourballs.some((f) => f.estado === 'abierto' && enPara(f, yo.uid))) {
      const f = reservarFb(nuevoFb('prueba:mono', 'prueba:lechu'), yo.uid, PATMIG)
      jugarFb(f, 'a1', 'prueba:mono', CARTAS[3])
    }
    if (!st.fbSembrado) {
      st.fbSembrado = true
      const f = nuevoFb('prueba:mono', PATMIG, { created_at: iso(t - 30 * H) })
      Object.assign(f, { b1_id: yo.uid, b1_alias: yo.alias, b2_id: 'prueba:lechu', b2_alias: nombreDe('prueba:lechu'), estado: 'tomado', tomado_at: iso(t - 29 * H) })
      for (const [l, uid] of [['a1', 'prueba:mono'], ['a2', PATMIG], ['b1', yo.uid], ['b2', 'prueba:lechu']]) jugarFb(f, l, uid, CARTAS[1])
      f.jugado_at = iso(t - 26 * H)
    }
  }
  // la cancha del fourball: el que no existe, o del que no sos
  const unFb = (fid) => { const f = st.fourballs.find((x) => x.id === fid); if (!f) throw new No('ese fourball no existe'); return f }

  // lo que la base hace sola: los rivales de mentira contestan, lo colgado se cierra, siempre hay uno que te desafió
  function mantenimiento() {
    const t = ahora()
    for (const d of st.desafios) {
      if (d.estado === 'jugando' && t - Date.parse(d.created_at) > 2 * H) Object.assign(d, { estado: 'pendiente', retador_lp: true, retador_golpes: null, retador_vs_par: null, retador_ms: null, enviado_at: iso() })
      if (d.estado === 'pendiente' && d.apuesta > 0 && d.enviado_at && t - Date.parse(d.enviado_at) > 48 * H) { d.estado = 'vencido'; rechazo(d) }
      if (d.estado === 'respondiendo' && t - Date.parse(d.aceptado_at) > 2 * H) { Object.assign(d, { estado: 'jugado', rival_lp: true, rival_golpes: null, rival_vs_par: null, rival_ms: null, jugado_at: iso() }); pagar(d) }
      // un rival de mentira contesta lo que le mandaste
      if (d.estado === 'pendiente' && esRival(d.rival_id) && t - Date.parse(d.enviado_at ?? d.created_at) > RESPONDEN) {
        const seis = deSeis(d.fantasma) && FINALISTAS[d.retador_apodo]
        const v = vueltaDe(d.rival_id, seis && pines ? pines(d.semilla, 2) : null, seis ? 2 : 1)
        if (d.apuesta > 0) { alDia(d.rival_id); mover(d.rival_id, -d.apuesta, 'reserva', d.id) }
        Object.assign(d, { estado: 'jugado', rival_apodo: seis ? seis[0] : d.retador_apodo, rival_emoji: seis ? seis[1] : d.retador_emoji, rival_golpes: v.golpes, rival_vs_par: v.vs_par, rival_ms: v.ms, rival_lp: false, rival_fantasma: v.fantasma, aceptado_at: iso(), jugado_at: iso() })
        pagar(d)
      }
    }
    // siempre hay un desafío para vos (con bananas o por el honor), de alguno de los de mentira
    if (!st.desafios.some((d) => d.rival_id === yo.uid && d.estado === 'pendiente')) {
      const r = RIVALES[(st.desafios.length + 1) % RIVALES.length]
      const apuesta = [3, 0, 5, 2][st.desafios.length % 4]
      alDia(r.user_id)
      if (apuesta > saldo(r.user_id)) return
      // (🏆 con ?final: un desafío de la Final, de 6 hoyos y con Taiu)
      const semilla = azar(0, 4294967295)
      const v = vueltaDe(r.user_id, final && pines ? pines(semilla, 2) : null, final ? 2 : 1)
      const [apodo, emoji] = final ? ['Taiu (Đ)', '🐸'] : ['Lechu', '🦉']
      const d = {
        id: id(), retador_id: r.user_id, retador_alias: r.nombre, retador_apodo: apodo, retador_emoji: emoji, retador_golpes: v.golpes, retador_vs_par: v.vs_par, retador_ms: v.ms, retador_lp: false,
        rival_id: yo.uid, rival_alias: yo.alias, rival_apodo: null, rival_emoji: null, rival_golpes: null, rival_vs_par: null, rival_ms: null, rival_lp: false,
        semilla, estado: 'pendiente', created_at: iso(), jugado_at: null, apuesta, enviado_at: iso(), aceptado_at: null, retador_ruleta: null, rival_ruleta: null, fantasma: v.fantasma, rival_fantasma: null,
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
        return { saldo: saldo(yo.uid), reservadas: reservadas(yo.uid), pozo: saldo(MONO), premiosHoy: st.movs.filter((m) => m.uid === yo.uid && m.motivo === 'premio' && m.dia === diaAR()).reduce((a, m) => a + m.monto, 0), donadasHoy: donadasHoy(), donarTope: DONAR_TOPE, movimientos: movs.map(({ uid, dia, semana, ...m }) => m) }
      }
      // ── 🎁 donar: hasta 10 por día en total, de las disponibles, enteras y al instante (como la base) ──
      case 'donar': {
        const para = RIVALES.find((r) => r.user_id === d.paraId)
        if (!para) throw new No('a ese jugador no se le pueden donar bananas')
        if (!Number.isInteger(d.cantidad) || d.cantidad < 1 || d.cantidad > DONAR_TOPE) throw new No(`se donan de 1 a ${DONAR_TOPE} bananas`)
        alDia(para.user_id)
        const ya = donadasHoy()
        if (ya >= DONAR_TOPE) throw new No(`hoy ya donaste ${ya}: el máximo es ${DONAR_TOPE} por día`)
        if (ya + d.cantidad > DONAR_TOPE) throw new No(`hoy ya donaste ${ya}: te quedan ${DONAR_TOPE - ya} (el máximo es ${DONAR_TOPE} por día)`)
        if (saldo(yo.uid) < d.cantidad) throw new No('no te alcanzan las bananas')
        mover(yo.uid, -d.cantidad, 'donacion', null, { para: para.user_id, nombre: para.nombre })
        mover(para.user_id, d.cantidad, 'donacion', null, { de: yo.uid, nombre: yo.alias })
        return { cantidad: d.cantidad, para: para.user_id, nombre: para.nombre, saldo: saldo(yo.uid), donadasHoy: ya + d.cantidad, tope: DONAR_TOPE }
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
      // ── 👕 la camiseta: la primera vez gratis; cambiarla, 5 bananas para el mono (como la base) ──
      case 'camiseta': return { equipo: st.camiseta ?? null, desde: null, cambios: st.cambios ?? 0, costo: 5 }
      case 'camisetaElegir': {
        const e = d.equipo
        if (e !== 'dicky' && e !== 'e5') throw new No('camiseta inválida')
        let costo = 0
        if (st.camiseta && st.camiseta !== e) {
          costo = 5
          if (saldo(yo.uid) < costo) throw new No('no te alcanzan las bananas')
          mover(yo.uid, -costo, 'camiseta', null, { de: st.camiseta, a: e })
          mover(MONO, costo, 'camiseta', null, { de: st.camiseta, a: e })
          st.cambios = (st.cambios ?? 0) + 1
        }
        st.camiseta = e
        return { equipo: e, costo, saldo: saldo(yo.uid) }
      }
      case 'camisetas': return [...RIVALES.map((r) => ({ user_id: r.user_id, equipo: CAMISETAS[r.user_id] })), ...(st.camiseta ? [{ user_id: yo.uid, equipo: st.camiseta }] : [])]
      // ── 🏆 la Final (como `trampa_final_tablero` / `_elegir`): de mentira, 6 a 4 más lo tuyo (3 por bancar) ──
      case 'finalElegir': {
        const l = d.lado
        if (l !== 'El Sueco' && l !== 'Taiu (Đ)') throw new No('lado inválido')
        st.final = l
        guardar()
        return { lado: l }
      }
      case 'final': {
        const ap = (lado) => [...RIVALES.filter((r) => HINCHAS_FINAL[r.user_id] === lado).map((r, i) => ({ uid: r.user_id, nombre: r.nombre, pts: lado === 'El Sueco' ? 3 - i : 4, matches: i ? 0 : 1 })),
          ...(st.final === lado ? [{ uid: yo.uid, nombre: yo.alias, pts: 3, matches: 0 }] : [])]
        const aportes = { 'El Sueco': ap('El Sueco'), 'Taiu (Đ)': ap('Taiu (Đ)') }
        const suma = (l) => aportes[l].reduce((a, x) => a + x.pts, 0)
        return {
          desde: '2026-10-24T03:00:00Z', hasta: '2026-10-26T03:00:00Z',
          puntos: { 'El Sueco': suma('El Sueco'), 'Taiu (Đ)': suma('Taiu (Đ)') }, aportes,
          matches: [{ lado: 'Taiu (Đ)', gano: 'El Mono (prueba)', perdio: 'Patmig (prueba)', fecha: iso(ahora() - H) }],
          hinchas: [...RIVALES.map((r) => ({ uid: r.user_id, lado: HINCHAS_FINAL[r.user_id] })), ...(st.final ? [{ uid: yo.uid, lado: st.final }] : [])],
          mio: st.final ?? null,
        }
      }
      case 'clasicoSemana': {
        // de mentira: esta semana va 9 a 8 (con vos, si tenés camiseta, sumando 4: 3 de un match clásico); la pasada, 11 a 14
        const atras = Math.max(0, Math.floor(+d.atras || 0))
        const lunes = new Date(Date.parse(lunesAR()) - atras * 7 * 24 * H).toISOString().slice(0, 10)
        const vos = st.camiseta && !atras ? [{ uid: yo.uid, nombre: yo.alias, pts: 4, matches: 3 }] : []
        const dicky = [{ uid: 'prueba:mono', nombre: 'El Mono (prueba)', pts: atras ? 11 : 6, matches: 3 }, ...(st.camiseta === 'dicky' ? vos : [])]
        const e5 = [{ uid: 'prueba:lechu', nombre: 'Lechu (prueba)', pts: atras ? 9 : 5, matches: 0 }, { uid: 'prueba:patmig', nombre: 'Patmig (prueba)', pts: atras ? 5 : 3, matches: 3 }, ...(st.camiseta === 'e5' ? vos : [])].sort((a, b) => b.pts - a.pts)
        const suma = (l) => l.reduce((a, x) => a + x.pts, 0)
        const clasicos = atras ? [] : [
          { equipo: 'dicky', gano: 'El Mono (prueba)', perdio: 'Lechu (prueba)', fecha: iso(ahora() - 26 * H) },
          { equipo: 'e5', gano: 'Patmig (prueba)', perdio: 'El Mono (prueba)', fecha: iso(ahora() - 5 * H) },
          ...(vos.length ? [{ equipo: st.camiseta, gano: yo.alias, perdio: st.camiseta === 'dicky' ? 'Patmig (prueba)' : 'El Mono (prueba)', fecha: iso(ahora() - H) }] : []),
        ].sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha))
        const [cd, ce] = [suma(dicky), suma(e5)]
        return { semana: lunes, dicky: cd, e5: ce, ganador: cd > ce ? 'dicky' : ce > cd ? 'e5' : null, aportes: { dicky, e5 }, clasicos }
      }
      case 'clasico': {
        // ⚔️ el Clásico de mentira: la semana pasada ganó el Equipo 5 14 a 11 y "jugaste para él": 2 bananas, una vez por semana
        const lunes = new Date(Date.now() - 3 * 3600e3)
        lunes.setUTCDate(lunes.getUTCDate() - ((lunes.getUTCDay() + 6) % 7) - 7)
        const semana = lunes.toISOString().slice(0, 10)
        st.clasico ??= {}
        const cobraste = st.clasico[semana] ? 0 : 2
        if (cobraste) { st.clasico[semana] = true; alDia(yo.uid); mover(yo.uid, 2, 'clasico') }
        return { semana, dicky: 11, e5: 14, ganador: 'e5', cobraste }
      }
      // ── el fourball ⚔️ (las mismas reglas que la base) ──
      case 'fourballAbiertos': mantenimientoFb(); return st.fourballs.filter((f) => f.estado === 'abierto' && f.a2_id && f.a1_id !== yo.uid && f.a2_id !== yo.uid && (!f.para1_id || enPara(f, yo.uid))).sort((a, b) => b.created_at.localeCompare(a.created_at)).map(vistoFb)
      case 'fourballMios': mantenimientoFb(); return st.fourballs.filter((f) => lugarDe(f, yo.uid) || (f.estado === 'abierto' && enPara(f, yo.uid))).sort((a, b) => b.created_at.localeCompare(a.created_at)).map(vistoFb)
      case 'fourballUno': {
        mantenimientoFb()
        const f = unFb(d.fourballId)
        if (lugarDe(f, yo.uid)) return vistoFb(f)
        if (f.estado === 'cancelado') throw new No('ese fourball ya no está: lo bajaron')
        if (f.estado !== 'abierto') throw new No('ese fourball ya lo tomó otra pareja')
        if (f.para1_id && !enPara(f, yo.uid)) throw new No('ese fourball es un desafío para otra pareja')
        return vistoFb(f)
      }
      case 'fourballFantasmas': {
        const f = st.fourballs.find((x) => x.id === d.fourballId)
        if (!f || !lugarDe(f, yo.uid)) throw new No('no estás en ese fourball')
        return { a1: f.a1_fantasma ?? null, a2: f.a2_fantasma ?? null, b1: f.b1_fantasma ?? null, b2: f.b2_fantasma ?? null }
      }
      case 'fourballCrear': {
        if (!d.companeroId || d.companeroId === yo.uid) throw new No('elegí un compañero (vos, no)')
        if (!esRival(d.companeroId)) throw new No('con ese jugador no se puede armar pareja')
        const r = Array.isArray(d.rivalesIds) ? d.rivalesIds : null
        if (r) {
          if (r.length !== 2 || r[0] === r[1]) throw new No('elegí dos rivales distintos')
          if (r.includes(yo.uid) || r.includes(d.companeroId)) throw new No('los rivales no pueden ser de tu pareja')
          if (!r.every(esRival)) throw new No('con ese jugador no se puede jugar')
        }
        if (d.revanchaDe && !st.fourballs.some((x) => x.id === d.revanchaDe && x.estado === 'jugado' && lugarDe(x, yo.uid))) throw new No('esa revancha no corresponde')
        const f = nuevoFb(yo.uid, d.companeroId, { semilla: d.semilla, revancha_de: d.revanchaDe ?? null })
        if (r) reservarFb(f, r[0], r[1])
        f.a1 = d.vuelta; f.a1_fantasma = d.fantasma ?? []
        return { id: f.id }
      }
      case 'fourballTomar': {
        mantenimientoFb()
        const f = unFb(d.fourballId)
        if (f.estado === 'vencido') throw new No('ese fourball ya venció')
        if (f.estado === 'cancelado') throw new No('ese fourball ya no está: lo bajaron')
        if (f.estado !== 'abierto') throw new No('ya lo tomó otra pareja')
        if ([f.a1_id, f.a2_id].includes(yo.uid)) throw new No('es tu fourball: lo tiene que tomar otra pareja')
        if (!f.a2_id) throw new No('todavía no tiene compañero: esperá a que elijan otro')
        let con = d.companeroId ?? null
        if (f.para1_id) {
          if (!enPara(f, yo.uid)) throw new No('ese fourball es un desafío para otra pareja')
          const otro = f.para1_id === yo.uid ? f.para2_id : f.para1_id
          con ??= otro
          if (con !== otro) throw new No(`ese desafío es para vos y ${nombreDe(otro)}`)
        }
        if (!con || con === yo.uid) throw new No('elegí un compañero (vos, no)')
        if ([f.a1_id, f.a2_id].includes(con)) throw new No('tu compañero ya está en la otra pareja')
        if (!esRival(con)) throw new No('con ese jugador no se puede armar pareja')
        Object.assign(f, { b1_id: yo.uid, b1_alias: yo.alias, b2_id: con, b2_alias: nombreDe(con), estado: 'tomado', tomado_at: iso() })
        return vistoFb(f)
      }
      case 'fourballJugar': {
        mantenimientoFb()
        const f = unFb(d.fourballId)
        if (['jugado', 'vencido', 'cancelado'].includes(f.estado)) throw new No('ese fourball ya terminó')
        if (f.a1 && d.vuelta?.apodo !== f.a1.apodo) throw new No(`en el fourball los cuatro juegan con el mismo player (${f.a1.apodo})`)
        const l = lugarDe(f, yo.uid)
        if (!l) throw new No('no estás en ese fourball')
        if (f[l]) throw new No('ya jugaste tu vuelta')
        f[l] = d.vuelta; f[`${l}_fantasma`] = d.fantasma ?? []
        terminarSiJugaron(f)
        return vistoFb(f)
      }
      case 'fourballNoPuedo': {
        mantenimientoFb()
        const f = unFb(d.fourballId)
        if (!vivoFb(f)) throw new No('ese fourball ya terminó')
        const l = lugarDe(f, yo.uid)
        if (l === 'a2' || l === 'b2') {
          if (f[l]) throw new No('ya jugaste tu vuelta')
          Object.assign(f, { [`${l}_id`]: null, [`${l}_alias`]: null, vacio_t: ahora() })
        } else if (f.estado === 'abierto' && enPara(f, yo.uid)) Object.assign(f, { estado: 'cancelado', bajado_por: yo.uid })
        else if (l === 'a1') throw new No('lo armaste vos: si no lo van a jugar, bajalo')
        else if (l === 'b1') throw new No('lo tomaste vos: tenés que jugarlo (o queda LP)')
        else throw new No('no estás en ese fourball')
        return vistoFb(f)
      }
      case 'fourballCompanero': {
        mantenimientoFb()
        const f = unFb(d.fourballId)
        if (!vivoFb(f)) throw new No('ese fourball ya terminó')
        const l = f.a1_id === yo.uid ? 'a2' : f.b1_id === yo.uid ? 'b2' : null
        if (!l) throw new No('el compañero lo elige el que lo armó (o el que lo tomó)')
        if (f[`${l}_id`]) throw new No('ya tenés compañero')
        const c = d.companeroId
        if (!c || c === yo.uid) throw new No('elegí un compañero (vos, no)')
        if ([...LUGARES.map((x) => f[`${x}_id`]), f.para1_id, f.para2_id].includes(c)) throw new No('ese jugador ya está en el fourball')
        if (!esRival(c)) throw new No('con ese jugador no se puede armar pareja')
        Object.assign(f, { [`${l}_id`]: c, [`${l}_alias`]: nombreDe(c), [`${l}_desde`]: ahora() })
        return vistoFb(f)
      }
      case 'fourballBajar': {
        mantenimientoFb()
        const f = unFb(d.fourballId)
        if (f.a1_id !== yo.uid) throw new No('lo puede bajar solo el que lo armó')
        if (f.estado === 'tomado') throw new No('ya lo tomó una pareja: ahora se juega')
        if (f.estado !== 'abierto') throw new No('ese fourball ya terminó')
        Object.assign(f, { estado: 'cancelado', bajado_por: yo.uid })
        return vistoFb(f)
      }
      case 'fourballJugados': {
        mantenimientoFb()
        const lado = (f, l) => (!f[`${l}_id`] && !f[l] ? null : { uid: f[`${l}_id`] ?? null, alias: f[`${l}_alias`] ?? '—', vuelta: f[l] ?? null })
        return st.fourballs.filter((f) => f.estado === 'jugado').sort((a, b) => b.jugado_at.localeCompare(a.jugado_at)).slice(0, 500)
          .map((f) => ({ id: f.id, fecha: f.jugado_at, a1: lado(f, 'a1'), a2: lado(f, 'a2'), b1: lado(f, 'b1'), b2: lado(f, 'b2') }))
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
    } else if (unos && !st.movs.some((m) => m.uid === yo.uid && m.motivo === 'hoyo_en_uno' && m.dia === diaAR())) mover(yo.uid, 10, 'hoyo_en_uno') // una vez por día (19/10/2026)
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
  const borrar = () => { st.movs = []; st.desafios = []; st.fourballs = []; guardar() }
  return { pedir, borrar, rivales: RIVALES }
}
