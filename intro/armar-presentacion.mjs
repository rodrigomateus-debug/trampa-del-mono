// node intro/armar-presentacion.mjs — arma intro/compositions/presentacion.html, la presentación oficial de la app
// (9:16, ~75 s, con la canción hasta el final del primer estribillo), a partir de la intro vertical
// (compositions/vertical.html) más las funciones del juego con capturas reales (assets/capturas/).
import fs from 'node:fs'

const aqui = (p) => new URL(p, import.meta.url)
let h = fs.readFileSync(aqui('compositions/vertical.html'), 'utf8')

const COMPAS = 1.3285
const C0 = 0.92
const c = (n) => Math.round((C0 + COMPAS * n) * 1000) / 1000
const B = COMPAS / 4
const FIN = 75.3

function cambiar(a, b) {
  if (!h.includes(a)) throw new Error('no encontré: ' + a.slice(0, 80))
  h = h.replace(a, b)
}

// ---------- cabeza ----------
cambiar('<title>La Trampa del Mono — Intro (vertical)</title>', '<title>La Trampa del Mono — Presentación oficial</title>')
cambiar(
  /    <script>\n      window\.FORMATO = "vertical";[^\n]*\n    <\/script>\n/.exec(h)[0],
  `    <script>
      // tiempos de la presentación (en compases de la canción; ver cues.js)
      window.PRESENTACION = { logo: ${c(23)}, funciones: ${c(25)}, estribillo: ${c(40)}, cierre: ${c(47)}, FIN: ${FIN} };
    </script>
`,
)
cambiar('<script type="module" src="escena.js"></script>', '<script type="module" src="escena-presentacion.js"></script>')

// ---------- raíz, logo de la intro y canción ----------
cambiar('data-composition-id="main" data-start="0" data-width="1080" data-height="1920" data-duration="36.8"', `data-composition-id="presentacion" data-start="0" data-width="1080" data-height="1920" data-duration="${FIN}"`)
cambiar('<section id="logo" class="clip" data-start="31.48" data-duration="5.32"', `<section id="logo" class="clip" data-start="31.48" data-duration="${(c(25) - 31.48).toFixed(3)}"`)
cambiar(/data-duration="36\.8"\n(\s*)data-track-index="10"/.exec(h)[0], `data-duration="${FIN}"\n$1data-track-index="10"`)
cambiar(
  `{"t":36.1,"v":1},{"t":36.8,"v":0}`,
  `{"t":${FIN - 0.9},"v":1},{"t":${FIN},"v":0}`,
)

// ---------- estilos ----------
const ojo = (id) => `<svg class="ojo lt" ${id ? `id="${id}" ` : ''}viewBox="0 0 100 158" aria-hidden="true"><g class="parpado"><ellipse cx="50" cy="79" rx="49" ry="78" fill="#f4eeda" /><g fill="#e7dfc2"><circle cx="22" cy="40" r="6" /><circle cx="48" cy="22" r="6" /><circle cx="76" cy="38" r="6" /><circle cx="16" cy="78" r="6" /><circle cx="84" cy="80" r="6" /><circle cx="24" cy="118" r="6" /><circle cx="50" cy="136" r="6" /><circle cx="77" cy="118" r="6" /></g><g class="pupila"><ellipse cx="50" cy="84" rx="27" ry="31" fill="#e8c34a" /><ellipse cx="50" cy="84" rx="17" ry="21" fill="#0c2b1c" /><circle cx="58" cy="74" r="6" fill="#ffffff" /></g></g></svg>`
const ojoSuelto = `<svg viewBox="0 0 100 158" aria-hidden="true"><ellipse cx="50" cy="79" rx="49" ry="78" fill="#f4eeda" /><g fill="#e7dfc2"><circle cx="22" cy="40" r="6" /><circle cx="48" cy="22" r="6" /><circle cx="76" cy="38" r="6" /><circle cx="16" cy="78" r="6" /><circle cx="84" cy="80" r="6" /><circle cx="24" cy="118" r="6" /><circle cx="50" cy="136" r="6" /><circle cx="77" cy="118" r="6" /></g><g class="pu"><ellipse cx="50" cy="84" rx="27" ry="31" fill="#e8c34a" /><ellipse cx="50" cy="84" rx="17" ry="21" fill="#0c2b1c" /><circle cx="58" cy="74" r="6" fill="#ffffff" /></g></svg>`

