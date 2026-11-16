import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { ThemeProvider } from "@/components/theme-provider";
import { resolveTheme, THEME_COOKIE } from "@/lib/theme";
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
  const theme = resolveTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html lang="de" data-theme={theme} data-scroll-behavior="smooth">
      <body>
        <ThemeProvider initialTheme={theme}>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
