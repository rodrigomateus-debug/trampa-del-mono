# La Trampa del Mono — spec del prototipo

Juego de golf SDGA sobre los hoyos 15, 16 y 17 de San Diego ("la Trampa del Mono").
Prototipo aparte para probar; después entra a la FedE Cup como `/trampa` con ranking en Supabase.

## Cancha
- **Desde 2026-10-03 la cancha es el dibujo de Rorro tal cual** (`cancha.webp`, 878×1791 px, 4 px = 1 yarda). El juego lo dibuja de fondo y lee el terreno de `cancha-grid.js`: una letra por yarda (x afuera · . rough · f fairway · g green · b bunker · t árbol · e tee), armada por color y textura (la copa es árbol, su sombra es rough). Tees: marca blanca en el 15 y el 16 (352 y 348 yd); en el 17, la roja (244 yd: el 17 del dibujo es largo para par 3).
- Lo de abajo es historia de las versiones anteriores (polígonos y árboles generados).
- Un solo mapa con los tres hoyos pegados: 15 (par 4) sube, 16 (par 4) baja, 17 (par 3) sube. Par 11.
- Como la foto satelital que pasó Rorro (2026-10-03): entre los hoyos es pasto abierto (rough) con grupos de árboles (`BOSQUES`, calcados de la foto) y árboles sueltos; bosque cerrado solo afuera de las estacas. Alrededor de fairways, greens y tees queda un margen de rough sin árboles. El Mono aparece solo si la pelota queda debajo de un árbol. Afuera (OB) en los bordes del mapa.
- Según la foto, el 17 está más arriba (green a media altura) y el tee del 16 más a la izquierda.
- 16: isla de pinos que cruza la calle antes del fairway, bunker a la izquierda del fairway ("muy dicky"), dos bunkers delante del green.
- 15: pasillo angosto desde el tee, bunker izquierdo del fairway y del green. 17: bunker adelante a la izquierda del green.
- Fuente: mapa que pasó Rorro (2026-10-02). El chat dice "17 con agua"; el mapa no tiene, se sigue el mapa.

## Elegir nivel
- Pantalla "Elegí tu nivel de dificultad": el mazo de cartas de los Playoffs de la FedE Cup (ParticipantsDeck), tipo Tinder: foto gigante, banda dorada "Nivel N · HCP", frase célebre, 6 datos y "Jugar con …". Dedo a la izquierda = siguiente (más difícil).
- Ordenado por handicap de menor a mayor (base de la FedE Cup, foto del 2026-10-03 en `plantel.js`); sin handicap cargado van al final y juegan como HCP 18.
- Más handicap, más difícil (`dificultad()` en motor.js): más error en tiro y putt, un poco menos de distancia. Bot que apunta perfecto: HCP 1.5 ≈ +1,5 · HCP 7 ≈ +2,2 · HCP 14.6 ≈ +3,2 · HCP 22 ≈ +4,1.

## Reglas del juego
- Tiro: arrastrar para atrás desde cualquier lado y soltar (gomera). Se ve un óvalo con la zona de pique (sin viento): crece con la potencia, el rough, el bunker y tirando a fondo.
- Vuelo con viento (0–30 km/h), pique y rodada según terreno; greens firmes. En el green del hoyo: putter, solo dirección + arco de fuerza (sin distancia), hoyo de tamaño real y caída marcada.
- Rough: próximo tiro al 70%. Bunker: al 50%.
- Monos que cruzan de pinos a pinos (dos por hoyo). Si la pelota baja les pega, se la llevan: +1 y drop donde le pegó.
- Cuando la pelota se frena, los monos a menos de 60 yd salen a buscarla (aviso "¡VIENEN LOS MONOS!"). Si llegan antes del golpe, se la llevan y el hoyo es LP. Siempre hay al menos 4,5 s para pegar (el que está cerca se acerca despacio). Al pegar, vuelven a su recorrido.
- Monos al doble de velocidad (patrulla 18 yd/s, caza 12 yd/s); tiempo mínimo para pegar: 3 s (2026-10-03).
- Pinos de 9 yd: el arco del tiro pasa por arriba de las franjas (de un fairway al otro). Los fairways llegan al borde del green (collar).
- Habilidades por jugador (`HABILIDADES` en motor.js, por apodo):
  - El Mago Rodal 🥛 — Comba de mago: nunca pega derecho. Todos sus golpes fuera del green se cierran 30° hacia el lado de la bandera, así que hay que apuntar afuera (a los pinos, al otro hoyo) para que la curva la traiga. La línea punteada dibuja la curva. Vuela por arriba de los pinos (si cae en el bosque, igual aparece el Mono), tiene la mitad del error lateral y al picar sigue derecho (2026-10-03: la versión anterior chocaba siempre los pinos y caía sola en la línea).
  - Mike Queboni (Đ) 🍯 — Drive al green: desde el tee su driver llega a 330 yd. Pasando 250 yd el óvalo late; soltando en el pico (precisión ≥ 0,93) es perfecta y llega al green del 15 (100%) o del 16 (~96%); si no, se abre y queda corta.
