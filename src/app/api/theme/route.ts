import { NextResponse } from "next/server";
import { isTheme, THEME_COOKIE, THEME_MAX_AGE } from "@/lib/theme";

export async function POST(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const json = request.headers.get("content-type")?.includes("application/json");
  let theme: unknown;
  let returnTo: unknown;
  try {
    if (json) {
      const body: unknown = await request.json();
      theme = body && typeof body === "object" && "theme" in body ? body.theme : undefined;
    } else {
      const form = await request.formData();
      theme = form.get("theme");
      returnTo = form.get("returnTo");
    }
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  if (!isTheme(theme)) {
    return NextResponse.json({ error: "theme must be light or dark" }, { status: 400 });
  }

  // Nur relative interne Ziele akzeptieren, damit der Theme-Submit nicht als
  // offener Redirect auf eine fremde Website missbraucht werden kann.
  const destination = new URL("/settings", url.origin);
  if (typeof returnTo === "string" && returnTo.startsWith("/")) {
    try {
      const candidate = new URL(returnTo, url.origin);
      if (candidate.origin === url.origin) destination.href = candidate.href;
    } catch {
      // Ungültige Rücksprungziele verwenden die Einstellungsseite.
    }
  }
  const response = json
    ? NextResponse.json({ theme })
    : NextResponse.redirect(destination, 303);
  response.cookies.set(THEME_COOKIE, theme, {
    httpOnly: true,
    maxAge: THEME_MAX_AGE,
    path: "/",
    sameSite: "lax",
    secure: url.protocol === "https:",
  });
  return response;
}