const css = `
      /* ---------- presentación oficial ---------- */
      #p-oscuro {
        background: #0c2b1c;
        opacity: 0;
      }
      .feat {
        display: block;
      }
      .feat-cab {
        position: absolute;
        left: 72px;
        right: 72px;
        top: 96px;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
      }
      .feat-kicker {
        display: block;
        font: 800 22px/1 var(--body);
        letter-spacing: 0.3em;
        color: var(--cream);
        background: var(--green-900);
        border-radius: 6px;
        padding: 9px 14px 8px 16px;
        margin-bottom: 18px;
      }
      .feat-kicker b {
        color: var(--gold);
        font-weight: 800;
        margin-right: 0.6em;
      }
      .feat-tit {
        font: 400 112px/0.92 var(--display);
        letter-spacing: 0.01em;
        color: var(--cream);
        filter: drop-shadow(0 6px 22px rgba(5, 18, 11, 0.5));
      }
      .feat-banda {
        position: relative;
        display: block;
        margin-top: 16px;
        padding: 8px 20px 6px;
        overflow: hidden;
      }
      .feat-banda i {
        position: absolute;
        inset: 0;
        background: var(--gold);
      }
      .feat-banda span {
        position: relative;
        display: block;
        font: 400 40px/1 var(--display);
        letter-spacing: 0.05em;
        color: var(--green-900);
      }
      .feat-txt {
        display: block;
        max-width: 900px;
        margin-top: 16px;
        font: 600 25px/1.35 var(--body);
        color: var(--cream);
        filter: drop-shadow(0 2px 10px rgba(5, 18, 11, 0.9));
      }
      #tel {
        position: absolute;
        left: 260px;
        top: 660px;
        width: 560px;
        height: 1179px;
        padding: 14px;
        border-radius: 72px;
        background: #07140d;
        box-shadow: 0 34px 90px rgba(0, 0, 0, 0.55), inset 0 0 0 3px rgba(244, 238, 218, 0.16);
      }
      #tel-pantalla {
        position: relative;
        width: 532px;
        height: 1151px;
        border-radius: 58px;
        overflow: hidden;
        background: #14402a;
      }
      #tel-pantalla img {
        position: absolute;
        left: 0;
        top: 0;
        width: 532px;
        height: 1151px;
        opacity: 0;
      }
      .chip {
        position: absolute;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 22px 12px 14px;
        border-radius: 999px;
        background: var(--cream);
        color: var(--green-900);
        box-shadow: 0 8px 26px rgba(12, 43, 28, 0.45);
        white-space: nowrap;
      }
      .chip em {
        display: grid;
        place-items: center;
        width: 50px;
        height: 50px;
        border-radius: 50%;
        background: var(--green-100, #d9e8dc);
        font: normal 30px/1 system-ui, "Apple Color Emoji", "Noto Color Emoji", sans-serif;
      }
      .chip b {
        display: block;
        font: 800 22px/1.1 var(--body);
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .chip small {
        display: block;
        font: 600 16px/1.2 var(--body);
        color: #5e6e5f;
      }
      #coro1,
      #coro2 {
        justify-content: flex-end;
      }
      #coro1 .cap-grande,
      #coro2 .cap-grande {
        font-size: 150px;
      }
      #coro1 .feat-banda,
      #coro2 .feat-banda {
        margin-top: 20px;
      }
      /* cierre: logo arriba, el jugador al medio, la app abajo */
      #cierre {
        display: block;
      }
      #cl-caja {
        position: absolute;
        left: 0;
        right: 0;
        top: 250px;
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      #cl-l1,
      #cl-l2 {
        display: flex;
        align-items: flex-end;
        font-family: var(--display);
        color: var(--cream);
        line-height: 0.86;
        letter-spacing: 0.012em;
        filter: drop-shadow(0 10px 30px rgba(5, 18, 11, 0.5));
      }
      #cl-l1 {
        font-size: 132px;
      }
      #cl-l2 {
        font-size: 214px;
        margin-top: 6px;
      }
      #cl-banda {
        position: relative;
        display: block;
        margin-top: 22px;
        padding: 8px 26px 6px;
        overflow: hidden;
      }
      #cl-banda i {
        position: absolute;
        inset: 0;
        background: var(--gold);
      }
      #cl-banda span {
        position: relative;
        display: block;
        font: 400 44px/1 var(--display);
        letter-spacing: 0.06em;
        color: var(--green-900);
      }
      #cl-tag {
        display: block;
        max-width: 780px;
        margin-top: 20px;
        text-align: center;
        font: 800 21px/1.6 var(--body);
        letter-spacing: 0.26em;
        color: var(--cream);
        filter: drop-shadow(0 2px 10px rgba(5, 18, 11, 0.9));
      }
      #cl-app {
        position: absolute;
        left: 0;
        right: 0;
        top: 1380px;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
      }
      #cl-icono {
        display: block;
        width: 180px;
        height: 180px;
        border-radius: 42px;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45), 0 0 0 3px rgba(244, 238, 218, 0.25);
      }
      #cl-boton {
        display: block;
        margin-top: 30px;
        padding: 22px 70px 18px;
        border-radius: 999px;
        background: var(--gold);
        color: var(--green-900);
        font: 400 66px/1 var(--display);
        letter-spacing: 0.05em;
        box-shadow: 0 10px 30px rgba(12, 43, 28, 0.45);
      }
      #cl-url {
        display: block;
        margin-top: 26px;
        font: 800 27px/1.2 var(--body);
        letter-spacing: 0.02em;
        color: var(--cream);
        filter: drop-shadow(0 2px 10px rgba(5, 18, 11, 0.9));
      }
      #cl-como {
        display: block;
        margin-top: 12px;
        font: 600 21px/1.3 var(--body);
        letter-spacing: 0.04em;
        color: var(--cream);
        background: var(--green-900);
        border-radius: 6px;
        padding: 8px 14px 7px;
      }
      .par {
        position: absolute;
        display: flex;
        gap: 0.1em;
        transform-origin: 50% 50%;
        filter: drop-shadow(0 0 0.3em rgba(232, 195, 74, 0.3));
      }
      .par svg {
        display: block;
        width: 0.465em;
        height: 0.735em;
      }
    </style>`
