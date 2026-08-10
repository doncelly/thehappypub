-- ============================================================================
-- THE HAPPY PUB — SEED DE DATOS REALES (Paso 2b)
-- ============================================================================
-- Correr DESPUÉS de supabase/schema.sql. Todo lo de acá está extraído tal cual
-- de happy_pub_inventario.html (const CATEGORIES, ITEMS, MENU, TABLES, SERVICIOS,
-- PAIRS, DEFAULT_RATES, DEFAULT_PROMOS, DEFAULT_CLEANING_*, VENUE) — nada inventado.
-- ============================================================================

-- ============================================================================
-- CATEGORÍAS DE INVENTARIO (CATEGORIES)
-- ============================================================================
insert into public.categories (id, label, domain, sort_order) values
  ('barra',          '🍺 Barriles',          'mesas',  1),
  ('cervezas_intl',  '🍾 Cervezas Intl.',    'mesas',  2),
  ('insumos_coctel', '🍹 Insumos Cóctel',    'mesas',  3),
  ('shots',          '🥃 Shots',             'mesas',  4),
  ('botellas_trago', '🍾 Botellas Trago',    'mesas',  5),
  ('mezcladores',    '🥤 Bebidas',           'mesas',  6),
  ('cafes',          '☕ Cafés',             'mesas',  7),
  ('cocteleria',     '🍸 Insumos Frescos',   'mesas',  8),
  ('cocina',         '🍳 Cocina',            'cocina', 9),
  ('salsas',         '🥫 Salsas',            'cocina', 10),
  ('aseo',           '🧽 Aseo e Insumos',    'mesas',  11),
  ('otros',          '🚬 Otros',             'mesas',  12);

