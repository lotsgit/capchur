import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AppNavigation } from "@/app/app-navigation";
import { getAuth, getWorkspaceAuthenticator } from "@/server/runtime";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const requestHeaders = await headers();
  const session = await (await getAuth()).api.getSession({ headers: requestHeaders });
  if (!session) redirect("/sign-in?callback=/settings");
  const principal = await (await getWorkspaceAuthenticator()).authenticate(new Request("http://capchur.local", { headers: requestHeaders }));
  if (!principal) redirect("/sign-in?error=workspace");
  return <main className="dashboard-shell"><AppNavigation active="settings" /><section className="info-workspace"><header className="info-header"><p className="eyebrow">Workspace</p><h1>Settings</h1><p>Manage your identity and account security.</p></header><div className="info-content"><SettingsForm email={session.user.email} name={session.user.name} role={principal.role} /></div></section></main>;
}