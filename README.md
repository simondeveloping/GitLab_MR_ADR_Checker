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
   ADR-Dateien werden dabei nicht als Prüfgegenstand behandelt und aus dem
   Merge-Request-Diff für die Code-Prüfung ausgeschlossen. Enthält ein MR nur
   ADR-Änderungen, wird kein Code-Review gestartet.
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

## Einrichtung und Start

### 1. Voraussetzungen installieren

Im Projektverzeichnis die Abhängigkeiten installieren und eine lokale
Konfigurationsdatei anlegen:

```bash
npm ci
cp .env.example .env.local
```

`.env.local` enthält Zugangsdaten und wird nicht in Git eingecheckt. Trage dort
mindestens folgende Werte ein:

| Variable | Bedeutung |
| --- | --- |
| `GITLAB_HOST` / `GITLAB_TOKEN` | GitLab-URL und Zugriffstoken für eine Instanz; alternativ `GITLAB_CONNECTIONS` verwenden |
| `GITLAB_CONNECTIONS` | Optional: JSON-Liste mehrerer GitLab-Verbindungen, jeweils mit `host`, `token` und optional `projects`; wenn gesetzt, ersetzt sie `GITLAB_HOST` / `GITLAB_TOKEN` |
| `GITLAB_WEBHOOK_SECRET` | Langes, zufälliges Geheimnis zur Prüfung eingehender GitLab-Webhooks |
| `LLM_BASE_URL` | Basis-URL des OpenAI-kompatiblen Modell-Gateways, inklusive `/v1` falls erforderlich |
| `LLM_API_KEY` | API-Schlüssel für das Modell-Gateway |
| `LLM_MODEL` | Modellname, den das Gateway erwartet |
| `PUBLIC_BASE_URL` | Im Browser und von GitLab erreichbare Backend-URL für Webhook und Links in Kommentaren |
| `CALLBACK_BASE_URL` | Vom Sandbox-Container erreichbare Backend-URL für Ergebnis-Callbacks |

Ein Webhook-Secret lässt sich beispielsweise so erzeugen:

```bash
openssl rand -hex 32
```

Für lokale Tests muss GitLab den Entwicklungsrechner erreichen können. Dazu
kann ein HTTPS-Tunnel verwendet werden. Trage dessen öffentliche URL als
`PUBLIC_BASE_URL` ein, zum Beispiel `https://beispiel-tunnel.example`; die
Webhook-URL lautet dann `https://beispiel-tunnel.example/api/gitlab/webhook`.
Der Standardwert von `CALLBACK_BASE_URL` (`http://host.containers.internal:3000`)
passt bei üblichen Podman-Setups. Bei abweichendem Host, Port oder Container-
Netzwerk muss die URL angepasst werden. Backend und Container müssen GitLab und
das LLM-Gateway erreichen können; der Container muss außerdem die
`CALLBACK_BASE_URL` erreichen.

### 2. GitLab-Zugang konfigurieren

Für eine einzelne GitLab-Instanz genügt ein Token, das auf alle zu prüfenden
Projekte zugreifen darf und Merge-Request-Diskussionen erstellen und löschen
kann. Für mehrere Instanzen oder unterschiedliche Token pro Projekt kann
`GITLAB_CONNECTIONS` verwendet werden. Beispiel für `.env.local` (als
einzeiliger JSON-Wert):

```env
GITLAB_CONNECTIONS=[{"host":"https://gitlab.example.com","token":"<TOKEN_A>","projects":["group/project-a","group/project-b"]},{"host":"https://gitlab.other.net","token":"<TOKEN_B>"}]
```

`host` ist die GitLab-Basis-URL. `projects` kann Projektpfade relativ zu diesem
Host (zum Beispiel `gruppe/projekt`) oder vollständige HTTP(S)-Repository-URLs
enthalten. Ohne `projects` gilt der Token für alle Repositories auf dem
angegebenen Host. Für verschiedene Tokens auf derselben Instanz müssen die
Projekte explizit zugeordnet werden. Jedes Projekt muss genau einer Verbindung
zugeordnet sein. Beim Setzen von `GITLAB_CONNECTIONS` werden die Einzelvariablen
`GITLAB_HOST` und `GITLAB_TOKEN` nicht als zusätzlicher Fallback verwendet.

### 3. Sandbox bauen und Anwendung starten

Das Sandbox-Image muss nach der Konfiguration einmal gebaut werden:

```bash
npm run sandbox:build
npm run dev
```

Der Entwicklungsserver stellt die Oberfläche standardmäßig unter
<http://localhost:3000> bereit. Lasse den Prozess während der Nutzung laufen.
Wenn du Werte in `.env.local` änderst, starte den Server neu.

Für einen Produktionsstart:

```bash
npm run sandbox:build
npm run build
npm start
```

Setze in der Produktionsumgebung dieselben erforderlichen Variablen wie in
`.env.local`. `PUBLIC_BASE_URL` muss die von GitLab erreichbare Produktions-URL
sein. Stelle außerdem sicher, dass Podman verfügbar ist und das gebaute
Sandbox-Image auf dem Host vorhanden ist.

