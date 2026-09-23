import "server-only";

export type OAuthRow = { id: string; workspaceId: string; name: string; url: string; oauth: unknown };

export async function findConnection(_workspaceId: string, _id: string): Promise<OAuthRow | null> {
  throw new Error("not implemented: findConnection");
}
export async function findByPendingState(_state: string): Promise<OAuthRow | null> {
  throw new Error("not implemented: findByPendingState");
}
export async function loadOAuth(_id: string): Promise<{ workspaceId: string; oauth: unknown } | null> {
  throw new Error("not implemented: loadOAuth");
}
export async function markOAuth(_workspaceId: string, _id: string): Promise<void> {
  throw new Error("not implemented: markOAuth");
}
