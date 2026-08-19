# ADR-Review — Proof-of-Concept zu Kapitel 7

Umsetzung des in Kapitel 7 der Bachelorarbeit beschriebenen Prototyps: ein
Review-Agent, der am GitLab Merge Request ansetzt, das Architekturwissen des
Projekts (Architecture Decision Records) als Prüfgrundlage heranzieht und seine
Befunde dorthin zurückmeldet, wo die Entwickelnden ohnehin arbeiten.

Der Ablauf verteilt sich auf drei Orte, die klar getrennt bleiben:

```
GitLab            Backend (Next.js)              Sandbox (Podman)
──────            ─────────────────              ────────────────
MR geöffnet   ──► Webhook prüft Secret,      ──► 1 Checkout: klonen, Diff als
                    filtert Ereignistyp             mr_diff.patch, Rauschen filtern
                                                2 Regelbasis: docs/adr/, sonst
                                                     Gruppenstandard
                                                 3 MR-bezogene Regelextraktion je ADR
                                                4 Triage auf Dateipfaden
                                                5 Prüfung je Regel:
                                                    Locator sucht, Reader urteilt
                                                6 Befunde
Inline-       ◄── Aggregation: nach ADR       ◄── Callback mit allen Befunden;
Diskussion         gruppieren, Kommentar-          danach wird die Sandbox
(nur bei NC)       text erzeugen                   gelöscht
```

## Aufbau

| Pfad | Inhalt | Abschnitt |
| --- | --- | --- |
| `src/app/api/gitlab/webhook/` | Auslösung: Secret-Prüfung, Ereignisfilter | 7.2.1 |
| `src/lib/sandbox.ts` | Start und Abbau des ephemeren Containers | 7.2.1 |
| `src/app/api/reviews/[id]/callback/` | Rückweg aus der Sandbox | 7.2.5 |
| `src/lib/comment.ts`, `src/lib/publish.ts` | Kommentartext, Inline-Positionierung | 7.3 |
| `src/app/api/findings/[id]/feedback/` | Rückmeldung am Einzelbefund | 7.5 |
| `src/app/reviews/[id]/` | Detailseite mit allen Regeln und Werkzeugaufrufen | 7.3 |
| `sandbox/src/checkout.ts` | Klon, Diff, Rauschfilter | 7.2.1 |
| `sandbox/src/rulebase.ts` | Zweistufiger Rückfall auf den Gruppenstandard | 7.2.2 |
| `sandbox/src/extract.ts` | Zerlegung eines ADR in atomare Regeln | 7.2.2 |
| `sandbox/src/triage.ts` | Vorauswahl der einschlägigen Regeln | 7.2.3 |
| `sandbox/src/judge.ts` | Locator/Reader mit Werkzeugbudget | 7.2.4 |
| `sandbox/src/tools.ts` | `list_files`, `grep`, `read_file` | 7.2.4 |
| `sandbox/standards/` | Organisationsweite Regelbasis | 7.2.2 |

## Inbetriebnahme

```bash
npm install
cp .env.example .env.local   # Werte eintragen
npm run sandbox:build        # Container-Image der Prüfumgebung
npm run build && npm start
```

In GitLab unter *Settings → Webhooks* anlegen:

- URL: `https://<backend>/api/gitlab/webhook`
- Secret Token: derselbe Wert wie `GITLAB_WEBHOOK_SECRET`
- Trigger: *Merge request events*. Das Backend startet nur bei neu geöffneten
  Merge Requests (`action: open`); Updates, Reopens, Close- und Merge-Events
  werden ignoriert.

Der Webhook quittiert sofort mit `202`; der Prüflauf dauert Minuten und
blockiert die CI/CD-Pipeline nicht (FA-12).

## Gemessene Festlegungen

Die wesentlichen Entscheidungen dieses Prototyps sind nicht gesetzt, sondern
gemessen. Wer sie ändert, ändert Verhalten, das in Kapitel 6 belegt ist:

