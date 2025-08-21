// Content Pipeline API utility for job and file management
// This utility provides a clean interface to interact with the content-pipeline-proxy API

// Cache clearing callback type for rerun operations
export type CacheClearingCallback = (
  sourceJobId: string, 
  newJobId: string, 
  deletedFiles?: string[]
) => void;

export interface JobData {
  job_id?: string;
  app_name: string;
  filename_prefix: string;
  source_folder: string;
  files?: string[];
  description?: string;
  job_status?:  'uploading' | 'uploaded' | 'upload-failed' | 'extracting' | 'extracted' | 'extraction-failed' | 'generating' | 'generated' | 'generation-failed' | 'completed' ;
  created_at?: string;
  last_updated?: string;
  original_files_total_count?: number;
  original_files_completed_count?: number;
  original_files_failed_count?: number;
  extracted_files_total_count?: string;
  extracted_files_completed_count?: string;
  firefly_assets_completed_count?: string;
  firefly_assets_total_count?: string;
  user_id?: string;
  user_name?: string;
  updated_by_user_id?: string;
  updated_by_user_name?: string;
  download_url?: string;
  download_url_expires?: string;
  download_url_created?: string;
  assets?: Record<string, any>; // Asset configurations with server-generated IDs
}

export interface FileData {
  filename: string;
  job_id?: string;
  last_updated?: string;
  original_files?: Record<string, {
    card_type: 'front' | 'back';
    file_path: string;
    status: 'uploading' | 'processing' | 'uploaded' | 'upload-failed' | 'extracting' | 'extracted' | 'extraction-failed';
  }>;
  extracted_files?: Record<string, {
    file_path: string;
    layer_type: string;
    status: 'uploading' | 'uploaded' | 'upload-failed';
  }>;
  firefly_assets?: Record<string, {
    file_path: string;
    color_variant?: string;
    spot_file?: string;
    source_file?: string;
    card_type?: string;
    job_url?: string;
    status: 'created' | 'succeeded' | 'failed';
  }>;
}

export interface JobResponse {
  job: JobData;
  message?: string;
}

export interface JobListResponse {
  jobs: JobData[];
  count: number;
  last_evaluated_key?: string;
  performance_metrics?: {
    scan_count: number;
    optimization_used: {
      recent_only: boolean;
      last_modified_only: boolean;
    };
  };
}

export interface BatchJobsResponse {
  jobs: JobData[];
  found_count: number;
  not_found_job_ids: string[];
  total_requested: number;
  unprocessed_count: number;
}

export interface FileResponse {
  file: FileData;
  message?: string;
}

export interface FileListResponse {
  files: FileData[];
  count: number;
  last_evaluated_key?: string;
}

export interface BatchCreateResponse {
  created_files: FileData[];
  existing_files?: FileData[];
  failed_files: Array<{
    filename: string;
    error: string;
  }>;
  created_count: number;
  failed_count: number;
  total_requested: number;
}

export interface BatchGetResponse {
  files: FileData[];
  found_count: number;
  not_found_filenames: string[];
  total_requested: number;
}

import { buildS3UploadsPath } from '../../utils/environment';

class ContentPipelineAPI {
  private baseUrl = '/api/content-pipeline-proxy';

