# The Happy Pub — Estado del proyecto (para continuar en un chat nuevo)

## Qué es esto

Migración de `happy_pub_inventario.html` (una sola página HTML, sistema real en
producción de un bar en Bogotá) a: **Next.js 16 (App Router) + TypeScript +
Tailwind + Supabase (Postgres/Auth/Realtime/Storage) + Vercel**.

El negocio, los flujos y el catálogo real (171 items de inventario, 76
productos de menú, 85 líneas de receta) ya estaban validados en el HTML
original — la migración no rediseña el negocio, solo la arquitectura. Todo el
catálogo real ya está en `supabase/seed.sql`, extraído verbatim del HTML.

Directorio del proyecto: `/Users/natt/Documents/TheHappyPub`
No es repo de GitHub remoto (solo git local, sin commits).

## Cómo seguir en el chat nuevo

Pega este archivo completo como primer mensaje. El asistente debe:
1. Leer `README.md` y este archivo para orientarse.
2. Revisar `supabase/schema.sql` (fuente de verdad del esquema) antes de asumir
   estructura de tablas.
3. Preguntar al usuario qué sigue (ver "Qué falta" al final) en vez de asumir.

## Decisiones de arquitectura clave

- **Auth por PIN real**: cada usuario tiene un `auth.users` con email sintético
  (`{id}@users.thehappypub.internal`) y password aleatoria que nadie ve. El
  login compara el PIN contra `pin_hash` (bcrypt) **server-side**, nunca en
  cliente. Al validar, el servidor genera un magic link (admin API) y lo
  "canjea" (`verifyOtp` con `token_hash` — **nunca mandar `email` junto con
  `token_hash`**, GoTrue lo rechaza) para crear una sesión real de Supabase
  Auth. Ver `src/lib/auth/`.
- **Bloqueo por intentos fallidos de PIN**: 5 intentos → bloqueo 5 min
  (`users.failed_pin_attempts`, `locked_until`). El original no tenía esto
  (comparaba en cliente); un PIN de 4 dígitos sin límite es fuerza-bruteable en
  segundos una vez es un endpoint real.
- **RLS por dominio de rol**: `mesero` solo ve/escribe categorías de inventario
  con `domain='mesas'`, `cocinero` solo `domain='cocina'`, `jefe` ve todo. Vía
  funciones `current_user_role()`, `is_jefe()`, `user_domain()` (SECURITY
  DEFINER, evitan RLS recursivo).
- **`pin_hash` nunca viajero al cliente**: RLS por sí sola no basta (controla
  filas, no columnas) — hay `REVOKE ALL` + `GRANT SELECT` de columnas
  específicas en `users` (sección 16 de `schema.sql`).
- **Operaciones dinero/inventario → funciones RPC atómicas** (no múltiples
  writes secuenciales desde el cliente, que no son transaccionales): 
  `register_order` (Vender: crea pedido + descuenta inventario + libera mesa +
  activity_log), `void_order` (Vender: anula un pedido mal registrado —
  reverso exacto de `register_order`, restaura el inventario según la receta;
  jefe anula cualquiera, mesero solo los suyos, sin límite de tiempo),
  `register_delivery` y `mark_purchase_order_received` (Recibidos),
  `register_loss` (Pérdidas). Todas SECURITY DEFINER, todas repiten el chequeo
  de dominio/propiedad manualmente porque bypasean RLS.
- **Triggers en `item_status`**: `set_item_status_audit` (pone `updated_by`/
  `updated_at` server-side, el cliente nunca los manda), `set_stock_history`
  (upsert automático a `stock_history` en cada cambio de qty — el original
  repetía esto en 4 sitios distintos del cliente), `log_item_status_activity`
  (alimenta el feed de actividad).
- **`activity_log`**: nuevo respecto al original (que usaba `pushActivity` en
  un array del blob JSON). Nadie puede insertar directo — solo triggers
  SECURITY DEFINER. Lectura solo-jefe.
- **`attendance.work_type`**: extensión NUEVA (pedida por el usuario, no
  estaba en el original). Un jefe puede cubrir turno de **mesero** y de
  **administración** el mismo día — cada uno con su propia tarifa
  (`hourly_rates.administracion_flat`, que el usuario debe configurar en
  Personal, quedó en $0 por defecto). Unique constraint es
  `(user_id, date, work_type)`, no `(user_id, date)`. Mesero/cocinero tienen
  `work_type` fijo = su subrol; jefe elige en Mi día. Geocerca automática
  **solo** para mesero/cocinero (para jefe es ambiguo qué turno detectar).
