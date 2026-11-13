import { Bot, Moon, Settings, Sun } from "lucide-react";
import { ThemeSettings } from "@/components/theme-settings";
import { env } from "@/lib/env";

export default function SettingsPage() {
  return (
    <>
      <div className="breadcrumbs"><span>Workspace</span><span className="breadcrumb-slash">/</span><strong>Einstellungen</strong></div>
      <section className="page-heading">
        <div className="page-title-row"><div className="page-title-icon"><Settings size={20} /></div><h1>Einstellungen</h1></div>
      </section>
      <section className="settings-card" aria-labelledby="appearance-heading">
        <div className="settings-card-heading">
          <span className="settings-card-icon"><Sun size={18} /><Moon size={15} /></span>
          <div><h2 id="appearance-heading">Darstellung</h2><p>Wähle das Farbschema für die Anwendung.</p></div>
        </div>
        <ThemeSettings />
      </section>
      <section className="settings-card" aria-labelledby="reviewer-model-heading">
        <div className="settings-card-heading">
          <span className="settings-card-icon"><Bot size={19} /></span>
          <div><h2 id="reviewer-model-heading">Reviewer-Modell</h2><p>Das aktuell für Code-Reviews konfigurierte Sprachmodell.</p></div>
        </div>
        <code className="settings-model">{env.llmModel}</code>
      </section>
    </>
  );
}
