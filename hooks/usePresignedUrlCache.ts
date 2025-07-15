import { useState, useEffect, useRef } from 'react';

interface CachedUrl {
  url: string;
  expiresAt: number;
  timestamp: number;
}

interface UrlCacheState {
  [filePath: string]: CachedUrl;
}

// Global cache to persist across component instances
const globalUrlCache: UrlCacheState = {};
const CACHE_DURATION = 45 * 60 * 1000; // 45 minutes (presigned URLs typically expire in 1 hour)

export function usePresignedUrlCache() {
  const [cache, setCache] = useState<UrlCacheState>(globalUrlCache);
  const cleanupIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup expired URLs periodically
  useEffect(() => {
    const cleanup = () => {
      const now = Date.now();
      const keysToDelete: string[] = [];
      
      for (const [filePath, cachedUrl] of Object.entries(globalUrlCache)) {
        if (now > cachedUrl.expiresAt) {
          keysToDelete.push(filePath);
        }
      }
      
      if (keysToDelete.length > 0) {
        console.log(`🧹 Cleaning up ${keysToDelete.length} expired presigned URLs`);
        keysToDelete.forEach(key => delete globalUrlCache[key]);
        setCache({ ...globalUrlCache });
      }
    };

    // Run cleanup every 5 minutes
    cleanupIntervalRef.current = setInterval(cleanup, 5 * 60 * 1000);
    
    return () => {
      if (cleanupIntervalRef.current) {
        clearInterval(cleanupIntervalRef.current);
      }
    };
  }, []);

  const getUrl = async (filePath: string): Promise<string | null> => {
    const now = Date.now();
    
    // Check if we have a cached, non-expired URL
    const cached = globalUrlCache[filePath];
    if (cached && now < cached.expiresAt) {
      console.log('✅ Using cached presigned URL for:', filePath);
      return cached.url;
    }

    try {
      console.log('🔗 Fetching new presigned URL for:', filePath);
      
      const response = await fetch('/api/s3-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          client_method: 'get',
          filename: filePath
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`${response.status} ${response.statusText}: ${errorText}`);
      }

      const data = await response.json();
      
      if (data.url) {
        // Cache the URL with expiration
        const cachedUrl: CachedUrl = {
          url: data.url,
          expiresAt: now + CACHE_DURATION,
          timestamp: now
        };
        
        globalUrlCache[filePath] = cachedUrl;
        setCache({ ...globalUrlCache });
        
        console.log('✅ Cached new presigned URL for:', filePath);
        return data.url;
      } else {
        throw new Error('No URL in response');
      }
      
    } catch (error) {
      console.error(`❌ Failed to get presigned URL for ${filePath}:`, error);
      return null;
    }
  };

  const getCachedUrl = (filePath: string): string | null => {
    const cached = globalUrlCache[filePath];
    if (cached && Date.now() < cached.expiresAt) {
      return cached.url;
    }
    return null;
  };

  const clearCache = () => {
    console.log('🧹 Clearing all presigned URL cache');
    Object.keys(globalUrlCache).forEach(key => delete globalUrlCache[key]);
    setCache({});
  };

  const getCacheStats = () => {
    const now = Date.now();
    const total = Object.keys(globalUrlCache).length;
    const expired = Object.values(globalUrlCache).filter(cached => now > cached.expiresAt).length;
    const active = total - expired;
    
    return { total, active, expired };
  };

  return {
    getUrl,
    getCachedUrl,
    clearCache,
    getCacheStats,
    cache
  };
} 