# ADR-0008: Laufzeit und Abhängigkeiten sind nachvollziehbar festgelegt

## Status

accepted (2026-10-29)

## Kontext

Softwareprojekte hängen von Laufzeitumgebungen, Werkzeugen und externen
Bibliotheken ab. Wenn Versionen und Installationswege nicht nachvollziehbar
festgelegt sind, erhalten Entwicklung, CI und Produktion unterschiedliche
Ergebnisse. Ungeprüfte oder nicht mehr benötigte Abhängigkeiten erhöhen zudem
Angriffsfläche, Wartungsaufwand und das Risiko nicht reproduzierbarer Builds.
Welche Sprache, Laufzeit, Paketverwaltung und Bezugsquelle angemessen ist,
unterscheidet sich zwischen Projekten und darf nicht als Gruppenstandard
vorgegeben werden.

## Entscheidung

Wir werden die für ein Projekt benötigte Laufzeit, Werkzeuge und Abhängigkeiten
so festlegen und verwalten, dass Installationen und Prüfungen nachvollziehbar
reproduzierbar sind. Die konkrete Technologie wird im jeweiligen Projekt
entschieden und dokumentiert.

- Unterstützte Laufzeit- und Werkzeugversionen sind an einer geeigneten,
  versionierten Stelle festgehalten. Lokale Entwicklung, CI und bereitgestellte
  Artefakte verwenden kompatible, ausdrücklich unterstützte Versionen.
- Der für die gewählte Paketverwaltung oder Build-Umgebung vorgesehene
  Abhängigkeits- beziehungsweise Integritätsnachweis wird mitgeführt, sofern
  die Technologie einen solchen bereitstellt. Es gibt keine widersprüchlichen
  Installationswege, die stillschweigend unterschiedliche Abhängigkeitsstände
  erzeugen.
- Automatisierte Installationen verwenden den festgelegten, reproduzierbaren
  Installationsmodus. Eine Aktualisierung von Abhängigkeiten ändert die
  maßgeblichen Sperr- oder Integritätsinformationen bewusst und nachvollziehbar.
- Jede direkte Abhängigkeit hat einen begründeten Zweck. Nicht mehr benötigte
  Abhängigkeiten werden entfernt; Versionen werden in einem für das Projekt
  angemessenen Rhythmus aktualisiert und auf bekannte Sicherheitsprobleme
  geprüft.
- Bezugsquellen und Herkunft von Abhängigkeiten sind nachvollziehbar. Nicht
  vertrauenswürdige oder undokumentierte Quellen und lokale Pfade, die außerhalb
  des Projekts nicht reproduzierbar sind, sind unzulässig, sofern kein
  dokumentierter, kontrollierter Ausnahmefall besteht.
- Laufzeit- und Abhängigkeitsaktualisierungen werden getestet, bevor sie
  bereitgestellt werden. Sicherheitsrelevante Aktualisierungen werden
  entsprechend ihrer Dringlichkeit behandelt.
- Zugangsdaten für private Register oder Build-Dienste folgen ADR-0002 und
  werden in CI nicht an nicht vertrauenswürdige Änderungen weitergegeben.
- Bei Projekten ohne Paketmanager gilt der gleiche Zweck: benötigte Werkzeuge,
  Versionen und Quellen werden so dokumentiert oder festgelegt, dass andere
  Teammitglieder und CI die Prüfungen reproduzieren können.

## Considered Options

- Eine einheitliche Paketverwaltung für die gesamte Gruppe: verworfen, weil
  Sprachen, Laufzeitumgebungen und Ökosysteme variieren.
- Unbegrenzte, ungesperrte automatische Aktualisierungen: verworfen, weil
  Installationen damit zu unterschiedlichen Zeitpunkten andere Ergebnisse
  liefern können.
- Ausschließliche Dokumentation ohne maschinenlesbare Festlegung, sofern die
  Plattform eine reproduzierbare Konfiguration ermöglicht: verworfen, da sie
  leicht veraltet.

## Konsequenzen

+ Lokale Entwicklung, CI und Bereitstellung können kompatible Werkzeuge und
  Abhängigkeitsstände verwenden.
+ Aktualisierungen, Herkunft und Sicherheitswartung von Abhängigkeiten bleiben
  nachvollziehbar.
- Gesperrte und festgelegte Versionen müssen regelmäßig auf Aktualität geprüft
  werden.
- Reproduzierbarkeit kann je nach Plattform zusätzliche Konfiguration und
  Pflege der Build-Umgebung erfordern.
