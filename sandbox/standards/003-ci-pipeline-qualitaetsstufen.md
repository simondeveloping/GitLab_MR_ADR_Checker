# ADR-0003: Automatisierte Qualitätsprüfungen sind verbindlich

## Status

accepted (2026-10-29)

## Kontext

Ohne gemeinsame Mindestanforderung hängt es von einzelnen Personen ab, ob
Änderungen vor der Integration geprüft werden. Manuelle Prüfungen sind nicht
immer reproduzierbar und entdecken dieselben Fehler nicht zuverlässig. Eine
fehlende oder nicht verbindliche Pipeline lässt Qualitäts- und
Sicherheitsprüfungen leicht aus, während eine projektspezifisch überladene
Pipeline langsames Feedback erzeugt. Die verfügbaren Prüfwerkzeuge und
Build-Schritte unterscheiden sich jedoch nach Sprache, Produkttyp und
Laufzeitumgebung.

## Entscheidung

Wir werden automatisierte, reproduzierbare Mindestprüfungen für Änderungen
einrichten und sie vor der Integration in den maßgeblichen Branch verbindlich
ausführen. Welche Werkzeuge und konkreten Pipeline-Stufen verwendet werden, ist
projektspezifisch.

- Die Pipeline prüft mindestens alle für das Projekt geeigneten Kategorien:
  Formatierung beziehungsweise Stil, statische oder Typanalyse, automatisierte
  Tests und – sofern das Projekt ein ausführbares oder verteilbares Artefakt
  erzeugt – dessen Build oder gleichwertige Integritätsprüfung.
- Prüfungen laufen auf dem Änderungsstand, der tatsächlich integriert werden
  soll, und verwenden reproduzierbare Befehle sowie nachvollziehbare
  Abhängigkeiten. Die für lokale Ausführung maßgeblichen Befehle sind im Projekt
  dokumentiert.
- Ein Fehler in einer als verpflichtend festgelegten Prüfung verhindert die
  Integration. Prüfungen dürfen nicht dauerhaft als unverbindlich konfiguriert
  oder durch manuelles Umgehen zum üblichen Prozess gemacht werden.
- Ausnahmen sind eng begrenzt, begründet, sichtbar und zeitlich beziehungsweise
  sachlich überprüfbar. Sie dürfen keine Sicherheits- oder Qualitätsprüfung
  dauerhaft entwerten.
- Pipeline-Zugangsdaten erhalten nur die benötigten Rechte und werden gemäß
  ADR-0002 behandelt. Prüfungen auf nicht vertrauenswürdigen Änderungen erhalten
  keinen unnötigen Zugriff auf Produktionsgeheimnisse.
- Fehlerausgaben müssen den Fehler hinreichend lokalisieren, dürfen aber keine
  Geheimnisse oder unnötigen personenbezogenen Daten offenlegen.
- Die Pipeline soll zeitnahes Feedback liefern. Unabhängige Prüfungen können
  parallel laufen; aufwendige zusätzliche Prüfungen werden so angeordnet, dass
  offensichtliche Fehler früh erkannt werden.
- Ein Projekt benennt, welche Prüfungen Merge-Gates sind und wie die
  Pipeline-Ausführung bei einem Ausfall der CI-Plattform gehandhabt wird.

## Considered Options

- Ausschließlich manuelle Prüfungen: verworfen, weil sie nicht ausreichend
  reproduzierbar und bei jeder Änderung zuverlässig erzwingbar sind.
- Ausschließlich zeitgesteuerte Prüfungen nach der Integration: verworfen, weil
  Fehler erst nach Verteilung der Änderung erkannt würden.
- Eine identische Werkzeugkette und CI-Syntax für alle Projekte: verworfen, da
  sie unnötige technische Festlegungen erzwingen würde.

## Konsequenzen

+ Jede Änderung erhält ein nachvollziehbares, wiederholbares Prüfergebnis.
+ Fehler werden möglichst vor Integration erkannt und der Zielbranch bleibt in
  einem überprüften Zustand.
- Pflege der Pipeline und Prüfwerkzeuge ist Teil der Projektarbeit.
- Verbindliche Prüfungen benötigen Laufzeit und können die Integration bei
  echten Fehlern oder Plattformausfällen verzögern.
- Die Prüfkategorien müssen an den Produkttyp angepasst werden; eine Prüfung,
  die für ein Projekt nicht anwendbar ist, wird begründet ersetzt und nicht
  bloß als scheinbar erfolgreiche leere Stufe geführt.
