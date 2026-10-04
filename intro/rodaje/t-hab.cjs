// node t-hab.cjs <caso> <semilla> [graba] — una jugada de una habilidad (o de los monos), grabada en 3x
const { abrir } = require('./rodaje.cjs')
const J = require('./jugadas.cjs')
const [caso, semillaTxt, modo] = process.argv.slice(2)
const semilla = +semillaTxt
const graba = modo === 'graba'

/** empieza la grabación (en 3x) o, explorando, solo marca el momento */
async function accion(r, nombre) {
  await r.densidad(graba ? 3 : 1)
  r.grabar(`${caso}-${semilla}`)
  r.sinFotos = !graba
  r.marca('accion', { cual: nombre })
}
const objetivoDe = (r, tipo, lado = 1, dist = 26) => r.page.evaluate(([tipo, lado, dist]) => {
  // el mejor tiro normal, corrido para un costado: ahí tiene que caer (bosque, rough…)
  const t = __bot.elegir({ viento: true })
  const R = __J.ronda, M = __J.M
  const a = Math.atan2(t.pos[1] - R.pelota[1], t.pos[0] - R.pelota[0])
  return { punto: [t.pos[0] - Math.sin(a) * dist * lado, t.pos[1] + Math.cos(a) * dist * lado], tipo }
}, [tipo, lado, dist])

