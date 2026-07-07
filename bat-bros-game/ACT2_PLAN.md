# Bat Bros — Plan del Acto 2

> Documento de diseño. Nada aquí está implementado todavía. Sirve como
> checklist para construir el Acto 2 por fases.

## Gancho narrativo (ya sembrado en el Acto 1)

Al vencer a Bane, el juego muestra: *"Batman encuentra una moneda quemada de
dos caras… Robin sigue secuestrado… la historia continúa en el ACTO 2"*
(`game.js` ~línea 1319). El Acto 2 paga ese gancho:

- **Villano**: **Two-Face** (Harvey Dent). La moneda de dos caras es su firma.
- **Objetivo**: rescatar a Robin, retenido en el escondite de Two-Face.
- **Tema mecánico**: el **batarang** — el código ya dice *"The batarang returns
  as an upgrade in Act 2"* (~línea 1196). El Acto 2 arranca con el batarang
  activo, así que el combate a distancia es protagonista.

## Ambientación (nuevo look, mismo motor)

El Acto 1 fue azoteas de Gotham + el almacén de Bane. Para diferenciar:

- **2-1 — Los muelles**: contenedores, grúas, agua (los "pits" ahora son mar).
- **2-2 — El palacio de justicia**: escaleras de mármol, columnas (walls),
  cornisas altas.
- **2-3 — El casino de Two-Face**: neones, mesas, la subida al ático.
- **2-4 — La bóveda (arena del jefe)**: interior cerrado, tipo `indoor: true`
  como el `1-4` de Bane.

Todo se dibuja con primitivas de Canvas (sin imágenes), igual que el Acto 1.

## Niveles nuevos (a añadir en `LEVEL_SPECS`)

Cuatro specs `2-1`…`2-4` que reusan el mismo esquema declarativo
(width/height/groundY/pits/platforms/walls/houses/swingPoints/coins/thugs/
birds/bats/spawn). Se respetan las reglas de alcanzabilidad del `CLAUDE.md`:
salto ~3 tiles, techos ≤3 tiles saltables, muros de 6 tiles con ancla de
grapple 2 tiles por encima.

## Enemigos nuevos (alcance acotado)

- **Matón armado (`gunman`)**: como el thug pero dispara un proyectil recto en
  intervalos. Obliga a usar el batarang o cubrirse. Reusa el patrón de patrulla
  del thug + un spawner de proyectil como el del batarang.
- (Opcional) **Moneda-trampa**: hazard giratorio en el casino. Solo si sobra
  presupuesto.

## Jefe: Two-Face (arena `2-4`)

Máquina de estados calcada del patrón de Bane (`drawBane`/`updateBane`), pero
con la mecánica de la **moneda**:

- **Estado `coinflip`**: lanza la moneda al aire (telegrafía el turno).
  - **Cara buena** → ataque "limpio": dispara una ráfaga de 3 monedas rectas,
    esquivables saltando.
  - **Cara mala** → ataque "sucio": invoca 2 matones y avanza.
- **`fight`**: patrulla la bóveda entre rondas.
- **Daño**: con el batarang (a distancia) en vez del pisotón de Bane — encaja
  con el tema del acto. 5 impactos; acelera el ciclo tras el 3º.
- Robin aparece enjaulado al fondo; se libera al derrotar a Two-Face.

## Puntos de integración en el código (concretos)

1. **`LEVEL_SPECS`** (~línea 161): añadir los 4 specs nuevos al final.
2. **Selección de jefe**: hoy `BOSS_LEVEL_INDEX = LEVEL_SPECS.length - 1`
   asume **un solo** jefe. Refactor: marcar el jefe **en el propio spec**
   (`spec.bane` ya existe; añadir `spec.twoface`) y decidir por spec, no por
   índice. Esto desbloquea múltiples jefes.
3. **Transición entre actos** (`update`, ~línea 1314): al pasar de `1-4` a
   `2-1`, mostrar la tarjeta *"FIN DEL ACTO 1 / COMIENZA EL ACTO 2"* como
   interludio y **luego** cargar `2-1` (hoy termina en `state='win'`).
