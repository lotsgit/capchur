import Link from "next/link";

import { SignInForm } from "./sign-in-form";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callback?: string }>;
}) {
  const requestedCallback = (await searchParams).callback;
  const callbackPath = requestedCallback?.startsWith("/") && !requestedCallback.startsWith("//")
    ? requestedCallback
    : "/";
  return (
    <main className="auth-page">
      <section className="auth-intro" aria-labelledby="auth-heading">
        <Link className="auth-brand" href="/" aria-label="Capchur home">C</Link>
        <p className="eyebrow">Capchur workspace</p>
        <h1 id="auth-heading">Turn a captured workflow into a guide worth sharing.</h1>
        <p>Your recordings, images, and drafts stay inside the workspace where they belong.</p>
      </section>
      <SignInForm callbackPath={callbackPath} />
    </main>
  );
}