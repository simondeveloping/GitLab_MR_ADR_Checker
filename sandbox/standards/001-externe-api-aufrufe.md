# ADR-0001: Externe API-Aufrufe nur über die Service-Schicht

## Status

accepted (2026-02-11)

## Kontext

Die Anwendungen der Abteilung binden mehrere fremde HTTP-Schnittstellen ein
(Zahlungsdienst, Geokodierung, Benachrichtigungsversand). Rufen sowohl
UI-Komponenten als auch Hintergrundjobs diese Dienste unmittelbar auf, sind
Zeitlimits, Wiederholungsversuche und die Fehlerbehandlung an jeder Aufrufstelle
unterschiedlich umgesetzt. Ein Anbieterwechsel würde Änderungen an vielen über
das Projekt verteilten Stellen erfordern, und in Tests lässt sich der Zugriff
nach außen nur schwer ersetzen.

## Entscheidung

Wir werden alle Aufrufe externer Dienste ausschließlich in Modulen unterhalb von
`services/` kapseln.

- UI-Komponenten und Hintergrundjobs greifen nur über die dort exportierten
  Funktionen auf externe Dienste zu.
- Ein direkter Aufruf von `fetch` oder eines HTTP-Clients außerhalb von
  `services/` ist nicht zulässig.
- Jede Service-Funktion setzt ein Zeitlimit und gibt Fehler als typisiertes
  Ergebnisobjekt zurück, nicht als geworfene Ausnahme.

## Considered Options

- Direkte Aufrufe mit einer geteilten Hilfsfunktion für Zeitlimits: verworfen,
  weil die Disziplin nicht durchsetzbar ist.
- Ein generisches API-Gateway vor der Anwendung: verworfen wegen des
  Betriebsaufwands.

## Konsequenzen

+ Zeitlimits und Fehlerbehandlung sind an einer Stelle definiert.
+ Ein Anbieterwechsel betrifft nur die Service-Schicht.
+ Externe Aufrufe sind in Tests zentral ersetzbar.
- Für jeden neuen Endpunkt entsteht eine zusätzliche Indirektion.
- Bestehende direkte Aufrufe müssen migriert werden.
