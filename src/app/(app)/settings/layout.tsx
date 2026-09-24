import type { Metadata } from "next";
import { SettingsMotion } from "@/components/settings/settings-motion";
import { SettingsTabs } from "@/components/settings/settings-tabs";

// "Members - Settings - Handover": each tab says which page it is and where
export const metadata: Metadata = { title: { default: "Settings", template: "%s - Settings - Handover" } };

// Settings: everything that configures the agent rather than uses it. A narrow column on the mist, like iOS
// Settings on a large screen: the page title, the segmented control, then the page's groups.
export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return (
    <SettingsMotion>
      <main className="mx-auto w-full max-w-[680px] flex-1 px-4 pt-8 pb-20 sm:pt-12">
        <h1 className="page-title">Settings</h1>
        <div className="mt-5">
          <SettingsTabs />
        </div>
        <div className="mt-8">{children}</div>
      </main>
    </SettingsMotion>
  );
}
