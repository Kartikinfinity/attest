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
};

export default nextConfig;