- El hoyo dibujado es el hoyo real (0,22 yd) y si la pelota se frena adentro, cae (pedido 2026-10-03: "queda arriba del hoyo y no se mete").
- Dificultad calibrada con un bot que apunta perfecto (`FISICA` en motor.js): ≈ +2,8 de promedio sin compensar viento, 1% de vueltas bajo par (2026-10-02, pedido "es muy fácil").
- Pelota que queda en los pinos: aparece el Mono 🐒.
  - Mono malo (92%): +1 golpe, dropeás en el rough más cercano (no más cerca del hoyo).
  - Mono bueno (8%): te la devuelve al medio del fairway, sin penalidad.
- Afuera: +1 y se repite desde donde pegaste (golpe y distancia).
- Se puede jugar desde el hoyo de al lado ("Jugando desde el 16, clásico").
- LP 💅: levantar la pelota cuando quieras (confirmando). El hoyo cuenta par+4. Al décimo golpe sin embocar, LP automático.
- Final: tarjeta hoyo por hoyo. 10 segundos para firmarla; si no, comunicado del Marshall 🇸🇪 y 110 neto.
- Récord por jugador en el teléfono. Compartir al grupo por WhatsApp (link wa.me + copiar), con el tiempo.


## Cambios del 2026-10-03 (tarde)
- Marcador: la cara del jugador grande en un círculo con su emoji en un circulito arriba. El relato de LG, el aviso de monos y el tip van en una franja fija dentro del marcador (no tapan la cancha).
- LP = levantar la pelota pierde la vuelta entera (el hoyo y los que faltan quedan LP; no cuenta para el récord). Al décimo golpe en un hoyo, LP automático.
- Si los monos llegan a la pelota antes del golpe: vuelta al tee del hoyo con un golpe de multa (se conservan los golpes que ya llevabas).
- Rodal: LG solo lo adula, pegue como pegue (sin excusas ni versos; los resultados también).
- Fito (🦅 El Águila) — Chip in: en drives y hierros la línea de tiro se sacude ±25° (período 0,7 s); si suelta con el desvío dentro de ±5° (el embudo dibujado en la pelota) sale derecha. A 40 yd o menos del hoyo, si la pelota llega al green, un imán la deja a 0,7 yd del hoyo; si el tiro fue perfecto y apuntado a la bandera, entra.
- Mati (🇸🇪 El Sueco) — Siempre derecho: sin error de dirección (ni en el putt). Su drive sale de su handicap (casi 300 con el rodaje). HCP 1.5 = dificultad Paseo.
- Por ahora el mazo muestra solo 4 jugadores (`EN_PRUEBA` en plantel.js): El Sueco, Miguelón, Rodal y Fito.
- Web app: GitHub Pages en https://rodrigomateus-debug.github.io/trampa-del-mono/ (index.html se genera con `node build-web.mjs` desde juego.html; manifest + íconos con el green del 16 del dibujo, el Mono y el SDGA chiquito).

