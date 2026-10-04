// node t-plantel.cjs — las 10 cartas del mazo (fotos en 3x), la lista "ver todos" y el modal de una habilidad
const fs = require('fs')
const { abrir } = require('./rodaje.cjs')
;(async () => {
  const r = await abrir({ semilla: 9, dpr: 3, datos: { usuario: 'SDGA', records: {}, tiros: 10, vistoTip: true } })
  const out = __dirname + '/cartas'
  fs.mkdirSync(out, { recursive: true })
  await r.tocar('#jugar')
  await r.seg(1.2)
  const n = await r.page.evaluate(() => __J.PLANTEL.length)
  for (let i = 0; i < n; i++) {
    await r.seg(0.6)
    const quien = await r.page.evaluate(() => document.querySelector('#mazo-cartas .arriba h3').textContent)
    const slug = quien.toLowerCase().normalize('NFD').replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '')
    await r.page.locator('#mazo-cartas .arriba .carta').screenshot({ path: `${out}/${String(i).padStart(2, '0')}-${slug}.png` })
    console.log('carta', i, quien)
    await r.page.evaluate(() => document.querySelector('#mazo-sig').click())
    await r.seg(0.5)
  }
  await r.cerrar()
})().catch((e) => { console.error('FALLO', e); process.exit(1) })
