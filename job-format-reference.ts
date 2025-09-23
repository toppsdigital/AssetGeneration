/**
 * JOB FORMAT REFERENCE
 * 
 * This file serves as the comprehensive reference for job JSON structure,
 * including all possible enum values, field descriptions, and examples.
 */

// ============================================================================
// TYPE DEFINITIONS & ENUMS
// ============================================================================

/**
 * Main job status progression enum
 * Represents the overall status of the entire job
 */
export type JobStatus = 
  | "Upload in progress"           // Job creation initiated, files being uploaded
  | "Upload completed"         // All files successfully uploaded to S3
  | "Upload failed"           // One or more file uploads failed
  | "Extraction in progress"      // PDF extraction process has begun
  | "Extraction completed"    // All PDFs have been successfully extracted
  | "Extraction failed"       // One or more PDF extractions failed
  | "Digital Assets in progress"  // Digital asset generation has begun
  | "Digital Assets completed" // All digital assets have been generated
  | "Digital Assets failed";   // One or more digital asset generations failed

/**
 * Individual file process status
 * Tracks the status of specific operations on individual files
 */
export type ProcessStatus = 
  | "PENDING"  // Operation not yet started
  | "DONE"     // Operation completed successfully
  | "FAILED";  // Operation failed

/**
 * Card type classification
 * Identifies whether a PDF represents front or back of a card
 */
export type CardType = "front" | "back";

/**
 * Supported app names
 * All available apps in the system
 */
export type AppName = 
  | "BASEBALL" 
  | "DISNEY" 
  | "MARVEL" 
  | "WWE" 
  | "STARWARS" 
  | "BASKETBALL" 
  | "HUDDLE";

// ============================================================================
// INTERFACE DEFINITIONS
// ============================================================================

/**
 * Individual PDF file within a card group
 */
interface OriginalFile {
  filename: string;      // Full filename including extension (e.g., "25XMEN_1087_FR.pdf")
  card_type: CardType;   // Whether this is front or back of the card
  file_path: string;     // Full S3 path to the file (e.g., "MARVEL/PDFs/25XMEN_1087_FR.pdf")
  uploaded: ProcessStatus;    // Status of file upload process
}

/**
 * Individual file tracking entry
 * Represents a logical card that may consist of multiple PDF files
 */
interface JobFile {
  filename: string;           // Base filename without extension (e.g., "25XMEN_1087")
  uploaded: ProcessStatus;    // Status of file upload process
  extracted: ProcessStatus;   // Status of PDF extraction process
  digital_assets: ProcessStatus; // Status of digital asset generation
  last_updated: string;       // ISO 8601 timestamp of last status change
  original_files: OriginalFile[]; // Array of actual PDF files for this card, Front and back PDFs are captured under the same file name based on the prefix
}

/**
 * Main job tracking interface
 * Complete job record with all metadata and file tracking
 */
interface JobTracking {
  job_id: string;           // Unique job identifier (e.g., "job_1735567890123_k7x9m2p4q")
  created_at: string;       // ISO 8601 timestamp when job was created
  last_updated: string;     // ISO 8601 timestamp of last job update
  app_name: AppName;        // Target app for this job
  release_name: string;     // Release/series name (e.g., "2024-X-Men-Series")
  Subset_name: string;      // Subset within the release (e.g., "Base-Cards")
  job_status: JobStatus;    // Current overall job status
  files: JobFile[];         // Array of files being processed
  job_path: string;         // S3 path where this job JSON is stored
  source_folder: string;    // S3 path where the PDF files are located
  total_files: number;      // Total number of logical cards in this job
}

// ============================================================================
// EXAMPLE JOBS IN DIFFERENT STATES
// ============================================================================

/**
 * EXAMPLE 1: Job just created with files uploaded
 * Status: Upload completed, ready for extraction
 */
