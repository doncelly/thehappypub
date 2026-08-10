import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono, Bebas_Neue } from "next/font/google";
import "./globals.css";

// font-body/font-accent/font-mono en tailwind.config.ts apuntan a estas variables.
// Cheddar Gothic Serif (font-display) sigue por @font-face en globals.css, no por
// next/font, porque es un .ttf propio del dueño, no una fuente pública de Google.
const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono",
  display: "swap",
});
const bebasNeue = Bebas_Neue({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-accent",
  display: "swap",
});

export const metadata: Metadata = {
  title: "The Happy Pub — Control",
  description: "Control en vivo de inventario, turnos, pedidos y ventas.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${ibmPlexSans.variable} ${ibmPlexMono.variable} ${bebasNeue.variable}`}>
      <body>
        <div id="app" className="mx-auto max-w-2xl px-0 pb-16 lg:max-w-5xl">
          {children}
        </div>
      </body>
    </html>
  );
}
