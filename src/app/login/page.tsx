import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAppUser, landingFor, roleOf } from "@/lib/auth/current-user";
import { Logo } from "@/components/Logo";
import { LoginForm } from "./LoginForm";
import { SetupForm } from "./SetupForm";

export default async function LoginPage() {
  const currentUser = await getCurrentAppUser();
  if (currentUser) {
    redirect(landingFor(roleOf(currentUser)));
  }

  // Lectura pública (RLS: "users: lectura publica para login", solo id/name/active
  // de usuarios activos) — necesaria para poblar el selector de nombre sin sesión,
  // igual que el <select id="loginName"> del original.
  const supabase = await createClient();
  const { data: users } = await supabase
    .from("users")
    .select("id, name")
    .eq("active", true)
    .order("name");

  const hasUsers = (users?.length ?? 0) > 0;

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-5">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-7">
        <div className="mb-3 flex flex-col items-center gap-2">
          <Logo width={160} />
          <div className="font-display text-2xl text-gold">The Happy Pub</div>
        </div>
        {hasUsers ? (
          <>
            <p className="mb-5 text-center text-sm text-text-dim">
              Selecciona tu nombre e ingresa tu PIN.
            </p>
            <LoginForm users={users!} />
          </>
        ) : (
          <>
            <p className="mb-2 text-center text-sm text-text-dim">
              Primer ingreso: crea la cuenta del jefe principal.
            </p>
            <div className="mb-4 rounded-lg border border-amber/30 bg-amber/10 px-3 py-2 text-[11.5px] leading-relaxed text-amber">
              Esta será la cuenta con acceso total. Podrás crear el resto del equipo
              después, desde Personal.
            </div>
            <SetupForm />
          </>
        )}
      </div>
    </div>
  );
}
