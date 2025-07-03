// Content Pipeline API utility for job and file management
// This utility provides a clean interface to interact with the content-pipeline-proxy API

export interface JobData {
  job_id?: string;
  app_name: string;
  release_name: string;
  source_folder: string;
  files?: string[];
  description?: string;
  priority?: 'low' | 'medium' | 'high';
  job_status?: string;
  progress_percentage?: number;
  current_step?: string;
  metadata?: Record<string, any>;
  created_at?: string;
  last_updated?: string;
}

export interface FileData {
  filename: string;
  file_type?: string;
  size_bytes?: number;
  source_path?: string;
  extracted?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  status?: string;
  processing_time_ms?: number;
  metadata?: Record<string, any>;
  extracted_layers?: Record<string, any>;
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
    const jobPayload = {
      ...jobData,
      job_status: 'Upload in progress',
      files: jobData.files || []
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
    if (files.length > 25) {
      throw new Error('Maximum 25 files per batch create request');
    }

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
  async updateJobStatus(jobId: string, status: string, progressPercentage?: number, currentStep?: string): Promise<JobResponse> {
    const updates: Partial<JobData> = {
      job_status: status,
      last_updated: new Date().toISOString(),
    };

    if (progressPercentage !== undefined) {
      updates.progress_percentage = progressPercentage;
    }

    if (currentStep) {
      updates.current_step = currentStep;
    }

    return this.updateJob(jobId, updates);
  }

  async updateFileStatus(filename: string, extracted: FileData['extracted'], status?: string): Promise<FileResponse> {
    const updates: Partial<FileData> = {
      extracted,
    };

    if (status) {
      updates.status = status;
    }

    return this.updateFile(filename, updates);
  }

  // Get recent jobs for dashboard
  async getRecentJobs(limit: number = 10): Promise<JobListResponse> {
    return this.listJobs({
      limit,
      recentOnly: true,
      lastModifiedOnly: true,
    });
  }
}

// Export a singleton instance
export const contentPipelineApi = new ContentPipelineAPI();
export default contentPipelineApi; 