cambiar('    </style>', css)

// ---------- marcado ----------
const linea = (t) => `<span class="linea"><span class="pal">${t}</span></span>`
const FUNCIONES = [
  { id: 'f1', n: 1, kicker: 'LA CANCHA', tit: ['LOS 3 HOYOS', 'DE LA TRAMPA'], banda: '15 · 16 · 17 DE SAN DIEGO', txt: 'El dibujo de Rorro, con las yardas reales y el tee según tu handicap.' },
  { id: 'f2', n: 2, kicker: 'EL PLANTEL', tit: ['ELEGÍ CON', 'QUIÉN JUGAR'], banda: '10 PLAYERS DEL SDGA', txt: 'Del más fácil al más difícil: medido jugando 60 vueltas con cada uno.' },
  { id: 'f3', n: 3, kicker: 'HABILIDADES', tit: ['CADA UNO CON', 'SU HABILIDAD'], banda: 'SACADAS DEL CHAT', txt: 'El Mago nunca pega derecho. La Mugre tira panchos. El Perro va a buscarla.' },
  { id: 'f4', n: 4, kicker: 'EL TIRO', tit: ['TIRÁ PARA', 'ATRÁS Y SOLTÁ'], banda: 'COMO UNA GOMERA', txt: 'Viento con ráfagas, rough al 70%, bunker al 50% y el óvalo de pique.' },
  { id: 'f5', n: 5, kicker: 'LOS MONOS', tit: ['¡VIENEN', 'LOS MONOS!'], banda: 'SE LLEVAN LA PELOTA', txt: 'Si llegan antes que vos, al tee con un golpe de multa. Algunos te la devuelven.' },
  { id: 'f6', n: 6, kicker: 'CONTRA RELOJ', tit: ['3, 2, 1…', '¡YA!'], banda: 'AL MILISEGUNDO', txt: 'A igual golpes, en el ranking gana el más rápido.' },
  { id: 'f7', n: 7, kicker: 'LA TARJETA', tit: ['FIRMALA EN', '10 SEGUNDOS'], banda: 'O 110 NETO', txt: 'Si no firmás, comunicado oficial del Marshall. Es inapelable.' },
  { id: 'f8', n: 8, kicker: 'EL RANKING', tit: ['SÉ EL', 'PRIMERO'], banda: 'TODAVÍA NADIE FIRMÓ', txt: 'Compartí tu vuelta en el grupo.' },
]
const desdeF = (i) => c(25 + 2 * i)
const durF = (i) => (i === 7 ? c(40) - c(39) : 2 * COMPAS)
let funciones = FUNCIONES.map(
  (f, i) => `      <section id="${f.id}" class="clip feat" data-start="${desdeF(i)}" data-duration="${durF(i).toFixed(3)}" data-track-index="2">
        <div class="feat-cab">
          <span class="feat-kicker"><b>${String(f.n).padStart(2, '0')}</b>${f.kicker}</span>
          <div class="feat-tit">${f.tit.map(linea).join('')}</div>
          <span class="feat-banda"><i></i><span>${f.banda}</span></span>
          <span class="feat-txt">${f.txt}</span>
        </div>
      </section>`,
).join('\n')

