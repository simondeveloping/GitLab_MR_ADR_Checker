import { NextResponse } from "next/server";

export async function POST(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const form = await request.formData();
  const theme = form.get("theme");
  const returnTo = form.get("returnTo");

  if (theme !== "light" && theme !== "dark") {
    return NextResponse.json({ error: "theme must be light or dark" }, { status: 400 });
  }

  // Nur relative interne Ziele akzeptieren, damit der Theme-Submit nicht als
  // offener Redirect auf eine fremde Website missbraucht werden kann.
  const destination = typeof returnTo === "string" && returnTo.startsWith("/") && !returnTo.startsWith("//")
    ? returnTo
    : "/settings";
  const response = NextResponse.redirect(new URL(destination, url.origin), 303);
  response.cookies.set("adr-review-theme", theme, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
    secure: url.protocol === "https:",
  });
  return response;
}
