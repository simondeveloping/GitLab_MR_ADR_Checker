# ADR-0003: Verbindliche Qualitätsstufen in der CI-Pipeline

## Status

accepted (2026-01-20)

## Kontext

Ohne verbindliche Stufen in der Pipeline unterscheidet sich von Projekt zu
Projekt, was vor einem Merge geprüft wird. Ein Teil der Projekte führte Linter
und Typprüfung nur lokal aus, sodass Verstöße erst nach dem Merge auffielen.

## Entscheidung

Wir werden in jedem Projekt eine CI-Pipeline mit den Stufen `lint`, `test` und
`build` führen.

- Die Datei `.gitlab-ci.yml` liegt im Wurzelverzeichnis des Repositorys.
- Die Stufe `lint` führt die statische Analyse aus und bricht bei Verstößen ab.
- Die Stufe `test` führt die automatisierten Tests aus; ein fehlgeschlagener
  Test bricht die Pipeline ab.
- Keine Stufe wird über `allow_failure: true` weichgestellt.

## Considered Options

- Prüfungen ausschließlich über Git-Hooks vor dem Commit: verworfen, weil sich
  Hooks lokal umgehen lassen.
- Nächtliche Sammelläufe statt Prüfung je Merge Request: verworfen, weil die
  Rückmeldung dann zu spät kommt.

## Konsequenzen

+ Vor jedem Merge liegt ein einheitliches Prüfergebnis vor.
+ Der Zustand des Zielbranches bleibt verlässlich.
- Die Laufzeit eines Merge Requests steigt um die Pipeline-Dauer.
