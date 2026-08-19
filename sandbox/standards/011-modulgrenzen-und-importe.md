# ADR-0011: Modulgrenzen werden über Importregeln durchgesetzt

## Status

accepted (2026-04-08)

## Kontext

Die Anwendung ist in Schichten aufgeteilt, aber ohne technische Absicherung der
Grenzen. In der Folge importierten Servicemodule UI-Bausteine, und Importe
griffen mit langen relativen Pfaden über mehrere Verzeichnisebenen hinweg. Eine
Verschiebung von Dateien brach dadurch Importe an unerwarteten Stellen, und die
Schichtung war aus dem Code nicht mehr ablesbar.

## Entscheidung

Wir werden die Schichtgrenzen als Importregeln festschreiben.

- Module unterhalb von `services/` und `repositories/` importieren nichts aus
  `components/` oder `pages/`.
- Importe zwischen Verzeichnissen verwenden den Alias `@/`; relative Pfade mit
  `../../` über mehr als eine Ebene sind nicht zulässig.
- Jedes Verzeichnis unterhalb von `services/` stellt seine öffentliche
  Schnittstelle über eine `index.ts` bereit; Importe greifen nicht auf
  Einzeldateien innerhalb eines fremden Servicemoduls zu.
- Die Regeln sind in der ESLint-Konfiguration hinterlegt, sodass ein Verstoß
  die Stufe `lint` der Pipeline scheitern lässt.

## Considered Options

- Aufteilung in getrennte Pakete eines Monorepos: verworfen, weil der
  Verwaltungsaufwand für die Größe der Projekte zu hoch ist.
- Grenzen nur in der Dokumentation festhalten: verworfen, weil ungeprüfte
  Regeln im Alltag erodieren.

## Konsequenzen

+ Die Schichtung ist aus den Importen ablesbar und technisch abgesichert.
+ Verschieben von Dateien bricht keine Importe über Verzeichnisgrenzen.
- Die ESLint-Konfiguration wird umfangreicher.
- Für jedes Servicemodul entsteht eine `index.ts`.
