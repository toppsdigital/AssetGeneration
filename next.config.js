/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  
  // Ensure UTIF library is properly bundled for client-side usage
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // Don't bundle UTIF on server side since it's only used in browser
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
      };
    }
    
    return config;
  },
  
  // Ensure proper handling of ES modules
  experimental: {
    esmExternals: 'loose',
  },
  
  // Optimize for Vercel deployment
  compress: true,
  poweredByHeader: false,
  
  // Handle UTIF library properly
  transpilePackages: ['utif'],
};

module.exports = nextConfig; 