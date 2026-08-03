import { GuideEditor } from "@/app/guide-editor";
import { getAuth, getWorkspaceAuthenticator } from "@/server/runtime";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function Home() {
  const requestHeaders = await headers();
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) redirect("/sign-in");

  const principal = await (await getWorkspaceAuthenticator()).authenticate(
    new Request("http://capchur.local", { headers: requestHeaders }),
  );
  if (!principal) redirect("/sign-in?error=workspace");

  return <GuideEditor identity={{ name: session.user.name, role: principal.role }} />;
}