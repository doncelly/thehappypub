-- Aseo de cocina y desechables/empaques faltaban en Inventario — cocinero no
-- tenía ninguna categoría de aseo propia (la existente "aseo" es domain=
-- 'mesas', cocinero no la ve por RLS). Más "Crema de leche" en Cocina.

insert into public.categories (id, label, domain, sort_order) values
  ('aseo_cocina',        '🧽 Aseo Cocina', 'cocina', 13),
  ('desechables_cocina', '📦 Desechables', 'cocina', 14)
on conflict (id) do nothing;

insert into public.items (id, name, category, mode, unit, step, min) values
  ('crema_leche',              'Crema de leche',              'cocina',              'qty',   'ml', 200, 500),
  ('jabon_loza_desengrasante', 'Jabón loza desengrasante',    'aseo_cocina',         'gauge', null, null, null),
  ('jabon_polvo',              'Jabón en polvo',              'aseo_cocina',         'gauge', null, null, null),
  ('sabras',                   'Sabras',                      'aseo_cocina',         'gauge', null, null, null),
  ('clorox',                   'Clorox',                      'aseo_cocina',         'gauge', null, null, null),
  ('contenedores_llevar',      'Contenedores para llevar',    'desechables_cocina',  'gauge', null, null, null),
  ('palillos_largos',          'Palillos largos',             'desechables_cocina',  'gauge', null, null, null),
  ('papel_graso',              'Papel graso',                 'desechables_cocina',  'gauge', null, null, null),
  ('cucharitas_desechables',   'Cucharitas desechables',      'desechables_cocina',  'gauge', null, null, null),
  ('copitas_desechables',      'Copitas desechables',         'desechables_cocina',  'gauge', null, null, null),
  ('bolsas_llevar',            'Bolsas para llevar',          'desechables_cocina',  'gauge', null, null, null)
on conflict (id) do nothing;

-- Arranca en el estado inicial de siempre (0/agotado) para los items nuevos.
insert into public.item_status (item_id, status_gauge, qty)
select id, case when mode = 'gauge' then 'agotado' else null end,
          case when mode = 'qty' then 0 else null end
from public.items
where id in (
  'crema_leche', 'jabon_loza_desengrasante', 'jabon_polvo', 'sabras', 'clorox',
  'contenedores_llevar', 'palillos_largos', 'papel_graso', 'cucharitas_desechables',
  'copitas_desechables', 'bolsas_llevar'
)
on conflict (item_id) do nothing;
