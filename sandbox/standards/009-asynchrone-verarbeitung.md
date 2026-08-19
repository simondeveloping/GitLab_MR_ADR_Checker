# ADR-0009: Blockierende Aufrufe außerhalb des Anfragepfads

## Status

accepted (2026-03-30)

## Kontext

In mehreren Diensten fanden sich synchrone Dateizugriffe und unbehandelte
Versprechen im Anfragepfad. Ein synchroner Aufruf blockiert die Ereignisschleife
und damit alle gleichzeitigen Anfragen, und ein unbehandeltes Versprechen führt
je nach Node-Version zum Abbruch des Prozesses. Beides fiel unter Last auf und
nicht in der Entwicklung.

## Entscheidung

Wir werden blockierende und unbeobachtete Aufrufe im Anfragepfad vermeiden.

- Die synchronen Varianten der Dateischnittstelle, etwa `readFileSync` und
  `writeFileSync`, werden nicht im Anfragepfad verwendet, sondern höchstens
  beim Start des Prozesses.
- Jedes Versprechen wird entweder erwartet, weitergegeben oder ausdrücklich
  mit `void` als unbeobachtet gekennzeichnet.
- Jeder ausgehende Netzaufruf setzt ein Zeitlimit.

## Considered Options

- Blockierende Aufrufe in einen Arbeitsprozess auslagern: verworfen, weil der
  Aufwand für die betroffenen Fälle unverhältnismäßig ist.
- Verzicht auf die Regel und Absicherung allein durch Lasttests: verworfen,
  weil Lasttests den Fehler zeigen, aber nicht verhindern.

## Konsequenzen

+ Die Ereignisschleife bleibt unter Last verfügbar.
+ Fehler in Hintergrundaufgaben werden bemerkt.
- Der Code enthält mehr `await` und gelegentlich ein `void` zur Kennzeichnung.
