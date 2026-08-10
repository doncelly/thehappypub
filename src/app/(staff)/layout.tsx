import { requireUser, roleOf } from "@/lib/auth/current-user";
import { navForRole, roleLabel } from "@/lib/nav";
import { Logo } from "@/components/Logo";
import { LogoutButton } from "./LogoutButton";
import { NavTabs } from "./NavTabs";

// Guard de sesión real: si no hay usuario activo, requireUser() redirige a /login.
// TODO(Paso 4): reemplazar el polling que tenía el original por Realtime en cada
// vista (ver comentario en supabase/schema.sql, sección 18).
export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const role = roleOf(user);

  return (
    <div>
      <header className="sticky top-0 z-20 border-b border-border bg-bg/95 px-3.5 pb-3 pt-5 backdrop-blur lg:px-6 lg:pb-4 lg:pt-6">
        <div className="flex items-center gap-3 lg:gap-4">
          <Logo width={112} className="w-14 lg:w-24" />
          <div>
            <div className="font-display text-2xl leading-none text-gold lg:text-4xl">The Happy Pub</div>
            <div className="mt-1.5 font-mono text-[9px] uppercase tracking-wide text-text-faint lg:text-[11px]">
              Control en vivo
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-xl border border-border bg-surface px-2.5 py-2 lg:mt-4 lg:px-4 lg:py-3">
          <div>
            <div className="text-[12.5px] font-semibold lg:text-[14px]">{user.name}</div>
            <div className="mt-0.5 font-mono text-[8.5px] uppercase tracking-wide text-gold lg:text-[9.5px]">
              {roleLabel(role)}
            </div>
          </div>
          <LogoutButton />
        </div>
        <NavTabs items={navForRole(role)} />
      </header>
      <main className="p-3.5">{children}</main>
    </div>
  );
}