const PANTALLAS = ['cartel', 'carta-sueco', 'carta-perro', 'carta-miguelon', 'carta-lechu', 'carta-lg', 'carta-rodal', 'carta-fito', 'carta-mugre', 'todos1', 'todos2', 'tiro-arma', 'tiro-vuelo', 'tiro-relato', 'monos', 'pancho', 'cuenta3', 'cuenta-ya', 'reloj', 'tarjeta', 'marshall', 'compartir', 'ranking']
const CHIPS = [
  ['🥛', 'Golpes de mago', 'El Mago Rodal', 70, 760],
  ['🍯', 'Drive al green', 'Mike Queboni', 600, 830],
  ['🦅', 'Chip in', 'Fito', 40, 960],
  ['💩', 'Tirar panchos', 'Mugre', 640, 1050],
  ['🐕', 'Va a buscarla', 'El Perro', 60, 1180],
  ['🦉', 'Todas las dadas', 'Lechu', 600, 1290],
  ['🥷', 'La tradición', 'El Ninja', 70, 1410],
  ['📺', 'El que se enoja pierde', 'LG', 520, 1530],
]
const telefono = `      <section id="p-tel" class="clip" data-start="${c(25)}" data-duration="${(c(40) - c(25)).toFixed(3)}" data-track-index="3">
        <div id="tel"><div id="tel-pantalla">${PANTALLAS.map((p) => `<img id="pt-${p}" src="assets/capturas/${p}.webp" alt="" />`).join('')}</div></div>
        <div id="chips">${CHIPS.map(([e, b, s, x, y], i) => `<div class="chip" id="chip-${i}" style="left:${x}px;top:${y}px"><em>${e}</em><span><b>${b}</b><small>${s}</small></span></div>`).join('')}</div>
      </section>`

const coros = `      <section id="coro1" class="clip cap" data-start="${c(40)}" data-duration="${(c(43.75) - c(40)).toFixed(3)}" data-track-index="2">
        <div class="cap-grande">${linea('¡ES LA TRAMPA')}${linea('DEL MONO!')}</div>
        <span class="feat-banda"><i></i><span>DONDE TODO SE VA</span></span>
      </section>
      <section id="coro2" class="clip cap" data-start="${c(44)}" data-duration="${(c(47) - c(44)).toFixed(3)}" data-track-index="2">
        <div class="cap-grande">${linea('ENTRE ÁRBOLES')}${linea('Y SOMBRAS')}</div>
        <span class="feat-banda"><i></i><span>TU SUERTE CAERÁ</span></span>
      </section>`

