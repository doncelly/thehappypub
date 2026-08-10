import { redirect } from "next/navigation";
import { getCurrentAppUser, landingFor, roleOf } from "@/lib/auth/current-user";

export default async function HomePage() {
  const user = await getCurrentAppUser();
  redirect(user ? landingFor(roleOf(user)) : "/login");
}
