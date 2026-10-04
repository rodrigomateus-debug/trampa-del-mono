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
- La boca del hoyo (2026-10-04, los que probaron: "pasa por arriba del hoyo y sigue de largo como si nada"): la física usa el hoyo como se dibuja (`FISICA.bocaHoyo` = 0,66 yd, 3× el centro) y la pelota que pasa por ahí siempre reacciona. Se decide en el punto donde pasa más cerca del centro:
  - Por el medio (a menos de 0,3 yd del centro, `FISICA.medioHoyo`) entra de una si no viene muy fuerte: hasta 3,8 yd/s (`velMedio`, la que se pasaría ~3 yd). Más fuerte, salta por arriba (labio). Por el medio NO hay corbata (pedido de Rorro, 2026-10-04: "el corbateo tiene que ser si la pelota no entró por el medio").
  - Del medio al borde de la boca el límite baja hasta 1,4 yd/s (`limiteEmbocar`). Si se frena adentro de la boca, cae.
  - La corbata (`VUELTA`), solo por el costado de la boca: un poco pasada (hasta 5 yd/s), pega en el borde, se frena y da la vuelta alrededor del hoyo (de un cuarto de vuelta por el borde a casi tres cuartos cerca del medio, 0,5–2 s). Si venía justa (hasta 0,5 yd/s sobre el límite) o se queda sin fuerza en la vuelta, entra ("dio la vuelta y entró"); si no, sale tangente y cortita (~0,3 yd afuera del borde), para cualquier lado. La cámara se acerca al hoyo mientras gira; suena el borde raspando y LG: "¡LA CORBATA! Le dio la vuelta y la escupió".
  - Muy pasada (más de 5 yd/s): salta por arriba del borde (labio), se desvía y se frena un poco.
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
- Fito (🦅 El Águila) — Chip in: en drives y hierros la línea de tiro se sacude ±25° (período 0,7 s); si suelta con el desvío dentro de ±5° (el embudo dibujado en la pelota) sale derecha. A 40 yd o menos del hoyo, si la pelota llega al green, un imán la deja a 0,85 yd del hoyo (afuera de la boca); si el tiro fue perfecto y apuntado a la bandera, entra.
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
  - Las marcas van al ranking de la SDGApp (ver "Adentro de la SDGApp" y "Suelto con login" abajo); sin la anon key cargada en `ranking.js`, quedan en el teléfono.
- El Mago Rodal — Golpes de mago (reemplaza a "Comba de mago" como único golpe): nunca derecho. A cada golpe (menos el putt) le toca uno de 5 efectos al azar, nunca el mismo dos veces seguidas, y se ve antes de pegar (chip dorado, la franja de LG y la línea punteada con la curva):
  - 🪄 Comba de mago: se cierra 30° hacia la bandera.
  - ↩️ Gancho: dobla 45° a la izquierda. ↪️ Slice: dobla 45° a la derecha.
  - 🎈 Globo: altísimo, 80% del carry, se cierra 15° y se clava (casi no rueda).
  - 🐍 Viborita: rasante, 60% del carry, se cierra 20° y rueda una banda; como va al ras, choca pinos y monos.
  - Todos (menos la viborita) vuelan por arriba de los pinos y tienen la mitad del error lateral, como antes.
- Putt de Rodal: siempre con comba. Dobla hacia el hoyo mientras rueda (`PUTT_MAGO.giro` = 0,3 rad/s): derecho al hoyo no entra desde 3 yd; hay que apuntar afuera (≈7° a 3 yd, 12° a 6 yd, 16° a 10 yd). La línea del putt muestra para dónde dobla.