## Cambios del 2026-10-03 (noche): reloj, ranking y los golpes del Mago
- Reloj: después del cartel del 15 hay cuenta regresiva 3, 2, 1, ¡YA! y arranca un cronómetro con milisegundos (debajo del marcador) que corre sin parar (carteles y animaciones incluidas) hasta que cae el último putt del 17. Si salteás los carteles tocándolos, ganás tiempo.
- Ranking (más alto = mejor): primero menos golpes; a igual golpes, menos tiempo al milisegundo (`compararMarcas` en motor.js). Cada usuario figura con su mejor vuelta.
  - General: usuario + el emoji en miniatura del jugador con el que hizo esa vuelta.
  - Por jugador: una pestaña por cada uno del mazo, con la mejor vuelta de cada usuario con ese jugador.
  - Entra solo la tarjeta firmada; LP y sin firmar (110) no cuentan. Al firmar te dice en qué puesto quedaste.
  - Para jugar hay que poner el nombre en la portada ("¿Quién juega?"), que queda guardado en el teléfono.
  - Por ahora las marcas se guardan en el teléfono (`ranking.js`). Para que sea del grupo: correr `supabase.sql` y completar `SUPABASE.url` y `anonKey` en `ranking.js`.
- El Mago Rodal — Golpes de mago (reemplaza a "Comba de mago" como único golpe): nunca derecho. A cada golpe (menos el putt) le toca uno de 5 efectos al azar, nunca el mismo dos veces seguidas, y se ve antes de pegar (chip dorado, la franja de LG y la línea punteada con la curva):
  - 🪄 Comba de mago: se cierra 30° hacia la bandera.
  - ↩️ Gancho: dobla 45° a la izquierda. ↪️ Slice: dobla 45° a la derecha.
  - 🎈 Globo: altísimo, 80% del carry, se cierra 15° y se clava (casi no rueda).
  - 🐍 Viborita: rasante, 60% del carry, se cierra 20° y rueda una banda; como va al ras, choca pinos y monos.
  - Todos (menos la viborita) vuelan por arriba de los pinos y tienen la mitad del error lateral, como antes.
- Putt de Rodal: siempre con comba. Dobla hacia el hoyo mientras rueda (`PUTT_MAGO.giro` = 0,3 rad/s): derecho al hoyo no entra desde 3 yd; hay que apuntar afuera (≈7° a 3 yd, 12° a 6 yd, 16° a 10 yd). La línea del putt muestra para dónde dobla.

