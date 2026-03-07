"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { supabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/runs", label: "Runs" },
  { href: "/leads", label: "Leads" },
  { href: "/contacts", label: "Contacts" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/settings", label: "Settings" },
  { href: "/inbox", label: "Inbox" },
];

export function SidebarNav() {
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
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: email.trim(),
        role: "member",
      }),
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
    <div className="space-y-4">
      <nav className="space-y-2 text-sm">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "block rounded px-2 py-1 hover:bg-muted",
                isActive
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      {isLoggedIn ? (
        <>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleInviteUser}
            disabled={isInviting}
          >
            {isInviting ? "Sending invite..." : "Invite user"}
          </Button>
          {inviteMessage ? (
            <p className="text-xs text-muted-foreground">{inviteMessage}</p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleSignOut}
          >
            Sign out
          </Button>
        </>
      ) : null}
    </div>
  );
}
