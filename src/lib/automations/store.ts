import "server-only";
import type {
  ApproveAutomation,
  CreateAutomationDraft,
  GetActiveByCommand,
  GetAutomation,
  ListAutomations,
  ListTrials,
  RunCommand,
  SetAutomationStatus,
  SetHumanVerdict,
  SetSchedule,
  StartTrial,
  UpdateAutomation,
} from "@/contracts/automation";

const todo = (name: string) => () => {
  throw new Error(`not implemented: ${name}`);
};
export const listAutomations: ListAutomations = async () => []; // STUB: the automations package
export const getAutomation: GetAutomation = async () => null; // STUB
export const getActiveByCommand: GetActiveByCommand = async () => null; // STUB
export const createAutomationDraft: CreateAutomationDraft = async () => todo("createAutomationDraft")(); // STUB
export const updateAutomation: UpdateAutomation = async () => todo("updateAutomation")(); // STUB
export const approveAutomation: ApproveAutomation = async () => todo("approveAutomation")(); // STUB
export const setAutomationStatus: SetAutomationStatus = async () => todo("setAutomationStatus")(); // STUB
export const setSchedule: SetSchedule = async () => todo("setSchedule")(); // STUB
export const listTrials: ListTrials = async () => []; // STUB
export const setHumanVerdict: SetHumanVerdict = async () => todo("setHumanVerdict")(); // STUB
export const startTrial: StartTrial = async () => todo("startTrial")(); // STUB
export const runCommand: RunCommand = async () => todo("runCommand")(); // STUB
