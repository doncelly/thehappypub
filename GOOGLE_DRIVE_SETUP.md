# Conectar la hoja de cierres de caja a Google Sheets

El botón **"Actualizar hoja de cierres en Drive"** en Panel necesita una
**cuenta de servicio** de Google Cloud con acceso a tu hoja de cálculo de
cierres de caja (la que ya llevas a mano, con una pestaña por fecha). Esto lo
tienes que hacer tú — no es algo que se pueda automatizar desde acá. Son 10
minutos.

## 1. Crear el proyecto y activar la API de Google Sheets

1. Ve a [console.cloud.google.com](https://console.cloud.google.com) (con la
   cuenta de Google donde vive tu hoja de cálculo de cierres de caja).
2. Crea un proyecto nuevo (o usa uno existente) — arriba a la izquierda,
   "Seleccionar proyecto" → "Proyecto nuevo". Nómbralo como quieras, por
   ejemplo `the-happy-pub`.
3. Con el proyecto seleccionado, ve a **APIs y servicios → Biblioteca**, busca
   **Google Sheets API** y dale **Habilitar**.

## 2. Crear la cuenta de servicio

1. Ve a **APIs y servicios → Credenciales → Crear credenciales → Cuenta de servicio**.
2. Nombre: algo como `happy-pub-drive`. Continúa sin asignar roles especiales
   (no los necesita, solo va a poder tocar la hoja de cálculo que le
   compartas a mano).
3. Termina la creación. En la lista de cuentas de servicio, entra a la que
   acabas de crear.
4. Pestaña **Claves (Keys) → Agregar clave → Crear clave nueva → JSON**. Se
   descarga un archivo `.json` — guárdalo en un lugar seguro, **no lo subas a
   git, no lo pegues en ningún chat, ni lo compartas**.
5. Copia el valor de `client_email` del JSON — es algo como
   `happy-pub-drive@tu-proyecto.iam.gserviceaccount.com`.

## 3. Compartir tu hoja de cálculo con la cuenta de servicio

1. Abre en Google Sheets la hoja de cálculo donde ya llevas los cierres de
   caja (la que tiene una pestaña por fecha, tipo "07/08/2026", duplicada de
   tu pestaña plantilla).
2. Botón **Compartir** (arriba a la derecha) → pega el `client_email` del
   paso anterior → dale rol **Editor** → Enviar (no hace falta que la cuenta
   de servicio "acepte" nada, es automático).
3. Copia el ID de la hoja desde la URL del navegador:
   `docs.google.com/spreadsheets/d/ESTE-ES-EL-ID/edit`

## 4. Completar `.env.local`

Del archivo `.json` que descargaste, copia:

- `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `private_key` → `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (tal cual, con los
  `\n` literales, entre comillas dobles en una sola línea — **no** es el
  `private_key_id`, ese es un hash corto que no sirve para esto)

Y el ID de la hoja del paso 3 → `GOOGLE_CIERRES_SHEET_ID`.

```bash
GOOGLE_SERVICE_ACCOUNT_EMAIL=happy-pub-drive@tu-proyecto.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----\n"
GOOGLE_CIERRES_SHEET_ID=1a2B3c4D5e6F7g8H9iJ0kLmNoPqRsTuV
```

## 5. La pestaña plantilla

La app crea la pestaña del día duplicando una pestaña que ya exista en tu
hoja llamada exactamente **`Copia de COPIA BASE`** (el mismo nombre que usas
tú al duplicar a mano) y le pone de nombre la fecha en formato `DD/MM/YYYY`.
Si esa pestaña plantilla no existe con ese nombre exacto, o si cambia de
estructura (filas movidas, encabezados renombrados), la sincronización va a
fallar o escribir en la celda equivocada — avísale a Claude si cambias la
plantilla para que actualice el mapeo de celdas en
`src/app/api/drive/sync-caja-sheet/route.ts`.

## 6. Desplegar

Si estás en Vercel, agrega esas mismas 3 variables en **Project Settings →
Environment Variables** (ahí no hace falta escapar los `\n` de forma especial,
Vercel guarda el valor tal cual lo pegues, incluida la clave con saltos de
línea reales si prefieres pegarla así).

## Qué SÍ y qué NO sincroniza el botón

Escribe: responsable/hora/fecha de apertura y cierre, base de caja, remanente
recibido, ventas del día anterior (según el sistema), compras totales, pagos
en efectivo/tarjetas, total de ventas, remanente acumulado, base para el
siguiente turno, y el detalle línea por línea de "Compras desde remanente" y
"Auxilios de transporte".

No toca: "Meta ventas", "Nuevos seguidores" (no existen en la app, se dejan
como estén), ni la sección "Suma de facturas efectivo/tarjetas" (un desglose
factura por factura que la app no registra a ese nivel — sigue siendo 100%
manual).

## Notas de seguridad

- La cuenta de servicio **solo** puede tocar la hoja de cálculo que le
  compartiste a mano en el paso 3 — no tiene acceso a nada más de tu Drive.
- La clave privada (`GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`) nunca debe
  commitearse a git ni pegarse en ningún chat — vive únicamente en
  `.env.local` (ya está en `.gitignore`) y en las variables de entorno de
  Vercel.
- Si algún día quieres revocar el acceso, basta con quitar la cuenta de
  servicio de "Compartir" en la hoja de cálculo, o eliminar la clave desde
  Google Cloud Console.
