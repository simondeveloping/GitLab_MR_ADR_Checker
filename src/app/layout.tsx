import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "ADR-Review",
  description:
    "Architekturkonformitäts-Review für GitLab Merge Requests auf Basis von Architecture Decision Records",
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: "#ffffff",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const storedTheme = (await cookies()).get("adr-review-theme")?.value;
  const theme = storedTheme === "dark" ? "dark" : "light";

  return (
    <html lang="de" data-theme={theme}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
