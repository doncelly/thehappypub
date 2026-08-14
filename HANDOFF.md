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
- **Paso 14** — Checklist de "Alistamiento" reestructurado en 5 sub-secciones
  (1.1 a 1.5, ver punto 12 de "Qué falta"), con manejo de error real (toast +
  revertir estado optimista) en las 4 funciones que faltaban
  (`toggleDone`/`toggleItem`/`markAllArea`/`markAllSection` en
  `ChecklistClient.tsx`) — verificado en vivo que ahora sí avisa si el
  guardado falla, en vez de mostrar "Listo" en falso.
- **Paso 15** — Puntualidad en puntos (5/3/0, meta semanal 35, ver punto 14
  de "Qué falta") + aviso no-bloqueante de orden de actividades al llegar
  (apertura de caja → inventario diario, ver punto 11 de "Qué falta").
  Ninguno de los dos requirió cambio de schema — ambos se calculan en vivo
  o leen tablas ya existentes.
- **Paso 16** — Reportes semanales guardados en Storage agrupados por año
  (ver punto 13 de "Qué falta"). Patch 0021 (policies de storage.objects
  para el folder `weekly-reports/`).
- **Paso 17** — Bonificación de ventas en puntos + valor en pesos (ver punto
  15 de "Qué falta"). `computeAutoVentasPuntos` en `bonos.ts`, $1.000/punto,
  "Bono estimado" visible en Agenda/Panel/reporte personal. No requirió
  cambio de schema.
- **Paso 18** — Banner "Así quedó la caja de ayer al cerrar" en Caja (ver
  punto 18 de "Qué falta"). Solo lectura, no cambio de schema.

## Migraciones SQL — MUY IMPORTANTE

`supabase/schema.sql` y `supabase/seed.sql` son la fuente de verdad para
**instalaciones nuevas**. El proyecto Supabase real del usuario se actualiza
con patches incrementales en `supabase/patches/` (0001 a 0021, todos
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
   Patch 0019. **Confirmado 11 ago 2026**: el usuario volvió a pedir que
   esto sea "solo para los administradores" — ya lo es, doblemente: la
   página `/panel` entera exige `requireRole("jefe")` (nadie más puede ni
   cargarla) y la tabla `monthly_goal_settings` tiene su propia policy RLS
   "solo jefe" en `schema.sql`. No hizo falta cambio de código.
4. ✅ **"Barriles de repuesto" en Inventario** — hecho. Un item qty-mode por
   cada uno de los 8 barriles reales, mismo patrón que "Botellas de
   repuesto" de insumos_coctel/shots. Dato insertado directo en la base
   real (no necesitó patch, solo `seed.sql` actualizado).
5. **Descartado por el usuario** (dos veces — confirmado de nuevo 11 ago
   2026) — mostrar litros aproximados de un barril. Se queda como qty simple
   (punto 4). El usuario lo había vuelto a pedir el mismo día en un mensaje
   que repitió gran parte del backlog viejo, pero al preguntarle confirmó
   "omite el 5".
6. Panel ya tenía `SummaryCard` con Bajo mínimo / En buen nivel /
   Aprovisionado (%) desde antes — no se tocó, no se pidió más detalle.
7. ✅ **Panel por productos de barra y cocina** — hecho. Nueva sección
   "Barra y Cocina — qué hay" en Panel, dos listas (categorías `barra` y
   `cocina`, no domain completo) con el estado de CADA item, no solo los
   críticos — para saber de un vistazo qué hay en cada área.
8. ✅ **Que un segundo pedido a la misma mesa no aparezca como "pedido
   nuevo"** — hecho, solo visual (el usuario confirmó que no hacía falta
   fusionar a nivel de datos): Vender y Pedidos-cocina agrupan por
   `table_label`, una tarjeta por mesa con los pedidos de esa mesa adentro.
   Cada `orders` row sigue siendo independiente.
9. ✅ **Que el mesero vea lo que agrega antes de registrar el pedido** —
   hecho. Encima del botón "Registrar pedido" ahora se ve el detalle
   itemizado del carrito (cantidad, producto, nota, precio), no solo el
   total y la cuenta de productos que ya mostraba antes.
10. ✅ **Alerta de descuadre si la caja de ayer no cuadra** — hecho. Banner
    rojo en Panel si `|efectivo+tarjetas contado − ventas app| > $1.000`
    (misma tolerancia que ya usaba Caja para su propio indicador inline).
11. ✅ **Forzar orden de actividades al llegar** — hecho, pero como AVISO no
    bloqueante (decidido con el usuario 11 ago 2026, para no arriesgar dejar
    al equipo trabado en vivo si algo falla). En Mi día, después de marcar
    llegada: si falta abrir caja aparece un banner "Actividad 1 de hoy: falta
    abrir la caja" (link a /caja); una vez abierta, si el mesero no marcó
    "Inventario" en el Checklist aparece "Actividad 2 de hoy: falta el
    inventario diario" (link a /checklist). Solo aplica a jefe/mesero (quienes
    abren caja); cocinero no la ve. La 2ª actividad solo la puede completar el
    mesero (Checklist no es accesible para jefe). Nada se bloquea de verdad.