4. **Power state**: al entrar al Acto 2, forzar `currentPowerState='batarang'`
   (hoy se hereda entre niveles y se resetea al morir — ver ~línea 432).
5. **Intro/portada**: hoy dibuja `'ACTO 1 — LA PISTA'` (~línea 2939). Añadir
   portada/arte del Acto 2.
6. **Two-Face**: nuevas `drawTwoFace()` + `updateTwoFace()` + proyectil-moneda,
   modeladas sobre las de Bane.
7. **Guardado (Supabase "Continuar")**: `savedMaxLevel` ya indexa en
   `LEVEL_SPECS`, así que los niveles nuevos extienden "Continuar" solos.
8. **Service worker**: subir `CACHE_NAME` en `sw.js` al publicar.

## Brecha de testing (a decidir)

El `CLAUDE.md` describe tests deterministas con Playwright
(`test_traversal.js`, `test_v2_features.js`) y `npm test`, **pero este repo no
tiene `package.json` ni carpeta `tests/`**. Opciones: (a) reconstruir el arnés
de test para verificar alcanzabilidad de los niveles nuevos, o (b) verificar a
mano en el navegador. Recomiendo (a) antes de diseñar `2-1`.

## Fases de implementación (para hacer por partes)

- **Fase 0 — Cimientos**: refactor de selección de jefe a partir del spec +
  interludio de transición de acto + batarang de arranque en el Acto 2.
  - ✅ `BOSS_LEVEL_INDEX` ya no es "el último nivel" sino el que lleva `bane`
    (`LEVEL_SPECS.findIndex(s => s.bane)`), así que se pueden encadenar más
    niveles después del jefe.
- **Fase 1.5 — La Baticueva** ✅ *(implementada)*: interludio jugable de 3
  cuadros entre el jefe Bane (`1-4`) y el Acto 2.
  - Nivel `CUEVA` en `LEVEL_SPECS` con `cave: {...}` (entrada, computadora,
    moneda, T-Rex, puerta, terrazas de ascenso).
  - Escena de cueva propia: fondo con degradado + estalactitas + gotas que
    caen y hacen ondas, murciélagos que **abren los ojos y vuelan** al
    acercarse Batman, T-Rex y moneda gigante como trofeos.
  - Al tocar la Batcomputadora: pantalla de **expediente de Two-Face** →
    **elección de arma** (Batarang vs. Batigarra) → se equipa y se abre la
    puerta de salida a la derecha.
  - **Batigarra** implementada como `powerState`: se dispara como arma
    (gancho dorado) y, durante el swing, da control total de la cuerda
    (`disparar` = acortar, `abajo` = alargar, `izq/der` = impulso) sin
    auto-liberación. Se usará a fondo en los niveles del Acto 2.
- **Fase 1 — `2-1` (muelles)**: primer nivel jugable, introduce el `gunman`.
- **Fase 2 — `2-2` y `2-3`**: palacio de justicia + casino.
- **Fase 3 — Jefe Two-Face + arena `2-4`** con la mecánica de la moneda y Robin.
- **Fase 4 — Remate**: portada del Acto 2, textos de final, bump de caché,
  (opcional) arnés de test y verificación de alcanzabilidad.

## Base de datos — columna `game_overs` (Supabase)

El contador de game overs por jugador se guarda en la fila del jugador en
`bitbros_players`, en una columna `game_overs`. Con la clave publishable no se
puede alterar el esquema desde el juego, así que hay que crear la columna una
sola vez en el **SQL Editor** de Supabase:

```sql
alter table bitbros_players
  add column if not exists game_overs integer not null default 0;
```

Hasta que exista, el contador funciona igual pero **solo en localStorage** (no
se sincroniza entre dispositivos); el guardado de nivel nunca se ve afectado
porque el `game_overs` se escribe en un request aparte. El valor solo se
muestra en la pantalla de la Batcomputadora (estado `computer`).
