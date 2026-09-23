import Link from "next/link";

const TABS = [
  { href: "/settings/connections", label: "Connections" },
  { href: "/settings/limits", label: "Limits" },
  { href: "/settings/members", label: "Members" },
];

// Settings: everything that configures the agent rather than uses it, off the Home page (roadmap item 2).
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-4 px-4 py-6">
      <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
      <nav aria-label="Settings" className="flex gap-1 border-b">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
            {t.label}
          </Link>
        ))}
      </nav>
      {children}
    </main>
  );
}
