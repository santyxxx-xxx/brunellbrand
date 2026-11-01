-- =====================================================================
-- BRUNEL BRAND · FASE 2: pedidos, pagos, envíos, perfiles y páginas legales
-- Requisito: haber ejecutado antes supabase/esquema.sql (Fase 1).
-- Pega TODO este archivo en Supabase > SQL Editor > New query > Run.
-- Se puede ejecutar más de una vez sin romper nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TARIFAS DE ENVÍO (editables desde el panel admin)
-- ---------------------------------------------------------------------
create table if not exists public.tarifas_envio (
  id           bigint generated always as identity primary key,
  metodo       text not null check (metodo in ('domicilio', 'uber', 'servientrega')),
  provincia    text not null,
  es_local     boolean not null default false,   -- zona local Cumbayá – El Portal / San Luis Shopping
  nombre       text not null,                    -- lo que ve el cliente
  descripcion  text,
  costo        numeric(10,2) not null default 0 check (costo >= 0),
  activo       boolean not null default true,
  orden        int not null default 0,
  unique (metodo, provincia)
);

-- ---------------------------------------------------------------------
-- 2. PEDIDOS
-- ---------------------------------------------------------------------
create sequence if not exists public.orders_numero_seq start 1001;

create table if not exists public.orders (
  id                  uuid primary key default gen_random_uuid(),
  numero              bigint not null unique default nextval('public.orders_numero_seq'),
  token_acceso        uuid not null default gen_random_uuid(), -- permite al invitado ver su pedido
  estado              text not null default 'pendiente_pago'
                      check (estado in ('pendiente_pago', 'pagado', 'enviado', 'entregado', 'cancelado')),
  user_id             uuid references auth.users(id) on delete set null, -- null = compra como invitado

  -- Cliente
  cliente_nombre      text not null,
  cliente_cedula      text,
  cliente_correo      text not null,
  cliente_telefono    text not null,

  -- Dirección
  provincia           text not null,
  ciudad              text not null,
  sector              text not null,
  direccion           text not null,
  referencia          text,

  -- Envío (copia de la tarifa al momento de comprar)
  tarifa_envio_id     bigint references public.tarifas_envio(id) on delete set null,
  envio_metodo        text not null,
  envio_nombre        text not null,
  costo_envio         numeric(10,2) not null default 0,
  numero_guia         text,                -- guía de Servientrega

  -- Valores (calculados en el servidor)
  subtotal            numeric(10,2) not null,
  total               numeric(10,2) not null,

  -- Control
  stock_descontado    boolean not null default false,
  stock_insuficiente  boolean not null default false,
  correos_enviados    boolean not null default false,
  notas_cliente       text,
  notas_internas      text,
  acepto_politicas_en timestamptz,
  pagado_en           timestamptz,
  enviado_en          timestamptz,
  entregado_en        timestamptz,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);

create index if not exists orders_estado_idx on public.orders (estado, creado_en desc);
create index if not exists orders_user_idx on public.orders (user_id);

create table if not exists public.order_items (
  id               bigint generated always as identity primary key,
  order_id         uuid not null references public.orders(id) on delete cascade,
  producto_id      uuid references public.productos(id) on delete set null,
  sku              text not null,
  nombre           text not null,
  talla            text not null,
  imagen           text,
  precio_unitario  numeric(10,2) not null,
  cantidad         int not null check (cantidad > 0),
  subtotal         numeric(10,2) not null
);

create index if not exists order_items_order_idx on public.order_items (order_id);

-- Intentos de pago (cada intento tiene su propio identificador para la pasarela)
create table if not exists public.order_payments (
  id                     bigint generated always as identity primary key,
  order_id               uuid not null references public.orders(id) on delete cascade,
  pasarela               text not null default 'payphone',
  client_transaction_id  text not null unique,
  monto_centavos         int not null,
  estado                 text not null default 'iniciado'
                         check (estado in ('iniciado', 'aprobado', 'cancelado', 'error')),
  transaccion_id         text,           -- id que asigna la pasarela
  detalle                jsonb,          -- respuesta completa de la pasarela
  creado_en              timestamptz not null default now(),
  actualizado_en         timestamptz not null default now()
);

