// node t-vuelta.cjs semilla [rapido] — portada, mazo, El Sueco y el hoyo 15 entero
const { abrir } = require('./rodaje.cjs')
const J = require('./jugadas.cjs')
const semilla = +(process.argv[2] ?? 7)
const rapido = process.argv[3] === 'rapido'
;(async () => {
  const r = await abrir({ semilla, dpr: rapido ? 1 : 3, datos: { usuario: '', records: {}, tiros: 10, vistoTip: true } })
  r.grabar('vuelta-' + semilla)
  r.sinFotos = rapido
  await r.seg(1.6)
  r.marca('nombre')
  await r.tocar('#usuario')
  await r.seg(0.3)
  await r.escribir('SDGA')
  await r.seg(0.5)
  r.marca('jugar')
  await r.tocar('#jugar')
  await r.seg(1.1)
  r.marca('mazo')
  // pasa las cartas: tres para adelante, dos para atrás, y queda El Sueco
  const swipe = async (dir) => { await r.bajar(dir < 0 ? 300 : 90, 430); await r.seg(0.06); await J.trazo(r, dir < 0 ? 70 : 330, 410, 0.28, J.sale); await r.subir(); await r.seg(0.55) }
  for (let i = 0; i < 4; i++) await swipe(-1)
  await r.seg(0.3)
  for (let i = 0; i < 3; i++) await swipe(1)
  await r.seg(0.6)
  const quien = await r.page.evaluate(() => document.querySelector('#mazo-cartas .arriba h3')?.textContent)
  r.marca('elige', { quien })
  await r.tocar('#mazo-cartas .arriba .carta-jugar')
  r.marca('banda')
  await r.hasta(() => __J.estado === 'cuenta', null, 10)
  r.marca('cuenta')
  for (let k = 0; k < 12 && !(await J.est(r)).terminada; k++) {
    const e = await J.est(r)
    if (e.hoyo !== 15) break
    await J.tirar(r, { sinApuro: true })
    await J.esperarTiro(r)
  }
  await r.hasta(() => __J.estado === 'intro' || __J.estado === 'fin', null, 8)
  r.marca('fin', await J.est(r))
  await r.seg(1)
  await r.cerrar()
})().catch((e) => { console.error('FALLO', e); process.exit(1) })
