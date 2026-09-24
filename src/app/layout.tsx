import type { Metadata, Viewport } from "next";
import { Funnel_Display, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Funnel Display carries the personality (titles, commands); the body is the system font (docs/DESIGN-V2.md).
// Geist Mono stays for the Details drawer only, where ids and raw values are read.
const funnel = Funnel_Display({ variable: "--font-funnel", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// The product name lives here rather than in lib/app.ts, which the stack kit ships as "App".
// Every page names itself in the tab ("Automations - Handover"); a page without a title of its own reads "Handover".
export const metadata: Metadata = {
  title: { default: "Handover", template: "%s - Handover" },
  description: "Hand a task to an agent in plain words, watch it work, and keep what went well as a command.",
};

// Renders <meta name="color-scheme" content="light dark">: it tells the browser both themes exist, so form
// controls and scrollbars follow the theme the CSS tokens pick, and the first paint is not a white flash.
export const viewport: Viewport = { colorScheme: "light dark" };

// The shell is only the frame: the header needs to know whether a run is live, so the page renders it.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${funnel.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-mist">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
