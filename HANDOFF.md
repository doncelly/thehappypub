# The Happy Pub — Estado del proyecto (para continuar en un chat nuevo)

## Qué es esto

Migración de `happy_pub_inventario.html` (una sola página HTML, sistema real en
producción de un bar en Bogotá) a: **Next.js 16 (App Router) + TypeScript +
Tailwind + Supabase (Postgres/Auth/Realtime/Storage) + Vercel**.

El negocio, los flujos y el catálogo real ya estaban validados en el HTML
original — la migración no rediseña el negocio, solo la arquitectura. Todo el
catálogo real ya está en `supabase/seed.sql`, extraído verbatim del HTML (y
ampliado desde entonces con productos reales nuevos, ver "Progreso" abajo).

**Estado: en producción y en uso real, con el equipo real usándola a diario.**

- Directorio del proyecto: `/Users/natt/Developer/TheHappyPub` (movido desde
  `~/Documents/TheHappyPub` — iCloud Drive sincronizaba esa carpeta y
  revertía `.env.local` a placeholders constantemente; mover el proyecto
  fuera de Documents lo resolvió de raíz).
- Repo: `https://github.com/doncelly/thehappypub.git` (rama `main`, push por
  SSH — la autenticación por token HTTPS nunca funcionó, no vale la pena
  reintentarla).
- Deploy: **Vercel, `https://thehappypub.vercel.app`** — auto-deploy en cada
  push a `main`. Este es el link real que el usuario comparte con su equipo.
- Verificado de punta a punta contra producción real: login, venta de un
  producto real (con descuento de inventario correcto), Caja (apertura +
  cierre), sincronización con Google Sheets real, Pedidos a cocina en vivo,
  Plantilla semanal de Agenda, PDF de horario semanal.

## Cómo seguir en el chat nuevo

Pega este archivo completo como primer mensaje. El asistente debe:
1. Leer `README.md` y este archivo para orientarse.
2. Revisar `supabase/schema.sql` (fuente de verdad del esquema) antes de asumir
   estructura de tablas.
3. Revisar la sección **"Qué falta"** al final — ahí está el backlog real
   pedido por el usuario, con notas de qué ya quedó resuelto y qué necesita
   una decisión de negocio antes de tocar código. Preguntar antes de asumir
   en los puntos marcados como ambiguos.
4. Antes de tocar Bash, confirmar `pwd` es `/Users/natt/Developer/TheHappyPub`
   (el harness a veces resetea el cwd a la ruta vieja de Documents).

## Decisiones de arquitectura clave

- **Auth por PIN real**: cada usuario tiene un `auth.users` con email sintético
  (`{id}@users.thehappypub.internal`) y password aleatoria que nadie ve. El
  login compara el PIN contra `pin_hash` (bcrypt) **server-side**, nunca en
  cliente. Al validar, el servidor genera un magic link (admin API) y lo
  "canjea" (`verifyOtp` con `token_hash` — **nunca mandar `email` junto con
  `token_hash`**, GoTrue lo rechaza) para crear una sesión real de Supabase
  Auth. Ver `src/lib/auth/`. La sesión se refresca en cada request vía
  `src/proxy.ts` (Next.js 16 renombró "middleware" a "proxy" — buscar por ese
  nombre, no por `middleware.ts`, que no existe en este proyecto).
- **Bloqueo por intentos fallidos de PIN**: 5 intentos → bloqueo 5 min
  (`users.failed_pin_attempts`, `locked_until`).
- **RLS por dominio de rol**: `mesero` solo ve/escribe categorías de inventario
  con `domain='mesas'`, `cocinero` solo `domain='cocina'`, `jefe` ve todo. Vía
  funciones `current_user_role()`, `is_jefe()`, `user_domain()` (SECURITY
  DEFINER, evitan RLS recursivo).
- **`pin_hash` nunca viaja al cliente**: RLS por sí sola no basta (controla
  filas, no columnas) — hay `REVOKE ALL` + `GRANT SELECT` de columnas
  específicas en `users` (sección 16 de `schema.sql`).
