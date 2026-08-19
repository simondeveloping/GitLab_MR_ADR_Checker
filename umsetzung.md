# Umsetzung des ADR-gestuetzten Merge-Request-Reviews

Dieses Dokument beschreibt den aktuellen technischen Ablauf des Prototyps. Es ist als Grundlage fuer Kapitel 7 der Arbeit gedacht und fasst zusammen, welche Komponenten beteiligt sind, wie ein Review ausgelöst wird, wie die Sandbox arbeitet und wie die Ergebnisse wieder nach GitLab gelangen.

## Ziel des Prototyps

Der Prototyp prueft einen GitLab Merge Request gegen Architecture Decision Records (ADRs). Die ADRs bilden dabei die projektspezifische oder organisationsweite Architekturregelbasis. Das System soll nicht allgemein Codequalitaet bewerten, sondern konkrete Architekturentscheidungen gegen den geaenderten Codestand pruefen.

Der Ablauf ist bewusst von der CI/CD-Pipeline entkoppelt. GitLab sendet lediglich ein Merge-Request-Ereignis an das Backend. Das Backend quittiert den Webhook schnell und startet den eigentlichen Review im Hintergrund in einer ephemeren Sandbox. Dadurch blockiert ein mehrminuetiger LLM-gestuetzter Prueflauf weder die Webhook-Zustellung noch die Pipeline.

## Beteiligte Komponenten

Der Prototyp besteht aus drei Hauptteilen:

1. GitLab
2. Backend als Next.js-Anwendung
3. Sandbox-Container mit dem Review-Agenten

GitLab ist der Ausloeser und Zielort der Rueckmeldung. Das Backend nimmt Webhooks entgegen, verwaltet Review-Datensaetze, startet Sandboxen und veroeffentlicht Befunde. Die Sandbox fuehrt den eigentlichen Prueflauf aus: Repository klonen, Diff erzeugen, ADRs laden, Regeln extrahieren, relevante Regeln pruefen und Ergebnis per Callback zurueckmelden.

## Ablaufuebersicht

```text
GitLab                 Backend                         Sandbox
------                 -------                         -------
MR wird geoeffnet  ->  Webhook /api/gitlab/webhook
                       Secret und Event pruefen
                       Review-Datensatz anlegen
                       Platzhalter-Kommentar setzen
                       Sandbox-Container starten   ->   Repository klonen
                                                        Diff erzeugen
                                                        ADRs laden und filtern
                                                        Regeln extrahieren
                                                        Regeln triagieren
                                                        Regeln pruefen
                                                        Ergebnis per Callback
                                                        senden
Callback empfangen <-  /api/reviews/[id]/callback
                       Ergebnis speichern
                       Befunde in GitLab kommentieren
                       Platzhalter entfernen
```

## Ausloesung durch GitLab

Der Einstiegspunkt ist der API-Endpunkt:

```text
POST /api/gitlab/webhook
```

GitLab sendet Merge-Request-Events an diesen Endpunkt. Das Backend akzeptiert nur Ereignisse, bei denen der Merge Request neu geoeffnet wurde. Reopen-, Update-, Close- und Merge-Ereignisse werden ignoriert. Dadurch wird verhindert, dass ein MR mehrfach durch kleinere Aenderungen, Label-Aenderungen oder neue Commits mehrere Sandboxen startet.

Der Endpunkt prueft zuerst das GitLab-Webhook-Secret ueber den Header `X-Gitlab-Token`. Danach wird das Payload ausgewertet. Nur wenn `object_kind` den Wert `merge_request` hat und `object_attributes.action` gleich `open` ist, wird ein Review gestartet.

Ist das Ereignis gueltig, laedt das Backend ueber die GitLab-API den Merge-Request-Kontext nach. Dazu gehoeren unter anderem Projekt-ID, Repository-URL, Source- und Target-Branch, Commit-SHA, Web-URL und die `diff_refs`, die spaeter fuer Inline-Kommentare benoetigt werden.

## Review-Datensatz im Backend

Vor dem Start der Sandbox legt das Backend einen Review-Datensatz als JSON-Datei an. Die Dateien liegen unter:

```text
data/reviews/<review-id>.json
```

Ein Review enthaelt unter anderem:

- eindeutige Review-ID
- Status (`queued`, `running`, `completed`, `failed`)
- Merge-Request-Kontext
- Callback-Token fuer die Sandbox
- spaeter das Ergebnis der Sandbox
- spaeter das Sandbox-Log
- spaeter Informationen zu veroeffentlichten Kommentaren

Die Speicherung als JSON-Datei ist fuer den Prototyp bewusst einfach gehalten. Sie macht den Ablauf nachvollziehbar und erlaubt es, einzelne Reviews ohne Datenbank direkt zu untersuchen.

## Platzhalter-Kommentar in GitLab

Nach dem Anlegen des Review-Datensatzes setzt das Backend einen kurzlebigen Kommentar am Merge Request. Dieser informiert die Entwickelnden, dass ein Architekturkonformitaets-Review laeuft. Der Kommentar enthaelt keine Feedback- oder Verlaufslinks. Nach Abschluss des Reviews wird dieser Platzhalter wieder entfernt.

Der Platzhalter hat zwei Funktionen:

- Er macht sichtbar, dass der Webhook angenommen wurde und der Review im Hintergrund laeuft.
- Er verhindert, dass ein laengerer LLM-Lauf wie ein nicht reagierendes System wirkt.

## Start der Sandbox

Der eigentliche Review laeuft in einem eigenen Container. Das Backend startet ihn ueber Podman oder Docker-kompatible Laufzeit, standardmaessig mit:

```text
podman run --rm --name adr-review-<review-id> ... adr-review-agent:latest
```

Der Container ist ephemer. Er wird pro Review neu erzeugt und nach Ende des Laufs automatisch geloescht. Der Container bekommt alle notwendigen Informationen ueber Umgebungsvariablen, nicht ueber Kommandozeilenargumente. Dadurch werden Geheimnisse wie GitLab-Token oder LLM-API-Key nicht in der Prozessliste sichtbar.

Wichtige Umgebungsvariablen sind:

- `REVIEW_ID`
- `REPO_URL`
- `MR_SHA`
- `MR_SOURCE_BRANCH`
- `MR_TARGET_BRANCH`
- `MR_IID`
- `CALLBACK_URL`
- `CALLBACK_TOKEN`
- `LLM_BASE_URL`
- `LLM_API_KEY`
- `LLM_MODEL`
- `BUDGET_SEARCH_ROUNDS`
- `BUDGET_FILE_READS`
- `BUDGET_REFETCHES`
- `EXTRACTION_CONCURRENCY`
- `JUDGING_CONCURRENCY`

Der Container laeuft mit eingeschraenkten Rechten:

- `--read-only`
- `--cap-drop ALL`
- `--security-opt no-new-privileges`
- temporaeres `/tmp`
- temporaeres `/work` als Arbeitsverzeichnis
- Speicher- und Prozesslimits

Der geklonte Code liegt nur im temporaeren Arbeitsverzeichnis des Containers und verschwindet nach Ende des Laufs.

## Checkout und Diff-Erzeugung

Der erste Schritt in der Sandbox ist der Checkout des Merge-Request-Stands. Der Agent klont das Repository, checkt den Commit des Merge Requests aus und bestimmt die Merge-Base gegen den Zielbranch. Danach erzeugt er einen Diff zwischen Merge-Base und MR-Commit.

Der Diff wird als Datei in das geklonte Repository geschrieben:

```text
mr_diff.patch
```

Diese Datei ist Teil des Suchraums. Der Agent bekommt den Diff also nicht als riesigen Prompt-Kontext, sondern kann ihn mit denselben Werkzeugen durchsuchen wie den uebrigen Quellbaum. Das vermeidet sehr grosse Prompts und umgeht Laengenbegrenzungen von Kommandozeilenargumenten oder Modellkontexten.

Vor dem Schreiben des Patchs filtert der Checkout-Schritt Rauschen aus. Beispiele sind Lockfiles, binaere Dateien, generierte Artefakte, Build-Verzeichnisse, `node_modules`, `.next`, `dist` oder `target`. Der gefilterte Diff soll moeglichst nur Dateien enthalten, die fuer Architekturentscheidungen relevant sein koennen.

## Auswahl der Regelbasis

Nach dem Checkout sucht die Sandbox zuerst nach projektspezifischen ADRs im geklonten Repository. Standardpfad ist:

```text
docs/adr
```