## Cambios del 2026-10-03 (noche, 2): seis jugadores más, con habilidades sacadas del chat del SDGA
- Mazo (`EN_PRUEBA`): El Sueco, El Ninja, El Perro, Miguelón, Lechu, Mugre, Rodal, LG, Liberty y Fito.
- 🦉 Lechu (Joaquín "La Lechuza" Castelli, campeón de la Boina Verde) — Contando todas las dadas: en el green, a 1,5 yd o menos, es dada (cuenta el golpe y entra sola).
- 🥷 El Ninja — La tradición ("manteniendo viva la tradición de un LP por finde"): el primer LP de la vuelta no la pierde: +1 y drop en la calle sin acercarse al hoyo (desde el tee, ahí mismo). El botón dice "LP 🥷 +1". El segundo LP sí pierde la vuelta.
- 🐕 El Perro (Gonza) — Va a buscarla: los greens están habilitados (sin caída, ni flechas) y si la pelota va al bosque el perro la trae a la calle sin multa. Tarda 4 s y el reloj corre. LG: "La vida no es mucho más que esto".
- 💩 Mugre (Alan, "Lurrrrpin") — Tirar panchos (2026-10-03, reemplaza a "Panchitos"): a la Mugre los monos la huelen de lejos (salen a buscarla desde 90 yd en vez de 60). Tiene 3 panchos por hoyo (botón redondo grande abajo a la derecha, con el 🌭 y cuántos quedan; late cuando vienen los monos): el pancho cae del lado de donde vienen, más allá de ellos; los que la estaban cazando van, comen 1 s y vuelven (más rápido). Se la pueden robar igual que a todos. Cuando emboca, LG dice "Lurrrrrrpin".
- 🗽 Liberty (Fede Bal) — Si no era por el approach: desde el tee sale derecho siempre; de 30 a 100 yd del hoyo, triple de error ("Los wedges ya van a funcionar").
- 📺 LG (Lucas) — El que se enoja pierde: después de un mal tiro (rough, bunker, palo, afuera o mono) el próximo sale sin error, putt incluido. LG no pone excusas y a veces se relata a sí mismo.
- El emoji del jugador camina de pelota a pelota: sale del tee, se queda donde pegó mientras vuela la pelota y después va hasta ella (≈1 s, saltando).
- Apuntar: mientras arrastrás, los botones de abajo se apagan y no se pueden tocar. El encuadre es el de siempre; "a fondo" es arrastrar hasta 164 px o lo que haya de lugar debajo del dedo (mínimo 90 px), así que siempre se llega al 100%.
- Desde el tee, a medida que tirás para atrás, la cámara se aleja (hasta un 22%, o lo justo para que entre el pique) y la pelota sube en la pantalla. Si no pegás, vuelve. En los demás tiros, el zoom de siempre.
- Hoyo: dibujado encima del dibujo (vectorial, nítido), 50% más grande que el real (el real sigue siendo 0,22 yd) con borde crema. Las banderas pintadas en `cancha.webp` se borraron (inpainting) y las tres banderas las dibuja el juego (la del hoyo que se juega, dorada).
- Dificultad real (`node calibrar.mjs 60`): un bot juega 60 vueltas con cada uno. Apunta bien (prueba ángulos y potencias sin error ni viento), no compensa el viento, acierta el embudo de Fito la mitad de las veces y el latido de Miguelón con precisión entre 0,5 y 1, siempre llega antes que los monos y no usa el LP del Ninja. Resultado (prom. vs. par · % LP): El Sueco +1,8 · 8% / El Perro +2,6 · 3% / Miguelón +4,4 · 10% / Lechu +4,7 · 7% / Fito +5,1 · 13% / LG +5,1 · 2% / El Ninja +5,2 · 13% / Rodal +5,5 · 10% / Liberty +6,5 · 12% / Mugre +6,6 · 20% (remedido con los panchos). El mazo y "Ver todos" se ordenan por eso (`DIFICULTAD_REAL` en plantel.js) y la etiqueta sale del promedio: Paseo < +3, Normal < +4,6, Difícil < +5,3, Muy difícil < +6, Trampa total. El handicap sigue moviendo el error y la distancia; la carta muestra el HCP y el promedio.
- Mazo: botón "VER TODOS" arriba: la lista de todos los players (foto, emoji, nivel, HCP, dificultad, frase y la habilidad con su preview) con "Jugar" en cada uno.
- Celu: sin zoom con doble toque ni pellizco (viewport + `touch-action: manipulation` + gesturestart), sin rebote al tirar para abajo, sin menú de "mantener apretado" en fotos. Un segundo dedo no pisa el tiro que estás armando. Si el tiro se corta (monos, LP), los botones vuelven. FIRMAR con doble toque anota una sola vez en el ranking. El LP no se confirma con un doble toque sin querer (el segundo toque tiene que llegar después de 0,45 s).
- Cartas del mazo: debajo de la frase, un preview animado (SVG) de la habilidad con su nombre y texto.

## Cambios del 2026-10-03 (noche, 3)
- Marcador: debajo de la tarjeta, una fila con dónde estás (TEE, FAIRWAY, ROUGH · 70%…) a la izquierda, el reloj (y el golpe del Mago) al centro y LP a la derecha. Abajo de la pantalla no queda nada: es todo cancha.
- Afuera del dibujo: en vez del crema, el verde del SDGA con rayas diagonales de pasto cortado, sutiles. El crema de `cancha.webp` que rodea la cancha se volvió transparente (con el borde difuminado); bunkers y lo de adentro, intactos.
- Mono bueno: siempre la cara 🐵 (no el 🐒 de los malos), un poco más grande, dorada (la banda del SDGA), con brillo y la Boina Verde apoyada arriba de la cabeza. Se usa la cara porque en todos los teléfonos está centrada y la boina cae siempre en el mismo lugar (el 🐒 cambia de pose según el teléfono).
- Cuenta regresiva: en el 3 la cámara está de cerca sobre el tee del 15 (de dónde salís); en el 2 vuelve al encuadre de salida, así que en el ¡YA! (cuando arranca el reloj) ya está quieta hace un segundo y no perdés tiempo.
- Viento: fuera de la tarjeta, grande, debajo del reloj (flecha dorada que apunta para donde sopla, girada con la cámara, y los km/h). Sobre la cancha, ráfagas: líneas finitas que aparecen, cruzan para donde sopla y desaparecen; más viento, más líneas y más rápidas. Sin viento, no hay.