-- ============================================================================
-- CATÁLOGO DE ITEMS (ITEMS) — id, name, category, mode, unit, step, min
-- ============================================================================
insert into public.items (id, name, category, mode, unit, step, min) values
  -- Barriles reales
  ('barril_gulupa',   'Happy Gulupa',              'barra', 'gauge', null, null, null),
  ('barril_germania', 'Germania',                  'barra', 'gauge', null, null, null),
  ('barril_amber',    'Amber Ale (Red IPA)',       'barra', 'gauge', null, null, null),
  ('barril_negra',    'Negra (3 Cordilleras)',     'barra', 'gauge', null, null, null),
  ('barril_mulata',   'Mulata (3 Cordilleras)',    'barra', 'gauge', null, null, null),
  ('barril_brown',    'Brown (Merak)',             'barra', 'gauge', null, null, null),
  ('barril_roja_aaa', 'Roja AAA (Merak)',          'barra', 'gauge', null, null, null),
  ('barril_temporada','De Temporada',              'barra', 'gauge', null, null, null),
  ('co2_interno',     'CO2 — Interno',             'barra', 'gauge', null, null, null),
  ('co2_sonido',      'CO2 — Área de sonido',      'barra', 'gauge', null, null, null),

  -- Cervezas internacionales — cantidad
  ('corona_light',    'Corona Light',              'cervezas_intl', 'qty', 'und', 1, 6),
  ('coronita',        'Coronita 210',              'cervezas_intl', 'qty', 'und', 1, 6),
  ('corona',          'Corona 330',                'cervezas_intl', 'qty', 'und', 1, 6),
  ('corona_lata',     'Corona 269 (lata)',         'cervezas_intl', 'qty', 'und', 1, 6),
  ('club_colombia',   'Club Colombia (lata)',      'cervezas_intl', 'qty', 'und', 1, 6),
  ('andina_dorada',   'Andina Dorada (lata)',      'cervezas_intl', 'qty', 'und', 1, 6),
  ('andina_light',    'Andina Light (lata)',       'cervezas_intl', 'qty', 'und', 1, 6),
  ('andina_light_botella', 'Andina Light (botella)', 'cervezas_intl', 'qty', 'und', 1, 6),
  ('stella',          'Stella Artois (lata)',      'cervezas_intl', 'qty', 'und', 1, 6),
  ('budweiser',       'Budweiser (lata)',          'cervezas_intl', 'qty', 'und', 1, 6),
  ('heineken',        'Heineken (lata)',           'cervezas_intl', 'qty', 'und', 1, 6),
  ('heineken_botella','Heineken (botella)',        'cervezas_intl', 'qty', 'und', 1, 6),
  ('corona_cero_lata',    'Corona Cero (lata)',    'cervezas_intl', 'qty', 'und', 1, 6),
  ('corona_cero_botella', 'Corona Cero (botella)', 'cervezas_intl', 'qty', 'und', 1, 6),
  ('poker',           'Poker (lata)',              'cervezas_intl', 'qty', 'und', 1, 6),
  ('tres_cordilleras','3 Cordilleras Rosada',      'cervezas_intl', 'qty', 'und', 1, 6),
  ('central',         'Cerveza Central (lata)',    'cervezas_intl', 'qty', 'und', 1, 6),
  ('red_bull',        'Red Bull',                  'cervezas_intl', 'qty', 'und', 1, 4),
  ('electrolit',      'Electrolit',                'cervezas_intl', 'qty', 'und', 1, 4),

  -- Insumos cóctel — Botella (cantidad) + Fracción (gauge)
  ('fc_triplesec_botella',   'Finest Call Triplesec — Botellas de repuesto',            'insumos_coctel', 'qty', 'und', 1, 1),
  ('fc_triplesec_fraccion',  'Finest Call Triplesec — Abierta',                         'insumos_coctel', 'gauge', null, null, null),
  ('fc_curazao_botella',     'Finest Call Curazao — Botellas de repuesto',              'insumos_coctel', 'qty', 'und', 1, 1),
  ('fc_curazao_fraccion',    'Finest Call Curazao — Abierta',                           'insumos_coctel', 'gauge', null, null, null),
  ('fc_mango_botella',       'Finest Call Mango — Botellas de repuesto',                'insumos_coctel', 'qty', 'und', 1, 1),
  ('fc_mango_fraccion',      'Finest Call Mango — Abierta',                             'insumos_coctel', 'gauge', null, null, null),
  ('fc_strawberry_botella',  'Finest Call Strawberry (Lychee) — Botellas de repuesto',  'insumos_coctel', 'qty', 'und', 1, 1),
  ('fc_strawberry_fraccion', 'Finest Call Strawberry (Lychee) — Abierta',               'insumos_coctel', 'gauge', null, null, null),
  ('fc_manzana_botella',     'Finest Call Manzana verde — Botellas de repuesto',        'insumos_coctel', 'qty', 'und', 1, 1),
  ('fc_manzana_fraccion',    'Finest Call Manzana verde — Abierta',                     'insumos_coctel', 'gauge', null, null, null),
  ('fc_granadina_botella',   'Finest Call Granadina — Botellas de repuesto',            'insumos_coctel', 'qty', 'und', 1, 1),
  ('fc_granadina_fraccion',  'Finest Call Granadina — Abierta',                         'insumos_coctel', 'gauge', null, null, null),
  ('margarita_mix_botella',  'Margarita Master of Mixer — Botellas de repuesto',        'insumos_coctel', 'qty', 'und', 1, 1),
  ('margarita_mix_fraccion', 'Margarita Master of Mixer — Abierta',                     'insumos_coctel', 'gauge', null, null, null),
  ('zumo_limon_botella',     'Zumo de limón — Botellas de repuesto',                    'insumos_coctel', 'qty', 'und', 1, 1),
  ('zumo_limon_fraccion',    'Zumo de limón — Abierta',                                 'insumos_coctel', 'gauge', null, null, null),
  ('zumo_naranja_botella',   'Zumo de naranja — Botellas de repuesto',                  'insumos_coctel', 'qty', 'und', 1, 1),
  ('zumo_naranja_fraccion',  'Zumo de naranja — Abierta',                               'insumos_coctel', 'gauge', null, null, null),
  ('ginebra_dafne_botella',  'Ginebra Dafne — Botellas de repuesto',                    'insumos_coctel', 'qty', 'und', 1, 1),
  ('ginebra_dafne_fraccion', 'Ginebra Dafne — Abierta',                                 'insumos_coctel', 'gauge', null, null, null),
  ('tequila_newton_botella', 'Tequila Newton Gold — Botellas de repuesto',              'insumos_coctel', 'qty', 'und', 1, 1),
  ('tequila_newton_fraccion','Tequila Newton Gold — Abierta',                           'insumos_coctel', 'gauge', null, null, null),
  ('ron_cartavio_botella',   'Ron Cartavio Black Barrel — Botellas de repuesto',        'insumos_coctel', 'qty', 'und', 1, 1),
  ('ron_cartavio_fraccion',  'Ron Cartavio Black Barrel — Abierta',                     'insumos_coctel', 'gauge', null, null, null),
  ('soda_bretana_15l_botella','Soda o Bretaña 1.5L — Botellas de repuesto',             'insumos_coctel', 'qty', 'und', 1, 1),
  ('soda_bretana_15l_fraccion','Soda o Bretaña 1.5L — Abierta',                         'insumos_coctel', 'gauge', null, null, null),
  ('syrup_simple_botella',   'Syrup simple — Botellas de repuesto',                     'insumos_coctel', 'qty', 'und', 1, 1),
  ('syrup_simple_fraccion',  'Syrup simple — Abierta',                                  'insumos_coctel', 'gauge', null, null, null),
  ('sweet_sour_botella',     'Sweet and Sour — Botellas de repuesto',                   'insumos_coctel', 'qty', 'und', 1, 1),
  ('sweet_sour_fraccion',    'Sweet and Sour — Abierta',                                'insumos_coctel', 'gauge', null, null, null),
  ('sirope_maracuya_botella','Sirope de maracuyá — Botellas de repuesto',               'insumos_coctel', 'qty', 'und', 1, 1),
  ('sirope_maracuya_fraccion','Sirope de maracuyá — Abierta',                           'insumos_coctel', 'gauge', null, null, null),
  ('agua_tonica',            'Agua tónica',                                             'insumos_coctel', 'qty', 'und', 1, 2),

  -- Shots — Botella (cantidad) + Fracción (gauge)
  ('shot_jd_botella',            'Whisky Jack Daniel''s — Botellas de repuesto',              'shots', 'qty', 'und', 1, 1),
  ('shot_jd_fraccion',           'Whisky Jack Daniel''s — Abierta',                           'shots', 'gauge', null, null, null),
  ('shot_jw_black_botella',      'Whisky Johnnie Walker Black — Botellas de repuesto',        'shots', 'qty', 'und', 1, 1),
  ('shot_jw_black_fraccion',     'Whisky Johnnie Walker Black — Abierta',                     'shots', 'gauge', null, null, null),
  ('shot_bw_botella',            'Black & White — Botellas de repuesto',                      'shots', 'qty', 'und', 1, 1),
  ('shot_bw_fraccion',           'Black & White — Abierta',                                   'shots', 'gauge', null, null, null),
  ('shot_aguard_amarillo_botella','Aguardiente Amarillo (para shots) — Botellas de repuesto', 'shots', 'qty', 'und', 1, 1),
  ('shot_aguard_amarillo_fraccion','Aguardiente Amarillo (para shots) — Abierta',             'shots', 'gauge', null, null, null),
  ('shot_cuervo_botella',        'Tequila Jose Cuervo Especial — Botellas de repuesto',       'shots', 'qty', 'und', 1, 1),
  ('shot_cuervo_fraccion',       'Tequila Jose Cuervo Especial — Abierta',                    'shots', 'gauge', null, null, null),
  ('shot_ron_caldas_botella',    'Ron 1/2 Viejo de Caldas (para shots) — Botellas de repuesto','shots', 'qty', 'und', 1, 1),
  ('shot_ron_caldas_fraccion',   'Ron 1/2 Viejo de Caldas (para shots) — Abierta',            'shots', 'gauge', null, null, null),
  ('pitillos',                   'Pitillos',                                                   'shots', 'qty', 'paq', 1, 2),

  -- Botellas de trago — solo por unidad, sin fracción (se venden enteras)
  ('botrago_amarillo_media',   'Aguardiente Amarillo — Media 375ml',      'botellas_trago', 'qty', 'und', 1, 2),
  ('botrago_amarillo_750',     'Aguardiente Amarillo — Botella 750ml',    'botellas_trago', 'qty', 'und', 1, 2),
  ('botrago_azul_media',       'Antioqueño Azul — Media 375ml',           'botellas_trago', 'qty', 'und', 1, 2),
  ('botrago_azul_750',         'Antioqueño Azul — Botella 750ml',         'botellas_trago', 'qty', 'und', 1, 2),
  ('botrago_ron_caldas',       'Ron 1/2 Viejo de Caldas — Botella (venta)','botellas_trago', 'qty', 'und', 1, 1),
  ('botrago_smirnoff_lulo',    'Smirnoff Lulo — Botella (venta)',         'botellas_trago', 'qty', 'und', 1, 1),

  -- Bebidas — cantidad
  ('agua_hatsu',            'Agua Hatsu',                    'mezcladores', 'qty', 'und', 1, 6),
  ('agua_con_gas_hatsu',    'Agua con gas Hatsu',            'mezcladores', 'qty', 'und', 1, 6),
  ('agua_cristal',          'Agua Cristal',                  'mezcladores', 'qty', 'und', 1, 6),
  ('coca_cola_250',         'Coca Cola 250ml',                'mezcladores', 'qty', 'und', 1, 6),
  ('coca_cola_zero_250',    'Coca Cola Zero 250ml',           'mezcladores', 'qty', 'und', 1, 6),
  ('coca_cola_400',         'Coca Cola 400ml',                'mezcladores', 'qty', 'und', 1, 6),
  ('coca_cola_zero_400',    'Coca Cola Zero 400ml',           'mezcladores', 'qty', 'und', 1, 6),
  ('sprite_400',            'Sprite',                         'mezcladores', 'qty', 'und', 1, 6),
  ('ginger_canada_dry',     'Ginger Ale - Canada Dry',        'mezcladores', 'qty', 'und', 1, 6),
  ('bretana',               'Bretaña',                        'mezcladores', 'qty', 'und', 1, 6),
  ('soda_hatsu',            'Soda Hatsu',                     'mezcladores', 'qty', 'und', 1, 6),
  ('soda_schweppes',        'Soda Schweppes',                 'mezcladores', 'qty', 'und', 1, 6),
  ('te_hatsu',              'Té Hatsu',                       'mezcladores', 'qty', 'und', 1, 6),

  -- Cafés — cantidad
  ('cafe_americano',        'Americano (cápsula x1)',              'cafes', 'qty', 'cáps', 1, 10),
  ('cafe_latte_macchiato',  'Latte Macchiato Vanilla (cápsula x2)','cafes', 'qty', 'cáps', 2, 10),
  ('cafe_capuchino',        'Capuchino (cápsula x2)',              'cafes', 'qty', 'cáps', 2, 10),
  ('cafe_chococino',        'Chocochino (cápsula x2)',             'cafes', 'qty', 'cáps', 2, 10),
  ('cafe_chai',             'Chai Tea Latte (cápsula x2)',         'cafes', 'qty', 'cáps', 2, 10),
  ('aromaticas_sabores',    'Aromáticas de sabores (bolsita)',     'cafes', 'qty', 'und', 1, 10),
  ('galletas',              'Galletas',                             'cafes', 'qty', 'bolsa', 1, 2),
  ('brownie',               'Brownie',                              'cafes', 'qty', 'und', 1, 20),
  ('bolsitas_azucar',       'Bolsitas de azúcar',                  'cafes', 'qty', 'und', 10, 20),
  ('agitadores',            'Agitadores',                           'cafes', 'qty', 'und', 10, 20),

  -- Insumos frescos de coctelería — gauge
  ('limon_fresco',       'Limón fresco (para garnish)',   'cocteleria', 'gauge', null, null, null),
  ('hielo',               'Hielo',                          'cocteleria', 'gauge', null, null, null),
  ('menta_hierbabuena',   'Menta / Hierbabuena',            'cocteleria', 'gauge', null, null, null),
  ('azucar_blanca',       'Azúcar',                         'cocteleria', 'gauge', null, null, null),
  ('sal',                 'Sal (para escarchar)',           'cocteleria', 'gauge', null, null, null),

  -- Cocina — cantidad por unidad o peso
  ('pan_brioche',       'Pan brioche',                            'cocina', 'qty', 'und', 1, 24),
  ('pan_perro',         'Pan para perro',                         'cocina', 'qty', 'und', 1, 8),
  ('carne_res_hamb',    'Carne Hamburguesa 100 (Cerdo y res)',    'cocina', 'qty', 'und', 1, 48),
  ('carne_angus',       'Carne Hamburguesa 150 (Angus)',          'cocina', 'qty', 'und', 1, 24),
  ('carne_vegetal',     'Carne de Proteína Vegetal',              'cocina', 'qty', 'und', 1, 5),
  ('carne_pollo',       'Hamburguesa 150g pollo',                 'cocina', 'qty', 'und', 1, 10),
  ('carne_res_picada',  'Res para picada',                        'cocina', 'qty', 'g', 100, 450),
  ('carne_cerdo',       'Cerdo para picada',                      'cocina', 'qty', 'g', 100, 450),
  ('pechuga_apanada',   'Pechuga Picada',                         'cocina', 'qty', 'g', 100, 450),
  ('alitas',            'Alas (paquete x10)',                     'cocina', 'qty', 'paq', 1, 5),
  ('tocineta',          'Tocineta',                               'cocina', 'qty', 'g', 100, 500),
  ('chorizo',            'Chorizo Santarrosano / Choripapa',      'cocina', 'qty', 'und', 1, 20),
  ('queso_mozzarella',  'Queso mozzarella (lonchitas)',           'cocina', 'qty', 'g', 100, 1000),
  ('queso_cheddar',     'Queso cheddar',                          'cocina', 'qty', 'g', 100, 500),
  ('queso_costeno',     'Queso Costeño sin sal',                  'cocina', 'qty', 'g', 100, 500),
  ('queso_azul_cocina', 'Queso Azul (para salsa)',                'cocina', 'qty', 'g', 50, 200),
  ('huevo',              'Huevo',                                  'cocina', 'qty', 'und', 1, 12),
  ('champinon',          'Champiñón',                             'cocina', 'qty', 'g', 50, 300),
  ('lechuga_crespa',    'Lechuga crespa',                         'cocina', 'qty', 'g', 50, 200),
  ('lechuga_rugula',    'Lechuga rúgula',                        'cocina', 'qty', 'g', 50, 150),
  ('tomate',             'Tomate',                                 'cocina', 'qty', 'g', 50, 300),
  ('tomate_cherry',     'Tomate Cherry',                          'cocina', 'qty', 'g', 50, 200),
  ('cebolla_blanca',    'Cebolla blanca',                         'cocina', 'qty', 'g', 50, 300),
  ('cebolla_roja',      'Cebolla roja',                           'cocina', 'qty', 'g', 50, 200),
  ('cebolla_crispy',    'Cebolla crispy',                         'cocina', 'qty', 'g', 100, 1000),
  ('zuquini_amarillo',  'Zuquini amarillo',                       'cocina', 'qty', 'g', 50, 200),
  ('zuquini_verde',     'Zuquini verde',                          'cocina', 'qty', 'g', 50, 200),
  ('platano_maduro',    'Plátano maduro',                        'cocina', 'qty', 'g', 50, 300),
  ('papas_francesas',   'Papas francesas (de bulto)',             'cocina', 'qty', 'g', 5000, 5000),
  ('papa_smile',         'Papa Smile',                             'cocina', 'qty', 'und', 1, 10),
  ('aros_cebolla',      'Aros de cebolla',                        'cocina', 'qty', 'g', 100, 500),
  ('empanadas',          'Empanadas (carne/pollo)',                'cocina', 'qty', 'und', 1, 50),
  ('cojines_queso',     'Cojines de queso',                       'cocina', 'qty', 'und', 1, 10),
  ('deditos_queso',     'Deditos de queso',                       'cocina', 'qty', 'und', 1, 8),
  ('aborrajados',        'Aborrajados',                            'cocina', 'qty', 'und', 1, 6),
  ('arepa_queso',        'Arepa de queso',                         'cocina', 'qty', 'und', 1, 6),
  ('maiz_tierno',        'Maíz tierno dulce',                     'cocina', 'qty', 'g', 100, 500),
  ('cafe_instantaneo',  'Café instantáneo (cocina)',              'cocina', 'qty', 'g', 50, 100),

  -- Salsas de la casa — gauge
  ('salsa_happy',          'Salsa Happy (queso azul)',        'salsas', 'gauge', null, null, null),
  ('salsa_guayaba',        'Salsa de Guayaba',                 'salsas', 'gauge', null, null, null),
  ('mermelada_tomate',     'Mermelada de tomate cherry',       'salsas', 'gauge', null, null, null),
  ('aji_mango',            'Ají de mango',                     'salsas', 'gauge', null, null, null),
  ('miel_mostaza',         'Miel Mostaza',                      'salsas', 'gauge', null, null, null),
  ('salsa_bbq',            'Salsa BBQ',                         'salsas', 'gauge', null, null, null),
  ('teriyaki',             'Teriyaki',                          'salsas', 'gauge', null, null, null),
  ('pico_gallo',           'Pico de gallo',                     'salsas', 'gauge', null, null, null),
  ('hogado',               'Hogado',                            'salsas', 'gauge', null, null, null),
  ('salsa_mostaza_trad',   'Salsa mostaza tradicional',         'salsas', 'gauge', null, null, null),
  ('salsa_mayonesa',       'Salsa Mayonesa',                    'salsas', 'gauge', null, null, null),
  ('salsa_tomate',         'Salsa de Tomate',                   'salsas', 'gauge', null, null, null),
  ('salsa_humo',           'Salsa Humo',                        'salsas', 'gauge', null, null, null),

  -- Aseo e insumos — gauge
  ('vinipel',              'Vinipel',                                'aseo', 'gauge', null, null, null),
  ('limpiador_pisos',      'Limpiador de pisos',                     'aseo', 'gauge', null, null, null),
  ('servilletas_blancas',  'Servilletas blancas (mesa)',             'aseo', 'gauge', null, null, null),
  ('servilletas_manos',    'Servilletas de manos',                   'aseo', 'gauge', null, null, null),
  ('alcohol',              'Alcohol',                                 'aseo', 'gauge', null, null, null),
  ('aromatizante',         'Aromatizante',                            'aseo', 'gauge', null, null, null),
  ('jabon_manos',          'Jabón de manos',                         'aseo', 'gauge', null, null, null),
  ('raid',                 'Raid (insecticida)',                     'aseo', 'gauge', null, null, null),
  ('vasos_plasticos',      'Vasos plásticos',                        'aseo', 'gauge', null, null, null),
  ('notas_comandas',       'Notas para comandas',                    'aseo', 'gauge', null, null, null),
  ('papel_higienico',      'Papel higiénico',                        'aseo', 'gauge', null, null, null),
  ('papel_quimico',        'Papel de impresora',                     'aseo', 'gauge', null, null, null),
  ('bolsas_negras',        'Bolsas negras',                           'aseo', 'gauge', null, null, null),
  ('bolsas_blancas',       'Bolsas blancas',                          'aseo', 'gauge', null, null, null),
  ('bolsas_verdes',        'Bolsas verdes',                           'aseo', 'gauge', null, null, null),

  -- Otros
  ('cigarrillos_marlboro', 'Marlboro Rojo (cajetilla)', 'otros', 'qty', 'und', 1, 5);