12. ✅ **Checklist de "Alistamiento" reestructurado en sub-secciones** —
    hecho: 1.1 Apertura de caja, 1.2 Inventarios y documentos de sanidad,
    1.3 Organización de espacios, 1.4 Limpieza de cristalería, 1.5 Actividad
    del día, cada una con su propio Listo/foto. Patch 0020. **Pendiente de
    decisión**: 1.2 quedó como sube-foto (igual que las demás) en vez de
    subida de documento/PDF aparte — se asumió que fotografiar el documento
    físico es equivalente práctico a "escanear" para este negocio. Si el
    usuario quiere subida de PDF real, falta ese trabajo aparte.
13. ✅ **Reportes semanales organizados por año** — hecho. Cada vez que el
    jefe genera el PDF semanal en Panel (`generateWeeklyReportPdf` en
    `panel/reports.ts`), además de descargarse se sube a Storage en
    `weekly-reports/{fecha}.pdf` (mismo bucket y patrón que
    `agenda-schedules/`, upsert). Panel tiene una nueva sección "Reportes
    semanales guardados" que lista lo archivado agrupado por año
    (`<details>` colapsable por año), con link firmado a cada PDF. Necesitó
    patch 0021 (faltaban las policies de storage.objects para el folder
    nuevo — sin eso el upload fallaba con 400 por RLS, encontrado y
    corregido en vivo durante esta sesión). El reporte es "últimos 7 días"
    (no semana calendario lunes-domingo), así que la key de archivo es la
    fecha del día en que se generó, no un lunes — si se regenera el mismo
    día, se sobreescribe (comportamiento esperado).
14. ✅ **Cálculo de puntualidad en puntos** — hecho. `computeAutoPuntualidadPuntos`
    en `src/lib/bonos.ts` (reemplazó el booleano `computeAutoPuntualidad`):
    a tiempo o hasta 10 min tarde = 5 pts, 11-15 min = 3 pts, más de 15 min =
    0 pts (la escala tiered ES el "descuento" — no hay resta adicional sobre
    un acumulado). `PUNTUALIDAD_META_SEMANAL = 35`. Se muestra: puntos del día
    en Calificación del equipo (Agenda) + acumulado semanal (lunes-domingo,
    nueva query en `agenda/page.tsx`) contra la meta de 35 junto a cada
    persona; en el PDF semanal de Panel (`panel/reports.ts`) reemplazó
    "puntual X/Y días" por "puntualidad X/35 pts"; en el reporte personal
    (`mi-dia/personal-report.ts`) cada día muestra los puntos ganados +
    acumulado del periodo de 14 días. Ninguno de estos totales se persiste —
    se recalculan en vivo igual que antes, mismo patrón que ventas/puntualidad
    ya tenían.
15. ✅ **Bonificación diaria basada en % de venta adicional → puntos → plata**
    — hecho. `computeAutoVentasPuntos` en `src/lib/bonos.ts` reemplazó el
    booleano `computeAutoVentas` (mismo dato de equipo completo — ventas del
    día vs. meta diaria, no venta atribuida por mesero): no llega a meta =
    0 pts, cumple hasta +10% sobre meta = 5 pts, +10-20% = 8 pts, +20% o más
    = 10 pts. **Valor del punto: $1.000** (`PUNTO_VALOR_PESOS`, decidido con
    el usuario 11 ago 2026 — número conservador, elegido a propósito porque
    es más fácil subirlo después que bajarlo; la parte de puntualidad es el
    único costo "fijo" real, máx. $35.000/persona/semana, ya que la parte de
    ventas solo se paga cuando ya entró venta de más). "Bono estimado"
    (puntualidad + ventas, en pesos) se muestra junto a cada persona en
    Calificación del equipo (Agenda), en el PDF semanal de Panel, y en el
    reporte personal. Es un estimado de referencia — no está conectado a
    ningún proceso real de pago/nómina.
16. **"No encontré en dónde calificar a los meseros"** — SÍ existe:
    Agenda → sección "Calificación del equipo" (`CalificacionesSection.tsx`),
    casi al final de la página. Pero solo muestra gente que ya tiene un
    turno (`shifts`) agregado ESE día — si no se agregó el turno todavía,
    aparece "Agrega turnos primero..." y es fácil pensar que no existe.
    Posible mejora de UX: hacerla más visible o no depender de que el turno
    ya esté cargado.
