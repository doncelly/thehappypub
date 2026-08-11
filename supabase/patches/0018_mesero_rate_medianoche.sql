-- Patch: la tarifa de mesero pasa de 3 franjas (antes de 11pm / 11pm-1am /
-- después de 1am) a 2, separadas a medianoche — $8.000 antes, $8.500 desde
-- medianoche. Ya está reflejado en supabase/schema.sql para instalaciones
-- nuevas — esto es solo para aplicarlo sobre el proyecto que ya corriste.
-- Correr después de 0001-0017.

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hourly_rates' and column_name = 'mesero_t1') then
    alter table public.hourly_rates rename column mesero_t1 to mesero_antes_medianoche;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hourly_rates' and column_name = 'mesero_t2') then
    alter table public.hourly_rates rename column mesero_t2 to mesero_despues_medianoche;
  end if;
end $$;

alter table public.hourly_rates drop column if exists mesero_t3;

update public.hourly_rates set mesero_antes_medianoche = 8000, mesero_despues_medianoche = 8500 where id = 1;