-- ============================================================================
-- ESTADO INICIAL DE INVENTARIO — una fila por item, arrancando en 0 / agotado
-- (igual que defaultItems() del original la primera vez que corre la app)
-- ============================================================================
insert into public.item_status (item_id, status_gauge, qty)
select id, case when mode = 'gauge' then 'agotado' else null end,
          case when mode = 'qty' then 0 else null end
from public.items;

-- ============================================================================
-- MESAS (TABLES)
-- ============================================================================
insert into public.restaurant_tables (id, sort_order) values
  ('T1',1),('T2',2),('T3',3),('T4',4),('T5',5),
  ('S6',6),('S7',7),('S8',8),('S9',9),('S10',10),('S11',11),
  ('B1',12),('B2',13),('B3',14),('B4',15),('B5',16),('B6',17);

-- ============================================================================
-- PARES A VIGILAR (PAIRS)
-- ============================================================================
insert into public.pair_watches (label, item_a, item_b, sort_order) values
  ('Pan brioche vs. Carne Hamburguesa (res/cerdo)', 'pan_brioche', 'carne_res_hamb', 1),
  ('Pan para perro vs. Chorizo',                    'pan_perro',   'chorizo',        2);

-- ============================================================================
-- CATEGORÍAS DE MENÚ (MENU_CATS)
-- ============================================================================
insert into public.menu_categories (id, label, sort_order) values
  ('hamburguesas',      '🍔 Burgers',    1),
  ('entradas',           '🥟 Entradas',   2),
  ('picadas',             '🍗 Picadas',    3),
  ('bebidas_frias',      '🥤 Frías',      4),
  ('bebidas_calientes',  '☕ Calientes',  5),
  ('cocteles',            '🍹 Cócteles',   6),
  ('tragos',              '🥃 Tragos',     7);

