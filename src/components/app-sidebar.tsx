"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Contact,
  FlaskConical,
  Inbox,
  LayoutDashboard,
  Megaphone,
  Play,
  Search,
  Settings,
  UserPlus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { supabaseClient } from "@/lib/supabase/client";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/runs", label: "Runs", icon: Play },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/contacts", label: "Contacts", icon: Contact },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/enrollments", label: "Enrollments", icon: UserPlus },
  { href: "/enrich", label: "Enrich Profile", icon: Search },
  { href: "/test/exa-websets", label: "Exa Websets Test", icon: FlaskConical },
];

export function AppSidebar() {
  const pathname = usePathname();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    supabaseClient.auth.getUser().then(({ data }) => {
      if (mounted) setIsLoggedIn(Boolean(data.user));
    });

    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      if (mounted) setIsLoggedIn(Boolean(session?.user));
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    await supabaseClient.auth.signOut();
    window.location.assign("/login");
  }

  async function handleInviteUser() {
    const email = window.prompt("Invite user email");
    if (!email) return;

    setInviteMessage(null);
    setIsInviting(true);
    const response = await fetch("/api/auth/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), role: "member" }),
    });
    const payload = await response.json().catch(() => null);
    setIsInviting(false);

    if (!response.ok || !payload?.ok) {
      setInviteMessage(payload?.error ?? "Could not send invite");
      return;
    }

    setInviteMessage(`Invite sent to ${payload.invited ?? email.trim()}`);
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <Image
                  src="/logo.svg"
                  alt="AutoReach"
                  width={24}
                  height={24}
                  className="size-6"
                />
                <span className="text-sm font-semibold">AutoReach</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.label}
                    >
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      {isLoggedIn && (
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={handleInviteUser}
                disabled={isInviting}
              >
                {isInviting ? "Sending..." : "Invite user"}
              </Button>
              {inviteMessage && (
                <p className="px-2 text-xs text-muted-foreground">
                  {inviteMessage}
                </p>
              )}
            </SidebarMenuItem>
            <SidebarMenuItem>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={handleSignOut}
              >
                Sign out
              </Button>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
