import { ConnectExtension } from "./connect-extension";

function validExtensionRedirect(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (
      url.hostname.endsWith(".chromiumapp.org") ||
      url.hostname.endsWith(".extensions.allizom.org")
    );
  } catch {
    return false;
  }
}

export default async function ExtensionConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_uri?: string }>;
}) {
  const redirectUri = (await searchParams).redirect_uri ?? "";
  if (!validExtensionRedirect(redirectUri)) {
    return <main className="state-page"><h1>Invalid connection request</h1><p>Return to the extension and try connecting again.</p></main>;
  }
  return <ConnectExtension redirectUri={redirectUri} />;
}