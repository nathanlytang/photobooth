import fs from 'fs';
import path from 'path';
import type { RetryQueue } from './types.js';

export function resolveRetryQueuePath(retryQueuePath: string, repoRoot: string): string {
  return path.isAbsolute(retryQueuePath)
    ? retryQueuePath
    : path.resolve(repoRoot, retryQueuePath);
}

export function loadRetryQueue(retryQueuePath: string, repoRoot: string): RetryQueue {
  const p = resolveRetryQueuePath(retryQueuePath, repoRoot);
  if (!fs.existsSync(p)) {
    return { updatedAt: new Date().toISOString(), entries: [] };
  }
  try {
    const raw = fs.readFileSync(p, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.entries)) {
      return { updatedAt: new Date().toISOString(), entries: [] };
    }
    return parsed as RetryQueue;
  } catch (err) {
    console.warn(`[notify] Could not read retry queue: ${(err as Error).message}`);
    return { updatedAt: new Date().toISOString(), entries: [] };
  }
}

export function writeRetryQueue(
  retryQueuePath: string,
  repoRoot: string,
  queue: RetryQueue
): void {
  const p = resolveRetryQueuePath(retryQueuePath, repoRoot);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(queue, null, 2), 'utf-8');
  fs.renameSync(tmp, p);
}
