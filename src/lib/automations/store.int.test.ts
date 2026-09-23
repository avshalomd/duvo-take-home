// The automations store against the real tables. `npm run test:int`. The database is shared: everything here lives in
// workspaces whose ids start with "int-", its runs are named "[int] ...", and afterAll deletes all of it.
import { afterAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { automations, runs } from "@/db/schema";
import type { AutomationDraft, AutomationEdit } from "@/contracts/automation";
import { AutomationError } from "./errors";
import {
  approveAutomation,
  createAutomationDraft,
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
  await setHumanVerdict(WS, { runId, verdict: "approved" });
  return runId;
}

afterAll(async () => {
  await db.delete(runs).where(inArray(runs.workspaceId, [WS, OTHER_WS]));
  await db.delete(automations).where(inArray(automations.workspaceId, [WS, OTHER_WS]));
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
    await setHumanVerdict(WS, { runId, verdict: "rejected", note: "The News section is missing" });
    expect((await listTrials(WS, a.id))[0]).toMatchObject({ humanVerdict: "rejected", humanNote: "The News section is missing" });
    await setHumanVerdict(WS, { runId, verdict: "approved" });
    expect((await listTrials(WS, a.id))[0].humanVerdict).toBe("approved");
  });

  it("refuses a verdict on a run that is still going, and 'looks right' on a run that failed", async () => {
    const running = await insertRun({ purpose: "trial", status: "running" });
    expect((await setHumanVerdict(WS, { runId: running, verdict: "approved" }).catch((e) => e)).message).toMatch(/still/i);
    const failed = await insertRun({ purpose: "trial", status: "failed" });
    expect((await setHumanVerdict(WS, { runId: failed, verdict: "approved" }).catch((e) => e)).message).toMatch(/failed/i);
    await setHumanVerdict(WS, { runId: failed, verdict: "rejected" }); // "not right" on a failed example is fine
  });

  it("keeps each workspace's automations and runs to itself", async () => {
    const a = await createAutomationDraft(ctx, draftWith("int-private"), null);
    expect(await getAutomation(OTHER_WS, a.id)).toBeNull();
    expect((await listAutomations(OTHER_WS)).map((x) => x.id)).not.toContain(a.id);
    expect((await listAutomations(WS)).map((x) => x.id)).toContain(a.id);
    const runId = await insertRun();
    expect((await setHumanVerdict(OTHER_WS, { runId, verdict: "approved" }).catch((e) => e)).message).toMatch(/not found/i);
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