- **Operaciones dinero/inventario → funciones RPC atómicas**: `register_order`,
  `void_order`, `register_delivery`, `mark_purchase_order_received`,
  `register_loss`, `ack_order_kitchen` (cocina marca pedido recibido). Todas
  SECURITY DEFINER, todas repiten el chequeo de dominio/propiedad manualmente
  porque bypasean RLS.
- **Zona horaria — Bogotá, no UTC**: Vercel corre los Server Components en
  UTC; Bogotá es UTC-5 fijo (Colombia no tiene horario de verano). Sin
  ajustar esto, "hoy" cambiaba a las 7pm hora Bogotá (medianoche UTC) — ver
  error real #15 abajo. `src/lib/format.ts` tiene `todayISO()` (hoy en
  Bogotá), `bogotaDayRangeUTC(date)` (rango UTC real de un día de Bogotá,
  para filtrar `created_at` con `.gte()/.lte()`) y `bogotaDateOf(ts)` (a qué
  día de Bogotá pertenece un timestamp UTC, para agrupar ventas por día).
  **Cualquier código nuevo que filtre o agrupe por fecha una columna
  timestamptz (orders.created_at, etc.) DEBE usar estos helpers**, nunca
  `${date}T00:00:00`/`T23:59:59` a secas ni `ts.slice(0, 10)`.
- **Triggers en `item_status`**: `set_item_status_audit`, `set_stock_history`,
  `log_item_status_activity`.
- **`activity_log`**: nadie puede insertar directo — solo triggers SECURITY
  DEFINER. Lectura solo-jefe.
- **`attendance.work_type`**: un jefe puede cubrir turno de **mesero** y de
  **administración** el mismo día — cada uno con su propia tarifa. Unique
  constraint es `(user_id, date, work_type)`, no `(user_id, date)`.
- **Tarifa de mesero — 2 franjas separadas a medianoche** (antes 3 franjas a
  11pm/1am): `hourly_rates.mesero_antes_medianoche`/`mesero_despues_medianoche`.
  `shiftEarnings()`/`splitShiftMinutes()` en `src/lib/earnings.ts` recalculan
  SIEMPRE en vivo a partir de `attendance` + la tarifa ACTUAL — no hay
  snapshot histórico por turno, así que cambiar `hourly_rates` cambia
  retroactivamente cómo se ve el pago de turnos viejos también (es el mismo
  comportamiento de siempre, no algo nuevo de este cambio).
- **Regla de pureza de React 19 / eslint-hooks**: `Date.now()` / `new Date()`
  sin argumentos / `crypto.randomUUID()` sueltos en el cuerpo de un componente
  los marca como error. Envolver en una función con nombre en un módulo
  aparte, o `useNowTick()` (`lib/hooks/use-now-tick.ts`) si se necesita
  reactivo en cliente.
- **Formateo de fecha/hora sin `toLocaleDateString`/`toLocaleString`**: rompe
  hidratación entre servidor y navegador. Todo el formateo es manual
  (`lib/format.ts`).
- **PostgREST embeds anidados son frágiles**: se resuelven nombres vía
  `usersById` aparte, no embeds de dos niveles.
- **Flexbox: un div `flex flex-wrap` con texto suelto como hijo NO se
  encoge** (min-width:auto en flex items) — si un contenedor flex tiene texto
  no controlado al lado de botones de ancho fijo, **apilar en dos filas**
  (texto arriba, botones/valor abajo) en vez de pelear con `min-w-0`. Pasó
  tres veces: Personal → Equipo, Caja → filas de Compras/Auxilios.
- **`<input type="time">`/`type="date"` en iOS Safari ignora el `width` del
  CSS** — se renderiza a su ancho "nativo del sistema" sin importar la caja
  que le des, saliéndose del contenedor aunque ya esté solo en su propia
  fila. Fix: `appearance-none` en el input (quita el estilo nativo de Safari
  sin quitar el selector de hora/fecha al tocar el campo) + `overflow-hidden`
  en el contenedor como respaldo visual. Ver error real #14 abajo — esto NO
  es lo mismo que el bug de flexbox de arriba, son dos causas distintas del
  mismo síntoma ("se sale del recuadro en el celular").
