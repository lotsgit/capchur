import Link from "next/link";

import { ResetPasswordForm } from "./reset-password-form";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  return <main className="auth-page"><section className="auth-intro"><Link className="auth-brand" href="/" aria-label="Capchur home">C</Link><p className="eyebrow">Capchur workspace</p><h1>Secure the next version of your work.</h1><p>Use a unique password of at least 12 characters.</p></section><ResetPasswordForm token={(await searchParams).token} /></main>;
}