// node test-motor.mjs — chequeos del motor de La Trampa del Mono.
import assert from 'node:assert/strict'
import * as M from './motor.js'

const campo = M.crearCampo()
// para probar la física sola: sin monos cruzando y con greens planos
const quieto = { ...campo, hoyos: M.HOYOS.map((h) => ({ ...h, monos: [] })) }
const plano = { ...quieto, hoyos: quieto.hoyos.map((h) => ({ ...h, caida: [0, 0] })) }
const [h15, h16, h17] = M.HOYOS
// rng que deja el error humano en cero: gauss usa pares (u, 0.25) → cos(π/2) = 0
const sinRuido = () => {
  let i = 0
  return () => (i++ % 2 ? 0.25 : 0.5)
}
const fijo = (v) => () => v
// la primera yarda de cierta letra de la cancha dentro de una zona (centro de la celda)
const buscar = (letra, [x0, y0, x1, y1]) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (M.celda(campo, [x + 0.5, y + 0.5]) === letra) return [x + 0.5, y + 0.5]
  return null
}
// un árbol cualquiera en el medio de la cancha (ahí aparece el Mono)
const enArbol = buscar('t', [60, 60, 180, 380])
const angulo = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0])
const calma = { ang: 0, kmh: 0 }
const ok = (nombre, fn) => {
  fn()
  console.log('✓', nombre)
}

ok('par 11 y la cancha sale del dibujo (4 px = 1 yarda)', () => {
  assert.equal(M.PAR_TOTAL, 11)
  assert.equal(campo.cancha.ancho, 219)
  assert.equal(campo.cancha.alto, 447)
  assert.equal(campo.cancha.filas.length, 447)
  assert.ok(campo.cancha.filas.every((f) => f.length === 219))
})

ok('terreno: tee, green, fairway, bunker, rough entre hoyos, árbol y afuera', () => {
  for (const h of M.HOYOS) {
    assert.deepEqual(M.terreno(campo, h.tee), { tipo: 'tee', hoyo: h.n })
    assert.deepEqual(M.terreno(campo, h.pin), { tipo: 'green', hoyo: h.n })
    for (const p of h.calle) assert.equal(M.terreno(campo, p).tipo, 'fairway', `calle del ${h.n}`)
  }
  assert.deepEqual(M.terreno(campo, enArbol), { tipo: 'bosque', hoyo: null })
  const abierto = buscar('.', [70, 150, 95, 300]) // rough entre el 15 y el 16
  assert.ok([15, 16].includes(M.terreno(campo, abierto).hoyo))
  assert.equal(M.terreno(campo, [1, 200]).tipo, 'afuera')
  assert.equal(M.terreno(campo, buscar('b', [26, 160, 40, 182])).tipo, 'bunker') // el del fairway del 15
})

ok('no hay árboles en tees, greens ni calles; los árboles son una parte de la cancha', () => {
  for (const h of M.HOYOS) {
    assert.equal(M.pinoEn(campo, h.tee), null)
    assert.equal(M.pinoEn(campo, h.pin), null)
    for (const p of h.calle) assert.equal(M.pinoEn(campo, p), null)
  }
  const letras = campo.cancha.filas.join('')
  const adentro = letras.replace(/x/g, '').length
  const arboles = letras.replace(/[^t]/g, '').length
  assert.ok(arboles / adentro > 0.15 && arboles / adentro < 0.35, `árboles ${((100 * arboles) / adentro).toFixed(0)}%`)
})

ok('drive al medio en el 15 queda en el fairway', () => {
  const tiro = M.lanzar(quieto, { pelota: h15.tee, angulo: angulo(h15.tee, h15.pin), potencia: 0.9, viento: calma, lie: 'tee', rng: sinRuido() })
  M.simular(quieto, tiro, h15.pin)
  assert.equal(M.terreno(campo, tiro.pos).tipo, 'fairway')
  assert.ok(M.dist(h15.tee, tiro.pos) > 220, `anduvo ${M.dist(h15.tee, tiro.pos)}`)
})

ok('en el 16 el drive pasa por arriba del bosque y cae en el fairway', () => {
  const tiro = M.lanzar(campo, { pelota: h16.tee, angulo: angulo(h16.tee, h16.calle[1]), potencia: 0.88, viento: calma, lie: 'tee', rng: sinRuido() })
  M.simular(quieto, tiro, h16.pin)
  assert.ok(!tiro.eventos.some((e) => e.tipo === 'palo'))
  assert.equal(M.terreno(campo, tiro.pos).tipo, 'fairway')
})

ok('el 17 (largo, desde el tee rojo) se llega de un golpe con el driver', () => {
  const tiro = M.lanzar(campo, { pelota: h17.tee, angulo: angulo(h17.tee, h17.pin), potencia: 0.98, viento: calma, lie: 'tee', rng: sinRuido() })
  M.simular(quieto, tiro, h17.pin)
  assert.equal(M.terreno(campo, tiro.pos).tipo, 'green')
})

ok('pegado a un árbol, se puede pegar para el lado libre', () => {
  // una yarda de rough con un árbol a la izquierda y 48 yardas libres a la derecha
  let pelota = null
  for (let y = 60; y < 400 && !pelota; y++) for (let x = 20; x < 190 && !pelota; x++) {
    const p = [x + 0.5, y + 0.5]
    if (M.celda(campo, p) !== '.' || M.celda(campo, [x - 0.5, y + 0.5]) !== 't') continue
    if (Array.from({ length: 48 }, (_, i) => M.celda(campo, [x + 1.5 + i, y + 0.5])).every((c) => c === '.' || c === 'f')) pelota = p
  }
  assert.ok(pelota)
  const tiro = M.simular(quieto, M.lanzar(quieto, { pelota, angulo: 0, potencia: 0.18, viento: calma, lie: 'rough', rng: sinRuido() }), h15.pin)
  assert.ok(M.dist(pelota, tiro.pos) > 20, 'no rebota contra el árbol de al lado')
})

