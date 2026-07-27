/**
 * The Skin Den platform API base (studio admin + bookings when platform-api is live).
 * Call window.__kkApplyPlatformConfig() after SITE_CONFIG loads (ES modules load async).
 */
(function () {
  function apply() {
    var h = location.hostname;
    if (h === "localhost" || h === "127.0.0.1") {
      window.KK_PLATFORM_API = "http://localhost:3220";
      window.KK_ADMIN_API_BASE = "http://localhost:3220/v1/admin";
      return;
    }
    var url = (window.SITE_CONFIG && window.SITE_CONFIG.platformApiUrl) || "";
    if (!url) return;
    url = url.replace(/\/$/, "");
    window.KK_PLATFORM_API = url;
    window.KK_ADMIN_API_BASE = url + "/v1/admin";
  }

  window.__kkApplyPlatformConfig = apply;
  apply();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply);
  }
})();
