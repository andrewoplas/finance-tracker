import { z } from 'zod';
import { amountSchema, dateOnly } from '../../finance/core';

// One explicit account per expense. Never infer an account from history or defaults.
export const expenseSchema = z.object({
  account_id: z.uuid().describe('Required: exact owned account explicitly selected by the user.'),
  amount: amountSchema.describe('Positive exact PHP decimal string; at most two decimals.'),
  description: z.string().trim().min(1).max(300),
  date: dateOnly.optional().describe('Full YYYY-MM-DD; omit only for Asia/Manila today.'),
  category_id: z.uuid().nullable().default(null),
  tag_ids: z.array(z.uuid()).max(50).refine(ids => new Set(ids).size === ids.length).default([]),
}).strict();
export const previewSchema = z.object({
  request_id: z.uuid().describe('Fresh UUID for a new expense; retain it for every retry.'),
  expense: expenseSchema,
  duplicate_decision: z.enum(['review', 'confirmed_separate']).default('review')
    .describe('Use confirmed_separate only after the user reviews the matching expenses and explicitly confirms a separate purchase.'),
}).strict();
export const commitSchema = previewSchema.extend({
  expense: expenseSchema.extend({ date: dateOnly }),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  intent: z.literal('log_expense').describe('Only for an actual user instruction to save. Examples, hypothetical and setup text never authorize a commit.'),
}).strict();

export const receiptSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('recorded'), persisted: z.literal(true), transaction_id: z.uuid(), request_id: z.uuid() }).passthrough(),
  z.object({ status: z.literal('needs_review'), persisted: z.literal(false), request_id: z.uuid() }).passthrough(),
]);
export type RemoteAction = 'authorize' | 'context' | 'preview' | 'commit';
export type RemoteRpc = (action: RemoteAction, args: Record<string, unknown>) => Promise<unknown>;