-- ============================================================================
-- MENÚ (MENU) — id, name, price, category
-- ============================================================================
insert into public.menu_items (id, name, price, category) values
  ('m_happy_rock',        'Happy Rock (De la Casa)',      36000, 'hamburguesas'),
  ('m_happy_mixes',       'Happy Mixes',                   34000, 'hamburguesas'),
  ('m_happy_reggae',      'Happy Reggae',                  36000, 'hamburguesas'),
  ('m_happy_pop',         'Happy Pop',                     38000, 'hamburguesas'),
  ('m_happy_salsa',       'Happy Salsa',                   36000, 'hamburguesas'),
  ('m_happy_disco',       'Happy Disco',                   37000, 'hamburguesas'),
  ('m_happy_rockstar',    'Happy Rockstar',                39000, 'hamburguesas'),
  ('m_happy_vegetariana', 'Happy Vegetariana',             34000, 'hamburguesas'),
  ('m_happy_pollo',       'Happy de Pollo',                30000, 'hamburguesas'),
  ('m_chori_pan',         'Chori Pan',                      28000, 'hamburguesas'),
  ('m_emp_carne',         'Empanadas de carne x4',         16000, 'entradas'),
  ('m_emp_pollo',         'Empanadas de pollo x5',         16000, 'entradas'),
  ('m_emp_mixtas',        'Empanadas mixtas x6',            22000, 'entradas'),
  ('m_deditos',           'Deditos de queso x4',           16000, 'entradas'),
  ('m_aborrajados',       'Aborrajados x3',                 18000, 'entradas'),
  ('m_arepa_chorizo',     'Arepa con Chorizo',              14000, 'entradas'),
  ('m_choripapa',         'Choripapa',                       20000, 'entradas'),
  ('m_anillos',           'Anillos de Cebolla x6',         10000, 'entradas'),
  ('m_papas_solas',       'Papas Francesa 300gr',          10000, 'entradas'),
  ('m_alitas_10',         'Alitas Hot x10',                  33000, 'picadas'),
  ('m_alitas_20',         'Alitas Hot x20',                  62000, 'picadas'),
  ('m_picada_carnes',     'Picada Carnes',                   72000, 'picadas'),
  ('m_andina_light',      'Andina Light (lata)',             8000,  'bebidas_frias'),
  ('m_andina_light_botella', 'Andina Light (botella)',       8000,  'bebidas_frias'),
  ('m_andina_dorada',     'Andina Dorada',                   12000, 'bebidas_frias'),
  ('m_budweiser',         'Budweiser',                        12000, 'bebidas_frias'),
  ('m_club_colombia',     'Club Colombia',                   13000, 'bebidas_frias'),
  ('m_heineken',          'Heineken (lata)',                   13000, 'bebidas_frias'),
  ('m_heineken_botella',  'Heineken (botella)',                13000, 'bebidas_frias'),
  ('m_stella',            'Stella Artois',                    14000, 'bebidas_frias'),
  ('m_coronita',          'Coronita',                          13000, 'bebidas_frias'),
  ('m_corona',            'Corona (botella)',                  16000, 'bebidas_frias'),
  ('m_corona_lata',       'Corona (lata)',                     16000, 'bebidas_frias'),
  ('m_corona_light',      'Corona Light',                    16000, 'bebidas_frias'),
  ('m_corona_cero_lata',    'Corona Cero (lata)',            16000, 'bebidas_frias'),
  ('m_corona_cero_botella', 'Corona Cero (botella)',         16000, 'bebidas_frias'),
  ('m_poker',             'Poker (lata)',                     13000, 'bebidas_frias'),
  ('m_central',           'Central',                            8000,  'bebidas_frias'),
  ('m_tres_cord',         'Tres Cordilleras Rosada',       13000, 'bebidas_frias'),
  ('m_coca_400',          'Coca Cola 400ml',                 8000,  'bebidas_frias'),
  ('m_sprite',            'Sprite',                              8000,  'bebidas_frias'),
  ('m_coca_250',          'Coca Cola 250ml',                 4500,  'bebidas_frias'),
  ('m_red_bull',          'Red Bull',                          15000, 'bebidas_frias'),
  ('m_agua_hatsu',        'Agua Hatsu',                        7000,  'bebidas_frias'),
  ('m_agua_gas_hatsu',    'Agua con gas Hatsu',              7000,  'bebidas_frias'),
  ('m_bretana',           'Bretaña',                            10000, 'bebidas_frias'),
  ('m_te_hatsu',          'Té Hatsu',                           10000, 'bebidas_frias'),
  ('m_soda_hatsu',        'Soda Hatsu',                        8500,  'bebidas_frias'),
  ('m_canada_dry',        'Canada Dry',                        8500,  'bebidas_frias'),
  ('m_chococino',         'Chococino',                          10000, 'bebidas_calientes'),
  ('m_americano',         'Americano',                          6000,  'bebidas_calientes'),
  ('m_capuchino',         'Capuchino',                          9500,  'bebidas_calientes'),
  ('m_latte_vainilla',    'Latte Macchiato Vanilla',        9500,  'bebidas_calientes'),
  ('m_chai_latte',        'Chai Tea Latte',                    9500,  'bebidas_calientes'),
  ('m_arom_sabores',      'Aromática de sabores',             4000,  'bebidas_calientes'),
  ('m_arom_hierbabuena',  'Aromática hierbabuena',           4500,  'bebidas_calientes'),
  ('m_arom_frutas',       'Aromática frutas naturales',    6000,  'bebidas_calientes'),
  ('m_tom_collins',       'Tom Collins',                        30000, 'cocteles'),
  ('m_margarita',         'Margarita',                          30000, 'cocteles'),
  ('m_margarita_sabores', 'Margarita sabores',                30000, 'cocteles'),
  ('m_paloma',            'Paloma',                              31000, 'cocteles'),
  ('m_mojito',            'Mojito',                              31000, 'cocteles'),
  ('m_mojito_sabores',    'Mojito de sabores',                31000, 'cocteles'),
  ('m_cuba_libre',        'Cuba libre',                        30000, 'cocteles'),
  ('m_daiquiri',          'Daiquirí',                           30000, 'cocteles'),
  ('m_tequila_sunrise',   'Tequila sunrise',                  31000, 'cocteles'),
  ('m_gin_tonic',         'Gin tonic',                          31000, 'cocteles'),
  ('m_tequila_tonic',     'Tequila tonic',                    34000, 'cocteles'),
  ('m_virgin_mojito',     'Virgin mojito (sin alcohol)',    20000, 'cocteles'),
  ('m_coctel_frances',    'Coctel francés (sin alcohol)', 20000, 'cocteles'),
  ('m_paloma_sa',         'Paloma (sin alcohol)',            20000, 'cocteles'),
  ('m_soda_italiana',     'Soda italiana (sin alcohol)',   20000, 'cocteles'),
  ('m_shot_cuervo',       'Shot Jose Cuervo',                  20000, 'tragos'),
  ('m_shot_bw',           'Shot Black And White',            15000, 'tragos'),
  ('m_shot_jd',           'Shot Jack Daniels',                  25000, 'tragos'),
  ('m_shot_bl',           'Shot Black Label',                  30000, 'tragos'),
  ('m_shot_azul',         'Shot Antioqueño Azul',            14000, 'tragos'),
  ('m_shot_amarillo',     'Shot Aguardiente Amarillo',       12000, 'tragos'),
  ('m_botella_azul_media','Antioqueño Azul — Media 375ml', 100000,'tragos'),
  ('m_botella_azul_750',  'Antioqueño Azul — Botella 750ml',160000,'tragos'),
  ('m_botella_amar_media','Aguardiente Amarillo — Media 375ml',95000,'tragos'),
  ('m_botella_amar_750',  'Aguardiente Amarillo — Botella 750ml',150000,'tragos');

