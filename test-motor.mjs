// node test-motor.mjs — chequeos del motor de La Trampa del Mono.
import assert from 'node:assert/strict'
import * as M from './motor.js'
import { RULETA, DESBLOQUEO_TAIU, DESBLOQUEO_FITO, DESBLOQUEOS, PLANTEL } from './plantel.js'

const campo = M.crearCampo()
// para probar la física sola: sin monos cruzando y con greens planos
const quieto = { ...campo, hoyos: M.HOYOS.map((h) => ({ ...h, monos: [] })) }
const plano = { ...quieto, hoyos: quieto.hoyos.map((h) => ({ ...h, caida: [0, 0], caidas: null })) }
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

ok('Rodal: el Baby Draw y Una cortada al medio, apuntando afuera, vuelven a la línea', () => {
  const r = M.nuevaRonda({ apodo: 'El Mago Rodal', emoji: '🥛' }, fijo(0.5))
  r.monos = []
  r.viento = calma
  assert.equal(r.golpeMago, M.GOLPE_MAGO_INICIAL)
  const linea = angulo(h15.tee, h15.pin)
  const beta = (45 * Math.PI) / 180
  const enLinea = (pos) => h15.tee[0] + ((h15.pin[0] - h15.tee[0]) * (h15.tee[1] - pos[1])) / (h15.tee[1] - h15.pin[1])
  for (const [id, aim] of [['draw', linea + beta], ['cortada', linea - beta]]) {
    const rr = { ...r, pelota: [...h15.tee], lie: 'tee' }
    assert.ok(M.elegirGolpeMago(quieto, rr, id))
    // apuntando derecho a la bandera, la curva la saca de la línea
    const derecho = M.planTiro(quieto, rr, linea, 0.85)
    assert.ok(derecho.comba && derecho.control && Math.abs(derecho.cuerda - linea) > beta * 0.9)
    // apuntando afuera (a los pinos), vuelve y cae sobre la línea, sin chocar pinos en el vuelo
    const tiro = M.simular(quieto, M.golpear(quieto, rr, aim, 0.85, sinRuido()), h15.pin)
    assert.ok(!tiro.eventos.some((e) => e.tipo === 'palo'), id)
    assert.ok(Math.abs(tiro.pos[0] - enLinea(tiro.pos)) < 3, `${id}: quedó a ${(tiro.pos[0] - enLinea(tiro.pos)).toFixed(1)} yd de la línea`)
  }
  // un jugador sin habilidad tira recto (y no puede elegir golpes de mago)
  const otro = M.nuevaRonda({ apodo: 'Rorro', emoji: '🥃' }, fijo(0.5))
  assert.equal(M.planTiro(quieto, otro, linea + beta, 0.85).control, null)
  assert.equal(M.elegirGolpeMago(quieto, otro, 'flop'), false)
})

ok('Rodal: elige entre 4 golpes (Flop, Baby Draw, Una cortada al medio, Dibuje maestro) y el elegido queda', () => {
  const r = { ...M.nuevaRonda({ apodo: 'El Mago Rodal', emoji: '🥛' }, fijo(0.5)), monos: [], viento: calma }
  assert.deepEqual(M.GOLPES_MAGO.map((g) => g.nombre), ['Flop', 'Baby Draw', 'Una cortada al medio', 'Dibuje maestro'])
  const desde = [...h16.calle[1]]
  const linea = angulo(desde, h16.pin)
  const plan = (id) => {
    r.pelota = [...desde]
    r.lie = 'fairway'
    assert.ok(M.elegirGolpeMago(quieto, r, id))
    return M.planTiro(quieto, r, linea, 0.5)
  }
  // apuntando a la bandera: el Baby Draw cae a la izquierda (ángulo menor) y la cortada a la derecha
  assert.ok(plan('draw').cuerda < linea && plan('cortada').cuerda > linea)
  // el Flop vuela alto, más corto y casi no rueda
  const tiroDe = (id) => {
    plan(id)
    return M.simular(quieto, M.golpear(quieto, r, linea, 0.5, sinRuido()), h16.pin)
  }
  const flop = tiroDe('flop')
  const draw = tiroDe('draw')
  assert.ok(flop.hMax > draw.hMax * 2 && flop.carry < draw.carry)
  const rodada = (t) => M.dist(t.pos, [t.desde[0] + t.carryVec[0] + t.deriva[0], t.desde[1] + t.carryVec[1] + t.deriva[1]])
  assert.ok(rodada(flop) < 1 && rodada(draw) > rodada(flop) * 3, `${rodada(flop)} ${rodada(draw)}`)
  // el elegido queda para el próximo golpe (ya no se sortea)
  plan('cortada')
  M.golpear(quieto, r, linea, 0.5, Math.random)
  assert.equal(r.golpeMago, 'cortada')
  // en el green se elige el putt (draw o fade), y el golpe de afuera no se toca
  r.pelota = [h15.pin[0], h15.pin[1] + 4]
  r.lie = 'green'
  assert.equal(M.elegirGolpeMago(quieto, r, 'flop'), false)
  assert.ok(M.elegirGolpeMago(quieto, r, 'fade'))
  assert.equal(r.puttMago, 'fade')
  assert.equal(r.golpeMago, 'cortada')
})

ok('Rodal: el Dibuje maestro vuela por la línea dibujada (suavizada, por arriba de los pinos, hasta donde le da)', () => {
  const r = { ...M.nuevaRonda({ apodo: 'El Mago Rodal', emoji: '🥛' }, fijo(0.5)), monos: [], viento: calma }
  r.pelota = [...h15.tee]
  r.lie = 'tee'
  assert.ok(M.elegirGolpeMago(quieto, r, 'dibuje'))
  const b = h15.tee
  const linea = angulo(b, h15.pin)
  const en = (d, lado) => [b[0] + Math.cos(linea) * d + Math.cos(linea + Math.PI / 2) * lado, b[1] + Math.sin(linea) * d + Math.sin(linea + Math.PI / 2) * lado]
  // una curva: sale para un costado (por arriba de los pinos) y vuelve al medio de la calle
  const dibujo = [en(30, 25), en(60, 35), en(90, 25), en(120, 0)]
  const plan = M.planTiro(quieto, r, 0, 0, 0, 0, dibujo)
  assert.ok(plan.dibujo && plan.ruta && plan.comba)
  assert.ok(M.dist(plan.destino, en(120, 0)) < 0.5, 'cae donde termina la línea')
  const tiro = M.golpear(quieto, r, 0, 0, sinRuido(), 0, 0, dibujo)
  assert.ok(tiro.ruta)
  // en el medio del vuelo pasa por el costado (no en línea recta)
  let lejos = 0
  while (tiro.fase === 'vuelo') {
    M.avanzar(quieto, tiro, 1 / 60, h15.pin)
    const d = M.dist(tiro.pos, b)
    const lado = Math.abs((tiro.pos[0] - b[0]) * Math.sin(linea) - (tiro.pos[1] - b[1]) * Math.cos(linea))
    if (d > 40 && d < 100) lejos = Math.max(lejos, lado)
  }
  assert.ok(lejos > 20, `en el medio se fue ${lejos.toFixed(1)} yd al costado`)
  assert.ok(!tiro.eventos.some((e) => e.tipo === 'palo'))
  assert.ok(M.dist(tiro.pos, en(120, 0)) < 1.5, 'pica donde termina la línea')
  // un zigzag sale más suave: la línea pierde los picos
  const zig = [1, 2, 3, 4, 5, 6, 7, 8].map((k) => en(k * 10, k % 2 ? 8 : -8))
  const suave = M.suavizarRuta(b, zig)
  const pico = Math.max(...suave.slice(0, -6).map((p) => Math.abs((p[0] - b[0]) * Math.sin(linea) - (p[1] - b[1]) * Math.cos(linea)))) // (la punta queda donde soltaste)
  assert.ok(pico < 6, `el zigzag quedó con picos de ${pico.toFixed(1)} yd`)
  // más largo que lo que le da el carry: se corta ahí
  const lejisimo = M.planTiro(quieto, r, 0, 0, 0, 0, [en(900, 0)])
  const max = M.carryMaxDe(r.jugador.hcp, h15.par) / h15.escala
  assert.ok(Math.abs(lejisimo.carry - max) < 0.5 && M.dist(b, lejisimo.destino) <= max + 0.5)
  // una línea mínima (un toque) no es tiro
  assert.equal(M.planTiro(quieto, r, 0, 0, 0, 0, [en(0.5, 0)]).ruta, null)
})

ok('Rodal: el putt con draw dobla a la izquierda y con fade a la derecha', () => {
  const r = { ...M.nuevaRonda({ apodo: 'El Mago Rodal', emoji: '🥛' }, fijo(0.5)), monos: [] }
  const desde = [h15.pin[0], h15.pin[1] + 6]
  const entra = (putt, grados) => {
    for (let p = 0.01; p <= 0.6; p += 0.002) {
      const rr = { ...r, pelota: [...desde], lie: 'green', puttMago: putt }
      if (M.simular(plano, M.golpear(plano, rr, angulo(desde, h15.pin) + (grados * Math.PI) / 180, p, sinRuido()), h15.pin).embocada) return true
    }
    return false
  }
  // con draw, apuntando a la derecha del hoyo (ángulo mayor) entra; a la izquierda, no
  assert.ok(entra('draw', 12) && !entra('draw', -12) && !entra('draw', 0))
  assert.ok(entra('fade', -12) && !entra('fade', 12))
  // a los demás el putt les sale derecho
  const otro = { ...M.nuevaRonda({ apodo: 'Rorro', emoji: '🥃' }, fijo(0.5)), monos: [], pelota: [...desde], lie: 'green' }
  assert.equal(M.planTiro(plano, otro, 0, 0.2).giro, 0)
})

ok('Miguelón: la furia se carga de a media (calle, green, bogey) y llena revolea el palo: el próximo, sacado', () => {
  const nueva = () => ({ ...M.nuevaRonda({ apodo: 'Mike Queboni (Đ)', emoji: '🦍', hcp: 8 }, fijo(0.5)), monos: [], viento: calma })
  const tirar = (r, destino) => {
    // un tiro que termina justo en `destino` (sin error ni viento, a mano: lo dejamos ahí)
    const t = M.golpear(quieto, r, angulo(r.pelota, destino), 0.3, sinRuido())
    M.simular(quieto, t, M.hoyoActual(r).pin)
    t.pos = [...destino]
    t.alt = 0
    return M.resolverReposo(quieto, r, t, fijo(0.99))
  }
  const calle = h15.calle[2], green = [h15.pin[0] + 2, h15.pin[1] + 3], rough = [h15.calle[2][0] + 16, h15.calle[2][1]], bosque = enArbol
  // calle y green: no se carga
  let r = nueva()
  tirar(r, calle)
  tirar(r, green)
  assert.equal(r.furia?.nivel ?? 0, 0)
  // primero al rough: media; el segundo no llega al green: la otra media → se enoja
  r = nueva()
  tirar(r, rough)
  assert.deepEqual([r.furia.nivel, r.furia.enojado, r.furia.evento.motivo], [1, false, 'primero'])
  tirar(r, calle)
  assert.deepEqual([r.furia.nivel, r.furia.enojado, r.furia.evento.motivo, r.furia.evento.estalla], [2, true, 'segundo', true])
  // sacado: el próximo tiro tiene la dispersión más grande (más que el peor handicap) y la bomba, la peor
  const linea = angulo(r.pelota, h15.pin)
  const sacado = M.planTiro(quieto, r, linea, 0.6)
  const normal = M.planTiro(quieto, { ...r, furia: null }, linea, 0.6)
  assert.ok(sacado.furia && sacado.disp.ang > normal.disp.ang * 2)
  const peor = M.planTiro(quieto, { ...r, furia: null, jugador: { apodo: 'X', hcp: 36 } }, linea, 0.6)
  assert.ok(sacado.disp.ang > peor.disp.ang)
  // después de ese tiro, la barra vuelve a cero
  M.golpear(quieto, r, linea, 0.6, sinRuido())
  assert.deepEqual([r.furia.nivel, r.furia.enojado], [0, false])
  // el tercer tiro del hoyo ya no carga
  r = nueva()
  tirar(r, calle)
  tirar(r, green)
  tirar(r, bosque)
  assert.equal(r.furia?.nivel ?? 0, 0)
  // bogey o peor: media barra al cerrar el hoyo
  r = nueva()
  r.golpes = h15.par + 1
  M.cerrarHoyo(r, fijo(0.5))
  assert.deepEqual([r.furia.nivel, r.furia.evento.motivo], [1, 'bogey'])
  assert.equal(r.tirosHoyo, 0)
  // a los demás, nada
  const otro = { ...M.nuevaRonda({ apodo: 'Rorro', emoji: '🥃' }, fijo(0.5)), monos: [], viento: calma }
  tirar(otro, rough)
  assert.equal(otro.furia, undefined)
})

ok('Miguelón: la bomba (la goma llega más lejos) se abre; perfecta (del latido, como todos) llega al green', () => {
  const r = M.nuevaRonda({ apodo: 'Mike Queboni (Đ)', emoji: '🍯', hcp: 5 }, fijo(0.5))
  r.monos = []
  r.viento = calma
  const azul = h15.tees.azul
  assert.deepEqual(r.pelota, azul) // HCP 5: sale de las azules
  const linea = angulo(azul, h15.pin)
  const bomba = M.planTiro(quieto, r, linea, 1)
  // la bomba se abre: BOMBA.ang grados por el error del handicap (HCP 5: la mitad)
  assert.ok(bomba.bomba && Math.abs(bomba.disp.ang - ((M.BOMBA.ang * Math.PI) / 180) * M.errorDe(5)) < 1e-12)
  assert.ok(bomba.carry * h15.escala > 380)
  // soltada en el sweet spot: perfecta (con un cuarto del error); midiendo bien la distancia, termina en el green del 15
  const rr0 = { ...r, pelota: [...azul], lie: 'tee', golpes: 0 }
  assert.equal(M.golpear(quieto, { ...rr0, pelota: [...azul] }, linea, 1, sinRuido(), 0, 0, null, true).perfecta, true)
  const alGreen = Array.from({ length: 21 }, (_, i) => 0.8 + i * 0.01).some((p) => {
    const rr = { ...r, pelota: [...azul], lie: 'tee', golpes: 0 }
    return M.terreno(campo, M.simular(quieto, M.golpear(quieto, rr, linea, p, sinRuido(), 0, 0, null, true), h15.pin).pos).tipo === 'green'
  })
  assert.ok(alGreen)
  // sacado (la furia): el aro es casi imposible (más rápido y con una ventana chiquita) y, perfecto, igual se abre más
  // que una bomba normal
  assert.ok(M.FURIA.latido < 1 && M.FURIA.ventana < 0.5)
  const sacado = { ...rr0, pelota: [...azul], furia: { nivel: 0, enojado: true } }
  assert.ok(M.planTiro(quieto, sacado, linea, 1).disp.ang > bomba.disp.ang * 1.5)
  // por debajo de la zona de bomba es un drive normal (aunque más largo)
  const corto = M.planTiro(quieto, r, linea, 0.7, 0)
  assert.ok(!corto.bomba && corto.carry * h15.escala > M.carryDe(5) * 0.9)
})

ok('Rodal: Lucas solo lo adula, pegue como pegue, y con frases del tiro que pegó', () => {
  const rodal = { apodo: 'El Mago Rodal', emoji: '🥛' }
  const full = { eventos: [], modo: 'full', carry: 150, pos: [0, 0] }
  const lejos = [h15.pin[0], h15.pin[1] + 200]
  const cerca = [h15.pin[0], h15.pin[1] + 40]
  const dice = (res, tiro, ctx, hoyo = h15) => M.comentar(fijo(0.3), res, tiro, hoyo, rodal, ctx)
  // drive (tee de par 4)
  const drive = dice({ tipo: 'normal', terreno: 'fairway' }, full, { desde: h15.tee, lieDesde: 'tee' })
  assert.equal(drive.lg, null)
  assert.ok(M.ADULACION.drive.bueno.includes(drive.lucas))
  assert.ok(M.ADULACION.drive.malo.includes(dice({ tipo: 'normal', terreno: 'rough' }, full, { desde: h15.tee, lieDesde: 'tee' }).lucas))
  // tee del par 3: hierro
  assert.ok(M.ADULACION.hierro.bueno.includes(dice({ tipo: 'normal', terreno: 'green' }, full, { desde: h17.tee, lieDesde: 'tee' }, h17).lucas))
  // segundo tiro largo: hierro; cerca: approach
  assert.ok(M.ADULACION.hierro.bueno.includes(dice({ tipo: 'normal', terreno: 'fairway' }, full, { desde: lejos, lieDesde: 'fairway' }).lucas))
  assert.ok(M.ADULACION.approach.malo.includes(dice({ tipo: 'normal', terreno: 'bunker' }, full, { desde: cerca, lieDesde: 'fairway' }).lucas))
  // putt: nunca "bomba"
  const putt = { eventos: [], modo: 'putt', pos: [h15.pin[0], h15.pin[1] + 0.8] }
  const p1 = dice({ tipo: 'normal', terreno: 'green' }, putt, { desde: [h15.pin[0], h15.pin[1] + 8], lieDesde: 'green' })
  assert.ok(M.ADULACION.putt.bueno.includes(p1.lucas))
  assert.ok(!/bomba|drive/i.test(p1.lucas))
  assert.ok(M.ADULACION.putt.malo.includes(dice({ tipo: 'normal', terreno: 'green' }, { ...putt, pos: [h15.pin[0], h15.pin[1] - 5] }, { lieDesde: 'green' }).lucas))
  assert.ok(M.ADULACION.embocada.putt.includes(dice({ tipo: 'embocada' }, putt, { lieDesde: 'green' }).lucas))
  assert.ok(M.ADULACION.embocada.chip.includes(dice({ tipo: 'embocada' }, full, { desde: cerca, lieDesde: 'rough' }).lucas))
  assert.ok(M.ADULACION.mono.includes(dice({ tipo: 'mono-malo' }, full, {}).lucas))
  assert.equal(dice({ tipo: 'normal', terreno: 'rough' }, full, {}).excusa, null)
  assert.ok(M.ADULACION.resultado.BOGEY.includes(M.fraseResultado(fijo(0.3), 'BOGEY', rodal)))
  // a los demás LG los relata arriba, sin Lucas
  const otro = M.comentar(fijo(0.3), { tipo: 'normal', terreno: 'rough' }, full, h15, { apodo: 'Rorro' })
  assert.ok(otro.lg && !otro.lucas)
})

