# ADR-0012: Zugriffe auf geschützte Funktionen und Daten werden autorisiert

## Status

accepted (2026-10-29)

## Kontext

Anwendungen verarbeiten häufig Daten oder Funktionen, die nicht allen
Nutzenden, Diensten oder Integrationen gleichermaßen zur Verfügung stehen.
Eine erfolgreiche Anmeldung belegt eine Identität, aber nicht automatisch,
dass diese Identität jede angeforderte Aktion ausführen darf. Werden
Berechtigungen nur in der Oberfläche geprüft oder implizit aus übermittelten
Kennungen abgeleitet, können direkte Aufrufe oder manipulierte Referenzen
Zugriffsschutz umgehen. Unklare Rollen und übermäßig breite Rechte erhöhen
außerdem die Folgen kompromittierter Konten und erschweren die Prüfung
sicherheitsrelevanter Entscheidungen.

Authentifizierung, Berechtigungsmodelle und technische Durchsetzung hängen von
Anwendung, Plattform und Datenmodell ab. Nicht jedes Projekt besitzt
Nutzerkonten oder geschützte Funktionen; wo solche Schutzbedarfe bestehen, muss
die Autorisierung dennoch server- beziehungsweise vertrauensgrenzenseitig
verbindlich sein.

## Entscheidung

Wir werden jeden Zugriff auf geschützte Funktionen und Daten anhand einer
expliziten, für die jeweilige Aktion geltenden Berechtigung prüfen. Das
Berechtigungsmodell und seine technische Umsetzung werden projektspezifisch
festgelegt und dokumentiert.

- Die Entscheidung über eine geschützte Aktion wird an einer vertrauenswürdigen
  Systemgrenze getroffen. Eine reine Prüfung in einer Benutzeroberfläche oder
  auf einem vom Aufrufer kontrollierten Client gilt nicht als Zugriffsschutz.
- Es wird zwischen Identitätsprüfung und Autorisierungsentscheidung
  unterschieden. Eine authentifizierte Identität erhält nicht automatisch
  Zugriff auf alle Ressourcen oder Operationen.
- Für jede geschützte Operation wird geprüft, ob die aufrufende Identität die
  konkrete Aktion an der konkreten Ressource ausführen darf. Vom Aufrufer
  gelieferte Rollen, Eigentümerkennungen oder Ressourcen-IDs werden nicht ohne
  vertrauenswürdige Prüfung als Berechtigungsnachweis behandelt.
- Berechtigungen folgen dem Prinzip der geringsten Rechte: Personen, Prozesse
  und Integrationen erhalten nur diejenigen Rechte, die sie für ihre Aufgabe
  benötigen. Administrations- und Notfallrechte werden besonders begrenzt und
  nachvollziehbar vergeben.
- Fehlende, abgelaufene, ungültige oder nicht eindeutig zuordenbare
  Berechtigungsinformationen führen standardmäßig zur Ablehnung geschützter
  Aktionen. Ausnahmen und öffentlich zugängliche Funktionen werden ausdrücklich
  festgelegt.
- Zugriffsregeln werden bei relevanten Änderungen an Funktionen, Ressourcen und
  Rollen überprüft. Gemeinsame Autorisierungsregeln werden nicht an zahlreichen
  Aufrufstellen unabhängig und widersprüchlich implementiert.
- Ablehnungen werden so kommuniziert, dass keine geschützten Informationen
  offengelegt werden. Sicherheitsrelevante Zugriffsereignisse werden, soweit
  erforderlich, gemäß ADR-0006 nachvollziehbar erfasst, ohne Geheimnisse oder
  unnötige personenbezogene Daten zu protokollieren.
- Autorisierungsregeln und wesentliche Ablehnungsfälle werden automatisiert
  getestet. Tests decken mindestens erlaubte und verweigerte Zugriffe sowie
  relevante Grenzen zwischen Identitäten, Rollen oder Ressourcen ab.
- Geheimnisse und technische Zugangsdaten für Dienste unterliegen ADR-0002;
  deren Besitz ersetzt keine Prüfung fachlicher Berechtigungen für
  Nutzeraktionen.

## Considered Options

- Berechtigungen ausschließlich in der Darstellung oder im Client prüfen:
  verworfen, weil diese Prüfungen umgangen werden können.
- Angemeldeten Identitäten pauschal Zugriff auf alle Aktionen geben: verworfen,
  weil Authentifizierung keine fachliche Berechtigung belegt.
- Ein einzelnes Rollenmodell für alle Projekte vorgeben: verworfen, weil
  Ressourcen, Nutzergruppen und Schutzbedarf projektspezifisch sind.
- Berechtigungen ohne dokumentierte Zuständigkeit implizit aus
  Ressourcenkennungen ableiten: verworfen, da dies ungewollte Zugriffe
  ermöglicht.

## Konsequenzen

+ Geschützte Aktionen haben eine nachvollziehbare und testbare
  Autorisierungsentscheidung.
+ Fehlerhafte oder manipulierte Aufrufe können nicht allein durch Umgehen der
  Benutzeroberfläche auf geschützte Funktionen zugreifen.
+ Begrenzte Berechtigungen reduzieren mögliche Auswirkungen kompromittierter
  Konten oder Dienste.
- Autorisierungsregeln müssen mit fachlichen Rollen und Ressourcen konsistent
  gehalten und bei Änderungen überprüft werden.
- Zugriffsprüfungen und Tests erhöhen den Implementierungs- und Pflegeaufwand.
- Eine restriktive Voreinstellung kann bei fehlender Konfiguration legitime
  Aktionen verhindern; solche Fehler müssen sicher und verständlich
  diagnostizierbar sein.
