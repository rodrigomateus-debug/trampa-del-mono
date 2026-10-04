// node t-final.cjs <semilla> <firma|marshall> [graba] — vuelta entera de El Sueco con el bot; graba la tarjeta final
const { abrir } = require('./rodaje.cjs')
const J = require('./jugadas.cjs')
const [semillaTxt, variante, modo] = process.argv.slice(2)
const semilla = +semillaTxt
const graba = modo === 'graba'
;(async () => {
  const r = await abrir({ semilla, dpr: 1, datos: { usuario: 'SDGA', records: {}, tiros: 10, vistoTip: true, ultimo: 'El Sueco' } })
  r.sinFotos = true
  await r.page.evaluate(() => __J.empezar(__J.PLANTEL.find((j) => j.apodo === 'El Sueco')))
  for (let k = 0; k < 40; k++) {
    await r.hasta(() => __J.estado === 'apuntar' || __J.estado === 'fin', null, 30)
    const e = await J.est(r)
    if (e.estado === 'fin' || e.terminada) break
    await J.tirar(r, { pausa: 0.3, mantener: 0.2, tirar: 0.4 })
    const q = await J.esperarTiro(r)
  }
  await r.hasta(() => __J.estado === 'fin', null, 10)
  r.marca('tarjeta', await J.est(r))
  await r.densidad(graba ? 3 : 1)
  r.grabar(`final-${variante}-${semilla}`)
  r.sinFotos = !graba
  await r.seg(2.2)
  if (variante === 'firma') {
    await r.tocar('#firmar', { quieto: 0.12 })
    r.marca('firmo')
    await r.seg(2.4)
    await r.tocar('#compartir-img', { quieto: 0.12 })
    await r.seg(2.8)
    r.marca('resumen')
    if (graba) {
      const b64 = await r.page.evaluate(async () => { const res = await fetch(document.querySelector('#resumen-img').src); const u8 = new Uint8Array(await res.arrayBuffer()); let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s) })
      require('fs').writeFileSync(__dirname + '/resumen.png', Buffer.from(b64, 'base64'))
    }
    await r.tocar('#resumen-cerrar', { quieto: 0.1 })
    await r.seg(0.7)
    await r.tocar('#fin-ranking', { quieto: 0.1 })
    r.marca('ranking')
    await r.seg(2.6)
  } else {
    await r.hasta(() => !document.querySelector('#comunicado').hidden, null, 12)
    r.marca('marshall')
    await r.seg(2.4)
    await r.tocar('#acatar', { quieto: 0.12 })
    await r.seg(1.5)
  }
  await r.cerrar()
})().catch((e) => { console.error('FALLO', e); process.exit(1) })
