import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../auth';

// Types matching the contentPipelineApi.ts structure
interface JobData {
  job_id?: string;
  app_name: string;
  filename_prefix: string;
  source_folder: string;
  files?: string[];
  description?: string;
  job_status?: 'uploading' | 'uploaded' | 'upload-failed' | 'extracting' | 'extracted' | 'extraction-failed' | 'generating' | 'generated' | 'generation-failed' | 'completed';
  created_at?: string;
  last_updated?: string;
  user_id?: string;
  user_name?: string;
  updated_by_user_id?: string;
  updated_by_user_name?: string;
}

interface FileData {
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

interface BatchCreateRequest {
  files: FileData[];
}

interface BatchGetRequest {
  filenames: string[];
}

// TypeScript interfaces for S3 operations
interface S3DownloadFileRequest {
  key: string;
}

interface S3DownloadFolderRequest {
  prefix: string;
}

interface S3UploadFilesRequest {
  files: Array<{
    filename: string;
    content: string; // base64 encoded
    content_type?: string;
  }>;
  job_id?: string;
}

interface S3DownloadFileResponse {
  success: boolean;
  message: string;
  file_content?: string;
  filename?: string;
}

interface S3DownloadFolderResponse {
  success: boolean;
  message: string;
  files?: Array<{
    filename: string;
    s3_path: string;
  }>;
}

interface S3UploadFilesResponse {
  success: boolean;
  message: string;
  uploaded_files?: Array<{
    filename: string;
    s3_path: string;
    size: number;
    status: string;
  }>;
}

// Configuration - replace with your actual API Gateway URL
const API_BASE_URL = process.env.CONTENT_PIPELINE_API_URL;
const S3_BUCKET_NAME = 'topps-nexus-powertools';

// If no API URL is configured, return mock data for development
if (!API_BASE_URL) {
  console.warn('CONTENT_PIPELINE_API_URL not configured, using mock data');
}

export async function GET(request: NextRequest) {
  return handleRequest(request, 'GET');
}

export async function POST(request: NextRequest) {
  return handleRequest(request, 'POST');
}

export async function PUT(request: NextRequest) {
  return handleRequest(request, 'PUT');
}

async function handleRequest(request: NextRequest, method: string) {
  const { searchParams } = new URL(request.url);
  const body = method !== 'GET' ? await request.json() : {};
  
  // If API URL is not configured, return appropriate error
  if (!API_BASE_URL) {
    return NextResponse.json({ 
      error: 'Content Pipeline API not configured',
      message: 'Please set CONTENT_PIPELINE_API_URL environment variable in Vercel',
      details: 'The Content Pipeline API endpoint is not configured for this deployment'
    }, { status: 503 });
  }
  
  try {
    // Parse the operation from query parameters
    const operation = searchParams.get('operation');
    const resource = searchParams.get('resource');
    const id = searchParams.get('id');
    
    let apiUrl = API_BASE_URL;
    let apiMethod = method;
    let apiBody = body;
    
    // Route based on operation and resource
    switch (operation) {
      // Job operations
      case 'create_job':
        apiUrl += '/jobs';
        apiMethod = 'POST';
        // Get session and add user information
        try {
          const session = await auth();
          if (session?.user) {
            console.log('🔍 Session user object:', {
              id: session.user.id,
              email: session.user.email,
              name: session.user.name,
              available_fields: Object.keys(session.user)
            });
            apiBody = {
              ...apiBody,
              user_id: session.user.id || session.user.email || 'unknown',
              user_name: session.user.name || session.user.email || 'Unknown User'
            };
          }
        } catch (error) {
          console.warn('Failed to get session for job creation:', error);
        }
        break;
        
      case 'get_job':
        if (!id) {
          return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
        }
        apiUrl += `/jobs/${id}`;
        apiMethod = 'GET';
        break;
        
      case 'update_job':
        if (!id) {
          return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
        }
        apiUrl += `/jobs/${id}`;
        apiMethod = 'PUT';
        // Get session and add user information for audit trail
        try {
          const session = await auth();
          if (session?.user) {
            apiBody = {
              ...apiBody,
              updated_by_user_id: session.user.id || session.user.email || 'unknown',
              updated_by_user_name: session.user.name || session.user.email || 'Unknown User'
            };
          }
        } catch (error) {
          console.warn('Failed to get session for job update:', error);
        }
        break;
        
      case 'list_jobs':
        apiUrl += '/jobs';
        apiMethod = 'GET';
        // Add query parameters for pagination and filtering
        const jobParams = new URLSearchParams();
        if (searchParams.get('limit')) jobParams.append('limit', searchParams.get('limit')!);
        if (searchParams.get('recent_only')) jobParams.append('recent_only', searchParams.get('recent_only')!);
        if (searchParams.get('last_modified_only')) jobParams.append('last_modified_only', searchParams.get('last_modified_only')!);
        if (searchParams.get('exclusive_start_key')) jobParams.append('exclusive_start_key', searchParams.get('exclusive_start_key')!);
        // Handle user_id parameter - either passed directly or get from session for "my jobs"
        if (searchParams.get('user_id')) {
          jobParams.append('user_id', searchParams.get('user_id')!);
        } else if (searchParams.get('my_jobs')) {
          // Fallback: For my_jobs filter, get the current user's ID from session
          try {
            const session = await auth();
            if (session?.user) {
              const userId = session.user.id || session.user.email || 'unknown';
              jobParams.append('user_id', userId);
            }
          } catch (error) {
            console.warn('Failed to get session for my_jobs filter:', error);
          }
        }
        // Map 'status' parameter to 'sk_status' for API compatibility
        if (searchParams.get('status')) {
          jobParams.append('sk_status', searchParams.get('status')!);
          console.log('🔍 Status filter mapped:', {
            frontend_status: searchParams.get('status'),
            api_sk_status: searchParams.get('status')
          });
        }
        if (jobParams.toString()) {
          apiUrl += `?${jobParams.toString()}`;
        }
        break;
        
      // File operations
      case 'create_file':
        apiUrl += '/files';
        apiMethod = 'POST';
        break;
        
      case 'get_file':
        if (!id) {
          return NextResponse.json({ error: 'Filename is required' }, { status: 400 });
        }
        apiUrl += `/files/${encodeURIComponent(id)}`;
        apiMethod = 'GET';
        break;
        
      case 'update_file':
        if (!id) {
          return NextResponse.json({ error: 'Filename is required' }, { status: 400 });
        }
        apiUrl += `/files/${encodeURIComponent(id)}`;
        apiMethod = 'PUT';
        break;
        
      case 'list_files':
        apiUrl += '/files';
        apiMethod = 'GET';
        // Add query parameters for pagination
        const fileParams = new URLSearchParams();
        if (searchParams.get('limit')) fileParams.append('limit', searchParams.get('limit')!);
        if (searchParams.get('exclusive_start_key')) fileParams.append('exclusive_start_key', searchParams.get('exclusive_start_key')!);
        if (fileParams.toString()) {
          apiUrl += `?${fileParams.toString()}`;
        }
        break;
        
      // Batch operations
      case 'batch_create_files':
        apiUrl += '/files/batch/create';
        apiMethod = 'POST';
        break;
        
      case 'batch_get_files':
        apiUrl += '/files/batch/get';
        apiMethod = 'POST';
        break;
        
      case 'update_pdf_status':
        if (!id) {
          return NextResponse.json({ error: 'Group filename is required' }, { status: 400 });
        }
        if (!body.pdf_filename || !body.status) {
          return NextResponse.json({ error: 'pdf_filename and status are required' }, { status: 400 });
        }
        
        try {
          // First, get the current file data using the existing get_file operation
          const getFileUrl = `${API_BASE_URL}/files/${encodeURIComponent(id)}`;
          const getHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
          };
          
          const getResponse = await fetch(getFileUrl, {
            method: 'GET',
            headers: getHeaders,
          });
          
          if (!getResponse.ok) {
            const errorData = await getResponse.json();
            return NextResponse.json(errorData, { status: getResponse.status });
          }
          
          const fileData = await getResponse.json();
          
          // Update only the specific PDF file status
          // Check both direct property and metadata fallback for backward compatibility
          const currentOriginalFiles = { 
            ...(fileData.file.original_files || fileData.file.metadata?.original_files || {}) 
          };
          const pdfFilename = body.pdf_filename;
          
          if (currentOriginalFiles[pdfFilename]) {
            currentOriginalFiles[pdfFilename] = {
              ...currentOriginalFiles[pdfFilename],
              status: body.status
            };
          } else {
            return NextResponse.json({ error: `PDF file ${pdfFilename} not found in original_files` }, { status: 404 });
          }
          
          // Now update the file using the existing update_file operation
          const updateFileUrl = `${API_BASE_URL}/files/${encodeURIComponent(id)}`;
          const updateHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
          };
          
          const updateResponse = await fetch(updateFileUrl, {
            method: 'PUT',
            headers: updateHeaders,
            body: JSON.stringify({
              original_files: currentOriginalFiles,
              last_updated: new Date().toISOString()
            })
          });
          
          const updateData = await updateResponse.json();
          
          console.log(`PDF status update completed for ${pdfFilename}: ${body.status}`);
          
          // Return the response from the update_file operation
          return NextResponse.json(updateData, { status: updateResponse.status });
          
        } catch (error) {
          console.error('Error in update_pdf_status:', error);
          return NextResponse.json({ 
            error: 'Failed to update PDF status',
            details: error instanceof Error ? error.message : 'Unknown error'
          }, { status: 500 });
        }

      case 'batch_update_pdf_status':
        if (!id) {
          return NextResponse.json({ error: 'Group filename is required' }, { status: 400 });
        }
        if (!body.pdf_updates || !Array.isArray(body.pdf_updates) || body.pdf_updates.length === 0) {
          return NextResponse.json({ error: 'pdf_updates array is required' }, { status: 400 });
        }
        
        try {
          // First, get the current file data using the existing get_file operation
          const getFileUrl = `${API_BASE_URL}/files/${encodeURIComponent(id)}`;
          const getHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
          };
          
          const getResponse = await fetch(getFileUrl, {
            method: 'GET',
            headers: getHeaders,
          });
          
          if (!getResponse.ok) {
            const errorData = await getResponse.json();
            return NextResponse.json(errorData, { status: getResponse.status });
          }
          
          const fileData = await getResponse.json();
          
          // Update multiple PDF file statuses in a single operation
          const currentOriginalFiles = { 
            ...(fileData.file.original_files || fileData.file.metadata?.original_files || {}) 
          };
          
          // Apply all updates
          for (const update of body.pdf_updates) {
            const pdfFilename = update.pdf_filename;
            const status = update.status;
            
            if (currentOriginalFiles[pdfFilename]) {
              currentOriginalFiles[pdfFilename] = {
                ...currentOriginalFiles[pdfFilename],
                status: status
              };
              console.log(`Updated ${pdfFilename} status to ${status}`);
            } else {
              console.warn(`PDF file ${pdfFilename} not found in original_files, skipping`);
            }
          }
          
          // Now update the file using the existing update_file operation
          const updateFileUrl = `${API_BASE_URL}/files/${encodeURIComponent(id)}`;
          const updateHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
          };
          