Findet die Sandbox dort ADR-Dateien, werden diese als Regelbasis verwendet. Gibt es dort keine ADRs, faellt der Prototyp auf eine organisationsweite Regelbasis zurueck, die im Container-Image enthalten ist:

```text
/opt/adr-standard
```

Dieser Rueckfall macht auch neue oder unvollstaendig dokumentierte Repositories pruefbar.

## Statusfilter fuer ADRs

Nicht jede ADR-Datei wird als gueltige Regelbasis verwendet. Die Sandbox beruecksichtigt nur ADRs mit akzeptiertem Status. Unterstuetzte Statuswerte sind:

- `accepted`
- `angenommen`
- `akzeptiert`
- `approved`
- `beschlossen`

Statuslose ADRs und ADRs mit Status wie `deprecated`, `superseded`, `rejected`, `draft` oder `proposed` werden nicht extrahiert. Ausgeschlossene ADRs werden im Sandbox-Log protokolliert.

Unterstuetzt wird ein Statusabschnitt wie:

```markdown
## Status

accepted (2026-02-11)
```

Ebenso wird Frontmatter erkannt:

```markdown
---
status: accepted
---
```

Der Statusfilter verhindert, dass veraltete oder ersetzte Entscheidungen weiterhin Befunde erzeugen.

## Regelextraktion aus ADRs

Ein ADR ist meist kein einzelnes Pruefkriterium. Es enthaelt Kontext, Entscheidung, Begruendung, verworfene Alternativen und Konsequenzen. Deshalb extrahiert die Sandbox aus jedem relevanten ADR atomare Regeln.

Die Extraktion erfolgt mit einem LLM-Aufruf pro ADR. Das Modell bekommt:

- den ADR-Titel
- die ADR-Datei
- den bereinigten ADR-Inhalt
- die Liste der im Merge Request geaenderten Dateien

Der Prompt weist das Modell an, nur Festlegungen zu extrahieren, die tatsaechlich vom ADR getroffen werden und fuer den konkreten Merge Request plausibel relevant sind. Begruendungen, Alternativen, Pros und Cons, Links, Migrationsplaene oder nicht pruefbare Absichtserklaerungen werden nicht zu Regeln.

Die Extraktion ist damit MR-bezogen. Der Prototyp erzeugt nicht mehr grundsaetzlich die vollstaendige Regelbasis eines ADRs, sondern nur Regeln, deren Gegenstand anhand der geaenderten Dateien relevant erscheint.

Die ADR-Extraktion laeuft mit begrenzter Parallelitaet. Die Anzahl gleichzeitiger Extraktionen wird ueber `EXTRACTION_CONCURRENCY` gesteuert.

## Triage der Regeln

Nach der Extraktion folgt eine zusaetzliche Triage. Sie sieht nur die extrahierten Regeln und die geaenderten Dateipfade. Ziel ist, Regeln auszuschliessen, deren Gegenstand fuer den konkreten Aenderungssatz nicht plausibel relevant ist.

Die Triage reduziert die Zahl der teuren Regelpruefungen. Ausgeschlossene Regeln werden im Ergebnis als `droppedRules` gespeichert. Sie erzeugen keine Befunde und keine GitLab-Kommentare.

Die Triage ist bewusst vorsichtig: Im Zweifel soll eine Regel eher geprueft als faelschlich verworfen werden. Ein faelschlich verworfener Fall kann einen Verstoss uebersehen, waehrend eine faelschlich gepruefte Regel vor allem Laufzeit kostet.

## Pruefung einzelner Regeln

Jede verbleibende Regel wird isoliert geprueft. Die Pruefung besteht aus zwei Rollen:

1. Locator
2. Reader

Der Locator sucht Belegstellen im Repository. Er darf Werkzeuge wie `list_files` und `grep` verwenden, urteilt aber nicht. Er liefert Kandidatenstellen mit Pfad und Zeilenbereich sowie eine Zusammenfassung der Suche.

Der Reader oeffnet die vom Locator gemeldeten Stellen mit `read_file` und faellt das Urteil. Er entscheidet zwischen drei Ergebnissen:

- `C`: Die Regel wird eingehalten.
- `NC`: Die Regel wird verletzt.
- `CIA`: Die Evidenz reicht nicht fuer ein sicheres Urteil.

Nur `NC` wird spaeter als Befund in GitLab gemeldet. `C` und `CIA` werden gespeichert und sind auf der Review-Detailseite sichtbar, erzeugen aber keine Merge-Request-Kommentare.

