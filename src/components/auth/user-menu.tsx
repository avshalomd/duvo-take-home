"use client";

import { ChevronDownIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { WorkspaceSummary } from "@/contracts/auth";
import { loadWorkspaces, signOut, switchWorkspace } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";
import { NewWorkspaceDialog } from "./new-workspace-dialog";

type Loaded = { activeId: string; workspaces: WorkspaceSummary[] };

const initial = (name: string) => name.trim().charAt(0).toUpperCase() || "?";

// Who is signed in, in which workspace; opened, it switches workspace, makes a new one, or signs out. The list of
// workspaces is loaded when the menu first opens, so the top bar passes only the two names it already has.
export function UserMenu({ userName, workspaceName }: { userName: string; workspaceName: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [creating, setCreating] = useState(false);
  const [, startTransition] = useTransition();

  function onOpenChange(open: boolean) {
    // loaded again on every open: a workspace made in another tab shows up without a reload
    if (open) startTransition(async () => setLoaded(await loadWorkspaces()));
  }

  return (
    <>
      <DropdownMenu onOpenChange={onOpenChange}>
        {/* On a phone only the initial shows (the top bar has no room); the label names both at every width. */}
        <DropdownMenuTrigger
          aria-label={`${userName} · ${workspaceName}`}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "ml-auto max-w-[18rem] gap-1.5 px-1 sm:px-2")}
        >
          <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
            {initial(userName)}
          </span>
          <span className="hidden min-w-0 truncate sm:inline">
            <span className="font-medium">{userName}</span> <span className="text-muted-foreground">· {workspaceName}</span>
          </span>
          <ChevronDownIcon className="hidden text-muted-foreground sm:block" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="truncate text-sm text-foreground">{userName}</DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
            {loaded ? (
              <DropdownMenuRadioGroup value={loaded.activeId} onValueChange={(id: string) => id !== loaded.activeId && startTransition(() => switchWorkspace(id))}>
                {loaded.workspaces.map((w) => (
                  <DropdownMenuRadioItem key={w.id} value={w.id}>
                    <span className="truncate">{w.name}</span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            ) : (
              <DropdownMenuItem disabled>Loading your workspaces...</DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => setCreating(true)}>New workspace</DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => startTransition(() => signOut())}>Sign out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <NewWorkspaceDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