ok('Mati (El Sueco): el drive con el pulso de Fito; después, la flecha que atraviesa los árboles', () => {
  const r = { ...M.nuevaRonda({ apodo: 'El Sueco', emoji: '🇸🇪', hcp: 1.5 }, fijo(0.5)), monos: [], viento: calma }
  const linea = angulo(r.pelota, h15.pin)
  // el drive: la línea se sacude como la de Fito; en el embudo sale derecha (y sin imán)
  const pico = M.planTiro(quieto, r, linea, 1, 0, M.AGUILA.periodo / 4)
  assert.ok(pico.aguila && !pico.aguila.enVentana && !pico.flecha)
  assert.ok(Math.abs(pico.cuerda - linea - (M.AGUILA.amplitud * Math.PI) / 180) < 1e-6)
  const plan = M.planTiro(quieto, r, linea, 1, 0, 0)
  assert.ok(plan.aguila.enVentana && plan.disp.ang === 0 && !plan.iman)
  assert.ok(Math.abs(plan.carry * h15.escala - M.carryDe(1.5)) < 1e-6)
  assert.equal(M.dificultad(1.5).nombre, 'Paseo')
  // drive total (vuelo + rodaje) a fondo y en el embudo, en yardas reales: casi 300
  const t0 = [...r.pelota]
  const largo = M.simular(quieto, M.golpear(quieto, { ...r, pelota: [...t0], lie: 'tee' }, linea, 1, sinRuido(), 0, 0), h15.pin)
  const yd = M.dist(t0, largo.pos) * h15.escala
  assert.ok(yd > 280 && yd < 310, `anduvo ${yd.toFixed(0)} yd`)
  // del segundo tiro en adelante: la flecha. Derecho, sin sacudón, y atraviesa los pinos
  const desde = [h15.tee[0] - 18, h15.tee[1] - 60] // en el bosque de la izquierda, con pinos adelante
  const rr = { ...r, pelota: [...desde], lie: 'rough' }
  const fl = M.planTiro(quieto, rr, angulo(desde, h15.pin), 0.6, 0, M.AGUILA.periodo / 4)
  // (de lejos, casi sin error de dirección: le queda solo el mínimo del juego corto, que a esta distancia es nada)
  assert.ok(fl.flecha && !fl.aguila && fl.disp.ang < 0.01 && fl.cuerda === angulo(desde, h15.pin))
  assert.equal(M.pinoEnLaSalida(quieto, desde, fl), null)
  // contra la fila de pinos de al lado: un tiro normal choca, la flecha pasa
  const cruza = angulo(desde, [desde[0] + 40, desde[1]])
  const normal = M.simular(quieto, M.golpear(quieto, { ...rr, jugador: { apodo: 'Rorro', hcp: 1.5 }, pelota: [...desde] }, cruza, 0.4, sinRuido()), h15.pin)
  const flecha = M.golpear(quieto, { ...rr, pelota: [...desde] }, cruza, 0.4, sinRuido())
  assert.ok(flecha.flecha && flecha.hMax < normal.hMax)
  M.simular(quieto, flecha, h15.pin)
  assert.ok(normal.eventos.some((e) => e.tipo === 'palo'), 'el tiro normal tenía que chocar un pino')
  assert.ok(!flecha.eventos.some((e) => e.tipo === 'palo'), 'la flecha chocó un pino')
  // el putt, derecho como siempre
  const putt = M.planTiro(plano, { ...r, pelota: [h15.pin[0], h15.pin[1] + 4], lie: 'green' }, 0, 0.2)
  assert.ok(putt.putt && putt.recto)
})

ok('Juanpa (el Mapache): le pega increíble, pero una de dos aparece un árbol, una ráfaga o un carrito', () => {
  const nueva = () => ({ ...M.nuevaRonda({ apodo: 'Mapache', emoji: '🦝', hcp: 3 }, fijo(0.5)), monos: [], viento: calma, pelota: [...h15.calle[1]], lie: 'fairway' })
  const linea = angulo(h15.calle[1], h15.pin)
  // la mitad del error de su handicap
  const r0 = nueva()
  const suyo = M.planTiro(quieto, r0, linea, 0.5)
  const otro = M.planTiro(quieto, { ...r0, jugador: { apodo: 'X', hcp: 3 } }, linea, 0.5)
  assert.ok(Math.abs(suyo.disp.ang - otro.disp.ang * M.SORPRESA.error) < 1e-12)
  // una de dos veces (fuera del green) aparece algo; en el green, nunca
  let veces = 0
  for (let i = 0; i < 400; i++) if (M.golpear(quieto, nueva(), linea, 0.5, M.rngDesde(i)).sorpresa) veces++
  assert.ok(veces > 150 && veces < 250, `${veces} de 400`)
  // se anuncia antes de pegar, y sale lo anunciado, para el lado anunciado
  for (let i = 0; i < 60; i++) {
    const r = nueva()
    const prox = M.prepararSorpresa(quieto, r, M.rngDesde(500 + i))
    const t = M.golpear(quieto, r, linea, 0.5, M.rngDesde(900 + i))
    assert.equal(t.sorpresa?.tipo ?? null, prox?.tipo ?? null)
    if (prox) {
      const lado = t.sorpresa.vec[0] * Math.sin(linea) - t.sorpresa.vec[1] * Math.cos(linea) // + izquierda, − derecha
      assert.ok(prox.lado === 1 ? lado < 0 : lado > 0, `lado ${prox.lado}`)
      assert.ok(Math.abs(Math.hypot(...t.sorpresa.vec) * h15.escala - prox.m) < 1e-6)
    }
    assert.equal(r.proxSorpresa, undefined)
  }
  // después de una sorpresa, el próximo tiro sale limpio (y el siguiente vuelve a poder)
  for (let i = 0; i < 40; i++) {
    const r = nueva()
    M.prepararSorpresa(quieto, r, M.rngDesde(i), 'rafaga')
    assert.ok(M.golpear(quieto, r, linea, 0.5, M.rngDesde(i)).sorpresa)
    r.pelota = [...h15.calle[1]]
    assert.equal(M.prepararSorpresa(quieto, r, M.rngDesde(i)), null)
    assert.equal(M.golpear(quieto, r, linea, 0.5, M.rngDesde(i)).sorpresa, undefined)
    assert.equal(r.sorpresaAnterior, false)
  }
  const enGreen = { ...nueva(), pelota: [h15.pin[0], h15.pin[1] + 5], lie: 'green' }
  for (let i = 0; i < 40; i++) assert.equal(M.golpear(quieto, { ...enGreen, pelota: [...enGreen.pelota] }, 0, 0.2, M.rngDesde(i)).sorpresa, undefined)
  // cada sorpresa, forzada
  const con = (tipo) => {
    const r = nueva()
    const t = M.golpear(quieto, r, linea, 0.6, sinRuido())
    const limpio = M.simular(quieto, { ...t, pos: [...t.pos], eventos: [], sorpresa: null }, h15.pin)
    t.sorpresa = M.sortearSorpresa(quieto, r, t, M.rngDesde(7), tipo)
    return { t: M.simular(quieto, t, h15.pin), limpio }
  }
  // el árbol: la frena en el aire (mucho antes de donde caía) y queda ahí
  const arbol = con('arbol')
  assert.ok(arbol.t.eventos.some((e) => e.tipo === 'arbol') && M.dist(arbol.t.pos, arbol.t.sorpresa.pos) < 1e-9)
  assert.ok(M.dist(arbol.t.desde, arbol.t.pos) < M.dist(arbol.limpio.desde, arbol.limpio.pos) * 0.85)
  // la ráfaga: la corre de costado lo que dice
  const rafaga = con('rafaga')
  assert.ok(rafaga.t.eventos.some((e) => e.tipo === 'rafaga'))
  const largo = Math.hypot(...rafaga.t.sorpresa.vec)
  assert.ok(largo * h15.escala >= M.SORPRESA.rafaga[0] - 1e-9 && largo * h15.escala <= M.SORPRESA.rafaga[1] + 1e-9)
  // el carrito: donde pica se la lleva de costado y la deja (sin rodar), y nunca afuera
  const carrito = con('carrito')
  assert.ok(carrito.t.eventos.some((e) => e.tipo === 'carrito'))
  const de = carrito.t.sorpresa.de
  assert.ok(M.dist(carrito.t.pos, [de[0] + carrito.t.sorpresa.vec[0], de[1] + carrito.t.sorpresa.vec[1]]) < 1e-6)
  assert.notEqual(M.terreno(quieto, carrito.t.pos).tipo, 'afuera')
})

ok('Tito Esperanza: maneja el viento en vivo (dirección y fuerza, de 0 a 30) y la pelota en el aire le hace caso; los demás no', () => {
  const r = { ...M.nuevaRonda({ apodo: 'Tito', emoji: '🌬️', hcp: 16 }, fijo(0.5)), monos: [] }
  assert.ok(M.controlarViento(r, -Math.PI / 2, 22.4))
  assert.deepEqual([r.viento.kmh, +r.viento.ang.toFixed(6)], [22, +(1.5 * Math.PI).toFixed(6)])
  M.controlarViento(r, 0, 99)
  assert.equal(r.viento.kmh, M.FISICA.vientoMax)
  M.controlarViento(r, 1, -5)
  assert.equal(r.viento.kmh, 0)
  // el viento que eligió es el que pega: a favor, más lejos que en contra
  const linea = angulo(h15.tee, h15.pin)
  const con = (ang) => { const rr = { ...r, pelota: [...h15.tee], lie: 'tee' }; M.controlarViento(rr, ang, 30); return M.simular(quieto, M.golpear(quieto, rr, linea, 0.8, sinRuido()), h15.pin) }
  assert.ok(M.dist(h15.tee, con(linea).pos) > M.dist(h15.tee, con(linea + Math.PI).pos) + 5)
  // en vivo: con la pelota en el aire, el viento que pone la mueve para ese lado (izquierda o derecha de la línea)
  const vuelo = (ang) => {
    const rr = { ...r, pelota: [...h15.tee], lie: 'tee' }
    M.controlarViento(rr, 0, 0)
    const t = M.golpear(quieto, rr, linea, 0.8, sinRuido())
    assert.ok(t.vivo && t.deriva[0] === 0)
    // tres swipes para ese lado, cada medio segundo
    for (let k = 0; k < 3; k++) {
      for (let i = 0; i < 30; i++) M.avanzar(quieto, t, 1 / 60, h15.pin)
      assert.ok(M.rafagaTito(rr, t, ang, 20))
      assert.ok(M.vientoVivo(t).kmh <= M.FISICA.vientoMax + 1e-9)
    }
    return M.simular(quieto, t, h15.pin)
  }
  // la ráfaga se calma sola
  {
    const rr = { ...r, pelota: [...h15.tee], lie: 'tee' }
    M.controlarViento(rr, 0, 0)
    const t = M.golpear(quieto, rr, linea, 0.8, sinRuido())
    M.rafagaTito(rr, t, 0, 30)
    for (let i = 0; i < 120; i++) M.avanzar(quieto, t, 1 / 60, h15.pin)
    assert.ok(M.vientoVivo(t).kmh < 30 * 0.2)
  }
  const recto = (() => { const rr = { ...r, pelota: [...h15.tee], lie: 'tee' }; M.controlarViento(rr, 0, 0); return M.simular(quieto, M.golpear(quieto, rr, linea, 0.8, sinRuido()), h15.pin) })()
  const lado = (p) => (p[0] - h15.tee[0]) * Math.sin(linea) - (p[1] - h15.tee[1]) * Math.cos(linea)
  const izq = vuelo(linea - Math.PI / 2), der = vuelo(linea + Math.PI / 2)
  assert.ok(lado(izq.pos) > lado(recto.pos) + 8 && lado(der.pos) < lado(recto.pos) - 8, `${lado(izq.pos).toFixed(1)} ${lado(recto.pos).toFixed(1)} ${lado(der.pos).toFixed(1)}`)
  const otro = { ...M.nuevaRonda({ apodo: 'Rorro', emoji: '🥃' }, fijo(0.5)), monos: [] }
  const antes = { ...otro.viento }
  assert.equal(M.controlarViento(otro, 0, 0), false)
  assert.equal(M.soplarEnVivo(otro, null, 0, 10), false)
  assert.equal(M.rafagaTito(otro, { vivo: { wx: 0, wy: 0 } }, 0, 10), false)
  assert.deepEqual(otro.viento, antes)
})

