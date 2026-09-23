import { SettingsTabs } from "@/components/settings/settings-tabs";

// Settings: everything that configures the agent rather than uses it, off the Home page.
export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-4 px-4 py-6">
      <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
      <SettingsTabs />
      {children}
    </main>
  );
}
