/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // Image optimization configuration for S3 presigned URLs
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.s3.*.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: '*.s3.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: 's3.*.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: 's3.amazonaws.com',
      }
    ],
  },
  
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
  
  // Optimize for Vercel deployment
  compress: true,
  poweredByHeader: false,
  
  // Handle UTIF library properly
  transpilePackages: ['utif'],
};

module.exports = nextConfig; 