export const exampleJobUploadCompleted: JobTracking = {
  job_id: "job_1735567890123_k7x9m2p4q",
  created_at: "2024-12-30T14:45:30.123Z",
  last_updated: "2024-12-30T14:45:30.123Z",
  app_name: "MARVEL",
  release_name: "2024-X-Men-Series",
  Subset_name: "Base-Cards",
  job_status: "Upload completed",
  files: [
    {
      filename: "25XMEN_1087",
      uploaded: "DONE",        // Upload completed for this job
      extracted: "PENDING",
      digital_assets: "PENDING",
      last_updated: "2024-12-30T14:45:30.123Z",
      original_files: [
        {
          filename: "25XMEN_1087_FR.pdf",
          card_type: "front",
          file_path: "MARVEL/PDFs/25XMEN_1087_FR.pdf",
          uploaded: "DONE"
        },
        {
          filename: "25XMEN_1087_BK.pdf",
          card_type: "back",
          file_path: "MARVEL/PDFs/25XMEN_1087_BK.pdf",
          uploaded: "DONE"
        }
      ]
    },
    {
      filename: "25XMEN_1088",
      uploaded: "DONE",        // Upload completed for this job
      extracted: "PENDING",
      digital_assets: "PENDING",
      last_updated: "2024-12-30T14:45:30.123Z",
      original_files: [
        {
          filename: "25XMEN_1088_FR.pdf",
          card_type: "front",
          file_path: "MARVEL/PDFs/25XMEN_1088_FR.pdf",
          uploaded: "DONE"
        }
      ]
    }
  ],
  job_path: "Jobs/job_1735567890123_k7x9m2p4q.json",
  source_folder: "MARVEL/PDFs",
  total_files: 2
};

/**
 * EXAMPLE 2: Job with extraction in progress
 * Status: Some files extracted, some still pending
 */
export const exampleJobExtractionInProgress: JobTracking = {
  job_id: "job_1735567890456_p2m4k9x7s",
  created_at: "2024-12-30T15:00:00.000Z",
  last_updated: "2024-12-30T15:15:45.678Z",
  app_name: "NBA",
  release_name: "2024-Playoff-Series",
  Subset_name: "Rookie-Cards",
  job_status: "Extraction in progress",
  files: [
    {
      filename: "24NBA_ROOKIE_001",
      uploaded: "DONE",        // Upload completed, now extracted
      extracted: "DONE",        // This file has been extracted
      digital_assets: "PENDING",
      last_updated: "2024-12-30T15:10:22.456Z",
      original_files: [
        {
          filename: "24NBA_ROOKIE_001_FR.pdf",
          card_type: "front",
          file_path: "NBA/PDFs/24NBA_ROOKIE_001_FR.pdf",
          uploaded: "DONE"
        },
        {
          filename: "24NBA_ROOKIE_001_BK.pdf",
          card_type: "back",
          file_path: "NBA/PDFs/24NBA_ROOKIE_001_BK.pdf",
          uploaded: "DONE"
        }
      ]
    },
    {
      filename: "24NBA_ROOKIE_002",
      uploaded: "DONE",        // Upload completed, waiting for extraction
      extracted: "PENDING",     // Still waiting for extraction
      digital_assets: "PENDING",
      last_updated: "2024-12-30T15:00:00.000Z",
      original_files: [
        {
          filename: "24NBA_ROOKIE_002_FR.pdf",
          card_type: "front",
          file_path: "NBA/PDFs/24NBA_ROOKIE_002_FR.pdf",
          uploaded: "DONE"
        }
      ]
    },
    {
      filename: "24NBA_ROOKIE_003",
      uploaded: "DONE",        // Upload completed, but extraction failed
      extracted: "FAILED",      // Extraction failed for this file
      digital_assets: "PENDING",
      last_updated: "2024-12-30T15:12:15.789Z",
      original_files: [
        {
          filename: "24NBA_ROOKIE_003_FR.pdf",
          card_type: "front",
          file_path: "NBA/PDFs/24NBA_ROOKIE_003_FR.pdf",
          uploaded: "DONE"
        },
        {
          filename: "24NBA_ROOKIE_003_BK.pdf",
          card_type: "back",
          file_path: "NBA/PDFs/24NBA_ROOKIE_003_BK.pdf",
          uploaded: "DONE"
        }
      ]
    }
  ],
  job_path: "Jobs/job_1735567890456_p2m4k9x7s.json",
  source_folder: "NBA/PDFs",
  total_files: 3
};

