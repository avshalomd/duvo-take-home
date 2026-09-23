"use client";

// Who is signed in, in which workspace. The auth package turns it into a menu: switch workspace, sign out.
export function UserMenu({ userName, workspaceName }: { userName: string; workspaceName: string }) {
  return (
    <span className="ml-auto truncate text-xs text-muted-foreground">
      {userName} · {workspaceName}
    </span>
  ); // STUB: the auth package
}
