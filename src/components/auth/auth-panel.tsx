// The form side of every sign-in screen, on the paper: a title in display type, one plain sentence, the form, and
// a quiet line pointing elsewhere. No card around it: the paper is the surface.
export function AuthPanel({ title, description, children, footer }: { title: string; description: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-2">
        <h1 className="display text-[34px]">{title}</h1>
        <p className="text-[15px] text-slate">{description}</p>
      </div>
      {children}
      {footer && <p className="text-[14px] text-slate">{footer}</p>}
    </div>
  );
}
