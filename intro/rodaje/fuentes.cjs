// CSS de Google Fonts servido local (en este entorno fonts.googleapis no carga)
const fs = require('fs');
const path = require('path');
const D = path.dirname(path.dirname(require.resolve('@fontsource/anton/package.json')));
const f = (p) => 'data:font/woff2;base64,' + fs.readFileSync(p).toString('base64');
module.exports = [
  ['Anton', 400, 'normal', D + '/anton/files/anton-latin-400-normal.woff2'],
  ['Archivo', 400, 'normal', D + '/archivo/files/archivo-latin-400-normal.woff2'],
  ['Archivo', 400, 'italic', D + '/archivo/files/archivo-latin-400-italic.woff2'],
  ['Archivo', 600, 'normal', D + '/archivo/files/archivo-latin-600-normal.woff2'],
  ['Archivo', 800, 'normal', D + '/archivo/files/archivo-latin-800-normal.woff2'],
].map(([fam, w, st, p]) => `@font-face{font-family:"${fam}";font-weight:${w};font-style:${st};src:url(${f(p)}) format("woff2")}`).join('\n');
