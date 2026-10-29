# ADR-0017: Wichtige persistente Daten können wiederhergestellt werden

## Status

accepted (2026-10-29)

## Kontext

Persistente Daten können durch Hardware- oder Plattformausfälle, fehlerhafte
Änderungen, versehentliches Löschen, Sicherheitsvorfälle oder fehlerhafte
Migrationen verloren gehen oder unbrauchbar werden. Eine vorhandene Sicherung
garantiert keine Wiederherstellbarkeit, wenn sie unvollständig, unzugänglich,
nicht aktuell oder nie erprobt ist. Sicherungen können ihrerseits sensible
Daten enthalten und müssen entsprechend geschützt werden. Für kurzlebige,
reproduzierbare oder nicht kritische Daten kann der Aufwand einer Sicherung
hingegen unverhältnismäßig sein.

## Entscheidung

Projekte, die wichtige persistente Daten verwalten, werden Datenverlust- und
Wiederherstellungsanforderungen bewerten und angemessene Sicherungs- und
Wiederherstellungsverfahren festlegen. Umfang und Ziele richten sich nach
Wichtigkeit, Änderungsrate, Wiederherstellbarkeit und möglichen Folgen eines
Verlusts. Für Projekte ohne wichtige persistente Daten ist diese Entscheidung
nicht anwendbar.

- Es wird festgelegt, welche Daten und zugehörigen Informationen für einen
  funktionsfähigen Wiederanlauf erforderlich sind. Dazu können neben
  Nutzdaten auch Schemata, Konfiguration ohne Geheimnisse, Schlüsselverwaltung,
  Abhängigkeiten und Wiederherstellungsanweisungen gehören.
- Für relevante Datenbestände werden angemessene Wiederherstellungsziele
  bestimmt, insbesondere maximal tolerierbarer Datenverlust und erforderliche
  Wiederherstellungsdauer. Diese Ziele entsprechen dem fachlichen und
  betrieblichen Schutzbedarf und werden nicht pauschal für alle Projekte
  vorgegeben.
- Sicherungen werden regelmäßig und nachvollziehbar erstellt. Häufigkeit,
  Aufbewahrungsdauer, Speicherort und Umfang berücksichtigen Datenänderung,
  Wiederherstellungsziele und geltende Aufbewahrungs- beziehungsweise
  Löschanforderungen.
- Sicherungskopien sind gegen unberechtigten Zugriff, unbeabsichtigte Änderung
  und gemeinsame Fehlerursachen mit dem Primärsystem geschützt. Wo erforderlich
  werden sie verschlüsselt und Zugriffe begrenzt. Geheimnisse für Sicherung und
  Wiederherstellung folgen ADR-0002.
- Wiederherstellungsverfahren sind dokumentiert und werden in angemessenem
  Abstand sowie nach wesentlichen Änderungen praktisch überprüft. Die Prüfung
  erfolgt in einer kontrollierten Umgebung und schließt, soweit relevant,
  Datenintegrität und Nutzbarkeit des wiederhergestellten Systems ein.
- Änderungen an Datenformaten und Migrationen berücksichtigen Sicherbarkeit,
  Wiederherstellung und einen geeigneten Rückfall- oder Reparaturweg.
  Wiederherstellbarkeit darf nicht allein aus dem Vorhandensein einer
  Datenbankkopie abgeleitet werden.
- Lösch- und Aufbewahrungsvorgaben nach ADR-0013 werden auch für Sicherungen und
  daraus wiederhergestellte Daten berücksichtigt. Wiederherstellung darf
  gelöschte oder nicht mehr zulässig aufzubewahrende Daten nicht unbemerkt
  dauerhaft reaktivieren.
- Zuständigkeiten und erste Schritte im Fehlerfall sind für die verantwortlichen
  Personen auffindbar dokumentiert (ADR-0015). Ein erfolgreicher Sicherungslauf
  wird überwacht, soweit das Betriebsmodell dies unterstützt.
- Projekte ohne wichtige persistente Daten dokumentieren kurz, weshalb keine
  Sicherungsanforderung besteht, und überprüfen dies erneut, wenn sie
  maßgeblichen persistenten Zustand einführen.

## Considered Options

- Sich ausschließlich auf den Anbieter oder die Replikation des Primärsystems
  zu verlassen: verworfen, weil Replikation versehentlich gelöschte oder
  beschädigte Daten mitübertragen kann.
- Eine einheitliche Sicherungsfrequenz und Aufbewahrungsfrist für alle Projekte
  vorzuschreiben: verworfen, weil Datenwert, Änderungsrate und Anforderungen
  variieren.
- Sicherungsläufe ohne Wiederherstellungstests als ausreichenden Nachweis zu
  behandeln: verworfen, da beschädigte oder unvollständige Sicherungen oft erst
  beim tatsächlichen Wiederherstellungsversuch auffallen.
- Für kurzlebige oder vollständig reproduzierbare Daten dauerhaft aufwendige
  Sicherungsverfahren einzuführen: nicht als Gruppenpflicht vorgesehen; Risiko
  und Aufwand sind angemessen abzuwägen.

## Konsequenzen

+ Verlust oder Beschädigung wichtiger Daten kann anhand vorbereiteter Verfahren
  behoben werden.
+ Wiederherstellungsfähigkeit wird praktisch überprüft und nicht nur angenommen.
+ Verantwortlichkeiten und akzeptable Ausfallfolgen werden expliziter.
- Sicherungen benötigen Speicher, Überwachung, Zugriffsschutz und regelmäßige
  Tests.
- Sicherungen können sensible und gelöschte Daten enthalten und müssen in
  Datenschutz- und Aufbewahrungsregeln einbezogen werden.
- Wiederherstellungsziele und Maßnahmen erfordern eine projektspezifische
  Bewertung des Geschäftswerts und der möglichen Folgen eines Datenverlusts.
