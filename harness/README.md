# Agenten-Harness

Die drei Dateien in `agents/` sind die Agenten, mit denen die Läufe auf
benchmark.securesight.ai entstehen. Sie laufen in **VS Code Copilot Chat**
gegen ein lokales Modell, das über `llama-server` als Custom Endpoint
eingetragen ist.

## Verwenden

1. Die Dateien nach `.github/agents/` im eigenen Projekt legen.
2. VS Code neu laden. Die Agenten stehen dann im Chat zur Auswahl.
3. Das lokale Modell als Endpunkt eintragen — siehe
   <https://code.visualstudio.com/docs/agent-customization/language-models>.

Die Startzeilen der Server, mit denen hier gemessen wurde, stehen auf
benchmark.securesight.ai unter „Modellkarten“, je Lauf einzeln zum Kopieren.

## Die drei Agenten

| Datei | Zweck |
|---|---|
| `benchmark.agent.md` | Der ganze Durchlauf: Messwerte einlesen, Bilderkennung, eigene Detailseite bauen. |
| `seitenbau.agent.md` | Nur die Detailseite — für Läufe, die schon gemessen sind. |
| `bilderkennung.agent.md` | Der Bilderkennungstest mit den Prüfbildern. |

Bilderkennung gehört ausdrücklich dazu: Sie ist der Weg, auf dem ein Modell
seine eigenen Ergebnisse ansieht und bewertet.

## Prompts

Die Aufträge, aus denen die Ergebnisse entstanden sind, liegen unter
`../evidence/prompts/` — unverändert, so wie die Modelle sie bekommen haben.
Jeder gilt für alle Läufe derselben Aufgabe.