ok('desde un fairway se pasa por arriba de la franja de pinos al otro', () => {
  const desde = h16.calle[1] // medio del fairway del 16
  const tiro = M.simular(quieto, M.lanzar(quieto, { pelota: desde, angulo: angulo(desde, h15.calle[1]), potencia: 0.25, viento: calma, lie: 'fairway', rng: sinRuido() }), h16.pin)
  assert.ok(!tiro.eventos.some((e) => e.tipo === 'palo'))
  assert.ok(['fairway', 'rough'].includes(M.terreno(campo, tiro.pos).tipo))
})

ok('Rodal: nunca pega derecho; apuntando afuera, la comba la trae a la línea', () => {
  const r = M.nuevaRonda({ apodo: 'El Mago Rodal', emoji: '🥛' }, fijo(0.5))
  r.monos = []
  r.viento = calma
  r.golpeMago = 'comba'
  const linea = angulo(h15.tee, h15.pin)
  const beta = (M.COMBA.angulo * Math.PI) / 180
  // apuntando derecho a la bandera, la comba la saca de la línea
  const derecho = M.planTiro(quieto, r, linea, 0.85)
  assert.ok(derecho.comba && derecho.control)
  assert.ok(Math.abs(derecho.cuerda - linea) > beta * 0.9)
  // apuntando afuera (a los pinos), vuelve y cae sobre la línea, sin chocar pinos en el vuelo
  const afuera = linea + beta
  const tiro = M.simular(quieto, M.golpear(quieto, r, afuera, 0.85, sinRuido()), h15.pin)
  assert.ok(!tiro.eventos.some((e) => e.tipo === 'palo'))
  const enLinea = h15.tee[0] + ((h15.pin[0] - h15.tee[0]) * (h15.tee[1] - tiro.pos[1])) / (h15.tee[1] - h15.pin[1])
  assert.ok(Math.abs(tiro.pos[0] - enLinea) < 3, `quedó a ${(tiro.pos[0] - enLinea).toFixed(1)} yd de la línea`)
  // también fuera del tee (desde el fairway), y para el otro lado
  r.pelota = [...h15.calle[2]]
  r.lie = 'fairway'
  r.golpeMago = 'comba'
  const izq = M.planTiro(quieto, r, angulo(r.pelota, h15.pin) - 0.3, 0.5)
  assert.ok(izq.comba && izq.cuerda > angulo(r.pelota, h15.pin) - 0.3)
  // un jugador sin habilidad tira recto
  const otro = M.nuevaRonda({ apodo: 'Rorro', emoji: '🥃' }, fijo(0.5))
  assert.equal(M.planTiro(quieto, otro, afuera, 0.85).control, null)
})

ok('Rodal: cada golpe le toca uno de 5 efectos, ninguno derecho', () => {
  const r = { ...M.nuevaRonda({ apodo: 'El Mago Rodal', emoji: '🥛' }, fijo(0.5)), monos: [], viento: calma }
  assert.equal(M.GOLPES_MAGO.length, 5)
  assert.ok(M.golpeMagoDe(r))
  const desde = [...h16.calle[1]]
  const linea = angulo(desde, h16.pin)
  const plan = (id) => {
    r.pelota = [...desde]
    r.lie = 'fairway'
    r.golpeMago = id
    return M.planTiro(quieto, r, linea, 0.5)
  }
  const normal = M.planTiro(quieto, { ...r, jugador: { apodo: 'Rorro' }, pelota: [...desde], lie: 'fairway' }, linea, 0.5)
  for (const g of M.GOLPES_MAGO) {
    const p = plan(g.id)
    assert.ok(p.comba && p.control && p.golpe === g.id)
    assert.ok(Math.abs(p.cuerda - linea) >= (15 * Math.PI) / 180 - 1e-9, `${g.id} sale derecho`)
  }
  // apuntando a la bandera: el gancho cae a la izquierda (ángulo menor) y el slice a la derecha
  assert.ok(plan('gancho').cuerda < linea && plan('slice').cuerda > linea)
  // el globo vuela alto y casi no rueda; la viborita va al ras y rueda una banda
  const tiroDe = (id) => {
    plan(id)
    return M.simular(quieto, M.golpear(quieto, r, linea, 0.5, sinRuido()), h16.pin)
  }
  const globo = tiroDe('globo')
  const vibora = tiroDe('vibora')
  const comba = tiroDe('comba')
  assert.ok(globo.hMax > comba.hMax * 2 && vibora.hMax < M.FISICA.alturaPino)
  assert.ok(globo.carry < comba.carry && vibora.carry < globo.carry)
  const rodada = (t) => M.dist(t.pos, [t.desde[0] + t.carryVec[0] + t.deriva[0], t.desde[1] + t.carryVec[1] + t.deriva[1]])
  assert.ok(rodada(globo) < 1 && rodada(vibora) > rodada(comba) * 3)
  assert.ok(normal.control === null)
  // después de cada golpe le toca otro efecto (nunca el mismo dos veces seguidas); el putt no cuenta
  const vistos = new Set()
  for (let i = 0; i < 40; i++) {
    const antes = r.golpeMago
    r.pelota = [...desde]
    r.lie = 'fairway'
    M.golpear(quieto, r, linea, 0.5, Math.random)
    assert.notEqual(r.golpeMago, antes)
    vistos.add(r.golpeMago)
  }
  assert.equal(vistos.size, 5)
  r.pelota = [h15.pin[0], h15.pin[1] + 4]
  r.lie = 'green'
  const antes = r.golpeMago
  M.golpear(quieto, r, angulo(r.pelota, h15.pin), 0.2, Math.random)
  assert.equal(r.golpeMago, antes)
})

