import Image from "next/image";

const ASPECT_RATIO = 1332 / 1404; // alto/ancho reales de public/brand/logo.png

export function Logo({ width = 96, className = "" }: { width?: number; className?: string }) {
  return (
    <Image
      src="/brand/logo.png"
      alt="The Happy Pub"
      width={width}
      height={Math.round(width * ASPECT_RATIO)}
      priority
      className={`h-auto ${className}`}
    />
  );
}
