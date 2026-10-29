# ADR-0016: Geteilte Schnittstellen werden nachvollziehbar und kompatibel geändert

## Status

accepted (2026-10-29)

## Kontext

Schnittstellen zwischen Komponenten, Diensten, Clients und externen
Integrationen bilden Verträge: andere Teile verlassen sich auf Nachrichten,
Datenformate, Fehlerverhalten und Verfügbarkeit. Eine scheinbar kleine Änderung
kann abhängige Systeme brechen, wenn dieser Vertrag nicht sichtbar ist oder
Änderungen ohne Übergang eingeführt werden. Gleichzeitig hat nicht jedes
Projekt externe Nutzende oder eine eigenständig versionierte API; interne
Implementierungsdetails sollen nicht unnötig zu stabilen Verträgen erklärt
werden.

## Entscheidung

Für Schnittstellen, auf die andere Komponenten, Projekte oder Nutzende
angewiesen sind, werden Vertrag, Änderungswirkung und Kompatibilität
berücksichtigt. Projekte legen Umfang, Versionierung und Übergangsregeln gemäß
Schutzbedarf und Abhängigkeiten fest.

- Als Schnittstellen gelten insbesondere öffentlich oder organisationsweit
  verwendete APIs, Ereignisse, Nachrichtenformate, Dateien, Bibliotheksverträge
  und andere Integrationspunkte, deren Änderung abhängige Nutzende betreffen
  kann.
- Ein geteilter Vertrag beschreibt die für Nutzende relevanten Eigenschaften,
  darunter Eingaben, Ausgaben, Fehler- und Ablehnungsverhalten sowie, wo
  relevant, Authentifizierung, Berechtigungen, Grenzen und
  Verfügbarkeitsannahmen.
- Schnittstellenverträge werden an geeigneter Stelle versioniert oder
  anderweitig nachvollziehbar gepflegt. Dokumentation und Implementierung
  werden bei Änderungen gemeinsam überprüft.
- Änderungen werden auf Rückwärtskompatibilität geprüft. Additive Änderungen
  dürfen vorhandenes Verhalten nicht unbeabsichtigt brechen. Entfernen,
  Umbenennen oder semantisches Ändern bestehender Funktionen, Felder oder
  Fehlerfälle gilt als potenziell inkompatibel.
- Wenn eine inkompatible Änderung erforderlich ist, werden betroffene Nutzende
  identifiziert, eine passende Versionierungs- oder Übergangsstrategie gewählt
  und eine angemessene Migrationsfrist kommuniziert. Bei ausschließlich intern
  kontrollierten Komponenten kann der Übergang koordiniert erfolgen, muss aber
  weiterhin getestet und nachvollziehbar sein.
- Eingehende Daten werden gemäß ADR-0005 validiert und geschützte Aktionen
  gemäß ADR-0012 autorisiert. Die bloße Einhaltung eines dokumentierten
  Schnittstellenformats gilt nicht als Vertrauens- oder Berechtigungsprüfung.
- Kompatibilität wesentlicher Verträge wird automatisiert geprüft, wenn dies
  mit vertretbarem Aufwand möglich ist. Vertragstests oder gleichwertige
  Integrationsprüfungen decken relevante Konsumenten- und Produzentenerwartungen
  ab.
- Schnittstellen werden nicht ohne fachlichen Bedarf dauerhaft stabilisiert.
  Rein interne Details, die keine zugesicherte Abhängigkeit darstellen, können
  im Rahmen normaler Projektänderungen angepasst werden.
- Projekte ohne geteilte oder externe Schnittstellen halten diese Entscheidung
  als nicht anwendbar fest und prüfen sie erneut, wenn Abhängigkeiten entstehen.

## Considered Options

- Geteilte Schnittstellen ohne Vertrag und koordinierte Änderungen anzupassen:
  verworfen, da abhängige Nutzende Änderungen nicht zuverlässig erkennen.
- Jede interne Funktion als langfristig stabilen Vertrag behandeln: verworfen,
  weil dies unnötige Änderungshemmnisse erzeugt.
- Für alle Projekte eine konkrete API-Versionierungstechnik vorgeben:
  verworfen, weil Protokolle und Abhängigkeiten variieren.
- Inkompatible Änderungen ohne Übergangsweg sofort ausrollen: verworfen,
  sofern abhängige Nutzende nicht nachweislich synchron aktualisiert werden.

## Konsequenzen

+ Abhängige Nutzende können Änderungen und Migrationen besser planen.
+ Inkompatible Änderungen werden vor der Veröffentlichung sichtbar.
+ Interne Implementierungsdetails bleiben änderbar, solange sie kein geteilter
  Vertrag sind.
- Schnittstellenverträge und Kompatibilitätstests müssen gepflegt werden.
- Übergangsphasen können vorübergehend mehrere Versionen oder zusätzliche
  Koordination erfordern.
- Der relevante Kompatibilitätsumfang muss projektspezifisch bestimmt werden.
