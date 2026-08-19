# ADR-0006: Einheitliche Fehlerbehandlung und Protokollierung

## Status

accepted (2026-03-17)

## Kontext

Die Protokollierung erfolgte in den bestehenden Diensten über direkte
`console`-Aufrufe. Damit fehlten Zeitstempel, Schweregrade und ein
maschinenlesbares Format, sodass die Ausgaben in der zentralen
Protokollsammlung nicht auswertbar waren. Verschluckte Fehler in leeren
`catch`-Blöcken führten zusätzlich dazu, dass Störungen unbemerkt blieben.

## Entscheidung

Wir werden Protokollierung und Fehlerbehandlung über zentrale Bausteine führen.

- Ausgaben erfolgen ausschließlich über den Logger aus `lib/logger`; direkte
  Aufrufe von `console.log`, `console.info` und `console.error` sind im
  Produktivcode nicht zulässig.
- Ein `catch`-Block bleibt niemals leer: Der Fehler wird entweder behandelt
  oder protokolliert oder weitergeworfen.
- Fehlermeldungen, die nach außen gehen, enthalten keinen Stacktrace und keine
  internen Pfade.
- `process.exit` wird ausschließlich im Einstiegspunkt des Prozesses
  aufgerufen, nicht in Bibliotheks- oder Servicemodulen.

## Considered Options

- Direkte `console`-Aufrufe mit vereinbartem Textformat: verworfen, weil das
  Format ohne technische Durchsetzung auseinanderläuft.
- Protokollierung über einen Umgebungsschalter abschaltbar machen: verworfen,
  weil ein Dienst ohne Protokoll nicht betreibbar ist.

## Konsequenzen

+ Alle Ausgaben sind maschinenlesbar und zentral auswertbar.
+ Störungen sind nachvollziehbar, weil kein Fehler stillschweigend verschwindet.
- Bestehende `console`-Aufrufe müssen migriert werden.