- **Regla de pureza de React 19 / eslint-hooks**: `Date.now()` / `new Date()`
  sin argumentos / `crypto.randomUUID()` sueltos en el cuerpo de un componente
  (server o cliente, incluso dentro de funciones anidadas como handlers) los
  marca como error. Patrón usado en todo el código: envolver en una función
  con nombre en un módulo aparte (`lib/format.ts`: `minutesAgoISO()`,
  `lastNDays()`; `lib/new-id.ts`: `newId()`) o, si el valor se necesita
  reactivo en el cliente, un hook `useNowTick()` (`lib/hooks/use-now-tick.ts`)
  que lo mete a un estado vía `useEffect`+`setTimeout(fn,0)`+`setInterval`
  (nunca `setState` síncrono directo en el cuerpo del efecto, esa es OTRA
  regla que también rompe el lint).
- **Formateo de fecha/hora sin `toLocaleDateString`/`toLocaleString`**: esas
  dependen de los datos ICU del entorno (Node servidor vs. navegador) y
  pueden diferir en detalles ("ago." vs "ago", "p.m." vs "p. m.") — eso rompe
  la hidratación de Server Components. Todo el formateo es manual con arrays
  de meses/días en español (`lib/format.ts`).
- **PostgREST embeds anidados son frágiles**: se abandonó el patrón
  `items → item_status → users` (doble anidado) porque causaba que items
  completos desaparecieran de los resultados sin error visible. Patrón actual:
  fetch `usersById` aparte y resolver nombres en el cliente/servidor a mano.
  `normalizeStatus()` en `lib/inventory-status.ts` además normaliza
  defensivamente por si PostgREST devuelve el embed como objeto o como array.

## Progreso — Pasos completados

- **Paso 1** — Estructura Next.js (App Router, TS, Tailwind). Paleta real
  (navy `#30418A`, gold `#C68D17`) en `tailwind.config.ts`. Logo real
  (`public/brand/logo.png`, con canal alpha) y fuente real (Cheddar Gothic
  Serif, `public/fonts/CheddarGothicSerif.ttf`) ya instalados, componente
  `<Logo>` reutilizable.
- **Paso 2** — `supabase/schema.sql` (todas las tablas + RLS) y
  `supabase/seed.sql` (catálogo real completo). Ejecutado por el usuario.
