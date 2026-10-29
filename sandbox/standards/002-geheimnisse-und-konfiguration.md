# ADR-0002: Konfiguration und Geheimnisse werden sicher verwaltet

## Status

accepted (2026-10-29)

## Kontext

Anwendungen benötigen Werte, die sich je Umgebung unterscheiden, etwa
Endpunkte, Funktionsschalter und Zugangsdaten. Werden solche Werte fest in den
Quellcode geschrieben, sind lokale Entwicklung, Test und Produktion nur schwer
zu unterscheiden. Werden Geheimnisse in versionierten Dateien abgelegt, können
sie in der Historie, in Forks, Artefakten oder Protokollen dauerhaft offengelegt
werden. Fehlende oder ungültige Konfiguration erst beim ersten fachlichen
Zugriff zu entdecken, führt zudem zu schwer verständlichen Fehlern im Betrieb.

Die konkrete Bereitstellung hängt von Plattform und Laufzeit ab. Umgebungs-
variablen, Secret-Stores und geschützte CI/CD-Variablen sind mögliche
Transportwege; keiner davon ist für alle Projekte zwingend. Maßgeblich sind
Trennung, Schutz, Überprüfbarkeit und eine dokumentierte Einrichtung.

## Entscheidung

Wir werden Konfiguration von Programmcode trennen und Geheimnisse ausschließlich
über einen für die jeweilige Umgebung vorgesehenen, zugriffsgeschützten
Bereitstellungsweg beziehen. Projekte dokumentieren ihren gewählten Weg.

- Passwörter, Schlüssel, Tokens, private Zertifikate und andere
  Authentifizierungsdaten werden weder in Quellcode noch in versionierten
  Konfigurationsdateien, Beispielen, Testdaten, Dokumentation oder
  Build-Artefakten gespeichert.
- Lokale Konfiguration mit echten Werten wird durch passende Ausschlussregeln
  vom Versionskontrollsystem ferngehalten. Beispielkonfiguration enthält nur
  nicht funktionsfähige Platzhalter und erklärt Zweck sowie erforderliche oder
  optionale Werte.
- Für jede unterstützte Umgebung ist nachvollziehbar, wie notwendige Werte
  bereitgestellt werden und wer darauf zugreifen darf. Produktionsgeheimnisse
  stehen nicht ungeschützt in CI-Protokollen, Pull-/Merge-Request-Ausgaben oder
  für nicht vertrauenswürdige Pipeline-Ausführungen bereit.
- Berechtigungen werden auf den notwendigen Personenkreis, Prozess und Zweck
  begrenzt. Wo die Plattform es unterstützt, werden getrennte Zugangsdaten je
  Umgebung und regelmäßige beziehungsweise anlassbezogene Rotation ermöglicht.
- Notwendige Konfiguration wird beim Start oder vor der ersten Nutzung an einer
  zentralen Stelle geprüft. Fehler benennen den fehlenden Konfigurationsschlüssel
  und die erforderliche Abhilfe, geben aber niemals dessen Geheimniswert aus.
- Die Anwendung verwendet sichere Standardwerte. Eine optionale Konfiguration
  darf nicht stillschweigend einen unsicheren oder unerwarteten Betriebsmodus
  aktivieren.
- Werden Geheimnisse versehentlich offengelegt, reicht es nicht, die betreffende
  Datei später zu löschen: Das betroffene Geheimnis wird widerrufen oder rotiert
  und der Vorfall nach den geltenden Projektvorgaben behandelt.

## Considered Options

- Eine einzige Bereitstellungstechnik für alle Projekte: verworfen, weil
  Plattform und Betriebsmodell variieren.
- Geheimnisse in versionierten Dateien, auch verschlüsselt: nicht als
  Standardweg gewählt, da Schlüsselverteilung, Rotation und Zugriffssteuerung
  zusätzliche Fehlerquellen darstellen.
- Ausschließliche Verwendung von Umgebungsvariablen: nicht vorgeschrieben; ein
  geeigneter Secret-Store kann für ein Projekt besseren Schutz und bessere
  Rotation bieten.

## Konsequenzen

+ Umgebungen können unabhängig konfiguriert werden, ohne Programmcode zu ändern.
+ Geheimnisse werden nicht dauerhaft in der Repository-Historie abgelegt.
+ Konfigurationsfehler werden früh und mit handlungsleitender Meldung erkannt.
- Einrichtung und Betrieb benötigen nachvollziehbare, zugriffsgeschützte
  Prozesse.
- Neue Teammitglieder benötigen eine sichere Anleitung für lokale Konfiguration;
  echte Zugangsdaten dürfen nicht über unsichere Dokumentationswege geteilt
  werden.
- Eine versehentliche Offenlegung erfordert Rotation und gegebenenfalls die
  Bereinigung weiterer Kopien, nicht nur eine Änderung im aktuellen Stand.
