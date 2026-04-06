import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: ".",
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "@supabase/supabase-js"],
  },
};

export default nextConfig;
