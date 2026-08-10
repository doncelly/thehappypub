// Ítems reales por área, sacados de "Check List_Sala_Terraza_Apertura_Cierre"
// (formato OP-FR-13). Cada área con lista se despliega en un dropdown con un
// checkbox por ítem; Música y Presentación personal no traían desglose en el
// documento fuente, así que quedan como un solo ítem (su propio nombre).
export const APERTURA_ITEMS: Record<string, string[]> = {
  Exteriores: ["Andén", "Caneca de basuras", "Ventanales", "Toldo"],
  Terraza: ["Piso", "Sillas", "Sofás", "Puerta", "Parlantes", "Toma de corriente"],
  Sala: ["Escalera", "Piso", "Sillas", "Sofás", "Mesas", "Materas", "Plantas", "Luces", "Luz de piso", "Juegos"],
  Barra: [
    "Nevera",
    "Lockers",
    "Computador",
    "Celulares",
    "Controles",
    "Caja",
    "Escritorio",
    "Chiller",
    "Shotsero",
    "Portavasos",
    "Decoración",
    "Cafés",
    "Cristalería",
    "Barriles",
    "Mueble",
    "Ceniceros",
    "Caja menor",
  ],
  Baño: ["Lavamanos", "Caneca de basura", "Orinal", "Inodoro", "Paredes", "Papel", "Ambientadores"],
  Música: ["Música"],
  "Presentación personal": ["Presentación personal"],
};

// Exteriores se agrega también en cierre a pedido explícito (el original no lo
// traía en CIERRE_AREAS; el documento fuente sí trae ítems de cierre para esa
// área, y se decidió incluirlos).
export const CIERRE_ITEMS: Record<string, string[]> = {
  Exteriores: ["Luces", "Materas/Vidrios", "Plantas", "Rompetráfico"],
  Terraza: ["Mesas", "Luces", "TV", "Calentador", "Olores", "Plato de perrito"],
  Sala: ["QR's", "Letreros luminosos", "Sonido", "Video Beam", "Paredes", "Tarima", "Techos", "Habladores", "Extintor", "CO2", "Olores"],
  Barra: [
    "Impresora",
    "Documentos",
    "Router",
    "Bold",
    "Extintor",
    "Mesón",
    "Saleros",
    "Utensilios de barra",
    "Cafetera",
    "CO2",
    "Licores",
    "Paredes",
    "Canecas de basura",
    "Telón",
    "Barra superior / Calculadoras",
    "Olores",
  ],
  Baño: ["Repisa", "Planta", "Cuadros", "Luz", "Jabón", "Servilletas", "Olores"],
};

export const APERTURA_AREAS = Object.keys(APERTURA_ITEMS);
export const CIERRE_AREAS = Object.keys(CIERRE_ITEMS);

// Todo ítem, marcado o no, dentro de cada área — usado para saber si una
// sección (apertura/cierre) está 100% lista.
export function allChecked(items: Record<string, string[]>, areas: Record<string, Record<string, boolean>>): boolean {
  return Object.entries(items).every(([area, list]) => list.every((item) => areas[area]?.[item]));
}
