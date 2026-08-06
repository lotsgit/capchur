import Link from "next/link";
import { CircleHelp, FileText, Play, Settings } from "lucide-react";

type NavigationItem = "guides" | "capture" | "help" | "settings";

export function AppNavigation({ active }: { active: NavigationItem }) {
  return (
    <aside className="workspace-rail" aria-label="Workspace navigation">
      <Link className="brand" href="/" aria-label="Capchur home">C</Link>
      <nav className="rail-nav" aria-label="Primary">
        <NavigationLink href="/" label="Guides" active={active === "guides"}><FileText /></NavigationLink>
        <NavigationLink href="/capture" label="Capture" active={active === "capture"}><Play /></NavigationLink>
      </nav>
      <nav className="rail-nav rail-nav--bottom" aria-label="Support">
        <NavigationLink href="/help" label="Help" active={active === "help"}><CircleHelp /></NavigationLink>
        <NavigationLink href="/settings" label="Settings" active={active === "settings"}><Settings /></NavigationLink>
      </nav>
    </aside>
  );
}

function NavigationLink({
  active,
  children,
  href,
  label,
}: {
  active: boolean;
  children: React.ReactNode;
  href: string;
  label: string;
}) {
  return <Link className={active ? "active" : ""} href={href} title={label} aria-label={label}>{children}<span>{label}</span></Link>;
}