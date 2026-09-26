import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

export default defineCloudflareConfig({
  // Build-time pages use static assets; dynamic pages do not use ISR or a data cache.
  incrementalCache: staticAssetsIncrementalCache,
  enableCacheInterception: true,
});