## Werkzeugbudget

Die Werkzeuge des Agenten sind budgetiert. Pro Regel gibt es Grenzen fuer:

- Suchrunden des Locators (`BUDGET_SEARCH_ROUNDS`)
- Datei-Oeffnungen des Readers (`BUDGET_FILE_READS`)
- gezielte Nachsuchen (`BUDGET_REFETCHES`)

Wenn das Budget ausgeschoepft ist, wird der Lauf nicht abgebrochen. Stattdessen muss das Modell mit der vorhandenen Evidenz abschliessen. Ein budgeterschoepfter Befund wird als unsicher markiert. Das verhindert endlose Suchschleifen und macht den Aufwand pro Regel begrenzt.

## Begrenzte Parallelitaet

Regelpruefungen sind voneinander unabhaengig. Deshalb prueft die Sandbox mehrere Regeln parallel. Die Anzahl gleichzeitiger Regelpruefungen wird ueber `JUDGING_CONCURRENCY` gesteuert.

Diese Parallelisierung reduziert die Wandzeit deutlich, weil viele LLM-Aufrufe vor allem auf Gateway-Antworten warten. Gleichzeitig bleibt die Parallelitaet begrenzt, damit das Modellgateway nicht durch zu viele gleichzeitige Requests ueberlastet wird.

## Protokollierung

Die Sandbox schreibt ihr Protokoll als JSON-Lines auf stdout. Das Backend sammelt dieses Containerprotokoll und speichert es nach Ende des Laufs im Review-Datensatz als `sandboxLog`.

Protokolliert werden unter anderem:

- Start und Ende des Laufs
- Checkout-Ergebnis
- ausgewaehlte Regelbasis
- wegen Status ausgeschlossene ADRs
- Modellaufrufe
- Werkzeugaufrufe
- extrahierte Regeln
- Triage-Ergebnis
- Beginn und Ende jeder Regelpruefung
- Budgetausschoepfungen
- Zusammenfassung des Laufs

Das Protokoll ist wichtig, weil die Ergebnisse eines LLM-Agenten ohne Zwischenschritte schwer nachvollziehbar waeren. Mit dem Log kann spaeter rekonstruiert werden, welche Suchbegriffe verwendet wurden, welche Dateien gelesen wurden und warum ein Urteil zustande kam.

## Token- und Laufzeitmetriken

Der Prototyp misst fuer jeden Lauf Laufzeit- und Verbrauchsdaten. Voraussetzung ist, dass das verwendete LLM-Gateway in der Antwort `usage.prompt_tokens` und `usage.completion_tokens` liefert.

Gespeichert werden unter anderem:

- Laufzeit des gesamten Sandbox-Laufs
- Anzahl Modellaufrufe
- Anzahl Werkzeugaufrufe
- Prompt-Tokens gesamt
- Completion-Tokens gesamt
- Tokens gesamt
- durchschnittliche Tokens pro gepruefter Regel
- durchschnittliche Tokens pro ADR
- Tokenverbrauch pro ADR-Extraktion
- Tokenverbrauch pro geprüfter Regel

Diese Metriken dienen dazu, Modelle vergleichbar zu machen. Fuer einen Modellvergleich koennen mehrere Laeufe mit demselben MR und verschiedenen Modellen durchgefuehrt werden. Verglichen werden dann nicht nur Laufzeit, sondern auch Tokenverbrauch, Zahl der Befunde, Anteil unentscheidbarer Regeln und Budgetausschoepfungen.

## Rueckmeldung per Callback

Wenn die Sandbox alle Regeln geprueft hat, buendelt sie das Ergebnis in einem JSON-Objekt und sendet es an das Backend:

```text
POST /api/reviews/<review-id>/callback
```

Der Callback enthaelt das geheime `CALLBACK_TOKEN` als Bearer-Token. Das Backend akzeptiert Ergebnisse nur, wenn dieses Token zum Review passt. Dadurch kann nicht beliebig ein fremdes Ergebnis an einen Review geschrieben werden.

Das Callback-Ergebnis enthaelt:

- Review-ID
- Herkunft der Regelbasis
- verwendete ADR-Dateien
- geaenderte Dateien
- extrahierte Regeln
- von der Triage ausgeschlossene Regeln
- Befunde pro gepruefter Regel
- Fehler oder nicht formatgerechte Modellantworten
- Token- und Laufzeitstatistiken

