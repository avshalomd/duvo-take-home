// A form's error in one plain sentence, and optionally the way out (a link) after it. role="alert" so a screen
// reader says it as soon as it appears.
export function FormError({ message, children }: { message: string | null | undefined; children?: React.ReactNode }) {
  if (!message) return null;
  return (
    <p role="alert" data-testid="auth-error" className="rounded-xl bg-crimson-wash px-3.5 py-2.5 text-[14px] leading-5 text-crimson">
      {message}
      {children && <> {children}</>}
    </p>
  );
}
