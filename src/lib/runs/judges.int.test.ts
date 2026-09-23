// The names shown beside a person's judgment ("Mia said it looks right"), read from Better Auth's user table.
// `npm run test:int`. The database is shared: the users here have "int-judge-" ids and are deleted in afterAll.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { like } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { judgeNames } from "./judges";

const stamp = Date.now().toString(36);
const NAMED = `int-judge-named-${stamp}`;
const NAMELESS = `int-judge-nameless-${stamp}`;

beforeAll(async () => {
  await db.insert(user).values([
    { id: NAMED, name: "Mia Member", email: `${NAMED}@example.com` },
    { id: NAMELESS, name: " ", email: `${NAMELESS}@example.com` }, // Google can return an account without a name
  ]);
});

afterAll(async () => {
  await db.delete(user).where(like(user.id, "int-judge-%"));
});

describe("the names of the people who judged", () => {
  it("gives each judge's name by their user id, and the email for an account without a name", async () => {
    expect(await judgeNames([NAMED, NAMELESS])).toEqual({ [NAMED]: "Mia Member", [NAMELESS]: `${NAMELESS}@example.com` });
  });

  it("leaves out nobody-recorded and accounts that are gone, so their judgment reads neutrally", async () => {
    expect(await judgeNames([null, undefined, `int-judge-gone-${stamp}`, NAMED])).toEqual({ [NAMED]: "Mia Member" });
  });

  it("asks nothing when there is nobody to name", async () => {
    expect(await judgeNames([null, null])).toEqual({});
  });
});
