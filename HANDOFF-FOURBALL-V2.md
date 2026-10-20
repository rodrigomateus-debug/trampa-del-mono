# Handoff: Fourball v2 (La Trampa del Mono + SDGApp)

Para el próximo Claude. Escribile al usuario (Rorro, creador del juego y diseñador de la SDGApp) en **español rioplatense**.

## Repos y ramas
- **Juego:** `rodrigomateus-debug/trampa-del-mono`, rama de trabajo `claude/beautiful-hypatia-zpvfwq`.
  - Vanilla JS en módulos ES. `juego.html` se compila a `index.html` con `node build-web.mjs`. Tests: `node test-motor.mjs` tiene que decir "Todo verde.".
  - `dev/` es la copia de prueba: se publica copiando a `dev/` los archivos de la raíz (`index.html`, `juego.html`, `motor.js`, `ranking.js`, `prueba.js`, `cancha3d.js`, etc.).
  - **Regla de Rorro: a `main` del juego solo se publica `dev/`; la raíz (el juego publicado) no se toca** hasta que él lo apruebe. Antes de publicar, mirá si `main` tiene commits nuevos y traelos a la rama.
- **App (SDGApp):** `patmig124/FEDECUP`, React + Vite + TS, tests con Vitest.
  - Rama `dev`: el fourball v1 ya está subido.
  - Rama **`claude/fourball-v2-wip`** (commit `5fbecd8`): el trabajo de v2 sin terminar. Cuando esté verde, mergearla a `dev`.
  - En `dev`, `vercel.json` y `vite.config.ts` apuntan `/trampa` a `trampa-del-mono/dev/`. Eso se revierte antes de pasar `dev` a `main` (paso 13d de PENDIENTES-TRAMPA).
- **Reglas:**
  - El SQL lo corre **Miguel** a mano (en staging y en producción), copiado en UTF-8. Ver la nota de UTF-8 en `PENDIENTES-TRAMPA.md`.
  - La service_role key nunca va en el frontend.
  - El apodo "Demetrio López" no se muestra fuera del juego.
  - No poner identificadores de modelo en commits ni en archivos.

## Qué es el fourball (v1, ya en dev/)
- **Formato:** 2 contra 2 a distancia. Cada uno juega su vuelta cuando puede y ve los "fantasmas" de los que ya jugaron.
- **Puntos:** por hoyo, 1 a la mejor pelota y 1 a la suma (½ y ½ si empatan). 3 a 3 lo define el tiempo sumado.
- **Plazos:** sin tomar, vence a los 7 días; tomado, los cuatro tienen 48 h (el que no juega, LP). Por el honor.
- **Dónde está:** MATCH › 2 VS 2, con las pestañas Armar / Buscan rival / Tus fourball. Link de WhatsApp `?match=1&fourball=<id>`.
- **Código:**
  - Reglas: `motor.js` (`resultadoFourball`, `formatoPuntos`, `hoyosDeTarjeta`).
  - Datos: `ranking.js` (`leerFourballs`, `crearFourball`, `tomarFourball`, `jugarFourball`, `leerFantasmasFourball`, `linkFourball`).
  - Fourball de mentira para probar: `prueba.js`, se entra con `?probar=match`.
  - UI: `juego.html`, buscar "el FOURBALL ⚔️". Funciones clave: `pintarFourball`, `pintarMisFourball`, `armarFb`, `tomarFb`, `jugarFb`, `fantasmasFb`, `pintarMarcadorFb`, `cerrarFourball`, `pintarResultadoFb`, `tablaFourball`, `avisosFb`, `entrarPorFourball`, `mensajeFb*`.
- **Documentación:** `SPEC.md`, última sección.

## Lo que pidió Rorro (v2): "sí a los 9"
1. **Mismo player para los cuatro** (el player cambia la puntería). El que arma elige el player; los otros juegan con el de `a1.vuelta.apodo` (entran directo, sin mazo, como en el 1v1).
2. **El compañero puede decir "No puedo"** antes de jugar: deja el lugar vacío y el que lo armó (o el que lo tomó) elige otro.
3. **Bajarlo:** el que lo armó lo puede cancelar mientras nadie lo tomó.
4. **Recordatorios:** aviso en el Inicio de la SDGApp ("te toca", "te quedan N h") y la urgencia en el juego.
5. **Revancha:** botón en un fourball jugado. Arma uno con el mismo compañero, reservado para la misma pareja rival.
6. **Desafío a una pareja puntual:** en Armar, "contra cualquiera" o "contra X y Y". Solo esa pareja lo puede tomar; lo acepta o lo rechaza.
7. **Historial y ranking del fourball:** récord G/E/P y una pestaña Ranking de jugadores y parejas, calculada en el cliente con los jugados de todos. **El Clásico NO** se incluye por ahora (avisarle a Rorro).
8. **Ventaja del último:** se deja como está.
9. **Novedades:** "Lechu jugó su vuelta: van 2½ a 1½". En el juego, una hojita al entrar; en la app, el aviso del Inicio.

