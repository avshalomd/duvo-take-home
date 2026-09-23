import type { AutomationEdit } from "@/contracts/automation";

export type EditValues = Record<string, string> & { connections?: string[] };
export type ParsedEdit = { ok: true; edit: AutomationEdit } | { ok: false; fieldErrors: Record<string, string>; values: EditValues };
export const parseEditForm = (_formData: FormData): ParsedEdit => ({ ok: false, fieldErrors: {}, values: {} }); // STUB