  // Job operations
  async createJob(jobData: Omit<JobData, 'job_id' | 'created_at' | 'last_updated' | 'priority' | 'metadata' | 'job_status'> & { original_files_total_count?: number }): Promise<JobResponse> {
    // Use the exact count provided by frontend (already handles deduplication and _FR/_BK counting)
    console.log('✅ createJob: Using original_files_total_count from frontend:', jobData.original_files_total_count);
    
    const jobPayload = {
      ...jobData,
      job_status: 'uploading',
      files: jobData.files || [],
      original_files_total_count: jobData.original_files_total_count,
      original_files_completed_count: 0,
      original_files_failed_count: 0
    };

    const response = await fetch(`${this.baseUrl}?operation=create_job`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(jobPayload),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to create job: ${response.status}`);
    }

    return response.json();
  }

  async getJob(jobId: string): Promise<JobResponse> {
    const response = await fetch(`${this.baseUrl}?operation=get_job&id=${encodeURIComponent(jobId)}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to get job: ${response.status}`);
    }

    return response.json();
  }

  async updateJob(jobId: string, updates: Partial<JobData>): Promise<JobResponse> {
    const response = await fetch(`${this.baseUrl}?operation=update_job&id=${encodeURIComponent(jobId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to update job: ${response.status}`);
    }

    return response.json();
  }

  async deleteJob(jobId: string): Promise<{ success: boolean; message: string }> {
    console.log(`🗑️ Deleting job: ${jobId}`);
    
    // Use query parameter format that the proxy expects
    const response = await fetch(`${this.baseUrl}?operation=delete_job&id=${encodeURIComponent(jobId)}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json();
      console.error(`❌ Failed to delete job ${jobId}:`, error);
      throw new Error(error.error || `Failed to delete job: ${response.status}`);
    }

    const result = await response.json();
    console.log(`✅ Job ${jobId} deleted successfully:`, result);
    return result;
  }

  async listJobs(options: {
    limit?: number;
    recentOnly?: boolean;
    lastModifiedOnly?: boolean;
    exclusiveStartKey?: string;
    my_jobs?: boolean;
    user_id?: string;
    status?: string;
  } = {}): Promise<JobListResponse> {
    const params = new URLSearchParams();
    params.append('operation', 'list_jobs');
    
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.recentOnly) params.append('recent_only', 'true');
    if (options.lastModifiedOnly) params.append('last_modified_only', 'true');
    if (options.exclusiveStartKey) params.append('exclusive_start_key', options.exclusiveStartKey);
    if (options.my_jobs) params.append('my_jobs', 'true');
    if (options.user_id) params.append('user_id', options.user_id);
    if (options.status) params.append('status', options.status);

    const response = await fetch(`${this.baseUrl}?${params.toString()}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to list jobs: ${response.status}`);
    }

    return response.json();
  }

  async batchGetJobs(jobIds: string[]): Promise<BatchJobsResponse> {
    console.log(`🔄 [ContentPipelineAPI] Batch fetching ${jobIds.length} jobs:`, jobIds);
    
    const response = await fetch(`${this.baseUrl}?operation=batch_get_jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        job_ids: jobIds
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to batch get jobs: ${response.status}`);
    }

    const result = await response.json();
    console.log(`✅ [ContentPipelineAPI] Batch fetched ${result.found_count}/${result.total_requested} jobs`);
    
