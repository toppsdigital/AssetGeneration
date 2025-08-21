// Environment configuration utility
// Centralized management of environment-specific settings

export interface EnvironmentConfig {
  s3Environment: string;
  s3BaseUrl: string;
  contentPipelineApiUrl: string;
  isProduction: boolean;
  isDevelopment: boolean;
  isQA: boolean;
}

/**
 * Get the current S3 environment (dev/qa/prod)
 * Priority: S3_ENVIRONMENT env var > NODE_ENV-based logic > 'dev' fallback
 */
export function getS3Environment(): string {
  // Server-side environment variable
  if (typeof window === 'undefined') {
    return process.env.S3_ENVIRONMENT || 
           (process.env.NODE_ENV === 'production' ? 'prod' : 'dev');
  }
  
  // Client-side environment variable
  return process.env.NEXT_PUBLIC_S3_ENVIRONMENT || 'dev';
}

/**
 * Get the S3 base URL for public assets
 */
export function getS3BaseUrl(): string {
  // Server-side
  if (typeof window === 'undefined') {
    return process.env.S3_BASE_URL || 'https://topps-nexus-powertools.s3.us-east-1.amazonaws.com';
  }
  
  // Client-side
  return process.env.NEXT_PUBLIC_S3_BASE_URL || 'https://topps-nexus-powertools.s3.us-east-1.amazonaws.com';
}

/**
 * Get environment configuration object
 */
export function getEnvironmentConfig(): EnvironmentConfig {
  const s3Environment = getS3Environment();
  const s3BaseUrl = getS3BaseUrl();
  
  return {
    s3Environment,
    s3BaseUrl,
    contentPipelineApiUrl: process.env.CONTENT_PIPELINE_API_URL || '',
    isProduction: s3Environment === 'prod',
    isDevelopment: s3Environment === 'dev',
    isQA: s3Environment === 'qa'
  };
}

/**
 * Build S3 URL for uploads folder
 * Example: asset_generator/dev/uploads/Output/job123
 */
export function buildS3UploadsPath(path: string): string {
  const s3Environment = getS3Environment();
  return `asset_generator/${s3Environment}/uploads/${path}`;
}

/**
 * Build S3 URL for public assets folder  
 * Example: https://topps-nexus-powertools.s3.us-east-1.amazonaws.com/asset_generator/dev/public/psd_files.json
 */
export function buildS3PublicUrl(path: string): string {
  const s3Environment = getS3Environment();
  const s3BaseUrl = getS3BaseUrl();
  return `${s3BaseUrl}/asset_generator/${s3Environment}/public/${path}`;
}

/**
 * Build S3 URL for public assets folder with full path
 * Example: https://topps-nexus-powertools.s3.us-east-1.amazonaws.com/asset_generator/dev/public/psdfile/assets/
 */
export function buildS3PublicAssetsUrl(psdFileName: string): string {
  return buildS3PublicUrl(`${psdFileName}/assets/`);
}

/**
 * Check if a file path contains uploads directory (for upload validation)
 */
export function isInUploadsDirectory(filePath: string): boolean {
  const s3Environment = getS3Environment();
  return filePath.includes(`asset_generator/${s3Environment}/uploads`);
}

/**
 * Log current environment configuration (for debugging)
 */
export function logEnvironmentConfig(): void {
  const config = getEnvironmentConfig();
  console.log('🔧 Environment Configuration:', {
    s3Environment: config.s3Environment,
    s3BaseUrl: config.s3BaseUrl,
    contentPipelineApiUrl: config.contentPipelineApiUrl,
    isProduction: config.isProduction,
    isDevelopment: config.isDevelopment,
    isQA: config.isQA,
    nodeEnv: process.env.NODE_ENV
  });
}

// Export default config for convenience
export const envConfig = getEnvironmentConfig();
