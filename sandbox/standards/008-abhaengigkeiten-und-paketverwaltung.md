# ADR-0008: Einheitliche Paketverwaltung und festgelegte Laufzeit

## Status

accepted (2026-01-14)

## Kontext

In der Abteilung waren npm, yarn und pnpm parallel im Einsatz, teils innerhalb
desselben Projekts, was zu widersprüchlichen Sperrdateien und zu Abweichungen
zwischen lokaler Installation und CI führte. Ohne festgelegte Node-Version
liefen zudem lokale Entwicklung und Pipeline auf unterschiedlichen Laufzeiten,
was Fehler erzeugte, die sich lokal nicht reproduzieren ließen.

## Entscheidung

Wir werden npm als einziges Paketwerkzeug verwenden und die Laufzeitversion im
Projekt festschreiben.

- Im Repository liegt genau eine Sperrdatei, nämlich `package-lock.json`. Die
  Dateien `yarn.lock` und `pnpm-lock.yaml` sind nicht zulässig.
- Die `package.json` legt im Feld `engines.node` die zulässige Node-Version
  fest.
- Abhängigkeiten werden über Versionsangaben aus dem Paketregister bezogen;
  Verweise auf Git-URLs oder lokale Pfade sind nicht zulässig.
- Die CI-Pipeline installiert mit `npm ci` und nicht mit `npm install`, damit
  die Sperrdatei verbindlich bleibt.

## Considered Options

- pnpm wegen des geringeren Platzbedarfs: verworfen, weil die Umstellung aller
  Projekte den Nutzen nicht aufwiegt.
- Keine Festlegung, sondern Absprache im Team: verworfen, weil genau das der
  bisherige Zustand war.

## Konsequenzen

+ Lokale Installation und CI erzeugen denselben Abhängigkeitsbaum.
+ Ein Versionswechsel der Laufzeit ist im Repository nachvollziehbar.
- Entwickelnde müssen gegebenenfalls ihr gewohntes Werkzeug wechseln.