- **Plantilla semanal de Agenda** (`weekday_templates`,
  `shift_schedule_templates`, `default_weekday_tasks.transport_aid`): valores
  por defecto de "Operación del día" y horario de turnos por día de semana
  (0=domingo…6=sábado). Si el día no tiene `agenda_days` guardado aún, el
  formulario de Agenda arranca prellenado con la plantilla (no hay botón
  "aplicar" — es automático vía el `useState` inicial, con `key={date}` en
  `AgendaClient` para que se reinicie bien al cambiar de fecha). La persona
  que cubre cada slot NO se guarda en la plantilla (rota semana a semana) —
  solo un `default_person` sugerido, editable, que se usa como sugerencia al
  elegir el slot en "Agregar turno". Editable en Agenda → sección "Plantilla
  semanal", al final de la página.
- **PDF de horario semanal** (`src/app/(staff)/agenda/schedule-pdf.ts`):
  genera un PDF con los turnos REALES ya asignados esa semana (no la
  plantilla) + ventas/cumplimiento de meta por día (solo hasta hoy), como
  tabla real (no solo texto). Se sube a Storage
  (`agenda-schedules/{monday}.pdf`, bucket `happy-pub-photos`, upsert) y
  jefe/mesero/cocinero lo pueden descargar desde Mi día vía URL firmada. Solo
  jefe puede generarlo (botón en Agenda).
- **Pedidos a cocina en vivo** (`src/app/(staff)/pedidos/`): reemplaza la
  comanda de papel. Cuando un mesero registra un pedido en Vender, aparece al
  instante (Realtime) en la pestaña "Pedidos" de jefe/cocinero, con sonido de
  alerta (Web Audio API sintetizado, no un archivo de audio — necesita un tap
  del usuario para "activar sonido" primero, los navegadores bloquean audio
  sin gesto). `orders.kitchen_ack_at`/`kitchen_ack_by` + RPC
  `ack_order_kitchen` para marcar recibido.

## Progreso — Pasos completados

