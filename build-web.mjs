// node build-web.mjs — arma index.html (la web app de GitHub Pages) a partir de juego.html,
// que es el mismo juego que se publica como artifact (allá el artifact le pone el <head>; acá se lo ponemos nosotros).
import fs from 'node:fs'

const juego = fs.readFileSync('juego.html', 'utf8')
const corte = juego.indexOf('<canvas id="cancha"')
if (corte < 0) throw new Error('no encontré el canvas en juego.html')
const cabeza = juego.slice(0, corte).trim() // <title>, fuentes y estilos
const cuerpo = juego.slice(corte)

const html = `<!doctype html>
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
fs.writeFileSync('index.html', html)
console.log('index.html listo (' + html.length + ' bytes)')
