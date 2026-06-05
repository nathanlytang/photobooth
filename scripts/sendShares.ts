/**
 * Photobooth share notifier — one-shot CLI wrapper.
 *
 * Reads `app.notifications` from `config.json` and processes sessions exactly
 * once, then exits. All behavior is configured via `app.notifications.options`
 * (channel, mode, dryRun, retryQueuePath, etc.). The notification logic itself
 * lives in `server/notifications/`; the long-running watcher inside the
 * photobooth server uses the same engine.
 *
 * Run via:  pnpm notify
 *
 * Note: this script ignores `app.notifications.enabled` — that flag governs
 * only the in-server watcher, not manual invocations.
 */

import * as config from '../server/config.js';
import { runOnce } from '../server/notifications/service.js';

async function main(): Promise<void> {
  config.load();
  const { failedCount } = await runOnce();
  if (failedCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('[notify] Fatal error:', err);
  process.exit(1);
});
