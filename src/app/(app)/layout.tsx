import { TopBar } from "@/components/shell/top-bar";
import { requireSession } from "@/lib/auth/session";

// Every page behind sign-in shares this frame: the session is read once here (a redirect to /sign-in when there
// is none), and each page reads it again through requireSession() for its own queries.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await requireSession();
  return (
    <>
      <TopBar userName={session.userName} workspaceName={session.workspaceName} />
      {children}
    </>
  );
}
