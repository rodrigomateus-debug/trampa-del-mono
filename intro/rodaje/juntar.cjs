// node juntar.cjs — pasa las tomas elegidas a intro/assets/juego (mp4 + tomas.json con las marcas)
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { armarVideo } = require('./rodaje.cjs')
const DEST = path.resolve(__dirname, '../assets/juego')
const TOMAS = process.env.TOMAS || path.join(__dirname, 'tomas')
const C = require('./elegidas.json')
fs.mkdirSync(DEST + '/cartas', { recursive: true })

const salida = { cartas: [], habilidades: C.habilidades, triptico: C.triptico }
for (const [nombre, def] of Object.entries(C.tomas)) {
  const dir = path.join(TOMAS, def.dir)
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'marcas.json'), 'utf8'))
  const archivo = nombre + '.mp4'
  const dest = path.join(DEST, archivo)
  const fuente = path.join(dir, '00000.jpg')
  if (!fs.existsSync(dest) || fs.statSync(dest).mtimeMs < fs.statSync(fuente).mtimeMs || process.argv.includes('--todo')) {
    armarVideo(def.dir, dest, { crf: def.crf ?? 22, escala: def.ancho === 1170 ? null : `${def.ancho ?? 780}:-2` })
    console.log('video', archivo)
  }
  const dur = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', dest]).toString().trim()
  const ancho = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', dest]).toString().trim()
  salida[nombre] = { archivo, dur: +dur.toFixed(3), tam: ancho, marcas: m.marcas.map((x) => ({ nombre: x.nombre, t: x.t })), ...(def.extra || {}) }
}
// las cartas del mazo
const cartas = fs.readdirSync(path.join(__dirname, 'cartas')).filter((f) => f.endsWith('.png')).sort()
for (const f of cartas) {
  const w = f.replace('.png', '.webp')
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', path.join(__dirname, 'cartas', f), '-vf', 'scale=760:-1:flags=lanczos', '-c:v', 'libwebp', '-quality', '88', path.join(DEST, 'cartas', w)])
  salida.cartas.push([w, f.replace(/^\d+-|\.png$/g, '')])
}
// la cara de cada uno (un recorte cuadrado de la foto de la carta) para las placas de las habilidades
fs.mkdirSync(path.join(DEST, 'caras'), { recursive: true })
const slug = (t) => t.toLowerCase().normalize('NFD').replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '')
for (const [w, s] of salida.cartas) {
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', path.join(__dirname, 'cartas', w.replace('.webp', '.png')), '-vf', 'crop=iw*0.56:iw*0.56:iw*0.22:ih*0.115,scale=300:300:flags=lanczos', '-c:v', 'libwebp', '-quality', '88', path.join(DEST, 'caras', s + '.webp')])
}
for (const h of salida.habilidades) {
  const c = salida.cartas.find(([, s]) => s.startsWith(slug(h.apodo)))
  if (!c) throw new Error('no encontré la carta de ' + h.apodo)
  h.foto = c[1] + '.webp'
}
if (fs.existsSync(path.join(__dirname, 'resumen.png'))) execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', path.join(__dirname, 'resumen.png'), '-vf', 'scale=720:-1:flags=lanczos', path.join(DEST, 'resumen.png')])
fs.writeFileSync(path.join(DEST, 'tomas.json'), JSON.stringify(salida, null, 1))
console.log('tomas.json:', Object.keys(salida).join(', '))
