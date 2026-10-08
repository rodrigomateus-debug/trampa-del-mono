// node build-web.mjs — arma index.html (la web app de GitHub Pages) a partir de juego.html,
// que es el mismo juego que se publica como artifact (allá el artifact le pone el <head>; acá se lo ponemos nosotros).
import fs from 'node:fs'
import './intro/armar-app.mjs' // textos y logo de la intro para la app (intro/app-overlay.js)

const juego = fs.readFileSync('juego.html', 'utf8')
// el CSS tiene que cerrar todas sus llaves: una sin cerrar (pasó el 2026-10-08) se come todo lo que viene después y la
// portada sale sin estilos. Se cuentan las llaves de cada <style>, sin los comentarios ni lo que va entre comillas
for (const [, css] of juego.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
  const limpio = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/"[^"\n]*"|'[^'\n]*'/g, '""')
  let nivel = 0
  for (const [i, ch] of [...limpio].entries()) {
    nivel += ch === '{' ? 1 : ch === '}' ? -1 : 0
    if (nivel < 0) throw new Error(`CSS: una llave de más cerca de «${limpio.slice(Math.max(0, i - 60), i + 1)}»`)
  }
  if (nivel !== 0) throw new Error(`CSS: ${nivel} llave(s) sin cerrar en juego.html`)
}
const corte = juego.indexOf('<canvas id="cancha"')
if (corte < 0) throw new Error('no encontré el canvas en juego.html')
const cabeza = juego.slice(0, corte).trim() // <title>, fuentes y estilos
const cuerpo = juego.slice(corte)

const html0 = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#14402a">
<meta name="description" content="La Trampa del Mono: los hoyos 15, 16 y 17 de San Diego, con los monos y el plantel del SDGA.">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Trampa">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="iconos/icono-180.png">
<link rel="icon" type="image/png" sizes="32x32" href="iconos/icono-32.png">
<style>:root{padding:env(safe-area-inset-top,0) 0 env(safe-area-inset-bottom,0)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
${cabeza}
</head>
<body>
${cuerpo}
</body>
</html>
`
// Versión en los módulos (?v=hash del contenido): GitHub Pages cachea 10 minutos y los teléfonos más;
// con la versión, cada cambio del juego llega apenas se publica (también adentro de la SDGApp).
// cancha-grid.js va sin versión: lo importa también motor.js y tiene que ser el MISMO módulo.
import crypto from 'node:crypto'
const version = crypto.createHash('sha1').update(['motor.js', 'plantel.js', 'ranking.js', 'sonido.js', 'cancha-grid.js'].map((f) => fs.readFileSync(f, 'utf8')).join('')).digest('hex').slice(0, 10)
const html = html0.replace(/from '\.\/(motor|plantel|ranking|sonido)\.js'/g, (_, f) => `from './${f}.js?v=${version}'`)
// la intro también (su app.js y lo que arma armar-app.mjs)
  .replace('src="intro/app.js"', `src="intro/app.js?v=${crypto.createHash('sha1').update(['intro/app.js', 'intro/app-overlay.js'].map((f) => fs.readFileSync(f, 'utf8')).join('')).digest('hex').slice(0, 10)}"`)
// la versión, chiquita al pie de la portada: para ver de un vistazo si al teléfono ya le llegó lo último
const huella = crypto.createHash('sha1').update(juego + version).digest('hex').slice(0, 7)
const fecha = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const conVersion = html.replace('<span class="version" id="version"></span>', `<span class="version" id="version">v ${huella} · ${fecha}</span>`)
if (conVersion === html) throw new Error('no encontré el lugar de la versión en la portada')
fs.writeFileSync('index.html', conVersion)
console.log('index.html listo (' + html.length + ' bytes)')
