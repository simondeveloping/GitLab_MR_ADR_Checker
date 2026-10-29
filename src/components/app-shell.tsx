"use client";

import Link from "next/link";
import { CircleHelp, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sidebar, SidebarHeader } from "@/components/ui/sidebar";
import { SidebarNav } from "@/components/sidebar-nav";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="topbar-brand" href="/" aria-label="ADR Review Startseite">
          <span className="brand-mark"><ShieldCheck size={18} /></span>
          <span>ADR Checker</span>
        </Link>
        <div className="topbar-spacer" />
        <Button variant="ghost" size="icon" asChild>
          <Link className="topbar-help" href="https://docs.gitlab.com/ee/user/project/merge_requests/" target="_blank" rel="noreferrer" aria-label="GitLab Merge Requests Hilfe">
            <CircleHelp size={19} />
          </Link>
        </Button>
      </header>

      <div className="app-body">
        <Sidebar className="app-sidebar">
          <SidebarHeader className="app-sidebar-header">
            <Link className="brand" href="/" aria-label="ADR Review Startseite">
              <span className="brand-mark"><ShieldCheck size={19} /></span>
              <span>ADR Checker</span>
            </Link>
          </SidebarHeader>
          <SidebarNav />
        </Sidebar>

        <main className="workspace-main">
          <div className="workspace-content">{children}</div>
        </main>
      </div>
    </div>
  );
}