ok('Rodal: el putt siempre lleva comba; derecho al hoyo no entra, apuntando afuera sí', () => {
  const r = { ...M.nuevaRonda({ apodo: 'El Mago Rodal', emoji: '🥛' }, fijo(0.5)), monos: [] }
  const desde = [h15.pin[0], h15.pin[1] + 6]
  const entra = (grados) => {
    for (let p = 0.01; p <= 0.6; p += 0.002) {
      const rr = { ...r, pelota: [...desde], lie: 'green' }
      if (M.simular(plano, M.golpear(plano, rr, angulo(desde, h15.pin) + (grados * Math.PI) / 180, p, sinRuido()), h15.pin).embocada) return true
    }
    return false
  }
  assert.ok(!entra(0))
  assert.ok(entra(12) && entra(-12)) // dobla hacia el hoyo, de los dos lados
  // a los demás el putt les sale derecho
  const otro = { ...M.nuevaRonda({ apodo: 'Rorro', emoji: '🥃' }, fijo(0.5)), monos: [], pelota: [...desde], lie: 'green' }
  assert.equal(M.planTiro(plano, otro, 0, 0.2).giro, 0)
})

ok('Miguelón: la bomba perfecta llega al green; mal pegada se abre y queda corta', () => {
  const r = M.nuevaRonda({ apodo: 'Mike Queboni (Đ)', emoji: '🍯', hcp: 5 }, fijo(0.5))
  r.monos = []
  r.viento = calma
  const azul = h15.tees.azul
  assert.deepEqual(r.pelota, azul) // HCP 5: sale de las azules
  const linea = angulo(azul, h15.pin)
  const perfecta = M.planTiro(quieto, r, linea, 1, 1)
  assert.ok(perfecta.bomba && perfecta.perfecta)
  // midiendo bien la distancia, alguna bomba perfecta termina en el green del 15 (392 yd desde las azules)
  const alGreen = Array.from({ length: 21 }, (_, i) => 0.8 + i * 0.01).some((p) => {
    const rr = { ...r, pelota: [...azul], lie: 'tee', golpes: 0 }
    return M.terreno(campo, M.simular(quieto, M.golpear(quieto, rr, linea, p, sinRuido(), 1), h15.pin).pos).tipo === 'green'
  })
  assert.ok(alGreen)
  const mala = M.planTiro(quieto, r, linea, 1, 0.4)
  assert.ok(!mala.perfecta && mala.disp.ang > (8 * Math.PI) / 180)
  // por debajo de la zona de bomba es un drive normal (aunque más largo)
  const corto = M.planTiro(quieto, r, linea, 0.7, 0)
  assert.ok(!corto.bomba && corto.carry * h15.escala > M.carryDe(5) * 0.9)
})

ok('Rodal: LG solo lo adula, pegue como pegue', () => {
  const rodal = { apodo: 'El Mago Rodal', emoji: '🥛' }
  const tiro = { eventos: [], modo: 'full', carry: 150, pos: [0, 0] }
  const malo = M.comentar(fijo(0.3), { tipo: 'normal', terreno: 'rough' }, tiro, h15, rodal)
  assert.ok(M.ADULACION.malo.includes(malo.lg))
  assert.equal(malo.excusa, null)
  assert.ok(M.ADULACION.mono.includes(M.comentar(fijo(0.3), { tipo: 'mono-malo' }, tiro, h15, rodal).lg))
  assert.ok(M.ADULACION.bueno.includes(M.comentar(fijo(0.3), { tipo: 'normal', terreno: 'fairway' }, tiro, h15, rodal).lg))
  assert.ok(M.ADULACION.resultado.BOGEY.includes(M.fraseResultado(fijo(0.3), 'BOGEY', rodal)))
  // a los demás LG no los adula
  assert.ok(!M.ADULACION.malo.includes(M.comentar(fijo(0.3), { tipo: 'normal', terreno: 'rough' }, tiro, h15, { apodo: 'Rorro' }).lg))
})

ok('Mati (El Sueco): siempre derecho y drive de casi 300', () => {
  const r = { ...M.nuevaRonda({ apodo: 'El Sueco', emoji: '🇸🇪', hcp: 1.5 }, fijo(0.5)), monos: [], viento: calma }
  const linea = angulo(r.pelota, h15.pin)
  const plan = M.planTiro(quieto, r, linea, 1)
  assert.equal(plan.disp.ang, 0)
  assert.ok(Math.abs(plan.carry * h15.escala - M.carryDe(1.5)) < 1e-6)
  assert.equal(M.dificultad(1.5).nombre, 'Paseo')
  // con azar de verdad, cae sobre la línea
  const t0 = [...r.pelota]
  const tiro = M.simular(quieto, M.golpear(quieto, r, linea, 0.8, Math.random), h15.pin)
  const enLinea = t0[0] + ((h15.pin[0] - t0[0]) * (t0[1] - tiro.pos[1])) / (t0[1] - h15.pin[1])
  assert.ok(tiro.eventos.some((e) => e.tipo === 'palo') || Math.abs(tiro.pos[0] - enLinea) < 0.5)
  // drive total (vuelo + rodaje) a fondo, en yardas reales: casi 300
  const largo = M.simular(quieto, M.golpear(quieto, { ...r, pelota: [...t0], lie: 'tee' }, linea, 1, sinRuido()), h15.pin)
  const yd = M.dist(t0, largo.pos) * h15.escala
  assert.ok(yd > 280 && yd < 310, `anduvo ${yd.toFixed(0)} yd`)
})

