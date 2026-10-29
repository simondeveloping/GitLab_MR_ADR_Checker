# ADR-0001: Externe Abhängigkeiten werden kontrolliert integriert

## Status

accepted (2026-10-29)

## Kontext

Projekte verwenden externe Dienste, Bibliotheken, Plattformfunktionen oder
andere Systeme, deren Verfügbarkeit, Verhalten und Lebenszyklus sie nicht selbst
kontrollieren. Wenn fachliche Abläufe diese Abhängigkeiten an beliebigen Stellen
direkt ansprechen, verteilen sich Protokoll-, Authentifizierungs-, Zeitlimit-,
Fehler- und Wiederholungslogik über den Code. Dadurch entstehen inkonsistente
Fehlerbehandlung, schwer reproduzierbare Tests und unnötig hohe Kosten bei einem
Wechsel oder einer Änderung eines Anbieters. Ein Ausfall oder eine langsame
Antwort einer Abhängigkeit kann außerdem Ressourcen des eigenen Systems binden.

Die konkrete technische Form einer Integrationsgrenze hängt vom Projekt ab:
Das kann ein Adapter, ein Client, ein Modul, eine Bibliothek oder eine andere
klar erkennbare Schnittstelle sein. Nicht jedes Projekt kommuniziert über HTTP;
die Regel muss daher unabhängig von Protokoll und Programmiersprache gelten.

## Entscheidung

Wir werden jede externe Abhängigkeit über eine klar abgegrenzte und im Projekt
einheitlich verwendete Integrationsschnittstelle anbinden. Der konkrete Ort und
Name dieser Schnittstelle ist projektspezifisch und wird dort dokumentiert.

- Fachliche Abläufe verwenden die definierte Integrationsschnittstelle und
  duplizieren keine anbieter- oder protokollspezifische Kommunikation.
- An der Integrationsgrenze werden die für die Abhängigkeit relevanten
  Eigenschaften zentral behandelt: Konfiguration, Authentifizierung,
  Zeitlimits, Fehlerübersetzung und – sofern sinnvoll – Wiederholungsversuche.
- Netzwerk- und sonstige potenziell unbegrenzt wartende Operationen erhalten ein
  angemessenes, konfigurierbares Zeitlimit. Sie dürfen nicht unbegrenzt
  Ressourcen des Projekts binden.
- Wiederholungen sind begrenzt und berücksichtigen, ob eine Operation sicher
  wiederholt werden kann. Nicht-idempotente Änderungen werden nicht blind
  wiederholt; gegebenenfalls sind Idempotenzschlüssel oder eine fachliche
  Duplikaterkennung erforderlich.
- Fehler einer Abhängigkeit werden so übersetzt, dass der aufrufende Fachcode
  zwischen erwartbaren fachlichen Ergebnissen und technischen Ausfällen
  unterscheiden kann, ohne interne Details der Abhängigkeit vorauszusetzen.
- Die Integrationsschnittstelle muss in automatisierten Tests ersetzbar oder
  kontrolliert simulierbar sein. Tests verwenden keine unbeabsichtigten
  Produktivzugänge.
- Zugangsdaten, Endpunkte und andere umgebungsabhängige Werte werden nicht in
  Fachlogik fest codiert; sie folgen ADR-0002.
- Wo eine Abhängigkeit für einen kritischen Ablauf unverzichtbar ist, werden
  Ausfallverhalten und gegebenenfalls Degradationsverhalten festgelegt und
  nachvollziehbar gemacht.

## Considered Options

- Direkte Aufrufe aus beliebigen fachlichen Modulen: verworfen, weil Regeln und
  Anbieterwissen dadurch verstreut und Tests schwer isolierbar werden.
- Eine einzige universelle Integrationsschicht für alle Projekte: verworfen,
  weil Protokolle, Laufzeitumgebungen und Anforderungen unterschiedlich sind.
- Ein zentraler Vermittlungsdienst für jede externe Abhängigkeit: nicht als
  Gruppenpflicht festgelegt, da Nutzen und Betriebsaufwand vom Projektkontext
  abhängen.

## Konsequenzen

+ Integrationsverhalten ist auffindbar, konsistent und gezielt testbar.
+ Langsame oder ausgefallene Abhängigkeiten können kontrolliert behandelt werden.
+ Ein Anbieterwechsel bleibt auf eine überschaubare Integrationsgrenze begrenzt.
- Für jede externe Abhängigkeit entsteht eine zusätzliche Abstraktion, die
  gepflegt werden muss.
- Zeitlimits, Wiederholungsregeln und Ausfallverhalten müssen passend zum
  jeweiligen fachlichen Ablauf gewählt und dokumentiert werden.
- Eine zu umfangreiche oder undurchsichtige Abstraktion kann hilfreiche
  Fähigkeiten des Anbieters verbergen; die Schnittstelle muss den tatsächlichen
  Bedarf des Projekts abbilden.
