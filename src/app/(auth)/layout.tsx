// The pages before sign-in: no top bar (there is no one to show in it yet), one card in the middle of the screen.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <p className="text-base font-semibold tracking-tight">Automations</p>
          <p className="text-sm text-muted-foreground">Tell an agent what to do, and watch it get done.</p>
        </div>
        {children}
      </div>
    </main>
  );
}