## Cambios del 2026-10-03 (noche, 2): seis jugadores más, con habilidades sacadas del chat del SDGA
- Mazo (`EN_PRUEBA`): El Sueco, El Ninja, El Perro, Miguelón, Lechu, Mugre, Rodal, LG, Liberty, Fito, Marcos (El Flaco Ordoñez) y Maxi Vacca (Grandpa), los dos desde el 2026-10-04.
- 🦉 Lechu (Joaquín "La Lechuza" Castelli, campeón de la Boina Verde) — Contando todas las dadas: el putt de 3 metros (3,28 yd, `DADA`) o menos entra siempre, le pegue como le pegue (patea igual; el imán lo lleva al hoyo). Antes (hasta 2026-10-04) era dada automática a 1,5 yd.
- 🥷 El Ninja — La tradición ("manteniendo viva la tradición de un LP por finde"): el primer LP de la vuelta no la pierde: +1 y drop en la calle sin acercarse al hoyo (desde el tee, ahí mismo). El botón dice "LP 🥷 +1". El segundo LP sí pierde la vuelta.
- 🐕 El Perro (Gonza) — Va a buscarla: los greens están habilitados (sin caída, ni flechas) y si la pelota va al bosque el perro la trae a la calle sin multa. Tarda 4 s y el reloj corre. LG: "La vida no es mucho más que esto".
- 💩 Mugre (Alan, "Lurrrrpin") — Tirar panchos (2026-10-03, reemplaza a "Panchitos"): a la Mugre los monos la huelen de lejos (salen a buscarla desde 90 yd en vez de 60). Tiene 3 panchos por hoyo (botón redondo grande abajo a la derecha, con el 🌭 y cuántos quedan; late cuando vienen los monos): el pancho cae del lado de donde vienen, más allá de ellos; los que la estaban cazando van, comen 1 s y vuelven (más rápido). Se la pueden robar igual que a todos. Cuando emboca, LG dice "Lurrrrrrpin".
- 🗽 Liberty (Fede Bal) — Si no era por el approach: desde el tee sale derecho siempre; de 30 a 100 yd del hoyo, triple de error ("Los wedges ya van a funcionar").
- 📺 LG (Lucas) — El que se enoja pierde: después de un mal tiro (rough, bunker, palo, afuera o mono) el próximo sale sin error, putt incluido. LG no pone excusas y a veces se relata a sí mismo.
- El emoji del jugador camina de pelota a pelota: sale del tee, se queda donde pegó mientras vuela la pelota y después va hasta ella (≈1 s, saltando).
- Apuntar: mientras arrastrás, los botones de abajo se apagan y no se pueden tocar. El encuadre es el de siempre; "a fondo" es arrastrar hasta 164 px o lo que haya de lugar debajo del dedo (mínimo 90 px), así que siempre se llega al 100%.
- Desde el tee, a medida que tirás para atrás, la cámara se aleja (hasta un 22%, o lo justo para que entre el pique) y la pelota sube en la pantalla. Si no pegás, vuelve. En los demás tiros, el zoom de siempre.
- Hoyo: dibujado encima del dibujo (vectorial, nítido), 50% más grande que el real (el real sigue siendo 0,22 yd) con borde crema. Las banderas pintadas en `cancha.webp` se borraron (inpainting) y las tres banderas las dibuja el juego (la del hoyo que se juega, dorada).
- Dificultad real (`node calibrar.mjs 60`): un bot juega 60 vueltas con cada uno. Apunta bien (prueba ángulos y potencias sin error ni viento), no compensa el viento, acierta el embudo de Fito la mitad de las veces y el latido de Miguelón con precisión entre 0,5 y 1, siempre llega antes que los monos y no usa el LP del Ninja. Resultado (prom. vs. par · % LP): El Sueco +1,8 · 8% / El Perro +2,6 · 3% / Miguelón +4,4 · 10% / Lechu +4,7 · 7% / Fito +5,1 · 13% / LG +5,1 · 2% / El Ninja +5,2 · 13% / Rodal +5,5 · 10% / Liberty +6,5 · 12% / Mugre +6,6 · 20% (remedido con los panchos). El mazo y "Ver todos" se ordenan por eso (`DIFICULTAD_REAL` en plantel.js) y la etiqueta sale del promedio (umbrales del 2026-10-04, remedidos con todo lo de ese día y la bandera al azar: Paseo < +0,7, Normal < +1,3, Difícil < +2, Muy difícil < +3, Trampa total) o se fija a mano (`nivel`: Fito es Trampa total, va al final del mazo). El handicap sigue moviendo el error y la distancia; la carta muestra el HCP y el promedio.
- Mazo: botón "VER TODOS" arriba: la lista de todos los players (foto, emoji, nivel, HCP, dificultad, frase y la habilidad con su preview) con "Jugar" en cada uno.
- Celu: sin zoom con doble toque ni pellizco (viewport + `touch-action: manipulation` + gesturestart), sin rebote al tirar para abajo, sin menú de "mantener apretado" en fotos. Un segundo dedo no pisa el tiro que estás armando. Si el tiro se corta (monos, LP), los botones vuelven. FIRMAR con doble toque anota una sola vez en el ranking. El LP no se confirma con un doble toque sin querer (el segundo toque tiene que llegar después de 0,45 s).
- Cartas del mazo: debajo de la frase, un preview animado (SVG) de la habilidad con su nombre y texto.
- La habilidad en la carta es un botón (flechita dorada ›): el texto se corta a 3 líneas y al tocarla se abre un modal chiquito (no toda la pantalla, el mazo se ve atrás borroso) con el preview grande, de quién es, el nombre y el texto entero; en el Mago, además, sus 5 golpes. Se cierra con la ×, "Entendido", tocando afuera o Escape (2026-10-04).

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
- El dibujo no respeta esas distancias (el 17 está dibujado mucho más largo), así que cada hoyo tiene su escala (yardas reales por yarda del dibujo), sacada del tee azul: desde la marca azul del dibujo, la distancia al hoyo da las yardas de la tarjeta. Los tees blanco y amarillo se ubican sobre la línea azul → hoyo a sus yardas de la tarjeta. El 16 no tiene marca azul en el dibujo: se usa la del fondo del tee.
- Tees rehechos: las marcas pintadas del dibujo (roja, amarilla, blanca, azul) se borraron (inpainting) y el juego dibuja encima un cajón de salida (de la marca azul a la amarilla, con rayas de corte) con tres pares de marcas de atrás para adelante: azul, blanca y amarilla, cada una donde sale; la tuya, más grande. El cartel "TEE n" va detrás del cajón.
- De qué tee salís según el handicap: hasta 5, azules; hasta 14, blancas; más, amarillas. El cartel del hoyo dice "desde las azules · PAR 4 · 392 YD".
- Todo lo que se muestra (yd al pin, el cartel del tiro) está en yardas reales. El carry máximo (en yardas reales) sale del handicap: 273 − 1,45 × HCP (HCP 0: ~273 de vuelo, ~300 con el rodaje; HCP 22: ~241 de vuelo, ~265 con el rodaje, y a fondo con error promedian 230–250). El Sueco ya no tiene drive especial (sale de su handicap: casi 300). Miguelón: la bomba vuela hasta 365 yd (llega al green del 15 desde las azules); el óvalo late pasando las 285.
- Dificultad real remedida con esto (prom. vs. par · % LP): El Sueco +2,9 · 3% / El Perro +3,1 · 3% / Miguelón +4,3 · 18% / Lechu +5,2 · 18% / LG +5,2 · 10% / Rodal +5,2 · 10% / Fito +5,2 · 12% / Mugre +6,1 · 22% / Liberty +6,4 · 17% / El Ninja +6,5 · 13%.

