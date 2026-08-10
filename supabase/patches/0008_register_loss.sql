-- Patch: función RPC transaccional para registrar pérdidas (descuenta
-- inventario si hay producto vinculado). Ya está incluida en
-- supabase/schema.sql para instalaciones nuevas — esto es solo para aplicarla
-- sobre el proyecto que ya corriste. Correr después de 0001-0007.

create or replace function public.register_loss(
  p_category text,
  p_description text,
  p_qty numeric,
  p_item_id text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := public.current_user_id();
  v_role text := public.current_user_role();
  v_item_domain text;
  v_allowed_domain text;
  v_loss_id uuid;
begin
  if v_user_id is null then
    raise exception 'Debes iniciar sesión.';
  end if;
  if p_description is null or length(trim(p_description)) = 0 then
    raise exception 'Escribe una descripción.';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'Cantidad inválida.';
  end if;
  if p_category not in ('Cristalería', 'Producto', 'Elementos') then
    raise exception 'Categoría inválida.';
  end if;

  if p_item_id is not null then
    select c.domain into v_item_domain
    from public.items i join public.categories c on c.id = i.category
    where i.id = p_item_id;
    if v_item_domain is null then
      raise exception 'Producto no encontrado.';
    end if;
    v_allowed_domain := case v_role when 'mesero' then 'mesas' when 'cocinero' then 'cocina' else null end;
    if v_role <> 'jefe' and v_allowed_domain <> v_item_domain then
      raise exception 'No puedes vincular un producto de esta categoría.';
    end if;
  end if;

  insert into public.losses (category, description, qty, item_id, reason, user_id)
  values (p_category, p_description, p_qty, p_item_id, p_reason, v_user_id)
  returning id into v_loss_id;

  if p_item_id is not null then
    update public.item_status set qty = greatest(0, coalesce(qty, 0) - p_qty)
    where item_id = p_item_id and qty is not null;
  end if;

  return v_loss_id;
end;
$$;

grant execute on function public.register_loss(text, text, numeric, text, text) to authenticated;
