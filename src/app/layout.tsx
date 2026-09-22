import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// The product name lives here rather than in lib/app.ts, which the stack kit ships as "App".
export const metadata: Metadata = {
  title: "Automations",
  description: "Give an agent a task in plain English and watch it plan, work and be judged.",
};

// The shell is only the frame: the header needs to know whether a run is live, so the page renders it.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-muted/30">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
