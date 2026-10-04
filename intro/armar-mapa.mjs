// node intro/armar-mapa.mjs — los datos de la cancha para el vuelo 3D de la presentación (intro/mapa-datos.js):
// los tres hoyos (tee azul, bandera, calle, par, yardas) y una muestra de las celdas de árboles (para los ojos).
import fs from 'node:fs'
import { HOYOS } from '../motor.js'
import { CANCHA } from '../cancha-grid.js'

const aqui = (p) => new URL(p, import.meta.url)
// árboles con lugar alrededor (no pegados al borde del dibujo), elegidos con una semilla fija
let s = 12345
const azar = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648)
const arboles = []
for (let y = 6; y < CANCHA.alto - 6; y += 3) {
  for (let x = 6; x < CANCHA.ancho - 6; x += 3) {
    const fila = CANCHA.filas[y]
    if (fila[x] !== 't') continue
    // adentro del bosque (rodeado de árboles), así los ojos miran desde la sombra
    let n = 0
    for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) if (CANCHA.filas[y + dy][x + dx] === 't') n++
    if (n >= 3 && azar() < 0.35) arboles.push([x + 0.5, y + 0.5, +azar().toFixed(3)])
  }
}
const datos = {
  ancho: 878 / CANCHA.escala,
  alto: 1791 / CANCHA.escala,
  hoyos: HOYOS.map((h) => ({ n: h.n, par: h.par, tee: h.azul, pin: h.pin, calle: h.calle, yardas: h.yardas.azul })),
  arboles,
}
fs.writeFileSync(aqui('mapa-datos.js'), `// generado por armar-mapa.mjs: no tocar a mano\nexport const MAPA = ${JSON.stringify(datos)}\n`)
console.log(`intro/mapa-datos.js listo (${arboles.length} árboles con ojos)`)
