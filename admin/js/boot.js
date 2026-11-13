/* Loads the site config, points the dashboard at the studio API, then starts the app. */
import { SITE_CONFIG } from "../../site-config.js";
window.SITE_CONFIG = SITE_CONFIG;
const h = location.hostname;
let apiUrl = (SITE_CONFIG.platformApiUrl || "").replace(/\/$/, "");
if (h === "localhost" || h === "127.0.0.1") {
  apiUrl = "http://localhost:3220";
}
if (apiUrl) {
  window.KK_PLATFORM_API = apiUrl;
  window.KK_ADMIN_API_BASE = `${apiUrl}/v1/admin`;
}
window.__kkApplyPlatformConfig?.();
import "./app.js";