## Dicky Toons
- `dicky-toons.svg`: el logo de los Dicky Toons (del Illustrator que pasó Rorro, solo las capas de relleno y el fondo como círculo liso), animado en CSS: entra con un pop, cada 6 s el personaje carga el swing (squash), pega (stretch) mientras aparecen las líneas del swing, la pelota sale volando del tee y se va del círculo, vuelve con un pop a su lugar y el logo queda quieto como el original ~4 s. Respeta "reducir movimiento".
- Lo llevan en la carta (arriba a la derecha de la foto) y en "Ver todos" los que tienen `dicky: true` en plantel.js: Fito, Miguelón, El Ninja, Tinder y La Rana (Taiu). Tinder y La Rana todavía no están en el mazo.

## Cambios del 2026-10-04: cámara para apuntar, hoyo y guía
- Hoyo: dibujado 3 veces el real (el doble que antes), siempre más grande que la pelota. El real sigue siendo 0,22 yd.
- Apuntar: más zoom y la pelota al medio de la cancha (a mitad de camino entre la fila de botones y el borde de abajo), con la bandera para arriba; se ven ~75 yd para adelante (o hasta el hoyo si está más cerca; en el green, el putt entero). Abajo queda lugar para tirar para atrás.
- Mientras tirás para atrás (todos los tiros menos el putt, ya no solo el del tee), la cámara se aleja alrededor de la pelota (la pelota no se mueve en la pantalla) justo lo que hace falta para que entren el pique, el óvalo y el cartel de yardas. Si soltás sin pegar, vuelve.
- La cuenta regresiva y el arranque de cada hoyo terminan en esa vista de apuntar.
- Guía: sobre la pelota late un anillo dorado (dónde poner el dedo). Las primeras 6 veces que pegás (en el teléfono), o si tardás más de 5 s, además un 👆 muestra el gesto: apoyar en la pelota y tirar para atrás.

## Cambios del 2026-10-04 (2)
- Debajo del marcador: a la izquierda, dónde estás (y el golpe del Mago); a la derecha, en columna, el reloj, el viento y LP. LP es un botón de verdad (crema con borde y sombra).
- Mientras apretás para pegar, el marcador de arriba se vuelve casi transparente (y el reloj y el viento a medias) para ver la cancha. El cartel de yardas nunca se sale de la pantalla.

## Cambios del 2026-10-04 (3)
- Se sacó el emoji del jugador que caminaba de pelota a pelota (ruido visual).
- Monos fuera de la pantalla (los que vienen a buscar la pelota, o tapados por el marcador): un indicador en el borde, sobre la línea pelota → mono, con el 🐒, una flecha para el lado de donde viene y las yardas que le faltan. El color va de verde (lejos) a amarillo, naranja y rojo (encima); a menos de 20 yd late.
- Pelota al lado del hoyo: como el hoyo y la pelota se dibujan más grandes que los reales, una pelota quieta cerca del hoyo sin haber entrado se dibuja apoyada en el borde, afuera, con un aro rojo. La distancia cerca del hoyo va en centímetros (menos de 1 yd) o con un decimal (menos de 10 yd); nunca "0 yd".

## Yardas reales y tees por nivel (2026-10-04)
- Tarjeta real (yd): 15 · 16 · 17 — negras 412 · 435 · 223, azules 392 · 415 · 208, blancas 376 · 395 · 188, amarillas 360 · 380 · 170.
- El dibujo no respeta esas distancias (el 17 está dibujado mucho más largo), así que cada hoyo tiene su escala (yardas reales por yarda del dibujo), sacada del tee azul: desde la marca azul del dibujo, la distancia al hoyo da las yardas de la tarjeta. Los tees blanco y amarillo se ubican sobre la línea azul → hoyo a sus yardas de la tarjeta (las amarillas quedan apenas adelante del cajón dibujado). El 16 no tiene marca azul en el dibujo: se usa la del fondo del tee.
- De qué tee salís según el handicap: hasta 5, azules; hasta 14, blancas; más, amarillas. El juego marca tu tee con dos puntos de su color y el cartel del hoyo dice "desde las azules · PAR 4 · 392 YD".
- Todo lo que se muestra (yd al pin, el cartel del tiro) está en yardas reales. El carry máximo (en yardas reales) sale del handicap: 273 − 1,45 × HCP (HCP 0: ~273 de vuelo, ~300 con el rodaje; HCP 22: ~241 de vuelo, ~265 con el rodaje, y a fondo con error promedian 230–250). El Sueco ya no tiene drive especial (sale de su handicap: casi 300). Miguelón: la bomba vuela hasta 365 yd (llega al green del 15 desde las azules); el óvalo late pasando las 285.
- Dificultad real remedida con esto (prom. vs. par · % LP): El Sueco +2,9 · 3% / El Perro +3,1 · 3% / Miguelón +4,3 · 18% / Lechu +5,2 · 18% / LG +5,2 · 10% / Rodal +5,2 · 10% / Fito +5,2 · 12% / Mugre +6,1 · 22% / Liberty +6,4 · 17% / El Ninja +6,5 · 13%.

