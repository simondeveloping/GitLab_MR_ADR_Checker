"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ChartNoAxesCombined, FileWarning, GitMerge, MessageSquareHeart, ScrollText, Settings } from "lucide-react";
import {
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const items = [
  { href: "/", label: "Merge Requests", icon: GitMerge },
  { href: "/group-adrs", label: "Gruppen-ADRs", icon: BookOpen },
  { href: "/feedback", label: "Feedback", icon: MessageSquareHeart },
];

const monitorItems = [
  { href: "/monitor/dashboard", label: "Dashboard", icon: ChartNoAxesCombined },
  { href: "/monitor/logs", label: "Logs", icon: ScrollText },
  { href: "/monitor/error-tracking", label: "Error Tracking", icon: FileWarning },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <SidebarContent>
      <nav className="sidebar-nav" aria-label="Projektbereiche">
        <SidebarGroup>
          <details className="sidebar-collapsible-group" open>
            <summary className="ui-sidebar-group-label sidebar-collapsible-label">Workspace</summary>
            <SidebarMenu>
              {items.map(({ href, label, icon: Icon }) => {
                const active = href === "/" ? pathname === "/" || pathname.startsWith("/reviews/") : pathname.startsWith(href);
                return (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton asChild isActive={active} aria-current={active ? "page" : undefined}>
                      <Link href={href} title={label} aria-label={label}>
                        <Icon size={16} /> <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </details>
        </SidebarGroup>
        <SidebarGroup>
          <details className="sidebar-collapsible-group" open>
            <summary className="ui-sidebar-group-label sidebar-collapsible-label">Monitor</summary>
            <SidebarMenu>
              {monitorItems.map(({ href, label, icon: Icon }) => {
                const active = pathname.startsWith(href);
                return (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton asChild isActive={active} aria-current={active ? "page" : undefined}>
                      <Link href={href} title={label} aria-label={label}>
                        <Icon size={16} /> <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </details>
        </SidebarGroup>
        <SidebarGroup className="sidebar-settings-group">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname.startsWith("/settings")} aria-current={pathname.startsWith("/settings") ? "page" : undefined}>
                <Link href="/settings" title="Einstellungen" aria-label="Einstellungen">
                  <Settings size={16} /> <span>Einstellungen</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </nav>
    </SidebarContent>
  );
}
