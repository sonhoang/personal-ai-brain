import path from "path";
import chokidar from "chokidar";
import { config } from "../../config";
import * as docs from "../documents/documents.service";

const WATCH_EXTS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".text",
  ".pdf",
  ".docx",
  ".html",
  ".htm",
  ".rtf"
]);

/**
 * Auto-import new files under configured dirs (`BRAIN_WATCH_DIRS`).
 * Only `add` is handled so editors saving in place do not create duplicate documents.
 */
export function startLibraryWatchers(): void {
  if (config.watchDirs.length === 0) return;
  for (const dir of config.watchDirs) {
    const w = chokidar.watch(dir, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 600, pollInterval: 100 },
      depth: 99,
      persistent: true
    });
    w.on("add", filePath => {
      const ext = path.extname(filePath).toLowerCase();
      if (!WATCH_EXTS.has(ext)) return;
      void docs.ingestWatchedFile(filePath, config.watchWorkspaceId).then(
        row => {
          if (row) {
            console.log(
              JSON.stringify({
                watchIngest: "ok",
                id: row.id,
                name: row.original_name,
                path: filePath
              })
            );
          }
        },
        err => {
          console.error(
            JSON.stringify({
              watchIngest: "error",
              path: filePath,
              message: err instanceof Error ? err.message : String(err)
            })
          );
        }
      );
    });
  }
  console.log(
    JSON.stringify({
      libraryWatchersStarted: config.watchDirs.length,
      dirs: config.watchDirs,
      workspace: config.watchWorkspaceId
    })
  );
}
