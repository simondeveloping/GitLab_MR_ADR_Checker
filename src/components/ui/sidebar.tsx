import { Slot } from "@radix-ui/react-slot";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Sidebar({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <aside data-slot="sidebar" className={cn("ui-sidebar", className)} {...props} />;
}

export function SidebarHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="sidebar-header" className={cn("ui-sidebar-header", className)} {...props} />;
}

export function SidebarContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="sidebar-content" className={cn("ui-sidebar-content", className)} {...props} />;
}

export function SidebarGroup({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="sidebar-group" className={cn("ui-sidebar-group", className)} {...props} />;
}

export function SidebarGroupLabel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="sidebar-group-label" className={cn("ui-sidebar-group-label", className)} {...props} />;
}

export function SidebarMenu({ className, ...props }: HTMLAttributes<HTMLUListElement>) {
  return <ul data-slot="sidebar-menu" className={cn("ui-sidebar-menu", className)} {...props} />;
}

export function SidebarMenuItem({ className, ...props }: HTMLAttributes<HTMLLIElement>) {
  return <li data-slot="sidebar-menu-item" className={cn("ui-sidebar-menu-item", className)} {...props} />;
}

type SidebarMenuButtonProps = HTMLAttributes<HTMLAnchorElement> & { asChild?: boolean; isActive?: boolean };

export function SidebarMenuButton({ asChild = false, isActive = false, className, ...props }: SidebarMenuButtonProps) {
  const Component = asChild ? Slot : "a";
  return <Component data-slot="sidebar-menu-button" data-active={isActive || undefined} className={cn("ui-sidebar-menu-button", className)} {...props} />;
}
