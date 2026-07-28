import { mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.mjs";
import { getDb } from "./db.mjs";

/**
 * Point-in-time SQLite snapshots.
 *
 * The studio's entire member list, credit balances and check-in history live in one
 * file on one Railway volume, and there was previously no copy of it anywhere. A
 * corrupted write or a mis-mounted volume meant starting the business records again
 * from nothing.
 *
 * VACUUM INTO is the supported way to snapshot a live SQLite database: it takes a
 * consistent copy without stopping writers, unlike copying the file by hand while
 * WAL frames are in flight.
 */
export function backupDir() {
  return join(config.dataDir, "backups");
}

export function runBackup() {
  const dir = backupDir();
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = join(dir, `${config.tenantSlug}-${stamp}.sqlite`);
  const database = getDb();
  // VACUUM INTO refuses to overwrite, so the timestamped name is load-bearing.
  database.prepare(`VACUUM INTO '${target.replace(/'/g, "''")}'`).run();
  prune(dir);
  return { path: target, bytes: statSync(target).size };
}

function prune(dir) {
  const keep = Math.max(1, config.backupKeep);
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sqlite"))
    .sort()
    .reverse();
  for (const stale of files.slice(keep)) {
    try {
      rmSync(join(dir, stale));
    } catch {
      /* a snapshot we cannot delete is not worth failing a backup over */
    }
  }
}

export function listBackups() {
  const dir = backupDir();
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".sqlite"))
      .sort()
      .reverse()
      .map((f) => {
        const s = statSync(join(dir, f));
        return { name: f, bytes: s.size, createdAt: s.mtime.toISOString() };
      });
  } catch {
    return [];
  }
}

let timer = null;

export function startBackupSchedule() {
  if (timer || config.backupIntervalHours <= 0) return null;
  const everyMs = config.backupIntervalHours * 3600 * 1000;
  const tick = () => {
    try {
      const r = runBackup();
      console.log(`[platform-api] backup written: ${r.path} (${r.bytes} bytes)`);
    } catch (e) {
      console.error("[platform-api] backup FAILED:", e.message);
    }
  };
  tick(); // one on boot, so a fresh deploy always has a restore point
  timer = setInterval(tick, everyMs);
  timer.unref?.();
  return timer;
}

export function stopBackupSchedule() {
  if (timer) clearInterval(timer);
  timer = null;
}