    return result;
  }

  // File operations
  async createFile(fileData: FileData): Promise<FileResponse> {
    const response = await fetch(`${this.baseUrl}?operation=create_file`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(fileData),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to create file: ${response.status}`);
    }

    return response.json();
  }

  async getFile(filename: string): Promise<FileResponse> {
    const response = await fetch(`${this.baseUrl}?operation=get_file&id=${encodeURIComponent(filename)}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to get file: ${response.status}`);
    }

    return response.json();
  }

  async updateFile(filename: string, updates: Partial<FileData>): Promise<FileResponse> {
    const response = await fetch(`${this.baseUrl}?operation=update_file&id=${encodeURIComponent(filename)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to update file: ${response.status}`);
    }

    return response.json();
  }

  async listFiles(options: {
    limit?: number;
    exclusiveStartKey?: string;
  } = {}): Promise<FileListResponse> {
    const params = new URLSearchParams();
    params.append('operation', 'list_files');
    
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.exclusiveStartKey) params.append('exclusive_start_key', options.exclusiveStartKey);

    const response = await fetch(`${this.baseUrl}?${params.toString()}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to list files: ${response.status}`);
    }

    return response.json();
  }

  // Batch operations
  async batchCreateFiles(files: FileData[]): Promise<BatchCreateResponse> {
    const response = await fetch(`${this.baseUrl}?operation=batch_create_files`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ files }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to batch create files: ${response.status}`);
    }

    return response.json();
  }

  async batchGetFiles(filenames: string[]): Promise<BatchGetResponse> {
    const response = await fetch(`${this.baseUrl}?operation=batch_get_files`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filenames }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to batch get files: ${response.status}`);
    }

    return response.json();
  }

  // Helper methods for common operations
  async updateJobStatus(jobId: string, status: JobData['job_status']): Promise<JobResponse> {
    const updates: Partial<JobData> = {
      job_status: status,
      last_updated: new Date().toISOString(),
    };

    return this.updateJob(jobId, updates);
  }



  // Update a specific PDF file status within original_files
  async updatePdfFileStatus(
    groupFilename: string, 
    pdfFilename: string, 
    status: 'uploading' | 'processing' | 'uploaded' | 'upload-failed'
  ): Promise<FileResponse> {
    const response = await fetch(`${this.baseUrl}?operation=update_pdf_status&id=${encodeURIComponent(groupFilename)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pdf_filename: pdfFilename,
        status: status
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to update PDF status: ${response.status}`);
    }

    return response.json();
  }

  // Update multiple PDF file statuses within original_files in a single API call
  async batchUpdatePdfFileStatus(
    groupFilename: string, 
    pdfUpdates: Array<{
      pdf_filename: string;
      status: 'uploading' | 'processing' | 'uploaded' | 'upload-failed';
    }>
  ): Promise<FileResponse> {
    const response = await fetch(`${this.baseUrl}?operation=batch_update_pdf_status&id=${encodeURIComponent(groupFilename)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pdf_updates: pdfUpdates
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to batch update PDF status: ${response.status}`);
    }

    return response.json();
  }

  // Get recent jobs for dashboard
  async getRecentJobs(limit: number = 10): Promise<JobListResponse> {
    return this.listJobs({
      limit,
      recentOnly: true,
      lastModifiedOnly: true,
    });
  }

  // Re-run a job with new parameters - uses same payload structure as createJob
  async rerunJob(
    jobId: string, 
    jobData: Omit<JobData, 'job_id' | 'created_at' | 'last_updated' | 'job_status'> & { original_files_total_count?: number },
    onCacheClear?: CacheClearingCallback
  ): Promise<JobResponse> {
    // Use the exact count provided by frontend (already handles deduplication and _FR/_BK counting)
    console.log('✅ rerunJob: Using original_files_total_count from frontend:', jobData.original_files_total_count);
    
    const jobPayload = {
      ...jobData,
      job_status: 'uploading',
      files: jobData.files || [],
      original_files_total_count: jobData.original_files_total_count,
      original_files_completed_count: 0,
      original_files_failed_count: 0,
      // Rerun flag only (omit rerun_job_id per updated policy)
      operation: 'rerun'
    };

    const response = await fetch(`${this.baseUrl}?operation=rerun_job&id=${encodeURIComponent(jobId)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(jobPayload),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to rerun job: ${response.status}`);
    }

    const result = await response.json();
    
    // Clear relevant caches after successful rerun
    if (onCacheClear && result.job?.job_id) {
      console.log('🔄 Clearing caches after successful job rerun');
      
      // Extract deleted files from the response for specific cache clearing
      const deletedFiles = result.file_deletion_details?.deleted_files || [];
      console.log('📁 Files deleted during rerun:', deletedFiles);
      
      onCacheClear(jobId, result.job.job_id, deletedFiles);
    }

    return result;
  }

  // Generate assets for a job
  async generateAssets(
    jobId: string,
    payload: {
      assets: Array<{
        type: 'wp' | 'back' | 'base' | 'parallel' | 'multi-parallel';
        layer: string;
        spot?: string;
        color?: { id: number; name: string };
        spot_color_pairs?: Array<{
          spot: string;
          color?: { id: number; name: string };
        }>;
        vfx?: string;
        chrome: boolean;
      }>;
      psd_file: string;
    }
  ): Promise<any> {
    const response = await fetch(`${this.baseUrl}?operation=generate_assets&id=${encodeURIComponent(jobId)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to generate assets: ${response.status}`);
    }

    return response.json();
  }

  // Download completed job output files from S3
  async downloadJobOutputFolder(jobId: string): Promise<{
    success: boolean;
    message: string;
    data?: {
      download_url: string;
      expires_in: number;
      zip_key: string;
      source_folder: string;
      files_count: number;
    };
  }> {
    const folder = buildS3UploadsPath(`Output/${jobId}`);
    
    const response = await fetch(`${this.baseUrl}?operation=s3_download_folder`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        folder: folder
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to download job output folder: ${response.status}`);
    }

    return response.json();
  }

  // Generate and save download URL to job object
  async updateDownloadUrl(jobId: string): Promise<{
    success: boolean;
    message: string;
    download_url?: string;
    download_url_expires?: string;
  }> {
    console.log(`🔄 Manually triggering download URL update for job: ${jobId}`);
    
    const response = await fetch(`${this.baseUrl}?operation=update_download_url&id=${encodeURIComponent(jobId)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log(`📥 Update download URL response status: ${response.status}`);

    if (!response.ok) {
      const error = await response.json();
      console.error(`❌ Update download URL failed:`, error);
      throw new Error(error.error || `Failed to update download URL: ${response.status}`);
    }

    const result = await response.json();
    console.log(`✅ Update download URL result:`, result);
    return result;
  }

  // Regenerate assets for a job
  async regenerateAssets(jobId: string): Promise<{
    success: boolean;
    message: string;
    job?: JobData;
  }> {
    console.log(`🔄 Triggering asset regeneration for job: ${jobId}`);
    
    const response = await fetch(`${this.baseUrl}?operation=regenerate_assets&id=${encodeURIComponent(jobId)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log(`📥 Regenerate assets response status: ${response.status}`);
    console.log(`📥 Response headers:`, Object.fromEntries(response.headers.entries()));

    // Get response text to handle both JSON and non-JSON responses
    const responseText = await response.text();
    console.log(`📥 Response body:`, responseText);

    if (!response.ok) {
      let errorMessage = `Failed to regenerate assets: ${response.status} ${response.statusText}`;
      
      try {
        if (responseText.trim()) {
          const error = JSON.parse(responseText);
          errorMessage = error.error || error.message || errorMessage;
        }
      } catch (parseError) {
        console.warn('Failed to parse error response as JSON:', parseError);
        errorMessage = responseText || errorMessage;
      }
      
      console.error(`❌ Regenerate assets failed:`, errorMessage);
      throw new Error(errorMessage);
    }

    // Parse successful response
    try {
      if (!responseText.trim()) {
        console.warn('⚠️ Empty response body, assuming success');
        return {
          success: true,
          message: 'Assets regeneration completed'
        };
      }

      const result = JSON.parse(responseText);
      console.log(`✅ Regenerate assets result:`, result);
      return result;
    } catch (parseError) {
      console.error('❌ Failed to parse successful response:', parseError);
      console.log('Raw response:', responseText);
      throw new Error(`Invalid JSON response: ${parseError instanceof Error ? parseError.message : 'Unknown parsing error'}`);
    }
  }

  // Asset management operations
  // New assets API contract
  async getAssets(jobId: string): Promise<{ assets: Record<string, any>; job_id: string; error?: string }> {
    const response = await fetch(`${this.baseUrl}?operation=list_assets&id=${encodeURIComponent(jobId)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (!response.ok) {
      try {
        const errorData = await response.json();
        
        // Handle 404 "No assets found" as a successful response with empty assets
        if (response.status === 404 && errorData.error && errorData.error.includes('No assets found')) {
          console.log(`ℹ️ [ContentPipelineAPI] Job ${jobId} has no assets - returning empty assets object`);
          return {
            assets: {},
            job_id: jobId,
            error: errorData.error
          };
        }
        
        // For other errors, still throw
        throw new Error(errorData.error || `Failed to fetch assets: ${response.status}`);
      } catch (parseError) {
        // If we can't parse the error response, throw a generic error
        throw new Error(`Failed to fetch assets: ${response.status}`);
      }
    }
    
    return await response.json();
  }

  async createAsset(jobId: string, assetConfig: any): Promise<{ assets: Record<string, any>; job_id: string }> {
    console.log(`🎨 Creating asset for job: ${jobId}`, assetConfig);
    const response = await fetch(`${this.baseUrl}?operation=create_asset&id=${encodeURIComponent(jobId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(assetConfig),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to create asset: ${response.status}`);
    }
    return await response.json();
  }

  async updateAsset(jobId: string, assetId: string, assetConfig: any): Promise<{ assets: Record<string, any>; job_id: string }> {
    console.log(`🔄 Updating asset ${assetId} for job: ${jobId}`, assetConfig);
    const response = await fetch(`${this.baseUrl}?operation=update_asset&id=${encodeURIComponent(jobId)}&asset_id=${encodeURIComponent(assetId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(assetConfig),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to update asset: ${response.status}`);
    }
    return await response.json();
  }

  async deleteAsset(jobId: string, assetId: string): Promise<{ assets: Record<string, any>; job_id: string }> {
    const requestUrl = `${this.baseUrl}?operation=delete_asset&id=${encodeURIComponent(jobId)}&asset_id=${encodeURIComponent(assetId)}`;
    
    console.log(`🗑️ Deleting asset ${assetId} for job: ${jobId}`);
    console.log(`📤 DELETE request URL: ${requestUrl}`);
    console.log(`📤 DELETE request headers:`, { 'Content-Type': 'application/json' });
    
    try {
      const response = await fetch(requestUrl, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      console.log(`📥 DELETE response status: ${response.status}`);
      console.log(`📥 DELETE response headers:`, Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        console.error(`❌ DELETE request failed with status: ${response.status}`);
        const errorText = await response.text();
        console.error(`❌ DELETE error response:`, errorText);
        
        let error;
        try {
          error = JSON.parse(errorText);
        } catch {
          error = { error: errorText, message: `HTTP ${response.status}` };
        }
        throw new Error(error.error || error.message || `Failed to delete asset: ${response.status}`);
      }

      const result = await response.json();
      console.log(`✅ Asset deleted:`, result);
      return result;
    } catch (fetchError) {
      console.error(`❌ DELETE request failed:`, fetchError);
      throw fetchError;
    }
  }

  async deleteAllAssets(jobId: string): Promise<{
    success: boolean;
    message: string;
    assets?: Record<string, any>;
    [key: string]: any;
  }> {
    console.log(`🗑️ Deleting all assets for job: ${jobId}`);
    
    try {
      const response = await fetch(`${this.baseUrl}?operation=delete_all_assets&id=${encodeURIComponent(jobId)}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        console.error(`❌ DELETE all assets failed:`, {
          status: response.status,
          statusText: response.statusText,
          error: error
        });
        
        if (response.status === 404) {
          throw new Error(`Job ${jobId} not found`);
        }
        throw new Error(error.error || error.message || `Failed to delete all assets: ${response.status}`);
      }

      const result = await response.json();
      console.log(`✅ All assets deleted:`, result);
      return result;
    } catch (fetchError) {
      console.error(`❌ DELETE all assets request failed:`, fetchError);
      throw fetchError;
    }
  }

  async bulkUpdateAssets(jobId: string, assets: any[]): Promise<{
    success: boolean;
    message: string;
    updated_count?: number;
    job?: JobData;
    assets?: Record<string, any>;
    result?: {
      complete_assets?: {
        assets?: Record<string, any>;
        [key: string]: any;
      };
      assets_record?: {
        assets?: Record<string, any>;
        [key: string]: any;
      };
      [key: string]: any;
    };
    [key: string]: any;
  }> {
    console.log(`📦 Bulk updating ${assets.length} assets for job: ${jobId}`, assets);
    
    const response = await fetch(`${this.baseUrl}?operation=bulk_update_assets&id=${encodeURIComponent(jobId)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ assets }),  // Pass assets as-is in the expected structure
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to bulk update assets: ${response.status}`);
    }

    const result = await response.json();
    console.log(`✅ Bulk asset update completed:`, result);
    return result;
  }

  async extractPdfData(pdfData: { pdf_data?: string; s3_key?: string; filename: string; layers?: string[]; job_id?: string }): Promise<any> {
    const dataSource = pdfData.s3_key ? 'S3 key' : 'base64 data';
    const dataValue = pdfData.s3_key || (pdfData.pdf_data ? `${pdfData.pdf_data.length} chars` : 'none');
    
    console.log(`📋 Extracting PDF data for: ${pdfData.filename} using ${dataSource}: ${dataValue}`, pdfData.layers ? `with ${pdfData.layers.length} layers` : 'without layers', pdfData.job_id ? `for job: ${pdfData.job_id}` : 'without job ID');
    
    const response = await fetch(`${this.baseUrl}?operation=pdf-extract`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(pdfData),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to extract PDF data: ${response.status}`);
    }

    const result = await response.json();
    console.log(`✅ PDF data extracted:`, result);
    return result;
  }
}

// Export a singleton instance
export const contentPipelineApi = new ContentPipelineAPI();
export default contentPipelineApi; 