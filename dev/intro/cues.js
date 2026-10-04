// Tiempos de la intro, medidos sobre assets/trampa-del-mono.mp3 (180,7 bpm, un compás = 1,3285 s).
// Los usan la escena 3D (escena.js) y el timeline de textos (index.html): si cambia la canción, se toca acá.
window.CUES = (function () {
  var COMPAS = 1.3285; // 4 negras a 180,7 bpm
  var C0 = 0.92; // primer tiempo fuerte (el golpe del arranque)
  function c(n) {
    return Math.round((C0 + COMPAS * n) * 1000) / 1000;
  }
  return {
    COMPAS: COMPAS,
    C0: C0,
    c: c,
    FIN: 36.8, // termina el segundo verso cantado ("…cambia la situación")
    abre: 0.2, // arranca el sonido (crescendo)
    cartel: c(6.6), // pasa el cartel del hoyo 15
    cambia: c(8), // se nubla
    miran: c(10), // se abren los primeros ojos
    frena: c(13.4), // el jugador frena
    quieto: 19.35,
    hueco: 20.62, // silencio de la canción
    vuelve: 20.7, // vuelve la base
    drop: c(16), // 22.18: entra toda la banda
    monos: c(18), // cruzan los monos
    pelota: c(19), // la pelota se pierde en el cielo
    gira: c(20), // gira sobre sí mismo
    cara: c(22), // mira a cámara
    susto: c(22.5), // cae el mono colgado
    logo: c(23), // 31.48: corte de la canción, entra la voz
    banda: c(24), // vuelve la banda
    mira: c(25),
    parpadea: c(26),
  };
})();
