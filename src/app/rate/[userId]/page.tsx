import { Logo } from "@/components/Logo";

// Página pública SIN login (equivalente a showRatingScreen del HTML original,
// activada antes vía ?rate=userId). Cualquiera con el link puede insertar en
// service_ratings — es la única escritura pública permitida por RLS (Paso 1/2).
// TODO(Paso 4): cargar el nombre del mesero (users.name por userId) y los 3 botones
// 😊/😐/😞 que hacen INSERT anónimo en service_ratings.
export default async function RatePage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return (
    <div className="flex min-h-[80vh] items-center justify-center px-5">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-7 text-center">
        <div className="mb-3 flex flex-col items-center gap-2">
          <Logo width={130} />
          <div className="font-display text-xl text-gold">The Happy Pub</div>
        </div>
        <p className="text-sm text-text-dim">
          Calificación de servicio — pendiente de migrar (Paso 4). userId: {userId}
        </p>
      </div>
    </div>
  );
}
