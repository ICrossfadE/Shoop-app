import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Invitation pages never leak their context through HTTP caches, referrers or crawlers.
  async headers() {
    return [{source:'/invite/:path*',headers:[
      {key:'Cache-Control',value:'private, no-store'},
      {key:'Referrer-Policy',value:'no-referrer'},
      {key:'X-Robots-Tag',value:'noindex, nofollow'},
    ]}];
  },
};

export default nextConfig;