## Estado

### Hecho: SQL (en la rama `claude/fourball-v2-wip`)
- El bloque "el FOURBALL" al final de `supabase/trampa-staging.sql` y `migration.sql`, reescrito.
- Es idempotente y pone al día una tabla que ya estaba como quedó el 19/10. Se probó corriéndolo dos veces seguidas y también encima del bloque viejo.
- **Cambios en la tabla:**
  - `a2_id` puede ser null.
  - Columnas nuevas: `para1_id`/`para1_alias`/`para2_id`/`para2_alias` (desafío reservado), `revancha_de`, `bajado_por`.
  - Estado nuevo `'cancelado'`.
- **Funciones:**
  - `trampa_fourball_crear(p_companero, p_alias, p_semilla, p_vuelta, p_fantasma, p_rival1 default null, p_rival2 default null, p_revancha default null)`. Se borra antes la versión vieja de 5 parámetros.
  - `tomar`: en un fourball reservado solo puede la pareja `para`; `p_companero` puede venir null.
  - `jugar`: valida que se juegue con el mismo player que `a1`.
  - Nuevas:
    - `trampa_fourball_no_puedo(p_id)`: libera a2 o b2; si lo llama alguien de `para`, cancela el desafío.
    - `trampa_fourball_companero(p_id, p_companero, p_alias)`
    - `trampa_fourball_bajar(p_id)`
    - `trampa_fourball_jugados()`: los últimos 500 jugados, con las vueltas.
  - `visto` ahora devuelve también `para`, `revanchaDe` y `bajadoPor`; un lugar vacío llega como `null` o como `{uid: null, alias: '—', vuelta}`.
  - `abiertos` y `mios` incluyen los desafíos reservados para vos.
- **Test de escenarios:** `supabase/fourball-test2.sql`, en la copia local; si no está en la rama, rearmarlo. Pasó completo en Postgres 16 local. Para correrlo: hace falta un stub de `users`, `players`, `trampa_rivales` y `auth.uid()` por `request.jwt.claim.sub`.

### Hecho en su mayor parte: la app (rama `claude/fourball-v2-wip`)
- **`src/lib/trampa.ts`:**
  - `validarFourballNuevo` acepta `rivalesIds` y `revanchaDe`.
  - En `validarFourballTomar` el compañero puede ser null.
  - Nuevo `validarFourballCompanero`.
  - Tipos con `para`, `revanchaDe`, `bajadoPor`, estado `'cancelado'` y `TrampaFourballJugado`.
  - `FOURBALL_VISTOS_KEY = 'sdga-trampa-fourball-vistos-v1'` y `FOURBALL_FOTO_KEY = 'sdga-trampa-fourball-foto-v1'`. La "foto" es `{ [id]: ['a1','b2',…] }`, quién había jugado la última vez que miraste. **El juego tiene que escribirla**; es el mismo localStorage porque `/trampa` es del mismo origen.
  - `horasFourball`, `avisosFourball`, `resultadoFourball` (port de la regla del motor) y `formatoPuntos`.
- **`src/data/trampa.ts`:** `fourballNoPuedo`, `fourballCompanero`, `fourballBajar`, `fourballJugados`; `fourballCrear` manda `p_rival1`, `p_rival2` y `p_revancha`; hook `useMisFourballs(uid)` para el aviso.
- **`src/features/juegos/TrampaFrame.tsx`:** acciones del puente `fourballNoPuedo`, `fourballBajar`, `fourballCompanero` y `fourballJugados`.
- **`src/features/juegos/AvisoFourball.tsx`:** nuevo, puesto en `InicioPage.tsx` (debajo de AvisoMatch) y en `JuegosExternos.tsx`, donde `onAbrir` hace `setFourball(id)`.
- **Tests:** `lib/trampa.test.ts`, `data/trampaBananas.test.ts` y `TrampaFrame.test.tsx` pasan.
- **Falla 1 test**, en `AvisoFourball.test.tsx`: "FOURBALL: GANARON 6 A 0" no aparece. El fixture tiene a1 y a2 de la pareja rival (`a1: vu([4,4,3])`, `a2: [5,5,5]`) contra yo (b1 `[3,3,3]`) y b2 `[5,5,5]`. Revisar la cuenta esperada: lo más probable es que el resultado real no sea 6 a 0 y lo que hay que corregir sea el texto esperado en el test, o el `lugar`. Correr `npx vitest run src/features/juegos/AvisoFourball.test.tsx`.
- **Después:** `npx vitest run` completo, `npx tsc --noEmit -p .`, `npm run build`, mergear a `dev` y push.
- **PENDIENTES-TRAMPA.md:** agregar en la sección 13 que hay que volver a correr el SQL nuevo (staging y producción, en UTF-8). 13b y 13e siguen sin tildar.

