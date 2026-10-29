# ADR-0009: Ressourcenintensive Arbeit und Nebenläufigkeit werden kontrolliert

## Status

accepted (2026-10-29)

## Kontext

Ein synchroner, ressourcenintensiver oder unbegrenzt wartender Vorgang kann
andere Arbeit verzögern, gemeinsam genutzte Ressourcen erschöpfen oder das
System unvorhersehbar machen. Nebenläufige Abläufe können sich überschneiden und
denselben Zustand widersprüchlich verändern. Nicht beobachtete Fehler in
Hintergrundarbeit gehen leicht verloren. Die konkreten Mechanismen unterscheiden
sich je nach Plattform: Ereignisschleife, Threads, Prozesse, Worker, Jobs oder
andere Ausführungsmodelle.

## Entscheidung

Wir werden Ausführungsdauer, Ressourcennutzung und Nebenläufigkeit für relevante
Abläufe begrenzen und ihre Fehler sowie ihren Lebenszyklus ausdrücklich
behandeln. Die Umsetzung richtet sich nach Laufzeit und Produkttyp.

- Arbeit, die den Fortschritt anderer Anfragen oder Aufgaben erheblich
  blockieren könnte, wird nicht unkontrolliert in einem gemeinsam genutzten
  Ausführungspfad ausgeführt. Falls synchrone oder ressourcenintensive Arbeit
  fachlich nötig ist, werden ihr Einsatzbereich und ihre Auswirkungen begrenzt.
- Externe Operationen, die auf Netzwerk, Speicher, Prozesse oder andere
  unabhängige Ressourcen warten, haben angemessene Zeit- oder Abbruchgrenzen,
  soweit die Schnittstelle dies erlaubt. Ein Abbruch der aufrufenden Arbeit
  wird nicht mit erfolgreichem Abschluss verwechselt.
- Asynchrone beziehungsweise parallel gestartete Arbeit wird entweder
  abgewartet, an einen verantwortlichen Aufrufer weitergegeben oder durch einen
  ausdrücklich verantwortlichen Hintergrundmechanismus verwaltet. Fehler und
  Abschlusszustand solcher Arbeit bleiben beobachtbar.
- Nebenläufige Änderungen an gemeinsam genutztem Zustand sind gegen verlorene
  Aktualisierungen, doppelte Verarbeitung und inkonsistente Zwischenzustände
  abzusichern. Wo Wiederholungen oder konkurrierende Zustellungen möglich sind,
  werden Idempotenz oder Duplikaterkennung erwogen.
- Parallelität und Warteschlangen werden soweit erforderlich begrenzt; ein
  eingehender Lastanstieg darf nicht unbegrenzt Aufgaben, Verbindungen, Speicher
  oder Prozessressourcen ansammeln.
- Hintergrundarbeit hat einen definierten Lebenszyklus einschließlich Fehler-
  und Beendigungsverhalten. Wird sie ausgelagert, muss die Übergabe hinreichend
  zuverlässig und nachvollziehbar sein.
- Für kurze, klar begrenzte Start- oder Einmalaufgaben kann ein blockierender
  Schritt angemessen sein. Die Regel verlangt keine unnötige Asynchronität,
  sondern die begründete Vermeidung relevanter Blockaden und unkontrollierter
  Nebenläufigkeit.

## Considered Options

- Jede Arbeit grundsätzlich asynchron auszuführen: verworfen, weil dies
  unnötige Komplexität für kurze und klar begrenzte Aufgaben erzeugt.
- Unbegrenzte parallele Ausführung: verworfen, da sie Ressourcen erschöpfen und
  Fehler verstärken kann.
- Ausschließliche Absicherung durch Lasttests: verworfen, weil solche Tests
  weder definierte Laufzeitgrenzen noch Fehlerbehandlung ersetzen.

## Konsequenzen

+ Lange oder parallele Abläufe beeinträchtigen gemeinsam genutzte Ressourcen
  weniger leicht unkontrolliert.
+ Fehler und Abschlusszustände von Hintergrundarbeit bleiben nachvollziehbar.
- Zeitlimits, Parallelitätsgrenzen und Wiederholungsregeln benötigen
  projektspezifische Werte und Tests.
- Explizite Lebenszyklen können zusätzliche Zustands- und Fehlerbehandlung
  erfordern.
