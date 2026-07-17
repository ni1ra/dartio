import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@neondatabase/auth"],
  turbopack: { root: process.cwd() },
};

export default config;
