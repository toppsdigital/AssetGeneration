import { JobData, FileData } from '../web/utils/contentPipelineApi';

/**
 * Extended JobData interface with UI-specific properties
 * Used throughout the application for job data management
 */
export interface UIJobData extends JobData {
  psd_file?: string;
  template?: string;
  total_files?: number;
  timestamp?: string;
  Subset_name?: string;
  job_path?: string;
  api_files?: string[];
  content_pipeline_files?: FileData[];
}
