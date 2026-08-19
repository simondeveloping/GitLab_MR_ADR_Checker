import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ADR-Review",
  description:
    "Architekturkonformitäts-Review für GitLab Merge Requests auf Basis von Architecture Decision Records",
};

/** Die Oberfläche ist fest hell; der Browser soll nichts dunkel einfärben. */
export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