- **Werkzeugbudget** (`BUDGET_*`, Vorgabe 8 / 5 / 2). Der Knick der
  Sättigungskurve aus Abschnitt 6.6.4. Ein zu kleines Budget lässt den Vorteil
  des Werkzeugzugriffs auf 2,4 Punkte zusammenschrumpfen; ein zu großes kostet
  Laufzeit ohne Gegenwert. Die Ausschöpfung gilt als Unsicherheitssignal, nicht
  als Anlass weiterzusuchen — falsche Urteile gingen mit *mehr* Werkzeugnutzung
  einher als richtige (Abschnitt 6.6.2).
- **ADR-Statusfilter.** Nur ADRs mit Status `accepted`, `angenommen`,
  `akzeptiert`, `approved` oder `beschlossen` werden als Regelbasis geladen.
  Deprecated, superseded oder statuslose Dokumente werden protokolliert und
  nicht extrahiert.
- **Begrenzte Parallelität** (`EXTRACTION_CONCURRENCY`, `JUDGING_CONCURRENCY`,
  Vorgabe 3 / 3). ADR-Extraktion und Regelprüfungen sind unabhängige
  Modellaufgaben und laufen deshalb parallel. Die Grenze verhindert, dass das
  Modellgateway durch einen Merge Request mit Requests überflutet wird; bei
  429-Antworten sollte der Wert gesenkt werden.
- **Nur `NC` erzeugt einen Kommentar** (`src/lib/publish.ts`). „Der Code
  widerspricht der Regel" und „es wurde nichts gefunden" sind zwei verschiedene
  Sachverhalte. Sie zusammenzufassen erklärt allein 46 % des in Abschnitt 6.5
  gemessenen Verfahrensunterschieds und erzeugt genau den Fehlalarm, an dem
  statische Analysewerkzeuge ihre Akzeptanz verlieren.
- **Suchraum ohne Sprachfilter** (`sandbox/src/tools.ts`). 60 % der als
  unentscheidbar eingestuften Fälle sind Artefakte einer Whitelist, die nur
  Programmiersprachen erfasst (Abschnitt 6.2.2). CI-, Build- und
  Konfigurationsdateien bleiben deshalb im Suchraum; ausgeschlossen sind nur die
  ADR-Dateien selbst (FA-5).
- **Trennung von Locator und Reader** (`sandbox/src/judge.ts`). Übernommen aus
  dem in Kapitel 6 vermessenen Aufbau, unverändert. Sie hält die
  Werkzeugprotokolle auswertbar: Aus ihnen lässt sich ablesen, ob eine Suche
  erfolglos blieb oder ob gefundene Evidenz nicht gelesen wurde.
- **Rückmeldung am Einzelbefund, nicht am Review** (`src/app/api/findings/`).
  Wer ein fremdes Urteil samt Begründung vorgelegt bekommt, verankert sich daran
  statt unabhängig zu prüfen (Abschnitt 6.1.1, Anhang A.7).

## Bewusst nicht umgesetzt

Entsprechend Abschnitt 4.1.4 und 7.4:

- **Rückführung des Feedbacks.** Bewertungen werden gespeichert, aber nicht in
  den Prüfvorgang zurückgeführt.
- **Priorisierung nach Schweregrad** und **sprachspezifische Analyse.**
- **Automatisierte Testabdeckung.** Die Absicherung erfolgte empirisch über die
  Auswertung ganzer Läufe gegen eine Referenz.

Bekannte Schwäche der Triage: Sie entscheidet allein auf Dateipfaden, sodass
eine Regel verlorengehen kann, deren Verletzung sich in einer dem Namen nach
unverdächtigen Datei zeigt. Der Fehler wirkt in Richtung des Übersehens und
nicht in Richtung des Fehlalarms (Abschnitt 7.2.3).
