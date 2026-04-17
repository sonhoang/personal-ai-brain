import fs from "fs";
import path from "path";

/**
 * One running server per DATA_DIR on this machine (single-device model).
 * Prevents two Node processes from corrupting the same SQLite + uploads folder.
 * Set BRAIN_SKIP_LOCK=1 to bypass (e.g. stale lock after crash on some OSes).
 */
export function acquireServerLock(dataDir: string): { release: () => void } {
  if (process.env.BRAIN_SKIP_LOCK === "1") {
    return { release: () => {} };
  }

  fs.mkdirSync(dataDir, { recursive: true });
  const lockPath = path.join(dataDir, ".brain-server.lock");

  if (fs.existsSync(lockPath)) {
    let oldPid: number | null = null;
    try {
      const j = JSON.parse(fs.readFileSync(lockPath, "utf8")) as { pid?: number };
      if (typeof j.pid === "number" && Number.isInteger(j.pid)) oldPid = j.pid;
    } catch {
      /* treat as stale */
    }

    if (oldPid !== null) {
      let alive = false;
      try {
        process.kill(oldPid, 0);
        alive = true;
      } catch (e) {
        const err = e as NodeJS.ErrnoException;
        if (err.code === "EPERM") alive = true;
      }
      if (alive) {
        throw new Error(
          `Another server is already using this data directory:\n  ${dataDir}\n` +
            `Stop that process (PID ${oldPid}) or delete the lock file if it exited uncleanly:\n  ${lockPath}\n` +
            `Override (not recommended): BRAIN_SKIP_LOCK=1`
        );
      }
    }
    try {
      fs.unlinkSync(lockPath);
    } catch {
      /* may race; wx below will fail */
    }
  }

  const payload =
    JSON.stringify({
      pid: process.pid,
      startedAt: new Date().toISOString()
    }) + "\n";

  try {
    fs.writeFileSync(lockPath, payload, { flag: "wx" });
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "EEXIST") {
      throw new Error(
        `Could not acquire data lock (another server may have started). Retry or set BRAIN_SKIP_LOCK=1 if stuck.\n${lockPath}`
      );
    }
    throw e;
  }

  const release = (): void => {
    try {
      if (fs.existsSync(lockPath)) {
        const raw = fs.readFileSync(lockPath, "utf8");
        try {
          const j = JSON.parse(raw) as { pid?: number };
          if (j.pid === process.pid) fs.unlinkSync(lockPath);
        } catch {
          fs.unlinkSync(lockPath);
        }
      }
    } catch {
      /* ignore */
    }
  };

  const onExit = (): void => {
    release();
  };
  process.once("exit", onExit);
  process.once("SIGINT", () => {
    release();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    release();
    process.exit(143);
  });

  return { release };
}
