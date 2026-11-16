/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keeps `next build` inside small CI sandboxes (the default worker pool
  // spawns one process per core and gets OOM-killed).
  experimental: {
    cpus: 1,
    workerThreads: false,
    webpackBuildWorker: false,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "ecejkevdfpzfvwfjjqwc.supabase.co" },
      // Google profile pictures. Google serves these from lh3–lh6 depending on
      // the account and region, so all four are listed — pinning only lh3
      // would break the avatar for a subset of users.
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "lh4.googleusercontent.com" },
      { protocol: "https", hostname: "lh5.googleusercontent.com" },
      { protocol: "https", hostname: "lh6.googleusercontent.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
};

export default nextConfig;