ok('Fito: la línea se sacude; en el embudo sale derecha', () => {
  const r = { ...M.nuevaRonda({ apodo: 'Fito (Đ)', emoji: '🦅', hcp: 22 }, fijo(0.5)), monos: [] }
  const linea = angulo(h15.tee, h15.pin)
  const afuera = M.planTiro(quieto, r, linea, 0.8, 0, M.AGUILA.periodo / 4) // el pico del sacudón
  assert.ok(!afuera.aguila.enVentana)
  assert.ok(Math.abs(afuera.cuerda - linea - (M.AGUILA.amplitud * Math.PI) / 180) < 1e-6)
  assert.ok(afuera.disp.ang > 0)
  const embudo = M.planTiro(quieto, r, linea, 0.8, 0, 0)
  assert.ok(embudo.aguila.enVentana)
  assert.equal(embudo.disp.ang, 0)
  assert.ok(Math.abs(embudo.cuerda - linea) < 1e-9)
})

ok('Fito: cerca del green, el chip queda al lado del hoyo; perfecto y apuntado, entra', () => {
  const desde = [h15.pin[0] + 2, h15.pin[1] + 24]
  const fito = () => ({ ...M.nuevaRonda({ apodo: 'Fito (Đ)', emoji: '🦅', hcp: 22 }, fijo(0.5)), monos: [], viento: calma, pelota: [...desde], lie: M.terreno(campo, desde).tipo })
  const alPin = angulo(desde, h15.pin)
  const p = (14 * h15.escala) / (M.carryDe(22) * (M.FISICA.factorLie[fito().lie] ?? 1))
  // apuntando torcido (15°): cae en el green y el imán la deja al lado, sin meterla
  const torcido = M.simular(quieto, M.golpear(quieto, fito(), alPin + 0.26, p, sinRuido(), 0, 0), h15.pin)
  assert.ok(torcido.iman?.aplicado)
  assert.notEqual(torcido.embocada, true)
  assert.ok(M.dist(torcido.pos, h15.pin) < 1.2, `quedó a ${M.dist(torcido.pos, h15.pin).toFixed(2)} yd`)
  // perfecto (en el embudo) y apuntado a la bandera: chip in
  const perfecto = M.simular(quieto, M.golpear(quieto, fito(), alPin, p, sinRuido(), 0, 0), h15.pin)
  assert.equal(perfecto.embocada, true)
})

ok('más handicap, más difícil: más error y menos distancia', () => {
  const crack = M.dificultad(1.5)
  const malo = M.dificultad(22)
  assert.ok(malo.error > crack.error && malo.distancia < crack.distancia)
  assert.equal(crack.nombre, 'Paseo')
  assert.equal(malo.nombre, 'Trampa total')
  assert.equal(M.dificultad(null).hcp, M.HCP_SIN_CARGAR)
  const linea = angulo(h15.tee, h15.pin)
  const conHcp = (hcp) => M.planTiro(quieto, { ...M.nuevaRonda({ apodo: 'X', emoji: '⛳', hcp }, fijo(0.5)), monos: [] }, linea, 0.8)
  assert.ok(conHcp(22).disp.ang > conHcp(1.5).disp.ang)
  assert.ok(conHcp(22).carry < conHcp(1.5).carry)
})

ok('el viento desvía la pelota', () => {
  const a = angulo(h15.tee, h15.pin)
  const sin = M.simular(quieto, M.lanzar(quieto, { pelota: h15.tee, angulo: a, potencia: 0.5, viento: calma, lie: 'tee', rng: sinRuido() }), h15.pin)
  const con = M.simular(quieto, M.lanzar(quieto, { pelota: h15.tee, angulo: a, potencia: 0.5, viento: { ang: 0, kmh: 20 }, lie: 'tee', rng: sinRuido() }), h15.pin)
  assert.ok(con.pos[0] - sin.pos[0] > 5)
})

ok('putt de 4 yardas con la fuerza justa entra; a fondo hace labio', () => {
  const pelota = [h15.pin[0], h15.pin[1] + 4]
  const justo = M.simular(plano, M.lanzar(plano, { pelota, angulo: -Math.PI / 2, potencia: 4.3 / 32, viento: calma, putt: true, rng: sinRuido() }), h15.pin)
  assert.equal(justo.embocada, true)
  const fuerte = M.simular(plano, M.lanzar(plano, { pelota, angulo: -Math.PI / 2, potencia: 1, viento: calma, putt: true, rng: sinRuido() }), h15.pin)
  assert.notEqual(fuerte.embocada, true)
  assert.ok(fuerte.eventos.some((e) => e.tipo === 'labio'))
})

ok('si se frena adentro del hoyo, cae', () => {
  const pelota = [h15.pin[0], h15.pin[1] + 4]
  const muerta = M.simular(plano, M.lanzar(plano, { pelota, angulo: -Math.PI / 2, potencia: 4.05 / 32, viento: calma, putt: true, rng: sinRuido() }), h15.pin)
  assert.equal(muerta.embocada, true)
})