          const updateResponse = await fetch(updateFileUrl, {
            method: 'PUT',
            headers: updateHeaders,
            body: JSON.stringify({
              original_files: currentOriginalFiles,
              last_updated: new Date().toISOString()
            })
          });
          
          const updateData = await updateResponse.json();
          
          console.log(`Batch PDF status update completed for ${body.pdf_updates.length} files in group ${id}`);
          
          // Return the response from the update_file operation
          return NextResponse.json(updateData, { status: updateResponse.status });
          
        } catch (error) {
          console.error('Error in batch_update_pdf_status:', error);
          return NextResponse.json({ 
            error: 'Failed to batch update PDF status',
            details: error instanceof Error ? error.message : 'Unknown error'
          }, { status: 500 });
        }
        
      // S3 operations
      case 's3_download_file':
        if (!body.key) {
          return NextResponse.json({ error: 'key is required for S3 file download' }, { status: 400 });
        }
        apiUrl += '/s3-files';
        apiMethod = 'POST';
        // Add the hardcoded bucket name and mode to the request body
        apiBody = { ...body, bucket: S3_BUCKET_NAME, mode: 'download' };
        break;
        
      case 's3_download_folder':
        if (!body.folder && !body.prefix) {
          return NextResponse.json({ error: 'folder is required for S3 folder download' }, { status: 400 });
        }
        apiUrl += '/s3-files';
        apiMethod = 'POST';
        // Add the hardcoded bucket name and mode to the request body
        // Support both 'folder' (new format) and 'prefix' (legacy) for backwards compatibility
        const folderPath = body.folder || body.prefix;
        apiBody = { 
          mode: 'download',
          bucket: S3_BUCKET_NAME,
          folder: folderPath
        };
        break;
        
      case 's3_upload_files':
        if (!body.files || !Array.isArray(body.files) || body.files.length === 0) {
          return NextResponse.json({ error: 'files array is required for S3 upload' }, { status: 400 });
        }
        if (!body.folder) {
          return NextResponse.json({ error: 'folder is required for S3 upload' }, { status: 400 });
        }
        apiUrl += '/s3-files';
        apiMethod = 'POST';
        // Add the hardcoded bucket name, mode, and folder to the request body
        apiBody = { 
          mode: 'upload',
          bucket: S3_BUCKET_NAME,
          folder: body.folder,
          files: body.files.map(file => ({
            filename: file.filename,
            content: file.content
          }))
        };
        break;
        
      case 'rerun_job':
        if (!id) {
          return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
        }
        apiUrl += `/jobs/${id}/rerun`;
        apiMethod = 'POST';
        // Get session and add user information
        try {
          const session = await auth();
          if (session?.user) {
            apiBody = {
              ...apiBody,
              user_id: session.user.id || session.user.email || 'unknown',
              user_name: session.user.name || session.user.email || 'Unknown User'
            };
          }
        } catch (error) {
          console.warn('Failed to get session for job rerun:', error);
        }
        break;
        
      case 'generate_assets':
        if (!id) {
          return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
        }
        if (!body.assets || !body.psd_file) {
          return NextResponse.json({ error: 'assets and psd_file are required' }, { status: 400 });
        }
        // colors is optional - only required for spot layers
        apiUrl += `/jobs/${id}/generate-assets`;
        apiMethod = 'POST';
        // Get session and add user information for asset generation tracking
        try {
          const session = await auth();
          if (session?.user) {
            apiBody = {
              ...apiBody,
              generated_by_user_id: session.user.id || session.user.email || 'unknown',
              generated_by_user_name: session.user.name || session.user.email || 'Unknown User'
            };
          }
        } catch (error) {
          console.warn('Failed to get session for asset generation:', error);
        }
        break;
        
      default:
        return NextResponse.json({ 
          error: 'Invalid operation',
          available_operations: [
            'create_job', 'get_job', 'update_job', 'list_jobs', 'rerun_job',
            'create_file', 'get_file', 'update_file', 'list_files',
            'batch_create_files', 'batch_get_files', 'update_pdf_status', 'batch_update_pdf_status',
            'generate_assets',
            's3_download_file', 's3_download_folder', 's3_upload_files'
          ]
        }, { status: 400 });
    }
    
    // Prepare headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    // Make the API request
    const fetchOptions: RequestInit = {
      method: apiMethod,
      headers,
    };
    
    // Add body for POST/PUT requests
    if (apiMethod === 'POST' || apiMethod === 'PUT') {
      fetchOptions.body = JSON.stringify(apiBody);
    }
    
    console.log(`Making ${apiMethod} request to: ${apiUrl}`);
    console.log('Request headers:', JSON.stringify(headers, null, 2));
    if (apiBody) {
      console.log('Request body:', JSON.stringify(apiBody, null, 2));
      // Log user information for job operations
      if (operation === 'create_job' || operation === 'rerun_job' || operation === 'update_job' || operation === 'generate_assets') {
        if (apiBody.user_id || apiBody.updated_by_user_id || apiBody.generated_by_user_id) {
          console.log(`✅ User context included for ${operation}:`, {
            user_id: apiBody.user_id,
            user_name: apiBody.user_name,
            updated_by_user_id: apiBody.updated_by_user_id,
            updated_by_user_name: apiBody.updated_by_user_name,
            generated_by_user_id: apiBody.generated_by_user_id,
            generated_by_user_name: apiBody.generated_by_user_name
          });
        } else {
          console.log(`⚠️ No user context found for ${operation}`);
        }
      }
    }
    
    const response = await fetch(apiUrl, fetchOptions);
    const responseData = await response.json();
    
    console.log(`Response status: ${response.status}`);
    console.log('Response data:', JSON.stringify(responseData, null, 2));
    
    // If auth error, log more details
    if (responseData.message === "Missing Authentication Token") {
      console.error('❌ Authentication token required by Content Pipeline API');
      console.error('API URL:', apiUrl);
      console.error('Headers sent:', headers);
    }
    
    // Return the response with the same status code
    return NextResponse.json(responseData, { status: response.status });
    
  } catch (error) {
    console.error('Content Pipeline API proxy error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 