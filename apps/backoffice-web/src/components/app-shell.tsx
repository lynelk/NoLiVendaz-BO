import Link from "next/link";
import type { ReactNode } from "react";
import type { OperatorContext } from "../lib/types.js";

const navigation = [
  ["Command Centre", "/"],
  ["Transactions", "/transactions"],
  ["Providers", "/providers"],
  ["Support", "/support"]
] as const;

export function AppShell({
  children,
  operator
}: {
  children: ReactNode;
  operator?: OperatorContext | null;
}) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">NV</div>
          <div><strong>NOLI Vendaz</strong><span>Back Office</span></div>
        </div>
        <nav aria-label="Primary navigation">
          {navigation.map(([label, href]) => (
            <Link key={href} href={href} className="nav-link">{label}</Link>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="eyebrow">Operator</span>
          <strong>{operator?.displayName ?? operator?.email ?? "Session required"}</strong>
          {operator?.isPlatformAdmin ? <span>Platform administrator</span> : <span>Tenant operator</span>}
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
