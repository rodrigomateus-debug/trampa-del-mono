// La Trampa del Mono — escena 3D de la presentación oficial (compositions/presentacion-horizontal.html, 16:9).
// Misma escena que la intro; el tiempo de la escena (tau) se remapea por partes: la intro tal cual, después el
// jugador sigue caminando de noche detrás del juego, en el estribillo vuelve la trampa (el drop) y al final
// queda la pantalla de inicio (el jugador al medio, entre el logo y el botón, como en la app).
import * as THREE from "three";
import { crearEscena } from "./escena-core.js";

const Q = window.CUES;
const P = window.PRESENTACION;
const escena = crearEscena(THREE, {
  canvas: document.getElementById("escena"),
  vertical: false,
  ancho: 1920,
  alto: 1080,
  cues: Q,
  infinito: true,
});

function tau(t) {
  if (t < P.estribillo) return t;
  if (t < P.mapa.desde) return Q.drop + (t - P.estribillo);
  if (t < P.cierre) return Q.logo + 4 + (t - P.mapa.desde);
  return Q.logo + (t - P.cierre);
}
// tramos en los que la escena no se ve (la tapa el juego entero o el mapa): no se dibuja
const oculta = (t) => (P.ocultas || []).some(([a, b]) => t > a + 0.05 && t < b - 0.05);

function dibujar(t) {
  if (oculta(t)) return;
  escena.encuadrarTitulo(t >= P.cierre ? { cy: 0.56, alto: 0.2, fov: 34 } : null);
  escena.render(tau(t));
}

let ultimo = window.__hfThreeTime || 0;
window.addEventListener("hf-seek", (ev) => {
  ultimo = ev.detail.time;
  dibujar(ultimo);
});
dibujar(ultimo);
escena.listo.then(() => {
  dibujar(ultimo);
  if (window.__resolverEscena) window.__resolverEscena();
});