### Falta: el juego (todo en `trampa-del-mono`)
- **`ranking.js`:**
  - `crearFourball` con `rivales` y `revanchaDe` (por el puente: `rivalesIds`, `revanchaDe`; por REST: `p_rival1`, `p_rival2`, `p_revancha`).
  - `tomarFourball(id, companero|null)`.
  - Nuevas: `noPuedoFourball(id)`, `companeroFourball(id, comp)`, `bajarFourball(id)`, `leerFourballsJugados()`.
  - `deFilaFourball`: agregar `para`, `revanchaDe`, `bajadoPor`, y que `ladoFb` acepte `uid` null si hay vuelta.
- **`prueba.js` (el fake):**
  - Las mismas reglas que el SQL: mismo player, no puedo, compañero, bajar, reservados, jugados.
  - Un fake que **siempre** sea un desafío reservado para vos (El Mono y Lechu te desafían a vos y a Patmig).
  - Que Patmig, cuando es tu compañero, diga "No puedo", para poder probar ese camino.
  - La constante `RESPONDEN` es 6000 ms; para probar con calma se puede subir.
- **`juego.html`, ítems 1 a 9:**
  - **Mismo player:** `jugarFb` empieza con `TODOS.find(apodo === f.a1.vuelta.apodo)` y si no lo encuentra, va al mazo. Los textos, las filas y los mensajes muestran "con 🦉 X (el de los cuatro)".
  - **"No puedo" / "Rechazar":** en la fila "Te toca" y en la hojita del link. Sección "Elegí otro compañero" (reusar `fbElige` con un modo `cambiar`).
  - **"Bajarlo":** en la fila "Buscando rival", con confirmación.
  - **Urgencia:** en rojo cuando quedan 6 h o menos. Agregar a `pendientesFb` los sin compañero y los desafíos.
  - **Revancha:** botón en `pintarResultadoFb` (jugado) y en `abrirDetalleFourball`. Va al mazo y después a `crearFourball` con rivales + `revanchaDe`. Al terminar, "Desafío enviado" + WhatsApp a los rivales.
  - **Desafío directo:** en Armar, después de elegir compañero, la hojita "¿Contra quién?" (cualquiera o una pareja: elegir rival 1 y rival 2 con la misma lista). Los desafiados lo ven arriba de Buscan rival y en Tus fourball › "Te desafiaron" (Aceptar = `tomarFourball(id, null)`; Rechazar = `noPuedo`).
  - **Ranking:** 4ª pestaña en `#fb-tabs` (pasa a una grilla 2×2 como la del 1v1). Jugadores y parejas, G/E/P y %. Récord G/E/P arriba de "Jugados".
  - **Novedades:**
    - Escribir la foto `FOURBALL_FOTO_KEY` cuando se pinta Tus fourball.
    - Al entrar, si alguien jugó desde la foto, mostrar una hojita "Novedades del fourball". El puntaje solo si yo ya jugué (las vueltas ajenas vienen `oculta` hasta que jugás).
    - Los resultados vistos ya se marcan en `VISTOS_FB` (`'sdga-trampa-fourball-vistos-v1'`).
  - Actualizar `SPEC.md` y `dev/LEEME.txt`.
- **Probar en Playwright** (Chromium en `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, servidor `python3 -m http.server 8765`):
  - Al entrar puede aparecer el popup de camiseta (`.cam-eq[data-eq="dicky"]` y después `#cam-ok`) y hojitas para cerrar con Escape.
  - Para frenar a los de mentira: `p.route('**/prueba.js*', …)`.
  - Para capturar los mensajes de WhatsApp: pisar `window.open` y `navigator.share = undefined` en un init script.
- **Publicar:** `node build-web.mjs`, `node test-motor.mjs`, copiar a `dev/`, commit + push de la rama. Después publicar **solo `dev/`** a `main`: `git checkout origin/<rama> -- dev` en un worktree sobre `origin/main`, commit y `git push origin HEAD:main`.

## Commits
Terminar los mensajes con:
```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
