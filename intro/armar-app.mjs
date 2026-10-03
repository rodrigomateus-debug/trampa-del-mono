// node intro/armar-app.mjs — arma intro/app-overlay.js (los textos y el logo que usa la app) a partir de las
// composiciones del video, así hay una sola fuente: index.html (16:9) y compositions/vertical.html (9:16).
// Lo corre también build-web.mjs.
import fs from 'node:fs'

const aqui = (p) => new URL(p, import.meta.url)
const horizontal = fs.readFileSync(aqui('index.html'), 'utf8')
const vertical = fs.readFileSync(aqui('compositions/vertical.html'), 'utf8')

function entre(texto, desde, hasta, cual) {
  const i = texto.indexOf(desde)
  const j = texto.indexOf(hasta, i + desde.length)
  if (i < 0 || j < 0) throw new Error(`no encontré ${desde} … ${hasta} en ${cual}`)
  return texto.slice(i + desde.length, j)
}

// prefija cada selector (el CSS del overlay son reglas planas, sin @media)
function encerrar(css, prefijo) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/([^{}]+)\{([^{}]*)\}/g, (_, sel, cuerpo) => {
      const sels = sel
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => `${prefijo} ${s}`)
      return `${sels.join(', ')} {${cuerpo.replace(/\s+/g, ' ')}}\n`
    })
    .replace(/\n\s*\n/g, '\n')
    .trim()
}

const literal = (s) => '`' + s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`'

const markup = entre(horizontal, '<!-- overlay:desde -->', '<!-- overlay:hasta -->', 'index.html')
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean)
  .join('\n')
const css = encerrar(entre(horizontal, '/* overlay:desde */', '/* overlay:hasta */', 'index.html'), '#intro-app')
const cssVertical = encerrar(entre(vertical, '/* vertical:desde */', '/* vertical:hasta */', 'compositions/vertical.html'), '#intro-app.vertical')

const salida = `// GENERADO por intro/armar-app.mjs a partir de intro/index.html y intro/compositions/vertical.html. No editar a mano.
export const MARKUP = ${literal(markup)}

export const CSS = ${literal(css)}

export const CSS_VERTICAL = ${literal(cssVertical)}
`
fs.writeFileSync(aqui('app-overlay.js'), salida)
console.log('intro/app-overlay.js listo (' + salida.length + ' bytes)')