Nach erfolgreichem Callback speichert das Backend das Ergebnis im Review-Datensatz.

## Veroeffentlichung in GitLab

Nach dem Speichern des Ergebnisses veroeffentlicht das Backend nur meldepflichtige Befunde in GitLab. Meldepflichtig sind ausschliesslich `NC`-Befunde, also echte Regelverletzungen.

Die Befunde werden nach ADR gruppiert. Mehrere verletzte Regeln aus demselben ADR werden dadurch in einem zusammenhaengenden Kommentar zusammengefasst. Der Kommentar enthaelt:

- Hinweis auf die betroffene Architekturentscheidung
- Herkunft des ADRs
- verletzte Regel
- Begruendung
- Belegstellen mit Datei und Zeilenbereich
- Hinweis, falls das Werkzeugbudget ausgeschoepft war

Feedback-Links und Verweise auf den internen Pruefverlauf werden in GitLab nicht mehr ausgegeben. Der Merge Request soll nur die unmittelbar relevanten Architekturverletzungen enthalten.

Wenn moeglich, legt das Backend eine Inline-Diskussion an einer betroffenen geaenderten Zeile an. Dafuer nutzt es die `diff_refs` des Merge Requests und die GitLab Discussions API. Falls die Belegstelle keiner kommentierbaren Diff-Zeile zugeordnet werden kann, faellt das System auf einen normalen Merge-Request-Kommentar zurueck.

Wenn keine `NC`-Befunde vorliegen, erzeugt das Backend eine kurze Abschlussmeldung, dass keine Architekturverstoesse gefunden wurden. Auch diese Meldung enthaelt keine Feedback- oder Verlaufslinks.

Nach erfolgreicher Veroeffentlichung entfernt das Backend den anfaenglichen Platzhalter-Kommentar.

## Fehler- und Timeout-Verhalten

Der Webhook selbst wartet nicht auf den Sandbox-Lauf. Wenn die Vorbereitung fehlschlaegt, wird der Review als `failed` markiert. Wenn die Sandbox endet, ohne einen Callback zu senden, oder das Zeitlimit ueberschritten wird, wird der Review ebenfalls als `failed` markiert.

Das globale Sandbox-Zeitlimit wird ueber `SANDBOX_TIMEOUT_SECONDS` gesteuert. Standard ist 1800 Sekunden. Bei Timeout killt das Backend den Container. Da der Container mit `--rm` gestartet wurde, wird er danach automatisch entfernt.

Modellfehler innerhalb einzelner Regeln fuehren nicht automatisch zu einem gemeldeten Verstoss. Stattdessen wird die betroffene Regel als `CIA` gefuehrt und der Fehler in `failures` protokolliert. Dadurch erzeugen nicht formatgerechte Modellantworten oder Transportfehler keine falschen Architekturverletzungen.

## Sicherheits- und Isolationsaspekte

Der Prototyp trennt Backend und Pruefumgebung bewusst. Die Sandbox ist der einzige Ort, an dem das Repository geklont und mit Werkzeugen durchsucht wird. Nach dem Lauf verschwindet dieser Dateibaum wieder.

Wichtige Schutzmechanismen sind:

- ein eigener Container pro Review
- temporaeres Arbeitsverzeichnis
- keine persistenten Repository-Daten im Backend
- read-only Container-Dateisystem
- keine zusaetzlichen Linux-Capabilities
- kein Privilege Escalation
- Token und Secrets nur ueber Umgebungsvariablen
- Callback mit geheimem Token
- begrenzte Werkzeugbudgets
- begrenzte Laufzeit

Diese Massnahmen dienen nicht als vollstaendige Sicherheitsarchitektur fuer ein Produktivsystem, zeigen aber, wie ein LLM-gestuetzter Review-Agent kontrolliert und nachvollziehbar in einen Merge-Request-Prozess eingebettet werden kann.

## Aktueller technischer Stand

Der aktuelle Prototyp enthaelt folgende Optimierungen gegenueber einem rein sequenziellen Ablauf:

- Webhook startet nur bei neu geoeffneten Merge Requests.
- ADRs werden nur bei akzeptiertem Status beruecksichtigt.
- Regelextraktion ist auf den konkreten MR zugeschnitten.
- ADR-Extraktionen laufen begrenzt parallel.
- Regelpruefungen laufen begrenzt parallel.
- GitLab-Kommentare enthalten keine Feedback- oder Verlaufslinks.
- Tokenverbrauch wird pro Lauf, pro Regel und pro ADR-Extraktion gemessen.
- Nur `NC`-Befunde werden in GitLab kommentiert.

Damit bildet der Prototyp einen vollstaendigen Ende-zu-Ende-Ablauf ab: vom GitLab-Webhook ueber eine isolierte LLM-gestuetzte Pruefung bis zur Rueckmeldung konkreter Architekturverletzungen im Merge Request.

## Beispielhafte Messung zweier Modelle

Zur Einordnung des aktuellen Prototyps wurden je Modell drei Laeufe auf derselben Merge-Request-Konstellation durchgefuehrt. Die Laeufe erfolgten mit identischer Systemkonfiguration, insbesondere gleichen Werkzeugbudgets und gleicher Parallelitaet. Verglichen wurden `gpt-5.4-mini` und `gpt-5.6-luna`.

Die folgenden Werte sind Mittelwerte aus jeweils drei abgeschlossenen Reviews.

| Metrik | gpt-5.4-mini | gpt-5.6-luna |
| --- | ---: | ---: |
| Laufzeit | 4 min 6 s | 8 min 18 s |
| Modellaufrufe | 348,7 | 353,0 |
| Werkzeugaufrufe | 691,0 | 821,3 |
| Prompt-Tokens | 583.084 | 714.300 |
| Completion-Tokens | 68.339 | 106.072 |
| Tokens gesamt | 651.423 | 820.372 |
| Tokens pro gepruefter Regel | 12.448 | 14.561 |
| Tokens pro ADR | 59.220 | 74.579 |
| Extrahierte Regeln | 56,0 | 57,7 |
| Gepruefte Regeln | 52,3 | 56,3 |
| Von der Triage ausgeschlossen | 3,7 | 1,3 |
| Urteil `C` | 18,3 | 24,3 |
| Urteil `NC` | 10,0 | 21,3 |
| Urteil `CIA` | 24,0 | 10,7 |
| Budget ausgeschoepft | 49,0 | 56,0 |

Die Einzellaeufe fuer `gpt-5.4-mini` waren:

| Review | Laufzeit | Tokens gesamt | Gepruefte Regeln | NC | CIA | C |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `4f01da09...` | 3 min 58 s | 627.884 | 51 | 9 | 24 | 18 |
| `da830047...` | 3 min 56 s | 642.977 | 51 | 11 | 21 | 19 |
| `995c24e6...` | 4 min 25 s | 683.408 | 55 | 10 | 27 | 18 |

Die Einzellaeufe fuer `gpt-5.6-luna` waren:

| Review | Laufzeit | Tokens gesamt | Gepruefte Regeln | NC | CIA | C |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `3568aa68...` | 8 min 19 s | 843.448 | 58 | 24 | 10 | 24 |
| `acb6f581...` | 8 min 21 s | 784.666 | 55 | 20 | 13 | 22 |
| `09a1934c...` | 8 min 13 s | 833.002 | 56 | 20 | 9 | 27 |

In dieser Messung war `gpt-5.4-mini` deutlich effizienter. Die mittlere Laufzeit lag bei etwa der Haelfte der Laufzeit von `gpt-5.6-luna`. Auch der Tokenverbrauch war geringer. `gpt-5.6-luna` verwendete im Mittel mehr Werkzeuge, pruefte etwas mehr Regeln und erzeugte deutlich mehr `NC`-Urteile sowie weniger `CIA`-Urteile.

Diese Zahlen erlauben noch keine Aussage darueber, welches Modell fachlich bessere Befunde liefert. Ein hoeherer Anteil an `NC` kann auf eine hoehere Trefferquote hinweisen, aber ebenso auf mehr Fehlalarme. Eine Qualitaetsbewertung erfordert daher eine manuelle Beurteilung der gemeldeten `NC`-Befunde gegen eine Referenz oder Ground Truth. Fuer die technische Bewertung zeigt die Messung jedoch, dass die Modellwahl einen erheblichen Einfluss auf Laufzeit, Tokenverbrauch, Werkzeugnutzung und Entscheidungsverhalten hat.