ok('por la boca del hoyo, despacio, entra aunque no pase por el centro', () => {
  // pasa a 0,45 yd del centro (adentro del hoyo dibujado), con la fuerza para quedar 0,3 yd pasada
  const pelota = [h15.pin[0] + 0.45, h15.pin[1] + 4]
  const t = M.simular(plano, M.lanzar(plano, { pelota, angulo: -Math.PI / 2, potencia: 4.3 / 32, viento: calma, putt: true, rng: sinRuido() }), h15.pin)
  assert.equal(t.embocada, true)
})

ok('la corbata: pasada por el hoyo, da la vuelta, se frena y queda cortita', () => {
  const pelota = [h15.pin[0] + 0.15, h15.pin[1] + 4]
  // con fuerza para pasarse ~3 yardas
  const t = M.simular(plano, M.lanzar(plano, { pelota, angulo: -Math.PI / 2, potencia: 7 / 32, viento: calma, putt: true, rng: sinRuido() }), h15.pin)
  assert.notEqual(t.embocada, true)
  assert.ok(t.vuelta?.hecha, 'dio la vuelta')
  assert.ok(t.eventos.some((e) => e.tipo === 'vuelta'))
  assert.ok(t.vuelta.s && Math.abs(t.vuelta.ang - Math.atan2(0, 0.15)) > Math.PI / 2, 'giró más de un cuarto')
  const d = M.dist(t.pos, h15.pin)
  assert.ok(d > M.FISICA.bocaHoyo && d < 1.6, `quedó a ${d.toFixed(2)} yd`)
})

ok('la corbata justa: da la vuelta y entra', () => {
  const pelota = [h15.pin[0] + 0.1, h15.pin[1] + 4]
  const t = M.simular(plano, M.lanzar(plano, { pelota, angulo: -Math.PI / 2, potencia: 5.4 / 32, viento: calma, putt: true, rng: sinRuido() }), h15.pin)
  assert.ok(t.vuelta?.hecha)
  assert.equal(t.embocada, true)
})

ok('la caída del green quiebra el putt', () => {
  const pelota = [h15.pin[0], h15.pin[1] + 8]
  const tiro = M.simular(quieto, M.lanzar(quieto, { pelota, angulo: -Math.PI / 2, potencia: 8.3 / 32, viento: calma, putt: true, rng: sinRuido() }), h15.pin)
  assert.notEqual(tiro.embocada, true)
})

ok('la zona de pique se abre con la potencia, el rough y tirando a fondo', () => {
  const suave = M.dispersion('fairway', 0.4)
  const fuerte = M.dispersion('fairway', 0.9)
  const fondo = M.dispersion('fairway', 1)
  assert.ok(fuerte.ang > suave.ang && fondo.ang > fuerte.ang && fondo.carry > fuerte.carry)
  assert.ok(M.dispersion('rough', 0.9).ang > fuerte.ang)
  assert.equal(fondo.fondo, true)
})

ok('los monos esperan en los pinos y después cruzan', () => {
  const monos = M.crearMonos()
  assert.equal(monos.length, 6)
  const s = monos[0]
  assert.deepEqual(s.pos, s.m.a)
  M.moverMonos(monos, s.espera + 1, null) // termina de esperar y camina un segundo
  assert.ok(M.monoActivo(s))
  assert.ok(M.dist(s.pos, s.m.a) > 5)
})

ok('si la pelota le pega a un mono que cruza, se la lleva: +1 y drop donde le pegó', () => {
  const r = M.nuevaRonda({ apodo: 'Rorro', emoji: '🥃' }, fijo(0.5))
  const s = r.monos[0] // cruza el fairway del 15
  s.pos = [...s.m.a]
  s.espera = 0
  s.hacia = 'b'
  const ida = Math.atan2(s.m.b[1] - s.m.a[1], s.m.b[0] - s.m.a[0])
  r.pelota = [s.m.a[0] + Math.cos(ida) * 30, s.m.a[1] + Math.sin(ida) * 30] // en su camino, tirándole de frente
  r.lie = 'fairway'
  r.golpes = 1
  const tiro = M.simular(campo, M.golpear(campo, r, ida + Math.PI, 0.06, sinRuido()), h15.pin)
  assert.equal(tiro.robada, s)
  const res = M.resolverReposo(campo, r, tiro, fijo(0.5))
  assert.equal(res.tipo, 'mono-ladron')
  assert.equal(r.golpes, 3)
  assert.equal(r.robos, 1)
  assert.deepEqual(r.pelota, tiro.pos)
})

ok('pelota quieta cerca: los monos salen a buscarla y si llegan, al tee con un golpe de multa', () => {
  const r = M.nuevaRonda({ apodo: 'Rorro', emoji: '🥃' }, fijo(0.5))
  const cerca = r.monos[0]
  r.pelota = [cerca.pos[0] + 25, cerca.pos[1]]
  r.golpes = 2
  const lejos = r.monos.find((s) => s.hoyo === 17)
  assert.ok(M.despertarMonos(r.monos, r.pelota) >= 1)
  assert.equal(cerca.modo, 'caza')
  assert.equal(lejos.modo, 'ronda')
  assert.equal(M.moverMonos(r.monos, M.MONO.reaccion * 0.5, r.pelota), null) // primero se dan cuenta
  let llego = null
  for (let i = 0; i < 600 && !llego; i++) llego = M.moverMonos(r.monos, 1 / 60, r.pelota)
  assert.ok(llego)
  const res = M.monosLlegaron(r)
  assert.deepEqual(res, { tipo: 'reinicio', n: 15 })
  assert.equal(r.golpes, 3)
  assert.deepEqual(r.pelota, M.teeDe(r))
  assert.equal(r.lie, 'tee')
  assert.equal(r.robos, 1)
  assert.ok(!r.terminada)
  assert.ok(r.monos.every((s) => s.modo === 'ronda'))
})

