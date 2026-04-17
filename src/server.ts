import "dotenv/config";
import app from "./app";
import { config } from "./config";
import { acquireServerLock } from "./utils/serverLock";

try {
  acquireServerLock(config.dataDir);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}

app.listen(config.port, () => {
  console.log(`API  http://127.0.0.1:${config.port}  (health + /api/*)`);
  console.log(`UI   npm run dev → Vite http://127.0.0.1:5173 (proxies /api here)`);
  console.log(`Prod npm run build && npm start → React app from web/dist on same port`);
});
