# ADR-0005: Nicht vertrauenswürdige Eingaben werden zur Laufzeit geprüft

## Status

accepted (2026-10-29)

## Kontext

Software verarbeitet Daten aus Quellen, deren Inhalt oder Zustand nicht allein
durch die Quellcode-Typen garantiert ist: etwa Anfragen, Dateien, Nachrichten,
Importe, Datenbanken, externe Dienste und Konfiguration. Statische Typangaben
oder Annahmen über das erwartete Format prüfen diese Daten nicht zur Laufzeit.
Werden ungültige oder böswillig präparierte Werte ungeprüft weitergereicht,
entstehen schwer lokalisierbare Fehler, Datenkorruption oder
Sicherheitslücken. Eine Prüfung an einer nachvollziehbaren Grenze macht
Verantwortung und Fehlerbehandlung sichtbar.

## Entscheidung

Wir werden Daten an jeder relevanten Vertrauens- oder Formatgrenze zur Laufzeit
prüfen und in eine für die weitere Verarbeitung verlässliche Form überführen.
Die konkrete Validierungstechnik und der geeignete Ort richten sich nach dem
Projekt und der jeweiligen Datenquelle.

- Geprüft werden mindestens Struktur, erforderliche Felder, Datentypen,
  Wertebereiche und für die fachliche Verwendung relevante Invarianten.
  Sicherheitsrelevante Zeichenfolgen werden nicht allein durch
  Oberflächenprüfung als sicher behandelt; sie sind für den jeweiligen
  Zielkontext angemessen zu verwenden oder zu kodieren.
- Nach erfolgreicher Prüfung erhält nachfolgender Code einen klar beschriebenen
  Wert beziehungsweise Datentyp. Ungeprüfte Rohdaten sollen nicht unbemerkt in
  fachliche Operationen gelangen.
- Eine statische Typdeklaration, ein Cast oder eine Vertrauensannahme ersetzt
  keine Prüfung der tatsächlichen Laufzeitdaten.
- Eingabefehler werden kontrolliert und verständlich behandelt. Fehlermeldungen
  nennen die betroffene Eingabe oder Regel, soweit zulässig, aber legen keine
  sensiblen Daten, internen Implementierungsdetails oder Stacktraces offen.
- Validierung und Autorisierung bleiben unterschiedliche Prüfungen: Gültige
  Form und Werte beweisen nicht, dass eine Person oder ein Prozess die
  angeforderte Aktion ausführen darf.
- Dauerhafte Daten werden, wo mehrere Schreibpfade oder externe Änderungen
  möglich sind, auch an der Persistenzgrenze gegen relevante Integritätsregeln
  geschützt.
- Kritische Konfiguration wird frühzeitig geprüft; ein unvollständiger oder
  widersprüchlicher Zustand wird nicht erst bei zufälliger späterer Nutzung
  entdeckt (siehe ADR-0002).
- Prüfschemata beziehungsweise gleichwertige Prüfungen werden dort getestet,
  wo ungültige Eingaben zu relevanten fachlichen oder sicherheitsbezogenen
  Folgen führen könnten.

## Considered Options

- Prüfung nur am äußersten Transportadapter: verworfen, wenn weitere
  Vertrauensgrenzen oder alternative Aufrufwege ungeprüfte Daten einführen.
- Ausschließliche Prüfung zur Übersetzungszeit: verworfen, weil externe Daten
  zur Laufzeit andere Werte enthalten können als im Quellcode angenommen.
- Eine universelle Schema-Bibliothek als Gruppenpflicht: verworfen, weil
  Technologien und Datenformen unterschiedlich sind.

## Konsequenzen

+ Ungültige oder manipulierte Daten werden kontrolliert erkannt, bevor sie
  fachliche Seiteneffekte auslösen.
+ Prüfungen machen Eingabeannahmen explizit und vereinfachen die Verarbeitung
  nachfolgender Komponenten.
- Prüfregeln müssen gepflegt und bei fachlichen Änderungen angepasst werden.
- Doppelte Validierung an mehreren Grenzen kann Aufwand erzeugen; jede Prüfung
  soll einen klaren Zweck haben und relevante Sicherheitsgrenzen trotzdem
  absichern.
