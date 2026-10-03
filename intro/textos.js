// Timeline de textos y logo (GSAP), compartido por index.html (16:9) y vertical.html (9:16).
// Los tiempos salen de cues.js.
window.armarTextos = function () {
  var Q = window.CUES;
  var c = Q.c;
  var B = Q.COMPAS / 4; // una negra
  var tl = gsap.timeline({ paused: true });

  // sacudón determinista (sin random): una lista fija de desplazamientos
  function sacudir(sel, t, dur, fuerza) {
    var pasos = [
      [0.9, -0.6],
      [-1, 0.4],
      [0.7, 0.8],
      [-0.5, -0.9],
      [0.4, 0.5],
      [-0.25, -0.2],
      [0, 0],
    ];
    var dt = dur / pasos.length;
    pasos.forEach(function (p, i) {
      tl.to(sel, { x: p[0] * fuerza, y: p[1] * fuerza, duration: dt, ease: "none" }, t + i * dt);
    });
  }
  function entraPalabras(sel, t, cada, opts) {
    var els = gsap.utils.toArray(sel);
    els.forEach(function (el, i) {
      tl.fromTo(el, { yPercent: 108, opacity: 0 }, Object.assign({ yPercent: 0, opacity: 1, duration: 0.42, ease: "back.out(1.6)" }, opts || {}), t + i * cada);
    });
  }
  function salenPalabras(sel, t) {
    tl.to(sel, { yPercent: -108, opacity: 0, duration: 0.32, ease: "power3.in", stagger: 0.04 }, t);
  }

  // apertura: de negro al campo, con el crescendo
  tl.fromTo("#negro", { opacity: 1 }, { opacity: 0, duration: 1.1, ease: "power2.inOut" }, Q.abre);
  // grano de película a 12 cuadros por segundo
  tl.fromTo("#grano", { backgroundPosition: "0px 0px" }, { backgroundPosition: "7373px 4519px", duration: Q.FIN, ease: "steps(" + Math.floor(Q.FIN * 12) + ")" }, 0);

  // SDGA PRESENTA
  tl.fromTo("#presenta-logo", { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1, duration: 0.7, ease: "power3.out" }, Q.C0);
  tl.fromTo("#presenta-txt", { opacity: 0, scale: 1.12 }, { opacity: 0.9, scale: 1, duration: 0.9, ease: "power3.out" }, Q.C0 + 0.25);
  tl.to("#presenta", { opacity: 0, duration: 0.4, ease: "power2.in" }, 3.1);

  // "CAMINÁS TRANQUILO" — una palabra por compás, tranqui
  entraPalabras("#cap1 .cap-grande .pal", c(2), B * 2);
  tl.fromTo("#cap1 .cap-chica", { yPercent: 108, opacity: 0 }, { yPercent: 0, opacity: 0.92, duration: 0.5, ease: "power3.out" }, c(3));
  salenPalabras("#cap1 .pal", c(5.5));

  // "pero al llegar al quince…" mientras pasa el cartel
  tl.fromTo("#cap-quince .cap-chica", { yPercent: 108, opacity: 0 }, { yPercent: 0, opacity: 0.95, duration: 0.5, ease: "power3.out" }, 9.45);
  tl.to("#cap-quince .cap-chica", { opacity: 0, duration: 0.3 }, 11.3);

  // "CAMBIA LA SITUACIÓN" — entra con glitch en los colores SDGA
  entraPalabras("#cap-cambia .glitch > .linea .pal", Q.cambia, B, { duration: 0.3, ease: "power4.out" });
  [0, 0.08, 0.16, 0.24, B * 4, B * 4 + 0.08, B * 6, B * 6 + 0.06].forEach(function (dt, i) {
    var s = i % 2 ? -1 : 1;
    tl.set("#cambia-oro", { opacity: 0.85, x: 9 * s, y: -3 * s }, Q.cambia + dt);
    tl.set("#cambia-verde", { opacity: 0.85, x: -9 * s, y: 3 * s }, Q.cambia + dt);
    tl.set(["#cambia-oro", "#cambia-verde"], { opacity: 0 }, Q.cambia + dt + 0.05);
  });
  tl.fromTo("#cap-cambia .cap-grande", { skewX: -10 }, { skewX: 0, duration: 0.35, ease: "power3.out" }, Q.cambia);
  salenPalabras("#cap-cambia .glitch > .linea .pal", c(9.6));

  // "LOS ÁRBOLES TE MIRAN" — palabra por negra
  entraPalabras("#cap-miran .pal", Q.miran, B, { duration: 0.36 });
  tl.fromTo("#cap-miran .cap-grande", { scale: 1 }, { scale: 1.06, duration: 3.6, ease: "none", transformOrigin: "0% 100%" }, Q.miran);
  salenPalabras("#cap-miran .pal", c(13));

  // "te rodean en silencio" — se corta seco en el silencio de la canción
  tl.fromTo("#cap-silencio .cap-chica", { opacity: 0, scale: 1.1 }, { opacity: 0.95, scale: 1, duration: 0.8, ease: "power3.out" }, 19.5);

  // DROP: flash y "YA SENTÍS LA TENSIÓN" golpe a golpe
  tl.fromTo("#flash", { opacity: 0 }, { opacity: 0.9, duration: 0.04, ease: "none" }, Q.drop - 0.02);
  tl.to("#flash", { opacity: 0, duration: 0.32, ease: "power2.out" }, Q.drop + 0.03);
  gsap.utils.toArray("#cap-tension .pal").forEach(function (el, i) {
    var t = Q.drop + i * B;
    tl.fromTo(el, { scale: 2.1, opacity: 0, yPercent: 0 }, { scale: 1, opacity: 1, duration: 0.22, ease: "expo.out", transformOrigin: "50% 60%" }, t);
    sacudir("#cap-tension .cap-grande", t + 0.05, 0.22, 10);
  });
  salenPalabras("#cap-tension .pal", c(17.6));

  // +1: la pelota se la llevó el mono (como en el juego)
  tl.fromTo("#ficha", { scale: 0.4, opacity: 0, rotation: -8 }, { scale: 1, opacity: 1, rotation: -3, duration: 0.32, ease: "back.out(2.4)" }, 27.0);
  tl.to("#ficha", { opacity: 0, y: -20, duration: 0.25, ease: "power2.in" }, 27.95);

  // "NO HAY ESCAPE" — letras que tiemblan
  entraPalabras("#cap-escape .pal", c(20.5), B * 2, { duration: 0.3, ease: "power4.out" });
  var temblores = [
    [3, -2],
    [-2, 3],
    [2, 2],
    [-3, -1],
    [1, -3],
    [-1, 2],
  ];
  gsap.utils.toArray("#cap-escape .letra").forEach(function (el, i) {
    for (var k = 0; k < 26; k++) {
      var p = temblores[(i * 5 + k) % temblores.length];
      tl.set(el, { x: p[0] * 1.6, y: p[1] * 1.6 }, c(20.5) + 0.3 + k * 0.06);
    }
  });
  salenPalabras("#cap-escape .pal", c(21.8));

  // letterbox: se abre con el logo
  tl.to("#franja-arriba", { yPercent: -100, duration: 0.45, ease: "power3.inOut" }, Q.logo);
  tl.to("#franja-abajo", { yPercent: 100, duration: 0.45, ease: "power3.inOut" }, Q.logo);

  // ---------- LA TRAMPA DEL MONO ----------
  var L = Q.logo;
  tl.set("#flash", { opacity: 1 }, L - 0.01);
  tl.to("#flash", { opacity: 0, duration: 0.4, ease: "power2.out" }, L + 0.02);
  tl.fromTo("#logo-fondo", { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "power2.out" }, L);
  tl.fromTo("#logo-l1 .lt", { yPercent: -130, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.42, ease: "back.out(2.2)", stagger: 0.032 }, L + 0.02);
  tl.fromTo(
    "#logo-l2 .lt",
    { scale: 1.9, opacity: 0, filter: "blur(14px)" },
    { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.34, ease: "power4.out", stagger: 0.045, transformOrigin: "50% 80%" },
    L + 0.16,
  );
  sacudir("#logo-caja", L + 0.42, 0.34, 14);
  // las O de MONO arrancan como pelotas de golf; cuando vuelve la banda les aparecen las pupilas: son ojos de mono
  tl.fromTo(".pupila", { scale: 0, transformOrigin: "50% 53%" }, { scale: 1, duration: 0.3, ease: "back.out(3)", stagger: 0.06 }, Q.banda);
  tl.to(".parpado", { scaleY: 0.07, duration: 0.06, ease: "power2.in", transformOrigin: "50% 50%" }, Q.banda - 0.08);
  tl.to(".parpado", { scaleY: 1, duration: 0.14, ease: "back.out(2)" }, Q.banda - 0.02);
  // banda dorada
  tl.fromTo("#banda-fondo", { scaleX: 0, transformOrigin: "0% 50%" }, { scaleX: 1, duration: 0.42, ease: "power3.inOut" }, L + 0.55);
  tl.fromTo("#banda-txt", { yPercent: 110 }, { yPercent: 0, duration: 0.36, ease: "power3.out" }, L + 0.8);
  tl.fromTo("#logo-tag", { opacity: 0, scale: 1.1 }, { opacity: 0.95, scale: 1, duration: 0.8, ease: "power3.out" }, Q.banda + 0.15);
  tl.fromTo("#logo-sdga", { opacity: 0, y: 12 }, { opacity: 0.85, y: 0, duration: 0.6, ease: "power3.out" }, Q.banda + 0.45);
  // las pupilas miran para todos lados, como el jugador
  tl.to(".pupila", { x: -15, y: 2, duration: 0.22, ease: "power3.out" }, c(24.5));
  tl.to(".pupila", { x: 15, y: 2, duration: 0.22, ease: "power3.out" }, c(25));
  tl.to(".pupila", { x: 0, y: 18, duration: 0.22, ease: "power3.out" }, c(25.5));
  tl.to(".pupila", { x: 0, y: 0, duration: 0.22, ease: "power3.out" }, Q.parpadea);
  tl.to(".parpado", { scaleY: 0.07, duration: 0.07, ease: "power2.in" }, Q.parpadea + 0.32);
  tl.to(".parpado", { scaleY: 1, duration: 0.12, ease: "power2.out" }, Q.parpadea + 0.39);
  // empuje lento del logo
  tl.fromTo("#logo-caja", { scale: 1 }, { scale: 1.045, duration: Q.FIN - L - 0.4, ease: "none" }, L + 0.4);
  // cierre a verde
  tl.to("#fin", { opacity: 1, duration: 0.6, ease: "power2.in" }, Q.FIN - 0.6);

  return tl;
};