## Sonido (2026-10-04, `sonido.js`)
- Música: mientras jugás, casi nada (para concentrarse, como en los juegos de golf): acordes muy suaves y lentos (Do maj7 → La m9 → Fa maj7 → Sol sus, uno cada 7 s, con entrada y salida larguísimas), a veces una nota suelta arriba y pajaritos de la cancha; se apaga un momento para las embocadas y los birdies. La canción de la intro (`intro/assets/trampa-del-mono.mp3`) suena solo en la tarjeta final, desde que vuelve la banda. En el mazo y la portada, nada.
- Efectos (sintetizados con Web Audio, sin archivos): clic de botones y swipe del mazo; cuenta regresiva (3, 2, 1 graves y ¡YA! con acorde); carga del tiro (un tono que sube con la potencia, clic al llegar a fondo, late con la bomba de Miguelón); golpe (driver "thwack" + silbido según la potencia; putter "toc"); pique según el terreno (fairway, rough, bunker con arena, green, afuera); palo en un árbol; labio; la corbata (el borde raspando, cada vez más lento); embocada (la taza + campanas); resultado del hoyo (fanfarria birdie o mejor, dos notas para el par, trombón triste para bogey o peor); monos ("uh uh ah ah" cuando salen, un tic de tensión que se acelera cuando se acercan, risa cuando se la roban), Mono bueno (glissando mágico), el perro (ladra), el pancho; viento (colchón de ruido en ráfagas que sube con los km/h); firma (sello) y el Marshall (chicharra); LP (trombón triste).
- Silencio: por defecto respeta la tecla de silencio del celu (si está en silencio, el juego no suena). El botón 🔊/🔇 (debajo de dónde estás) lo apaga o lo prende; prenderlo a mano lo hace sonar aunque el celu esté en silencio. Se recuerda en el teléfono.

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
Sonido, fotos (van emojis; en la app usa `PlayerAvatar`), match en el mismo celu. El ranking compartido vive en el Supabase de la SDGApp (2026-10-04).

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
- Presentación oficial (video 9:16 de 75 s, `intro/trampa-del-mono-presentacion.mp4`): la intro, después las 8 funciones con capturas reales del juego en un teléfono (cancha, plantel, habilidades, tiro, monos, contra reloj, tarjeta, ranking), el estribillo con la trampa de noche y el cierre como la pantalla de inicio con el ícono, JUGALA YA y la dirección. Se arma con `node intro/armar-presentacion.mjs` (ver `intro/README.md`).


