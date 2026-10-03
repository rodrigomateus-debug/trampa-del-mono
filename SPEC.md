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
- Récord por jugador en el teléfono. Compartir al grupo por WhatsApp (link wa.me + copiar).


## Cambios del 2026-10-03 (tarde)
- Marcador: la cara del jugador grande en un círculo con su emoji en un circulito arriba. El relato de LG, el aviso de monos y el tip van en una franja fija dentro del marcador (no tapan la cancha).
- LP = levantar la pelota pierde la vuelta entera (el hoyo y los que faltan quedan LP; no cuenta para el récord). Al décimo golpe en un hoyo, LP automático.
- Si los monos llegan a la pelota antes del golpe: vuelta al tee del hoyo con un golpe de multa (se conservan los golpes que ya llevabas).
- Rodal: LG solo lo adula, pegue como pegue (sin excusas ni versos; los resultados también).
- Fito (🦅 El Águila) — Chip in: en drives y hierros la línea de tiro se sacude ±25° (período 0,7 s); si suelta con el desvío dentro de ±5° (el embudo dibujado en la pelota) sale derecha. A 40 yd o menos del hoyo, si la pelota llega al green, un imán la deja a 0,7 yd del hoyo; si el tiro fue perfecto y apuntado a la bandera, entra.

## Voz
LG 📺 relata con las frases del chat ("Tremendo", "Uff", "Hermoso", "QUE HOMBRE"); en tiros malos sale una excusa.
Intro de cada hoyo con un verso de la canción de Fito. Frases de carga del design system.

## Armado
- `motor.js`: lógica pura (cancha, terreno, física, Mono, score, textos). Sin DOM; azar inyectado. Se porta a `src/engine/trampa.ts`.
- `index.html`: canvas + HUD con el SDGA Design System (campo verde, tarjetas crema, banda dorada, Anton + Archivo, emojis del plantel).
- `test-motor.mjs`: `node test-motor.mjs`.
- Se publica como artifact privado para probar en el celular.

## Afuera por ahora
Sonido, fotos (van emojis; en la app usa `PlayerAvatar`), match en el mismo celu, tabla en Supabase.