ok('aunque el mono esté al lado, siempre hay tiempo para pegar', () => {
  const r = M.nuevaRonda({ apodo: 'Rorro', emoji: '🥃' }, fijo(0.5))
  const s = r.monos[0]
  r.pelota = [s.pos[0] + 5, s.pos[1]]
  M.despertarMonos(r.monos, r.pelota)
  let t = 0
  while (!M.moverMonos(r.monos, 1 / 60, r.pelota) && t < 20) t += 1 / 60
  assert.ok(t >= M.MONO.minimo - 0.1, `llegó en ${t.toFixed(1)} s`)
})

ok('si le pegás antes, los monos vuelven a su recorrido', () => {
  const r = M.nuevaRonda({ apodo: 'Rorro', emoji: '🥃' }, fijo(0.5))
  r.pelota = [r.monos[0].pos[0] + 25, r.monos[0].pos[1]]
  r.lie = 'rough'
  assert.ok(M.despertarMonos(r.monos, r.pelota) >= 1)
  M.golpear(campo, r, -Math.PI / 2, 0.5, sinRuido())
  assert.ok(r.monos.every((s) => s.modo === 'ronda'))
})

ok('afuera: golpe y distancia', () => {
  const r = M.nuevaRonda({ apodo: 'Rorro', emoji: '🥃' }, fijo(0.5))
  r.golpes = 1
  const res = M.resolverReposo(campo, r, { pos: [1, 200], eventos: [] }, fijo(0.5))
  assert.equal(res.tipo, 'afuera')
  assert.equal(r.golpes, 2)
  assert.deepEqual(r.pelota, M.teeDe(r))
})

ok('Mono malo: +1 y drop en el rough; Mono bueno: al fairway sin penalidad', () => {
  const r = M.nuevaRonda({ apodo: 'Rorro', emoji: '🥃' }, fijo(0.5))
  r.golpes = 1
  const malo = M.resolverReposo(campo, r, { pos: enArbol, eventos: [] }, fijo(0.99))
  assert.equal(malo.tipo, 'mono-malo')
  assert.equal(r.golpes, 2)
  assert.ok(['rough', 'fairway'].includes(M.terreno(campo, r.pelota).tipo))
  assert.equal(M.pinoEn(campo, r.pelota), null)

  const bueno = M.resolverReposo(campo, r, { pos: enArbol, eventos: [] }, fijo(0.01))
  assert.equal(bueno.tipo, 'mono-bueno')
  assert.equal(r.golpes, 2)
  assert.equal(M.terreno(campo, r.pelota).tipo, 'fairway')
})

ok('jugar desde el hoyo de al lado se avisa', () => {
  const r = M.nuevaRonda({ apodo: 'Rorro', emoji: '🥃' }, fijo(0.5))
  const res = M.resolverReposo(campo, r, { pos: [...h16.calle[1]], eventos: [] }, fijo(0.5))
  assert.equal(res.ajeno, 16)
})

ok('LP: levantar es perder la vuelta entera', () => {
  const r = M.nuevaRonda({ apodo: 'Rorro', emoji: '🥃' }, fijo(0.5))
  r.golpes = 4
  M.cerrarHoyo(r, fijo(0.5)) // el 15, embocado
  r.golpes = 10
  assert.ok(M.necesitaLP(r))
  assert.equal(M.levantar(r), 16)
  assert.ok(r.terminada)
  assert.deepEqual(r.tarjeta.map((f) => [f.n, f.golpes, f.lp]), [[15, 4, false], [16, null, true], [17, null, true]])
  const tot = M.totales(r.tarjeta)
  assert.equal(tot.lp, true)
  assert.equal(tot.vsPar, null)
  assert.equal(M.formatoPar(tot.vsPar), 'LP')
  assert.match(M.textoCompartir(r, true), /LP 💅 \(levantó en el 16\)/)
})

ok('tarjeta, formato y texto para el grupo', () => {
  const r = M.nuevaRonda({ apodo: 'Rorro', emoji: '🥃' }, fijo(0.5))
  r.golpes = 5
  M.cerrarHoyo(r, fijo(0.5))
  r.golpes = 3
  M.cerrarHoyo(r, fijo(0.5))
  r.golpes = 3
  M.cerrarHoyo(r, fijo(0.5))
  assert.ok(r.terminada)
  assert.deepEqual(M.totales(r.tarjeta), { golpes: 11, par: 11, vsPar: 0, lp: false })
  assert.equal(M.formatoPar(0), 'E')
  assert.equal(M.formatoPar(3), '+3')
  assert.equal(M.formatoPar(-2), '−2')
  assert.equal(M.nombreResultado(3, 4, false), 'BIRDIE')
  assert.equal(M.nombreResultado(1, 3, false), 'HOYO EN UNO')
  assert.match(M.textoCompartir(r, true), /🥃 Rorro \(HCP —\): E \(5 · 3 · 3\)/)
  assert.match(M.textoCompartir(r, false), /110 neto/)
  assert.match(M.textoCompartir(r, true), /0 robos/)
})