## Adentro de la SDGApp (2026-10-04)
- La app (repo `patmig124/fedecup`, `/juegos/trampa`) abre el juego en un iframe y se hablan por `postMessage` (`ranking.js`): `trampa:hola` → la app contesta `sdga:identidad {uid, alias, sdga}`; `trampa:leer` / `trampa:anotar` → la app lee y guarda en SU Supabase (`trampa_marcas`) y contesta `sdga:marcas` / `sdga:anotada`; `trampa:cerrar` vuelve a la app. El juego nunca ve claves ni tokens.
- Con la app: la portada dice "Jugás como X" (sin campo de nombre) y tiene "← Volver a la SDGApp". El ranking suma el switch **🌎 Mundial / ⛳ SDGA** (Mundial = todos los que juegan desde la app; SDGA = los socios) y agrupa por usuario de la app (`uid`), así dos "Juan" distintos no se pisan. Arranca en SDGA si sos socio.
- La app le pasa también los bordes seguros del teléfono (`sdga:marco {top, bottom}`): adentro del iframe `env(safe-area-inset-*)` da 0, así que el juego va de borde a borde y corre el HUD y el pancho lo justo.

## Suelto con login (2026-10-04)
- Un solo ranking: el de la SDGApp. Suelto (GitHub Pages / instalado) el juego pide **Entrar con Google** contra el MISMO Supabase de la FedE Cup (OAuth PKCE a mano en `ranking.js`, sin librerías). Es la misma cuenta que en la app: si ya elegiste tu jugador allá, acá entrás como tu jugador y al ranking SDGA; si no, con tu alias de Google ("Juan G.") y al Mundial. "Salir" al lado del nombre.
- Lee la vista `trampa_ranking` (sirve también sin sesión) y anota en `trampa_marcas` con tu token (RLS: solo a tu nombre). Al entrar crea/toca tu fila de `users`, como la app.
- Hace falta: la anon key de la app en `SUPABASE.anonKey` (`ranking.js`; es pública) y la URL del juego en Supabase → Authentication → URL Configuration → Redirect URLs (`https://rodrigomateus-debug.github.io/trampa-del-mono/**`). Sin la key, todo como antes: nombre a mano y ranking del teléfono.
- Los módulos van con versión (`?v=hash`, lo pone `build-web.mjs`): cada cambio llega apenas se publica, sin quedar pegado en la caché.

