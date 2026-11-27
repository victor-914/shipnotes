import { writeFile } from "node:fs/promises";
import { z } from "zod";
import { snapshotSchema, SPEC_VERSION } from "../src/spec.js";

const schema = {
  $id: "https://github.com/victor-914/shipnotes/schema/outcomes.schema.json",
  title: `Outcome Snapshot (${SPEC_VERSION})`,
  ...z.toJSONSchema(snapshotSchema, { io: "input" }),
};
await writeFile(new URL("../schema/outcomes.schema.json", import.meta.url), `${JSON.stringify(schema, null, 2)}\n`);
console.log("wrote schema/outcomes.schema.json");
