# ADR-0010: Tests liegen beim Code und laufen ohne Netzzugriff

## Status

accepted (2026-02-18)

## Kontext

Tests lagen in einem eigenen Verzeichnisbaum, der die Struktur des Quellcodes
nachbildete. Bei jeder Umbenennung liefen beide Bäume auseinander, und zu
vielen Modulen fand sich der zugehörige Test nur durch Suchen. Einige Tests
griffen zudem auf echte externe Dienste zu und schlugen deshalb fehl, sobald
diese nicht erreichbar waren.

## Entscheidung

Wir werden Tests unmittelbar neben dem geprüften Modul ablegen und sie vom Netz
entkoppeln.

- Eine Testdatei liegt im selben Verzeichnis wie das geprüfte Modul und trägt
  die Endung `.test.ts`.
- Kein Test greift auf einen externen Netzdienst zu; externe Aufrufe werden
  über die Service-Schicht ersetzt.
- Der vollständige Testlauf ist über `npm test` erreichbar.
- Ein Test enthält keine feste Wartezeit als Synchronisationsmittel, sondern
  wartet auf die Bedingung, die er prüft.

## Considered Options

- Getrennter `test/`-Baum mit gespiegelter Struktur: verworfen, weil genau das
  der bisherige Zustand war.
- Nur Ende-zu-Ende-Tests gegen eine Testumgebung: verworfen, weil die
  Rückmeldung dann zu langsam ist.

## Konsequenzen

+ Der Test zu einem Modul ist ohne Suche zu finden.
+ Der Testlauf ist unabhängig von der Verfügbarkeit fremder Dienste.
- Die Quellverzeichnisse enthalten mehr Dateien.
