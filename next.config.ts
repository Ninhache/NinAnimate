/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Shiki, shiki-magic-move and mp4-muxer are ESM-only. Let Next compile them
  // so the static export worker (`output: "export"`) can load them without
  // intermittently throwing "e[o] is not a function" while prerendering pages
  // (the failure is a flaky export-worker race on ESM chunks).
  transpilePackages: [
    "shiki",
    "shiki-magic-move",
    "@shikijs/core",
    "@shikijs/engine-javascript",
    "@shikijs/themes",
    "@shikijs/langs",
    "@shikijs/magic-move",
    "@shikijs/types",
    "@shikijs/vscode-textmate",
    "mp4-muxer",
  ],
};

module.exports = nextConfig;
