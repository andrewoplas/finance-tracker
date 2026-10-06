import { requestSchema } from './contracts';
import { createHash } from 'node:crypto';
const json = (body: unknown, status = 200) => Response.json(body, {status, headers: {'Cache-Control':'no-store'}});
export type CommitFinancial = (args: {request_id: string; operation: unknown}) => Promise<{data: unknown; error: {code: string; message: string} | null}>;
export async function financialOperation(action: string, body: unknown, previewDigest: string | null, commit: CommitFinancial) {
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success)
    return json(
      { error: "Invalid financial operation", issues: parsed.error.flatten() },
      400,
    );
  const payload = parsed.data;
  // Canonical validated payload is identical for preview and commit. Preview performs no writes.
  const digest = createHash("sha256")
    .update(JSON.stringify(payload.operation))
    .digest("hex");
  if (action === "preview")
    return json({
      request_id: payload.request_id,
      operation: payload.operation,
      digest,
      warnings: [
        "Confirm account, dates, allocation and amount before committing. Ownership and revisions are checked atomically at commit.",
      ],
      persisted: false,
    });
  if (previewDigest !== digest)
    return json(
      { error: "Preview this exact operation before committing" },
      409,
    );
  const { data, error } = await commit({
    request_id: payload.request_id,
    operation: payload.operation,
  });
  if (error)
    return json(
      {
        error: ["P0001", "40001"].includes(error.code)
          ? error.message
          : "Operation rejected. Check references and idempotency key; database migration may be required.",
      },
      error.code === "40001" ? 409 : 422,
    );
  return json({ result: data, persisted: true });
}