ok('Tito en el green: el putt es ultra sensible al dedo (el desvío de la línea al hoyo ×3,5, la fuerza ×4)', () => {
  const ref = 1
  assert.deepEqual(M.puttDeTito(ref, 0.1, ref), { ang: ref, u: 0.1 * M.TITO_PUTT.fuerza })
  const d = 0.02 // un pelito al costado
  assert.ok(Math.abs(M.puttDeTito(ref + d, 0.2, ref).ang - (ref + d * M.TITO_PUTT.angulo)) < 1e-9)
  assert.ok(Math.abs(M.puttDeTito(ref - d, 0.2, ref).ang - (ref - d * M.TITO_PUTT.angulo)) < 1e-9)
  // del otro lado del círculo no se desarma: a lo sumo da media vuelta
  const lejos = M.puttDeTito(ref + 3, 0.2, ref).ang - ref
  assert.ok(Math.abs(lejos) <= Math.PI + 1e-9)
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

ok('Fito: cerca del green, si el chip cae en el green, entra (aunque no vaya apuntado)', () => {
  const desde = [h15.pin[0] + 2, h15.pin[1] + 24]
  const fito = () => ({ ...M.nuevaRonda({ apodo: 'Fito (Đ)', emoji: '🦅', hcp: 22 }, fijo(0.5)), monos: [], viento: calma, pelota: [...desde], lie: M.terreno(campo, desde).tipo })
  const alPin = angulo(desde, h15.pin)
  const p = (14 * h15.escala) / (M.carryDe(22) * (M.FISICA.factorLie[fito().lie] ?? 1))
  // apuntando torcido (15°): cae en el green y el imán la mete igual
  const torcido = M.simular(quieto, M.golpear(quieto, fito(), alPin + 0.26, p, sinRuido(), 0, 0), h15.pin)
  assert.ok(torcido.iman?.aplicado)
  assert.equal(torcido.embocada, true)
  const perfecto = M.simular(quieto, M.golpear(quieto, fito(), alPin, p, sinRuido(), 0, 0), h15.pin)
  assert.equal(perfecto.embocada, true)
  // lejos del green (más de 40 yd) no hay imán
  const lejos = [h15.pin[0], h15.pin[1] + 120]
  const r = { ...fito(), pelota: lejos, lie: M.terreno(campo, lejos).tipo }
  assert.ok(!M.golpear(quieto, r, angulo(lejos, h15.pin), 0.3, sinRuido(), 0, 0).iman)
})

ok('al apuntar se marca el árbol que pega en la salida (y no si pasa por arriba)', () => {
  // un árbol con pasto libre 5 yd abajo, desde donde pegarle de frente
  let arbol = null
  for (let y = 80; y < 380 && !arbol; y++) for (let x = 40; x < 200 && !arbol; x++) {
    const p = [x + 0.5, y + 0.5]
    const desde = [p[0], p[1] + 5]
    if (M.celda(campo, p) === 't' && ['.', 'f'].includes(M.celda(campo, desde)) && [1, 2, 3, 4].every((k) => M.celda(campo, [p[0], p[1] + k]) !== 't')) arbol = { p, desde }
  }
  assert.ok(arbol, 'hay un árbol para probar')
  const r = { ...M.nuevaRonda({ apodo: 'X', emoji: '⛳', hcp: 7 }, fijo(0.5)), monos: [], viento: calma, pelota: arbol.desde, lie: M.terreno(campo, arbol.desde).tipo }
  const plan = M.planTiro(quieto, r, -Math.PI / 2, 0.5)
  const marca = M.pinoEnLaSalida(quieto, arbol.desde, plan)
  assert.ok(marca, 'lo marca')
  assert.ok(M.dist(marca.pos, arbol.p) < 1.3)
  // y en el vuelo de verdad (sin error) le pega
  const tiro = M.simular(quieto, M.golpear(quieto, { ...r, pelota: [...arbol.desde] }, -Math.PI / 2, 0.5, sinRuido()), h15.pin)
  assert.ok(tiro.eventos.some((e) => e.tipo === 'palo'))
  // para el otro lado no hay árbol; el putt nunca
  assert.equal(M.pinoEnLaSalida(quieto, arbol.desde, { ...plan, putt: true }), null)
})

ok('la caída del green cambia por zonas, fluida (de 2 a 4 por hoyo)', () => {
  for (const h of M.HOYOS) {
    assert.ok(h.caidas.length >= 2 && h.caidas.length <= 4, `hoyo ${h.n}`)
    // en cada zona, casi su caída
    for (const z of h.caidas) {
      const c = M.caidaEn(h, z.p), k = z.fuerte ? M.CAIDA.fuerte : 1
      assert.ok(Math.hypot(c[0] - z.v[0] * k, c[1] - z.v[1] * k) < 0.25 * k, `hoyo ${h.n} zona ${z.p}`)
    }
    // un sector pronunciado por green: ahí cae más que en cualquier otra zona
    const fuertes = h.caidas.filter((z) => z.fuerte)
    assert.equal(fuertes.length, 1, `hoyo ${h.n}: un sector pronunciado`)
    const f = Math.hypot(...M.caidaEn(h, fuertes[0].p))
    for (const z of h.caidas.filter((x) => !x.fuerte)) assert.ok(f > 1.6 * Math.hypot(...M.caidaEn(h, z.p)), `hoyo ${h.n}: el pronunciado cae más`)
    // fluida: medio paso cambia poco
    const [a, b] = h.caidas
    const m = [(a.p[0] + b.p[0]) / 2, (a.p[1] + b.p[1]) / 2]
    const c1 = M.caidaEn(h, m)
    const c2 = M.caidaEn(h, [m[0] + 0.5, m[1]])
    assert.ok(Math.hypot(c2[0] - c1[0], c2[1] - c1[1]) < 0.1)
  }
  // un putt dobla distinto según la zona del green
  const h = M.HOYOS[1]
  const putt = (desde) => M.simular(quieto, M.lanzar(quieto, { pelota: desde, angulo: 0, potencia: 0.12, viento: calma, putt: true, rng: sinRuido() }), h.pin)
  for (const k of [0, 2]) assert.equal(M.terreno(campo, [h.caidas[k].p[0] - 2, h.caidas[k].p[1]]).tipo, 'green')
  const z0 = putt([h.caidas[0].p[0] - 2, h.caidas[0].p[1]])
  const z2 = putt([h.caidas[2].p[0] - 2, h.caidas[2].p[1]])
  assert.ok(z0.pos[1] > h.caidas[0].p[1] && z2.pos[1] < h.caidas[2].p[1], 'doblan para lados distintos')
})

ok('en el par 3 (el 17) no hay driver: a fondo llega de 240 yd (hcp 0) a 200 (hcp 24 o más)', () => {
  assert.equal(M.carryMaxDe(0, 3), 240)
  assert.equal(M.carryMaxDe(24, 3), 200)
  assert.equal(M.carryMaxDe(30, 3), 200)
  assert.ok(M.carryMaxDe(12, 3) > 200 && M.carryMaxDe(12, 3) < 240)
  assert.equal(M.carryMaxDe(5, 4), M.carryDe(5))
  for (const j of [{ apodo: 'X', emoji: '⛳', hcp: 1.5 }, { apodo: 'Mike Queboni (Đ)', emoji: '🍯', hcp: 5 }]) {
    const r = { ...M.nuevaRonda(j, fijo(0.5)), monos: [] }
    r.idx = 2
    r.pelota = [...M.teeDe(r)]
    r.lie = 'tee'
    const plan = M.planTiro(quieto, r, -Math.PI / 2, 1, 1)
    assert.ok(plan.carry * h17.escala <= 240 + 1e-6, `${j.apodo}: ${plan.carry * h17.escala}`)
  }
})

ok('desde el bunker la línea muestra el tiro entero, pero la pelota llega a la mitad', () => {
  const r = { ...M.nuevaRonda({ apodo: 'X', emoji: '⛳', hcp: 7 }, fijo(0.5)), monos: [], viento: calma }
  const desde = [h15.pin[0], h15.pin[1] + 60]
  const ver = (lie) => M.planTiro(quieto, { ...r, pelota: desde, lie }, -Math.PI / 2, 0.5).carry
  assert.equal(ver('bunker'), ver('fairway')) // se ve igual que del fairway
  const sale = (lie) => M.lanzar(quieto, { pelota: desde, angulo: -Math.PI / 2, potencia: 0.5, viento: calma, lie, rng: sinRuido(), plan: M.planTiro(quieto, { ...r, pelota: desde, lie }, -Math.PI / 2, 0.5) }).carry
  assert.ok(Math.abs(sale('bunker') - sale('fairway') / 2) < 1e-6)
})

ok('en la salida de cada hoyo los monos no vienen a robar; después sí', () => {
  const r = M.nuevaRonda({ apodo: 'X', emoji: '⛳', hcp: 7 }, fijo(0.5))
  r.idx = 2
  r.lie = 'tee'
  r.golpes = 0
  r.pelota = [...M.teeDe(r)]
  // un mono justo al lado del tee del 17
  r.monos = [{ ...r.monos[0], pos: [r.pelota[0] + 5, r.pelota[1]], modo: 'ronda' }]
  assert.ok(M.esSalida(r))
  assert.equal(M.despertarMonosDe(r), 0)
  assert.notEqual(r.monos[0].modo, 'caza')
  // en el segundo tiro, desde el mismo lugar, sí vienen
  r.golpes = 1
  r.lie = 'rough'
  assert.equal(M.despertarMonosDe(r), 1)
  assert.equal(r.monos[0].modo, 'caza')
})

ok('la bandera cambia de lugar cada ronda: siempre en el green, a 6 yd o más del borde, y el color dice el tercio', () => {
  const vistos = new Set()
  let seed = 1
  for (let i = 0; i < 60; i++) {
    const rng = M.rngDesde(seed++)
    const r = M.sortearBanderas(M.nuevaRonda({ apodo: 'X', emoji: '⛳', hcp: 7 }, rng), rng)
    for (const h of r.hoyos) {
      const t = M.terreno(campo, h.pin)
      assert.equal(t.tipo, 'green', `hoyo ${h.n} en ${h.pin}`)
      assert.equal(t.hoyo, h.n)
      // a 6 yd o más del borde, para todos lados
      for (let a = 0; a < 2 * Math.PI; a += Math.PI / 8) {
        const q = [h.pin[0] + Math.cos(a) * 5.5, h.pin[1] + Math.sin(a) * 5.5]
        assert.equal(M.terreno(campo, q).tipo, 'green', `hoyo ${h.n}: el borde está a menos de 6 yd`)
      }
      assert.equal(M.colorBandera(h, h.pin), h.bandera)
      vistos.add(`${h.n}-${h.bandera}`)
    }
    // el tee no se mueve con la bandera
    assert.deepEqual(M.teeDe(r), M.HOYOS[0].tees[r.tee])
    assert.equal(M.hoyoActual(r), r.hoyos[0])
  }
  // en los tres hoyos salen los tres colores (roja adelante, blanca al medio, azul al fondo)
  for (const n of [15, 16, 17]) for (const c of ['roja', 'blanca', 'azul']) assert.ok(vistos.has(`${n}-${c}`), `${n} ${c}`)
  // la roja está más cerca del tee que la azul
  const h = M.HOYOS[1]
  const { tercios } = M.posicionesBandera(h)
  const prom = (l) => l.reduce((s, p) => s + M.dist(p, h.azul), 0) / l.length
  assert.ok(prom(tercios[0]) < prom(tercios[1]) && prom(tercios[1]) < prom(tercios[2]))
})

ok('Marcos: el carrito acelera, dobla, frena solo, no atraviesa árboles y llega a la pelota', () => {
  const r = M.nuevaRonda({ apodo: 'El Flaco Ordoñez', emoji: '🏎️', hcp: 7.2 }, fijo(0.5))
  assert.ok(M.usaCarrito(r) && r.carro)
  assert.ok(!M.usaCarrito(M.nuevaRonda({ apodo: 'Rorro', emoji: '🥃' }, fijo(0.5))))
  // por el fairway del 15, para arriba (hacia el green)
  const c = M.crearCarro([48, 200], -Math.PI / 2)
  for (let i = 0; i < 120; i++) M.manejar(campo, c, { acelerar: true }, 1 / 60)
  assert.ok(c.v > 8, `va a ${c.v}`)
  assert.ok(c.pos[1] < 190, 'avanzó para arriba')
  // suelta el acelerador: se frena solo
  for (let i = 0; i < 400; i++) M.manejar(campo, c, {}, 1 / 60)
  assert.equal(c.v, 0)
  // dobla a la derecha andando
  const a0 = c.ang
  for (let i = 0; i < 30; i++) M.manejar(campo, c, { acelerar: true, der: true }, 1 / 60)
  assert.ok(c.ang > a0)
  // reversa
  const q = M.crearCarro([48, 200], -Math.PI / 2)
  for (let i = 0; i < 60; i++) M.manejar(campo, q, { reversa: true }, 1 / 60)
  assert.ok(q.v < 0 && q.pos[1] > 200)
  // contra los árboles: nunca queda adentro de uno
  // un lugar de pasto con un árbol 6 yd a la derecha (y pasto libre en el medio)
  let ini = null
  for (let y = 100; y < 380 && !ini; y++) for (let x = 30; x < 190 && !ini; x++) {
    const p = [x + 0.5, y + 0.5]
    if (M.celda(campo, p) === 't' && [2, 3, 4, 5, 6, 7, 8, 9, 10].every((k) => ['.', 'f'].includes(M.celda(campo, [p[0] - k, p[1]])))) ini = [p[0] - 9, p[1]]
  }
  assert.ok(ini)
  const t = M.crearCarro(ini, 0)
  let choco = false
  for (let i = 0; i < 300; i++) { if (M.manejar(campo, t, { acelerar: true }, 1 / 60) === 'choque') choco = true; assert.notEqual(M.celda(campo, t.pos), 't') }
  assert.ok(choco, 'chocó contra el árbol')
  // frena: con el freno para mucho antes que soltando
  const fr = M.crearCarro([48, 200], -Math.PI / 2), su = M.crearCarro([48, 200], -Math.PI / 2)
  for (const k of [fr, su]) { k.v = 14 }
  for (let i = 0; i < 30; i++) { M.manejar(campo, fr, { frenar: true }, 1 / 60); M.manejar(campo, su, {}, 1 / 60) }
  assert.equal(fr.v, 0)
  assert.ok(su.v > 8)
  // en una cancha toda de fairway (para tener lugar): de menos a más, hasta el triple
  const liso = { ...campo, cancha: { ...campo.cancha, filas: campo.cancha.filas.map((f) => 'f'.repeat(f.length)) } }
  const rapido = M.crearCarro([110, 440], -Math.PI / 2)
  const vel = []
  for (let i = 1; i <= 60 * 16; i++) { M.manejar(liso, rapido, { acelerar: true }, 1 / 60); if (i % 60 === 0) { vel.push(rapido.v); rapido.pos = [110, 400] } } // (cada segundo, de vuelta abajo: lo que importa es la velocidad)
  assert.ok(vel[0] <= M.CARRITO.vmax + 0.1, `al segundo, ${vel[0]}`) // primero, lo normal
  assert.ok(vel[1] > M.CARRITO.vmax && vel[1] < M.CARRITO.turbo * 0.6, `a los 2 s, ${vel[1]}`) // el turbo arranca y sigue subiendo
  assert.ok(vel[2] > vel[1] && vel[3] > vel[2], 'de menos a más')
  assert.ok(vel[5] > M.CARRITO.turbo * 0.95 && vel[5] <= M.CARRITO.turbo, `a los 6 s, ${vel[5]}`) // en ~5 s, el triple
  assert.ok(vel[15] <= M.CARRITO.turbo)
  // colea: rápido y doblando la cola se va; despacio, no
  const co = M.crearCarro([110, 300], -Math.PI / 2)
  co.v = 30
  let coleo = false
  for (let i = 0; i < 40; i++) { M.manejar(liso, co, { acelerar: true, der: true }, 1 / 60); if (co.colea) coleo = true }
  assert.ok(coleo, 'rápido, colea')
  const lento = M.crearCarro([110, 300], -Math.PI / 2)
  lento.v = 8
  for (let i = 0; i < 40; i++) { M.manejar(liso, lento, { acelerar: true, der: true }, 1 / 60); assert.ok(!lento.colea, 'despacio no colea') }
  // freno de mano: frenando y doblando, también colea
  const fm = M.crearCarro([110, 300], -Math.PI / 2)
  fm.v = 14
  let coleoFreno = false
  for (let i = 0; i < 30; i++) { M.manejar(liso, fm, { frenar: true, izq: true }, 1 / 60); if (fm.colea) coleoFreno = true }
  assert.ok(coleoFreno, 'freno y doblo: colea')
  // si los monos se la llevan y vuelve al tee, el carrito vuelve con él (no maneja de vuelta)
  const rr = M.nuevaRonda({ apodo: 'El Flaco Ordoñez', emoji: '🏎️', hcp: 7.2 }, fijo(0.5))
  rr.pelota = [48, 200]; rr.lie = 'fairway'; rr.golpes = 2
  rr.carro = M.crearCarro([50, 203])
  M.monosLlegaron(rr)
  assert.deepEqual(rr.pelota, M.teeDe(rr))
  assert.ok(M.carroLlego(campo, rr.carro, rr.pelota), 'el carrito está en el tee')
  assert.equal(rr.carro.v, 0)
  // llegar a la pelota
  assert.ok(M.carroLlego(campo, M.crearCarro([50, 200]), [52, 202]))
  assert.ok(!M.carroLlego(campo, M.crearCarro([50, 200]), [50, 220]))
  assert.ok(M.carroLlego(campo, M.crearCarro([ini[0] + 1, ini[1]]), [ini[0] + 9, ini[1]]), 'en el bosque, el último tramo a pie')
})

ok('Marcos: los monos persiguen el carrito; si pisás uno queda aplastado y es +1 golpe', () => {
  const r = M.nuevaRonda({ apodo: 'El Flaco Ordoñez', emoji: '🏎️', hcp: 7.2 }, fijo(0.5))
  r.carro = M.crearCarro([48, 200], -Math.PI / 2)
  r.monos = [{ ...r.monos[0], pos: [48, 170], modo: 'ronda', espera: 0 }, { ...r.monos[1], pos: [120, 400], modo: 'ronda', espera: 0 }]
  assert.equal(M.perseguirCarro(r), 1) // el cercano sale a buscar el carrito
  for (let i = 0; i < 120; i++) M.moverMonos(r.monos, 1 / 60, r.carro.pos)
  assert.ok(M.dist(r.monos[0].pos, r.carro.pos) < 30, 'se acerca al carrito')
  // quieto, no lo pisa
  r.monos[0].pos = [48, 199]
  assert.deepEqual(M.atropellar(r), [])
  // andando, sí: +1 golpe y queda aplastado (no camina más ni roba)
  const antes = r.golpes
  r.carro.v = 10
  assert.equal(M.atropellar(r).length, 1)
  assert.equal(r.golpes, antes + 1)
  assert.equal(r.monos[0].modo, 'aplastado')
  assert.ok(!M.monoActivo(r.monos[0]))
  const quieto = [...r.monos[0].pos]
  M.moverMonos(r.monos, 1, r.carro.pos)
  assert.deepEqual(r.monos[0].pos, quieto)
  assert.equal(M.despertarMonos(r.monos, quieto), 0)
  // el mismo mono no se cuenta dos veces
  assert.equal(M.atropellar(r).length, 0)
  assert.equal(r.aplastados, 1)
})

ok('Marcos: "¿jugaste con Rorro?" es una apuesta: 50 y 50 de −1 o +1 al total', () => {
  const vuelta = () => {
    const r = M.nuevaRonda({ apodo: 'El Flaco Ordoñez', emoji: '🏎️', hcp: 7.2 }, fijo(0.5))
    r.tarjeta.push({ n: 15, par: 4, golpes: 4, lp: false }, { n: 16, par: 4, golpes: 5, lp: false }, { n: 17, par: 3, golpes: 3, lp: false })
    return r
  }
  const sin = vuelta()
  assert.equal(M.totales(sin.tarjeta).golpes, 12)
  const gana = vuelta()
  assert.equal(M.apostarRorro(gana, fijo(0.2)), -1)
  assert.equal(M.totales(gana.tarjeta).golpes, 11)
  assert.equal(M.totales(gana.tarjeta).vsPar, 0)
  const pierde = vuelta()
  assert.equal(M.apostarRorro(pierde, fijo(0.8)), 1)
  assert.equal(M.totales(pierde.tarjeta).golpes, 13)
  // más o menos la mitad y la mitad
  let menos = 0
  const rng = M.rngDesde(7)
  for (let i = 0; i < 400; i++) if (M.apostarRorro(vuelta(), rng) < 0) menos++
  assert.ok(menos > 160 && menos < 240, `${menos} de 400`)
})

ok('Maxi (Grandpa): una vez por vuelta invoca a Deme y el próximo tiro entra de una, pegue como pegue (nunca desde el tee)', () => {
  const maxi = { apodo: 'Grandpa', emoji: '👴', hcp: 6.3 }
  const r = { ...M.nuevaRonda(maxi, fijo(0.5)), monos: [], viento: { ang: 0, kmh: 30 } }
  // en el tee, no
  assert.equal(r.lie, 'tee')
  assert.ok(!M.puedeInvocarDeme(r))
  assert.ok(!M.invocarDeme(r))
  // desde el fairway, lejos, para el lado equivocado y a media fuerza: entra igual
  r.pelota = [h15.pin[0] + 3, h15.pin[1] + 120]
  r.lie = M.terreno(campo, r.pelota).tipo
  assert.ok(M.invocarDeme(r))
  assert.ok(!M.puedeInvocarDeme(r), 'una sola vez')
  const t = M.simular(quieto, M.golpear(quieto, r, Math.PI / 2, 0.37, sinRuido()), h15.pin)
  assert.ok(t.deme)
  assert.equal(t.embocada, true)
  // el siguiente tiro ya es normal
  r.pelota = [h15.pin[0], h15.pin[1] + 100]
  r.lie = 'fairway'
  const normal = M.simular(quieto, M.golpear(quieto, r, Math.PI / 2, 0.37, sinRuido()), h15.pin)
  assert.ok(!normal.deme && !normal.embocada)
  assert.ok(!M.invocarDeme(r), 'ya la usó en la vuelta')
  // en el green: el putt entra solo
  const g = { ...M.nuevaRonda(maxi, fijo(0.5)), monos: [] }
  g.pelota = [h15.pin[0] + 4, h15.pin[1] + 6]
  g.lie = 'green'
  assert.ok(M.invocarDeme(g))
  assert.equal(M.simular(quieto, M.golpear(quieto, g, 0, 1, sinRuido()), h15.pin).embocada, true)
  // los demás no tienen a Deme
  assert.ok(!M.puedeInvocarDeme({ ...M.nuevaRonda({ apodo: 'Rorro' }, fijo(0.5)), lie: 'fairway' }))
})

ok('match: las mismas condiciones para los dos (viento y banderas), sea quien sea cada uno', () => {
  const c1 = M.condicionesMatch(12345), c2 = M.condicionesMatch(12345), otra = M.condicionesMatch(999)
  assert.deepEqual(c1, c2)
  assert.notDeepEqual(c1.pines, otra.pines)
  // el Mago (que gasta azar en su golpe) y el Sueco juegan con lo mismo
  const a = M.aplicarMatch(M.sortearBanderas(M.nuevaRonda({ apodo: 'El Mago Rodal', emoji: '🥛', hcp: 11 }, Math.random), Math.random), c1)
  const b = M.aplicarMatch(M.nuevaRonda({ apodo: 'El Sueco', emoji: '🇸🇪', hcp: 1.5 }, Math.random), c1)
  assert.deepEqual(a.hoyos.map((h) => h.pin), b.hoyos.map((h) => h.pin))
  assert.deepEqual(a.viento, b.viento)
  // al pasar de hoyo, el viento del match (no uno al azar)
  for (const r of [a, b]) { r.golpes = 4; M.cerrarHoyo(r, Math.random) }
  assert.deepEqual(a.viento, c1.vientos[1])
  assert.deepEqual(b.viento, c1.vientos[1])
  assert.deepEqual(M.hoyoActual(a).pin, c1.pines[1].pin)
})

ok('match: el fantasma se graba liviano y se reproduce donde iba, sin deslizarse cuando estuvo quieto', () => {
  const g = []
  M.grabar(g, 0, 0, [10, 400], 0, 0)
  M.grabar(g, 50, 0, [10, 399], 0, 1) // muy pronto: no
  M.grabar(g, 100, 0, [10, 380], 5, 1)
  M.grabar(g, 200, 0, [10, 360], 8, 1)
  M.grabar(g, 300, 0, [10, 360], 8, 1) // igual: no
  M.grabar(g, 5000, 0, [10, 300], 3, 2) // se movió mucho después
  assert.equal(g.length, 4)
  const mitad = M.fantasmaEn(g, 150)
  assert.ok(Math.abs(mitad.pos[1] - 370) < 1e-9)
  assert.equal(mitad.golpes, 1)
  // entre 200 y 5000 estuvo quieta: no se desliza
  assert.deepEqual(M.fantasmaEn(g, 3000).pos, [10, 360])
  assert.ok(M.fantasmaEn(g, 9000).fin)
  assert.ok(!M.fantasmaEn(g, 100).fin)
  assert.equal(M.fantasmaEn([], 10), null)
})

ok('match: gana el de menos golpes; a igual golpes, el más rápido; LP pierde', () => {
  assert.equal(M.ganadorMatch({ golpes: 11, ms: 90000 }, { golpes: 12, ms: 60000 }), 1)
  assert.equal(M.ganadorMatch({ golpes: 12, ms: 60000 }, { golpes: 12, ms: 70000 }), 1)
  assert.equal(M.ganadorMatch({ golpes: 12, ms: 70000 }, { golpes: 12, ms: 60000 }), -1)
  assert.equal(M.ganadorMatch({ golpes: null }, { golpes: 20, ms: 1 }), -1)
  assert.equal(M.ganadorMatch({ golpes: null }, { golpes: null }), 0)
  // los dos levantaron: gana el que aguantó más; el que abandonó (sin tiempo) pierde; sin tiempo los dos, empate
  assert.equal(M.ganadorMatch({ golpes: null, lp: true, ms: 95000 }, { golpes: null, lp: true, ms: 40000 }), 1)
  assert.equal(M.ganadorMatch({ golpes: null, lp: true, ms: 40000 }, { golpes: null, lp: true, ms: 95000 }), -1)
  assert.equal(M.ganadorMatch({ golpes: null, lp: true, ms: 40000 }, { golpes: null, lp: true, ms: null }), 1)
  assert.equal(M.ganadorMatch({ golpes: null, lp: true, ms: null }, { golpes: null, lp: true, ms: null }), 0)
  assert.equal(M.porAguante({ golpes: null, lp: true, ms: 95000 }, { golpes: null, lp: true, ms: 40000 }), true)
  assert.equal(M.porAguante({ golpes: 12, ms: 95000 }, { golpes: null, lp: true, ms: 40000 }), false)
  // terminar siempre le gana a levantar, aunque haya tardado más
  assert.equal(M.ganadorMatch({ golpes: 30, ms: 999999 }, { golpes: null, lp: true, ms: 1000000 }), 1)
  assert.equal(M.ganadorMatch({ golpes: 12, ms: 5 }, { golpes: 12, ms: 5 }), 0)
})

ok('match: se define por tiempo solo con los mismos golpes y distinto tiempo', () => {
  assert.equal(M.porTiempo({ golpes: 10, ms: 60000 }, { golpes: 10, ms: 70000 }), true)
  assert.equal(M.porTiempo({ golpes: 10, ms: 70000 }, { golpes: 10, ms: 60000 }), true)
  assert.equal(M.porTiempo({ golpes: 10, ms: 60000 }, { golpes: 11, ms: 50000 }), false)
  assert.equal(M.porTiempo({ golpes: 10, ms: 60000 }, { golpes: 10, ms: 60000 }), false)
  assert.equal(M.porTiempo({ golpes: null }, { golpes: null }), false)
  assert.equal(M.porTiempo({ golpes: null }, { golpes: 10, ms: 1 }), false)
})

ok('el marcador del fantasma: golpes por hoyo en vivo, sacados del acumulado de la grabación', () => {
  // [ms, hoyo, x, y, alt, golpes acumulados]
  const g = [[0, 0, 1, 1, 0, 0], [1000, 0, 2, 2, 0, 1], [5000, 0, 3, 3, 0, 4], [6000, 1, 4, 4, 0, 4], [8000, 1, 5, 5, 0, 6], [9000, 2, 6, 6, 0, 6], [12000, 2, 7, 7, 0, 9], [12500, 3, 7, 7, 0, 9]]
  assert.deepEqual(M.marcadorFantasma(g, -5).porHoyo, [null, null, null])
  assert.deepEqual(M.marcadorFantasma(g, 1500), { porHoyo: [1, null, null], idx: 0, total: 1, fin: false })
  assert.deepEqual(M.marcadorFantasma(g, 7000), { porHoyo: [4, 0, null], idx: 1, total: 4, fin: false })
  assert.deepEqual(M.marcadorFantasma(g, 8500).porHoyo, [4, 2, null])
  assert.deepEqual(M.marcadorFantasma(g, 99999), { porHoyo: [4, 2, 3], idx: 2, total: 9, fin: true })
  assert.deepEqual(M.marcadorFantasma([], 100).porHoyo, [null, null, null])
})

ok('la dispersión sale del handicap: 0 con HCP 0, en línea recta hasta HCP 25, y de ahí todos igual', () => {
  assert.equal(M.dificultad(0).error, 0)
  assert.equal(M.dificultad(-2).error, 0) // un "plus" cuenta como 0
  const tope = M.DISPERSION_HCP.error
  assert.ok(Math.abs(M.dificultad(12.5).error - tope / 2) < 1e-9) // la mitad del tope, la mitad de la dispersión
  assert.ok(M.dificultad(5).error < M.dificultad(10).error && M.dificultad(10).error < M.dificultad(20).error)
  assert.equal(M.dificultad(25).error, tope)
  assert.equal(M.dificultad(30).error, tope)
  assert.equal(M.dificultad(54).error, tope)
  // con HCP 0 el tiro y el putt no tienen error: va exacto adonde apunta (sin viento)
  const linea = angulo(h15.tee, h15.pin)
  const ronda = (hcp) => ({ ...M.nuevaRonda({ apodo: 'X', emoji: '⛳', hcp }, fijo(0.5)), monos: [] })
  const plan = M.planTiro(quieto, ronda(0), linea, 0.8)
  assert.equal(plan.disp.ang, 0)
  assert.equal(plan.disp.carry, 0)
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
  // cuánto corre el viento el pique (yardas)
  const deriva = (potencia, kmh) => M.lanzar(quieto, { pelota: h15.tee, angulo: a, potencia, viento: { ang: 0, kmh }, lie: 'tee', rng: sinRuido() }).deriva[0]
  const sin = M.simular(quieto, M.lanzar(quieto, { pelota: h15.tee, angulo: a, potencia: 0.8, viento: calma, lie: 'tee', rng: sinRuido() }), h15.pin)
  const con = M.simular(quieto, M.lanzar(quieto, { pelota: h15.tee, angulo: a, potencia: 0.8, viento: { ang: 0, kmh: 20 }, lie: 'tee', rng: sinRuido() }), h15.pin)
  assert.ok(con.pos[0] - sin.pos[0] > 5, 'la pelota termina corrida')
  assert.ok(deriva(0.8, 20) > 10, 'el tiro largo se lo lleva')
  // más largo, mucho más: el doble de largo, cuatro veces la deriva
  assert.ok(Math.abs(deriva(0.8, 20) / deriva(0.4, 20) - 4) < 0.6)
  // un approach de menos de 50 yd casi ni se mueve, aun con viento fuerte
  assert.ok(deriva(45 / M.FISICA.carryMax, 30) < 1.5)
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

ok('por el medio, sin venir muy fuerte, entra de una (sin corbata); muy fuerte salta por arriba', () => {
  const pelota = [h15.pin[0] + 0.1, h15.pin[1] + 4]
  // con fuerza para pasarse ~3 yardas: entra derecho
  const t = M.simular(plano, M.lanzar(plano, { pelota, angulo: -Math.PI / 2, potencia: 7 / 32, viento: calma, putt: true, rng: sinRuido() }), h15.pin)
  assert.equal(t.embocada, true)
  assert.ok(!t.vuelta, 'sin corbata')
  // para pasarse ~6 yardas: salta por arriba, tampoco corbata
  const f = M.simular(plano, M.lanzar(plano, { pelota, angulo: -Math.PI / 2, potencia: 10 / 32, viento: calma, putt: true, rng: sinRuido() }), h15.pin)
  assert.notEqual(f.embocada, true)
  assert.ok(!f.vuelta && f.eventos.some((e) => e.tipo === 'labio'))
})

ok('la corbata: pasada por un costado de la boca, da la vuelta, se frena y queda cortita', () => {
  const pelota = [h15.pin[0] + 0.4, h15.pin[1] + 4]
  // con fuerza para pasarse ~4 yardas
  const t = M.simular(plano, M.lanzar(plano, { pelota, angulo: -Math.PI / 2, potencia: 8.2 / 32, viento: calma, putt: true, rng: sinRuido() }), h15.pin)
  assert.notEqual(t.embocada, true)
  assert.ok(t.vuelta?.hecha, 'dio la vuelta')
  assert.ok(t.eventos.some((e) => e.tipo === 'vuelta'))
  assert.ok(t.vuelta.s && Math.abs(t.vuelta.ang - Math.atan2(0, 0.4)) > Math.PI / 2, 'giró más de un cuarto')
  const d = M.dist(t.pos, h15.pin)
  assert.ok(d > M.FISICA.bocaHoyo && d < 1.6, `quedó a ${d.toFixed(2)} yd`)
})

ok('la corbata justa: da la vuelta y entra', () => {
  const pelota = [h15.pin[0] + 0.4, h15.pin[1] + 4]
  const t = M.simular(plano, M.lanzar(plano, { pelota, angulo: -Math.PI / 2, potencia: 6.6 / 32, viento: calma, putt: true, rng: sinRuido() }), h15.pin)
  assert.ok(t.vuelta?.hecha)
  assert.equal(t.embocada, true)
})

ok('chip in: un tiro completo que cae en el hoyo puede quedar adentro de aire', () => {
  assert.equal(M.chanceClavada(0), M.CHIP.clavada)
  assert.ok(M.chanceClavada(0.4) > 0 && M.chanceClavada(0.4) < M.CHIP.clavada)
  assert.equal(M.chanceClavada(M.FISICA.bocaHoyo), 0)
  // buscar un tiro (sin error) que caiga justo en el hoyo desde ~60 yd, con suerte a favor
  // desde la calle, 40 yd antes del green, en la línea del tee a la bandera
  const dl = M.dist(h15.azul, h15.pin)
  const u = [(h15.pin[0] - h15.azul[0]) / dl, (h15.pin[1] - h15.azul[1]) / dl]
  const desde = [h15.pin[0] - u[0] * 40, h15.pin[1] - u[1] * 40]
  const ang = Math.atan2(u[1], u[0])
  let hecho = null
  for (let p = 0.05; p < 0.9 && !hecho; p += 0.0005) {
    const t = M.lanzar(quieto, { pelota: desde, angulo: ang, potencia: p, viento: calma, lie: 'fairway', rng: sinRuido() })
    const sim = { ...t, pos: [...t.pos] }
    M.simular(quieto, sim, h15.pin)
    if (sim.eventos.some((e) => e.tipo === 'clavada')) hecho = sim
  }
  assert.ok(hecho, 'alguno entra de aire')
  assert.equal(hecho.embocada, true)
})

ok('chip in rodando: más rápido que un putt tiene chance, cuanto más centrado y lento, más', () => {
  assert.equal(M.chanceRodando(0.1, M.CHIP.max), 0)
  assert.ok(M.chanceRodando(0.05, 4) > M.chanceRodando(0.05, 8))
  assert.ok(M.chanceRodando(0.05, 6) > M.chanceRodando(0.5, 6))
  const t = { desde: [1, 2], carryVec: [3, 4] }
  const u = M.suerteDe(t)
  assert.ok(u >= 0 && u < 1 && u === M.suerteDe(t), 'la suerte es fija para el mismo tiro')
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
  // desde la SDGApp manda el usuario de la app: dos "Juan" distintos no se pisan, y el mismo uid sí se junta
  const app = [
    { ...m('Juan', 'El Sueco', 11, 100000), uid: 'a' },
    { ...m('Juan', 'El Sueco', 12, 100000), uid: 'b' },
    { ...m('Juan', 'El Sueco', 10, 200000), uid: 'a' },
  ]
  assert.deepEqual(M.armarRanking(app).map((x) => [x.uid, x.golpes]), [['a', 10], ['b', 12]])
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


ok('El clima: se sortea (la nieve, 1 de cada 100) y en un match sale de la semilla, igual para los dos', () => {
  const veces = {}
  const N = 20000
  for (let i = 0; i < N; i++) { const id = M.sortearClima(M.rngDesde(i * 7919 + 13)); veces[id] = (veces[id] ?? 0) + 1 }
  for (const [id, c] of Object.entries(M.CLIMAS)) assert.ok(Math.abs((veces[id] ?? 0) / N - c.prob) < 0.012, `${id}: ${veces[id]}`)
  assert.ok(Math.abs(Object.values(M.CLIMAS).reduce((a, c) => a + c.prob, 0) - 1) < 1e-9)
  // el match: mismo clima y mismos charcos con la misma semilla; el viento y las banderas, como antes
  const a = M.condicionesMatch(123456), b = M.condicionesMatch(123456)
  assert.equal(a.clima, b.clima)
  assert.equal(a.semillaClima, b.semillaClima)
  const rv = M.rngDesde(123456)
  assert.deepEqual(a.vientos, M.HOYOS.map(() => M.vientoAleatorio(rv)))
  const r1 = M.ponerClima(campo, M.nuevaRonda({ apodo: 'Rorro' }, fijo(0.5)), 'lluvia', a.semillaClima)
  const r2 = M.ponerClima(campo, M.nuevaRonda({ apodo: 'Lechu' }, fijo(0.5)), 'lluvia', a.semillaClima)
  assert.deepEqual(r1.clima.charcos, r2.clima.charcos)
  // los charcos, en la calle (fairway) de cada hoyo, sin pisarse
  for (const hoyo of r1.clima.charcos) {
    assert.equal(hoyo.length, M.CLIMAS.lluvia.charcos)
    for (const q of hoyo) assert.equal(M.celda(campo, q.pos), 'f')
  }
  // la lluvia intensa: sin monos y con viento fuerte; el sol: los monos duermen la siesta
  const t = M.ponerClima(campo, M.nuevaRonda({ apodo: 'Rorro' }, fijo(0)), 'tormenta', 1)
  assert.equal(t.monos.length, 0)
  assert.ok(t.viento.kmh >= M.CLIMAS.tormenta.vientoMin)
  const sol = M.ponerClima(campo, M.nuevaRonda({ apodo: 'Rorro' }, fijo(0.5)), 'soleado', 1)
  assert.ok(sol.monos.length > 0 && sol.monos.every((m) => m.siesta === M.CLIMAS.soleado.siesta))
})

ok('El clima en la cancha: rueda más o menos, vuela más o menos, greens rápidos o lentos y los charcos la frenan', () => {
  const linea = angulo(h15.calle[1], h15.pin)
  const drive = (id) => {
    const r = { ...M.nuevaRonda({ apodo: 'Rorro', emoji: '🥃', hcp: 10 }, fijo(0.5)), monos: [], viento: calma, pelota: [...h15.calle[1]], lie: 'fairway' }
    if (id) { M.ponerClima(plano, r, id, 77); r.clima.charcos = r.clima.charcos.map(() => []) } // sin charcos, para medir la rodada
    const plan = M.planTiro(plano, r, linea, 0.6)
    const t = M.simular(plano, M.golpear(plano, r, linea, 0.6, sinRuido()), h15.pin)
    return { plan, rodada: M.dist(t.pos, [r.pelota[0], r.pelota[1]]), t }
  }
  const normal = drive(null), seco = drive('seco'), mojado = drive('mojado'), nieve = drive('nieve'), sol = drive('soleado'), lluvia = drive('lluvia')
  // el carry, en el plan (se ve al apuntar)
  assert.ok(Math.abs(sol.plan.carry / normal.plan.carry - M.CLIMAS.soleado.carry) < 1e-9)
  assert.ok(Math.abs(lluvia.plan.carry / normal.plan.carry - M.CLIMAS.lluvia.carry) < 1e-9)
  // la rodada después del pique: seco > normal > mojado > nieve (casi nada)
  const rueda = (x) => M.dist(x.t.pos, x.plan.destino)
  assert.ok(rueda(seco) > rueda(normal) * 1.4, `${rueda(seco)} ${rueda(normal)}`)
  assert.ok(rueda(mojado) < rueda(normal) * 0.6, `${rueda(mojado)} ${rueda(normal)}`)
  assert.ok(rueda(nieve) < rueda(normal) * 0.25, `${rueda(nieve)} ${rueda(normal)}`)
  // los putts: con lluvia se queda corto; con sol se pasa
  const putt = (id) => {
    const r = { ...M.nuevaRonda({ apodo: 'Rorro', emoji: '🥃' }, fijo(0.5)), monos: [], lie: 'green', pelota: [h15.pin[0], h15.pin[1] + 12] }
    if (id) M.ponerClima(plano, r, id, 3)
    const t = M.simular(plano, M.golpear(plano, r, -Math.PI / 2, 0.25, sinRuido()), null) // hacia el hoyo (sin hoyo): siempre en el green
    return M.dist(t.pos, [h15.pin[0], h15.pin[1] + 12])
  }
  assert.ok(putt('lluvia') < putt(null) * 0.92 && putt('soleado') > putt(null) * 1.1, `${putt('lluvia')} ${putt(null)} ${putt('soleado')}`)
  // el charco: si cae en uno, ahí queda
  const r = { ...M.nuevaRonda({ apodo: 'Rorro', emoji: '🥃', hcp: 10 }, fijo(0.5)), monos: [], viento: calma, pelota: [...h15.calle[1]], lie: 'fairway' }
  M.ponerClima(plano, r, 'lluvia', 5)
  const destino = M.planTiro(plano, r, linea, 0.6).destino
  r.clima.charcos[0] = [{ pos: [...destino], r: 3, ang: 0 }]
  const t = M.simular(plano, M.golpear(plano, r, linea, 0.6, sinRuido()), h15.pin)
  assert.ok(t.eventos.some((e) => e.tipo === 'charco'))
  assert.ok(M.dist(t.pos, destino) < 3)
  // a Joaco el green lento no le cambia nada: de 3 metros la mete igual (el imán usa el mismo roce)
  const lechu = { ...M.nuevaRonda({ apodo: 'Lechu', emoji: '🦉' }, fijo(0.5)), monos: [], lie: 'green', pelota: [h15.pin[0], h15.pin[1] + 3] }
  M.ponerClima(plano, lechu, 'tormenta', 9)
  assert.equal(M.simular(plano, M.golpear(plano, lechu, -Math.PI / 2, 0.05, fijo(0.9)), h15.pin).embocada, true)
})

ok('El MODO PRO del match: va marcado en la semilla y la ronda lo sabe (los dos lados juegan igual)', () => {
  for (const sem of [0, 1, 123456789, 0xffffffff, 0xb0ca, 0x8000b0ca]) {
    const pro = M.semillaPro(sem)
    assert.ok(M.esPro(pro) && pro >= 0 && pro <= 0xffffffff && Number.isInteger(pro))
    assert.equal(pro >>> 16, sem >>> 16) // conserva el resto de la semilla
  }
  // de 100.000 semillas al azar, casi ninguna es PRO sin querer (1 en 65.536)
  let sin = 0
  const rng = M.rngDesde(42)
  for (let i = 0; i < 100000; i++) if (M.esPro(Math.floor(rng() * 4294967296))) sin++
  assert.ok(sin <= 6, `${sin}`)
  const r = M.aplicarMatch(M.nuevaRonda({ apodo: 'Rorro' }, fijo(0.5)), M.condicionesMatch(M.semillaPro(987654)))
  assert.equal(r.pro, true)
  assert.equal(M.aplicarMatch(M.nuevaRonda({ apodo: 'Rorro' }, fijo(0.5)), M.condicionesMatch(987654)).pro, false)
  assert.ok(M.CLIMAS[M.condicionesMatch(M.semillaPro(987654)).clima])
})

ok('El ranking PRO: la vuelta en MODO PRO va marcada en el detalle y se separa del normal', () => {
  assert.equal(M.esMarcaPro({ detalle: { hoyos: [4, 4, 3], pro: true } }), true)
  for (const m of [{}, { detalle: null }, { detalle: { hoyos: [4] } }, { detalle: { pro: 'true' } }, null]) assert.equal(M.esMarcaPro(m), false)
  const marcas = [
    { usuario: 'A', apodo: 'Rorro', golpes: 12, ms: 90000, detalle: { pro: true } },
    { usuario: 'B', apodo: 'Rorro', golpes: 11, ms: 90000 },
    { usuario: 'A', apodo: 'Rorro', golpes: 10, ms: 90000 },
  ]
  const pro = M.armarRanking(marcas.filter(M.esMarcaPro))
  const normal = M.armarRanking(marcas.filter((m) => !M.esMarcaPro(m)))
  assert.deepEqual(pro.map((m) => [m.usuario, m.golpes]), [['A', 12]])
  assert.deepEqual(normal.map((m) => [m.usuario, m.golpes]), [['A', 10], ['B', 11]])
})

ok('El clima, tiro a tiro: el palo que resbala, la pelota con barro y el viento que cambia (igual en los dos lados de un match)', () => {
  const nueva = (id) => {
    const r = { ...M.nuevaRonda({ apodo: 'Rorro', emoji: '🥃', hcp: 10 }, fijo(0.5)), viento: calma, pelota: [...h15.calle[1]], lie: 'fairway' }
    return M.ponerClima(plano, r, id, 11)
  }
  const linea = angulo(h15.calle[1], h15.pin)
  // el palo que resbala: sale de la semilla del clima, el hoyo y el golpe (igual en los dos lados de un match) y la pega finita
  let resbalones = 0
  const conSemilla = (sem) => { const r = { ...M.nuevaRonda({ apodo: 'Rorro', emoji: '🥃', hcp: 10 }, fijo(0.5)), viento: calma, pelota: [...h15.calle[1]], lie: 'fairway' }; return M.ponerClima(plano, r, 'tormenta', sem) }
  for (let i = 0; i < 1000; i++) if (M.golpear(plano, conSemilla(i), linea, 0.6, M.rngDesde(i)).resbalo) resbalones++
  assert.ok(Math.abs(resbalones / 1000 - M.CLIMAS.tormenta.resbalon) < 0.04, `${resbalones}`)
  for (let i = 0; i < 20; i++) assert.equal(M.golpear(plano, conSemilla(i), linea, 0.6, M.rngDesde(1)).resbalo, M.golpear(plano, conSemilla(i), linea, 0.6, M.rngDesde(2)).resbalo)
  const sem = [...Array(200).keys()].find((i) => M.golpear(plano, conSemilla(i), linea, 0.6, fijo(0.5)).resbalo)
  const finita = M.planTiro(plano, conSemilla(sem), linea, 0.6)
  const tr = M.golpear(plano, conSemilla(sem), linea, 0.6, sinRuido())
  assert.ok(Math.abs(Math.hypot(...tr.carryVec) / finita.carry - M.CLIMA_EFECTO.resbalonCarry) < 0.02, `${Math.hypot(...tr.carryVec) / finita.carry}`)
  for (let i = 0; i < 100; i++) assert.notEqual(M.golpear(plano, nueva('lluvia'), linea, 0.6, M.rngDesde(i)).resbalo, true)
  // el barro: queda en la calle con barro (a veces) y el próximo tiro sale con más error
  let conBarro = 0
  for (let i = 0; i < 1000; i++) { const r = nueva('mojado'); M.climaTrasTiro(plano, r, M.rngDesde(i)); if (r.barro) conBarro++ }
  assert.ok(Math.abs(conBarro / 1000 - M.CLIMAS.mojado.barro) < 0.04, `${conBarro}`)
  const r = nueva('mojado')
  r.barro = true
  const t = M.golpear(plano, r, linea, 0.6, sinRuido())
  assert.ok(t.barro && t.eventos.some((e) => e.tipo === 'barro') && !r.barro)
  // nublado: el viento cambia después de cada tiro; con la misma semilla y el mismo golpe, el mismo viento
  const a = nueva('nuboso'), b = nueva('nuboso')
  a.golpes = b.golpes = 2
  M.climaTrasTiro(plano, a, M.rngDesde(1)); M.climaTrasTiro(plano, b, M.rngDesde(999))
  assert.deepEqual(a.viento, b.viento)
  const antes = { ...a.viento }
  a.golpes = 3
  M.climaTrasTiro(plano, a, M.rngDesde(1))
  assert.notDeepEqual(a.viento, antes)
  // sin clima, nada
  const sin = { ...M.nuevaRonda({ apodo: 'Rorro' }, fijo(0.5)), lie: 'fairway' }
  assert.equal(M.climaTrasTiro(plano, sin, fijo(0)), null)
})

ok('Juanpa: si la iba a meter, con chance 35% sale un mapache del hoyo, la frena y la deja casi dada', () => {
  const nueva = () => ({ ...M.nuevaRonda({ apodo: 'Mapache', emoji: '🦝', hcp: 3 }, fijo(0.5)), monos: [], viento: calma, lie: 'green', pelota: [h15.pin[0], h15.pin[1] + 4] })
  // la chance (en cualquier tiro, también en el green); a los demás, nunca
  let veces = 0
  for (let i = 0; i < 600; i++) if (M.golpear(plano, nueva(), -Math.PI / 2, 0.2, M.rngDesde(i)).mapache) veces++
  assert.ok(veces > 600 * 0.28 && veces < 600 * 0.42, `${veces} de 600`)
  const otro = { ...nueva(), jugador: { apodo: 'Rorro', emoji: '🥃' } }
  for (let i = 0; i < 50; i++) assert.equal(M.golpear(plano, { ...otro, pelota: [...otro.pelota] }, -Math.PI / 2, 0.2, M.rngDesde(i)).mapache, undefined)
  // un putt que entra: sin mapache, adentro; con mapache, casi dada, del lado de donde venía, y sin entrar
  const putt = (p, conMapache) => {
    const r = nueva()
    const t = M.golpear(plano, r, -Math.PI / 2, p, sinRuido())
    t.mapache = conMapache ? { m: 1.3 / h15.escala, de: [...r.desde], hecho: false } : undefined
    return M.simular(plano, t, h15.pin)
  }
  const entra = [0.1, 0.12, 0.14, 0.16, 0.18, 0.2, 0.22, 0.25].find((p) => putt(p, false).embocada)
  assert.ok(entra, 'ningún putt entra')
  const t = putt(entra, true)
  assert.notEqual(t.embocada, true)
  assert.ok(t.eventos.some((e) => e.tipo === 'mapache') && t.mapache.hecho)
  const d = M.dist(t.pos, h15.pin)
  assert.ok(d > M.FISICA.bocaHoyo && Math.abs(d - 1.3 / h15.escala) < 1e-9, `${d}`)
  assert.ok(t.pos[1] > h15.pin[1]) // venía de abajo: queda abajo
  assert.equal(M.resolverReposo(plano, { ...nueva(), monos: [] }, t, fijo(0.5)).tipo === 'embocada', false)
  // si no la iba a meter, el mapache no sale
  const corto = putt(0.03, true)
  assert.equal(corto.mapache.hecho, false)
  // de muy cerca, la deja más cerca (nunca más atrás de donde salió ni adentro de la boca)
  const r = { ...nueva(), pelota: [h15.pin[0], h15.pin[1] + 1] }
  const tc = M.golpear(plano, r, -Math.PI / 2, 0.08, sinRuido())
  tc.mapache = { m: 1.5 / h15.escala, de: [...r.desde], hecho: false }
  const fin = M.simular(plano, tc, h15.pin)
  if (fin.mapache.hecho) { const dc = M.dist(fin.pos, h15.pin); assert.ok(dc > M.FISICA.bocaHoyo && dc < 1, `${dc}`) }
})

ok('Lechu: de 15 metros o menos no la falla, le pegue como le pegue', () => {
  const r = { ...M.nuevaRonda({ apodo: 'Lechu', emoji: '🦉' }, fijo(0.5)), monos: [] }
  r.lie = 'green'
  const putt = (desde, ang, p) => {
    r.pelota = desde
    return M.simular(plano, M.golpear(plano, r, ang, p, fijo(0.9)), h15.pin)
  }
  // a 3, 6 y 14 yd del dibujo (15,3 reales, en el 15): para cualquier lado y con cualquier fuerza, entra
  for (const d of [3, 6, 14]) {
    for (const [ang, p] of [[-Math.PI / 2, 0.02], [0, 1], [Math.PI / 2, 0.5], [-Math.PI / 2, 1], [Math.PI, 0.3]]) {
      const t = putt([h15.pin[0], h15.pin[1] + d], ang, p)
      assert.equal(t.embocada, true, `${d} yd, ang ${ang} p ${p}`)
    }
  }
  // a 16 yd del dibujo (17,5 reales, todavía en el green) ya es un putt normal: tirado para atrás, no entra
  assert.equal(M.terreno(plano, [h15.pin[0], h15.pin[1] + 16]).tipo, 'green')
  assert.notEqual(putt([h15.pin[0], h15.pin[1] + 16], Math.PI / 2, 0.3).embocada, true)
  // otro jugador a 3 yd, tirado para atrás, no entra
  const o = { ...M.nuevaRonda({ apodo: 'Rorro', emoji: '🥃' }, fijo(0.5)), monos: [], lie: 'green', pelota: [h15.pin[0], h15.pin[1] + 3] }
  assert.notEqual(M.simular(plano, M.golpear(plano, o, Math.PI / 2, 0.3, fijo(0.9)), h15.pin).embocada, true)
})

ok('🦉 la lechuza: el próximo putt de 15 metros o menos entra (uno solo, de cualquiera; el de Joaco no la gasta)', () => {
  const o = { ...M.nuevaRonda({ apodo: 'Rorro', emoji: '🥃' }, fijo(0.5)), monos: [], lie: 'green', lechuza: true }
  // de lejos (16 yd del dibujo: más de 15 metros) no se gasta y es un putt normal
  o.pelota = [h15.pin[0], h15.pin[1] + 16]
  assert.equal(M.planTiro(plano, o, Math.PI / 2, 0.3).lechuza, false)
  assert.notEqual(M.simular(plano, M.golpear(plano, o, Math.PI / 2, 0.3, fijo(0.9)), h15.pin).embocada, true)
  assert.equal(o.lechuza, true)
  // a 3 yd, tirado para atrás: entra igual, con su relato, y se gasta
  o.pelota = [h15.pin[0], h15.pin[1] + 3]
  const t = M.golpear(plano, o, Math.PI / 2, 0.3, fijo(0.9))
  assert.equal(t.iman?.lechuza, true)
  assert.equal(M.simular(plano, t, h15.pin).embocada, true)
  assert.equal(o.lechuza, false)
  // el siguiente, ya normal
  o.pelota = [h15.pin[0], h15.pin[1] + 3]
  assert.notEqual(M.simular(plano, M.golpear(plano, o, Math.PI / 2, 0.3, fijo(0.9)), h15.pin).embocada, true)
  // Joaco ya tiene sus dadas: la lechuza le queda para cuando no las tenga (ofendido)
  const j = { ...M.nuevaRonda({ apodo: 'Lechu', emoji: '🦉' }, fijo(0.5)), monos: [], lie: 'green', lechuza: true, pelota: [h15.pin[0], h15.pin[1] + 3] }
  assert.equal(M.planTiro(plano, j, Math.PI / 2, 0.3).lechuza, false)
  M.golpear(plano, j, Math.PI / 2, 0.3, fijo(0.9))
  assert.equal(j.lechuza, true)
  j.ofendido = true
  j.pelota = [h15.pin[0], h15.pin[1] + 3]
  assert.equal(M.planTiro(plano, j, Math.PI / 2, 0.3).lechuza, true)
})

ok('⛳ Sábado 9 AM: la hora (argentina), la lista (cada uno una vez, en orden) y doble en el Clásico', () => {
  const ar = (s) => Date.parse(s + '-03:00')
  assert.equal(M.esSabado9(ar('2026-10-10T09:00:00')), true)
  assert.equal(M.esSabado9(ar('2026-10-10T09:59:59')), true)
  assert.equal(M.esSabado9(ar('2026-10-10T10:00:00')), false)
  assert.equal(M.esSabado9(ar('2026-10-10T08:59:59')), false)
  assert.equal(M.esSabado9(ar('2026-10-09T09:30:00')), false) // viernes
  assert.equal(M.esSabado9(ar('2026-10-11T09:30:00')), false) // domingo
  // la ventana: la de ese sábado, o la del sábado anterior
  const iso = (w) => w.map((x) => new Date(x).toISOString())
  assert.deepEqual(iso(M.ventanaSabado(ar('2026-10-10T09:30:00'))), ['2026-10-10T12:00:00.000Z', '2026-10-10T13:00:00.000Z'])
  assert.deepEqual(iso(M.ventanaSabado(ar('2026-10-10T08:00:00'))), ['2026-10-03T12:00:00.000Z', '2026-10-03T13:00:00.000Z'])
  assert.deepEqual(iso(M.ventanaSabado(ar('2026-10-14T18:00:00'))), ['2026-10-10T12:00:00.000Z', '2026-10-10T13:00:00.000Z'])
  // la lista: cada uno una vez, en el orden en que se anotó; fuera de hora no
  const m = (uid, usuario, hhmm, apodo = 'Fito (Đ)') => ({ uid, usuario, apodo, emoji: '🦅', vsPar: -1, fecha: new Date(ar(`2026-10-10T${hhmm}:00`)).toISOString() })
  const marcas = [m('b', 'Patmig', '09:10'), m('a', 'Rorro', '09:05'), m('a', 'Rorro', '09:20'), m('c', 'Miguel', '10:01'), m('d', 'Ninja', '08:59'), m('e', 'Lucas', '09:59', 'LG')]
  assert.deepEqual(M.listaSabado(marcas, ar('2026-10-10T09:40:00')).map((x) => x.usuario), ['Rorro', 'Patmig', 'Lucas'])
  assert.deepEqual(M.listaSabado([], ar('2026-10-10T09:40:00')), [])
  // el Clásico: lo firmado el sábado entre las 9 y las 10 suma doble (Rorro: −1 a las 9:05 y a las 9:20 = 4; Miguel a las 10:01, 1)
  const equipoDe = (a) => (a === 'LG' ? 'e5' : 'dicky')
  const c = M.clasico(marcas, M.lunesDe(ar('2026-10-10T09:40:00')), equipoDe)
  assert.deepEqual(c.aportes.dicky.map((x) => [x.nombre, x.pts]), [['Rorro', 4], ['Patmig', 2], ['Miguel', 1], ['Ninja', 1]])
  assert.deepEqual(c.aportes.e5.map((x) => [x.nombre, x.pts]), [['Lucas', 2]])
})

ok('El Ninja: reset del hoyo (uno por vuelta): al tee con cero golpes, sin multa', () => {
  const r = { ...M.nuevaRonda({ apodo: 'El Ninja (Đ)', emoji: '🥷' }, fijo(0.5)), monos: [] }
  // desde el tee, sin haber pegado, no hay nada que resetear
  assert.ok(!M.puedeResetNinja(r))
  r.pelota = [...enArbol]
  r.lie = 'bosque'
  r.golpes = 5
  assert.ok(M.puedeResetNinja(r))
  assert.equal(M.resetNinja(r), 15)
  assert.equal(r.golpes, 0)
  assert.equal(r.lie, 'tee')
  assert.deepEqual(r.pelota, M.teeDe(r))
  assert.ok(!r.terminada)
  r.golpes = 3
  assert.ok(!M.puedeResetNinja(r)) // uno solo por vuelta
  assert.ok(!M.puedeResetNinja({ ...M.nuevaRonda({ apodo: 'Rorro' }, fijo(0.5)), golpes: 2 }))
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

ok('umbrales en yardas reales: los 15 metros de Lechu y el chip de Fito se miden como el marcador', () => {
  // en el 17 (escala 0,75) 21 yd del dibujo son 15,75 yd reales: dada. 23 del dibujo son 17,25 reales: ya no
  const r = { ...M.nuevaRonda({ apodo: 'Lechu', emoji: '🦉' }, fijo(0.5)), monos: [], idx: 2, lie: 'green' }
  r.pelota = [h17.pin[0], h17.pin[1] - 21]
  assert.equal(M.terreno(plano, r.pelota).tipo, 'green')
  assert.equal(M.planTiro(plano, r, Math.PI / 2, 0.2).noLaFalla, true)
  r.pelota = [h17.pin[0], h17.pin[1] - 23]
  assert.equal(M.terreno(plano, r.pelota).tipo, 'green')
  assert.equal(M.planTiro(plano, r, Math.PI / 2, 0.2).noLaFalla, false)
  // en el 16 (escala 1,14) 14,8 yd del dibujo son 16,9 reales: ya no es dada (en el 15 serían 16,15: dada)
  const r16 = { ...r, idx: 1, pelota: [h16.pin[0], h16.pin[1] + 14.8] }
  assert.equal(M.terreno(plano, r16.pelota).tipo, 'green')
  assert.equal(M.planTiro(plano, r16, -Math.PI / 2, 0.2).noLaFalla, false)
  // Fito: el imán lo tiene a AGUILA.chip yardas REALES del hoyo (en el 17, 53 yd del dibujo)
  const f = { ...M.nuevaRonda({ apodo: 'Fito (Đ)', emoji: '🦅' }, fijo(0.5)), monos: [], idx: 2, lie: 'fairway' }
  f.pelota = [h17.pin[0], h17.pin[1] + 50] // 37,5 yd reales
  assert.ok(M.planTiro(quieto, f, -Math.PI / 2, 0.3).iman?.meter)
  f.pelota = [h17.pin[0], h17.pin[1] + 56] // 42 yd reales
  assert.equal(M.planTiro(quieto, f, -Math.PI / 2, 0.3).iman, undefined)
})

ok('salida: solo el tee del hoyo que se juega; en el tee de otro hoyo no hay bomba ni drive de Liberty', () => {
  const m = { ...M.nuevaRonda({ apodo: 'Mike Queboni (Đ)', emoji: '💣', hcp: 3 }, fijo(0.5)), monos: [] }
  assert.equal(M.planTiro(quieto, m, angulo(m.pelota, h15.pin), 1, 1).bomba, true) // desde su tee, la bomba
  m.pelota = [...h16.tees.blanca] // jugando el 15, la pelota quedó en el tee del 16
  m.lie = 'tee'
  assert.equal(M.terreno(quieto, m.pelota).tipo, 'tee')
  assert.notEqual(M.planTiro(quieto, m, angulo(m.pelota, h15.pin), 1, 1).bomba, true)
  const l = { ...M.nuevaRonda({ apodo: 'Liberty', emoji: '🗽' }, fijo(0.5)), monos: [], pelota: [...h16.tees.blanca], lie: 'tee' }
  assert.notEqual(M.planTiro(quieto, l, angulo(l.pelota, h15.pin), 0.6).disp.ang, 0)
  const t = M.golpear(quieto, l, angulo(l.pelota, h15.pin), 0.6, fijo(0.5))
  assert.equal(t.salida, false)
  assert.equal(t.liberty, false)
  assert.equal(M.tipoDeTiro(t, h15, l.desde, 'tee'), 'approach')
})

ok('🤫 en el hoyo de otro: jugando el 15, la que entra en el 16 cae, el golpe cuenta y se dropea afuera de ese green', () => {
  const r = { ...M.nuevaRonda({ apodo: 'Rorro', emoji: '🥃' }, fijo(0.5)), monos: [] }
  // golpear arma los hoyos que no se juegan
  r.pelota = [h16.pin[0], h16.pin[1] - 5]
  r.lie = 'green'
  r.golpes = 2
  const t0 = M.golpear(plano, { ...r }, angulo(r.pelota, h16.pin), 0.2, sinRuido())
  assert.deepEqual(t0.ajenos.map((a) => a.n), [16, 17])
  // un putt (rodando) que pasa por el medio del 16, justo de fuerza
  const tiro = M.lanzar(plano, { pelota: r.pelota, angulo: angulo(r.pelota, h16.pin), potencia: 6 / M.FISICA.distPuttMax, viento: calma, putt: true, lie: 'green', rng: sinRuido() })
  tiro.ajenos = [{ n: 16, pin: h16.pin }, { n: 17, pin: h17.pin }]
  M.simular(plano, tiro, h15.pin)
  assert.equal(tiro.ajena, 16)
  assert.equal(tiro.embocada, undefined)
  assert.deepEqual(tiro.pos, h16.pin)
  assert.ok(tiro.eventos.some((e) => e.tipo === 'ajena' && e.n === 16))
  r.golpes = 3
  const res = M.resolverReposo(campo, r, tiro, fijo(0.5))
  assert.equal(res.tipo, 'ajena')
  assert.equal(res.n, 16)
  assert.equal(res.jugando, 15)
  assert.equal(r.golpes, 3) // sin multa
  assert.equal(r.ajenas, 1)
  assert.ok(['fairway', 'rough'].includes(r.lie))
  assert.notEqual(M.terreno(campo, r.pelota).tipo, 'green')
  assert.equal(M.pinoEn(campo, r.pelota), null)
  assert.ok(M.dist(r.pelota, h16.pin) < 40)
  // sin los otros hoyos (como antes), pasa de largo
  const sin = M.lanzar(plano, { pelota: [h16.pin[0], h16.pin[1] - 5], angulo: Math.PI / 2, potencia: 6 / M.FISICA.distPuttMax, viento: calma, putt: true, lie: 'green', rng: sinRuido() })
  M.simular(plano, sin, h15.pin)
  assert.equal(sin.ajena, undefined)
  // muy fuerte, pasa por arriba del otro hoyo y sigue
  const fuerte = M.lanzar(plano, { pelota: [h16.pin[0], h16.pin[1] - 5], angulo: Math.PI / 2, potencia: 0.9, viento: calma, putt: true, lie: 'green', rng: sinRuido() })
  fuerte.ajenos = [{ n: 16, pin: h16.pin }]
  M.simular(plano, fuerte, h15.pin)
  assert.equal(fuerte.ajena, undefined)
})

ok('🤫 Demetrio López: sin monos; cada tiro queda exactamente donde apuntó; birdies sí, nunca más que par', () => {
  const dem = { apodo: 'Demetrio López', emoji: '🏌️', hcp: 0 }
  assert.equal(M.habilidadDe(dem).id, 'retro')
  const r = M.nuevaRonda(dem, fijo(0.5))
  assert.equal(r.monos.length, 0)
  r.viento = { ang: 0, kmh: 30 } // viento fuerte de costado: no le hace nada
  // desde el tee, a través de los árboles: pica exactamente donde apuntó y ahí se queda
  const ang = angulo(r.pelota, h15.pin) + 0.35
  const plan = M.planTiro(campo, r, ang, 0.7)
  assert.equal(plan.disp.ang, 0)
  assert.equal(plan.disp.carry, 0)
  const t = M.golpear(campo, { ...r }, ang, 0.7, M.rngDesde(3))
  assert.deepEqual(t.deriva, [0, 0])
  M.simular(campo, t, h15.pin)
  assert.ok(M.dist(t.pos, plan.destino) < 1e-6, `quedó a ${M.dist(t.pos, plan.destino)} yd`)
  assert.ok(!t.eventos.some((e) => e.tipo === 'palo'))
  // desde el bunker llega a lo que se ve (a los demás, la mitad)
  const bk = { ...M.nuevaRonda(dem, fijo(0.5)), pelota: buscar('b', [26, 160, 40, 182]), lie: 'bunker', golpes: 1 }
  const pb = M.planTiro(campo, bk, -Math.PI / 2, 0.4)
  const tb = M.golpear(campo, bk, -Math.PI / 2, 0.4, M.rngDesde(4))
  M.simular(campo, tb, h15.pin)
  assert.ok(M.dist(tb.pos, pb.destino) < 1e-6)
  // birdie: apuntado al hoyo, entra (el putt va derecho aunque el green caiga, y sin labios)
  const putt = { ...M.nuevaRonda(dem, fijo(0.5)), pelota: [h15.pin[0] + 3, h15.pin[1] + 6], lie: 'green', golpes: 2 }
  assert.ok(M.enModoPutt(campo, putt))
  const tq = M.golpear(campo, putt, angulo(putt.pelota, h15.pin), 0.6, M.rngDesde(9)) // pasado de fuerza: igual entra
  M.simular(campo, tq, h15.pin)
  assert.equal(tq.embocada, true)
  // hoyo en uno: el tiro del tee apuntado a la bandera, con la fuerza justa, cae en el hoyo
  const h1 = M.nuevaRonda(dem, fijo(0.5))
  h1.idx = 2
  h1.pelota = [...M.teeDe(h1, h17)]
  const a17 = angulo(h1.pelota, h17.pin)
  const d17 = M.dist(h1.pelota, h17.pin) * h17.escala
  const pot = d17 / M.carryMaxDe(0, 3)
  assert.ok(pot <= 1)
  const t1 = M.golpear(campo, h1, a17, pot, M.rngDesde(5))
  M.simular(campo, t1, h17.pin)
  assert.equal(t1.embocada, true)
  // el tiro para par entra siempre: desde lejos, desde el rough, pegue como pegue
  const par = { ...M.nuevaRonda(dem, fijo(0.5)), pelota: [h15.calle[2][0] + 12, h15.calle[2][1]], lie: 'rough', golpes: 3 }
  const tp = M.golpear(quieto, par, 0.3, 0.1, M.rngDesde(9))
  assert.equal(tp.retro, true)
  M.simular(quieto, tp, h15.pin)
  assert.equal(tp.embocada, true)
  // nunca más que par en la tarjeta (ni con una multa)
  const c = M.nuevaRonda(dem, fijo(0.5))
  c.golpes = 6
  assert.equal(M.cerrarHoyo(c, fijo(0.5)).golpes, 4)
  // en el bosque no hay Mono (ni bueno ni malo): se juega desde ahí, sin multa
  const bo = { ...M.nuevaRonda(dem, fijo(0.5)), golpes: 1 }
  const res = M.resolverReposo(campo, bo, { pos: enArbol, eventos: [] }, fijo(0.01))
  assert.equal(res.tipo, 'normal')
  assert.equal(bo.lie, 'bosque')
  assert.equal(bo.golpes, 1)
})

ok('🎰 La Ruleta: cada tiro otro player del mazo, nunca el mismo dos seguidos; gira solo si pegaste', () => {
  assert.equal(M.esRuleta(RULETA), true)
  assert.ok(RULETA.pool.length >= 10 && !RULETA.pool.includes(RULETA) && RULETA.pool.every((j) => !j.secreto))
  const rng = M.rngDesde(42)
  const r = M.nuevaRonda(RULETA, rng)
  assert.equal(r.tee, 'blanca')
  assert.equal(M.cartaDe(r), RULETA)
  // antes de girar pega la carta (sin habilidad que haga nada); el primer giro ya da un player del mazo
  const j1 = M.turnoRuleta(r, rng)
  assert.ok(RULETA.pool.includes(j1) && r.jugador === j1)
  // sin pegar no vuelve a girar (los monos que te la roban antes, el LP del Ninja)
  assert.equal(M.turnoRuleta(r, rng), null)
  assert.equal(r.jugador, j1)
  // 300 tiros: nunca repite de un tiro al otro, y salen todos
  const vistos = new Set([j1.apodo])
  let antes = j1
  for (let i = 0; i < 300; i++) {
    M.golpear(quieto, r, -Math.PI / 2, 0.3, rng)
    assert.equal(r.ruletaToca, true)
    const j = M.turnoRuleta(r, rng)
    assert.notEqual(j.apodo, antes.apodo)
    vistos.add(j.apodo)
    antes = j
    r.pelota = [...M.teeDe(r)]; r.lie = 'tee'; r.golpes = 0
  }
  assert.equal(vistos.size, RULETA.pool.length)
  // la carta de la vuelta sigue siendo la Ruleta (ranking, récord, lo que se comparte)
  r.tarjeta = [{ n: 15, par: 4, golpes: 4 }, { n: 16, par: 4, golpes: 4 }, { n: 17, par: 3, golpes: 3 }]
  r.terminada = true; r.ms = 1000
  assert.equal(M.marcaDe(r, 'yo').apodo, 'La Ruleta')
  assert.match(M.textoCompartir(r, true), /La Ruleta/)
  assert.ok(M.tirosRuleta(r)[0].tiros.length > 1)
  // levantó con uno que salió y no llegó a pegar: ese no figura
  const total = r.ruleta.tiros.length
  r.terminada = false; r.idx = 2
  r.ruletaToca = true
  M.turnoRuleta(r, rng)
  M.levantar(r)
  assert.equal(r.ruleta.tiros.length, total + 1)
  assert.equal(M.tirosRuleta(r).reduce((s, h) => s + h.tiros.length, 0), total)
})

ok('🎰 La Ruleta deja la ronda lista para el que pega (Mago, Mugre, Marcos, Maxi) y la limpia para el siguiente', () => {
  const r = M.nuevaRonda(RULETA, M.rngDesde(1))
  const por = (apodo) => RULETA.pool.find((j) => j.apodo === apodo)
  const forzar = (apodo) => { r.ruleta.pool = [por(apodo)]; r.jugador = RULETA; r.ruletaToca = true; return M.turnoRuleta(r, M.rngDesde(3)) }
  forzar('El Mago Rodal')
  assert.ok(M.golpeMagoDe(r))
  // si elegiste otro golpe, la próxima vez que sale el Mago viene con ese
  M.elegirGolpeMago(quieto, r, 'flop')
  forzar('Mugre')
  forzar('El Mago Rodal')
  assert.equal(r.golpeMago, 'flop')
  forzar('Mugre')
  assert.equal(r.golpeMago, null)
  assert.equal(r.panchos, M.MUGRE.panchos)
  assert.equal(M.alertaDe(r), M.MUGRE.alerta)
  // Marcos: el carrito queda donde pegó el anterior y maneja hasta la pelota
  r.desde = [...M.teeDe(r)]
  r.pelota = [r.desde[0], r.desde[1] - 60]
  forzar('El Flaco Ordoñez')
  assert.equal(r.panchos, 0)
  assert.ok(M.usaCarrito(r) && !M.carroLlego(campo, r.carro, r.pelota))
  forzar('Grandpa')
  assert.equal(r.carro, null)
  assert.deepEqual(r.deme, { usado: false, listo: false })
  r.deme.usado = true
  forzar('LG')
  forzar('Grandpa')
  assert.equal(r.deme.usado, true) // Deme, una vez por vuelta (aunque Maxi salga dos veces)
})

ok('El viento del match para el replay: el mismo que tuvo la ronda en cada hoyo y después de cada tiro', () => {
  const cond = M.condicionesMatch(424242)
  // nublado: el viento cambia en cada tiro, igual que en la ronda (climaTrasTiro)
  const r = M.aplicarMatch(M.nuevaRonda({ apodo: 'Rorro' }, fijo(0.5)), cond)
  M.ponerClima(campo, r, 'nuboso', cond.semillaClima)
  const clima = r.clima
  assert.deepEqual(M.vientoDelMatch(cond, clima, 0, 0), r.viento)
  for (const g of [1, 2, 3]) {
    r.golpes = g
    r.lie = 'green'
    M.climaTrasTiro(campo, r, fijo(0.5))
    assert.deepEqual(M.vientoDelMatch(cond, clima, 0, g), r.viento)
  }
  // lluvia intensa: nunca menos de su mínimo; sin clima (un match viejo), el del hoyo tal cual
  const t = { ...M.nuevaRonda({ apodo: 'Rorro' }, fijo(0.5)), hoyos: M.HOYOS }
  M.ponerClima(campo, t, 'tormenta', 1)
  for (let i = 0; i < M.HOYOS.length; i++) assert.ok(M.vientoDelMatch(cond, t.clima, i, 2).kmh >= M.CLIMAS.tormenta.vientoMin)
  assert.deepEqual(M.vientoDelMatch(cond, null, 2, 5), cond.vientos[2])
})

ok('🎰 La Ruleta en un match: los dos juegan con la misma tanda de players', () => {
  const cond = M.condicionesMatch(777)
  const tanda = (seed) => {
    const r = M.aplicarMatch(M.nuevaRonda(RULETA, M.rngDesde(seed)), cond)
    const rng = M.rngDesde(seed + 1)
    const lista = []
    for (let i = 0; i < 12; i++) { lista.push(M.turnoRuleta(r, rng).apodo); r.ruletaToca = true }
    return lista
  }
  assert.deepEqual(tanda(1), tanda(99))
})

ok('🐸 Taiu (la Rana): bombas desde el tee como Miguelón, approach perfectos y los controles al revés', () => {
  const taiu = RULETA.pool.find((j) => j.apodo === 'Taiu (Đ)')
  assert.ok(taiu?.dicky)
  assert.equal(M.alReves(taiu), true)
  const r = M.nuevaRonda(taiu, fijo(0.5))
  // desde el tee del 15, a fondo: la bomba (pasa la zona del latido)
  const tee = M.planTiro(campo, r, -Math.PI / 2, 1, 1)
  assert.equal(tee.bomba, true)
  assert.ok(tee.carry * h15.escala > M.BOMBA.zona)
  // a 60 yd del hoyo: sin error
  const d = 60 / h15.escala
  const ap = { ...r, pelota: [h15.pin[0], h15.pin[1] + d], lie: 'fairway' }
  const plan = M.planTiro(campo, ap, -Math.PI / 2, 0.3)
  assert.equal(plan.approachPerfecto, true)
  assert.equal(plan.disp.ang, 0)
  assert.equal(plan.disp.carry, 0)
  // al revés: empuja (para adelante es dedo para adelante) con izquierda y derecha cruzadas; la fuerza igual
  // (px = x0 − x: con la gomera, dedo a la derecha → px < 0 → sale a la izquierda; Taiu lo mismo de costado)
  assert.deepEqual(M.invertirArrastre(10, 50, 0.4), { px: 10, py: -50, u: 0.4 })
})

ok('📞 Dickyllamada: cada Dicky tiene su foto recortada y le dice algo tierno al que juega (con su nombre)', () => {
  const dickys = RULETA.pool.filter((j) => j.dicky)
  assert.ok(dickys.length >= 4 && dickys.every((j) => j.torso))
  const rng = M.rngDesde(7)
  for (let i = 0; i < 40; i++) {
    const f = M.fraseDicky(rng, 'Taiu (Đ)', { apodo: 'Fito (Đ)' })
    assert.ok(typeof f === 'string' && f.length > 10 && !f.includes('(Đ)') && !f.includes('undefined'))
  }
})

ok('📞 Dickyllamada: un Dicky te pega el próximo tiro (con su habilidad) y te devuelve el palo; una por vuelta', () => {
  const por = (a) => RULETA.pool.find((j) => j.apodo === a)
  const fito = por('Fito (Đ)'), migue = por('Mike Queboni (Đ)')
  const r = { ...M.nuevaRonda(fito, fijo(0.5)), monos: [] }
  assert.ok(M.puedeDickyllamar(r))
  assert.equal(M.dickyllamar(r, fito), false) // a sí mismo no
  assert.equal(M.dickyllamar(r, por('LG')), false) // solo Dicky
  assert.equal(M.dickyllamar(r, migue), true)
  assert.equal(r.jugador, migue)
  assert.ok(!M.puedeDickyllamar(r))
  // desde el tee, a fondo: la bomba de Miguelón
  const tiro = M.golpear(quieto, r, -Math.PI / 2, 1, sinRuido(), 1)
  assert.equal(tiro.prestado, 'Mike Queboni (Đ)')
  assert.equal(tiro.bomba, true)
  M.simular(quieto, tiro, h15.pin)
  M.resolverReposo(quieto, r, tiro, fijo(0.5))
  assert.equal(r.jugador, fito) // te devolvió el palo
  assert.ok(!M.puedeDickyllamar(r)) // una por vuelta
  assert.ok(!M.puedeDickyllamar(M.nuevaRonda(por('LG'), fijo(0.5)))) // no es Dicky
  assert.equal(M.momentoDicky({ tipo: 'afuera' }), 'mal')
  assert.equal(M.momentoDicky({ tipo: 'normal', terreno: 'fairway' }), 'bien')
})

ok('🦉📺 el Equipo 5: chicanas a los Dicky, la respuesta con amor y el aliento entre ellos (Joaco y Lucas, sin "(Đ)")', () => {
  const por = (a) => RULETA.pool.find((j) => j.apodo === a)
  const lechu = por('Lechu'), lg = por('LG'), fito = por('Fito (Đ)')
  assert.ok(M.esEquipo5(lechu) && M.esEquipo5(lg) && !M.esEquipo5(fito))
  assert.ok(lechu.torso && lg.torso)
  assert.equal(M.compaE5(lechu, RULETA.pool), lg)
  assert.equal(M.compaE5(lg, RULETA.pool), lechu)
  assert.equal(M.compaE5(fito, RULETA.pool), null)
  const rng = M.rngDesde(11)
  const limpia = (f) => typeof f === 'string' && f.length > 5 && !f.includes('(Đ)') && !f.includes('undefined')
  for (let i = 0; i < 60; i++) {
    for (const m of ['bien', 'mal', 'todos']) {
      assert.ok(limpia(M.fraseChicana(rng, 'LG', fito, m)))
      assert.ok(limpia(M.fraseVestuario(rng, 'Lechu', lg, m)))
    }
    assert.ok(limpia(M.contestaDicky(rng, 'Mike Queboni (Đ)', lechu)))
    for (const m of ['arma', 'compa', 'tuya']) assert.ok(limpia(M.fraseVestuario(rng, 'LG', lechu, m)))
  }
  // se dicen Joaco y Lucas (las cartas son Lechu y LG); Lucas y Fito son hermanos
  const fitoALucas = new Set(Array.from({ length: 80 }, () => M.contestaDicky(rng, 'Fito (Đ)', lg)))
  assert.ok([...fitoALucas].some((f) => f.includes('hermano')))
  assert.ok([...fitoALucas].every((f) => !f.includes('LG')))
  const aJoaco = new Set(Array.from({ length: 80 }, () => M.fraseVestuario(rng, 'LG', lechu, 'tuya')))
  assert.ok([...aJoaco].some((f) => f.includes('Joaco')))
})

ok('📺 LG relata de hincha: a los Dicky les festeja los errores; al Equipo 5, de gol; lo de las habilidades no lo pisa', () => {
  const por = (a) => RULETA.pool.find((j) => j.apodo === a)
  const rough = { tipo: 'normal', terreno: 'rough' }, full = { eventos: [], modo: 'full', carry: 100, pos: [0, 0] }
  const veces = (j, res, n = 200) => {
    const rng = M.rngDesde(5)
    return Array.from({ length: n }, () => M.comentar(rng, res, full, h15, j).lg)
  }
  const contra = veces(por('Fito (Đ)'), rough)
  assert.ok(contra.some((l) => M.RELATO.contraDicky.includes(l)) && contra.some((l) => M.RELATO.rough.includes(l)))
  const e5 = veces(por('Lechu'), rough)
  assert.ok(e5.some((l) => M.RELATO.e5Mal.includes(l)))
  // LG con su calma: después de un mal tiro dice lo suyo, no de hincha
  assert.ok(veces(por('LG'), rough).every((l) => M.RELATO.calma.includes(l)))
  // los demás, como siempre
  assert.ok(veces(por('Mugre'), rough).every((l) => M.RELATO.rough.includes(l)))
  // y el resultado del hoyo, a veces
  const rng = M.rngDesde(3)
  const res = Array.from({ length: 100 }, () => M.fraseResultado(rng, 'BIRDIE', por('LG')))
  assert.ok(res.some((f) => M.HINCHA_RESULTADO.e5.BIRDIE.includes(f)) && res.some((f) => M.POR_RESULTADO.BIRDIE.includes(f)))
})

ok('🦉📺 Mejor pelota: una por vuelta, solo el Equipo 5; el compañero pega sobre una copia y queda la mejor de las dos', () => {
  const por = (a) => RULETA.pool.find((j) => j.apodo === a)
  const lechu = por('Lechu'), lg = por('LG'), fito = por('Fito (Đ)')
  assert.ok(!M.puedeMejorPelota(M.nuevaRonda(fito, fijo(0.5))))
  const r = { ...M.nuevaRonda(lg, fijo(0.5)), monos: [] }
  assert.ok(M.puedeMejorPelota(r))
  assert.equal(M.armarMejorPelota(r, lg), false) // con uno mismo no
  assert.equal(M.armarMejorPelota(r, fito), false) // solo con el compañero del Equipo 5
  assert.equal(M.armarMejorPelota(r, lechu), true)
  assert.ok(M.mejorPelotaArmada(r))
  M.desarmarMejorPelota(r) // guardarla no la gasta
  assert.ok(!M.mejorPelotaArmada(r) && M.puedeMejorPelota(r))
  assert.equal(M.armarMejorPelota(r, lechu), true)
  // el compañero pega primero, sobre una copia: no cuenta golpe ni mueve nada de la ronda
  const monos = [{ pos: [1, 1] }]
  r.monos = monos
  const suya = M.golpeCompa(quieto, r, -Math.PI / 2, 1, sinRuido())
  assert.equal(suya.compa, 'Lechu')
  assert.equal(suya.monos, null)
  assert.equal(r.golpes, 0)
  assert.equal(r.monos, monos)
  assert.equal(r.jugador, lg)
  assert.ok(!M.mejorPelotaArmada(r) && !M.puedeMejorPelota(r)) // gastada: una por vuelta
  r.monos = []
  const mia = M.golpear(quieto, r, -Math.PI / 2, 1, sinRuido())
  assert.equal(r.golpes, 1)
  M.simular(quieto, suya, h15.pin); M.simular(quieto, mia, h15.pin)
  // queda la que está más cerca (o en mejor lugar); si empatan, la tuya
  const q = M.mejorDeLasDos(quieto, r, mia, suya)
  const [vm, vs] = [M.valorPelota(quieto, r, mia), M.valorPelota(quieto, r, suya)]
  assert.equal(q, vs < vm ? suya : mia)
  assert.equal(M.mejorDeLasDos(quieto, r, mia, mia), mia)
  // embocada gana siempre; afuera pierde contra cualquiera en la cancha
  const en = (pos, extra = {}) => ({ pos, ...extra })
  const pin = h15.pin
  assert.equal(M.valorPelota(quieto, r, en(pin, { embocada: true })), -1)
  const verde = en([pin[0] + 3, pin[1]])
  assert.ok(M.valorPelota(quieto, r, verde) < M.valorPelota(quieto, r, en(buscar('x', [0, 0, 400, 400]))))
  assert.ok(M.valorPelota(quieto, r, verde) < M.valorPelota(quieto, r, en(enArbol)))
  // y dónde quedó cada una (lo que se muestra para elegir)
  assert.deepEqual(M.dondeQuedo(quieto, r, en(pin, { embocada: true })), { tipo: 'adentro', yd: 0, multa: 0 })
  const v = M.dondeQuedo(quieto, r, verde)
  assert.equal(v.tipo, 'normal'); assert.equal(v.lie, 'green'); assert.ok(Math.abs(v.yd - 3 * h15.escala) < 1e-9); assert.equal(v.multa, 0)
  assert.equal(M.dondeQuedo(quieto, r, en(enArbol)).tipo, 'bosque')
  assert.equal(M.dondeQuedo(quieto, r, en(buscar('x', [0, 0, 400, 400]))).multa, 1)
  assert.equal(M.dondeQuedo(quieto, r, en(verde.pos, { robada: {} })).tipo, 'robada')
})

ok('🦉📺 Mejor pelota: LG de compañero después de un mal tiro va con su habilidad (el que se enoja pierde: sin error)', () => {
  const por = (a) => RULETA.pool.find((j) => j.apodo === a)
  const lechu = por('Lechu'), lg = por('LG')
  const r = { ...M.nuevaRonda(lechu, fijo(0.5)), monos: [] }
  // Joaco la tira al rough: el tiro anterior salió mal
  const t1 = M.golpear(quieto, r, -Math.PI / 2, 1, sinRuido())
  M.simular(quieto, t1, h15.pin)
  t1.pos = buscar('.', [60, 60, 180, 380]); t1.eventos = []
  M.resolverReposo(quieto, r, t1, fijo(0.5))
  assert.equal(r.lie, 'rough')
  assert.equal(r.ultimoMalo, true)
  assert.ok(!r.calma) // Joaco no tiene la calma: es de LG
  assert.ok(M.armarMejorPelota(r, lg))
  assert.ok(M.compaSinError(r))
  const suya = M.golpeCompa(quieto, r, -Math.PI / 2, 1, fijo(0.9))
  assert.equal(suya.calma, true) // LG sale sin error
  // si el anterior salió bien, LG pega como siempre (con error); y Joaco de compañero, nunca con la calma
  const r2 = { ...M.nuevaRonda(lechu, fijo(0.5)), monos: [], ultimoMalo: false }
  M.armarMejorPelota(r2, lg)
  assert.ok(!M.compaSinError(r2))
  assert.equal(M.golpeCompa(quieto, r2, -Math.PI / 2, 1, fijo(0.9)).calma, false)
  const r3 = { ...M.nuevaRonda(lg, fijo(0.5)), monos: [], ultimoMalo: true }
  M.armarMejorPelota(r3, lechu)
  assert.ok(!M.compaSinError(r3))
})

ok('😈 la mufa (más error) y 🥺 el ablandado (más corto): son de un tiro y se gastan al pegar', () => {
  const por = (a) => RULETA.pool.find((j) => j.apodo === a)
  const fito = por('Fito (Đ)'), lg = por('LG')
  const r = { ...M.nuevaRonda(fito, fijo(0.5)), monos: [], pelota: [h15.pin[0], h15.pin[1] + 120], lie: 'fairway' }
  const normal = M.planTiro(quieto, r, -Math.PI / 2, 0.6)
  r.mufa = true
  const mufado = M.planTiro(quieto, r, -Math.PI / 2, 0.6)
  assert.equal(mufado.mufa, true)
  assert.ok(Math.abs(mufado.disp.ang - normal.disp.ang * M.MUFA.error) < 1e-9 && Math.abs(mufado.disp.carry - normal.disp.carry * M.MUFA.error) < 1e-9)
  assert.equal(mufado.carry, normal.carry)
  const t = M.golpear(quieto, r, -Math.PI / 2, 0.6, sinRuido())
  assert.equal(t.mufa, true)
  assert.equal(r.mufa, false) // se gastó
  r.blando = true
  const blando = M.planTiro(quieto, r, -Math.PI / 2, 0.6)
  assert.ok(Math.abs(blando.carry - normal.carry * M.MUFA.blando) < 1e-9 && blando.blando)
  M.golpear(quieto, r, -Math.PI / 2, 0.6, sinRuido())
  assert.equal(r.blando, false)
  // en el green: el putt mufado con más error; el blando, más corto
  const g = { ...M.nuevaRonda(lg, fijo(0.5)), monos: [], lie: 'green', pelota: [h15.pin[0], h15.pin[1] + 8] }
  const p0 = M.planTiro(plano, g, -Math.PI / 2, 0.5)
  g.mufa = true; g.blando = true
  const p1 = M.planTiro(plano, g, -Math.PI / 2, 0.5)
  assert.ok(Math.abs(p1.error - p0.error * M.MUFA.error) < 1e-9 && Math.abs(p1.carry - p0.carry * M.MUFA.blando) < 1e-9)
  // las frases
  const rng = M.rngDesde(4)
  for (let i = 0; i < 40; i++) {
    for (const q of ['abrazo', 'consuelo', 'ablanda']) { const f = M.fraseDickyE5(rng, 'Fito (Đ)', q, lg); assert.ok(f.length > 5 && !f.includes('undefined') && !f.includes('(Đ)')) }
    for (const q of ['espanta', 'ablandado']) assert.ok(!M.fraseCompaE5(rng, q, lg).includes('undefined'))
  }
  assert.ok(Array.from({ length: 60 }, () => M.fraseDickyE5(rng, 'Fito (Đ)', 'ablanda', lg)).some((f) => f.includes('Hermano')))
})

ok('🦅 el pase de Fito: Fito (5) es del Equipo 5 (no Dicky), con la habilidad de Fito, Lucas de compañero y candado', () => {
  const fito5 = PLANTEL.find((j) => j.apodo === 'Fito (5)'), fito = PLANTEL.find((j) => j.apodo === 'Fito (Đ)')
  const lechu = PLANTEL.find((j) => j.apodo === 'Lechu'), lg = PLANTEL.find((j) => j.apodo === 'LG')
  assert.ok(M.esEquipo5(fito5) && !fito5.dicky && fito5.pase === 'Fito (Đ)')
  assert.equal(M.habilidadDe(fito5), M.habilidadDe(fito))
  assert.equal(fito5.hcp, fito.hcp); assert.equal(fito5.foto, fito.foto); assert.equal(fito5.torso, fito.torso)
  assert.equal(M.compaE5(fito5, PLANTEL), lg) // su hermano
  assert.equal(M.compaE5(lechu, PLANTEL), lg) // Joaco y Lucas, como siempre (no Fito de pase)
  assert.equal(M.compaE5(lg, PLANTEL), lechu)
  assert.ok(!RULETA.pool.some((j) => j.pase)) // no sale en la Ruleta
  assert.ok(DESBLOQUEOS.some((d) => d.apodo === 'Fito (5)'))
  assert.equal(M.progresoDesbloqueo(DESBLOQUEO_FITO, { Lechu: -1, LG: 0 }).listo, false)
  assert.equal(M.progresoDesbloqueo(DESBLOQUEO_FITO, { Lechu: -1, LG: -2 }).listo, true)
  const rng = M.rngDesde(9)
  const dichos = Array.from({ length: 60 }, () => M.fraseVestuario(rng, 'LG', fito5, 'todos'))
  assert.ok(dichos.some((f) => /Guarino-Guarino|hermano|Mamá|ex Dicky/.test(f)))
  assert.ok(dichos.every((f) => !f.includes('Joaco')))
  for (let i = 0; i < 30; i++) assert.ok(!M.fraseVuelve(rng, 'El Ninja (Đ)', fito5).includes('undefined'))
  assert.ok(M.fraseVuelve(rng, 'Taiu (Đ)', fito5).length > 5)
})

ok('⚔️ el Clásico de la semana: las mismas cuentas que la base (lunes a domingo en hora argentina, 5 por día, solo bajo par: un punto por golpe)', () => {
  const equipoDe = (a) => (PLANTEL.find((j) => j.apodo === a)?.dicky ? 'dicky' : M.esEquipo5(PLANTEL.find((j) => j.apodo === a)) ? 'e5' : null)
  const ahora = Date.parse('2026-10-09T15:00:00Z')
  const lunes = M.lunesDe(ahora, 1) // la semana pasada: lunes 28/9 00:00 hora argentina
  assert.equal(new Date(lunes).toISOString(), '2026-09-28T03:00:00.000Z')
  const en = (d, hhmm) => new Date(lunes + d * 864e5 + (+hhmm.slice(0, 2) * 60 + +hhmm.slice(3)) * 60e3).toISOString()
  const A = '00000000-0000-0000-0000-000000000001', B = A.replace(/1$/, '2'), C = A.replace(/1$/, '3')
  const m = (uid, apodo, vsPar, d, h) => ({ uid, usuario: uid.slice(-1), apodo, vsPar, fecha: en(d, h) })
  // el mismo escenario que se probó en la base (trampa_clasico_puntos): Dicky 7, Equipo 5 16 (par, sobre par y LP no suman)
  const marcas = [
    m(A, 'Fito (Đ)', -2, 1, '10:00'), m(A, 'Taiu (Đ)', 0, 1, '11:00'), m(A, 'El Ninja (Đ)', 3, 1, '12:00'),
    ...Array.from({ length: 7 }, (_, i) => m(A, 'Mike Queboni (Đ)', -1, 2, `09:${String(i * 7).padStart(2, '0')}`)),
    m(A, 'Fito (Đ)', -3, 7, '00:30'), // el lunes de esta semana: no cuenta
    m(B, 'Lechu', -3, 3, '20:00'), m(B, 'LG', -1, 3, '21:00'), m(B, 'Fito (Đ)', 1, 3, '22:00'),
    ...[0, 1, 2, 3].map((i) => m(C, i % 2 ? 'LG' : 'Lechu', -2, 4, `08:${i}0`)),
    m(C, 'Fito (5)', 0, 6, '23:30'), // el domingo 23:30: cuenta
    m(C, 'Tito', -3, 5, '10:00'), // de ningún equipo
    m(C, 'Lechu', null, 5, '11:00'), m(B, 'Taiu (Đ)', null, 5, '12:00'), // LP: no suman
    m(C, 'LG', -1, 5, '09:30'), m(C, 'LG', -1, 5, '10:00'), m(B, 'LG', -1, 5, '08:59'), // ⛳ el sábado a las 9:30 vale doble
  ]
  const c = M.clasico(marcas, lunes, equipoDe)
  assert.equal(c.dicky, 7); assert.equal(c.e5, 16); assert.equal(c.ganador, 'e5')
  // B solo jugó sobre par y LP con los Dicky: no aparece (no jugó para los Dicky, no cobraría si ganaban)
  assert.deepEqual(c.aportes.dicky.map((x) => [x.quien.slice(-1), x.pts]), [['1', 7]])
  assert.deepEqual(c.aportes.e5.map((x) => [x.quien.slice(-1), x.pts]), [['3', 11], ['2', 5]])
  // sin vueltas: empate en cero, nadie gana
  assert.equal(M.clasico([], lunes, equipoDe).ganador, null)
})

ok('🔒 Taiu: se desbloquea con −1 o mejor (firmado) con Fito, Miguelón y el Ninja', () => {
  const req = DESBLOQUEO_TAIU
  assert.deepEqual(req.con, ['Fito (Đ)', 'Mike Queboni (Đ)', 'El Ninja (Đ)'])
  let p = M.progresoDesbloqueo(req, {})
  assert.equal(p.listo, false)
  assert.equal(p.hechos, 0)
  p = M.progresoDesbloqueo(req, { 'Fito (Đ)': -1, 'Mike Queboni (Đ)': 0, 'El Ninja (Đ)': -3 })
  assert.equal(p.hechos, 2) // el par (E) no alcanza
  assert.equal(p.items[1].ok, false)
  assert.equal(M.progresoDesbloqueo(req, { 'Fito (Đ)': -1, 'Mike Queboni (Đ)': -2, 'El Ninja (Đ)': -1 }).listo, true)
})

ok('📊 stats: vueltas, LP y promedio (de las firmadas), en total y por player', () => {
  const conteo = [{ apodo: 'Fito (Đ)', jugadas: 5, lps: 2 }, { apodo: 'LG', jugadas: 2, lps: 0 }, { apodo: 'Fito (Đ)', jugadas: 1, lps: 0 }]
  const marcas = [{ apodo: 'Fito (Đ)', golpes: 12, vsPar: 1 }, { apodo: 'Fito (Đ)', golpes: 14, vsPar: 3 }, { apodo: 'LG', golpes: 10, vsPar: -1 }, { apodo: 'Mugre', golpes: 11, vsPar: 0 }]
  const { total, por } = M.estadisticas(conteo, marcas)
  // de entrada, por vueltas (más jugados primero); a pedido, por promedio de golpes o por LP
  assert.deepEqual(por.map((f) => f.apodo), ['Fito (Đ)', 'LG', 'Mugre'])
  assert.deepEqual(M.ordenarStats(por, 'promedio').map((f) => f.apodo), ['LG', 'Mugre', 'Fito (Đ)'])
  assert.deepEqual(M.ordenarStats(por, 'lp').map((f) => f.apodo), ['Fito (Đ)', 'LG', 'Mugre'])
  // por LP manda el porcentaje, no la cantidad: 1 LP en 2 vueltas (50%) va antes que 3 en 10 (30%)
  assert.deepEqual(M.ordenarStats([{ apodo: 'a', jugadas: 10, lps: 3, pctLP: 0.3 }, { apodo: 'b', jugadas: 2, lps: 1, pctLP: 0.5 }], 'lp').map((f) => f.apodo), ['b', 'a'])
  assert.deepEqual(M.ordenarStats([{ n: 'a', st: { jugadas: 1, lps: 0, pctLP: 0, promGolpes: 9 } }, { n: 'b', st: { jugadas: 3, lps: 2, pctLP: 0.6, promGolpes: null } }], 'promedio', (u) => u.st).map((u) => u.n), ['a', 'b'])
  const fito = por.find((f) => f.apodo === 'Fito (Đ)')
  assert.deepEqual([fito.jugadas, fito.lps, fito.firmadas, fito.prom, fito.promGolpes], [6, 2, 2, 2, 13])
  // Mugre: una firmada de antes del conteo, igual es una jugada
  assert.equal(por.find((f) => f.apodo === 'Mugre').jugadas, 1)
  assert.equal(total.jugadas, 6 + 2 + 1)
  assert.equal(total.lps, 2)
  assert.equal(total.prom, (1 + 3 - 1 + 0) / 4)
  assert.equal(M.formatoProm(2.25), '+2,3')
  assert.equal(M.formatoProm(-0.5), '−0,5')
  assert.equal(M.formatoProm(0.01), 'E')
  assert.deepEqual(M.estadisticas([], []).por, [])
  // por promedio, los que no firmaron ninguna van al final (aunque tengan más vueltas)
  assert.equal(M.ordenarStats(M.estadisticas([{ apodo: 'Mugre', jugadas: 9, lps: 9 }, { apodo: 'LG', jugadas: 1, lps: 0 }], [{ apodo: 'LG', golpes: 15, vsPar: 4 }]).por, 'promedio').at(-1).apodo, 'Mugre')
})

ok('el tope del putt baja de cerca (la goma entera es un putt corto) y el putt sale lo que muestra', () => {
  const campo = M.crearCampo()
  const h15 = M.HOYOS[0]
  assert.equal(M.puttMaxDe(1), M.PUTT_MAX.min)
  assert.equal(M.puttMaxDe(4), 14)
  assert.equal(M.puttMaxDe(40), M.FISICA.distPuttMax)
  const r = { ...M.nuevaRonda({ apodo: 'Rorro', emoji: '🥃' }, () => 0.5), pelota: [h15.pin[0], h15.pin[1] + 4], lie: 'green', golpes: 1 }
  assert.ok(M.enModoPutt(campo, r))
  const plan = M.planTiro(campo, r, -Math.PI / 2, 0.5)
  assert.equal(plan.puttMax, 14)
  assert.ok(Math.abs(plan.carry - 7) < 1e-9)
  // sin error, el putt rueda lo mismo que dice el plan (lanzar usa el mismo tope)
  const t = M.lanzar(campo, { pelota: r.pelota, angulo: Math.PI / 2, potencia: 0.5, viento: { ang: 0, kmh: 0 }, putt: true, lie: 'green', rng: () => 0.5, plan: { ...plan, recto: true, error: 0 } })
  assert.ok(Math.abs(Math.hypot(...t.v) - Math.sqrt(2 * M.FISICA.roce.green * 7)) < 1e-9)
})

ok('el palo en la mano: driver en la salida de los par 4, hierro en el par 3 y desde lejos, wedge cerca, putter en el green', () => {
  const campo = M.crearCampo()
  const r = M.nuevaRonda({ apodo: 'Rorro', emoji: '🥃' }, () => 0.5)
  assert.equal(M.paloDe(campo, r), 'driver')
  const h15 = M.HOYOS[0]
  const ver = (idx, pelota, lie) => M.paloDe(campo, { ...r, idx, pelota, lie })
  assert.equal(ver(0, [h15.pin[0], h15.pin[1] + 3], 'green'), 'putter')
  assert.equal(ver(0, [h15.pin[0], h15.pin[1] + 30 / h15.escala], 'fairway'), 'wedge')
  assert.equal(ver(0, [h15.pin[0], h15.pin[1] + 120 / h15.escala], 'fairway'), 'hierro')
  assert.equal(ver(1, M.HOYOS[1].tee, 'tee'), 'driver')
  assert.equal(ver(2, M.HOYOS[2].tee, 'tee'), 'hierro')
})

const haciaTee = (yd) => { const u = angulo(h15.pin, h15.tee); return [h15.pin[0] + Math.cos(u) * yd / h15.escala, h15.pin[1] + Math.sin(u) * yd / h15.escala] }
ok('el tiro perfecto (sale justo al medio) y el backspin del chip o el approach perfecto: pica en el green y vuelve', () => {
  const r = { ...M.nuevaRonda({ apodo: 'Rorro', emoji: '🥃', hcp: 14.6 }, fijo(0.5)), pelota: haciaTee(50), lie: 'fairway', golpes: 1, monos: [] }
  const d = M.dist(r.pelota, h15.pin), cae = d - 4
  const p = cae / M.FISICA.carryMax
  const t = M.golpear(campo, { ...r, pelota: [...r.pelota] }, angulo(r.pelota, h15.pin), p, sinRuido(), 0, 0, null, true)
  assert.equal(t.perfecto, true) // soltó en el sweet spot del latido
  assert.ok(t.backspin.d > 0)
  M.simular(campo, t, h15.pin)
  assert.ok(t.eventos.some((e) => e.tipo === 'backspin'))
  const atras = cae - M.dist(r.pelota, t.pos)
  assert.ok(atras > 0.5 && atras < 6, `volvió ${atras} yd`)
  // cuánto vuelve: el wedge más; los hierros largos, menos
  assert.ok(M.yardasBackspin(100) > M.yardasBackspin(40) && M.yardasBackspin(180) < M.yardasBackspin(110) && M.yardasBackspin(400) === M.BACKSPIN.minimo)
  // el tiro de salida del par 3 (hierro), perfecto, también puede volver; el drive no
  const r17 = { ...M.nuevaRonda({ apodo: 'Rorro', emoji: '🥃', hcp: 14.6 }, fijo(0.5)), idx: 2, monos: [] }
  r17.pelota = [...M.HOYOS[2].tee]; r17.lie = 'tee'
  assert.ok(M.golpear(campo, r17, angulo(r17.pelota, M.HOYOS[2].pin), 0.7, sinRuido(), 0, 0, null, true).backspin?.d > 0)
  // sin el sweet spot no es perfecto ni vuelve (aunque salga derecho); desde la salida tampoco hay backspin
  const t2 = M.golpear(campo, { ...r, pelota: [...r.pelota] }, angulo(r.pelota, h15.pin), p, sinRuido())
  assert.equal(t2.perfecto, false)
  assert.equal(t2.backspin, undefined)
  const salida = M.golpear(campo, M.nuevaRonda({ apodo: 'Rorro', emoji: '🥃', hcp: 14.6 }, fijo(0.5)), -Math.PI / 2, 0.5, sinRuido(), 0, 0, null, true)
  assert.equal(salida.perfecto, true)
  assert.equal(salida.backspin, undefined)
  // un tiro sin error sale perfecto siempre (Demetrio, LG sin error, el tiro de Deme)
  const sinError = M.lanzar(campo, { pelota: [...r.pelota], angulo: 0, potencia: 0.3, viento: calma, putt: false, lie: 'fairway', rng: fijo(0.9), plan: { putt: false, cuerda: 0, carry: 40, disp: { ang: 0, carry: 0 }, control: null } })
  assert.equal(sinError.perfecto, true)
})

ok('el latido de la potencia: más rápido cuanto más fuerte, ventana más ancha cerca del hoyo, y el perfecto con un cuarto del error', () => {
  assert.ok(M.periodoLatido(1) < M.periodoLatido(0.5) && M.periodoLatido(0.5) < M.periodoLatido(0))
  assert.equal(M.periodoLatido(0), M.PERFECTO.lento)
  assert.ok(Math.abs(M.periodoLatido(1) - M.PERFECTO.rapido) < 1e-12)
  assert.equal(M.ventanaPerfecto(200), M.PERFECTO.ventana)
  assert.ok(Math.abs(M.ventanaPerfecto(20) - M.PERFECTO.ventana * M.PERFECTO.cerca) < 1e-12)
  assert.ok(M.ventanaPerfecto(90) > M.ventanaPerfecto(150) && M.ventanaPerfecto(90) < M.ventanaPerfecto(30))
  // el sweet spot: cuando el aro llega al dorado (en `centro` de cada latido), ± la ventana (un poco más del lado de tarde)
  const c = M.PERFECTO.centro
  assert.ok(M.enSweetSpot(3 + c, 0.07) && M.enSweetSpot(2 + c - 0.06, 0.07) && M.enSweetSpot(4 + c + 0.08, 0.07))
  assert.ok(!M.enSweetSpot(3 + c - 0.08, 0.07) && !M.enSweetSpot(3.3, 0.07))
  // temprano o tarde, perfecto, bueno o nada
  assert.deepEqual([M.soltadaLatido(c - 0.03, 0.07).nivel, M.soltadaLatido(c - 0.03, 0.07).lado], ['perfecto', -1])
  assert.deepEqual([M.soltadaLatido(c + 0.12, 0.07).nivel, M.soltadaLatido(c + 0.12, 0.07).lado], ['bueno', 1])
  assert.deepEqual([M.soltadaLatido(c - 0.12, 0.07).nivel, M.soltadaLatido(c - 0.12, 0.07).lado], ['bueno', -1])
  assert.deepEqual([M.soltadaLatido(0.3, 0.07).nivel, M.soltadaLatido(0.3, 0.07).lado], [null, -1])
  assert.equal(M.soltadaLatido(1 + c + 0.1, 0.07).lado, 1) // el aro ya pasó el dorado: tarde
  assert.equal(M.soltadaLatido(1.02, 0.07).lado, -1) // volvió a empezar (grande): temprano del próximo
  // el perfecto: un cuarto del error de siempre (no cero); sin el sweet spot, nunca perfecto
  const plan = (perfecto) => ({ putt: false, cuerda: 0, carry: 100, disp: { ang: 0.1, carry: 0.1 }, control: null, perfecto })
  const medir = (perfecto) => {
    const rr = M.rngDesde(42)
    let perf = 0, err = 0, min = Infinity
    for (let i = 0; i < 5000; i++) {
      const t = M.lanzar(campo, { pelota: [0, 0], angulo: 0, potencia: 0.5, viento: calma, putt: false, lie: 'fairway', rng: rr, plan: plan(perfecto) })
      const e = Math.hypot(Math.atan2(t.carryVec[1], t.carryVec[0]) / 0.1, (t.carry / 100 - 1) / 0.1)
      if (t.perfecto) perf++
      err += e; min = Math.min(min, e)
    }
    return { perf, err: err / 5000, min }
  }
  const comun = medir(false), perfecto = medir(true)
  assert.equal(comun.perf, 0)
  assert.equal(perfecto.perf, 5000)
  assert.ok(Math.abs(perfecto.err / comun.err - M.PERFECTO.error) < 0.02, `el perfecto sale con ${perfecto.err / comun.err} del error`)
  assert.ok(perfecto.min > 0)
  // el bueno: con `errorBueno` del error; el lado lo decide cuándo soltó (temprano: izquierda; tarde: derecha)
  const lados = (lado, bueno) => {
    const rr = M.rngDesde(7)
    let izq = 0, der = 0, err = 0
    for (let i = 0; i < 2000; i++) {
      const t = M.lanzar(campo, { pelota: [0, 0], angulo: 0, potencia: 0.5, viento: calma, putt: false, lie: 'fairway', rng: rr, plan: { ...plan(false), bueno, lado } })
      const a = Math.atan2(t.carryVec[1], t.carryVec[0])
      if (a < 0) izq++; else if (a > 0) der++
      err += Math.abs(a) / 0.1
    }
    return { izq, der, err: err / 2000 }
  }
  const temprano = lados(-1, false), tarde = lados(1, false), bueno = lados(1, true)
  assert.equal(temprano.der, 0); assert.ok(temprano.izq > 1900)
  assert.equal(tarde.izq, 0); assert.ok(tarde.der > 1900)
  assert.ok(Math.abs(bueno.err / tarde.err - M.PERFECTO.errorBueno) < 0.05)
  // golpear: el perfecto no va en el putt
  const r = { ...M.nuevaRonda({ apodo: 'Rorro', emoji: '🥃', hcp: 14.6 }, fijo(0.5)), monos: [] }
  assert.equal(M.golpear(campo, { ...r, pelota: [...r.pelota] }, -Math.PI / 2, 0.5, sinRuido(), 0, 0, null, true).perfecto, true)
  const green = { ...r, pelota: [h15.pin[0], h15.pin[1] + 4], lie: 'green' }
  assert.equal(M.golpear(campo, green, -Math.PI / 2, 0.3, sinRuido(), 0, 0, null, true).modo, 'putt')
})

ok('el palo de la bandera: el tiro que baja sobre el hoyo le pega (adentro o rebota afuera); el putt no', () => {
  const r = { ...M.nuevaRonda({ apodo: 'Lechu', emoji: '🦉', hcp: 7 }, fijo(0.5)), pelota: haciaTee(40), lie: 'fairway', golpes: 1, monos: [], viento: calma }
  const d = M.dist(r.pelota, h15.pin)
  const t = M.golpear(campo, { ...r, pelota: [...r.pelota] }, angulo(r.pelota, h15.pin), (d + 1) / M.FISICA.carryMax, sinRuido())
  M.simular(campo, t, h15.pin)
  assert.ok(t.eventos.some((e) => e.tipo === 'bandera'), JSON.stringify(t.eventos))
  assert.ok(t.embocada || M.dist(t.pos, h15.pin) > M.FISICA.bocaHoyo, 'adentro o afuera de la boca, nunca encima del hoyo')
  // el putt, sin bandera
  const putt = { ...r, pelota: [h15.pin[0], h15.pin[1] + 5], lie: 'green' }
  const tp = M.golpear(campo, { ...putt, pelota: [...putt.pelota] }, angulo(putt.pelota, h15.pin), 0.6, sinRuido())
  M.simular(campo, tp, h15.pin)
  assert.ok(!tp.eventos.some((e) => e.tipo === 'bandera'))
})

ok('el juego corto: el error no baja de un mínimo en yardas (también un scratch) y el chip que se frena en la boca lejos del centro queda colgando', () => {
  const r = { ...M.nuevaRonda({ apodo: 'El Ruso', emoji: '🇮🇪', hcp: 0 }, fijo(0.5)), pelota: haciaTee(20), lie: 'fairway', golpes: 1, monos: [], viento: calma }
  const plan = M.planTiro(campo, r, angulo(r.pelota, h15.pin), 0.08)
  const cy = plan.carry * h15.escala
  assert.ok(cy < 60)
  assert.ok(Math.abs(plan.disp.carry * cy - M.CORTO.largo * M.CORTO.minimo) < 1e-9, `largo ${plan.disp.carry * cy}`)
  assert.ok(Math.abs(Math.tan(plan.disp.ang) * cy - M.CORTO.ancho * M.CORTO.minimo) < 1e-9)
  // de lejos, nada
  const lejos = M.planTiro(campo, r, angulo(r.pelota, h15.pin), 0.6)
  assert.ok(lejos.carry * h15.escala > 100 && lejos.disp.ang < 1e-9)
  // el chip que se frena dentro de la boca pero lejos del centro: colgando en el borde (afuera); el putt, adentro
  const chip = { modo: 'full', fase: 'rodando', pos: [h15.pin[0] + 0.45, h15.pin[1]], alt: 0, v: [0.0001, 0], eventos: [], carry: 20, ajenos: [] }
  M.avanzar(campo, chip, 1 / 60, h15.pin)
  assert.ok(!chip.embocada && chip.eventos.some((e) => e.tipo === 'borde') && M.dist(chip.pos, h15.pin) > M.FISICA.bocaHoyo)
  const putt = { modo: 'putt', fase: 'rodando', pos: [h15.pin[0] + 0.45, h15.pin[1]], alt: 0, v: [0.0001, 0], eventos: [], ajenos: [] }
  M.avanzar(campo, putt, 1 / 60, h15.pin)
  assert.equal(putt.embocada, true)
})

console.log('\nTodo verde.')