ok('ranking: menos golpes arriba; a igual golpes, el más rápido al milisegundo', () => {
  const m = (usuario, apodo, golpes, ms) => ({ usuario, apodo, emoji: '🥛', golpes, vsPar: golpes - 11, ms })
  const marcas = [
    m('Rorro', 'El Mago Rodal', 12, 90000),
    m('rorro', 'El Sueco', 11, 120000), // mismo usuario (sin importar mayúsculas): cuenta su mejor
    m('Fede', 'El Mago Rodal', 11, 119999),
    m('Mati', 'El Sueco', 10, 300000),
    m('Lechu', 'El Sueco', 11, 120001),
  ]
  const general = M.armarRanking(marcas)
  assert.deepEqual(general.map((x) => [x.pos, x.usuario, x.ms]), [[1, 'Mati', 300000], [2, 'Fede', 119999], [3, 'rorro', 120000], [4, 'Lechu', 120001]])
  const rodal = M.armarRanking(marcas, 'El Mago Rodal')
  assert.deepEqual(rodal.map((x) => x.usuario), ['Fede', 'Rorro'])
  assert.equal(M.formatoTiempo(83456), '1:23.456')
  assert.equal(M.formatoTiempo(5007), '0:05.007')
  // la marca de una vuelta: con tiempo y sin LP
  const r = M.nuevaRonda({ apodo: 'El Sueco', emoji: '🇸🇪' }, fijo(0.5))
  r.tarjeta = [{ n: 15, par: 4, golpes: 4, lp: false }, { n: 16, par: 4, golpes: 3, lp: false }, { n: 17, par: 3, golpes: 3, lp: false }]
  r.terminada = true
  assert.equal(M.marcaDe(r, ' Rorro '), null) // sin tiempo, no hay marca
  r.ms = 98765.4
  assert.deepEqual(M.marcaDe(r, ' Rorro '), { usuario: 'Rorro', apodo: 'El Sueco', emoji: '🇸🇪', golpes: 10, vsPar: -1, ms: 98765 })
  assert.ok(M.textoCompartir(r, true).includes('⏱ 1:38.765'))
  r.tarjeta[2] = { n: 17, par: 3, golpes: null, lp: true }
  r.lp = 17
  assert.equal(M.marcaDe(r, 'Rorro'), null) // LP no entra al ranking
})


ok('Lechu: contando todas las dadas (a 1,5 yd o menos)', () => {
  const r = { ...M.nuevaRonda({ apodo: 'Lechu', emoji: '🦉' }, fijo(0.5)), monos: [] }
  r.pelota = [h15.pin[0], h15.pin[1] + 1.4]
  r.lie = 'green'
  r.golpes = 2
  assert.ok(M.esDada(campo, r))
  M.darDada(r)
  assert.equal(r.golpes, 3)
  assert.deepEqual(r.pelota, h15.pin)
  r.pelota = [h15.pin[0], h15.pin[1] + 2]
  assert.ok(!M.esDada(campo, r))
  assert.ok(!M.esDada(campo, { ...r, jugador: { apodo: 'Rorro' }, pelota: [h15.pin[0], h15.pin[1] + 1] }))
})

ok('El Ninja: el primer LP no pierde la vuelta (+1 y al fairway, no más cerca)', () => {
  const r = { ...M.nuevaRonda({ apodo: 'El Ninja (Đ)', emoji: '🥷' }, fijo(0.5)), monos: [] }
  r.pelota = [...enArbol]
  r.lie = 'bosque'
  r.golpes = 2
  const antes = M.dist(r.pelota, M.hoyoActual(r).pin)
  assert.ok(M.tieneLPNinja(r))
  M.lpNinja(campo, r)
  assert.equal(r.golpes, 3)
  assert.ok(!r.terminada)
  assert.ok(['fairway', 'rough', 'tee'].includes(r.lie))
  assert.ok(M.dist(r.pelota, M.hoyoActual(r).pin) >= antes - 1)
  assert.ok(!M.tieneLPNinja(r)) // el segundo, sí pierde la vuelta
  // desde el tee no adelanta nada
  const t = { ...M.nuevaRonda({ apodo: 'El Ninja (Đ)', emoji: '🥷' }, fijo(0.5)), monos: [] }
  M.lpNinja(campo, t)
  assert.deepEqual(t.pelota, M.teeDe(t))
  assert.ok(!M.tieneLPNinja(M.nuevaRonda({ apodo: 'Rorro' }, fijo(0.5))))
})

ok('El Perro: greens sin caída y el perro la trae del bosque sin multa', () => {
  const r = { ...M.nuevaRonda({ apodo: 'El Perro', emoji: '🐕' }, fijo(0.5)), monos: [], viento: calma }
  r.golpes = 2
  const res = M.resolverReposo(campo, r, { pos: [...enArbol], eventos: [] }, fijo(0.99))
  assert.equal(res.tipo, 'perro')
  assert.equal(r.golpes, 2)
  assert.notEqual(r.lie, 'bosque')
  // el putt de costado que con caída se va, con el Perro va derecho
  r.pelota = [h15.pin[0], h15.pin[1] + 8]
  r.lie = 'green'
  const otro = { ...r, jugador: { apodo: 'Rorro' }, pelota: [...r.pelota] }
  const tiro = M.simular(quieto, M.golpear(quieto, r, angulo(r.pelota, h15.pin), 0.2, sinRuido()), h15.pin) // se queda corto
  const conCaida = M.simular(quieto, M.golpear(quieto, otro, angulo(otro.pelota, h15.pin), 0.2, sinRuido()), h15.pin)
  assert.ok(tiro.greenPlano && Math.abs(tiro.pos[0] - h15.pin[0]) < 0.01)
  assert.ok(Math.abs(conCaida.pos[0] - h15.pin[0]) > 0.3)
})