## GitLab-Webhook einrichten

Damit GitLab das lokale Backend erreichen kann, muss es unter einer von GitLab
erreichbaren URL laufen. Für lokale Entwicklung kann dafür ein geeigneter
Tunnel oder eine Entwicklungsumgebung verwendet werden. Trage diese URL als
`PUBLIC_BASE_URL` ein. Die URL in `CALLBACK_BASE_URL` muss dagegen aus dem
Sandbox-Container erreichbar sein.

Lege für **jedes GitLab-Projekt**, dessen Merge Requests geprüft werden sollen,
unter **Settings → Webhooks** einen Webhook an:

- **URL:** `<PUBLIC_BASE_URL>/api/gitlab/webhook`
- **Secret token:** derselbe Wert wie `GITLAB_WEBHOOK_SECRET`
- **Trigger:** *Merge request events*
- Bei einer HTTPS-URL sollte *Enable SSL verification* aktiviert bleiben.

GitLab muss den Webhook erfolgreich zustellen können. Prüfe nach dem Speichern
unter **Settings → Webhooks** mit **Test → Merge request events** die Verbindung
und die letzte Zustellung. Der Agent startet eine Prüfung für neu geöffnete,
nicht als Entwurf markierte Merge Requests. Änderungen an bereits geöffneten
Merge Requests und andere Aktionen starten keinen neuen Lauf.

## Anwendung bedienen

1. Öffne in GitLab einen neuen Merge Request in einem Projekt, für das Token und
   Webhook eingerichtet sind. Ein MR, der nur ADR-Dateien ändert, wird nicht als
   Code-Review geprüft.
2. Öffne die Weboberfläche und gehe zu **Merge Requests**. Der neue Lauf sollte
   mit dem Status **Warteschlange** oder **In Bearbeitung** erscheinen. Öffne
   den Merge-Request-Eintrag, um die Fortschrittsanzeige zu sehen.
3. Nach Abschluss zeigt die Detailseite die verwendete Regelbasis, Laufzeit und
   geprüften Regeln. `NC` bedeutet, dass eine Regel verletzt wurde, `C`, dass sie
   eingehalten wurde, und `CIA`, dass sie anhand der verfügbaren Belege nicht
   entscheidbar war. Klappe die Ergebnisgruppen auf, um Begründung, Belegstellen
   und Diff-Ausschnitte zu lesen.
4. Nur `NC`-Befunde werden als Diskussionen in GitLab veröffentlicht. Wenn ein
   Befund einer geänderten Zeile zugeordnet werden kann, erscheint er inline;
   andernfalls als allgemeine MR-Diskussion. Der Sammelkommentar verlinkt zurück
   auf den vollständigen Bericht in der Anwendung.
5. Bewerte einen Befund auf der Detailseite als hilfreich oder nicht hilfreich.
   Die aggregierten Rückmeldungen findest du im Menü unter **Feedback**.

Die Navigation bietet außerdem **Gruppen-ADRs** zum Nachlesen der aktiven
Gruppenstandards sowie **Monitor → Dashboard** mit Review- und Token-Statistiken
und **Monitor → Error Tracking** für fehlgeschlagene Läufe und Agentenwarnungen.
Die Seite **Monitor → Logs** ist derzeit ein Platzhalter. Die Einstellungen
ändern aktuell nur das Farbschema der Oberfläche; GitLab-Tokens und andere
Serverkonfiguration werden in `.env.local` verwaltet.

## Fehlerbehebung

- **Es erscheint kein Review:** Prüfe, ob die letzte GitLab-Webhook-Zustellung
  erfolgreich war, ob `GITLAB_WEBHOOK_SECRET` exakt mit dem Webhook-Secret
  übereinstimmt und ob es sich um einen neu geöffneten, nicht als Entwurf
  markierten MR handelt.
- **GitLab meldet `401` oder `403`:** Prüfe Token, Projektzugriff und die
  erforderlichen API- und MR-Diskussionsrechte. Bei `GITLAB_CONNECTIONS` müssen
  Host und `projects` zur Repository-URL des Webhooks passen.
- **Review schlägt beim Sandbox-Start fehl:** Baue das Image erneut mit
  `npm run sandbox:build` und prüfe, ob Podman installiert und ausführbar ist.
- **Der Lauf bleibt hängen oder der Callback schlägt fehl:** Prüfe, ob der
  Container die `CALLBACK_BASE_URL` erreichen kann und ob Backend, LLM-Gateway
  und GitLab aus dem Container erreichbar sind. Die Fehlerdetails stehen bei
  dem Review sowie unter **Monitor → Error Tracking**.
- **Fehler nach Konfigurationsänderungen:** Kontrolliere das JSON in
  `GITLAB_CONNECTIONS`, die URLs und Variablennamen in `.env.local` und starte
  den Next.js-Server neu.

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
