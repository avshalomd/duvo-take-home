// A form's error in one plain sentence. role="alert" so a screen reader says it as soon as it appears.
export function FormError({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" data-testid="auth-error" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}
