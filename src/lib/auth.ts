/**
 * Geheimnisvergleich für die beiden eingehenden Schnittstellen.
 *
 * Sowohl der Webhook (Abschnitt 7.2.1) als auch der Callback aus der Sandbox
 * (Abschnitt 7.2.5) weisen sich mit einem gemeinsamen Geheimnis aus. Verglichen
 * wird in konstanter Zeit: Ein Vergleich, der beim ersten abweichenden Zeichen
 * abbricht, verrät über seine Laufzeit, wie viele Zeichen bereits stimmten, und
 * macht das Geheimnis damit schrittweise erratbar.
 */

import { timingSafeEqual } from "node:crypto";

/** Vergleicht zwei Geheimnisse laufzeitunabhängig vom Inhalt. */
export function secretMatches(
  provided: string | null | undefined,
  expected: string,
): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // Unterschiedliche Längen schließen eine Übereinstimmung ohnehin aus und
  // dürfen `timingSafeEqual` nicht erreichen, das sie mit einem Fehler quittiert.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Zieht das Token aus einem `Authorization: Bearer …`-Header. */
export function bearerToken(header: string | null): string | null {
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length);
}
