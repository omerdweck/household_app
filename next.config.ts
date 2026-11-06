import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // An imported month is a few hundred rows; the default 1 MB is too tight
      // for a full year from a bank export.
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
