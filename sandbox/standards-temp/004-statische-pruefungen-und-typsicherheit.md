# ADR-0004: Statische Prüfungen und Typsicherheit werden nicht umgangen

## Status

accepted (2026-10-29)

## Kontext

Compiler, Interpreter, Linter und statische Analysatoren können Fehler vor der
Ausführung finden. Werden ihre Prüfungen abgeschaltet oder Warnungen pauschal
unterdrückt, verliert das Projekt diesen Schutz. Ungeprüfte Umgehungen wie
unbegründete Typzusicherungen oder globale Ausschlüsse verlagern Fehler in den
Betrieb und machen die tatsächliche Qualität schwer einschätzbar. Nicht jedes
Projekt verwendet TypeScript oder überhaupt ein statisch typisiertes
Programmiermodell; ein Gruppenstandard darf daher kein bestimmtes Sprachsystem
vorschreiben.

## Entscheidung

Wir werden die für die verwendete Sprache und Plattform verfügbaren statischen
Korrektheitsprüfungen aktivieren und ihre Ergebnisse als Teil der verpflichtenden
Qualitätsprüfung behandeln. Projektspezifische Sprachoptionen und Werkzeuge
werden im jeweiligen Projekt festgelegt.

- Prüfungen laufen mit einer bewusst gewählten, möglichst strengen und
  unterstützten Konfiguration. Die Gründe für unvermeidbare Abweichungen von
  den empfohlenen Schutzstufen werden im Projekt dokumentiert.
- Typ- oder Analyseprüfungen werden auch in der CI ausgeführt, soweit sie für die
  gewählte Technologie verfügbar und relevant sind (siehe ADR-0003). Sie dürfen
  nicht nur lokal oder nur auf einem Teil der produktiven Quellbasis laufen.
- Warnungen und Fehler werden nicht pauschal global unterdrückt. Eine notwendige
  Ausnahme ist auf den kleinstmöglichen Bereich begrenzt und begründet, sodass
  sie bei Änderungen erneut sichtbar und überprüfbar bleibt.
- Bei typisierten Sprachen werden unsichere Fluchtwege – beispielsweise
  unkontrollierte dynamische Typen, Typzusicherungen oder das Abschalten
  einzelner Prüfungen – nur eingesetzt, wenn die Grenze zu nicht typisierbaren
  Daten oder eine belegte Einschränkung des Werkzeugs dies erfordert. Die
  Annahme wird unmittelbar an der Stelle erklärt und, wo sinnvoll, durch
  Laufzeitvalidierung abgesichert.
- Daten aus externen oder anderweitig nicht vertrauenswürdigen Quellen gelten
  nicht allein aufgrund einer statischen Typdeklaration als korrekt; ihre
  Laufzeitprüfung folgt ADR-0005.
- Verbesserungen der Prüfkonfiguration erfolgen schrittweise und mit einem
  transparenten Umgang mit bestehendem technischen Rückstand. Eine
  Übergangsregel darf neue Verstöße nicht unbemerkt hinzufügen.

## Considered Options

- Prüfungen vollständig abzuschalten: verworfen, da dadurch vermeidbare Fehler
  erst zur Laufzeit auffallen.
- Eine einzige Compilerkonfiguration für alle Sprachen und Projekte:
  verworfen, da verfügbare Analysen und sinnvolle Schutzstufen variieren.
- Unbegründete Einzel-Ausnahmen als Dauerlösung: verworfen, da sie die
  Schutzwirkung schrittweise aufheben.

## Konsequenzen

+ Ein größerer Teil vermeidbarer Fehler wird vor Ausführung erkannt.
+ Die tatsächlich gewährleistete Schutzwirkung ist in lokaler Entwicklung und
  CI nachvollziehbar.
- Strenge Prüfungen können initialen Bereinigungsaufwand und zusätzliche
  Pflege erfordern.
- Fremde Bibliotheken oder dynamische Systemgrenzen können begrenzte Ausnahmen
  erfordern; diese müssen sichtbar gehalten werden.
