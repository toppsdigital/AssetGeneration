// Content Pipeline API utility for job and file management
// This utility provides a clean interface to interact with the content-pipeline-proxy API

export interface JobData {
  job_id?: string;
  app_name: string;
  release_name: string;
  subset_name: string;
  source_folder: string;
  files?: string[];
  description?: string;
  job_status?:  'uploading' | 'uploaded' | 'upload-failed' | 'extracting' | 'extracted' | 'extraction-failed' | 'generating' | 'generated' | 'generation-failed' | 'completed' ;
  created_at?: string;
  last_updated?: string;
  original_files_total_count?: number;
  original_files_completed_count?: number;
  original_files_failed_count?: number;
}

export interface FileData {
  filename: string;
  job_id?: string;
  last_updated?: string;
  original_files?: Record<string, {
    card_type: 'front' | 'back';
    file_path: string;
    status: 'uploading' | 'uploaded' | 'upload-failed' | 'extracting' | 'extracted' | 'extraction-failed';
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

class ContentPipelineAPI {
  private baseUrl = '/api/content-pipeline-proxy';

  // Job operations
  async createJob(jobData: Omit<JobData, 'job_id' | 'created_at' | 'last_updated' | 'priority' | 'metadata' | 'job_status'>): Promise<JobResponse> {
    // Calculate total PDF files based on grouped filenames
    // Each grouped filename represents 2 PDF files (front and back)
    const totalPdfFiles = (jobData.files || []).length * 2;
    
    const jobPayload = {
      ...jobData,
      job_status: 'uploading',
      files: jobData.files || [],
      original_files_total_count: totalPdfFiles,
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

  async listJobs(options: {
    limit?: number;
    recentOnly?: boolean;
    lastModifiedOnly?: boolean;
    exclusiveStartKey?: string;
  } = {}): Promise<JobListResponse> {
    const params = new URLSearchParams();
    params.append('operation', 'list_jobs');
    
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.recentOnly) params.append('recent_only', 'true');
    if (options.lastModifiedOnly) params.append('last_modified_only', 'true');
    if (options.exclusiveStartKey) params.append('exclusive_start_key', options.exclusiveStartKey);

    const response = await fetch(`${this.baseUrl}?${params.toString()}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to list jobs: ${response.status}`);
    }

    return response.json();
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
    if (filenames.length > 100) {
      throw new Error('Maximum 100 filenames per batch get request');
    }

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
    status: 'uploading' | 'uploaded' | 'upload-failed'
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
      status: 'uploading' | 'uploaded' | 'upload-failed';
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

  // Generate assets for a job
  async generateAssets(
    jobId: string,
    payload: {
      colors: Array<{ id: number; name: string }>;
      layers: string[];
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
    const folder = `asset_generator/dev/uploads/Output/${jobId}`;
    
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
}

// Export a singleton instance
export const contentPipelineApi = new ContentPipelineAPI();
export default contentPipelineApi; 