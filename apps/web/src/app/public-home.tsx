import Link from "next/link";
import { ArrowRight, Download, FileText, MousePointer2 } from "lucide-react";

export function PublicHome() {
  return (
    <main className="public-home">
      <header><Link className="brand" href="/" aria-label="Capchur home">C</Link><nav><Link href="/help">Help</Link><Link href="/sign-in">Sign in</Link><Link className="primary-button" href="/sign-in">Create account <ArrowRight size={15} /></Link></nav></header>
      <section className="public-hero"><p className="eyebrow">Browser workflow guides</p><h1>Capchur</h1><p>Record a browser workflow, refine each instruction, and export a guide your team can follow.</p><div><Link className="primary-button" href="/capture"><Download size={16} /> Install the extension</Link><Link className="secondary-command" href="/sign-in">Open workspace <ArrowRight size={15} /></Link></div></section>
      <section className="public-flow" aria-label="How Capchur works"><article><MousePointer2 /><strong>Capture</strong><span>Record meaningful actions without collecting passwords or field values.</span></article><article><FileText /><strong>Edit</strong><span>Reorder steps, refine descriptions, crop images, and add irreversible export redactions.</span></article><article><Download /><strong>Deliver</strong><span>Export polished PDF and Word guides from your private workspace.</span></article></section>
    </main>
  );
}