import type { AppRole } from "@/lib/auth/current-user";

export type NavItem = { href: string; label: string };

// Espejo de showApp() en el HTML original: qué pestañas ve cada rol y en qué orden.
const NAV_BY_ROLE: Record<AppRole, NavItem[]> = {
  jefe: [
    { href: "/panel", label: "Panel" },
    { href: "/mi-dia", label: "Mi día" },
    { href: "/inventario", label: "Inventario" },
    { href: "/agenda", label: "Agenda" },
    { href: "/caja", label: "Caja" },
    { href: "/recibidos", label: "Recibidos" },
    { href: "/vender", label: "Vender" },
    { href: "/pedidos", label: "Pedidos" },
    { href: "/perdidas", label: "Pérdidas" },
    { href: "/vencimientos", label: "Vencimientos" },
    { href: "/galeria", label: "Galería" },
    { href: "/personal", label: "Personal" },
  ],
  cocinero: [
    { href: "/mi-dia", label: "Mi día" },
    { href: "/pedidos", label: "Pedidos" },
    { href: "/checklist", label: "Checklist" },
    { href: "/inventario", label: "Inventario" },
    { href: "/recibidos", label: "Recibidos" },
    { href: "/perdidas", label: "Pérdidas" },
  ],
  mesero: [
    { href: "/mi-dia", label: "Mi día" },
    { href: "/checklist", label: "Checklist" },
    { href: "/inventario", label: "Inventario" },
    { href: "/caja", label: "Caja" },
    { href: "/recibidos", label: "Recibidos" },
    { href: "/vender", label: "Vender" },
    { href: "/perdidas", label: "Pérdidas" },
  ],
};

export function navForRole(role: AppRole): NavItem[] {
  return NAV_BY_ROLE[role];
}

const ROLE_LABEL: Record<AppRole, string> = {
  jefe: "Jefe / Administrador",
  mesero: "Mesero",
  cocinero: "Cocinero",
};

export function roleLabel(role: AppRole): string {
  return ROLE_LABEL[role];
}