const PARES = [
  [120, 150, 1.0], [470, 120, 0.8], [830, 175, 1.1], [70, 930, 0.9], [860, 990, 1.2], [170, 1210, 0.75], [820, 1240, 0.85], [50, 1560, 0.8], [930, 1600, 0.9],
]
const cierre = `      <section id="cierre" class="clip" data-start="${c(47)}" data-duration="${(FIN - c(47)).toFixed(3)}" data-track-index="4">
        <div id="cl-pares">${PARES.map(([x, y, s], i) => `<div class="par" id="par-${i}" style="left:${x}px;top:${y}px;font-size:${Math.round(70 * s)}px">${ojoSuelto}${ojoSuelto}</div>`).join('')}</div>
        <div id="cl-caja">
          <div id="cl-l1">${'LA'.split('').map((l) => `<span class="lt" data-layout-allow-overlap>${l}</span>`).join('')}<span class="esp"></span>${'TRAMPA'.split('').map((l) => `<span class="lt" data-layout-allow-overlap>${l}</span>`).join('')}</div>
          <div id="cl-l2"><span class="lt" data-layout-allow-overlap>D</span><span class="lt" data-layout-allow-overlap>E</span><span class="lt" data-layout-allow-overlap>L</span><span class="esp"></span><span class="lt" data-layout-allow-overlap>M</span>${ojo('cl-ojo-1')}<span class="lt" data-layout-allow-overlap>N</span>${ojo('cl-ojo-2')}</div>
          <span id="cl-banda" data-layout-allow-overlap><i></i><span>SAN DIEGO · HOYOS 15 · 16 · 17</span></span>
          <span id="cl-tag">EN SAN DIEGO TE ESPERA, CON SU ABRAZO MACABRO</span>
        </div>
        <div id="cl-app">
          <img id="cl-icono" src="assets/icono-app.png" alt="La Trampa del Mono" />
          <span id="cl-boton">JUGALA YA</span>
          <span id="cl-url">rodrigomateus-debug.github.io/trampa-del-mono</span>
          <span id="cl-como">En el celu: compartir → agregar a la pantalla de inicio</span>
        </div>
      </section>`

cambiar('<canvas id="escena" width="1080" height="1920"></canvas>\n', '<canvas id="escena" width="1080" height="1920"></canvas>\n      <div id="p-oscuro" class="capa"></div>\n')
cambiar('      <div id="flash" class="capa"></div>', `${funciones}\n${telefono}\n${coros}\n${cierre}\n      <div id="flash" class="capa"></div>`)

// ---------- timeline ----------
const pantallasPorFuncion = {
  // [pantalla, negra en la que entra (0..7 dentro de la función)]
  0: [['cartel', 0]],
  1: [['carta-sueco', 0], ['carta-perro', 1], ['carta-miguelon', 2], ['carta-lechu', 3], ['carta-lg', 4], ['carta-rodal', 5], ['carta-fito', 6], ['carta-mugre', 7]],
  2: [['todos1', 0], ['todos2', 4]],
  3: [['tiro-arma', 0], ['tiro-vuelo', 4], ['tiro-relato', 6]],
  4: [['monos', 0], ['pancho', 4]],
  5: [['cuenta3', 0], ['cuenta-ya', 2], ['reloj', 4]],
  6: [['tarjeta', 0], ['marshall', 4]],
  7: [['compartir', 0], ['ranking', 2]],
}
const secuencia = []
for (const [i, lista] of Object.entries(pantallasPorFuncion)) for (const [p, n] of lista) secuencia.push([p, desdeF(+i) + n * B, +i === 1 && n > 0])