## Fluidez, hoyo de lejos, chip in y cámara en el vuelo (2026-10-04)
- **Fluidez:** se dibuja solo el pedazo de cancha que se ve (antes la imagen entera, rotada y con suavizado máximo, en cada cuadro); suavizado 'medium'; la trama de fondo solo si el dibujo no tapa la pantalla. En la SDGApp, además, el juego se sirve desde el mismo dominio de la app (`/trampa/`) y la app de atrás se apaga mientras jugás.
- **El hoyo de lejos:** sin el mínimo de 5,4 px: con zoom out se ve del tamaño que le toca (mínimo 2,6 px), no como un pozo.
- **Chip in (`CHIP`):** desde afuera del green un tiro completo que **cae** en la boca del hoyo entra con chance (80% en el centro, menos hacia el borde: `chanceClavada`); el que llega **rodando** más rápido que un putt también tiene chance hasta 10 yd/s (más centrado y más lento, más: `chanceRodando`). La suerte sale del tiro mismo (`suerteDe`), sin tocar el rng.
- **Cámara en el vuelo:** al soltar un tiro completo, la cámara vuelve al zoom de apuntar (un 15% más cerca) y acompaña a la pelota; ya no queda con la cancha entera del zoom out de tirar para atrás.
- Dificultad real recalibrada (60 vueltas por jugador).

