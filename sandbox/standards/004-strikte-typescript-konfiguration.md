# ADR-0004: Strikte TypeScript-Konfiguration ohne Ausnahmen

## Status

accepted (2026-01-08)

## Kontext

In mehreren Projekten der Abteilung war der strikte Modus des Compilers
abgeschaltet oder wurde an einzelnen Stellen mit Kommentaren umgangen. Die
Folge waren Laufzeitfehler in Fällen, die der Compiler bei aktivierter
Prüfung gemeldet hätte. Ein nachträgliches Einschalten ist umso teurer, je
länger ein Projekt ohne strikte Prüfung gewachsen ist.

## Entscheidung

Wir werden den strikten Modus in jedem TypeScript-Projekt aktivieren und nicht
punktuell umgehen.

- In `tsconfig.json` ist `strict` auf `true` gesetzt.
- Der Compiler wird im Rahmen der CI-Pipeline mit `tsc --noEmit` aufgerufen.
- Der Kommentar `@ts-ignore` ist nicht zulässig. Wo eine Prüfung
  nachweislich falsch greift, wird `@ts-expect-error` mit einer Begründung im
  Kommentar verwendet.
- Der Typ `any` wird nicht als explizite Annotation geschrieben; unbekannte
  Eingaben werden als `unknown` typisiert und vor der Verwendung eingeengt.

## Considered Options

- Strikter Modus nur für neue Dateien über mehrere `tsconfig`-Projekte:
  verworfen, weil die Grenze zwischen altem und neuem Code im Alltag verwischt.
- Nur `noImplicitAny` statt des vollen strikten Modus: verworfen, weil die
  Prüfungen auf `null` und `undefined` gerade die häufigsten Laufzeitfehler
  abdecken.

## Konsequenzen

+ Fehler fallen beim Übersetzen auf und nicht im Betrieb.
+ Der Umgang mit `null` und `undefined` ist im ganzen Projekt einheitlich.
- Die Migration bestehender Module erfordert einmaligen Aufwand.
- Fremdbibliotheken ohne gute Typen brauchen eigene Deklarationen.
