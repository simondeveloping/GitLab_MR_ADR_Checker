# Fragen: Regelfilterung vor der Pruefung und Obergrenzen der Gateway-Aufrufe

Stand: 14.08.2026. Alle Angaben aus dem Code des Prototyps, nicht aus der Arbeit.

---

## 1 Wie filtert das LLM die ADR-Regeln vor dem eigentlichen Prozess?

Die Filterung ist **dreistufig** und nur die Stufen 2 und 3 verwenden ein Modell.
Stufe 1 ist reine Programmlogik.

```text
docs/adr/*.md  (oder Gruppenstandard)
      |
      | Stufe 1  rulebase.ts   ohne LLM
      |          - Dateiname passt (.md/.mdx), kein README/index/template/_
      |          - Status muss "accepted/angenommen/akzeptiert/approved/beschlossen" sein
      v
   ADR-Dokumente
      |
      | Stufe 1b extract.ts    ohne LLM (stripDistractorSections)
      |          - Abschnitte "Considered Options", "Alternativen",
      |            "Pros and Cons", "More Information", "Links" werden
      |            aus dem Markdown entfernt, bevor das Modell es sieht
      v
   bereinigtes ADR
      |
      | Stufe 2  extract.ts    LLM-Aufruf Nr. 1, ein Aufruf JE ADR
      |          Zerlegung in atomare Regeln, bereits mit Relevanzfilter
      |          gegen die geaenderten Dateipfade
      v
   Regelliste (flach, ueber alle ADRs)
      |
      | Stufe 3  triage.ts     LLM-Aufruf Nr. 2, EIN Aufruf fuer den ganzen Lauf
      |          Auswahl der Regeln allein anhand der geaenderten Dateipfade
      v
   selected[]  ->  Pruefung je Regel (Locator/Reader)
   dropped[]   ->  wird im Ergebnis mitgefuehrt, aber nicht geprueft
```

Quellen: [rulebase.ts](sandbox/src/rulebase.ts), [extract.ts](sandbox/src/extract.ts),
[triage.ts](sandbox/src/triage.ts), Verkettung in [main.ts:97](sandbox/src/main.ts:97).

---

### 1.1 Stufe 2 — Regelextraktion (`extract.ts`)

**Struktur des Aufrufs**

| | |
|---|---|
| Aufrufe | 1 pro ADR-Dokument, parallel mit `EXTRACTION_CONCURRENCY` (Vorgabe 3) |
| Nachrichten | `system` + `user`, keine Werkzeuge |
| `response_format` | `{"type": "json_object"}` (`jsonOnly: true`) |
| Sichtbar fuer das Modell | geaenderte Dateipfade (max. 200), ADR-Titel, ADR-Dateiname, bereinigtes ADR-Markdown. **Kein Code.** |
| Erwartete Antwort | `{"rules": ["...", "..."]}` |
| Nachbereitung | nur Strings, `trim()`, Regeln kuerzer als 10 Zeichen werden verworfen |
| Fehlerfall | Aufruf oder Format kaputt → Dokument wird uebersprungen und als `failures[{stage:"extract"}]` protokolliert (kein stilles leeres Ergebnis) |

**System-Prompt (wortgetreu, [extract.ts:33](sandbox/src/extract.ts:33))**

```text
Du zerlegst ein Architecture Decision Record (ADR) in einzeln pruefbare Regeln fuer einen konkreten Merge Request.

AUFGABE
Gib ausschliesslich die Festlegungen wieder, die das Dokument tatsaechlich TRIFFT
UND die fuer die geaenderten Dateien dieses Merge Requests plausibel relevant
sind.

EINE REGEL IST:
- ein imperativer Satz mit genau EINER Aussage,
- am Quellcode oder an Konfigurationsdateien ueberpruefbar,
- fuer sich allein verstaendlich, ohne den Rest des Dokuments.

NICHT ZUR REGEL WERDEN:
- verworfene Alternativen und Abwaegungen ("Considered Options", "Alternativen"),
- Begruendungen, Vor- und Nachteile, Konsequenzen,
- Absichtserklaerungen ohne pruefbaren Gehalt ("wir wollen wartbaren Code"),
- Verweise auf Migrationstickets oder zeitliche Plaene,
- Festlegungen, deren Gegenstand mit keiner geaenderten Datei plausibel zu tun
  hat.

RELEVANZ
- Nutze die geaenderten Dateipfade als harte Vorauswahl.
- Waehle eine Regel nur, wenn Dateiname, Verzeichnis, Technologie oder
  Artefakttyp einen Bezug erkennen lassen.
- Im Zweifel darf eine Regel aufgenommen werden, aber erzeuge keine vollstaendige
  Regelbasis fuer das ganze Projekt.

Eine Festlegung, die mehrere Sachverhalte zugleich meint, wird in mehrere
Regeln zerlegt. Formuliere die Regel positiv oder als klares Verbot, aber
niemals als Verneinung einer verworfenen Alternative.

ANTWORTFORMAT
Ausschliesslich JSON, ohne Rahmentext:
{"rules": ["...", "..."]}
Gibt es keine pruefbare Festlegung, antworte {"rules": []}.
```

