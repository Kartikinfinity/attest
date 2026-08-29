/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // apps/web/lib/engine.ts imports AUDITOR_INSTRUCTIONS from
    // agent/prompts/auditor.ts, which lives outside this app's own
    // directory (it's the single source of truth shared with the CLI
    // path in agent/agent-spec.ts). Next's webpack bundler refuses to
    // trace/bundle files outside apps/web/ unless this is enabled.
    externalDir: true,
  },
  webpack: (config, { dev }) => {
    if (dev) {
      // Disable webpack's persistent filesystem cache in dev. Running
      // the dev server from WSL against a Windows-mounted path
      // (/mnt/c/... via DrvFs) has been observed live to corrupt this
      // cache intermittently -- ENOENT on rename of
      // .next/cache/webpack/.../*.pack.gz -- which then makes a
      // previously-resolved module (e.g. the externalDir import above)
      // intermittently fail again with a stale "Module not found" on a
      // later compile, even with no source change. Disabling the cache
      // trades some rebuild speed for not hitting this at all.
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
