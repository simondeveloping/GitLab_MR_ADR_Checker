# ADR-0002: Geheimnisse ausschließlich über die Umgebung

## Status

accepted (2026-03-04)

## Kontext

In mehreren Projekten der Abteilung standen Zugangsdaten für Datenbanken und
externe Dienste in eingecheckten Konfigurationsdateien. Ein Wechsel eines
Zugangs erforderte damit einen Commit, und die Historie enthält die alten
Geheimnisse dauerhaft.

## Entscheidung

Wir werden Zugangsdaten und Schlüssel ausschließlich zur Laufzeit aus
Umgebungsvariablen lesen.

- Kein Zugangsdatum, Schlüssel oder Token wird im Repository abgelegt.
- Jede benötigte Umgebungsvariable ist in `.env.example` mit einem
  Platzhalterwert dokumentiert.
- Dateien mit echten Werten (`.env`, `.env.local`) sind in `.gitignore`
  aufgeführt.
- Die CI/CD-Pipeline bezieht ihre Geheimnisse aus den geschützten Variablen des
  Projekts und nicht aus dem Repository.

## Considered Options

- Ein eigener Secrets-Manager: verworfen, weil er für die Größe der Projekte
  unverhältnismäßigen Betriebsaufwand bedeutet.
- Verschlüsselte Dateien im Repository: verworfen, weil der Schlüssel dann
  seinerseits verteilt werden muss.

## Konsequenzen

+ Ein Wechsel von Zugangsdaten erfordert keinen Commit.
+ Die Historie enthält keine Geheimnisse.
- Neue Entwickelnde müssen ihre lokale Umgebung selbst befüllen.