/**
 * EXAMPLE 3: Completed job with all digital assets generated
 * Status: All processing complete
 */
export const exampleJobCompleted: JobTracking = {
  job_id: "job_1735567890789_x5n8q3r7w",
  created_at: "2024-12-30T16:00:00.000Z",
  last_updated: "2024-12-30T16:45:30.999Z",
  app_name: "DISNEY",
  release_name: "2024-Princess-Collection",
  Subset_name: "Rare-Cards",
  job_status: "Digital Assets completed",
  files: [
    {
      filename: "24DISNEY_PRINCESS_001",
      uploaded: "DONE",        // All processing stages completed
      extracted: "DONE",
      digital_assets: "DONE",   // All processing completed
      last_updated: "2024-12-30T16:30:15.555Z",
      original_files: [
        {
          filename: "24DISNEY_PRINCESS_001_FR.pdf",
          card_type: "front",
          file_path: "DISNEY/PDFs/24DISNEY_PRINCESS_001_FR.pdf",
          uploaded: "DONE"
        },
        {
          filename: "24DISNEY_PRINCESS_001_BK.pdf",
          card_type: "back",
          file_path: "DISNEY/PDFs/24DISNEY_PRINCESS_001_BK.pdf",
          uploaded: "DONE"
        }
      ]
    },
    {
      filename: "24DISNEY_PRINCESS_002",
      uploaded: "DONE",        // All processing stages completed
      extracted: "DONE",
      digital_assets: "DONE",
      last_updated: "2024-12-30T16:35:22.777Z",
      original_files: [
        {
          filename: "24DISNEY_PRINCESS_002_FR.pdf",
          card_type: "front",
          file_path: "DISNEY/PDFs/24DISNEY_PRINCESS_002_FR.pdf",
          uploaded: "DONE"
        }
      ]
    }
  ],
  job_path: "Jobs/job_1735567890789_x5n8q3r7w.json",
  source_folder: "DISNEY/PDFs",
  total_files: 2
};

// ============================================================================
// FIELD DESCRIPTIONS & USAGE NOTES
// ============================================================================

/**
 * FIELD USAGE NOTES:
 * 
 * job_id:
 *   - Format: "job_{timestamp}_{random_string}"
 *   - Must be unique across all jobs
 *   - Used for file naming and tracking
 * 
 * timestamps:
 *   - All timestamps use ISO 8601 format with 'Z' suffix (UTC)
 *   - created_at: Never changes after job creation
 *   - last_updated: Updated whenever job status changes
 *   - Individual file last_updated: Updated when file status changes
 * 
 * job_status progression:
 *   Upload in progress → Upload completed → Extraction in progress → 
 *   Extraction completed → Digital Assets in progress → Digital Assets completed
 *   
 *   Any step can transition to failed state:
 *   Upload failed, Extraction failed, Digital Assets failed
 * 
 * process status tracking:
 *   - uploaded: Tracks individual file upload status (PENDING → DONE/FAILED)
 *   - extracted: Tracks PDF extraction status (PENDING → DONE/FAILED)
 *   - digital_assets: Tracks digital asset generation (PENDING → DONE/FAILED)
 *   - Each file and original_file tracks its own process statuses independently
 * 
 * file naming patterns:
 *   - Base name: Card identifier without extension (e.g., "25XMEN_1087")
 *   - Front files: Usually end with "_FR.pdf"
 *   - Back files: Usually end with "_BK.pdf"
 *   - Single files: May not follow _FR/_BK pattern
 * 
 * file paths:
 *   - job_path: Where the job JSON is stored in S3
 *   - source_folder: Where the original PDF files are stored
 *   - file_path (in original_files): Full S3 path to individual PDF files
 *   - All paths use forward slashes as separators
 *   - file_path format: "{source_folder}/{filename}"
 * 
 * total_files:
 *   - Count of logical cards (not individual PDF files)
 *   - One card may have multiple PDFs (front/back)
 */

export default JobTracking; 