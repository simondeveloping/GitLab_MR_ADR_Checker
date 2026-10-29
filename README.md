# ADR-Review-Agent für GitLab Merge Requests

Dieses Repository enthält den lauffähigen Prototypen aus Kapitel 7 der
Bachelorarbeit. Der Agent prüft neu geöffnete GitLab Merge Requests anhand der
Architecture Decision Records (ADRs) des Projekts und meldet
nachvollziehbare Befunde zurück in den Merge Request.

Das System ist ein Forschungsprototyp und kein allgemeines statisches
Analysetool: Ein OpenAI-kompatibles Sprachmodell extrahiert und bewertet Regeln.
Jedes Urteil wird mit Begründung, Belegstellen und Werkzeugprotokoll gespeichert.

## Was das Projekt macht

Der Review-Ablauf besteht aus drei Komponenten:

1. **GitLab** sendet bei einem neu geöffneten Merge Request ein Webhook-Ereignis.
2. **Next.js-Backend** prüft das Webhook-Secret, lädt Merge-Request-Metadaten,
   legt einen Review-Datensatz an und startet die Sandbox im Hintergrund.
3. **Podman-Sandbox** klont den betroffenen Commit, erstellt den Diff und führt
   die ADR-basierte Analyse in einem kurzlebigen Container aus. Das Ergebnis
   geht per authentifiziertem Callback zurück an das Backend; anschließend wird
   der Container entfernt.

Die Prüfung läuft in diesen Schritten:

1. Als Regelbasis werden ADRs aus `docs/adr/` verwendet. Fehlen dort passende
   ADRs, greift der mitgelieferte Gruppenstandard aus `sandbox/standards/`.
2. Aus den ADRs werden einzelne, prüfbare Regeln extrahiert.
3. Eine Triage wählt Regeln aus, die für die geänderten Dateipfade relevant
   erscheinen.
4. Für jede ausgewählte Regel sucht ein **Locator** nach Evidenz; ein **Reader**
   bewertet die gefundene Stelle. Die Urteile lauten `C` (eingehalten), `NC`
   (nicht konform/verletzt) oder `CIA` (nicht entscheidbar).
5. `NC`-Befunde werden nach ADR gruppiert und, sofern möglich, als Inline-
   Diskussion an geänderten Zeilen veröffentlicht. Andere Befunde sowie
   Werkzeugprotokolle und Laufdetails sind auf der Review-Seite des Backends
   einsehbar. Ein Sammelkommentar im Merge Request verlinkt auf diese Seite.

Der Webhook antwortet mit HTTP `202`, ohne auf den mehrminütigen Prüflauf zu
warten. Dadurch blockiert der Review keine CI/CD-Pipeline. Ausgelöst werden nur
neu geöffnete Merge Requests (`action: open`); Entwürfe und andere Aktionen
werden ignoriert.

## Voraussetzungen

- Node.js **20.9 oder neuer** (empfohlen: Node.js 22) und npm
- Podman für den Sandbox-Container
- Zugriff auf eine GitLab-Instanz und ein GitLab-Token mit Leserechten auf die
  Projekte sowie Rechten zum Erstellen und Löschen von Merge-Request-Notizen und
  Diskussionen
- ein OpenAI-kompatibles LLM-Gateway und ein dort verfügbares Modell
- Netzwerkzugriff des Backends auf GitLab und das LLM-Gateway; Netzwerkzugriff
  des Containers auf GitLab, das LLM-Gateway und die Callback-URL des Backends

## Lokal starten

Im Projektverzeichnis:

```bash
npm ci
cp .env.example .env.local
```

Öffne `.env.local` und trage mindestens folgende Werte ein:

| Variable | Bedeutung |
| --- | --- |
| `GITLAB_HOST` | Basis-URL der GitLab-Instanz, z. B. `https://gitlab.example.com` |
| `GITLAB_TOKEN` | GitLab-Zugriffstoken für Projekte und Merge Requests |
| `GITLAB_WEBHOOK_SECRET` | Geheimnis zur Prüfung eingehender GitLab-Webhooks |
| `LLM_BASE_URL` | Basis-URL des OpenAI-kompatiblen Modell-Gateways, inklusive `/v1` falls erforderlich |
| `LLM_API_KEY` | API-Schlüssel für das Modell-Gateway |
| `LLM_MODEL` | Modellname, den das Gateway erwartet |
| `PUBLIC_BASE_URL` | Im Browser erreichbare Backend-URL für Links in Kommentaren |
| `CALLBACK_BASE_URL` | Vom Container erreichbare Backend-URL für Ergebnis-Callbacks |

