import { Settings } from "lucide-react";
import { ThemeSettings } from "@/components/theme-settings";
import { env } from "@/lib/env";

export default function SettingsPage() {
  return (
    <>
      <div className="breadcrumbs"><span>Workspace</span><span className="breadcrumb-slash">/</span><strong>Einstellungen</strong></div>
      <section className="page-heading">
        <div className="page-title-row"><div className="page-title-icon"><Settings size={20} /></div><h1>Einstellungen</h1></div>
      </section>
      <div className="settings-panel">
        <section className="settings-section" aria-labelledby="appearance-heading">
          <h2 id="appearance-heading">Darstellung</h2>
          <ThemeSettings />
        </section>
        <section className="settings-section" aria-labelledby="reviewer-heading">
          <h2 id="reviewer-heading">Review-Konfiguration</h2>
          <div className="settings-row settings-row-model">
            <div className="settings-row-copy">
              <span className="settings-row-title">Reviewer-Modell</span>
              <span className="settings-row-description">In der Server-Konfiguration festgelegt</span>
            </div>
            <code className="settings-model">{env.llmModel}</code>
          </div>
        </section>
      </div>
    </>
  );
}