## Compartir la vuelta (2026-10-04)
- En la tarjeta final, "COMPARTIR MI VUELTA 📸" (antes del texto para WhatsApp): arma una imagen 1080×1350 con el diseño del SDGA (verde con rayas, crema, banda dorada, Anton/Archivo): quién sos (el nombre de la portada), la cara y el emoji del jugador, "jugó con …", el score grande (o LP / 110 sin firmar), golpes y par, el tiempo, los tres hoyos en colores (bajo par verde, par dorado, sobre par rojo), el puesto en el ranking si firmaste, una frase de LG y los monos.
- Se ve en grande con COMPARTIR (el menú del teléfono, con la imagen y el texto) y GUARDAR (descarga el PNG). Si el navegador no puede compartir archivos, queda solo GUARDAR.

## Voz
LG 📺 relata con las frases del chat ("Tremendo", "Uff", "Hermoso", "QUE HOMBRE"); en tiros malos sale una excusa.
Intro de cada hoyo con un verso de la canción de Fito. Frases de carga del design system.

## Armado
- `motor.js`: lógica pura (cancha, terreno, física, Mono, score, textos). Sin DOM; azar inyectado. Se porta a `src/engine/trampa.ts`.
- `index.html`: canvas + HUD con el SDGA Design System (campo verde, tarjetas crema, banda dorada, Anton + Archivo, emojis del plantel).
- `test-motor.mjs`: `node test-motor.mjs`.
- Se publica como artifact privado para probar en el celular.

## Afuera por ahora
Sonido, fotos (van emojis; en la app usa `PlayerAvatar`), match en el mismo celu. La tabla en Supabase está lista (`supabase.sql`) pero sin conectar.

## Intro y pantalla de inicio (2026-10-03)
- `intro/`: la intro animada con la canción (proyecto HyperFrames; videos 9:16 y 16:9 en `intro/*.mp4`). Ver `intro/README.md`.
- En la app la intro corre en vivo (`intro/app.js`, misma escena 3D y mismos textos que el video, al ritmo de la canción):
  - Primera vez: pantalla de entrada con EMPEZAR (intro con sonido) o SALTAR. Durante la intro, SALTAR arriba a la derecha y 🔊/🔇 arriba a la izquierda.
  - Al final queda la pantalla de inicio en loop: el logo LA TRAMPA DEL MONO con los ojos, el jugador caminando para siempre y el riff de la canción (compases 16 a 23) sin cortes. EMPEZAR lleva a la portada.
  - Las veces siguientes abre directo en la pantalla de inicio (sin sonido hasta tocar 🔇), con "VER INTRO". En la portada, INTRO ▶ la vuelve a pasar.
  - `?sinintro` la saltea; sin WebGL no aparece.
  - SALTAR va abajo a la derecha. VER INTRO e INTRO ▶ arrancan siempre con música.
  - El sonido suena aunque el iPhone esté en silencio (como un video): Audio Session "playback" y, si no está, un <audio> de silencio en loop.
  - Pantalla de inicio: el jugador centrado entre el logo y el botón (la cámara se calcula con lo que mide cada pantalla) y pares de ojos de mono —los de la O del logo— que se abren a tempo, miran al jugador o para los costados, parpadean y se cierran en los huecos de arriba y de los costados.
- Ícono de la app y favicon nuevos: el título con los ojos de MONO (`iconos/icono-fuente.html`); el favicon de 32 px son los dos ojos.

