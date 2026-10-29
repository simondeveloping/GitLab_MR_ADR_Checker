# ADR-0015: Projekte dokumentieren Einrichtung, Prüfungen und Betrieb

## Status

accepted (2026-10-29)

## Kontext

Wissen über Einrichtung, Konfiguration, Prüfungen und Betrieb liegt häufig nur
bei einzelnen Entwickelnden. Ohne gepflegte Dokumentation benötigen neue
Teammitglieder unnötige Unterstützung, lokale Umgebungen weichen von CI ab und
bei Störungen fehlen verlässliche erste Schritte. Veraltete oder zu
umfangreiche Dokumentation ist jedoch ebenfalls wenig hilfreich. Projekte
unterscheiden sich darin, ob sie Bibliotheken, Dienste, Werkzeuge oder
deploybare Anwendungen bereitstellen.

## Entscheidung

Wir werden die Informationen dokumentieren, die zur sicheren Mitarbeit,
reproduzierbaren Prüfung und – sofern zutreffend – zum verlässlichen Betrieb
eines Projekts erforderlich sind. Form und Ablage werden projektspezifisch
gewählt; die Dokumentation ist versioniert, auffindbar und wird mit relevanten
Änderungen aktualisiert.

- Ein Projekt beschreibt seinen Zweck, seinen wesentlichen Funktionsumfang und
  die unterstützten Nutzungsszenarien so, dass Lesende erkennen können, wofür
  es vorgesehen ist.
- Voraussetzungen und Schritte für die lokale Einrichtung sind dokumentiert.
  Dazu gehören erforderliche Laufzeiten und Werkzeuge, Installations- und
  Startschritte sowie der sichere Umgang mit lokaler Konfiguration gemäß
  ADR-0002. Dokumentation enthält keine echten Geheimnisse.
- Die maßgeblichen Befehle für Qualitätsprüfungen und Tests sind dokumentiert
  und stimmen mit dem automatisierten Prozess nach ADR-0003 überein.
- Relevante Architekturgrenzen, externe Abhängigkeiten, wichtige Datenflüsse
  und bekannte Einschränkungen werden so beschrieben, dass Änderungen mit
  angemessenem Kontext vorgenommen werden können. Entscheidungen von
  längerfristiger Tragweite werden in geeigneter Entscheidungsdokumentation
  festgehalten.
- Für bereitgestellte Anwendungen und Dienste sind mindestens die für den
  verantwortlichen Betrieb erforderlichen Informationen auffindbar: notwendige
  Konfiguration, Abhängigkeiten, Bereitstellungs- und Aktualisierungsweg,
  relevante Gesundheits- oder Diagnosemöglichkeiten und zuständige
  Verantwortlichkeiten.
- Wo der Projekttyp es erfordert, werden grundlegende Wiederanlauf- und
  Fehlerbehandlungsschritte einschließlich Eskalationswegen dokumentiert.
  Betriebsdokumentation darf keine geheimen Werte oder unnötigen
  personenbezogenen Daten enthalten.
- Dokumentation wird zusammen mit der zugehörigen Implementierung überprüft.
  Änderungen an Schnittstellen, Einrichtung, Konfiguration, Laufzeitverhalten
  oder betrieblichen Abläufen aktualisieren die betroffenen Anweisungen.
- Nicht zutreffende Abschnitte werden nicht mit leeren Standardtexten gefüllt.
  Für eine reine Bibliothek können beispielsweise Installations- und
  Nutzungsanweisungen wichtiger sein als Betriebsanweisungen eines Dienstes.

## Considered Options

- Einrichtung und Betriebswissen ausschließlich mündlich weitergeben:
  verworfen, weil es von erreichbaren Einzelpersonen abhängig bleibt.
- Ein identisches Dokumentationsschema mit denselben Kapiteln für alle
  Projekte verlangen: verworfen, weil Nutzende und Produkttypen variieren.
- Vollständige Dokumentation jeder Implementierungsentscheidung: verworfen,
  weil unnötige Details schnell veralten und wesentliche Anleitungen verdecken.
- Dokumentation getrennt von Änderungen ohne Aktualitätsprüfung pflegen:
  verworfen, weil Implementierung und Anweisungen auseinanderlaufen.

## Konsequenzen

+ Einrichtung, Qualitätssicherung und betriebliche Verantwortung sind weniger
  von implizitem Teamwissen abhängig.
+ Änderungen an Nutzung und Betrieb lassen sich besser nachvollziehen.
+ Dokumentationsumfang richtet sich am tatsächlichen Zweck des Projekts aus.
- Dokumentation benötigt Pflege und muss bei Änderungen mit überprüft werden.
- Zu allgemeine oder übermäßige Dokumentation kann trotz Umfangs unbrauchbar
  sein; Verständlichkeit und Aktualität sind wichtiger als bloße Seitenzahl.
