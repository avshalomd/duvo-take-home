import type { Metadata } from "next";
import { SettingsFrame } from "@/components/settings/settings-frame";

// "Members - Settings - Handover": each tab says which page it is and where
export const metadata: Metadata = { title: { default: "Settings", template: "%s - Settings - Handover" } };

// The frame is shared with the app's loading boundary, which draws it around a tab's skeleton (SettingsFrame).
export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return <SettingsFrame>{children}</SettingsFrame>;
}
