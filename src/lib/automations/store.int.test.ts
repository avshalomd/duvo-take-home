// The automations store against the real tables. `npm run test:int`. The database is shared: everything here lives in
// workspaces whose ids start with "int-", its runs are named "[int] ...", and afterAll deletes all of it.
import { afterAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { automations, runs, workspaceSettings } from "@/db/schema";
import type { AutomationDraft, AutomationEdit } from "@/contracts/automation";
import { AutomationError } from "./errors";
import {
  approveAutomation,
  createAutomationDraft,
  deleteAutomation,
  getActiveByCommand,
  getAutomation,
  listAutomations,
  listTrials,
  runCommand,
  setAutomationStatus,
  setHumanVerdict,
  setSchedule,
  updateAutomation,
} from "./store";

const WS = "int-automations";
const OTHER_WS = "int-automations-other";
const ctx = { workspaceId: WS, userId: "int-user" };

// A run row as the engine would leave it; no agent runs here (a real run costs money and needs a request scope).
async function insertRun(over: Partial<typeof runs.$inferInsert> = {}): Promise<string> {
  const [row] = await db
    .insert(runs)
    .values({ workspaceId: WS, prompt: "[int] Audit Acme Ltd and write audit.md", status: "succeeded", model: "int-test", ...over })
    .returning({ id: runs.id });
  return row.id;
}

function draftWith(command: string, connections: string[] = []): AutomationDraft {
  return {
    name: "[int] Company audit",
    command,
    description: "Audits a company",
    inputLabel: "Company name",
    inputHint: "e.g. Apple Inc.",
    inputExample: "Acme Ltd",
    template: {
      instructions: "[int] Audit {input} and write audit.md.",
      intent: "Audits a company",
      expectedOutputs: ["audit.md"],
      outputFormat: "",
      steps: ["Search the web for {input}", "Write audit.md"],
      connections,
    },
  };
}

function editOf(a: { name: string; command: string; description: string; inputLabel: string; inputHint: string; inputExample: string; template: AutomationEdit["template"] }): AutomationEdit {
  return { name: a.name, command: a.command, description: a.description, inputLabel: a.inputLabel, inputHint: a.inputHint, inputExample: a.inputExample, template: a.template };
}

// A trial as startTrial would insert it, already finished, then judged by the person.
async function approvedTrial(automationId: string, version: number): Promise<string> {
  const runId = await insertRun({ purpose: "trial", automationId, automationVersion: version, input: "Acme Ltd" });
  await setHumanVerdict(ctx, { automationId, runId, verdict: "approved" });
  return runId;
}

afterAll(async () => {
  await db.delete(runs).where(inArray(runs.workspaceId, [WS, OTHER_WS]));
  await db.delete(automations).where(inArray(automations.workspaceId, [WS, OTHER_WS]));
  await db.delete(workspaceSettings).where(inArray(workspaceSettings.workspaceId, [WS, OTHER_WS])); // runCommand's budget check makes the row (QA F22)
});

describe.skipIf(!process.env.DATABASE_URL)("automations store", () => {
  it("creates a draft from a run: status draft, version 1, pointing at the run", async () => {
    const runId = await insertRun();
    const a = await createAutomationDraft(ctx, draftWith("int-audit"), runId);
    expect(a.status).toBe("draft");
    expect(a.version).toBe(1);
    expect(a.createdFromRunId).toBe(runId);
    expect(a.workspaceId).toBe(WS);
    expect(a.command).toBe("int-audit");
    expect(a.template.steps).toEqual(["Search the web for {input}", "Write audit.md"]);
    expect(a.approvedAt).toBeNull();
  });

  it("normalises the model's command before it is stored", async () => {
    const a = await createAutomationDraft(ctx, draftWith("/Int Normalised"), null);
    expect(a.command).toBe("int-normalised");
  });

  it("numbers a taken command -2, then -3, instead of failing on the unique index", async () => {
    const first = await createAutomationDraft(ctx, draftWith("int-dup"), null);
    const second = await createAutomationDraft(ctx, draftWith("int-dup"), null);
    const third = await createAutomationDraft(ctx, draftWith("int-dup"), null);
    expect([first.command, second.command, third.command]).toEqual(["int-dup", "int-dup-2", "int-dup-3"]);
  });

  it("refuses to rename a command to one another automation of the workspace uses", async () => {
    const taken = await createAutomationDraft(ctx, draftWith("int-taken"), null);
    const other = await createAutomationDraft(ctx, draftWith("int-other"), null);
    const err = await updateAutomation(WS, other.id, editOf({ ...other, command: taken.command })).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/\/int-taken is already used/);
  });

  // QA F7: the clash check passed for both, then the unique index refused one, which read "Something went wrong"
  it("renames two automations to one command at once: one saves, the other hears the command is taken", async () => {
    const one = await createAutomationDraft(ctx, draftWith("int-race-one"), null);
    const two = await createAutomationDraft(ctx, draftWith("int-race-two"), null);

    const results = await Promise.allSettled([
      updateAutomation(WS, one.id, editOf({ ...one, command: "int-race-same" })),
      updateAutomation(WS, two.id, editOf({ ...two, command: "int-race-same" })),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const refused = (results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason;
    expect(refused).toBeInstanceOf(AutomationError);
    expect(refused.message).toBe('/int-race-same is already used by "[int] Company audit". Pick another command.');
  });

  it("bumps the version when an edit changes what the agent is told, and keeps it for a hint", async () => {
    const a = await createAutomationDraft(ctx, draftWith("int-edit"), null);
    const hintOnly = await updateAutomation(WS, a.id, editOf({ ...a, inputHint: "The registered name" }));
    expect(hintOnly.version).toBe(1);
    expect(hintOnly.inputHint).toBe("The registered name");

    const newInstructions = await updateAutomation(WS, a.id, editOf({ ...a, template: { ...a.template, instructions: "[int] Audit {input} briefly." } }));
    expect(newInstructions.version).toBe(2);
    expect(newInstructions.template.instructions).toBe("[int] Audit {input} briefly.");
  });

  it("refuses approval without an approved example, then allows it after one", async () => {
    const a = await createAutomationDraft(ctx, draftWith("int-approve"), null);
    const refused = await approveAutomation(WS, a.id).catch((e) => e);
    expect(refused).toBeInstanceOf(Error);
    expect(refused.message).toMatch(/run an example/i);

    await approvedTrial(a.id, 1);
    const approved = await approveAutomation(WS, a.id);
    expect(approved.status).toBe("active");
    expect(approved.approvedAt).not.toBeNull();
    expect((await getActiveByCommand(WS, "int-approve"))?.id).toBe(a.id);
  });

  it("sends an approved automation back to draft when its instructions are edited", async () => {
    const a = await createAutomationDraft(ctx, draftWith("int-reedit"), null);
    await approvedTrial(a.id, 1);
    await approveAutomation(WS, a.id);

    const edited = await updateAutomation(WS, a.id, editOf({ ...a, template: { ...a.template, steps: ["Write audit.md"] } }));
    expect(edited.status).toBe("draft");
    expect(edited.version).toBe(2);
    expect(edited.approvedAt).toBeNull();
    expect(await getActiveByCommand(WS, "int-reedit")).toBeNull();
    // the example of version 1 no longer counts
    expect((await approveAutomation(WS, a.id).catch((e) => e)).message).toMatch(/earlier version/i);
  });

  // Review R2: the save action reads the status, then writes. An owner approving in between made a member's rename land
  // on a Ready automation (a new command does not bump the version), so the write itself holds the rule now.
  it("renames an approved automation's command only for someone who may govern it, whatever the caller read before", async () => {
    const LOCKED = "Only an owner or an admin can change the command of an approved automation.";
    const a = await createAutomationDraft(ctx, draftWith("int-rename"), null);
    await approvedTrial(a.id, 1);
    await approveAutomation(WS, a.id); // lands after the member's page read "draft"

    const refused = await updateAutomation(WS, a.id, editOf({ ...a, command: "int-renamed" }), { mayRenameApproved: false }).catch((e) => e);
    expect(refused).toBeInstanceOf(AutomationError);
    expect(refused.message).toBe(LOCKED);
    // not said who asks: refused too, so a new caller cannot rename by forgetting to say
    expect((await updateAutomation(WS, a.id, editOf({ ...a, command: "int-renamed" })).catch((e) => e)).message).toBe(LOCKED);
    expect(await getAutomation(WS, a.id)).toMatchObject({ command: a.command, status: "active" });

    const renamed = await updateAutomation(WS, a.id, editOf({ ...a, command: "int-renamed" }), { mayRenameApproved: true });
    expect(renamed).toMatchObject({ command: "int-renamed", status: "active" });
  });

  // Review R2: an edit of the instructions sends a Ready one back to draft, and "a draft" was all the write asked for
  it("keeps an approved automation's command an owner's or an admin's to change after an edit sends it back to draft", async () => {
    const LOCKED = "Only an owner or an admin can change the command of an approved automation.";
    const a = await createAutomationDraft(ctx, draftWith("int-two-saves"), null);
    await approvedTrial(a.id, 1);
    await approveAutomation(WS, a.id);

    const edited = await updateAutomation(WS, a.id, editOf({ ...a, template: { ...a.template, instructions: "[int] Audit {input} in four lines." } }), { mayRenameApproved: false });
    expect(edited).toMatchObject({ status: "draft", version: 2 });
    const refused = await updateAutomation(WS, a.id, editOf({ ...edited, command: "int-two-saves-m" }), { mayRenameApproved: false }).catch((e) => e);
    expect(refused).toBeInstanceOf(AutomationError);
    expect(refused.message).toBe(LOCKED);
    expect((await getAutomation(WS, a.id))?.command).toBe(a.command);

    expect((await updateAutomation(WS, a.id, editOf({ ...edited, command: "int-two-saves-a" }), { mayRenameApproved: true })).command).toBe("int-two-saves-a");
  });

  it("renames a draft's command for anyone, and saves the rest of an approved automation's edit when the command stays", async () => {
    const draft = await createAutomationDraft(ctx, draftWith("int-rename-draft"), null);
    expect((await updateAutomation(WS, draft.id, editOf({ ...draft, command: "int-renamed-draft" }), { mayRenameApproved: false })).command).toBe("int-renamed-draft");

    const ready = await createAutomationDraft(ctx, draftWith("int-rename-hint"), null);
    await approvedTrial(ready.id, 1);
    await approveAutomation(WS, ready.id);
    const hinted = await updateAutomation(WS, ready.id, editOf({ ...ready, inputHint: "The registered name" }), { mayRenameApproved: false });
    expect(hinted).toMatchObject({ inputHint: "The registered name", status: "active" });
  });

  it("lists an automation's trials only, with the person's verdict and the version they ran", async () => {
    const a = await createAutomationDraft(ctx, draftWith("int-trials"), null);
    const trialId = await approvedTrial(a.id, 1);
    await insertRun({ purpose: "automation", automationId: a.id, automationVersion: 1, input: "Acme Ltd" }); // a real call, not an example
    const trials = await listTrials(WS, a.id);
    expect(trials.map((t) => t.runId)).toEqual([trialId]);
    expect(trials[0]).toMatchObject({ version: 1, humanVerdict: "approved", input: "Acme Ltd", status: "succeeded" });
  });

  it("records a note with the verdict, and lets the person change their mind", async () => {
    const a = await createAutomationDraft(ctx, draftWith("int-verdict"), null);
    const runId = await insertRun({ purpose: "trial", automationId: a.id, automationVersion: 1 });
    await setHumanVerdict(ctx, { automationId: a.id, runId, verdict: "rejected", note: "The News section is missing" });
    expect((await listTrials(WS, a.id))[0]).toMatchObject({ humanVerdict: "rejected", humanNote: "The News section is missing" });
    await setHumanVerdict(ctx, { automationId: a.id, runId, verdict: "approved" });
    expect((await listTrials(WS, a.id))[0].humanVerdict).toBe("approved");
  });

  it("records who judged an example, and the next person to judge it replaces them", async () => {
    const a = await createAutomationDraft(ctx, draftWith("int-judge"), null);
    const runId = await insertRun({ purpose: "trial", automationId: a.id, automationVersion: 1 });
    await setHumanVerdict(ctx, { automationId: a.id, runId, verdict: "approved" });
    expect((await listTrials(WS, a.id))[0]).toMatchObject({ humanVerdict: "approved", humanVerdictBy: "int-user" });
    await setHumanVerdict({ ...ctx, userId: "int-user-2" }, { automationId: a.id, runId, verdict: "rejected" });
    expect((await listTrials(WS, a.id))[0]).toMatchObject({ humanVerdict: "rejected", humanVerdictBy: "int-user-2" });
  });

  it("reads a trial judged before the judge was stored as judged by nobody", async () => {
    const a = await createAutomationDraft(ctx, draftWith("int-old-judge"), null);
    await insertRun({ purpose: "trial", automationId: a.id, automationVersion: 1, humanVerdict: "approved" }); // as older rows are
    expect((await listTrials(WS, a.id))[0]).toMatchObject({ humanVerdict: "approved", humanVerdictBy: null });
  });

  it("refuses a verdict on a run that is still going, and 'looks right' on a run that failed", async () => {
    const a = await createAutomationDraft(ctx, draftWith("int-still"), null);
    const example = { purpose: "trial", automationId: a.id, automationVersion: 1 };
    const running = await insertRun({ ...example, status: "running" });
    expect((await setHumanVerdict(ctx, { automationId: a.id, runId: running, verdict: "approved" }).catch((e) => e)).message).toMatch(/still/i);
    const failed = await insertRun({ ...example, status: "failed" });
    expect((await setHumanVerdict(ctx, { automationId: a.id, runId: failed, verdict: "approved" }).catch((e) => e)).message).toMatch(/failed/i);
    await setHumanVerdict(ctx, { automationId: a.id, runId: failed, verdict: "rejected" }); // "not right" on a failed example is fine
  });

  // QA F10: the form's automation id was never checked, so any run of the workspace could be marked from any page
  it("judges only an example of the automation named: a plain run or another automation's example is refused", async () => {
    const a = await createAutomationDraft(ctx, draftWith("int-only-trials"), null);
    const b = await createAutomationDraft(ctx, draftWith("int-others-trials"), null);
    const plain = await insertRun();
    const othersExample = await insertRun({ purpose: "trial", automationId: b.id, automationVersion: 1 });
    const aCall = await insertRun({ purpose: "automation", automationId: a.id, automationVersion: 1 }); // a real call, not an example

    for (const runId of [plain, othersExample, aCall]) {
      const refused = await setHumanVerdict(ctx, { automationId: a.id, runId, verdict: "approved" }).catch((e) => e);
      expect(refused).toBeInstanceOf(AutomationError);
      expect(refused.message).toBe("That run is not an example of this automation.");
    }
    const judged = await db.select({ humanVerdict: runs.humanVerdict }).from(runs).where(inArray(runs.id, [plain, othersExample, aCall]));
    expect(judged.map((r) => r.humanVerdict)).toEqual([null, null, null]);
  });

  // QA F11: the delete's answer tells the page whether anything was deleted
  it("deletes an automation of the workspace and says so, and deletes nothing for another workspace's id", async () => {
    const a = await createAutomationDraft(ctx, draftWith("int-delete"), null);
    expect(await deleteAutomation(OTHER_WS, a.id)).toBe(false);
    expect(await getAutomation(WS, a.id)).not.toBeNull();
    expect(await deleteAutomation(WS, a.id)).toBe(true);
    expect(await deleteAutomation(WS, a.id)).toBe(false); // already gone
    expect(await deleteAutomation(WS, "not-a-uuid")).toBe(false);
  });

  it("keeps each workspace's automations and runs to itself", async () => {
    const a = await createAutomationDraft(ctx, draftWith("int-private"), null);
    expect(await getAutomation(OTHER_WS, a.id)).toBeNull();
    expect((await listAutomations(OTHER_WS)).map((x) => x.id)).not.toContain(a.id);
    expect((await listAutomations(WS)).map((x) => x.id)).toContain(a.id);
    const runId = await insertRun({ purpose: "trial", automationId: a.id, automationVersion: 1 });
    const refused = await setHumanVerdict({ ...ctx, workspaceId: OTHER_WS }, { automationId: a.id, runId, verdict: "approved" }).catch((e) => e);
    expect(refused.message).toMatch(/not found/i);
  });

  it("refuses to turn on an automation that was never approved, and turns an approved one off", async () => {
    const draft = await createAutomationDraft(ctx, draftWith("int-onoff"), null);
    expect((await setAutomationStatus(WS, draft.id, "active").catch((e) => e)).message).toMatch(/approve/i);

    await approvedTrial(draft.id, 1);
    await approveAutomation(WS, draft.id);
    await setAutomationStatus(WS, draft.id, "disabled");
    expect((await getAutomation(WS, draft.id))?.status).toBe("disabled");
    expect(await getActiveByCommand(WS, "int-onoff")).toBeNull();
    await setAutomationStatus(WS, draft.id, "active");
    expect((await getActiveByCommand(WS, "int-onoff"))?.id).toBe(draft.id);
  });

  it("stores a schedule with its input and the next run, and clears it", async () => {
    const a = await createAutomationDraft(ctx, draftWith("int-schedule"), null);
    await setSchedule(WS, a.id, "0 8 * * 1-5", "Apple Inc.");
    const scheduled = await getAutomation(WS, a.id);
    expect(scheduled).toMatchObject({ schedule: "0 8 * * 1-5", scheduleInput: "Apple Inc." });
    expect(new Date(scheduled!.nextRunAt!).getTime()).toBeGreaterThan(Date.now());

    await setSchedule(WS, a.id, null, null);
    expect(await getAutomation(WS, a.id)).toMatchObject({ schedule: null, scheduleInput: null, nextRunAt: null });
  });

  it("stores the schedule's time zone and computes the next run at the chosen local time in it", async () => {
    const a = await createAutomationDraft(ctx, draftWith("int-schedule-tz"), null);
    await setSchedule(WS, a.id, "0 8 * * 1-5", "Apple Inc.", "Europe/Prague");
    const scheduled = await getAutomation(WS, a.id);
    expect(scheduled).toMatchObject({ schedule: "0 8 * * 1-5", scheduleTz: "Europe/Prague" });
    const hourInPrague = new Date(scheduled!.nextRunAt!).toLocaleString("en-GB", { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit" });
    expect(hourInPrague).toBe("08:00");

    await setSchedule(WS, a.id, null, null, null);
    expect(await getAutomation(WS, a.id)).toMatchObject({ schedule: null, scheduleTz: null, nextRunAt: null });
  });

  it("runCommand refuses an unknown command, naming it", async () => {
    const err = await runCommand(ctx, { command: "int-nothing", input: "Apple" }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/\/int-nothing/);
  });

  it("runCommand refuses a command that is still a draft", async () => {
    await createAutomationDraft(ctx, draftWith("int-notyet"), null);
    const err = await runCommand(ctx, { command: "int-notyet", input: "Apple" }).catch((e) => e);
    expect(err.message).toMatch(/not approved yet/i);
  });

  // Q197: "/news-digest" with 3,900 characters after it answered 500 on the API and "Keep the instructions under 4000
  // characters" on Home, because the filled brief was over 4000. The input has a limit of its own, in its own words.
  it("runCommand refuses an input over 2000 characters in plain words, and starts nothing", async () => {
    const a = await createAutomationDraft(ctx, draftWith("int-long"), null);
    await approvedTrial(a.id, 1);
    await approveAutomation(WS, a.id);
    const before = (await db.select({ id: runs.id }).from(runs).where(inArray(runs.workspaceId, [WS]))).length;
    const err = await runCommand(ctx, { command: "int-long", input: "x".repeat(2001) }).catch((e) => e);
    expect(err).toBeInstanceOf(AutomationError);
    expect(err.message).toBe("Keep the company name under 2000 characters.");
    expect((await db.select({ id: runs.id }).from(runs).where(inArray(runs.workspaceId, [WS]))).length).toBe(before);
  });

  it("runCommand refuses when a connection the automation needs is not on, and says which", async () => {
    const a = await createAutomationDraft(ctx, draftWith("int-needs", ["[int] Missing server"]), null);
    await approvedTrial(a.id, 1);
    await approveAutomation(WS, a.id);
    const err = await runCommand(ctx, { command: "int-needs", input: "Apple" }).catch((e) => e);
    expect(err.message).toBe("Turn on [int] Missing server in Settings to run /int-needs");
  });
});