-- ============================================================================
-- RECETAS DE DESCUENTO DE INVENTARIO (m.dec[] del MENU original)
-- Productos con dec:[] (cócteles, tragos por trago, aromáticas naturales) no
-- descuentan inventario exacto — así era en el original ("no descuenta inventario
-- exacto") y no se listan acá.
-- ============================================================================
insert into public.menu_item_ingredients (menu_item_id, item_id, qty) values
  ('m_happy_rock',        'pan_brioche', 1), ('m_happy_rock',        'carne_res_hamb', 1), ('m_happy_rock',        'papas_francesas', 300),
  ('m_happy_mixes',       'pan_brioche', 1), ('m_happy_mixes',       'carne_res_hamb', 1), ('m_happy_mixes',       'papas_francesas', 300),
  ('m_happy_reggae',      'pan_brioche', 1), ('m_happy_reggae',      'carne_res_hamb', 1), ('m_happy_reggae',      'papas_francesas', 300),
  ('m_happy_pop',         'pan_brioche', 1), ('m_happy_pop',         'carne_res_hamb', 1), ('m_happy_pop',         'papas_francesas', 300),
  ('m_happy_salsa',       'pan_brioche', 1), ('m_happy_salsa',       'carne_res_hamb', 1), ('m_happy_salsa',       'papas_francesas', 300),
  ('m_happy_disco',       'pan_brioche', 1), ('m_happy_disco',       'carne_res_hamb', 1), ('m_happy_disco',       'papas_francesas', 300),
  ('m_happy_rockstar',    'pan_brioche', 1), ('m_happy_rockstar',    'carne_angus', 1),    ('m_happy_rockstar',    'papas_francesas', 300),
  ('m_happy_vegetariana', 'pan_brioche', 1), ('m_happy_vegetariana', 'carne_vegetal', 1),  ('m_happy_vegetariana', 'papas_francesas', 300),
  ('m_happy_pollo',       'pan_brioche', 1), ('m_happy_pollo',       'carne_pollo', 1),    ('m_happy_pollo',       'papas_francesas', 300),
  ('m_chori_pan',         'pan_perro', 1),   ('m_chori_pan',         'chorizo', 1),        ('m_chori_pan',         'papas_francesas', 150),
  ('m_emp_carne',         'empanadas', 4),
  ('m_emp_pollo',         'empanadas', 5),
  ('m_emp_mixtas',        'empanadas', 6),
  ('m_deditos',           'deditos_queso', 4),
  ('m_aborrajados',       'aborrajados', 3),
  ('m_arepa_chorizo',     'arepa_queso', 1), ('m_arepa_chorizo',     'chorizo', 1),
  ('m_choripapa',         'chorizo', 2),     ('m_choripapa',         'papas_francesas', 300),
  ('m_anillos',           'aros_cebolla', 100),
  ('m_papas_solas',       'papas_francesas', 300),
  ('m_alitas_10',         'papas_francesas', 200), ('m_alitas_10',   'papa_smile', 1),
  ('m_alitas_20',         'papas_francesas', 300), ('m_alitas_20',   'papa_smile', 1),
  ('m_picada_carnes',     'carne_res_picada', 90), ('m_picada_carnes','carne_cerdo', 90), ('m_picada_carnes','pechuga_apanada', 90),
  ('m_picada_carnes',     'chorizo', 1), ('m_picada_carnes', 'empanadas', 2), ('m_picada_carnes', 'arepa_queso', 1),
  ('m_picada_carnes',     'papas_francesas', 300), ('m_picada_carnes', 'aros_cebolla', 100), ('m_picada_carnes', 'platano_maduro', 150),
  ('m_andina_light',      'andina_light', 1),
  ('m_andina_light_botella', 'andina_light_botella', 1),
  ('m_andina_dorada',     'andina_dorada', 1),
  ('m_budweiser',         'budweiser', 1),
  ('m_club_colombia',     'club_colombia', 1),
  ('m_heineken',          'heineken', 1),
  ('m_heineken_botella',  'heineken_botella', 1),
  ('m_stella',            'stella', 1),
  ('m_coronita',          'coronita', 1),
  ('m_corona',            'corona', 1),
  ('m_corona_lata',       'corona_lata', 1),
  ('m_corona_light',      'corona_light', 1),
  ('m_corona_cero_lata',    'corona_cero_lata', 1),
  ('m_corona_cero_botella', 'corona_cero_botella', 1),
  ('m_poker',             'poker', 1),
  ('m_central',           'central', 1),
  ('m_tres_cord',         'tres_cordilleras', 1),
  ('m_coca_400',          'coca_cola_400', 1),
  ('m_sprite',            'sprite_400', 1),
  ('m_coca_250',          'coca_cola_250', 1),
  ('m_red_bull',          'red_bull', 1),
  ('m_agua_hatsu',        'agua_hatsu', 1),
  ('m_agua_gas_hatsu',    'agua_con_gas_hatsu', 1),
  ('m_bretana',           'bretana', 1),
  ('m_te_hatsu',          'te_hatsu', 1),
  ('m_soda_hatsu',        'soda_hatsu', 1),
  ('m_canada_dry',        'ginger_canada_dry', 1),
  ('m_chococino',         'cafe_chococino', 2),
  ('m_americano',         'cafe_americano', 1),
  ('m_capuchino',         'cafe_capuchino', 2),
  ('m_latte_vainilla',    'cafe_latte_macchiato', 2),
  ('m_chai_latte',        'cafe_chai', 2),
  ('m_arom_sabores',      'aromaticas_sabores', 1),
  ('m_botella_azul_media','botrago_azul_media', 1),
  ('m_botella_azul_750',  'botrago_azul_750', 1),
  ('m_botella_amar_media','botrago_amarillo_media', 1),
  ('m_botella_amar_750',  'botrago_amarillo_750', 1);

-- ============================================================================
-- TARIFAS POR HORA (DEFAULT_RATES)
-- ============================================================================
insert into public.hourly_rates (id, mesero_t1, mesero_t2, mesero_t3, cocinero_flat)
values (1, 8000, 8500, 9000, 9500);

-- ============================================================================
-- GEOCERCA (VENUE, ARRIVE_RADIUS_M, LEAVE_RADIUS_M)
-- ============================================================================
insert into public.geofence_settings (id, venue_lat, venue_lng, arrive_radius_m, leave_radius_m)
values (1, 4.649432, -74.061204, 70, 150);

-- ============================================================================
-- SERVICIOS / VENCIMIENTOS (SERVICIOS) — sin día configurado todavía
-- (el original tampoco trae defaults de día; el jefe los define desde Vencimientos)
-- ============================================================================
insert into public.utility_bills (service_id, label, due_day) values
  ('internet', '📶 Internet', null),
  ('agua',      '💧 Agua',     null),
  ('luz',       '💡 Luz',      null),
  ('gas',       '🔥 Gas',      null),
  ('arriendo',  '🏠 Arriendo', null);

-- ============================================================================
-- TAREA DE ASEO SUGERIDA POR DÍA DE SEMANA (DEFAULT_CLEANING_MESAS/COCINA)
-- 0=domingo … 6=sábado
-- ============================================================================
insert into public.default_weekday_tasks (weekday, shift_type, task) values
  (0, 'mesa',   'Chiller'),
  (1, 'mesa',   'Ventanas y 1 jarra de agua x matera'),
  (2, 'mesa',   'Barra y toldo'),
  (3, 'mesa',   'Pisos y 1 jarra de agua x matera'),
  (4, 'mesa',   'Limpieza de polvo'),
  (5, 'mesa',   'Baño y canecas de basura, 1 jarra de agua x matera'),
  (6, 'mesa',   'Neveras y muebles'),
  (0, 'cocina', 'Ollas y canecas de basura'),
  (1, 'cocina', 'Ventanas'),
  (2, 'cocina', 'Paredes y pisos'),
  (3, 'cocina', 'Ollas y canecas de basura'),
  (4, 'cocina', 'Neveras'),
  (5, 'cocina', 'Campana'),
  (6, 'cocina', 'Mesones y muebles');

-- ============================================================================
-- PROMO SUGERIDA POR DÍA DE SEMANA (DEFAULT_PROMOS) — solo referencia
-- ============================================================================
insert into public.default_weekday_promos (weekday, promo) values
  (0, 'NA'),
  (1, 'Hamburguesa + cerveza artesanal (gratis) antes de 9pm'),
  (2, 'Alitas con descuento del 15% todo el día'),
  (3, 'Cerveza artesanal de barril con 15% descuento antes de 9pm'),
  (4, 'Cócteles 2x1 antes de 7pm'),
  (5, 'Cerveza artesanal de barril con 15% descuento antes de 9pm'),
  (6, 'Hamburguesa + cerveza artesanal (gratis) antes de 7pm');

-- ============================================================================
-- Fin del seed. El primer jefe se crea desde /login (Paso 3), no acá — su PIN
-- nunca debe pasar por un script versionado.
-- ============================================================================
