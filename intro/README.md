# Intro — La Trampa del Mono

Video de 36,8 s (1920×1080) para la intro de la canción, hecho con [HyperFrames](https://github.com/heygen-com/hyperframes)
(HTML + GSAP + Three.js) y el design system del SDGA: verde del campo, crema, banda dorada, Anton + Archivo.

Un jugador con la Boina Verde camina sin fin por el fairway del 15. La cámara va adelante, en diagonal, caminando para atrás.
A medida que la letra avanza, se nubla, los árboles se cierran y se abren los ojos de los monos. En el drop se hace de noche,
cruzan los monos, la pelota se pierde en el cielo (+1) y cae uno colgado. En el corte de la canción entra el logo
**LA TRAMPA DEL MONO**: las dos O de MONO son ojos de mono con hoyuelos de pelota de golf, y mientras tanto la voz arranca
con "Caminás tranquilo por el fairway…".

## Archivos

- `index.html` — la composición: capas de texto (la letra), el logo y el timeline GSAP.
- `escena.js` — la escena 3D (Three.js): jugador, fairway infinito, árboles con ojos, monos, pelota, cartel del 15, cámara.
  Todo se calcula a partir del tiempo que manda HyperFrames (`hf-seek`), así que cada cuadro sale igual siempre.
- `cues.js` — **los tiempos**, medidos sobre la canción (180,7 bpm; un compás = 1,3285 s). Si se cambia el mp3, se toca acá.
- `assets/trampa-del-mono.mp3` — la canción (Suno). `assets/sdga-logo.svg` — el logo oficial del design system.
- `assets/fonts/` — Anton y Archivo (OFL). `assets/vendor/` — three.js 0.181.2 y GSAP 3.14.2, locales para que el render no dependa de la red.
- `trampa-del-mono-intro.mp4` — el video ya renderizado.

## Mapa de la canción (0–36,8 s)

| Tiempo | Música | Imagen |
|---|---|---|
| 0,2 | crescendo | de negro al fairway, toma baja de los pies; SDGA PRESENTA |
| 0,92 | primer golpe | sube la grúa y presenta al jugador (pisa a tempo: un ciclo de pasos por compás) |
| 3,6 | | CAMINÁS TRANQUILO |
| 9,6 | | pasa el cartel del HOYO 15 · "pero al llegar al quince…" |
| 11,5 | | se nubla · CAMBIA LA SITUACIÓN |
| 14,2 | | se abren ojos en los árboles · LOS ÁRBOLES TE MIRAN |
| 19,4–20,6 | baja y se corta | se frena, mira para todos lados · "te rodean en silencio" |
| 20,7 | vuelve la base | cabeza de un lado al otro en cada negra |
| 22,18 | **drop**, entra toda la banda | flash, noche, todos los ojos abiertos · YA SENTÍS LA TENSIÓN |
| 24,8 | | cruzan los monos de pinos a pinos |
| 26,2 | | la pelota se pierde en el cielo · +1 SE LA LLEVÓ EL MONO |
| 27,5 | solo | gira sobre sí mismo · NO HAY ESCAPE |
| 30,2 | | mira a cámara, cae el mono colgado |
| 31,48 | **corte**, entra la voz | LA TRAMPA DEL MONO |
| 32,8 | vuelve la banda | se abren los ojos de MONO, banda dorada |
| 36,1–36,8 | fin de "…cambia la situación" | fundido a verde |

## Cómo se trabaja

```bash
cd intro
npx hyperframes@0.8.114 lint                      # chequeo rápido
npx hyperframes@0.8.114 snapshot --at 6,22.5,33   # cuadros sueltos para mirar
npx hyperframes@0.8.114 preview                   # Studio con el timeline (abre el navegador)
npx hyperframes@0.8.114 render --output trampa-del-mono-intro.mp4
```

El render usa WebGL por software si no hay GPU: tarda ~1 s por cuadro.
