import { z } from "zod";
import { entrySchema, dateOnly, monthOnly, amountSchema } from "./core";
const signedAmount = z.string().regex(/^-?(0|[1-9]\d{0,9})(\.\d{1,2})?$/);
const target = { id: z.uuid(), expected_revision: z.number().int().positive() };
export const operationSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("stage_import"),
      name: z.string().trim().min(1).max(200),
      rows: z
        .array(
          z
            .object({
              source_row: z.number().int().positive(),
              source: z.string().max(1000),
              entry: entrySchema.nullable(),
            })
            .strict(),
        )
        .min(1)
        .max(100),
    })
    .strict(),
  z
    .object({
      action: z.literal("commit_import"),
      mode: z.enum(["reconciled", "history_only"]).optional(),
      ...target,
      decisions: z
        .array(
          z
            .object({
              source_row: z.number().int().positive(),
              decision: z.enum(["include", "skip", "include_duplicate"]),
            })
            .strict(),
        )
        .min(1)
        .max(100),
      closing_balances: z
        .array(
          z
            .object({
              account_id: z.uuid(),
              as_of_date: dateOnly,
              balance: signedAmount,
            })
            .strict(),
        )
        .max(100),
    })
    .strict(),
  z
    .object({
      action: z.literal("create_installments"),
      transaction_id: z.uuid(),
      expected_revision: z.number().int().positive(),
      count: z.number().int().min(1).max(120),
      first_bill_date: dateOnly,
      first_due_date: dateOnly,
      first_report_month: monthOnly,
      reporting_basis: z.enum(["purchase", "billing"]),
    })
    .strict(),
  z
    .object({
      action: z.literal("pay_installment"),
      item_id: z.uuid(),
      expected_revision: z.number().int().positive(),
      account_id: z.uuid(),
      amount: amountSchema,
      date: dateOnly,
    })
    .strict(),
  z
    .object({
      action: z.literal("create_receivable"),
      transaction_id: z.uuid(),
      expected_revision: z.number().int().positive(),
      counterparty: z.string().trim().min(1).max(100),
      amount: amountSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("collect_receivable"),
      ...target,
      account_id: z.uuid(),
      amount: amountSchema,
      date: dateOnly,
    })
    .strict(),
  z
    .object({
      action: z.literal("reverse_settlement"),
      ...target,
      settlement_type: z.enum(["collection", "installment_payment"]),
    })
    .strict(),
  z
    .object({
      action: z.literal("cancel_plan"),
      ...target,
      plan_type: z.enum(["receivable", "installment"]),
    })
    .strict(),
  z
    .object({
      action: z.literal("reconcile_balance"),
      ...target,
      target_type: z.enum(["account", "wallet"]),
      as_of_date: dateOnly,
      observed_balance: signedAmount,
      reason: z.string().trim().min(3).max(500),
    })
    .strict(),
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
