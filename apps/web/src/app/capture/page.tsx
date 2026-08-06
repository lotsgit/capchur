import Link from "next/link";
import { Check, Download, ExternalLink, Link2, MousePointer2, Upload } from "lucide-react";

import { AppNavigation } from "@/app/app-navigation";

function storeUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export default function CapturePage() {
  const stores = [
    { name: "Chrome and Edge", url: storeUrl(process.env.CHROME_EXTENSION_STORE_URL) },
    { name: "Firefox", url: storeUrl(process.env.FIREFOX_EXTENSION_STORE_URL) },
  ];
  return <main className="dashboard-shell"><AppNavigation active="capture" /><section className="info-workspace"><header className="info-header"><p className="eyebrow">Browser extension</p><h1>Capture a workflow</h1><p>Capchur records supported browser actions and turns them into an editable guide.</p></header><div className="info-content"><section><p className="eyebrow">Install</p><h2>Add Capchur to your browser</h2><div className="store-list">{stores.map((store) => <div key={store.name}><Download size={19} /><span><strong>{store.name}</strong><small>{store.url ? "Official browser listing" : "Store listing awaiting publication"}</small></span>{store.url ? <a className="secondary-command" href={store.url} target="_blank" rel="noreferrer">Install <ExternalLink size={14} /></a> : <span className="store-pending">Release candidate only</span>}</div>)}</div><p className="info-note">For acceptance testing, install the signed release candidate supplied by the release administrator in a clean browser profile.</p></section><section><p className="eyebrow">Workflow</p><h2>From recording to guide</h2><ol className="setup-steps"><li><MousePointer2 /><span><strong>Start recording</strong>Open the extension on a normal HTTP(S) page and grant access only when prompted.</span></li><li><Check /><span><strong>Review locally</strong>Stop recording, choose Review session, and remove or rename any step.</span></li><li><Link2 /><span><strong>Connect &amp; sync once</strong>On first use, authorize Capchur. The extension confirms the connected account and uploads the session.</span></li><li><Upload /><span><strong>Continue automatically</strong>Future stopped sessions and review changes sync automatically. Choose Open guide when you are ready to edit.</span></li></ol></section><section className="limitations"><h2>Capture boundaries</h2><p>Passwords and form values are never collected. Protected browser pages, canvas/WebGL content, and inaccessible cross-origin frames are skipped without ending the recording.</p><Link className="secondary-command" href="/help">Troubleshoot capture</Link></section></div></section></main>;
}