# ADR-0011: Verantwortlichkeiten und Abhängigkeiten bleiben nachvollziehbar

## Status

accepted (2026-10-29)

## Kontext

Wenn Verantwortlichkeiten nicht erkennbar abgegrenzt sind, entstehen
ungewollte Abhängigkeiten, doppelte Regeln und Änderungen mit überraschend
großem Wirkungsbereich. Eine Komponente kennt dann Details anderer Teile, die
sie für ihre Aufgabe nicht benötigt. Das erschwert Wartung, Tests und spätere
Änderungen. Wie ein Projekt seine Komponenten schneidet, hängt von seiner Größe,
Architektur, Sprache und seinem Laufzeitmodell ab; eine feste Schichtung ist
nicht für jedes Projekt geeignet.

## Entscheidung

Wir werden Verantwortlichkeiten und Abhängigkeiten so gestalten, dass jede
Komponente eine nachvollziehbare Aufgabe und klar erkennbare Schnittstellen
hat. Projekte legen ihre konkrete Modul- und Paketstruktur selbst fest und
verhindern für ihre Architektur wesentliche unerwünschte Abhängigkeiten durch
geeignete Reviews oder automatisierte Prüfungen.

- Jede wesentliche Komponente hat eine fachlich oder technisch verständliche
  Verantwortung. Komponenten sollen nicht ohne nachvollziehbaren Grund
  gleichzeitig für voneinander unabhängige Aufgaben zuständig sein.
- Abhängigkeiten folgen einer für das Projekt verständlichen Richtung.
  Höherliegende oder äußere Komponenten dürfen nicht unbemerkt die
  Implementierungsdetails niedrigerliegender oder innerer Komponenten
  festschreiben; projektweit relevante Grenzen werden dokumentiert.
- Andere Komponenten verwenden vorgesehene öffentliche Schnittstellen statt
  interner Implementierungsdetails. Änderungen an einer internen Datei sollen
  nicht unbeabsichtigt einen großen Teil des Projekts brechen.
- Gemeinsame Logik wird dort geteilt, wo dadurch tatsächlich eine klare,
  kohärente Wiederverwendung entsteht. Ein allgemeines Sammelmodul oder eine
  abstrakte Plattform nur zur Vermeidung kleiner Wiederholungen wird nicht
  vorausgesetzt.
- Zyklen und stark gekoppelte Abhängigkeiten werden vermieden oder begründet,
  da sie Tests, Änderungen und Wiederverwendung erschweren.
- Kritische Architekturregeln werden, soweit praktikabel, automatisiert geprüft
  und in die Qualitätsprüfungen eingebunden (ADR-0003). Wo eine technische
  Durchsetzung nicht angemessen ist, sind die Grenzen in Dokumentation und
  Review-Konventionen nachvollziehbar.
- Zugriffe auf externe Systeme und dauerhaften Zustand folgen den jeweils
  relevanten Integrationsentscheidungen (ADR-0001 und ADR-0007), ohne dass dafür
  ein bestimmter Verzeichnisname oder ein bestimmtes Entwurfsmuster erforderlich
  ist.
- Die Struktur soll dem aktuellen Bedarf entsprechen und darf sich mit dem
  Wachstum des Projekts weiterentwickeln. Architekturregeln werden nicht nur
  wegen einer abstrakten Idealstruktur eingeführt.

## Considered Options

- Eine identische Schichtenarchitektur und Verzeichnisstruktur für alle
  Projekte: verworfen, da Projektgröße und Laufzeitmodell variieren.
- Abhängigkeiten vollständig frei und ohne benannte Verantwortlichkeiten zu
  lassen: verworfen, weil die resultierende Kopplung schwer nachvollziehbar und
  änderbar wird.
- Jede Grenze zwingend mit einem separaten Paket oder Werkzeug zu erzwingen:
  verworfen, da die technische Komplexität im Verhältnis zum Risiko stehen
  muss.

## Konsequenzen

+ Zuständigkeiten, Schnittstellen und Auswirkungen von Änderungen sind leichter
  zu verstehen.
+ Tests und Weiterentwicklung können an klaren Verantwortlichkeiten ansetzen.
- Zusätzliche Schnittstellen und Prüfungen erfordern Pflege und können bei
  falschem Zuschnitt unnötige Komplexität erzeugen.
- Projektteams müssen wichtige Abhängigkeitsregeln benennen und bei Änderungen
  daran festhalten oder die Entscheidung aktualisieren.
