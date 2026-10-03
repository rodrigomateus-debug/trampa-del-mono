// La Trampa del Mono — entrada de la escena 3D para el video (HyperFrames).
// La escena vive en escena-core.js (la comparte la app); acá solo se conecta con el tiempo de HyperFrames (hf-seek).
import * as THREE from "three";
import { crearEscena } from "./escena-core.js";

const vertical = window.FORMATO === "vertical";
const escena = crearEscena(THREE, {
  canvas: document.getElementById("escena"),
  vertical,
  ancho: vertical ? 1080 : 1920,
  alto: vertical ? 1920 : 1080,
  cues: window.CUES,
});

let ultimo = window.__hfThreeTime || 0;
window.addEventListener("hf-seek", (ev) => {
  ultimo = ev.detail.time;
  escena.render(ultimo);
});
escena.render(ultimo);
escena.listo.then(() => {
  escena.render(ultimo);
  if (window.__resolverEscena) window.__resolverEscena();
});
