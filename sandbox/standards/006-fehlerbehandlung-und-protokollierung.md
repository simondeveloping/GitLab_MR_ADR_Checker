# ADR-0006: Fehler und Betriebsereignisse werden nachvollziehbar behandelt

## Status

accepted (2026-10-29)

## Kontext

Fehler sind in jedem System unvermeidbar, ihre Behandlung darf jedoch nicht
zufällig oder stillschweigend erfolgen. Ohne konsistente Fehlergrenzen werden
technische Details nach außen offengelegt, Fehler falsch als Erfolg behandelt
oder dieselben Probleme mehrfach protokolliert. Fehlende Kontextinformationen
erschweren die Diagnose; unbedachte Protokollierung kann gleichzeitig
Geheimnisse und personenbezogene Daten offenlegen. Die verwendete
Protokollierungsinfrastruktur unterscheidet sich zwischen Bibliotheken,
Diensten, Kommandozeilenprogrammen und anderen Projekttypen.

## Entscheidung

Wir werden Fehler kontrolliert weitergeben oder behandeln und für den Betrieb
relevante Ereignisse über die im Projekt festgelegten Protokollierungs- und
Diagnosewege nachvollziehbar machen.

- Für jede Komponente ist erkennbar, wer einen Fehler behandelt, wer ihn
  weitergibt und an welcher Grenze er in eine externe Antwort oder einen
  Prozessstatus übersetzt wird. Fehler werden weder verschluckt noch als
  erfolgreiche Ergebnisse ausgegeben.
- Erwartbare fachliche Fälle und unerwartete technische Ausfälle werden
  unterscheidbar modelliert. Wiederholtes Weiterwerfen und Protokollieren
  desselben Fehlers an jeder Schicht wird vermieden.
- Betriebsrelevante Einträge enthalten angemessenen Kontext wie Zeit,
  Ereignisart, betroffene nicht sensible Ressource und – sofern verfügbar –
  Korrelationskennung. Das Format und die Schweregrade sind innerhalb des
  Projekts konsistent und maschinell auswertbar, soweit die Plattform dies
  unterstützt.
- Geheimnisse, Authentifizierungsdaten, vollständige Zahlungsdaten und andere
  sensible Inhalte werden nicht protokolliert. Personenbezogene Daten werden
  auf das notwendige Minimum begrenzt und nach den geltenden Vorgaben behandelt.
- Antworten an Nutzende oder externe Systeme enthalten nur Informationen, die
  für die sichere Fehlerbehebung erforderlich sind. Stacktraces, interne Pfade,
  Abfrageinhalte und Implementierungsdetails bleiben internen Diagnosewegen
  vorbehalten.
- Ein Fehlerfang ohne Behandlung ist unzulässig. Wird ein Fehler bewusst
  ignoriert, ist die Bedingung ausdrücklich begründet und es ist sichergestellt,
  dass kein erforderlicher Zustand oder Betriebsalarm verloren geht.
- Fehler beim Start, bei Hintergrundarbeit und beim Herunterfahren werden dem
  Lebenszyklus entsprechend behandelt. Bibliotheks- und Fachmodule erzwingen
  nicht ohne Not den Abbruch des gesamten Prozesses; die Entscheidung über
  Prozessende liegt an einer geeigneten Anwendungsschnittstelle.
- Protokolle enthalten keine Geheimnisse und sind nicht die einzige Ablage für
  fachlich notwendige oder dauerhaft aufzubewahrende Daten.

## Considered Options

- Unstrukturierte, uneinheitliche Ausgaben an beliebigen Stellen: verworfen,
  weil sie Diagnose und zentrale Auswertung erschweren.
- Jede Störung nur dem Endnutzer zu melden: verworfen, weil dies keine
  ausreichenden Informationen für Betrieb und Fehlerbehebung liefert.
- Fehlerdetails vollständig in externe Antworten zu übernehmen: verworfen,
  weil dadurch interne Informationen offengelegt werden können.

## Konsequenzen

+ Fehler lassen sich mit konsistentem Kontext untersuchen, ohne interne Details
  unnötig offenzulegen.
+ Fehlerpfade sind erkennbar und können weder unbemerkt als Erfolg weiterlaufen
  noch unkontrolliert nach außen dringen.
- Protokollierung benötigt eine abgestimmte Konfiguration und muss hinsichtlich
  Zugriff, Aufbewahrung und Datenminimierung betrieben werden.
- Zu viele oder redundante Einträge erschweren die Diagnose; Relevanz und
  angemessene Ereignisdetails müssen bei der Implementierung berücksichtigt
  werden.
