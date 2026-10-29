# ADR-0013: Personenbezogene Daten werden zweckgebunden und sparsam verarbeitet

## Status

accepted (2026-10-29)

## Kontext

Projekte können personenbezogene oder anderweitig sensible Daten erheben,
anzeigen, übertragen, speichern und protokollieren. Werden mehr Daten als für
einen festgelegten Zweck erforderlich verarbeitet oder bleiben sie länger als
nötig verfügbar, steigen Folgen eines Fehlers oder einer Offenlegung.
Unbestimmte Zwecke, zu breite Zugriffe und nicht definierte Löschwege erschweren
außerdem den sicheren Betrieb und die Beantwortung von Anfragen betroffener
Personen. Die anwendbaren rechtlichen und organisatorischen Verpflichtungen
hängen vom Projekt, den Datenarten, den Nutzenden und dem Einsatzgebiet ab.

Dieser Gruppenstandard ersetzt keine projektspezifische rechtliche Bewertung.
Er legt einen technischen und organisatorischen Mindestanspruch fest, der für
jedes Projekt mit personenbezogenen oder vergleichbar sensiblen Daten gilt.

## Entscheidung

Wir werden personenbezogene und andere sensible Daten nur mit festgelegtem
Zweck, begrenztem Zugriff und angemessener Aufbewahrung verarbeiten. Jedes
betroffene Projekt dokumentiert die für seine Datenflüsse relevanten
Schutzmaßnahmen und Verantwortlichkeiten.

- Es wird ermittelt und dokumentiert, welche personenbezogenen oder sonstigen
  sensiblen Daten das Projekt verarbeitet, aus welchen Quellen sie stammen,
  wohin sie übermittelt werden und für welche Funktionen sie benötigt werden.
- Daten werden auf das für den jeweiligen Zweck notwendige Minimum begrenzt.
  Nicht benötigte Felder, Kopien, Exporte und Testdaten werden vermieden.
- Zwecke und zulässige Verwendung sind für relevante Datenbestände erkennbar.
  Daten werden nicht ohne Prüfung für einen anderen, unvereinbaren Zweck
  weiterverwendet.
- Zugriffe werden nach ADR-0012 auf den notwendigen Personenkreis und die
  erforderlichen Funktionen beschränkt. Übertragungen und Speicherorte werden
  entsprechend Schutzbedarf und Projektvorgaben gewählt.
- Aufbewahrungsfristen oder auslösende Löschbedingungen werden für relevante
  Datenbestände festgelegt. Daten werden nach Ablauf des Zwecks oder der
  vorgesehenen Frist gelöscht oder, sofern fachlich und rechtlich zulässig,
  irreversibel anonymisiert. Sicherungskopien und abgeleitete Daten werden in
  der Planung berücksichtigt.
- Protokolle, Fehlermeldungen, Telemetrie und Supportinformationen enthalten
  personenbezogene Daten nur, wenn dies für ihren klar benannten Zweck
  erforderlich ist. Speicherung, Zugriff und Aufbewahrung solcher Einträge
  folgen ADR-0006.
- Produktive personenbezogene Daten werden nicht ohne nachvollziehbare
  Notwendigkeit in Entwicklungs-, Demonstrations- oder Testumgebungen kopiert.
  Wo realistische Daten erforderlich sind, werden sie bevorzugt synthetisiert
  oder angemessen anonymisiert beziehungsweise pseudonymisiert.
- Externe Anbieter und Integrationen, an die sensible Daten übertragen werden,
  werden hinsichtlich Zweck, Umfang, Schutz und Verantwortlichkeit überprüft.
  Die Einbindung folgt außerdem ADR-0001.
- Funktionen zum Export, zur Berichtigung, Einschränkung oder Löschung von Daten
  werden berücksichtigt, wenn sie für den Einsatzzweck oder die geltenden
  Projektvorgaben erforderlich sind.
- Sicherheitsvorfälle mit personenbezogenen Daten werden gemäß den
  organisationsweiten Vorfall- und Eskalationswegen behandelt. Technische
  Protokolle dürfen nicht als Ersatz für einen geregelten Vorfallprozess dienen.
- Projekte, die nachweislich keine personenbezogenen oder vergleichbar
  sensiblen Daten verarbeiten, halten diese Entscheidung als nicht anwendbar
  fest und überprüfen die Einstufung bei wesentlichen Änderungen.

## Considered Options

- Daten vorsorglich vollständig und unbegrenzt speichern: verworfen, weil
  Umfang und Folgen eines Missbrauchs unnötig wachsen.
- Datenschutz allein durch Zugriffsbeschränkung lösen: verworfen, weil auch
  zulässige Zugriffe zweckgebunden und zeitlich begrenzt sein müssen.
- Für alle Projekte dieselbe Datenaufbewahrungsfrist festlegen: verworfen, weil
  Datenarten, Zweck und anwendbare Vorgaben variieren.
- Produktivdaten routinemäßig für Tests kopieren: verworfen, weil Testumgebungen
  häufig nicht dieselben Schutzmaßnahmen wie Produktionssysteme besitzen.

## Konsequenzen

+ Datenflüsse, Zwecke und Verantwortlichkeiten werden bewusster und
  nachvollziehbarer gestaltet.
+ Weniger gespeicherte und weitergegebene Daten begrenzen mögliche Auswirkungen
  von Fehlzugriffen und Sicherheitsvorfällen.
+ Löschung, Testdatennutzung und Protokollierung erhalten klare Anforderungen.
- Dateninventar, Fristen und Verantwortlichkeiten müssen gepflegt werden.
- Anonymisierung, Löschung aus abgeleiteten Beständen und Sicherungskopien
  können zusätzliche technische Arbeit erfordern.
- Projektspezifische rechtliche und organisatorische Prüfungen bleiben
  erforderlich, wenn die Datenverarbeitung dies verlangt.
