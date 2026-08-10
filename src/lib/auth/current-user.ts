import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AppUser = {
  id: string;
  name: string;
  role: "jefe" | "staff";
  subrole: "mesero" | "cocinero" | null;
  active: boolean;
};

export type AppRole = "jefe" | "mesero" | "cocinero";

export function roleOf(user: Pick<AppUser, "role" | "subrole">): AppRole {
  return user.role === "jefe" ? "jefe" : (user.subrole as "mesero" | "cocinero");
}

export function landingFor(role: AppRole): string {
  return role === "jefe" ? "/panel" : "/mi-dia";
}

/**
 * Perfil del usuario logueado, o null si no hay sesión. `cache()` de React
 * hace que llamarlo varias veces en el mismo request (layout + page) solo
 * pegue una vez a Supabase.
 */
export const getCurrentAppUser = cache(async (): Promise<AppUser | null> => {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;

  const { data, error } = await supabase.rpc("current_app_user").single();
  if (error || !data) return null;

  return data as AppUser;
});

/** Para Server Components de páginas protegidas: exige sesión activa o redirige a /login. */
export async function requireUser(): Promise<AppUser> {
  const user = await getCurrentAppUser();
  if (!user || !user.active) redirect("/login");
  return user;
}

/** Exige uno de los roles dados; si no, redirige a la vista por defecto del usuario. */
export async function requireRole(...allowed: AppRole[]): Promise<AppUser> {
  const user = await requireUser();
  const role = roleOf(user);
  if (!allowed.includes(role)) redirect(landingFor(role));
  return user;
}
