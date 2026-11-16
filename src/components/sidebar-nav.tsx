"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ChartNoAxesCombined, ChevronDown, FileWarning, GitMerge, MessageSquareHeart, ScrollText, Settings, type LucideIcon } from "lucide-react";
import {
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const items: NavItem[] = [
  { href: "/", label: "Merge Requests", icon: GitMerge },
  { href: "/group-adrs", label: "Gruppen-ADRs", icon: BookOpen },
  { href: "/feedback", label: "Feedback", icon: MessageSquareHeart },
];

const monitorItems: NavItem[] = [
  { href: "/monitor/dashboard", label: "Dashboard", icon: ChartNoAxesCombined },
  { href: "/monitor/logs", label: "Logs", icon: ScrollText },
  { href: "/monitor/error-tracking", label: "Error Tracking", icon: FileWarning },
];

function NavigationItems({ items, pathname }: { items: NavItem[]; pathname: string }) {
  return (
    <SidebarMenu>
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === "/"
          ? pathname === "/" || pathname.startsWith("/reviews/")
          : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <SidebarMenuItem key={href}>
            <SidebarMenuButton asChild isActive={active} aria-current={active ? "page" : undefined}>
              <Link href={href} title={label} aria-label={label}>
                <Icon size={16} aria-hidden="true" /> <span>{label}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <SidebarContent>
      <nav className="sidebar-nav" aria-label="Projektbereiche">
        {[{ label: "Workspace", items }, { label: "Monitor", items: monitorItems }].map((group) => (
          <SidebarGroup key={group.label}>
            <details className="sidebar-collapsible-group" open>
              <summary className="ui-sidebar-group-label sidebar-collapsible-label">
                {group.label}<ChevronDown className="sidebar-collapsible-chevron" aria-hidden="true" />
              </summary>
              <NavigationItems items={group.items} pathname={pathname} />
            </details>
          </SidebarGroup>
        ))}
        <SidebarGroup className="sidebar-settings-group">
          <NavigationItems items={[{ href: "/settings", label: "Einstellungen", icon: Settings }]} pathname={pathname} />
        </SidebarGroup>
      </nav>
    </SidebarContent>
  );
}
