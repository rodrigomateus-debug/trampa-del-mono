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
- `ranking.js` — dónde se guardan las marcas del ranking (el teléfono, o Supabase si se completa la config); `supabase.sql` — la tabla.
- `plantel.js` — los jugadores (handicap, frase, emoji) y `EN_PRUEBA`, los que aparecen por ahora.
- `jugadores/` — fotos; `iconos/` y `manifest.webmanifest` — la app instalable.
- `intro/` — la intro animada (HyperFrames + Three.js) y su versión en vivo para la app (`intro/app.js`); ver `intro/README.md`.
- `SPEC.md` — reglas y decisiones.

Después de tocar el juego:

```bash
node test-motor.mjs
node build-web.mjs
```
