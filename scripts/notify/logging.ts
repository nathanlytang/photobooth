import type { SessionResult } from './types.js';

export function logResult(r: SessionResult): void {
  const o = r.outcome;
  if (o.kind === 'sent') {
    const tag = o.dryRun ? 'would-send' : 'sent';
    const methodStr =
      o.method === 'both'
        ? `email→${o.recipients.email} + sms→${o.recipients.phone}`
        : o.method === 'email'
        ? `email→${o.recipients.email}`
        : `sms→${o.recipients.phone}`;
    const failed = o.attempts.filter((a) => !a.ok);
    const partial =
      failed.length > 0
        ? ` (partial: ${failed.map((a) => `${a.method}=${a.error}`).join('; ')})`
        : '';
    console.log(
      `[notify] ${r.sessionId}  ${tag.padEnd(10)} ${methodStr} (${o.durationMs}ms)${partial}`
    );
  } else if (o.kind === 'skipped') {
    const detail = o.detail ? ` detail=${o.detail}` : '';
    console.log(`[notify] ${r.sessionId}  ${'skipped'.padEnd(10)} reason=${o.reason}${detail}`);
  } else {
    console.log(`[notify] ${r.sessionId}  ${'failed'.padEnd(10)} ${o.reason}`);
  }
}

export function printSummary(results: SessionResult[]): void {
  const sent = results.filter((r) => r.outcome.kind === 'sent');
  const skipped = results.filter((r) => r.outcome.kind === 'skipped');
  const failed = results.filter((r) => r.outcome.kind === 'failed');

  console.log('');
  console.log(
    `[notify] Summary: ${sent.length} sent, ${skipped.length} skipped, ${failed.length} failed`
  );

  if (failed.length > 0) {
    console.log(`  failed: ${failed.map((r) => r.sessionId).join(', ')}`);
  }

  const byReason: Record<string, string[]> = {};
  for (const r of skipped) {
    if (r.outcome.kind !== 'skipped') continue;
    (byReason[r.outcome.reason] ||= []).push(r.sessionId);
  }
  for (const [reason, ids] of Object.entries(byReason)) {
    console.log(`  skipped (${reason}): ${ids.join(', ')}`);
  }
}
