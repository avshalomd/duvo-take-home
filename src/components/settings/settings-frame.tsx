import type { ReactNode } from "react";
import { SettingsMotion } from "./settings-motion";
import { SettingsTabs } from "./settings-tabs";

// Settings: everything that configures the agent rather than uses it. A narrow column on the mist, like iOS
// Settings on a large screen: the page title, the segmented control, then the page's groups. The layout draws it
// around each tab, and the app's loading boundary around the tab's skeleton, so the two are the same frame.
export function SettingsFrame({ children }: { children: ReactNode }) {
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