create index if not exists order_payments_order_idx on public.order_payments (order_id);

-- ---------------------------------------------------------------------
-- 3. PERFIL DEL CLIENTE (dirección guardada, solo con cuenta)
-- ---------------------------------------------------------------------
create table if not exists public.perfiles_clientes (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  nombre          text,
  cedula          text,
  telefono        text,
  provincia       text,
  ciudad          text,
  sector          text,
  direccion       text,
  referencia      text,
  actualizado_en  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 4. PÁGINAS LEGALES (editables desde el panel admin)
-- ---------------------------------------------------------------------
create table if not exists public.paginas (
  slug            text primary key,
  titulo          text not null,
  contenido       text not null default '',
  actualizado_en  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 5. AUTOMATIZACIONES
-- ---------------------------------------------------------------------

-- Fechas de actualización
drop trigger if exists orders_actualizado_en on public.orders;
create trigger orders_actualizado_en before update on public.orders
  for each row execute function public.tocar_actualizado_en();

drop trigger if exists order_payments_actualizado_en on public.order_payments;
create trigger order_payments_actualizado_en before update on public.order_payments
  for each row execute function public.tocar_actualizado_en();

drop trigger if exists perfiles_actualizado_en on public.perfiles_clientes;
create trigger perfiles_actualizado_en before update on public.perfiles_clientes
  for each row execute function public.tocar_actualizado_en();

drop trigger if exists paginas_actualizado_en on public.paginas;
create trigger paginas_actualizado_en before update on public.paginas
  for each row execute function public.tocar_actualizado_en();

-- STOCK: se descuenta SOLO cuando el pedido pasa a pagado (o enviado/entregado),
-- y se devuelve si un pedido ya descontado se cancela. Funciona igual si el cambio
-- viene de la pasarela de pagos o del panel admin.
create or replace function public.orders_aplicar_stock()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  item record;
  disponible int;
  faltante boolean := false;
begin
  if new.estado in ('pagado', 'enviado', 'entregado') and not old.stock_descontado then
    for item in
      select producto_id, talla, cantidad from public.order_items
      where order_id = new.id and producto_id is not null
    loop
      select stock into disponible from public.producto_tallas
        where producto_id = item.producto_id and talla = item.talla
        for update;
      if disponible is null or disponible < item.cantidad then
        faltante := true;
      end if;
      update public.producto_tallas
        set stock = greatest(stock - item.cantidad, 0)
        where producto_id = item.producto_id and talla = item.talla;
    end loop;
    new.stock_descontado := true;
    new.stock_insuficiente := faltante;
    new.pagado_en := coalesce(new.pagado_en, now());

  elsif new.estado = 'cancelado' and old.stock_descontado then
    for item in
      select producto_id, talla, cantidad from public.order_items
      where order_id = new.id and producto_id is not null
    loop
      update public.producto_tallas
        set stock = stock + item.cantidad
        where producto_id = item.producto_id and talla = item.talla;
    end loop;
    new.stock_descontado := false;
  end if;

  if new.estado = 'enviado' then new.enviado_en := coalesce(new.enviado_en, now()); end if;
  if new.estado = 'entregado' then new.entregado_en := coalesce(new.entregado_en, now()); end if;
  return new;
end $$;

drop trigger if exists orders_stock on public.orders;
create trigger orders_stock
  before update of estado on public.orders
  for each row
  when (old.estado is distinct from new.estado)
  execute function public.orders_aplicar_stock();

-- ---------------------------------------------------------------------
-- 6. PERMISOS BÁSICOS
-- (El servidor de la tienda usa la clave secreta "service_role" para crear pedidos
--  y confirmar pagos; esa clave no pasa por estas reglas y nunca llega al navegador.)
-- ---------------------------------------------------------------------
grant select on public.tarifas_envio, public.paginas to anon, authenticated;
grant insert, update, delete on public.tarifas_envio, public.paginas to authenticated;
grant select, update on public.orders to authenticated;
grant select on public.order_items, public.order_payments to authenticated;
grant select, insert, update, delete on public.perfiles_clientes to authenticated;

-- ---------------------------------------------------------------------
-- 7. SEGURIDAD (RLS)
-- ---------------------------------------------------------------------
alter table public.tarifas_envio     enable row level security;
alter table public.orders            enable row level security;
alter table public.order_items       enable row level security;
alter table public.order_payments    enable row level security;
alter table public.perfiles_clientes enable row level security;
alter table public.paginas           enable row level security;

-- TARIFAS: todos ven las activas; solo el admin edita
drop policy if exists "Tarifas visibles" on public.tarifas_envio;
create policy "Tarifas visibles" on public.tarifas_envio
  for select using (activo or public.es_admin());
drop policy if exists "Admin crea tarifas" on public.tarifas_envio;
create policy "Admin crea tarifas" on public.tarifas_envio
  for insert to authenticated with check (public.es_admin());
drop policy if exists "Admin edita tarifas" on public.tarifas_envio;
create policy "Admin edita tarifas" on public.tarifas_envio
  for update to authenticated using (public.es_admin()) with check (public.es_admin());
drop policy if exists "Admin borra tarifas" on public.tarifas_envio;
create policy "Admin borra tarifas" on public.tarifas_envio
  for delete to authenticated using (public.es_admin());

-- PEDIDOS: el cliente con cuenta ve los suyos; el admin ve y edita todos.
-- Nadie puede crear pedidos desde el navegador: solo el servidor (precios calculados allí).
drop policy if exists "Cliente ve sus pedidos" on public.orders;
create policy "Cliente ve sus pedidos" on public.orders
  for select to authenticated using (user_id = auth.uid() or public.es_admin());
drop policy if exists "Admin edita pedidos" on public.orders;
create policy "Admin edita pedidos" on public.orders
  for update to authenticated using (public.es_admin()) with check (public.es_admin());

drop policy if exists "Ver productos del pedido" on public.order_items;
create policy "Ver productos del pedido" on public.order_items
  for select to authenticated using (
    exists (select 1 from public.orders o
            where o.id = order_id and (o.user_id = auth.uid() or public.es_admin()))
  );

drop policy if exists "Admin ve pagos" on public.order_payments;
create policy "Admin ve pagos" on public.order_payments
  for select to authenticated using (public.es_admin());

-- PERFILES: cada cliente maneja el suyo; el admin puede verlos
drop policy if exists "Cliente ve su perfil" on public.perfiles_clientes;
create policy "Cliente ve su perfil" on public.perfiles_clientes
  for select to authenticated using (user_id = auth.uid() or public.es_admin());
drop policy if exists "Cliente crea su perfil" on public.perfiles_clientes;
create policy "Cliente crea su perfil" on public.perfiles_clientes
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "Cliente edita su perfil" on public.perfiles_clientes;
create policy "Cliente edita su perfil" on public.perfiles_clientes
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Cliente borra su perfil" on public.perfiles_clientes;
create policy "Cliente borra su perfil" on public.perfiles_clientes
  for delete to authenticated using (user_id = auth.uid());

-- PÁGINAS: todos leen; solo el admin edita
drop policy if exists "Páginas visibles" on public.paginas;
create policy "Páginas visibles" on public.paginas for select using (true);
drop policy if exists "Admin crea páginas" on public.paginas;
create policy "Admin crea páginas" on public.paginas
  for insert to authenticated with check (public.es_admin());
drop policy if exists "Admin edita páginas" on public.paginas;
create policy "Admin edita páginas" on public.paginas
  for update to authenticated using (public.es_admin()) with check (public.es_admin());

-- ---------------------------------------------------------------------
-- 8. TARIFAS INICIALES (VALORES DE EJEMPLO: cámbialos en el panel > Envíos)
-- ---------------------------------------------------------------------
insert into public.tarifas_envio (metodo, provincia, es_local, nombre, descripcion, costo, orden) values
  ('domicilio', 'Pichincha', true, 'Entrega a domicilio (zona local)', 'Cumbayá hasta El Portal / San Luis Shopping', 3.00, 1),
  ('uber',      'Pichincha', true, 'Envío por Uber (zona local)',      'Cumbayá hasta El Portal / San Luis Shopping', 5.00, 2)
on conflict (metodo, provincia) do nothing;

insert into public.tarifas_envio (metodo, provincia, nombre, descripcion, costo, orden)
select 'servientrega', p.provincia, 'Servientrega', 'Entrega en 24 a 72 horas hábiles', p.costo, 10 + p.n
from (values
  (1,  'Pichincha', 5.00),  (2,  'Azuay', 6.00),      (3,  'Bolívar', 6.00),    (4,  'Cañar', 6.00),
  (5,  'Carchi', 6.00),     (6,  'Chimborazo', 6.00), (7,  'Cotopaxi', 6.00),   (8,  'El Oro', 6.50),
  (9,  'Esmeraldas', 6.50), (10, 'Galápagos', 15.00), (11, 'Guayas', 6.50),     (12, 'Imbabura', 6.00),
  (13, 'Loja', 6.00),       (14, 'Los Ríos', 6.50),   (15, 'Manabí', 6.50),     (16, 'Morona Santiago', 8.00),
  (17, 'Napo', 8.00),       (18, 'Orellana', 8.00),   (19, 'Pastaza', 8.00),    (20, 'Santa Elena', 6.50),
  (21, 'Santo Domingo de los Tsáchilas', 6.50), (22, 'Sucumbíos', 8.00), (23, 'Tungurahua', 6.00),
  (24, 'Zamora Chinchipe', 8.00)
) as p(n, provincia, costo)
on conflict (metodo, provincia) do nothing;

-- ---------------------------------------------------------------------
-- 9. TEXTOS LEGALES BASE (edítalos en el panel > Páginas legales)
--    Reemplaza lo que está entre [CORCHETES] con tus datos reales.
-- ---------------------------------------------------------------------
insert into public.paginas (slug, titulo, contenido) values
('envios', 'Política de envíos', $txt$
Esta política explica cómo entregamos los pedidos realizados en la tienda en línea de Brunel Brand.

## Zona local (Quito)
Hacemos entregas en la zona comprendida entre **Cumbayá y El Portal / San Luis Shopping**. Puedes elegir:

- **Entrega a domicilio:** la coordinamos contigo por WhatsApp una vez confirmado el pago.
- **Envío por Uber:** enviamos tu pedido por Uber al punto que nos indiques.

El costo de cada opción se muestra antes de pagar.

## Resto del país
Enviamos a todas las provincias del Ecuador a través de **Servientrega**. El costo depende de la provincia de destino y se muestra antes de pagar. Cuando despachemos tu pedido te enviaremos el **número de guía** para que puedas rastrearlo.

## Tiempos de entrega
- Zona local: de 24 a 48 horas hábiles después de confirmado el pago.
- Servientrega: de 24 a 72 horas hábiles después del despacho (Galápagos y zonas rurales pueden tardar más).

Los tiempos son referenciales y pueden variar por feriados, clima o situaciones fuera de nuestro control.

## Datos de entrega
Es responsabilidad del cliente ingresar una dirección completa y un teléfono de contacto correctos. Si un pedido es devuelto por datos incorrectos, el nuevo envío tendrá costo adicional.

## Contacto
Para cualquier consulta sobre tu envío escríbenos a [CORREO DE CONTACTO] o por WhatsApp.
$txt$),

('cambios-y-devoluciones', 'Cambios y devoluciones', $txt$
Queremos que estés feliz con tu compra. Esta política se rige por la Ley Orgánica de Defensa del Consumidor del Ecuador.

## Plazo
Tienes **15 días** contados desde que recibiste tu pedido para solicitar un cambio o una devolución.

## Condiciones
- La prenda debe estar sin uso, sin lavar, con sus etiquetas y en su empaque original.
- Debes presentar el número de pedido o el comprobante de compra.
- Por higiene, no se aceptan cambios de ropa interior ni prendas con señales de uso.

## Cambios de talla o modelo
Puedes cambiar tu prenda por otra talla o modelo, sujeto a disponibilidad. Si el nuevo producto tiene un precio mayor, pagas la diferencia.

## Devoluciones
Si no estás satisfecho con tu compra, te devolvemos el valor pagado por el producto por el mismo medio de pago o por transferencia bancaria, dentro de los plazos que establece la ley. No te obligaremos a aceptar notas de crédito ni otros productos en lugar de tu dinero.

## Productos defectuosos
Si tu prenda llegó con un defecto de fábrica o no corresponde a lo que pediste, asumimos el costo del envío de regreso y del nuevo envío.

## Costos de envío
En cambios o devoluciones que no se deban a un error nuestro, el costo de envío de regreso corre por cuenta del cliente.

## Cómo solicitarlo
Escríbenos a [CORREO DE CONTACTO] o por WhatsApp con tu número de pedido, la prenda y el motivo. Te responderemos con las instrucciones.
$txt$),

('privacidad', 'Política de privacidad', $txt$
En Brunel Brand respetamos tu privacidad y protegemos tus datos personales conforme a la **Ley Orgánica de Protección de Datos Personales (LOPDP)** del Ecuador y su reglamento.

## Responsable del tratamiento
[NOMBRE COMPLETO O RAZÓN SOCIAL], con [CÉDULA / RUC], domiciliado en [DIRECCIÓN], Quito, Ecuador. Correo de contacto: [CORREO DE CONTACTO].

## Datos que recopilamos
- **Identificación y contacto:** nombre, número de cédula (opcional), correo electrónico y teléfono.
- **Entrega:** provincia, ciudad, sector, dirección y referencia.
- **Compra:** productos, valores, estado del pedido y datos básicos del pago (no almacenamos números de tarjeta; el pago lo procesa PayPhone).
- **Cuenta (opcional):** correo y contraseña cifrada, si decides crear una cuenta.

## Para qué los usamos
- Procesar, enviar y dar seguimiento a tus pedidos.
- Enviarte el comprobante de compra y avisos sobre tu pedido.
- Atender cambios, devoluciones y consultas.
- Cumplir obligaciones legales.

La base legal es la **ejecución del contrato de compraventa** y, cuando corresponda, tu **consentimiento**, que otorgas al aceptar esta política en el proceso de compra. No usamos tus datos para publicidad sin tu autorización.

## Con quién los compartimos
Solo con los proveedores necesarios para operar la tienda, que actúan como encargados del tratamiento: PayPhone (pagos), Servientrega o el servicio de entrega elegido (envíos), Supabase (base de datos), Vercel (alojamiento web) y Resend (envío de correos). Algunos de estos proveedores pueden almacenar datos fuera del Ecuador con medidas de seguridad adecuadas. No vendemos tus datos.

## Cuánto tiempo los conservamos
Mientras sea necesario para cumplir las finalidades descritas y los plazos que exige la ley (por ejemplo, obligaciones contables y tributarias).

## Tus derechos
Puedes ejercer en cualquier momento tus derechos de **acceso, rectificación y actualización, eliminación, oposición, portabilidad y suspensión del tratamiento**, así como a no ser objeto de decisiones basadas únicamente en tratamientos automatizados. Escríbenos a [CORREO DE CONTACTO] indicando tu nombre y el derecho que deseas ejercer; responderemos dentro del plazo que establece la ley.

También puedes presentar un reclamo ante la **Superintendencia de Protección de Datos Personales**.

## Seguridad
Aplicamos medidas técnicas y organizativas para proteger tus datos: conexiones cifradas (HTTPS), acceso restringido y contraseñas cifradas.

## Cambios a esta política
Podemos actualizar esta política. La versión vigente siempre estará publicada en esta página con su fecha de actualización.
$txt$)
on conflict (slug) do nothing;
