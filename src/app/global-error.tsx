"use client";

import "./globals.css";

// The last net: an error in the root layout itself. It replaces that layout, so it brings its own document and the
// app's stylesheet (the fonts are the system's here), and says what the page boundaries say. The error's own text
// stays out of view: it can name the database host.
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col items-center justify-center bg-mist px-6 py-12">
        <title>Handover</title>
        <main role="alert" className="flex w-full max-w-[40rem] flex-col items-center gap-3 rounded-[22px] bg-paper px-6 py-16 text-center shadow-sheet">
          <h1 className="text-[28px] font-semibold">This page could not be loaded</h1>
          <p className="max-w-[46ch] text-[15px] text-slate">Something got in the way, often a dropped connection. Try again in a moment.</p>
          <button
            type="button"
            onClick={() => retry()}
            className="mt-3 inline-flex h-10 items-center rounded-full bg-graphite px-5 text-[15px] font-medium text-paper transition-transform duration-100 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none active:scale-[0.97]"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
