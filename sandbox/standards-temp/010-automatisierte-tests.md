# ADR-0010: Wesentliches Verhalten wird automatisiert und isoliert getestet

## Status

accepted (2026-10-29)

## Kontext

Automatisierte Tests geben Rückmeldung darüber, ob fachlich wichtiges Verhalten
weiterhin korrekt ist. Ohne gemeinsame Mindestanforderung fehlen Tests oft für
kritische Regeln, Fehlerpfade und Regressionen. Tests, die unkontrolliert
Netzwerk, reale Konten oder gemeinsam genutzte Daten verwenden, sind zudem
unzuverlässig, teuer und können unerwünschte Seiteneffekte auslösen. Projektart,
Sprache und Testframework bestimmen jedoch, wo Tests liegen und welche
Testebenen sinnvoll sind.

## Entscheidung

Wir werden fachlich und betrieblich relevantes Verhalten durch automatisierte
Tests absichern, die wiederholbar und in der CI ausführbar sind. Struktur,
Testwerkzeuge und Testebenen legt jedes Projekt passend zu seinem Aufbau fest.

- Tests prüfen Ergebnisse und beobachtbares Verhalten, nicht unnötig interne
  Implementierungsdetails. Sie enthalten überprüfbare Erwartungen und schlagen
  bei verletzten Anforderungen fehl.
- Kritische fachliche Regeln, wesentliche Fehlerfälle und sicherheitsrelevante
  Grenzen erhalten Tests in angemessener Tiefe. Der Testumfang orientiert sich
  am Risiko und an den Folgen eines Fehlers, nicht an einer pauschalen
  prozentualen Abdeckungsvorgabe.
- Der für lokale Ausführung und CI vorgesehene vollständige relevante Testlauf
  ist dokumentiert und automatisiert erreichbar. Fehlgeschlagene verpflichtende
  Tests verhindern die Integration gemäß ADR-0003.
- Tests sind standardmäßig deterministisch und isoliert. Sie sind nicht von
  zufälliger Reihenfolge, festen Wartezeiten, nicht kontrollierten Uhrzeiten,
  Produktivdiensten oder gemeinsam veränderlichen Daten abhängig.
- Externe Systeme werden in schnellen automatisierten Tests kontrolliert
  ersetzt oder simuliert. Wo Integrationstests gegen echte Testsysteme nötig
  sind, sind Zugänge, Daten, Bereinigung, Netzwerkbedarf und Ausfallverhalten
  ausdrücklich kontrolliert; Produktionsdaten und Produktivzugänge werden nicht
  verwendet.
- Tests verändern ihre Umgebung nicht dauerhaft und können wiederholt
  ausgeführt werden. Testdaten sind repräsentativ, nicht sensibel und werden bei
  Bedarf gezielt bereinigt.
- Asynchrone Tests warten auf das fachlich relevante Ereignis oder Ergebnis,
  nicht auf eine willkürliche feste Verzögerung. Zeit- und Zufallsquellen werden
  bei Bedarf kontrollierbar gemacht.
- Änderungen an kritischem Verhalten bringen passende Tests mit oder erklären
  nachvollziehbar, wie die Änderung anderweitig geprüft wird. Fehler, die zuvor
  in Produktion oder Test gefunden wurden, sollen nach Möglichkeit durch einen
  Regressionstest abgesichert werden.
- Die Ablage von Tests soll ihre Zuordnung zu Funktion oder Komponente klar
  machen; ein bestimmtes Verzeichnislayout oder eine bestimmte Dateiendung ist
  kein Gruppenstandard.

## Considered Options

- Ausschließlich manuelle Prüfung: verworfen, weil wiederkehrende Regressionen
  dadurch nicht früh und reproduzierbar erkannt werden.
- Alle Tests ausschließlich gegen echte externe Systeme auszuführen:
  verworfen, weil Verfügbarkeit und Nebenwirkungen außerhalb der Kontrolle des
  Tests liegen.
- Eine identische Teststruktur für jedes Projekt vorzuschreiben: verworfen,
  weil Sprache, Architektur und Werkzeuge unterschiedlich sind.

## Konsequenzen

+ Wesentliches Verhalten und Regressionen lassen sich wiederholt prüfen.
+ Fehlerursachen sind durch isolierte und zielgerichtete Tests leichter
  einzugrenzen.
- Tests und kontrollierte Umgebungen benötigen Pflege, insbesondere bei
  fachlichen Änderungen.
- Integrationstests können zusätzliche Zeit und Infrastruktur erfordern und
  sind gegenüber schnellen isolierten Tests gezielt einzusetzen.
