# ADR-0005: Eingehende Daten werden an der Systemgrenze validiert

## Status

accepted (2026-02-25)

## Kontext

Eingehende HTTP-Nutzlasten wurden in mehreren Diensten unmittelbar
weiterverarbeitet und dabei lediglich per Typzusicherung (`as`) auf die
erwartete Form gebracht. Eine Typzusicherung prüft zur Laufzeit nichts, sodass
fehlerhafte oder böswillige Eingaben erst tief in der Verarbeitung auffielen,
teils erst in der Datenbankschicht. Auch fehlende Umgebungsvariablen fielen
erst beim ersten Zugriff auf, also mitten im Betrieb statt beim Start.

## Entscheidung

Wir werden jede Eingabe von außen an der Systemgrenze zur Laufzeit gegen ein
Schema prüfen, bevor sie weiterverarbeitet wird.

- Jeder Anfragekörper wird über ein Schema validiert; die Verarbeitung erhält
  ausschließlich das Ergebnis dieser Validierung.
- Auf `request.body`, `req.query` und `req.params` wird ausschließlich in der
  Validierungsschicht der jeweiligen Route zugegriffen, nicht in der
  Geschäftslogik.
- Eine Typzusicherung mit `as` ersetzt keine Validierung und ist für Daten von
  außen nicht zulässig.
- Die benötigten Umgebungsvariablen werden beim Start des Prozesses zentral
  geprüft, sodass der Dienst bei fehlender Konfiguration nicht startet.

## Considered Options

- Prüfung erst in der Geschäftslogik: verworfen, weil dann jede Aufrufstelle
  ihre eigene Prüfung mitbringen muss.
- Validierung ausschließlich über Typen zur Übersetzungszeit: verworfen, weil
  Typen zur Laufzeit nicht existieren.

## Konsequenzen

+ Ungültige Eingaben werden an einer Stelle abgewiesen, mit klarer Meldung.
+ Die Geschäftslogik kann sich auf die Form ihrer Eingaben verlassen.
- Für jede Route entsteht ein zusätzliches Schema.
- Schema und Typ müssen zusammen gepflegt werden.
