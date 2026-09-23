import type { ScanOutput } from "@/contracts/guard";

/** Credentials quarantine a file; personal data is counted into flags. */
export const scanOutput: ScanOutput = () => ({ flags: [], quarantined: false }); // STUB: the guards package