ok('Mugre: los monos la huelen de lejos; un pancho los distrae un segundo y vuelven', () => {
  const r = M.nuevaRonda({ apodo: 'Mugre', emoji: '💩' }, fijo(0.5))
  assert.equal(r.panchos, M.MUGRE.panchos)
  assert.equal(M.alertaDe(r), M.MUGRE.alerta)
  // un mono a 80 yd: a cualquiera no lo ve, a la Mugre sí
  r.pelota = [...h15.calle[2]]
  const s = r.monos[0]
  s.pos = [r.pelota[0] + 80, r.pelota[1]]
  assert.equal(M.despertarMonos([{ ...s, pos: [...s.pos] }], r.pelota), 0)
  assert.equal(M.despertarMonos(r.monos, r.pelota, M.alertaDe(r)) >= 1, true)
  // tira un pancho: cae del lado del mono, más allá; el mono va, come y vuelve
  const pos = M.tirarPancho(r)
  assert.ok(pos && pos[0] > s.pos[0] - 1 && r.panchos === M.MUGRE.panchos - 1)
  const d0 = M.dist(s.pos, r.pelota)
  for (let i = 0; i < 60; i++) M.moverMonos(r.monos, 1 / 30, r.pelota)
  assert.ok(M.dist(s.pos, r.pelota) > d0, 'se alejó de la pelota para comer')
  for (let i = 0; i < 400 && s.pancho; i++) M.moverMonos(r.monos, 1 / 30, r.pelota)
  assert.equal(s.pancho, null)
  let llego = null
  for (let i = 0; i < 900 && !llego; i++) llego = M.moverMonos(r.monos, 1 / 30, r.pelota)
  assert.ok(llego, 'después de comer vuelve por la pelota')
  // sin panchos o sin monos cazando, no tira
  r.panchos = 0
  assert.equal(M.tirarPancho(r), null)
  assert.equal(M.tirarPancho({ ...M.nuevaRonda({ apodo: 'Mugre' }, fijo(0.5)) }), null)
})

ok('Liberty: drive derecho; approach con el triple de error', () => {
  const r = { ...M.nuevaRonda({ apodo: 'Liberty', emoji: '🗽' }, fijo(0.5)), monos: [] }
  assert.equal(M.planTiro(quieto, r, angulo(h15.tee, h15.pin), 0.8).disp.ang, 0)
  r.pelota = [h15.pin[0], h15.pin[1] + 60]
  r.lie = 'fairway'
  const otro = { ...r, jugador: { apodo: 'Rorro' } }
  const a = M.planTiro(quieto, r, -Math.PI / 2, 0.3)
  const b = M.planTiro(quieto, otro, -Math.PI / 2, 0.3)
  assert.ok(a.approach && Math.abs(a.disp.ang / b.disp.ang - M.APPROACH.error) < 0.01)
})

ok('LG: después de un mal tiro no se enoja y el próximo sale sin error', () => {
  const r = { ...M.nuevaRonda({ apodo: 'LG', emoji: '📺', hcp: 11.1 }, fijo(0.5)), monos: [] }
  r.pelota = [...h15.calle[2]]
  r.lie = 'fairway'
  M.resolverReposo(campo, r, { pos: [...buscar('.', [0, 150, 219, 300])], eventos: [] }, fijo(0.5)) // al rough
  assert.ok(r.calma)
  assert.equal(M.planTiro(quieto, r, -Math.PI / 2, 0.5).disp.ang, 0)
  M.golpear(quieto, r, -Math.PI / 2, 0.5, sinRuido())
  assert.ok(!r.calma) // dura un solo golpe
  const dicho = M.comentar(fijo(0.1), { tipo: 'normal', terreno: 'rough' }, { eventos: [], modo: 'full', carry: 100, pos: [0, 0] }, h15, { apodo: 'LG' })
  assert.ok(M.RELATO.calma.includes(dicho.lg) && dicho.excusa === null)
})

ok('yardas reales: cada tee a sus yardas de la tarjeta; el color sale del handicap', () => {
  const tabla = { 15: [392, 376, 360], 16: [415, 395, 380], 17: [208, 188, 170] }
  for (const h of M.HOYOS) {
    const [az, bl, am] = tabla[h.n]
    assert.equal(Math.round(M.dist(h.tees.azul, h.pin) * h.escala), az)
    assert.equal(Math.round(M.dist(h.tees.blanca, h.pin) * h.escala), bl)
    assert.equal(Math.round(M.dist(h.tees.amarilla, h.pin) * h.escala), am)
  }
  assert.equal(M.colorTee({ hcp: 1.5 }), 'azul')
  assert.equal(M.colorTee({ hcp: 11 }), 'blanca')
  assert.equal(M.colorTee({ hcp: 22 }), 'amarilla')
  // HCP 22 (Fito): sale de las amarillas en todos los hoyos; el drive a fondo, ~265 con el rodaje
  const r = M.nuevaRonda({ apodo: 'Rorro', hcp: 22 }, fijo(0.5))
  assert.deepEqual(r.pelota, h15.tees.amarilla)
  const linea = angulo(r.pelota, h15.pin)
  const t = M.simular(quieto, M.golpear(quieto, { ...r, monos: [], viento: calma }, linea, 1, sinRuido()), h15.pin)
  const yd = M.dist(h15.tees.amarilla, t.pos) * h15.escala
  assert.ok(yd > 250 && yd < 280, `anduvo ${yd.toFixed(0)}`)
  r.tarjeta = []
  M.cerrarHoyo(r, fijo(0.5))
  assert.deepEqual(r.pelota, h16.tees.amarilla)
})

console.log('\nTodo verde.')
