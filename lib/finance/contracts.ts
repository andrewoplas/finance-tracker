import { z } from "zod";
import { entrySchema, dateOnly } from "./core";
const target = { id: z.uuid(), expected_revision: z.number().int().positive() };
export const operationSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("post_recurring"),
      id: z.uuid(),
      expected_next_date: dateOnly,
      date: dateOnly,
    })
    .strict(),
  z
    .object({
      action: z.literal("create"),
      entries: z.array(entrySchema).min(1).max(100),
    })
    .strict(),
  z
    .object({ action: z.literal("amend"), ...target, entry: entrySchema })
    .strict(),
  z.object({ action: z.literal("reverse"), ...target }).strict(),
  z
    .object({
      action: z.literal("undo"),
      id: z.uuid(),
      expected_audit_id: z.string().regex(/^\d+$/),
    })
    .strict(),
]);
export const requestSchema = z
  .object({ request_id: z.uuid(), operation: operationSchema })
  .strict();
export type Operation = z.infer<typeof operationSchema>;
