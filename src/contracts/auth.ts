import { z } from "zod";

// Who is asking, and in which workspace. Every server read and write takes its workspace id from here.
export const SessionCtx = z.object({
  userId: z.string(),
  userName: z.string(),
  email: z.string(),
  workspaceId: z.string(),
  workspaceName: z.string(),
  role: z.enum(["owner", "admin", "member"]),
});
export type SessionCtx = z.infer<typeof SessionCtx>;

// memberId: the membership's own id (Better Auth's member row), which removing someone and changing a role go by (Q169)
export const Member = z.object({ memberId: z.string(), userId: z.string(), name: z.string(), email: z.string(), role: z.string(), joinedAt: z.string() });
export type Member = z.infer<typeof Member>;
export const WorkspaceSummary = z.object({ id: z.string(), name: z.string(), role: z.string() });
export type WorkspaceSummary = z.infer<typeof WorkspaceSummary>;
export const InviteInput = z.object({ email: z.email("Give an email address"), role: z.enum(["member", "admin"]).default("member") });
export type InviteInput = z.infer<typeof InviteInput>;

/** Server Components and Server Actions: the session, or a redirect to /sign-in. */
export type RequireSession = () => Promise<SessionCtx>;
/** Route handlers: the session, or null so the route answers 401 instead of redirecting a fetch. */
export type SessionFromHeaders = (headers: Headers) => Promise<SessionCtx | null>;
export type ListMembers = (workspaceId: string) => Promise<Member[]>;
export type ListWorkspaces = (userId: string) => Promise<WorkspaceSummary[]>;
/** Returns a link the inviter can send; no mail is sent while no mail provider is configured. */
export type InviteMember = (ctx: SessionCtx, input: InviteInput) => Promise<{ link: string }>;
