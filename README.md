# The Happy Pub — Control (migración)

Migración de `happy_pub_inventario.html` (HTML de una sola página) a Next.js + Supabase + Vercel.
El negocio, los flujos y el catálogo están validados en el HTML original — esto es una
migración de arquitectura, no un rediseño.

## Estado actual

- ✅ Paso 1 — Estructura del proyecto Next.js (App Router, TypeScript, Tailwind).
- ✅ Paso 2 — `supabase/schema.sql` (tablas + RLS) y `supabase/seed.sql` (catálogo real).
- ⬜ Paso 3 — Autenticación (PIN + Supabase Auth, verificado server-side).
- ⬜ Paso 4 — Migración módulo por módulo (empezando por Inventario).

Cada `page.tsx` bajo `src/app/(staff)/` tiene un comentario `TODO` explicando qué va ahí y
de qué tablas depende — son la guía para el Paso 4.

## Requisitos

Esta máquina **no tiene Node.js instalado** (se detectó al generar el proyecto). Necesitas
Node 18+ para todo lo demás:

```bash
brew install node
```

## Poner en marcha

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. En el editor SQL del proyecto, corre en orden:
   - `supabase/schema.sql`
   - `supabase/seed.sql`
3. Copia `.env.local.example` a `.env.local` y completa con las credenciales de tu proyecto
   (Project Settings → API).
4. Instala dependencias y arranca:

```bash
npm install
npm run dev
```

5. (Opcional, recomendado) Genera los tipos de TypeScript desde el esquema real:

```bash
npm run supabase:types
```

## Estructura

```
src/app/
  login/                    login por PIN (Paso 3)
  (staff)/                  shell autenticado — nav según rol
    inventario/  panel/  agenda/  checklist/  mi-dia/
    recibidos/  vender/  perdidas/  vencimientos/  galeria/  personal/
  rate/[userId]/            calificación de servicio, público, sin login
  api/                      Route Handlers con service role (Paso 3+)
src/lib/
  supabase/                 client.ts (browser) · server.ts (SSR) · admin.ts (service role)
  types/database.types.ts   generado con `npm run supabase:types`
supabase/
  schema.sql                todas las tablas + RLS
  seed.sql                  catálogo real: 171 items, 76 productos de menú, 85 recetas
```

## Fuente de la marca

Paleta (navy `#30418A`, gold `#C68D17`, y el resto de `:root` del HTML original) ya está en
`tailwind.config.ts`. Falta el archivo `.ttf` real de **Cheddar Gothic Serif** — cuando lo
tengas, colócalo en `public/fonts/CheddarGothicSerif.ttf` (el `@font-face` en
`src/app/globals.css` ya apunta ahí).