- **Paso 3** — Auth completo (ver arriba).
- **Paso 4** — **Todos los módulos de navegación migrados**: Inventario,
  Panel, Agenda, Caja (pestaña propia, jefe+mesero), Vender, Checklist
  (desplegable por área con ítems reales del documento "Check List Sala
  Terraza Apertura Cierre"), Mi día, Recibidos, Pérdidas, Vencimientos,
  Galería, Personal. Todos con Realtime donde aplica (item_status, orders,
  attendance, table_locks, activity_log).
- **Reportes** — PDF semanal (Panel, jefe), PDF personal (Mi día, cualquier
  rol), CSV de cierres de caja (Panel), y **subida del CSV a Google Drive**
  (botón nuevo, vía cuenta de servicio — código listo, configuración pendiente
  del lado del usuario, ver `GOOGLE_DRIVE_SETUP.md`).

## Migraciones SQL — MUY IMPORTANTE

`supabase/schema.sql` y `supabase/seed.sql` son la fuente de verdad para
**instalaciones nuevas**. El usuario ya tiene un proyecto Supabase corriendo
que se fue actualizando con patches incrementales en `supabase/patches/`
(0001 a 0011). **Todos los patches ya son idempotentes** (seguros de correr
más de una vez — cada uno revisa si ya existe antes de crear). Hay un archivo
combinado:

```
supabase/patches/CATCHUP_0001_0011.sql
```

que junta los 10 en uno solo — instrucción estándar para el usuario: "corre
este archivo si tienes dudas de qué patches te faltan". **Cualquier cambio de
schema nuevo que se agregue de acá en adelante debe reflejarse tanto en
`schema.sql` (para instalaciones nuevas) como en un patch numerado nuevo
(0011, etc.) que también debe agregarse al CATCHUP combinado o mencionarse
aparte** — el usuario se ha confundido varias veces con patches sueltos, así
que conviene ser explícito y ofrecer recrear el CATCHUP combinado cuando se
agregue un patch nuevo.

## Errores reales que costó resolver (para no repetirlos)

1. **Borré `.env.local` del usuario por accidente** dos veces, corriendo
   `cp .env.local.example .env.local && npm run build && rm .env.local` para
   probar builds sin credenciales reales. Arreglado: **nunca tocar
   `.env.local`** — si hace falta compilar sin credenciales, pasar env vars
   inline al comando (`VAR=x npm run build`), nunca crear/borrar el archivo
   real.
2. **El usuario pegó credenciales reales en `.env.local.example`** (el
   template, no gitignorado) **tres veces** en la conversación — cada vez hubo
   que mover los valores a `.env.local` (sí gitignorado) y restaurar el
   `.example` a placeholders. Vale la pena recordarle al usuario la diferencia
   entre los dos archivos si vuelve a pasar.
3. **Verificación de patches**: el usuario reportó el mismo error
   (`activity_log` no existe, `attendance.work_type` no existe) más de una vez
   porque los patches no eran idempotentes y algunos corrieron a medias. Ya
   resuelto (ver arriba), pero conviene confirmar explícitamente con el
   usuario que corrió el CATCHUP y que los errores desaparecieron antes de
   seguir construyendo sobre esas tablas.
4. **`verifyOtp` con `token_hash` + `email` a la vez** → GoTrue lo rechaza
   ("Only the token_hash and type should be provided"). Solo mandar
   `token_hash` + `type`.
5. **Vulnerabilidades de dependencias**: Next.js quedó pineado en 14.2.16
   (vulnerable) al principio — se subió a 16.3.0 + React 19 + codemod
   `middleware.ts`→`proxy.ts`. `jspdf@2.5.2` traía `dompurify` vulnerable →
   subido a `jspdf@4.2.1`. `google-auth-library@9` traía `uuid` vulnerable vía
   `gaxios` → subido a `^11.0.0`. **Siempre correr `npm audit` después de
   instalar una dependencia nueva.**
6. **RPCs que hacen INSERT con un valor placeholder y luego UPDATE en la misma
   transacción (patrón usado en `register_order`: inserta `orders` con
   `total=0`, descuenta inventario, y al final hace `update orders set
   total=...`) necesitan que el cliente escuche tanto `INSERT` como `UPDATE`
   por `postgres_changes`** — si solo se suscribe a `INSERT` (como pasaba en
   `VenderClient.tsx` y `PanelClient.tsx`), la UI en vivo se queda pegada en
   el valor placeholder hasta que alguien recarga la página, aunque la base de
   datos ya tenga el valor correcto. Revisar cualquier otra RPC nueva que siga
   este patrón (insert-luego-update) y agregar el listener de `UPDATE` correspondiente.

## Qué falta (pendiente al momento de este resumen)

1. ✅ **Confirmado con el usuario** — ya corrió `CATCHUP_0001_0010.sql` (ahora
   `CATCHUP_0001_0011.sql` — falta correr el patch 0011 nuevo, ver abajo), sin
   errores de `activity_log`/`attendance.work_type` en consola.
2. **Google Drive → rediseñado por completo a Google Sheets** (el usuario en
   realidad ya lleva los cierres a mano en una hoja de cálculo real —
   "22. Caja Aper-Cierre 2026.xlsx" — con **una pestaña por fecha** (formato
   `DD/MM/YYYY`, ej. "07/08/2026"), no un CSV nuevo cada vez. Se reemplazó
   `src/lib/google-drive.ts` (subía un CSV nuevo a una carpeta en cada clic,
   nunca actualizaba nada) por `src/lib/google-sheets.ts` +
   `src/app/api/drive/sync-caja-sheet/route.ts`: el botón ahora se llama
   **"Actualizar hoja de cierres en Drive"** y escribe directo en la pestaña
   de la fecha (creándola si no existe, duplicando la pestaña plantilla
   `Copia de COPIA BASE` — así es como el jefe la crea a mano). Detalles:
   - Mapeo completo de celdas en `sync-caja-sheet/route.ts` (B7-B28),
     confirmado campo por campo mirando la hoja real del usuario.
   - Las tablas "Detalle de compras desde remanente" y "Detalle de auxilios
     de transporte" (columnas E-G) se ubican **buscando el texto del
     encabezado**, no por número de fila fijo — más resistente si la
     plantilla cambia de alto.
   - **Sin equivalente en la app**, se dejan intactos: "META VENTAS",
     "NUEVOS SEGUIDORES", y toda la sección "SUMA DE FACTURAS
     EFECTIVO/TARJETAS" (desglose factura por factura, más detallado de lo
     que la app registra).
   - La hoja del jefe cruza medianoche (abre un día, cierra al siguiente) pero
     `cash_register` solo tiene una fecha — la fecha de cierre se calcula
     como fecha+1 si `close_time < open_time`, si no, la misma fecha.
   - Nuevo scope de Google (`spreadsheets` en vez de `drive.file`) y nueva env
     var `GOOGLE_CIERRES_SHEET_ID` (reemplaza `GOOGLE_DRIVE_FOLDER_ID`) — ver
     `GOOGLE_DRIVE_SETUP.md`, reescrito de cero para este flujo.
   - ✅ **Verificado en vivo, de punta a punta, contra Google real** (auth,
     detección de la pestaña "07/08/2026" sin duplicarla, ubicación dinámica
     correcta de "Detalle de compras desde remanente" en fila 15 y "Detalle de
     auxilios de transporte" en fila 23, escritura de las 23 celdas). El
     archivo original del usuario era un `.xlsx` en Drive — la API de Sheets
     **no puede escribir sobre archivos Office**, tocó convertirlo a Sheets
     nativo (Archivo → Guardar como Hojas de cálculo de Google), lo que generó
     un `GOOGLE_CIERRES_SHEET_ID` **nuevo** (`1qqh7fPUR...`, no el ID del
     `.xlsx` original) — y ese archivo nuevo hubo que compartirlo de nuevo con
     la cuenta de servicio (los permisos no se heredan al convertir).
   - ✅ **Bug real encontrado y arreglado antes de que el usuario lo viera**:
     el jefe no siempre le pone el cero al día al duplicar la pestaña a mano
     ("6/08/2026" en vez de "06/08/2026") — sin manejarlo, la app habría
     creado una pestaña duplicada en vez de actualizar la existente.
     `ensureDateTab` ahora prueba ambas variantes de nombre antes de crear.
   - ⚠️ **Incidente real durante la prueba**: la verificación se corrió contra
     la fecha de HOY (`2026-08-07`), que ya era la pestaña real en uso del
     usuario con datos reales cargados (no una de prueba) — la escritura de
     prueba sobreescribió una fila real de "Detalle de compras" y las celdas
     de cierre con valores ficticios. El usuario restauró la versión anterior
     desde el historial de versiones de Google Sheets (Archivo → Historial de
     versiones) y confirmó que quedó bien. Los datos de prueba correspondientes
     en Supabase (`cash_register` de esa fecha, filas de
     `cash_register_purchases`/`cash_register_transport_aid`) ya se limpiaron.
     **Lección para la próxima prueba de esta función**: nunca probar contra
     la fecha de hoy real — usar una fecha claramente ficticia.
   - ✅ **`.env.local` real ya tiene las credenciales correctas** — costó dos
     rondas: (1) el usuario había corregido la key en su archivo de respaldo
     `.env.local.txt`, no en `.env.local` real (se copiaron las 3 líneas
     correctas al archivo real); (2) la key copiada en el respaldo le faltaban
     las líneas `-----BEGIN/END PRIVATE KEY-----` (solo tenía el cuerpo en
     base64) — reparada y verificada como RSA PEM válido con
     `crypto.createPrivateKey()`, y la autenticación contra Google confirmada
     de verdad (no solo el formato). Además hubo que habilitar **Google
     Sheets API** (estaba solo Drive API) en Google Cloud.
   - ⚠️ **`.env.local.example` (el archivo que SÍ va a git) tuvo credenciales
     reales filtradas una cuarta vez** (email, key vieja, folder ID) —
     restaurado a placeholders. Recordarle al usuario la diferencia entre
     `.env.local` (real, gitignorado) y `.env.local.example` (plantilla,
     nunca debe tener valores reales) si vuelve a pasar.
   - Servidor de desarrollo reiniciado para recoger las env vars nuevas —
     pendiente que el usuario pruebe el botón real "Actualizar hoja de
     cierres en Drive" desde la app (todo lo demás ya se probó por fuera).
3. **Prueba de punta a punta — en curso, dos bugs reales encontrados y
   arreglados, uno sin verificar por falla de herramienta**:
   - ✅ **Bug de hidratación en Personal** (`PersonalClient.tsx`, `QrCard`):
     `setOrigin(window.location.origin)` se llamaba directo en el cuerpo del
     render en vez de en un `useEffect` — mismatch servidor/cliente en el QR
     de calificación. Arreglado con el patrón `setTimeout(fn, 0)` que ya usa
     `useNowTick`.
   - ✅ **Bug de realtime en Vender y Panel** (`VenderClient.tsx`,
     `PanelClient.tsx`): `register_order` inserta el pedido con `total=0` y lo
     actualiza *después* en la misma transacción — pero el cliente solo
     escuchaba `INSERT` en `orders`, nunca `UPDATE`, así que el mesero veía
     "$0" en el pedido recién registrado hasta recargar. Arreglado agregando
     el listener de `UPDATE` en ambos archivos (confirmado con logout/login:
     el total en base de datos siempre fue correcto, solo la vista en vivo
     estaba mal).
   - ✅ **Verificado manualmente**: abrir caja (apertura persiste), vender 1
     Chori Pan en mesa T1 (inventario de Chorizo/Pan para perro/Papas
     francesas descontó exactamente según la receta: 10→9, 10→9, 500→350),
     `ventasHoy` en Caja mostró correctamente $28.000.
   - ⬜ **Sin verificar**: guardar el cierre de caja (botón "Guardar cierre de
     caja") — a mitad de la prueba el navegador de control (Claude Browser)
     dejó de registrar clics de forma confiable (scrolls con timeout, clics
     que no llegaban al DOM, foco saltando al primer elemento tabulable de la
     página). No parece un bug de la app — el mismo botón sí guardó
     correctamente la apertura minutos antes — pero no se pudo confirmar el
     guardado del cierre. Recomendado: probar manualmente el botón "Guardar
     cierre de caja" con datos reales antes de dar el flujo por cerrado.
   - ⬜ Quedó un dato de prueba sin limpiar en Inventario → Cocina: **"Cebolla
     roja" quedó en 10 g** (debería estar en 0) por la misma falla del
     navegador de control al intentar corregirlo. Ajustar manualmente desde
     Inventario cuando se pueda.
   - Falta aún: generar y revisar el PDF/CSV de reportes.
4. **`npm run supabase:types`** nunca se corrió — `src/lib/types/database.types.ts`
   sigue siendo el placeholder `export type Database = any;`. Todo el código
   usa `SupabaseClient<any>` explícito como workaround. Generar los tipos
   reales sería una mejora de calidad (no urgente, todo compila y funciona).
5. Cosas que el usuario mencionó y quedaron **fuera de alcance a propósito**:
   nada pendiente identificado más allá de lo anterior — todos los módulos del
   nav original están migrados.
6. **Falta correr `supabase/patches/0011_void_order.sql`** (o el CATCHUP
   regenerado `CATCHUP_0001_0011.sql`) en el proyecto Supabase real del
   usuario — agrega la función `void_order` (anular pedido, ver más abajo).
   Sin esto el botón "Anular" en Vender va a fallar con "function
   public.void_order does not exist".
7. ✅ **Anular pedido (Vender)**: el usuario pidió poder borrar un pedido mal
   registrado. Como `register_order` ya descuenta inventario automáticamente,
   un simple `.delete()` habría dejado el stock mal — se creó `void_order`
   (RPC, mismo patrón atómico que `register_order`/`register_loss`): restaura
   `item_status.qty` según la receta del pedido, registra actividad, y borra
   el pedido (`order_items` en cascada). Decisión confirmada con el usuario:
   **jefe puede anular cualquier pedido; mesero solo los que él mismo
   registró; sin límite de tiempo**. Botón "Anular pedido" ya agregado en la
   lista "Pedidos de hoy" de `VenderClient.tsx` (con confirmación antes de
   ejecutar) — falta correr el patch 0011 (punto 6) para que exista la
   función en la base real.
8. ✅ **Fuentes no cargaban en toda la app** (reportado como "se ve extraña la
   plataforma", "botones desalineados", "textos feos" en todas las
   pestañas). Causa real: `globals.css` solo tenía `@font-face` para Cheddar
   Gothic Serif (el logo) — `font-body` (IBM Plex Sans, el texto de TODA la
   página), `font-accent` (Bebas Neue, títulos de sección) y `font-mono`
   nunca se cargaban, así que el navegador caía al sans-serif genérico del
   sistema, con métricas distintas a las que se usó para ajustar
   paddings/alturas de botones y pills — de ahí el desalineado. Arreglado
   cargando las 3 con `next/font/google` en `layout.tsx` (variables CSS
   `--font-body`/`--font-accent`/`--font-mono`) y apuntando `tailwind.config.ts`
   a esas variables en vez de a nombres de fuente que nunca existían.
   Confirmado con `getComputedStyle` en el navegador — antes resolvía a
   sans-serif del sistema, ahora a IBM Plex Sans real.
9. ✅ **Reportes PDF sin diseño de marca**: el usuario pidió logo, colores y
   fuentes reales en los PDFs (antes: texto plano negro, sin logo, un color
   "dorado" que ni siquiera era el gold real de la marca). Reescrito
   `src/lib/pdf.ts` — `createReportDoc(title)` ahora es async, dibuja una
   franja navy con el logo (`/brand/logo.png`) y el título en Cheddar Gothic
   Serif (fuente embebida en el PDF vía `doc.addFileToVFS`/`addFont`, cae a
   Helvetica bold si no carga), repetida en cada página con numeración de
   página, colores de marca reales (`BRAND_NAVY #30418A`, `BRAND_GOLD
   #C68D17`, tomados de `tailwind.config.ts`), y soporte de negrita en
   `line()` para los títulos de sección. Aplicado en `reports.ts` (PDF
   semanal) y `personal-report.ts` (Mi reporte). Sin probar visualmente el
   PDF final generado (requiere login).

## Estructura del proyecto (resumen)

```
supabase/
  schema.sql          fuente de verdad del esquema (instalaciones nuevas)
  seed.sql            catálogo real completo
  patches/0001-0010   incrementales ya aplicados por el usuario (idempotentes)
  patches/0011        void_order — nuevo, falta que el usuario lo corra
  patches/CATCHUP_0001_0011.sql   los 11 combinados en uno

src/app/(staff)/       todas las vistas autenticadas, un layout compartido
                       con who-bar + nav por rol (src/lib/nav.ts)
src/app/api/           Route Handlers con service role (auth, users, drive)
src/app/login/         login por PIN + alta del primer jefe
src/app/rate/[userId]/ calificación de servicio pública (QR, sin login)

src/lib/auth/          hashing PIN, sesión, current-user (requireUser/requireRole)
src/lib/supabase/      client.ts (browser), server.ts (SSR), admin.ts (service role)
src/lib/format.ts      todos los helpers de fecha/hora/moneda (puros, sin Date.now suelto)
src/lib/earnings.ts    shiftEarnings() puro (mesero por franja, cocinero/admin plana)
src/lib/bonos.ts       computeAutoVentas/computeAutoPuntualidad (compartido)
src/lib/inventory-status.ts   normalizeStatus/isCriticalItem (compartido Inventario+Panel)
src/lib/hooks/use-now-tick.ts hook de reloj seguro para la regla de pureza
src/lib/google-auth.ts        access token de la cuenta de servicio de Google (compartido)
src/lib/google-sheets.ts      sync de la hoja de cierres de caja (REST directo, sin SDK de googleapis)
src/lib/pdf.ts                helper compartido para los reportes PDF (jsPDF, con marca)

src/components/panel-ui.tsx   Section/Row/EmptyState/FieldLabel/MiniButton compartidos
src/components/Logo.tsx       logo real con next/image
```

## Convenciones de trabajo con este usuario

- Español, tono directo, respuestas cortas con lo esencial.
- Después de CADA cambio de código: `npm run build` y `npm run lint`, ambos
  deben quedar limpios antes de reportar terminado.
- Cualquier cambio de schema → schema.sql actualizado + patch numerado nuevo +
  avisar al usuario qué patch correr (idealmente ofrecer regenerar el CATCHUP).
- No inventar datos ni lógica de negocio — si algo no está claro en el HTML
  original o en lo que el usuario pide, preguntar antes de asumir (ya pasó con
  Exteriores en checklist de cierre, con el rol de "administración", con la
  fuente exacta del checklist detallado).
- El usuario ha compartido archivos reales (Excel de checklist, capturas de
  logo) — cuando dé una fuente real, usarla tal cual, no re-derivar de
  memoria.