**User-Nachricht (Schablone, [extract.ts:144](sandbox/src/extract.ts:144))**

```text
Geaenderte Dateien (<Anzahl>):
<Pfad 1>
<Pfad 2>
...            (auf die ersten 200 Pfade begrenzt; sonst "(keine)")

ADR-Titel: <Titel>
ADR-Datei: <Dateiname>

<ADR-Markdown ohne Distraktor-Abschnitte>
```

---

### 1.2 Stufe 3 — Triage (`triage.ts`)

Das ist der eigentliche "Filterschritt vor dem Prozess": ein sehr kurzer
Modellaufruf, der **nur Dateipfade und Regeltexte** sieht, keinen Code.

**Struktur des Aufrufs**

| | |
|---|---|
| Aufrufe | genau 1 pro Prueflauf |
| Nachrichten | `system` + `user`, keine Werkzeuge |
| `response_format` | `{"type": "json_object"}` |
| Sichtbar fuer das Modell | geaenderte Dateipfade (**ungekuerzt**) und die durchnummerierte Regelliste |
| Erwartete Antwort | `{"selected": [0, 2, 5]}` — Indizes in die Regelliste |
| Kurzschluss 1 | `rules.length === 0` → leeres Ergebnis, kein Aufruf |
| Kurzschluss 2 | `changedFiles.length === 0` → **alle** Regeln werden geprueft, kein Aufruf |
| Fehlerfall | Aufruf kaputt oder Antwort nicht formatgerecht → **alle** Regeln werden geprueft, Eintrag in `failures[{stage:"triage"}]` (fail-open) |
| Index-Pruefung | nur ganzzahlige Indizes im Bereich `0 <= i < rules.length` werden uebernommen |
| Nicht gewaehlt | landen in `dropped[]` mit fester Begruendung „Kein Bezug zu einer geaenderten Datei erkennbar." und werden mit im Ergebnis zurueckgemeldet |

**System-Prompt (wortgetreu, [triage.ts:29](sandbox/src/triage.ts:29))**

```text
Du entscheidest, welche Architekturregeln fuer einen konkreten Aenderungssatz ueberhaupt in Frage kommen.

Du siehst NUR die geaenderten Dateipfade und die Regeln. Du siehst keinen Code.

WAEHLE EINE REGEL AUS, wenn die geaenderten Pfade es plausibel machen, dass die
Regel diesen Aenderungssatz betrifft. Im Zweifel WAEHLEN: Eine faelschlich
gepruefte Regel kostet nur Laufzeit, eine faelschlich verworfene laesst einen
Verstoss durchgehen.

VERWIRF EINE REGEL nur, wenn ihr Gegenstand mit keiner der geaenderten Dateien
etwas zu tun haben kann, etwa eine Regel ueber Datenbankmigrationen bei einer
reinen Aenderung an Stylesheets.

ANTWORTFORMAT
Ausschliesslich JSON, ohne Rahmentext:
{"selected": [0, 2, 5]}
Die Zahlen sind die Indizes der ausgewaehlten Regeln.
```

**User-Nachricht (Schablone, [triage.ts:77](sandbox/src/triage.ts:77))**

```text
Geaenderte Dateien (<Anzahl>):
<Pfad 1>
<Pfad 2>
...

Regeln:
0: [<adrFile>] <Regeltext>
1: [<adrFile>] <Regeltext>
...
```

---

### 1.3 Anmerkung zur Filterlogik

