// Bloques chicos de UI compartidos entre Panel y Agenda (ambos son paneles
// densos de solo-jefe con la misma gramática visual: secciones con título,
// filas de lista, estado vacío).

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="mb-2.5 flex items-center gap-2 font-accent text-lg text-text">
        <span className="h-3.5 w-[3px] rounded bg-navy" />
        {title}
      </div>
      {children}
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-[11.5px] text-text-faint">
      {text}
    </div>
  );
}

export function Row({ left, right, rightClass }: { left: React.ReactNode; right: React.ReactNode; rightClass?: string }) {
  return (
    <div className="flex justify-between gap-2 rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-[11.5px]">
      <span>{left}</span>
      <span className={rightClass}>{right}</span>
    </div>
  );
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wide text-text-faint">{children}</label>;
}

export const inputCls =
  "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] font-semibold text-text";

export function MiniButton({
  children,
  onClick,
  variant = "default",
  disabled,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "default" | "danger" | "warn";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const colorCls =
    variant === "danger" ? "text-red border-red/40" : variant === "warn" ? "text-amber border-amber/40" : "text-text-dim border-border";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`whitespace-nowrap rounded-md border bg-surface-2 px-2 py-1.5 text-[9.5px] font-semibold disabled:opacity-40 ${colorCls}`}
    >
      {children}
    </button>
  );
}