## Barra de estado y conteo (2026-10-04)
- En la SDGApp el juego avisa el color de arriba de lo que muestra (`trampa:color`: intro/mazo `#1f5f3e`, menús `#16392a`, juego `#1c4630`) y la app tiñe la barra de estado del iPhone con ese color.
- Conteo: cada vuelta que llega a la tarjeta final (firmada o no, LP incluido) se cuenta (`R.contarVuelta`): en el teléfono y, con sesión, en `trampa_vueltas` de la SDGApp. Portada: "Jugaste N vueltas · M LP 💅". Ranking: "Entre todos: X vueltas · Y LP (Z%)" en el general y "Con <player>: …" en cada pestaña, más lo tuyo.
- Tarjeta final (2026-10-04, versión compacta elegida por Rorro): COMPARTIR MI VUELTA 📸 (grande, dorado: imagen + texto, el menú del teléfono elige WhatsApp/historias) · OTRA VUELTA y RANKING 🏆 en una fila · "Cambiar jugador" como link. Fuera MANDAR TEXTO y COPIAR. El pie de la imagen y el texto llevan `fedecup.vercel.app` (antes el link de GitHub).
- Ranking general (Mundial y SDGA): cada fila dice "con <player>" debajo del nombre.
- 2026-10-04 (pedidos de Rorro):
  - Putts cortos con más zoom: al apuntar un putt el tope de zoom sube de 10 a 40 px/yd desde 8 yd hasta 1,5 yd (`vistaApuntar`); la fuerza sale del largo del arrastre en pantalla, así que el zoom no cambia la sensibilidad. Todo respeta el cambio de escala: el hoyo, la pelota y las flechas de caída están en yardas; la bandera y el aro de fuerza del putt crecen con el zoom (`escalaZoom`, hasta 3,5×).
  - Fito: a 40 yd o menos, si el chip cae en el green, el imán lo mete siempre (antes lo dejaba dado al lado y solo entraba perfecto y apuntado). Dificultad fijada en Trampa total.
  - Lechu (Joaco): putts de 3 metros o menos entran siempre (ver arriba).
  - Árbol en la salida: al apuntar, si el tiro (sin error ni viento) le pega a un árbol en la primera mitad del vuelo, todavía bajo (`pinoEnLaSalida`), la línea punteada sale en rojo, se corta en el árbol, el árbol queda marcado con una cruz y dice "PEGA EN EL ÁRBOL 🌲". Si lo pasa por arriba, la línea normal.
  - La caída del green por zonas (`caidas` en cada hoyo, `caidaEn`): de 2 a 4 zonas por green (15: 3, 16: 4, 17: 2), cada una con su caída; en cada punto se mezclan pesadas por cercanía (campana de 8 yd), así que cambia fluida como en un green real. La física del putt usa la caída del lugar donde está la pelota. Al apuntar se marca todo el green: una marca cada 2 yd (antes cada 4 y solo alrededor del hoyo), de la mitad del tamaño, apuntando a la caída de ese lugar y más marcada donde cae más.
  - El par 3 (el 17) no tiene driver: a fondo llega de 240 yd (hcp 0) a 200 yd (hcp 24 o más) (`PAR3`, `carryMaxDe`); Miguelón ahí no tiene bomba.
  - Las banderas siguen el zoom en los dos sentidos (0,45× a 3,5×): al alejarse se achican con la cancha (antes quedaban de 34 px y parecía que crecían). El número, solo si se lee.
  - Viento: la deriva crece con el cuadrado del largo (`FISICA.vientoExp` = 2). A fondo, igual que antes (hasta 30 yd con 30 km/h); a media fuerza, un cuarto; un approach de 50 yd, ~1 yd.
  - Rodal y Lucas en persona: cuando juega Rodal, LG no relata arriba. Después de cada tiro (bueno o malo) Lucas aparece abajo a la izquierda (`jugadores/lg-torso.webp`, la foto de LG sin el fondo, recortada con GrabCut), entra con movimiento, flota y le dice algo lindo en un globo de diálogo que sale de su boca y "respira" (bordes que se deforman); después se va con fade. Las frases van con el tiro (`tipoDeTiro`, `adular`): drive (tee de par 4), hierro (tee del par 3 o a más de 110 yd), approach, putt (dada, pasado, corbata), embocada (putt, chip in, hoyo en uno), mono y afuera. Antes le decía "¡qué bomba!" a un putt.
  - Las marcas de la caída, animadas: más chicas y más tenues, cada una corre 1,6 yd para donde cae, aparece y se apaga y vuelve a empezar (cada una a su tiempo); donde cae más, corren más rápido (0,35 + 2,4 × la caída, yd/s).
  - Árboles fantasma: la grilla tenía grupitos de "árbol" entre los bunkers y los greens (la sombra del borde de la arena leída como copa) en los tres hoyos; se sacaron (rough). También celdas sueltas de green adentro de los bunkers (ahora bunker).
  - El bunker: al apuntar la línea muestra el tiro entero (como del fairway), pero la pelota llega a la mitad (`FISICA.factorReal.bunker` = 0,5). El cartel del lie sigue diciendo "BUNKER · 50%".
  - En la salida de cada hoyo (primer golpe, desde el tee) los monos no salen a cazar (`esSalida`, `despertarMonosDe`); en el 17 su recorrido pasa cerca del tee y te robaban la pelota antes de pegar. En todos los demás golpes, sí.
  - La bandera, en otro lugar cada ronda (`sortearBanderas`, en los tres hoyos): cualquier punto del green a 6 yd o más del borde (`BANDERA.margen`). Esa zona se parte en tres tercios a lo largo de la línea del tee al green (las puntas angostas, donde no entra la bandera, no cuentan) y se sortea un tercio y un lugar. El color dice el tercio: roja adelante (el más cerca del tee), blanca al medio, azul al fondo. Los tees no se mueven (se calculan con la bandera original). La ronda guarda sus hoyos con su bandera (`r.hoyos`) y `hoyoActual` devuelve esos; sin sortear (los tests), la del dibujo.
  - Marcos (El Flaco Ordoñez) y su carrito verde (`id: 'carrito'`; primera parte, para aprobar): después de cada tiro, y del green al tee del próximo hoyo, no se pasa solo a la pelota: se sube al carrito y lo manejás vos (estado `manejar`). Mandos en pantalla: ◀ ▶ (doblar), REVERSA y ACELERAR (multitáctil); en compu, flechas o WASD. La física (`CARRITO`, `manejar`): hasta 16 yd/s del dibujo, reversa 6, frena solo al soltar, dobla según la velocidad; en el rough anda al 70% y en el bunker al 45%; los árboles y el afuera no se atraviesan (rebota y suena el palo). Llega cuando está a 4 yd de la pelota (si quedó en el bosque, a 10: el último tramo a pie) y ahí se baja y sigue el tiro normal. La cámara lo sigue con la trompa para arriba y se abre con la velocidad; un aro dorado marca la pelota y una flecha alrededor del carrito apunta hacia ella. El reloj corre mientras maneja. Arranca con el carrito al lado del tee del 15. Si los monos llegan a la pelota y vuelve al tee (+1), el carrito vuelve con él: arranca de nuevo ahí, sin manejar de vuelta (`carroAlLado`).

