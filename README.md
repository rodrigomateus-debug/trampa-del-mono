# La Trampa del Mono · SDGA

Juego de golf de los hoyos 15, 16 y 17 de San Diego (la Trampa del Mono), con el plantel del SDGA,
los monos y el relato de LG.

**Jugar:** https://rodrigomateus-debug.github.io/trampa-del-mono/ — en el celu, "Agregar a pantalla de inicio"
y queda como app.

## Cómo está armado

- `juego.html` — **fuente de verdad** de la página (es la misma que se publica como artifact de Claude).
- `index.html` — la web app de GitHub Pages. **Generada** con `node build-web.mjs`; no se edita a mano.
- `motor.js` — la lógica pura (física, terreno, monos, habilidades, score). Se porta a `src/engine/` de la FedE Cup.
- `cancha.webp` — el dibujo de la cancha; `cancha-grid.js` — su terreno, una letra por yarda.
- `sonido.js` — el fondo mientras jugás, la canción de la tarjeta final y los efectos del juego.
- `cancha3d.js`, `campo3d.js` y `ciber.js` — la cancha 3D de Rorro (three.js, de `intro/assets/vendor/`), su terreno que se rehace y su sonido; se cargan solo cuando juega él.
- `ranking.js` — el ranking: el de la SDGApp (mismo Supabase que la FedE Cup, tabla `trampa_marcas` y vista `trampa_ranking`; la migración vive en el repo de la app). Adentro de la app, por el puente; suelto, entrando con Google con la misma cuenta. Sin la anon key cargada, en el teléfono.
- `plantel.js` — los jugadores (handicap, frase, emoji) y `EN_PRUEBA`, los que aparecen por ahora.
- `jugadores/` — fotos; `iconos/` y `manifest.webmanifest` — la app instalable.
- `intro/` — la intro animada (HyperFrames + Three.js), su versión en vivo para la app (`intro/app.js`) y la presentación oficial del juego (`intro/trampa-del-mono-presentacion.mp4`); ver `intro/README.md`.
- `SPEC.md` — reglas y decisiones.

Después de tocar el juego:

```bash
node test-motor.mjs
node build-web.mjs
node calibrar.mjs 60   # opcional: vuelve a medir la dificultad real de cada uno (y actualizar DIFICULTAD_REAL)
```