const guion = `
    <script>
      (function () {
        var Q = window.CUES;
        var c = Q.c;
        var B = Q.COMPAS / 4;
        var P = window.PRESENTACION;
        var tl = window.armarTextos({ sinFundido: true });
        function palabras(sel, t, cada) {
          gsap.utils.toArray(sel).forEach(function (el, i) {
            tl.fromTo(el, { yPercent: 108, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.34, ease: "back.out(1.6)" }, t + i * cada);
          });
        }
        function banda(sel, t) {
          tl.fromTo(sel + " i", { scaleX: 0, transformOrigin: "0% 50%" }, { scaleX: 1, duration: 0.3, ease: "power3.inOut" }, t);
          tl.fromTo(sel + " span", { yPercent: 110 }, { yPercent: 0, duration: 0.26, ease: "power3.out" }, t + 0.16);
        }
        // ---------- las funciones, una cada dos compases ----------
        tl.to("#p-oscuro", { opacity: 0.55, duration: 0.4, ease: "power2.out" }, P.funciones - 0.1);
        tl.to("#p-oscuro", { opacity: 0, duration: 0.2, ease: "none" }, P.estribillo - 0.05);
        ${JSON.stringify(FUNCIONES.map((f, i) => [f.id, desdeF(i), durF(i)]))}.forEach(function (f) {
          var id = "#" + f[0], t = f[1];
          tl.fromTo(id + " .feat-kicker", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.3, ease: "power3.out" }, t);
          palabras(id + " .feat-tit .pal", t + 0.04, B * 0.5);
          banda(id + " .feat-banda", t + B);
          tl.fromTo(id + " .feat-txt", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" }, t + B * 1.5);
          tl.to(id + " .feat-cab", { opacity: 0, y: -24, duration: 0.18, ease: "power2.in" }, t + f[2] - 0.2);
        });
        // el teléfono entra con peso y flota
        tl.fromTo("#tel", { y: 900, rotation: 8 }, { y: 0, rotation: 0, duration: 0.7, ease: "back.out(1.2)" }, P.funciones);
        tl.fromTo("#tel", { scale: 1 }, { scale: 1.02, duration: P.estribillo - P.funciones - 1, ease: "sine.inOut" }, P.funciones + 0.7);
        tl.to("#tel", { y: 1300, rotation: -10, duration: 0.45, ease: "power3.in" }, P.estribillo - 0.5);
        // las pantallas (las cartas del mazo pasan como en el Tinder, una por negra)
        ${JSON.stringify(secuencia)}.forEach(function (s, i, todo) {
          var el = "#pt-" + s[0], t = s[1];
          if (s[2]) {
            tl.fromTo(el, { opacity: 1, xPercent: 105, rotation: 7 }, { xPercent: 0, rotation: 0, duration: 0.24, ease: "power3.out" }, t);
            var prev = "#pt-" + todo[i - 1][0];
            tl.to(prev, { xPercent: -110, rotation: -9, duration: 0.24, ease: "power3.in" }, t);
          } else {
            tl.fromTo(el, { opacity: 0, scale: 1.06 }, { opacity: 1, scale: 1, duration: 0.22, ease: "power2.out" }, t);
          }
          var sig = todo[i + 1];
          if (sig && !sig[2]) tl.set(el, { opacity: 0 }, sig[1] + 0.22);
        });
        // habilidades: los chips aparecen alrededor del teléfono, uno por negra
        gsap.utils.toArray("#chips .chip").forEach(function (el, i) {
          tl.fromTo(el, { scale: 0, opacity: 0, rotation: i % 2 ? 6 : -6 }, { scale: 1, opacity: 1, rotation: i % 2 ? 2 : -2, duration: 0.3, ease: "back.out(2.2)" }, c(29) + i * B);
          tl.to(el, { scale: 0.6, opacity: 0, duration: 0.18, ease: "power2.in" }, c(31) - 0.22 + i * 0.01);
        });
        // ---------- estribillo: la trampa otra vez ----------
        tl.fromTo("#flash", { opacity: 0 }, { opacity: 0.85, duration: 0.04, ease: "none" }, P.estribillo - 0.02);
        tl.to("#flash", { opacity: 0, duration: 0.3, ease: "power2.out" }, P.estribillo + 0.03);
        ["#coro1", "#coro2"].forEach(function (id, k) {
          var t = k ? c(44) : c(40);
          gsap.utils.toArray(id + " .pal").forEach(function (el, i) {
            tl.fromTo(el, { scale: 2, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.22, ease: "expo.out", transformOrigin: "0% 70%" }, t + i * B * 2);
          });
          banda(id + " .feat-banda", t + B * 6);
        });
        // ---------- cierre: como la pantalla de inicio de la app ----------
        var L2 = P.cierre;
        tl.set("#flash", { opacity: 1 }, L2 - 0.01);
        tl.to("#flash", { opacity: 0, duration: 0.4, ease: "power2.out" }, L2 + 0.02);
        tl.fromTo("#cl-l1 .lt", { yPercent: -130, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.42, ease: "back.out(2.2)", stagger: 0.032 }, L2 + 0.02);
        tl.fromTo("#cl-l2 .lt", { scale: 1.9, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.34, ease: "power4.out", stagger: 0.045, transformOrigin: "50% 80%" }, L2 + 0.16);
        tl.fromTo("#cl-banda i", { scaleX: 0, transformOrigin: "0% 50%" }, { scaleX: 1, duration: 0.42, ease: "power3.inOut" }, L2 + 0.55);
        tl.fromTo("#cl-banda span", { yPercent: 110 }, { yPercent: 0, duration: 0.36, ease: "power3.out" }, L2 + 0.8);
        tl.fromTo("#cierre .pupila", { scale: 0, transformOrigin: "50% 53%" }, { scale: 1, duration: 0.3, ease: "back.out(3)", stagger: 0.06 }, c(48));
        tl.to("#cierre .pupila", { x: -15, y: 2, duration: 0.22, ease: "power3.out" }, c(50));
        tl.to("#cierre .pupila", { x: 15, y: 2, duration: 0.22, ease: "power3.out" }, c(51));
        tl.to("#cierre .pupila", { x: 0, y: 18, duration: 0.22, ease: "power3.out" }, c(52.5));
        tl.to("#cierre .pupila", { x: 0, y: 0, duration: 0.22, ease: "power3.out" }, c(54));
        tl.to("#cierre .parpado", { scaleY: 0.07, duration: 0.07, ease: "power2.in", transformOrigin: "50% 50%" }, c(54.5));
        tl.to("#cierre .parpado", { scaleY: 1, duration: 0.12, ease: "power2.out" }, c(54.5) + 0.07);
        tl.fromTo("#cl-icono", { scale: 0, rotation: -12 }, { scale: 1, rotation: 0, duration: 0.5, ease: "back.out(2)" }, c(48));
        tl.fromTo("#cl-boton", { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: "back.out(2.4)" }, c(49));
        // JUGALA YA late con la negra, como el EMPEZAR de la app
        for (var k = 0; c(50) + k * B < P.FIN - 0.8; k++) {
          tl.fromTo("#cl-boton", { scale: 1.06 }, { scale: 1, duration: B * 0.9, ease: "power2.out" }, c(50) + k * B);
        }
        tl.fromTo("#cl-url", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" }, c(49.5));
        tl.fromTo("#cl-como", { opacity: 0 }, { opacity: 1, duration: 0.4, ease: "power2.out" }, c(50.5));
        // "en San Diego te espera, con su abrazo macabro" aparece cuando lo canta
        tl.fromTo("#cl-tag", { opacity: 0, scale: 1.08 }, { opacity: 1, scale: 1, duration: 0.6, ease: "power3.out" }, c(52));
        // ojos de mono en los huecos: se abren de a uno, miran al jugador, parpadean y se cierran
        ${JSON.stringify(PARES)}.forEach(function (p, i) {
          var el = "#par-" + i;
          var dx = 540 - p[0], dy = 1150 - p[1], n = Math.sqrt(dx * dx + dy * dy) || 1;
          var mx = (dx / n) * 15, my = (dy / n) * 12;
          tl.set(el, { scaleY: 0.04, opacity: 0 }, L2);
          var t = c(48) + ((i * 3) % 9) * B;
          var vuelta = 0;
          while (t < P.FIN - 1) {
            var dura = (8 + ((i * 5 + vuelta * 3) % 6)) * B;
            tl.set(el, { opacity: 1 }, t);
            tl.fromTo(el, { scaleY: 0.04 }, { scaleY: 1, duration: 0.18, ease: "back.out(3)" }, t);
            tl.fromTo(el + " .pu", { x: 0, y: 0 }, { x: mx, y: my, duration: 0.2, ease: "power3.out" }, t + 0.2);
            tl.to(el + " .pu", { x: (i % 2 ? -1 : 1) * 14, y: -6, duration: 0.2, ease: "power3.out" }, t + dura * 0.45);
            tl.to(el, { scaleY: 0.06, duration: 0.06, ease: "power2.in" }, t + dura * 0.62);
            tl.to(el, { scaleY: 1, duration: 0.1, ease: "power2.out" }, t + dura * 0.62 + 0.06);
            tl.to(el + " .pu", { x: mx, y: my, duration: 0.2, ease: "power3.out" }, t + dura * 0.7);
            tl.to(el, { scaleY: 0.04, duration: 0.12, ease: "power2.in" }, t + dura);
            tl.set(el, { opacity: 0 }, t + dura + 0.12);
            t += dura + (2 + ((i + vuelta) % 4)) * B;
            vuelta++;
          }
        });
        tl.to("#fundido", { opacity: 1, duration: 0.6, ease: "power2.in" }, P.FIN - 0.6);
        window.__timelines["presentacion"] = tl;
      })();
    </script>`
cambiar(/    <script>\n      window\.__timelines\["main"\] = window\.armarTextos\(\);\n    <\/script>/.exec(h)[0], guion)

fs.writeFileSync(aqui('compositions/presentacion.html'), h)
console.log('intro/compositions/presentacion.html listo (' + h.length + ' bytes)')
