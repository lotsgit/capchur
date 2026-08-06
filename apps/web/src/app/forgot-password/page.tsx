import Link from "next/link";

import { ForgotPasswordForm } from "./forgot-password-form";

export default function ForgotPasswordPage() {
  return <main className="auth-page"><section className="auth-intro"><Link className="auth-brand" href="/" aria-label="Capchur home">C</Link><p className="eyebrow">Capchur workspace</p><h1>Return to the work you captured.</h1><p>Password reset links are single-use and expire after 30 minutes.</p></section><ForgotPasswordForm /></main>;
}