## Revisión de reglas (2026-10-04)
- Los umbrales de las habilidades van en yardas REALES, las del marcador (antes eran del dibujo y en el 17, con escala 0,75, los "3 metros" de Lechu eran 2,25 m): `DADA` (Lechu), `AGUILA.chip` (el imán de Fito) y `APPROACH` (Liberty) se comparan con la distancia del dibujo × la escala del hoyo. Remedido: Liberty +1,59 (antes +2,11), Fito +1,59 (antes +1,73); el resto igual.
- Salida es solo el tee del hoyo que se juega (`desdeLaSalida`): una pelota que queda en el tee de otro hoyo se juega como cualquier otra (sin bomba de Miguelón, sin drive derecho de Liberty, y el relato no la llama drive).
- Al soltar sale el tiro que se vio en pantalla (el último cuadro dibujado), no uno recalculado: el embudo del Águila y el latido de la bomba se movían hasta ~4° entre lo que se veía y lo que salía. Si al soltar el dedo volvió al lugar, no sale nada (se cancela como siempre).
  - El carrito, segunda vuelta (pedido de Rorro): mandos con la pinta del SDGA (volante de discos crema con chevrones verdes; pedales con estrías de goma: ACELERAR dorado, FRENO crema con letras rojas; REVERSA en pastilla verde; en compu, espacio = freno) y un velocímetro arriba que se llena de dorado y en el turbo se pone al rojo. Freno de verdad (frena fuerte sin pasar a reversa). Turbo de menos a más: acelera fuerte hasta 16 yd/s y si seguís apretando sigue subiendo hasta el triple (48): desde parado, ~5 s (antes ~16; pedido de Rorro: "que sea dinámico"). Colea: el carrito tiene velocidad de costado; rápido (más de 20) y doblando, o frenando y doblando, pierde agarre y la cola se va (marcas de goma en el pasto, que se borran en 7 s, y humito). La cámara se abre con la velocidad.
  - Los monos y el carrito: mientras manejás, los monos cercanos salen a buscar el carrito (no la pelota). Si pisás uno andando, queda aplastado ahí el resto de la ronda (chato, con 💫) y es un golpe de multa por cada uno. La animación: el mono se aplasta con rebote, ¡PLAF! de historieta y 💥🍌💫⭐ que vuelan, la pantalla se sacude, un "+1" rojo sube y cae el sello "+1 GOLPE DE MULTA · por tortura animal 🐒". Al bajarte, los que te perseguían vuelven a su recorrido y la pelota la buscan desde cero (con el tiempo mínimo de siempre). Si con las multas llega a 10 golpes, LP.
  - "¿Jugaste con Rorro?" (Marcos, al final de la vuelta, antes de firmar; si levantó, no): un modal crema que respira, con la cara de Rorro. Si decís que sí es una apuesta, 50 y 50 (`apostarRorro`): "Rorro se equivocó al anotar" y te anotó un golpe menos (lluvia de 🥃, sello "−1") o uno de más (lluvia de 💸, sello "+1"). Queda en la tarjeta (`tarjeta.rorro`, que `totales` suma: cuenta para el ranking y el récord) como una fila "🥃 Rorro anotó mal".
  - Maxi Vacca (Grandpa, en la app) y Deme, el mentor (`id: 'deme'`): un botón con la cara de Deme, una vez por vuelta y nunca desde el tee (`puedeInvocarDeme`; en la salida está apagado). Al tocarlo, todo se frena (los monos también) y Deme entra caminando por el pasto: el cabezón con su cara real (`jugadores/deme-cabeza.webp`, recortada del retrato), se mete las manos en los bolsillos y en un globo dice "MIRÁ, ASÍ TENÉS QUE AGARRAR EL PALO." y un consejo de grip. Cuando termina, se va y la pelota queda con un aura dorada que late y destellos que giran. El próximo tiro, pegue como pegue y desde donde esté, va derecho al hoyo y entra (`tiroDeDeme`: sin error, sin viento, por arriba de los árboles y sin monos; en el green, el putt rueda solo adentro). "¡LO DIJO DEME! 🧙". Calibrado: el bot lo llama en el primer tiro que puede a más de 30 yd (−0,15, Paseo).

