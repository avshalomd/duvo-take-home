"use client";

import { Menu } from "@base-ui/react/menu";
import { ChevronDownIcon, LogOut, Plus } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { WorkspaceSummary } from "@/contracts/auth";
import { loadWorkspaces, signOut, trySwitchWorkspace } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";
import { NewWorkspaceDialog } from "./new-workspace-dialog";

type Loaded = { activeId: string; email: string; workspaces: WorkspaceSummary[] };

const initial = (name: string) => name.trim().charAt(0).toUpperCase() || "?";
const item = "rounded-xl px-2.5 py-2 text-[15px] gap-2.5";

// Critically damped, from the trigger: the popover grows out of where it was asked for and never overshoots.
const OPEN = { type: "spring" as const, bounce: 0, duration: 0.35 };
const FADE = { duration: 0.15 }; // reduced motion: a cross-fade instead of a movement

// The workspace in the top bar, and the way to switch it, make a new one or sign out. The trigger names the
// workspace (on a phone too, Q113): it is what the page shows. Who is signed in is said inside the popover.
// The workspace list is loaded when the menu opens, so the top bar passes only the two names it already has.
export function UserMenu({ userName, workspaceName }: { userName: string; workspaceName: string }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [creating, setCreating] = useState(false);
  const [, startTransition] = useTransition();
  const reduce = useReducedMotion();

  // A switch the server refuses (a membership removed while the menu was open) is said in its words, as a toast:
  // on success the action opens Home instead, and nothing comes back to say
  async function openWorkspace(id: string) {
    const result = await trySwitchWorkspace(id);
    if (result?.error) toast.error(result.error);
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    // loaded again on every open: a workspace made in another tab shows up without a reload
    if (next) startTransition(async () => setLoaded(await loadWorkspaces()));
  }

  return (
    <>
      <Menu.Root open={open} onOpenChange={onOpenChange}>
        <Menu.Trigger
          aria-label={`${userName}, ${workspaceName}`}
          className={cn(
            "flex h-9 max-w-full min-w-0 items-center gap-2 rounded-full py-1 pr-2.5 pl-1 text-[14px] transition-[transform,background-color] duration-100",
            "hover:bg-graphite/5 active:scale-[0.97] data-[popup-open]:bg-graphite/5",
            "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
          )}
        >
          <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-graphite text-[12px] font-semibold text-paper">
            {initial(userName)}
          </span>
          {/* a phone's top bar has no room for the name: there the menu's first line says it (Q113) */}
          <span className="min-w-0 truncate font-medium max-sm:hidden">{workspaceName}</span>
          <ChevronDownIcon aria-hidden className="size-3.5 shrink-0 text-slate max-sm:hidden" />
        </Menu.Trigger>
        <AnimatePresence>
          {open && (
            <Menu.Portal keepMounted>
              <Menu.Positioner align="end" sideOffset={8} className="z-50 outline-none">
                <Menu.Popup
                  className="glass w-72 max-w-[calc(100vw-1.5rem)] rounded-[18px] p-1.5 text-graphite outline-none"
                  render={
                    <motion.div
                      style={{
                        transformOrigin: "var(--transform-origin)", // Base UI puts the trigger's side here
                        // glass sets its own box-shadow (the light top edge), which cancelled shadow-float: on the white
                        // sheet the popover had no edge at all. The edge, a hairline and the float are set together
                        boxShadow: "inset 0 1px 0 var(--glass-edge), 0 0 0 1px var(--hairline), var(--shadow-float)",
                      }}
                      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
                      transition={reduce ? FADE : OPEN}
                    />
                  }
                >
                  {/* which workspace this is, then who is signed in: the two things the top bar can only abbreviate */}
                  <div className="px-2.5 pt-1.5 pb-2">
                    <p data-testid="menu-workspace" className="truncate text-[15px] font-semibold">
                      {workspaceName}
                    </p>
                    <p className="truncate text-[13px] tracking-[0.01em] text-slate">
                      Signed in as {loaded?.email ?? userName}
                    </p>
                  </div>
                  <DropdownMenuSeparator className="mx-1 bg-hairline" />
                  <DropdownMenuGroup>
                    <DropdownMenuLabel className="px-2.5 pt-2 pb-1 text-[13px] font-normal text-slate">Your workspaces</DropdownMenuLabel>
                    {loaded ? (
                      <DropdownMenuRadioGroup value={loaded.activeId} onValueChange={(id: string) => id !== loaded.activeId && startTransition(() => openWorkspace(id))}>
                        {loaded.workspaces.map((w) => (
                          <DropdownMenuRadioItem key={w.id} value={w.id} className={cn(item, "pr-9")}>
                            <span className="truncate">{w.name}</span>
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    ) : (
                      <DropdownMenuItem disabled className={cn(item, "text-slate")}>
                        {workspaceName}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem className={item} onClick={() => setCreating(true)}>
                      <Plus aria-hidden className="text-slate" />
                      New workspace
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator className="mx-1 bg-hairline" />
                  <DropdownMenuItem className={item} onClick={() => startTransition(() => signOut())}>
                    <LogOut aria-hidden className="text-slate" />
                    Sign out
                  </DropdownMenuItem>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          )}
        </AnimatePresence>
      </Menu.Root>
      <NewWorkspaceDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
