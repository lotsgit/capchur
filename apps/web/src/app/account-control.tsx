"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";

export function AccountControl({ name, role }: { name: string; role: "owner" | "member" }) {
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await authClient.signOut();
    window.location.assign("/sign-in");
  }

  return (
    <div className="account-control">
      <span><strong>{name}</strong><small>{role}</small></span>
      <button type="button" title="Sign out" aria-label="Sign out" disabled={pending} onClick={signOut}>
        <LogOut size={16} />
      </button>
    </div>
  );
}