Der Relevanzfilter laeuft **zweimal gegen dieselbe Information**: Die Extraktion
bekommt die geaenderten Dateipfade bereits als „harte Vorauswahl" vorgegeben
(Stufe 2), die Triage entscheidet danach noch einmal auf genau derselben
Grundlage (Stufe 3). Beide Prompts geben zudem dieselbe Zweifelsregel aus
(„im Zweifel aufnehmen/waehlen"). Das ist bewusst redundant abgesichert, sollte
in der Arbeit aber als solches benannt werden — der zweite Filter kann nur
Regeln entfernen, die der erste bereits haette weglassen sollen.

Die im Code selbst benannte Schwaeche (Kommentarkopf [triage.ts:15](sandbox/src/triage.ts:15)):
Die Entscheidung faellt allein auf Dateipfaden. Eine Regel kann verlorengehen,
deren Verletzung in einer dem Namen nach unverdaechtigen Datei sitzt. Der Fehler
wirkt in Richtung Uebersehen, nicht in Richtung Fehlalarm.

---

## 2 Obergrenzen bei den API-Aufrufen und Wartezeiten am Gateway

Alle Modellaufrufe laufen ueber genau eine Funktion:
`complete()` in [llm.ts:59](sandbox/src/llm.ts:59), OpenAI-kompatibel gegen
`${LLM_BASE_URL}/chat/completions`.

### 2.1 Wartezeiten und Wiederholungen je einzelnem HTTP-Aufruf

| Groesse | Wert | Fundstelle |
|---|---|---|
| Timeout je HTTP-Anfrage | **180 s** (`AbortSignal.timeout(180_000)`) | [llm.ts:97](sandbox/src/llm.ts:97) |
| Versuche gesamt | **4** (1 Erstversuch + 3 Wiederholungen) | [llm.ts:85](sandbox/src/llm.ts:85) |
| Backoff zwischen den Versuchen | exponentiell **1 s / 2 s / 4 s** (`1000 * 2^(n-1)`) | [llm.ts:86](sandbox/src/llm.ts:86) |
| Wiederholbare HTTP-Codes | **408, 429, 500, 502, 503, 504** | [llm.ts:45](sandbox/src/llm.ts:45) |
| Nicht wiederholt | alle uebrigen 4xx (z. B. 400, 401, 403) → sofortiger `throw` | [llm.ts:107](sandbox/src/llm.ts:107) |
| Ebenfalls wiederholt | Transportfehler (`fetch` wirft) und Antworten ohne `choices[0].message` | [llm.ts:99](sandbox/src/llm.ts:99), [llm.ts:121](sandbox/src/llm.ts:121) |

**Schlechtester Fall fuer einen einzelnen `complete()`-Aufruf:**

```text
4 x 180 s Timeout + (1 + 2 + 4) s Backoff = 727 s  (rund 12 Minuten)
```

Danach `Error("Modellaufruf endgueltig fehlgeschlagen: …")`.

Zwei Punkte, die in der Arbeit erwaehnenswert sind:

- Bei **429** wird ein `Retry-After`-Header des Gateways **nicht** ausgewertet;
  es gilt immer der feste Backoff 1/2/4 s.
- Es gibt **keinen globalen Ratenbegrenzer** (kein Token-Bucket, keine
  Mindestpause zwischen Aufrufen). Die einzige Drosselung ist die Parallelitaet.

### 2.2 Parallelitaet — wie viele Anfragen gleichzeitig am Gateway anliegen

| Phase | Parallelitaet | Vorgabe | Variable |
|---|---|---|---|
| Extraktion (je ADR) | begrenzt | **3** | `EXTRACTION_CONCURRENCY` |
| Triage | 1 | — | — |
| Pruefung (je Regel) | begrenzt | **3** | `JUDGING_CONCURRENCY` |

Die Phasen laufen **nacheinander** ([main.ts:109](sandbox/src/main.ts:109) ff.),
daher liegen **hoechstens 3 Anfragen gleichzeitig** am Gateway an — pro Sandbox.
Laufen mehrere Merge Requests parallel, laeuft je MR ein eigener Container, und
die Grenze gilt entsprechend mehrfach. Ein uebergreifendes Limit ueber alle
Sandboxen hinweg existiert nicht.

### 2.3 Obergrenze der Aufrufzahl je Prueflauf

Werkzeugbudget je Regel ([config.ts:39](sandbox/src/config.ts:39)):

| Budget | Vorgabe | Variable |
|---|---|---|
| Suchrunden Locator (Werkzeugaufrufe) | **8** | `BUDGET_SEARCH_ROUNDS` |
| Datei-Oeffnungen Reader | **5** | `BUDGET_FILE_READS` |
| Nachsuchen je Regel | **2** | `BUDGET_REFETCHES` |

Wichtig fuer die Zaehlung: Das Suchbudget `roundsLeft` wird ueber **alle**
Locator-Laeufe einer Regel hinweg geteilt (Erstsuche plus bis zu 2 Nachsuchen),
es ist also ein Gesamtbudget je Regel, kein Budget je Lauf
([judge.ts:383](sandbox/src/judge.ts:383)). Abgezogen wird **pro Werkzeugaufruf**,
nicht pro Modellaufruf — ein Modellaufruf mit drei `tool_calls` kostet drei
Runden.

Daraus je Regel:

| Anteil | Obergrenze | Begruendung |
|---|---|---|
| Locator, werkzeugziehende Aufrufe | **8** | Gesamtbudget der Suchrunden |
| Locator, Abschlussaufrufe | **3** | je Locator-Lauf einer (Erstsuche + 2 Nachsuchen) |
| Reader, Aufrufe | **formal unbegrenzt**, praktisch ~6 je Lauf, ~18 gesamt | siehe unten |
| **Summe je Regel** | ~**29** (nominal) | keine harte Deckelung im Code |

Gesamt je Prueflauf, nominal:

```text
Aufrufe  =  1 je ADR-Dokument              (Extraktion)
         +  1                              (Triage)
         +  ~29 je gepruefter Regel        (Locator + Reader, Nominalwert)

Beispiel: 11 ADRs, 20 selektierte Regeln
         =  11 + 1 + 20 x ~29  ~=  592 Modellaufrufe
Jeder davon kann sich intern bis zu 4-mal wiederholen (Abschnitt 2.1).
```

**Offener Punkt (fuer die Arbeit relevant):** Die Reader-Schleife in
[judge.ts:285](sandbox/src/judge.ts:285) ist ein `for(;;)` ohne Zaehlergrenze.
Ist `readsLeft` erschoepft, bekommt das Modell zwar eine Werkzeugantwort mit dem
Hinweis, jetzt zu urteilen, die Schleife bricht aber nicht ab. Ein Modell, das
weiter `read_file` aufruft, laeuft formal unbegrenzt weiter. Die einzige
wirksame Schranke ist dann das Zeitlimit der Sandbox (Abschnitt 2.4).
Der Locator hat diese Luecke nicht — dort begrenzt `roundsLeft` die Schleife.

### 2.4 Harte Zeitschranken ausserhalb des Modellzugangs

| Groesse | Wert | Fundstelle |
|---|---|---|
| Laufzeit der gesamten Sandbox | **1800 s = 30 min**, danach `SIGKILL` + `podman kill` | `SANDBOX_TIMEOUT_SECONDS`, [sandbox.ts:100](src/lib/sandbox.ts:100) |
| Callback an das Backend: Timeout | 120 s je Versuch | [main.ts:71](sandbox/src/main.ts:71) |
| Callback: Versuche / Backoff | 3 Versuche, linear 2 s / 4 s | [main.ts:59](sandbox/src/main.ts:59) |

Das Zeitlimit der Sandbox ist damit die **einzige** globale Obergrenze des
gesamten Prueflaufs. Bei ungluecklicher Verteilung (viele Regeln, langsames
Gateway, 12-Minuten-Worst-Case je Aufruf) greift es vor Erreichen der
Werkzeugbudgets, und der Lauf endet ohne Ergebnis
(`Zeitlimit von 1800s ueberschritten.`, [orchestrator.ts:81](src/lib/orchestrator.ts:81)).

### 2.5 Groessenbegrenzungen (wirken auf die Tokenlast, nicht auf die Aufrufzahl)

| Groesse | Wert | Fundstelle |
|---|---|---|
| Werkzeugantwort im Verlauf | auf 12.000 Zeichen gekuerzt | [judge.ts:221](sandbox/src/judge.ts:221), [judge.ts:352](sandbox/src/judge.ts:352) |
| `grep`-Treffer | max. 60, Zeile auf 240 Zeichen | [tools.ts:54](sandbox/src/tools.ts:54) |
| `list_files`-Eintraege | max. 400 | [tools.ts:55](sandbox/src/tools.ts:55) |
| `read_file`-Zeilen je Aufruf | max. 400 | [tools.ts:56](sandbox/src/tools.ts:56) |
| Dateigroesse im Suchraum | max. 512 KiB | [tools.ts:53](sandbox/src/tools.ts:53) |
| Dateipfade im Extraktions-Prompt | erste 200 | [extract.ts:135](sandbox/src/extract.ts:135) |
| Dateipfade im Locator-Prompt | erste 100 | [judge.ts:393](sandbox/src/judge.ts:393) |
| Containerprotokoll | letzte 512.000 Zeichen | [sandbox.ts:94](src/lib/sandbox.ts:94) |

### 2.6 Konfigurierter Zugang

```text
LLM_BASE_URL = http://d-ew-bp03.devlef.campus.rwth-aachen.de:42000/v1   (.env)
LLM_MODEL    = gpt-5.4-mini
```

Ein gatewayseitiges Limit (Requests/Minute, Tokens/Minute) ist im Repository
nirgends dokumentiert und wird vom Code auch nicht abgefragt — die
Client-Annahme ist schlicht, dass 3 gleichzeitige Anfragen tragbar sind und
429er per Backoff abgefangen werden.
