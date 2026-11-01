# Brunel Brand · Tienda online

Tienda de ropa para hombre en Quito, Ecuador.
Hecha con **Next.js 15 + Tailwind CSS 4 + Supabase** y lista para publicar en **Vercel**.

## Qué incluye (Fase 1)

| Sección | Ruta | Qué hace |
|---|---|---|
| Inicio | `/` | Banner, categorías y productos destacados |
| Catálogo | `/catalogo` | Filtros por categoría, talla (S, M, L) y orden por precio |
| Producto | `/producto/[slug]` | Fotos, tallas con stock, guía de tallas, carrito y “Pedir por WhatsApp” |
| Carrito | `/carrito` | Se guarda en el celular del cliente y envía el pedido completo por WhatsApp |
| Admin | `/admin` | Login, crear/editar/borrar productos con fotos, precio y stock; categorías |
| Importar | `/admin/importar` | Carga masiva del inventario desde un CSV |

Además: botones fijos de Instagram y WhatsApp (con 2 números) en toda la tienda.

## Estructura del código

```
supabase/esquema.sql        ← SQL de tablas, seguridad (RLS) y bucket de fotos
public/plantilla-inventario.csv
src/
  config/tienda.js          ← WhatsApp, Instagram, banner, tallas y guía de tallas (EDITA AQUÍ)
  app/(tienda)/             ← páginas públicas (inicio, catálogo, producto, carrito)
  app/admin/                ← login y panel de administración
  app/api/revalidar/        ← refresca la tienda al guardar cambios en el panel
  components/tienda/        ← encabezado, tarjetas, detalle de producto, botones flotantes
  components/admin/         ← formulario de producto y marco del panel
  context/CarritoContext.js ← lógica del carrito
  lib/                      ← consultas a Supabase, utilidades, importación CSV
  middleware.js             ← protege /admin
```

---

## Paso 1 · Preparar Supabase (una sola vez)

1. Entra a <https://supabase.com/dashboard> y abre tu proyecto.
2. Ve a **SQL Editor → New query**, pega todo el contenido de `supabase/esquema.sql` y pulsa **Run**.
   Esto crea las tablas `categorias`, `productos`, `producto_tallas` y `admins`, las reglas de seguridad
   (cualquiera ve los productos; solo el admin crea, edita o borra) y el bucket público **`productos`** para las fotos.
3. Crea tu usuario administrador:
   - **Authentication → Users → Add user → Create new user**.
   - Escribe tu correo y una contraseña segura, y marca **Auto Confirm User**.
4. Dale permisos de admin. En **SQL Editor** ejecuta (cambiando el correo):
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'tu-correo@ejemplo.com'
   on conflict do nothing;
   ```
5. Recomendado: en **Authentication → Sign In / Providers → Email**, desactiva **Allow new users to sign up**
   para que nadie más pueda crearse una cuenta.

## Paso 2 · Correrlo en tu computador

Necesitas instalar una sola vez:
- **Node.js 20 o superior** (versión LTS): <https://nodejs.org>
- **Git**: <https://git-scm.com>

Luego, en una terminal (en Windows: “Símbolo del sistema” o “PowerShell”):

```bash
# 1. Descarga el proyecto
git clone https://github.com/santyxxx-xxx/brunellbrand.git
cd brunellbrand

# 2. Instala las dependencias (tarda 1–2 minutos)
npm install
```

3. Crea el archivo **`.env.local`** en la carpeta del proyecto (copia `.env.example` y cambia el nombre) con:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://kxzsjipplrsausstryez.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_clave_publica_sb_publishable_...
   ```
   Este archivo **no se sube a GitHub** (está en `.gitignore`).

4. Arranca la tienda:
   ```bash
   npm run dev
   ```
5. Abre <http://localhost:3000> para ver la tienda y <http://localhost:3000/admin> para el panel.

Para probar desde tu celular en la misma red Wi-Fi: usa la dirección “Network” que aparece en la terminal
(por ejemplo `http://192.168.1.20:3000`).

## Paso 3 · Personalizar

Abre `src/config/tienda.js` y cambia:
- `whatsapp`: tus 2 números en formato internacional sin “+” ni espacios (ej. `0991234567` → `593991234567`).
  El primero recibe los pedidos de “Pedir por WhatsApp” y del carrito.
- `instagram`: el enlace de tu perfil.
- `BANNER`: textos y foto del banner principal.
- `GUIA_TALLAS`: las medidas reales de tus prendas.

## Paso 4 · Cargar el inventario

1. Entra a `/admin` con tu usuario.
2. **Categorías**: revisa o crea las categorías (vienen “Camisas” y “Polos” de ejemplo) y súbeles una foto.
3. **Importar CSV**: descarga la plantilla, llena tus ~200 productos en Excel o Google Sheets,
   guarda como CSV y súbelo. Si vuelves a importar, los productos con el mismo `sku` se actualizan.
4. **Productos**: entra a cada producto para subir sus fotos desde el celular (se comprimen solas antes de subir).

## Paso 5 · Publicar en Vercel

1. Sube el código a GitHub (si aún no está):
   ```bash
   git add .
   git commit -m "Mis cambios"
   git push
   ```
2. Entra a <https://vercel.com>, inicia sesión con tu cuenta de GitHub y pulsa **Add New → Project**.
3. Elige el repositorio **brunellbrand** y pulsa **Import**. Vercel detecta Next.js solo.
4. En **Environment Variables** agrega las dos variables (los mismos valores de tu `.env.local`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Pulsa **Deploy**. En 1–2 minutos tendrás tu enlace `https://brunellbrand.vercel.app` (o similar).
6. Cada vez que hagas `git push`, Vercel publica la nueva versión automáticamente.
7. Dominio propio (ej. `brunelbrand.com.ec`): en Vercel → tu proyecto → **Settings → Domains**.

> Importante: después de agregar tu dominio, ve a Supabase → **Authentication → URL Configuration**
> y pon tu dominio en **Site URL**.

## Preguntas frecuentes

- **Cambié un producto y no se ve en la tienda.** Al guardar desde el panel la tienda se refresca al instante.
  Si editaste directo en Supabase, espera hasta 60 segundos.
- **“Sin permisos de administrador” al entrar al panel.** Falta el Paso 1.4 para ese correo.
- **No suben las fotos.** Revisa que ejecutaste todo `esquema.sql` (crea el bucket y sus permisos).

## Para después (no incluido aún)

Pagos en línea, comprobante por correo, envíos por zona, estadísticas y chat de ventas.
