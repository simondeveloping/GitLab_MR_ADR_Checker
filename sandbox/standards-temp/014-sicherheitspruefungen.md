# ADR-0014: Sicherheitsrisiken werden in Entwicklung und Betrieb berücksichtigt

## Status

accepted (2026-10-29)

## Kontext

Fehler in Eingabeprüfung, Zugriffsschutz, Abhängigkeiten, Konfiguration und
Fehlerbehandlung können zur Offenlegung, Manipulation oder Nichtverfügbarkeit
von Systemen führen. Sicherheitsmängel werden teurer zu beheben, wenn sie erst
nach Veröffentlichung auffallen. Gleichzeitig unterscheiden sich Bedrohungen
und Schutzbedarf zwischen Projekten; ein einzelnes Werkzeug oder eine
vollständige Sicherheitszertifizierung ist daher kein sinnvoller
Gruppenstandard.

Automatisierte Prüfungen können bekannte Fehlerklassen früh finden, aber sie
ersetzen weder sichere Entwurfsentscheidungen noch eine angemessene Reaktion auf
konkrete Befunde. Sicherheitsprüfungen müssen in den normalen Entwicklungs- und
Wartungsablauf integriert sein.

## Entscheidung

Wir werden Sicherheitsrisiken während Entwurf, Entwicklung, Prüfung und Betrieb
angemessen berücksichtigen und bekannte, relevante Sicherheitsprobleme nicht
unbehandelt integrieren oder bereitstellen.

- Bei neuen oder wesentlich geänderten Funktionen werden Schutzgüter,
  Vertrauensgrenzen, sensible Daten und wesentliche Missbrauchsmöglichkeiten
  geprüft. Aufwand und Tiefe der Prüfung richten sich nach Schutzbedarf und
  möglichen Auswirkungen.
- Sicherheitsrelevante Eingaben werden nach ADR-0005 validiert; geschützte
  Aktionen nach ADR-0012 autorisiert; Geheimnisse nach ADR-0002 verwaltet.
  Sicherheitsmaßnahmen werden nicht durch eine einzelne dieser Prüfungen als
  vollständig abgedeckt betrachtet.
- Verfügbare, für den eingesetzten Technologie- und Produkttyp geeignete
  automatisierte Prüfungen werden in der CI oder einem gleichwertigen
  verbindlichen Prozess ausgeführt. Dazu können unter anderem
  Abhängigkeitsprüfungen, statische Sicherheitsanalysen, Geheimniserkennung,
  Konfigurationsprüfungen und Tests sicherheitsrelevanter Regeln gehören.
- Werkzeugwarnungen werden anhand ihrer Relevanz bewertet. Als relevant
  bestätigte Schwachstellen und Fehlkonfigurationen werden vor Integration oder
  Bereitstellung behoben oder durch eine ausdrücklich dokumentierte,
  verantwortete und befristete Ausnahme behandelt.
- Eine Ausnahme benennt mindestens den Grund, den betroffenen Bereich, die
  zuständige Person oder Rolle, gegebenenfalls kompensierende Maßnahmen und
  einen Zeitpunkt oder Auslöser für erneute Prüfung. Sie wird nicht still durch
  globale Abschaltung einer Prüfkategorie umgesetzt.
- Abhängigkeiten und Laufzeitumgebungen werden gemäß ADR-0008 nachvollziehbar
  aktualisiert. Bekannte Sicherheitsprobleme werden entsprechend Schwere,
  Erreichbarkeit und möglicher Auswirkung priorisiert und innerhalb eines
  angemessenen Zeitrahmens behandelt.
- Tests decken relevante sicherheitskritische Positiv- und Negativfälle ab.
  Dazu gehören insbesondere verweigerte unberechtigte Zugriffe, ungültige
  Eingaben und Fehlerpfade mit möglichen Informationsabflüssen.
- Produktions- und CI-Berechtigungen, Veröffentlichungswege und Artefakte
  werden auf das notwendige Maß begrenzt. Pipeline-Geheimnisse werden gemäß
  ADR-0002 vor nicht vertrauenswürdigen Ausführungen geschützt.
- Sicherheitsereignisse und bestätigte Vorfälle werden über definierte
  Zuständigkeiten eskaliert. Relevante technische Informationen werden gemäß
  ADR-0006 erfasst, ohne zusätzliche Geheimnisse zu protokollieren.
- Sicherheitsprüfungen werden an Projektänderungen angepasst. Nicht
  anwendbare Prüfarten werden nachvollziehbar begründet und nicht durch
  bedeutungslose Erfolgssignale ersetzt.

## Considered Options

- Sicherheit ausschließlich als abschließende Prüfung vor Veröffentlichung
  behandeln: verworfen, weil grundlegende Risiken bereits im Entwurf entstehen.
- Ein festes Sicherheitswerkzeug für alle Projekte vorschreiben: verworfen,
  weil Technologien, Bedrohungen und verfügbare Prüfverfahren variieren.
- Jede automatische Warnung ungeprüft als blockierend behandeln: verworfen,
  weil Fehlalarme und nicht anwendbare Regeln die Wirksamkeit vermindern können.
- Sicherheitsprüfungen bei störenden Befunden pauschal deaktivieren: verworfen,
  weil dadurch relevante Probleme unsichtbar würden.

## Konsequenzen

+ Häufige Sicherheitsfehler können frühzeitig erkannt und mit Änderungen
  behandelt werden.
+ Sicherheitsausnahmen und offene Risiken werden sichtbar und überprüfbar.
+ Sicherheitsanforderungen werden mit CI, Tests, Konfiguration und Betrieb
  verbunden.
- Prüfwerkzeuge erzeugen möglicherweise Fehlalarme und benötigen Pflege sowie
  fachliche Bewertung.
- Behebung und Aktualisierung können zusätzliche Arbeit oder eine verzögerte
  Bereitstellung erfordern.
- Die angemessene Prüftiefe muss anhand des Schutzbedarfs projektspezifisch
  bestimmt werden.
