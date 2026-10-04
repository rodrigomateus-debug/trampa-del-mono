// La Trampa del Mono — escena 3D de la presentación oficial (compositions/presentacion.html).
// Misma escena que la intro; el tiempo de la escena (tau) se remapea por partes:
// la intro tal cual, después la pantalla de inicio (el jugador caminando para siempre), en el estribillo
// vuelve la trampa de noche y al final otra vez la pantalla de inicio, como la app.
import * as THREE from "three";
import { crearEscena } from "./escena-core.js";

const Q = window.CUES;
const P = window.PRESENTACION;
const escena = crearEscena(THREE, {
  canvas: document.getElementById("escena"),
  vertical: true,
  ancho: 1080,
  alto: 1920,
  cues: Q,
  infinito: true,
});
// en la pantalla de inicio el jugador va al medio, entre el logo y el botón (como en la app)
escena.encuadrarTitulo({ cy: 0.6, alto: 0.15, fov: 36 });

function tau(t) {
  if (t < P.estribillo) return t;
  if (t < P.cierre) return Q.drop + (t - P.estribillo);
  return Q.logo + (t - P.cierre);
}

let ultimo = window.__hfThreeTime || 0;
window.addEventListener("hf-seek", (ev) => {
  ultimo = ev.detail.time;
  escena.render(tau(ultimo));
});
escena.render(tau(ultimo));
escena.listo.then(() => {
  escena.render(tau(ultimo));
  if (window.__resolverEscena) window.__resolverEscena();
});
