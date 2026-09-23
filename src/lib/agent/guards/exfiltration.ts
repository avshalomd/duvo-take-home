/** The one question the url guard asks Jev. */
export const JEV_TIMEOUT_MS = 3000;
export const EXFILTRATION_QUESTION = "";
export type ExfiltrationState = { url: string; task: string; plan: string[] };
export type AskExfiltration = (state: ExfiltrationState) => Promise<number>;
export const askJev: AskExfiltration = async () => 0; // skeleton
