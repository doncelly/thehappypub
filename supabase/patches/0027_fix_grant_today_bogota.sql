-- URGENTE: el patch 0026 creó public.today_bogota() pero se me olvidó el
-- grant execute — sin eso, ni siquiera "authenticated" puede EJECUTAR la
-- función, así que las policies de attendance que la usan (date =
-- public.today_bogota()) fallan al evaluarse para CUALQUIER usuario, no
-- solo en la ventana de las 7pm-medianoche. Este patch es el que de verdad
-- hace falta correr — sin este grant, el patch 0026 dejó el check-in/salida
-- de mesero/cocinero roto por completo, no solo de noche.

grant execute on function public.today_bogota() to anon, authenticated;
