import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/dashboard/admin',
        destination: '/',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
