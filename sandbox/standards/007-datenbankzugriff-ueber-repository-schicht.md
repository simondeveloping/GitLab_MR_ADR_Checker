# ADR-0007: Datenbankzugriff nur über die Repository-Schicht

## Status

accepted (2026-02-04)

## Kontext

Abfragen wurden an verschiedenen Stellen der Anwendung formuliert, unter
anderem direkt in HTTP-Routen. Ein Schemawechsel betraf damit über das Projekt
verteilte Stellen, und in Tests ließ sich der Datenzugriff nicht ersetzen.
Zusätzlich entstanden Abfragen durch Zusammensetzen von Zeichenketten, was die
Anwendung für Einschleusung von Fremdanweisungen öffnet.

## Entscheidung

Wir werden jeden Datenbankzugriff in einer eigenen Schicht kapseln.

- Abfragen liegen ausschließlich in Modulen unterhalb von `repositories/`.
- HTTP-Routen und UI-Komponenten greifen nur über die dort exportierten
  Funktionen auf Daten zu und öffnen keine eigene Verbindung.
- Abfragen werden parametrisiert übergeben; das Zusammensetzen von Abfragen
  aus Zeichenketten mit Nutzereingaben ist nicht zulässig.
- Jede schreibende Operation, die mehrere Tabellen betrifft, läuft in einer
  Transaktion.

## Considered Options

- Zugriff über ein ORM ohne eigene Schicht: verworfen, weil die
  Modellklassen dann in der gesamten Anwendung auftauchen.
- Abfragen in den Routen mit gemeinsamer Verbindungshilfe: verworfen, weil die
  Testbarkeit damit nicht gewonnen ist.

## Konsequenzen

+ Ein Schemawechsel betrifft nur die Repository-Schicht.
+ Der Datenzugriff ist in Tests zentral ersetzbar.
+ Parametrisierte Abfragen schließen eine ganze Fehlerklasse aus.
- Für jede Abfrage entsteht eine zusätzliche Funktion.