const CASOS = {
  // Miguelón: a fondo desde el tee el óvalo late; soltando en el pico llega al green
  bomba: { jugador: 'Mike Queboni (Đ)', async jugar(r) {
    await J.aApuntar(r, 0.3); await accion(r, 'bomba')
    await J.tirar(r, { elegir: { pMin: 0.95, viento: true }, tirar: 0.8 }); await J.esperarTiro(r); await r.seg(1.2)
  } },
  // Fito: la línea se sacude; suelta en el embudo
  aguila: { jugador: 'Fito (Đ)', async jugar(r) {
    await J.aApuntar(r, 0.3); await accion(r, 'aguila')
    await J.tirar(r, { mantener: 1.4 }); await J.esperarTiro(r); await r.seg(1)
  } },
  // Fito: chip in con el imán (se acerca a 15-40 yd del hoyo, afuera del green, y la mete)
  chipin: { jugador: 'Fito (Đ)', async jugar(r) {
    for (let k = 0; k < 8; k++) {
      const e = await J.est(r)
      if (e.alPin <= 40 && e.alPin >= 12 && e.lie !== 'green' && e.lie !== 'tee') break
      if (e.alPin > 60) {
        const obj = await r.page.evaluate(() => { const R = __J.ronda, M = __J.M, pin = M.hoyoActual(R).pin, a = Math.atan2(R.pelota[1] - pin[1], R.pelota[0] - pin[0]); const d = M.dist(R.pelota, pin); const k = Math.min(24, d - 30); return { punto: [pin[0] + Math.cos(a) * 24, pin[1] + Math.sin(a) * 24], tipo: 'fairway' } })
        await J.tirar(r, { elegir: { objetivo: obj, viento: true }, mantener: 0.7 })
      } else {
        // cerca pero no tanto: un toquecito para quedar a tiro
        const obj = await r.page.evaluate(() => { const R = __J.ronda, M = __J.M, pin = M.hoyoActual(R).pin, a = Math.atan2(R.pelota[1] - pin[1], R.pelota[0] - pin[0]); return { punto: [pin[0] + Math.cos(a) * 20, pin[1] + Math.sin(a) * 20], tipo: 'fairway' } })
        await J.tirar(r, { elegir: { objetivo: obj, viento: true }, mantener: 0.7 })
      }
      await J.esperarTiro(r)
      await r.hasta(() => __J.estado === 'apuntar' || __J.estado === 'fin', null, 12)
    }
    await J.aApuntar(r, 0.3); await accion(r, 'chip ' + (await J.est(r)).alPin)
    await J.tirar(r, { mantener: 1.1, ventana: 1, elegir: { viento: true, abre: 6, pasoG: 0.5 } }); await J.esperarTiro(r); await r.seg(2.6)
  } },
  // el Mago: cada golpe con su efecto (la línea curva)
  mago: { jugador: 'El Mago Rodal', async jugar(r) {
    await J.aApuntar(r, 0.3); await accion(r, 'mago ' + (await J.est(r)).golpeMago)
    await J.tirar(r, { mantener: 0.6 }); await J.esperarTiro(r); await r.seg(1.2)
  } },
  // la Mugre: vienen los monos y les tira un pancho
  pancho: { jugador: 'Mugre', async jugar(r) {
    await J.tirar(r, { mantener: 0.5, elegir: { viento: true, pMax: 0.85 } }); await J.esperarTiro(r)
    await r.hasta(() => __J.estado === 'apuntar', null, 10)
    await accion(r, 'pancho ' + (await J.est(r)).cazan)
    await r.seg(1.3)
    r.marca('pancho', await J.est(r))
    await r.tocar('#pancho', { quieto: 0.12 })
    await r.seg(2.4)
    await J.tirar(r, { pausa: 0.2, mantener: 0.3 }); await J.esperarTiro(r); await r.seg(0.8)
  } },
  // los monos llegan antes del golpe: se la llevan y al tee con un golpe de multa
  ladron: { jugador: 'El Sueco', async jugar(r) {
    await J.tirar(r, { mantener: 0.5 }); await J.esperarTiro(r)
    await r.hasta(() => __J.estado === 'apuntar', null, 10)
    await accion(r, 'ladron ' + (await J.est(r)).cazan)
    await r.hasta(() => __J.estado === 'anim', null, 15)
    r.marca('llegan', await J.est(r))
    await r.hasta(() => __J.estado === 'apuntar', null, 8); await r.seg(1.5)
  } },
  // al bosque: el Mono malo la tira afuera (+1) o, a veces, el Mono bueno la devuelve
  bosque: { jugador: 'El Sueco', async jugar(r) {
    const obj = await objetivoDe(r, 'bosque', semilla % 2 ? 1 : -1, 30)
    await J.aApuntar(r, 0.3); await accion(r, 'bosque')
    await J.tirar(r, { elegir: { objetivo: obj, viento: true }, mantener: 0.4 }); const e = await J.esperarTiro(r)
    await r.seg(2.6); r.marca('resultado', await J.est(r))
  } },
  // el Perro va a buscarla al bosque
  perro: { jugador: 'El Perro', async jugar(r) {
    const obj = await objetivoDe(r, 'bosque', semilla % 2 ? 1 : -1, 30)
    await J.aApuntar(r, 0.3); await accion(r, 'perro')
    await J.tirar(r, { elegir: { objetivo: obj, viento: true }, mantener: 0.4 }); await J.esperarTiro(r)
    await r.hasta(() => __J.estado === 'apuntar', null, 10); await r.seg(1)
  } },
  // Lechu: el putt corto es dada
  dada: { jugador: 'Lechu', async jugar(r) {
    for (let k = 0; k < 6; k++) {
      const e = await J.est(r)
      if (e.lie === 'green') break
      await J.tirar(r, { mantener: 0.4 }); await J.esperarTiro(r)
    }
    await J.aApuntar(r, 0.3); await accion(r, 'dada ' + (await J.est(r)).alPin)
    await J.tirar(r, { elegir: { corto: 1.0 }, mantener: 0.4 }); await J.esperarTiro(r); await r.seg(3)
  } },
  // el Ninja: LP de la tradición (+1 y al fairway)
  ninja: { jugador: 'El Ninja (Đ)', async jugar(r) {
    const obj = await objetivoDe(r, 'rough', semilla % 2 ? 1 : -1, 18)
    await J.tirar(r, { elegir: { objetivo: obj, viento: true }, mantener: 0.4 }); await J.esperarTiro(r)
    await r.hasta(() => __J.estado === 'apuntar', null, 10); await accion(r, 'ninja ' + (await J.est(r)).lie)
    await r.seg(1.0); await r.tocar('#lp'); await r.seg(0.6); await r.tocar('#lp'); await r.seg(3.7)
  } },
  // LG: después de un mal tiro no se enoja (sin error)
  lg: { jugador: 'LG', async jugar(r) {
    const obj = await objetivoDe(r, 'rough', semilla % 2 ? 1 : -1, 18)
    await J.tirar(r, { elegir: { objetivo: obj, viento: true }, mantener: 0.4 }); await J.esperarTiro(r)
    await r.hasta(() => __J.estado === 'apuntar', null, 10); await accion(r, 'lg ' + (await J.est(r)).calma)
    await J.tirar(r, { pausa: 0.2, mantener: 0.5 }); await J.esperarTiro(r); await r.seg(1)
  } },
  // Liberty: el approach con el triple de error
  liberty: { jugador: 'Liberty', async jugar(r) {
    await J.tirar(r, { mantener: 0.4 }); await J.esperarTiro(r)
    await J.aApuntar(r, 0.3); await accion(r, 'liberty ' + (await J.est(r)).alPin)
    await J.tirar(r, { mantener: 0.9 }); await J.esperarTiro(r); await r.seg(1)
  } },
}

;(async () => {
  const c = CASOS[caso]
  const r = await abrir({ semilla, dpr: 1, datos: { usuario: 'SDGA', records: {}, tiros: 10, vistoTip: true, ultimo: c.jugador } })
  r.sinFotos = true
  await r.page.evaluate((a) => __J.empezar(__J.PLANTEL.find((j) => j.apodo === a)), c.jugador)
  await r.hasta(() => __J.estado === 'apuntar', null, 15)
  await c.jugar(r)
  r.marca('fin', await J.est(r))
  await r.cerrar()
})().catch((e) => { console.error('FALLO', e); process.exit(1) })