Die Standardwerte für `PUBLIC_BASE_URL` und `CALLBACK_BASE_URL` passen für
typische lokale Podman-Setups. Bei einem anderen Host, Port oder Container-
Netzwerk müssen sie angepasst werden. Weitere optionale Laufzeit-, Budget- und
Parallelitätsparameter sind in `.env.example` dokumentiert.

Baue anschließend das Prüf-Image und starte den Entwicklungsserver:

```bash
npm run sandbox:build
npm run dev
```

Die Weboberfläche ist standardmäßig unter <http://localhost:3000> erreichbar.
Ein Produktionsstart ist mit `npm run build` und anschließend `npm start`
möglich.

## GitLab-Webhook einrichten

Damit GitLab das lokale Backend erreichen kann, muss es unter einer von GitLab
erreichbaren URL laufen. Für lokale Entwicklung kann dafür ein geeigneter
Tunnel oder eine Entwicklungsumgebung verwendet werden. Trage diese URL als
`PUBLIC_BASE_URL` ein. Die URL in `CALLBACK_BASE_URL` muss dagegen aus dem
Sandbox-Container erreichbar sein.

Lege im GitLab-Projekt unter **Settings → Webhooks** einen Webhook an:

- **URL:** `<PUBLIC_BASE_URL>/api/gitlab/webhook`
- **Secret token:** derselbe Wert wie `GITLAB_WEBHOOK_SECRET`
- **Trigger:** *Merge request events*

Beim Öffnen eines geeigneten Merge Requests sollte im Backend ein Lauf unter
`/reviews/<review-id>` erscheinen. Die Übersichtsseite listet die Reviews,
die Detailseite zeigt Status, Regelbasis, Urteile, Belegstellen, Werkzeugaufrufe,
Tokenverbrauch und gegebenenfalls den Sandbox-Log.

## Entwicklung und Prüfungen

```bash
npm run lint
npm run typecheck
npm run build
npm --prefix sandbox ci
npm --prefix sandbox run build
```

Das Sandbox-Image wird mit `npm run sandbox:build` gebaut. Es enthält den
separaten TypeScript-Prüfkern aus `sandbox/src/` sowie die Gruppenstandards aus
`sandbox/standards/`.

## Projektstruktur

| Pfad | Zweck |
| --- | --- |
| `src/app/api/gitlab/webhook/` | Webhook-Authentifizierung und Auslösung neuer Reviews |
| `src/lib/orchestrator.ts` | Lebenszyklus eines Reviews im Backend |
| `src/lib/sandbox.ts` | Start und Überwachung des Podman-Containers |
| `src/app/api/reviews/[id]/callback/` | Authentifizierter Rückweg der Prüfergebnisse |
| `src/lib/publish.ts`, `src/lib/comment.ts` | Befunde formatieren und in GitLab veröffentlichen |
| `src/app/` | Übersichts- und Detailseiten sowie Feedback-Formular |
| `sandbox/src/checkout.ts` | Repository auschecken und Änderungssatz vorbereiten |
| `sandbox/src/rulebase.ts` | Projekt-ADRs und Rückfall auf den Gruppenstandard laden |
| `sandbox/src/extract.ts`, `sandbox/src/triage.ts` | Regeln extrahieren und vorfiltern |
| `sandbox/src/judge.ts`, `sandbox/src/tools.ts` | Regeln mit Locator/Reader und Werkzeugen prüfen |
| `sandbox/standards/` | Mitgelieferte organisationsweite Regelbasis |

## Grenzen des Prototyps

- Feedback zu einzelnen Befunden wird gespeichert, aber nicht zum Training oder
  zur Änderung späterer Prüfläufe verwendet.
- Die Triage orientiert sich an Dateipfaden. Eine Regel kann daher übersehen
  werden, wenn ihre Verletzung in einer dem Namen nach unverdächtigen Datei
  liegt.
- Es gibt keine sprachspezifische Analyse oder Schweregrad-Priorisierung.
- Die Bachelorarbeit beschreibt die empirische Evaluation und die gemessenen
  Festlegungen, auf denen Parameter wie Werkzeugbudget, Parallelität und die
  Ausgabe von Kommentaren beruhen.
