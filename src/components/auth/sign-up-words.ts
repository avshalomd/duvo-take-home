// What the sign-up page says. Someone who came from an invitation is joining a workspace, not getting a private one
// (UX QA U4): the page names it and who invited them, as the invitation they just opened did.
export function signUpWords(invitation: { workspaceName: string; inviterName: string } | null): { title: string; description: string } {
  if (!invitation) return { title: "Create an account", description: "You get a workspace of your own. Nobody else sees what you run in it." };
  return {
    title: `Create an account to join ${invitation.workspaceName}`,
    // the new account joins straight after sign-up (UX QA U26), so the words promise just that
    description: `${invitation.inviterName} invited you to work together in ${invitation.workspaceName}. Your account joins it as soon as it is made.`,
  };
}
