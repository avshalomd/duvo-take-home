import { beforeEach, describe, expect, it, vi } from "vitest";

// Speed: each read of a page is a round trip to the database, and reads made one after another add up to what the
// reader waits for. These pin that a page starts the reads it can make at once together, before any has answered.

/** A promise the test answers when it chooses, so a read can be held open while the page goes on. */
function held<T>() {
  let answer!: (value: T) => void;
  const promise = new Promise<T>((resolve) => (answer = resolve));
  return { promise, answer };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const session = { userId: "u1", userName: "Sam", email: "sam@example.com", workspaceId: "w1", workspaceName: "Acme", role: "owner" as const };
const reads = vi.hoisted(() => ({
  getAutomation: vi.fn(),
  listTrials: vi.fn(),
  listConnections: vi.fn(),
  automationHistory: vi.fn(),
  judgeNames: vi.fn(),
  getRun: vi.fn(),
  listMembers: vi.fn(),
  listInvitations: vi.fn(),
  role: "owner",
}));

vi.mock("@/lib/auth/session", () => ({ requireSession: async () => ({ ...session, role: reads.role }) }));
vi.mock("@/lib/automations/store", () => ({ getAutomation: reads.getAutomation, listTrials: reads.listTrials }));
vi.mock("@/lib/connections/store", () => ({ listConnections: reads.listConnections }));
vi.mock("@/lib/automations/runs", () => ({ automationHistory: reads.automationHistory }));
vi.mock("@/lib/runs/judges", async (actual) => ({ ...(await actual<typeof import("@/lib/runs/judges")>()), judgeNames: reads.judgeNames }));
vi.mock("@/lib/runs/queries", () => ({ getRun: reads.getRun }));
vi.mock("@/lib/auth/members", () => ({ listMembers: reads.listMembers, listInvitations: reads.listInvitations }));

import AutomationPage from "./automations/[id]/page";
import MembersPage from "./settings/members/page";

const trial = { runId: "r1", input: "Apple", version: 1, status: "succeeded", outcome: "pass", humanVerdict: "approved", humanVerdictBy: "u2", humanNote: null, createdAt: "2026-09-24T10:00:00.000Z" };
const automation = { id: "a1", name: "Audit", command: "audit", status: "draft", version: 1, inputLabel: "company", inputHint: "", inputExample: "Apple", schedule: null };
const props = { params: Promise.resolve({ id: "a1" }), searchParams: Promise.resolve({}) } as unknown as Parameters<typeof AutomationPage>[0];

beforeEach(() => {
  vi.clearAllMocks();
  reads.role = "owner";
  reads.getAutomation.mockResolvedValue(automation);
  reads.listTrials.mockResolvedValue([trial]);
  reads.listConnections.mockResolvedValue([]);
  reads.automationHistory.mockResolvedValue([]);
  reads.judgeNames.mockResolvedValue({ u2: "Kim" });
  reads.getRun.mockResolvedValue(null);
  reads.listMembers.mockResolvedValue([]);
  reads.listInvitations.mockResolvedValue([]);
});

describe("an automation's page", () => {
  it("reads the automation, its examples, its runs and the connections side by side", async () => {
    const found = held<typeof automation>();
    reads.getAutomation.mockReturnValue(found.promise);
    const page = AutomationPage(props);
    await settle();
    expect(reads.listTrials).toHaveBeenCalledWith("w1", "a1");
    expect(reads.listConnections).toHaveBeenCalledWith("w1");
    expect(reads.automationHistory).toHaveBeenCalledWith("w1", "a1");
    found.answer(automation);
    await page;
  });

  it("reads the examples' runs and the names of who judged them side by side", async () => {
    const names = held<Record<string, string>>();
    reads.judgeNames.mockReturnValue(names.promise);
    const page = AutomationPage(props);
    await settle();
    expect(reads.judgeNames).toHaveBeenCalledWith(["u2"]);
    expect(reads.getRun).toHaveBeenCalledWith("w1", "r1");
    names.answer({ u2: "Kim" });
    await page;
  });
});

describe("the Members page", () => {
  it("reads the members and the pending invitations side by side", async () => {
    const members = held<never[]>();
    reads.listMembers.mockReturnValue(members.promise);
    const page = MembersPage();
    await settle();
    expect(reads.listInvitations).toHaveBeenCalled();
    members.answer([]);
    await page;
  });

  it("does not read the invitations for a plain member, who is not shown them", async () => {
    reads.role = "member";
    await MembersPage();
    expect(reads.listInvitations).not.toHaveBeenCalled();
  });
});
