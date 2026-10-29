# ADR-0007: Persistenter Zustand wird kontrolliert und sicher verwaltet

## Status

accepted (2026-10-29)

## Kontext

Viele Projekte speichern Daten dauerhaft oder beziehen sie aus einem
veränderlichen Datenspeicher. Wenn Speicherzugriffe und Speicherformate direkt
mit beliebigen fachlichen Abläufen vermischt werden, verteilen sich technische
Details, Integritätsregeln und Fehlerbehandlung über das System. Änderungen am
Speicher oder Tests mit kontrollierten Zuständen werden unnötig schwierig.
Unsichere Konstruktion von Abfragen und unklare Transaktionsgrenzen können
darüber hinaus Daten offenlegen oder teilweise geschriebene Zustände
hinterlassen. Nicht jedes Projekt benötigt jedoch eine Datenbank oder einen
Repository-Entwurf.

## Entscheidung

Projekte, die dauerhaften oder gemeinsam genutzten Zustand verwalten, werden
diesen über klar abgegrenzte, konsistente Zugriffsschnittstellen lesen und
verändern. Der konkrete Speicher und die technische Schichtung sind
projektspezifisch; eine bestimmte Datenbank, ORM- oder Repository-Technologie
wird nicht vorgeschrieben.

- Speicherung und Abruf erfolgen nicht verstreut aus Präsentations- oder
  Transportcode. Es gibt erkennbare Verantwortlichkeiten für Zugriff,
  Verbindung und Datenumwandlung.
- Zuständigkeiten und Invarianten für gespeicherte Daten sind dokumentiert und
  werden an einer geeigneten Grenze durchgesetzt. Anwendungsregeln dürfen nicht
  allein auf zufällige Eigenschaften eines einzelnen Aufrufpfads vertrauen.
- Eingaben werden nach ADR-0005 geprüft. Abfragen oder Befehle an einen
  strukturierten Speicher werden über sichere, parametrisierte beziehungsweise
  gleichwertig gebundene Schnittstellen gebildet; nicht vertrauenswürdige Werte
  werden nicht in ausführbare Abfragezeichenfolgen eingesetzt.
- Änderungen, die fachlich atomar sein müssen, werden als atomare Operation
  abgesichert. Wo der gewählte Speicher keine Transaktionen bereitstellt, wird
  ein geeignetes Verfahren gegen teilweise ausgeführte Änderungen festgelegt.
- Verbindungen, Schreibrechte und Datenzugriff werden auf den erforderlichen
  Umfang begrenzt. Geheimnisse und Verbindungseinstellungen folgen ADR-0002.
- Schema- oder Formatänderungen an dauerhaft gespeicherten Daten sind
  nachvollziehbar, überprüfbar und mit dem Einführungs- beziehungsweise
  Rückfallverfahren des Projekts vereinbar. Datenmigrationen dürfen vorhandene
  Nutzdaten nicht unbemerkt verwerfen.
- Tests für relevanten Speicherzugriff können kontrollierte Testdaten und eine
  isolierte Umgebung verwenden. Ein Test verändert keine gemeinsam genutzten
  oder produktiven Daten.
- Projekte ohne dauerhaften Zustand dokumentieren keine künstliche
  Speicherarchitektur; für sie gilt diese Entscheidung nur, wenn später
  persistente Daten eingeführt werden.

## Considered Options

- Direkter Speicherzugriff aus beliebigen fachlichen oder
  Präsentationskomponenten: verworfen, weil technische Abhängigkeiten und
  Integritätsverantwortung dadurch verstreut werden.
- Eine vorgeschriebene Datenbank oder Abstraktion für alle Projekte:
  verworfen, weil Speicherbedarf und Datenmodell variieren.
- Ein bestimmtes ORM oder ein bestimmtes Schichtenmuster als Gruppenregel:
  verworfen; die nötige Abgrenzung kann unterschiedlich umgesetzt werden.

## Konsequenzen

+ Speicherzugriff und fachliche Verwendung sind leichter getrennt zu ändern und
  zu testen.
+ Datenintegrität und sichere Abfragen erhalten nachvollziehbare
  Verantwortlichkeiten.
- Zugriffsschnittstellen, Migrationen und Testdaten benötigen zusätzliche
  Pflege.
- Eine übermäßige Abstraktion kann Speicherfähigkeiten verbergen; die gewählte
  Grenze soll tatsächlichen fachlichen und betrieblichen Bedarf abbilden.