- **Paso 1** — Estructura Next.js, paleta/logo/fuente real.
- **Paso 2** — `supabase/schema.sql` + `supabase/seed.sql` (catálogo real).
- **Paso 3** — Auth completo.
- **Paso 4** — Todos los módulos de navegación migrados, con Realtime.
- **Paso 5** — Reportes PDF (semanal y personal) con diseño de marca.
- **Paso 6** — Sincronización con Google Sheets.
- **Paso 7** — Deploy público (GitHub + Vercel).
- **Paso 8** — Revisión completa de responsive/mobile (ver errores #12-14).
- **Paso 9** — Buscador de productos en Vender (por nombre, ignora
  tildes/mayúsculas, across todas las categorías).
- **Paso 10** — Catálogo ampliado con productos reales nuevos: Corona/Andina
  Light/Heineken ahora con lata Y botella (antes solo tenían una
  presentación, y en el caso de Andina Light/Heineken la que existía en
  realidad era la lata aunque el nombre no lo decía), Corona Cero (lata y
  botella, no existía), Poker (lata). Mismo precio de venta entre
  presentaciones de un mismo producto, confirmado con el usuario.
- **Paso 11** — Pantalla "Pedidos" para cocina en vivo (ver arriba).
- **Paso 12** — Bug de zona horaria corregido de raíz (ver error real #15) —
  afectaba Vender, Panel, Caja, Agenda, Mi día, reportes de ventas/comisiones
  y la sync con Sheets.
- **Paso 13** — Plantilla semanal de Agenda + PDF de horario semanal
  descargable para todo el equipo (ver arriba).

## Migraciones SQL — MUY IMPORTANTE

`supabase/schema.sql` y `supabase/seed.sql` son la fuente de verdad para
**instalaciones nuevas**. El proyecto Supabase real del usuario se actualiza
con patches incrementales en `supabase/patches/` (0001 a 0017, todos
idempotentes — ver error real #16 sobre qué tan en serio hay que tomarse
"idempotente"). Archivo combinado:

```
supabase/patches/CATCHUP.sql
```

**Este archivo SIEMPRE se llama `CATCHUP.sql`** (nombre fijo — antes se
llamaba `CATCHUP_0001_00NN.sql` y se renombraba con cada patch nuevo, lo que
en GitHub aparecía como "movido/eliminado" y confundía al usuario, ver error
real #17). Instrucción estándar: "corre este archivo si tienes dudas de qué
patches te faltan". **Cualquier cambio de schema nuevo debe reflejarse tanto
en `schema.sql` como en un patch numerado nuevo**, y regenerar
`CATCHUP.sql` (mismo nombre, contenido nuevo) concatenando todos los patches
en orden.

⚠️ **Al escribir un patch nuevo que hace `insert`**: si la tabla no tiene una
key natural para `on conflict`, agregar la restricción única **dentro del
mismo patch** (con un `do $$ ... if not exists ... $$` sobre `pg_constraint`,
no asumir que un patch posterior la va a agregar) y usar
`on conflict (...) do nothing`. Motivo real: el patch 0013 insertaba sin
protección, un patch posterior (0016) le agregó la restricción única para
arreglar duplicados ya existentes — pero como el INSERT de 0013 seguía sin
`on conflict`, la próxima vez que alguien corrió el CATCHUP completo desde
cero, el INSERT de 0013 chocó contra la restricción y **abortó toda la
transacción**, incluyendo los patches que venían después en el mismo
archivo (0017). Ver error real #16.

## Errores reales que costó resolver (para no repetirlos)

1. **Borré `.env.local` del usuario por accidente** probando builds sin
   credenciales. Arreglado: nunca tocar `.env.local`.
2. **Credenciales reales pegadas en `.env.local.example`** (sí va a git) —
   revisar explícitamente antes de cualquier commit/push.
3. **Patches no idempotentes** causaron que el usuario reportara el mismo
   error más de una vez.
4. **`verifyOtp` con `token_hash` + `email` a la vez** → GoTrue lo rechaza.
5. **Vulnerabilidades de dependencias**: correr `npm audit` tras instalar algo.
6. **RPCs que hacen INSERT-luego-UPDATE en la misma transacción** necesitan
   que el cliente escuche tanto `INSERT` como `UPDATE` por `postgres_changes`.
7. **Autenticación por GitHub PAT nunca funcionó** — se usó SSH key.
8. **Un PAT de GitHub real fue pegado en el chat por el usuario** — nunca se
   usó, se le dijo que lo revocara.
9. **iCloud Drive revertía `.env.local`** — se movió el proyecto fuera de
   `~/Documents`.
10. **Google Sheets API rechaza archivos `.xlsx`** — hubo que convertir a
    Google Sheets nativo, lo que cambió el spreadsheet ID.
11. **Prueba en vivo pisó datos reales de Sheets** — lección: fechas
    claramente ficticias para cualquier prueba, nunca la fecha real.
12. **`mcp__Claude_Browser__computer` es poco confiable** — usar
    `javascript_tool` cuando el click directo falla dos veces seguidas.
13. **"No se guarda en el excel al cerrar caja"** era realmente errores de
    Supabase silenciados sin toast — arreglado revisando `{error}` en cada
    guardado de Caja.
14. **Overflow de inputs en mobile — TRES causas distintas del mismo
    síntoma**: (a) `min-w-0` faltante en contenedores flex (primera ronda);
    (b) texto suelto en flex-wrap que no se encoge, ej. Personal → Equipo,
    Caja → filas de Compras/Auxilios (segunda y tercera ronda, ver nota de
    flexbox arriba); (c) `<input type="time">`/`type="date"` en iOS Safari
    ignora el width del CSS por completo — ninguna de las dos primeras
    causas lo arregla, hace falta `appearance-none` (ver nota arriba).
    Verificar SIEMPRE en un dispositivo/viewport real (375px) después de
    "arreglarlo" — las tres rondas pasaron porque el fix anterior no era la
    causa real, solo una causa parecida.
15. **Bug de zona horaria: pedidos "desaparecían" después de las 7pm** — el
    servidor calcula "hoy" en UTC; medianoche UTC son las 7pm en Bogotá.
    Cualquier pedido registrado después de esa hora quedaba fechado "mañana"
    en `created_at`. Al recargar Vender (o cualquier vista con filtro "de
    hoy"), la consulta ya no incluía los pedidos de temprano en la noche —
    parecían borrados, aunque seguían intactos en la base (confirmado
    revisando `activity_log`: ningún pedido real fue anulado). Afectaba TODA
    la app (Vender, Panel, Caja, Agenda, Mi día, reportes, sync con Sheets).
    Se corrigió en la raíz (`lib/format.ts`, ver "Decisiones de
    arquitectura"), no parche por parche. Lección: cualquier bug de "algo
    desapareció"/"algo no cuadra" cerca de la noche, sospechar de zona
    horaria primero.
16. **Patch no idempotente + CATCHUP como una sola transacción = patches
    posteriores silenciosamente no aplicados**: ver la nota en "Migraciones
    SQL" arriba. Lección clave: si un patch falla a mitad del CATCHUP, TODO
    lo que viene después en el mismo archivo también falla (rollback de
    transacción), aunque el error solo mencione el patch que falló. Después
    de cualquier fix a un patch, hay que verificar en vivo (cuenta de prueba
    real, no solo la service role key que bypasea RLS) que el problema
    ORIGINAL de verdad se resolvió, no asumir que arreglar el error visible
    fue suficiente.
17. **Renombrar el archivo CATCHUP combinado con cada patch nuevo confundía
    al usuario** ("me sale eliminado" en GitHub) — se resolvió dándole un
    nombre fijo (`CATCHUP.sql`) que nunca cambia, solo su contenido.

## Qué falta — backlog real pedido por el usuario (11 ago 2026)

El usuario mandó esta lista completa en un solo mensaje. Algunas cosas YA
quedaron resueltas en esta misma sesión (marcadas ✅); el resto necesita
trabajo nuevo. Varias implican decisiones de negocio reales — **preguntar
antes de asumir**, no inventar reglas.

1. ✅ **"Desaparecieron pedidos..."** — era el bug de zona horaria (#15
   arriba), ya corregido en la raíz.
2. ✅ **Plantilla semanal para Agenda** (días normales vs. excepción) — ya
   construida (ver "Decisiones de arquitectura"). El usuario después pidió
   que el prellenado fuera automático sin botón — también hecho.
3. ✅ **Meta mensual mínimo $19.000.000** — hecho. `monthly_goal_settings`
   (singleton, solo-jefe), editable en Panel junto a la meta diaria/semanal.
   Patch 0019.
4. ✅ **"Barriles de repuesto" en Inventario** — hecho. Un item qty-mode por
   cada uno de los 8 barriles reales, mismo patrón que "Botellas de
   repuesto" de insumos_coctel/shots. Dato insertado directo en la base
   real (no necesitó patch, solo `seed.sql` actualizado).
5. **Descartado por el usuario** — mostrar litros aproximados de un barril.
   Se dejó como qty simple (punto 4) en vez de esto.
6. **Panel: total de productos con % de lo que hay vs. falta** — Panel ya
   tiene `SummaryCard` con Bajo mínimo / En buen nivel / Aprovisionado (%) —
   revisar si esto ya cubre el pedido o si quieren algo más granular.
7. **Panel por productos de barra y cocina** (para saber qué hay en cada
   área) — nuevo, filtrar Panel/Inventario por domain.
8. ✅ **Que un segundo pedido a la misma mesa no aparezca como "pedido
   nuevo"** — hecho, solo visual (el usuario confirmó que no hacía falta
   fusionar a nivel de datos): Vender y Pedidos-cocina agrupan por
   `table_label`, una tarjeta por mesa con los pedidos de esa mesa adentro.
   Cada `orders` row sigue siendo independiente.
9. **Que el mesero vea lo que agrega antes de registrar el pedido** — Vender
   ya muestra un carrito (cantidad + total) pegado abajo; falta una vista de
   detalle/confirmación itemizada antes de "Registrar pedido".
10. ✅ **Alerta de descuadre si la caja de ayer no cuadra** — hecho. Banner
    rojo en Panel si `|efectivo+tarjetas contado − ventas app| > $1.000`
    (misma tolerancia que ya usaba Caja para su propio indicador inline).
11. **Forzar orden de actividades al llegar**: 1° apertura de caja, luego
    inventario diario, con una "2da actividad" definida — nuevo, es una
    restricción de flujo (no dejar hacer X sin haber hecho Y primero). Muy
    ligado al punto 12 (checklist de alistamiento reestructurado) — probable
    que se resuelvan juntos.
12. **Checklist de "Alistamiento" reestructurado en sub-secciones**:
    1.1 Apertura de caja, 1.2 Inventarios y documentos de sanidad (escanear
    y subir), 1.3 Organización de espacios, 1.4 Limpieza de cristalería,
    1.5 Actividad del día. Hoy "Alistamiento" en Checklist es un solo
    toggle Listo/foto — esto lo expande a una checklist real de 5 partes,
    con subida de documentos (no solo fotos) en 1.2. Afecta
    `checklist_entries`/`checklist_photos` y `ChecklistClient.tsx`.
13. **Reportes semanales organizados por año** — hoy el PDF semanal se
    genera bajo demanda para la semana actual/últimos 7 días, no se guarda
    un archivo. Falta: ¿se debe guardar cada semana generada en Storage
    (como ya se hace con el horario) para poder verlas después agrupadas
    por año?
14. **Revisar cálculo de puntualidad**: el usuario da la regla exacta —
    llega a tiempo o dentro de los primeros 10 min → 5 puntos; 11-15 min →
    3 puntos; después → 0 puntos y se van descontando puntos por tardanza;
    meta semanal para bonificación = 35 puntos. Comparar contra
    `computeAutoPuntualidad` en `src/lib/bonos.ts` (hoy es un booleano
    true/false/null, no un sistema de puntos) — probablemente hay que
    rediseñar esa función y cómo se acumula/muestra el puntaje semanal.
15. **Bonificación diaria basada en % de venta adicional → puntos → plata**:
    "sacar el porcentaje de lo que se ganó adicional para dar los puntos,
    puntos equivalente a plata". Revisar `computeAutoVentas` en
    `src/lib/bonos.ts` y cómo se paga hoy la bonificación (`bonuses` table)
    — falta la tabla de conversión exacta puntos↔pesos.
16. **"No encontré en dónde calificar a los meseros"** — SÍ existe:
    Agenda → sección "Calificación del equipo" (`CalificacionesSection.tsx`),
    casi al final de la página. Pero solo muestra gente que ya tiene un
    turno (`shifts`) agregado ESE día — si no se agregó el turno todavía,
    aparece "Agrega turnos primero..." y es fácil pensar que no existe.
    Posible mejora de UX: hacerla más visible o no depender de que el turno
    ya esté cargado.
17. **"Control de bajas en cocina" para cocinera** — `cocinero` ya tiene
    acceso a "Pérdidas" en el nav (`lib/nav.ts`) para reportar bajas/mermas.
    Confirmar con el usuario si esto ya cubre el pedido o si "control de
    bajas" es un concepto distinto (ej. un registro específico de
    desperdicio de cocina separado de Pérdidas general).

### Notas para retomar

- Los puntos 3, 4, 5, 8, 10, 11, 12, 13, 14, 15, 17 necesitan al menos una
  pregunta de negocio antes de implementar — no asumir números, nombres de
  items, ni reglas de cálculo.
- Los puntos 6, 9, 16 se pueden resolver revisando/mejorando lo que ya
  existe, sin necesitar tanta info nueva del usuario.
- Dado el volumen, conviene ir en tandas chicas y confirmar con el usuario
  antes de construir cada una, no todo de una vez.

## Estructura del proyecto (resumen)

```
supabase/
  schema.sql          fuente de verdad del esquema (instalaciones nuevas)
  seed.sql            catálogo real completo
  patches/0001-0017   incrementales (idempotentes)
  patches/CATCHUP.sql los patches combinados — NOMBRE FIJO, no renombrar

src/app/(staff)/       todas las vistas autenticadas, layout compartido
                       con who-bar + nav por rol (src/lib/nav.ts)
  agenda/              Operación del día, Turnos, Asistencia, Calificación
                       del equipo, Plantilla semanal, PDF de horario
  pedidos/             Pantalla de pedidos en vivo para cocina (jefe+cocinero)
src/app/api/           Route Handlers con service role (auth, users, drive)
src/app/login/         login por PIN + alta del primer jefe
src/app/rate/[userId]/ calificación de servicio pública (QR, sin login)
src/proxy.ts           refresca la sesión de Supabase en cada request
                       (Next.js 16 renombró "middleware" a esto)

src/lib/auth/          hashing PIN, sesión, current-user (requireUser/requireRole)
src/lib/supabase/      client.ts (browser), server.ts (SSR), admin.ts (service role)
src/lib/format.ts      fecha/hora/moneda + helpers de zona horaria Bogotá
                       (todayISO, bogotaDayRangeUTC, bogotaDateOf) — ver arriba
src/lib/earnings.ts    shiftEarnings() puro
src/lib/bonos.ts       computeAutoVentas/computeAutoPuntualidad (revisar #14/#15)
src/lib/inventory-status.ts   normalizeStatus/isCriticalItem
src/lib/hooks/use-now-tick.ts hook de reloj seguro para la regla de pureza
src/lib/google-auth.ts        access token de la cuenta de servicio de Google
src/lib/google-sheets.ts      sync de la hoja de cierres de caja (REST directo)
src/lib/pdf.ts                helper compartido para reportes PDF (jsPDF, con marca)

src/components/panel-ui.tsx   Section/Row/EmptyState/FieldLabel/MiniButton compartidos
src/components/Logo.tsx       logo real con next/image

.claude/launch.json    config del preview del browser tool (npm run dev, puerto 3000)
```

## Convenciones de trabajo con este usuario

- Español, tono directo, respuestas cortas con lo esencial. El usuario escribe
  rápido y a veces con typos/mensajes garabateados — confirmar la intención
  antes de implementar si el mensaje es ambiguo, en vez de adivinar.
- Después de CADA cambio de código: `npm run build` y `npm run lint`, ambos
  deben quedar limpios antes de reportar terminado.
- Cualquier cambio de schema → `schema.sql` actualizado + patch numerado
  nuevo (idempotente de verdad, ver error real #16) + regenerar
  `CATCHUP.sql` + avisar al usuario que lo corra.
- No inventar datos ni lógica de negocio — preguntar antes de asumir. El
  backlog de "Qué falta" tiene varios puntos así, marcados explícitamente.
- El usuario ha compartido archivos reales (CSV de horarios, capturas de
  pantalla de la app real en su celular) — cuando dé una fuente real, usarla
  tal cual, no re-derivar de memoria.
- **Nunca probar contra datos/fechas reales de operación** — usar fechas o
  cuentas claramente ficticias, y limpiar después. Patrón establecido: crear
  un usuario temporal (rol jefe, PIN conocido) vía API admin de Supabase,
  probar, y **borrarlo al terminar** (`DELETE` en `users` + `DELETE` en
  `auth.users` vía API admin, en ese orden, más limpiar cualquier fila que el
  test haya creado en otras tablas por FK).
- Antes de dar por buena una corrección de un patch/RLS, **verificar en vivo
  con una cuenta real** (no solo la service role key, que bypasea RLS) — ver
  error real #16.
- El uso real de la app es mayormente desde celular (WhatsApp browser /
  Safari/Chrome móvil) — cualquier cambio de UI debe verificarse en viewport
  375px además de desktop, no solo desktop.