## Match (2026-10-04)
- Uno contra uno, a distancia. Botón **MATCH ⚔️** en la portada, que aparece solo si la app avisa que atiende el match (`match: true` en `sdga:identidad`; por ahora, la app de `dev`) o suelto con la base y la sesión. Tiene tres pestañas: **Desafiar** (la lista de rivales, con buscador), **Pendientes** (los desafíos que te hicieron y los que esperan respuesta) e **Historial** (tu récord G-E-P total, contra cada rival y match por match).
- **Desafiar:** elegís rival, después tu player en el mazo, y jugás tu vuelta una sola vez. La semilla del match (`condicionesMatch`) fija el viento de cada hoyo y las banderas: los dos juegan exactamente lo mismo. Mientras jugás se graba tu pelota (`grabar`): una muestra `[ms, hoyo, x, y, altura, golpes]` cada 100 ms, solo si algo cambió. En la tarjeta final el desafío se manda solo (con reintento) y aparece el botón **MANDÁSELO POR WHATSAPP**, que arma un mensaje con tu player, tu vuelta, una chicana según cómo te fue y el link (`linkMatch`: la pantalla del juego en la app, con `?match=1`).
- **Responder:** el desafiado juega con el **mismo player** que usó el que lo desafió (no elige) y ve su pelota en vivo, como un fantasma (`fantasmaEn`, con el reloj de la vuelta desde el ¡YA!): una pelota semitransparente con un halo que respira y un cartelito con su emoji y su nombre. Si está fuera de la pantalla, el cartelito queda en el borde con una flechita para el lado donde está. Arriba, una pastilla: "👻 Rorro M. · hoyo 16 · 5 golpes" (o "terminó · 11 golpes"). Al final se anota y sale **GANASTE / PERDISTE EL MATCH / EMPATE** (`ganadorMatch`: menos golpes, empate de golpes gana el más rápido, LP pierde).
- Avisos: en la portada, el botón MATCH tiene un numerito rojo con los desafíos para jugar y los resultados nuevos de los que mandaste (los "vistos" quedan en `sdga-trampa-match-vistos-v1`, que la app lee para su aviso del Inicio). Con `?match` el juego abre directo en el match, sin la intro.
- Datos: `ranking.js` (`leerRivales`, `crearDesafio`, `leerDesafios`, `leerFantasma`, `responderDesafio`). En la app, todo pasa por el puente (`trampa:match {id, accion, datos}` → `sdga:match {id, ok, datos}`) y la app guarda en su tabla `trampa_desafios`. Suelto, se usa directo el REST de Supabase con la sesión.