17. **"Control de bajas en cocina" para cocinera** — el usuario confirmó
    11 ago 2026 que "Pérdidas" (que ya tiene cocinero) y "bajas de comida"
    son conceptos distintos, pero no sabe si deberían unificarse — pidió
    consejo. **Revisado el código de Pérdidas** (`perdidas/PerdidasClient.tsx`):
    ya filtra por dominio (cocinero solo ve items de cocina) y ya tiene
    categoría "Producto" + motivo libre — técnicamente ya cubriría bajas de
    cocina sin construir nada nuevo. **Recomendación dada, sin confirmar
    todavía**: no crear sistema aparte (duplicaría items/RLS/reportes sin
    ganar nada, y fragmentaría el reporte semanal); si acaso, agregar un
    motivo predefinido tipo "se quemó / se cayó / venció" para que la
    cocinera no escriba texto libre cada vez. Falta que el usuario diga si
    quiere ese detalle o lo deja tal cual.
18. ✅ **"Así quedó la caja de ayer al cerrar" visible al abrir hoy** — hecho
    (13 ago 2026). `caja/page.tsx` ahora también consulta el `cash_register`
    del día anterior; si ya tiene `close_time`, `CajaSection.tsx` muestra un
    banner de referencia (responsable, hora, remanente acumulado, base para
    hoy) arriba de "Recibo de caja (apertura)". Solo lectura, no autocompleta
    los campos — el usuario pidió esto porque quien abre caja al día
    siguiente no tenía forma de saber en qué quedó sin revisar el chat/Drive
    aparte. No requirió cambio de schema.
19. **Cervezas artesanales de barril no se pueden vender** — confirmado en
    código (13 ago 2026): los 8 barriles (`barril_gulupa`, `barril_germania`,
    etc.) existen en `items`/Inventario, pero **no hay ningún `menu_items`**
    para cerveza artesanal — no aparecen en Vender, aunque las promos del día
    las mencionan explícitamente ("Cerveza artesanal de barril con 15%
    descuento"). El usuario pide presentaciones vaso (300ml), pinta (500ml) y
    jarra (1.5L). **Preguntar antes de construir**: (a) ¿se vende por sabor
    específico (Amber Ale, Germania, etc. — hasta 24 combinaciones
    sabor×tamaño) o genérico "cerveza artesanal" sin importar cuál barril
    está activo? (b) precio de cada tamaño; (c) ¿debe descontar inventario
    del barril correspondiente al vender? Los barriles son `mode: 'gauge'`
    (completo/tres_cuartos/mitad/un_cuarto/agotado), no cantidad exacta —
    no hay hoy ningún `menu_item` que descuente un item en modo gauge al
    venderse, así que esto último sería trabajo nuevo si lo quieren.
20. **Cierre de caja — sumas para Siigo**: el usuario pide que "se hagan las
    sumas de las facturas y se muestren" porque Siigo pide al cerrar turno:
    base de caja, pagos con tarjetas y **otros medios de pago** (este último
    no existe hoy como campo — solo hay efectivo y tarjetas). Hoy "Pagos en
    tarjetas del día" es un solo número que el mesero ya suma a mano antes de
    escribirlo — mismo patrón que "Compras desde remanente"/"Auxilios de
    transporte" (que sí son ítem por ítem con suma automática) podría
    aplicarse aquí para reducir el margen de error. **Preguntar antes de
    construir**: ¿quieren que tarjetas y "otros medios de pago" sean listas
    de ítems (como Compras) que la app suma sola, o alcanza con agregar
    "otros medios de pago" como un campo más de número único (como ya son
    efectivo/tarjetas)?
21. **Documento "Observaciones APP.docx"** (compartido 13 ago 2026) — son
    capturas del sistema anterior en Excel/Sheets (plantillas de turnos,
    checklist con %, calendario, formato de caja) más una propuesta de 8
    módulos nuevos organizados por rol (ADMINISTRADOR: Resumen, Programación
    semanal, Auditoría, Caja visualizador, Inventario visualizador, Pagos,
    Pedidos a proveedor, Calendario — cada uno con export PDF/CSV). Gran
    parte ya existe bajo otro nombre (Panel≈Resumen, Mi día≈Mi turno,
    Agenda≈Programación, Checklist≈Auditoría de alistamiento, Caja, Perdidas,
    Recibidos≈Pedidos). Lo genuinamente nuevo: exports PDF/CSV por módulo,
    "Módulo de Pagos" (arriendo/servicios/nómina/propinas con comprobante
    adjunto — esto sí es nuevo, no existe), calificación de Auditoría como
    % de cumplimiento (hoy es Listo/Pendiente, no %). **No se tocó código
    todavía** — es demasiado grande para una tanda, necesita su propia
    conversación para decidir qué construir y qué ya está cubierto.

### Notas para retomar

- Pendientes de respuesta del usuario: 17 (motivo predefinido para bajas de
  cocina, sí o no), 19 (sabor/precio/inventario de cerveza artesanal), 20
  (¿ítems sumables o campo único para tarjetas/otros medios de pago?), 21
  (qué construir del documento de observaciones, si algo). Todo lo demás del
  backlog original ya quedó resuelto u omitido a pedido del usuario
  (punto 5).
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
