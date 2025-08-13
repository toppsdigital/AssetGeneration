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
  original_files_total_count?: number;
  original_files_completed_count?: number;
  original_files_failed_count?: number;
  user_id?: string;
  user_name?: string;
  updated_by_user_id?: string;
  updated_by_user_name?: string;
  download_url?: string;
  download_url_expires?: string;
  download_url_created?: string;
  assets?: Record<string, any>; // Asset configurations with server-generated IDs
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

// Helper function to generate and save download URL to job object
async function generateAndSaveDownloadUrl(jobId: string): Promise<{
  success: boolean;
  message: string;
  download_url?: string;
  download_url_expires?: string;
}> {
  try {
    console.log(`🔄 Generating download URL for job: ${jobId}`);
    
    // Generate download URL for the job's output folder
    const folder = `asset_generator/dev/uploads/Output/${jobId}`;
    
    // Call S3 download folder operation to get presigned URL
    const s3Response = await fetch(`${API_BASE_URL}/s3-files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'download',
        bucket: S3_BUCKET_NAME,
        folder: folder
      })
    });
    
    if (!s3Response.ok) {
      const errorData = await s3Response.json();
      throw new Error(`Failed to generate download URL: ${errorData.message || s3Response.status}`);
    }
    
    const s3Data = await s3Response.json();
    
    if (!s3Data.success || !s3Data.data?.download_url) {
      throw new Error(`Invalid S3 response: ${s3Data.message || 'No download URL generated'}`);
    }
    
    const downloadUrl = s3Data.data.download_url;
    const expiresIn = s3Data.data.expires_in || 3600; // Default 1 hour
    const expiresAt = new Date(Date.now() + (expiresIn * 1000)).toISOString();
    const createdAt = new Date().toISOString();
    
    console.log(`✅ Generated download URL for job ${jobId}, expires in ${expiresIn} seconds`);
    
    // Update the job object with the download URL
    const updatePayload = {
      download_url: downloadUrl,
      download_url_expires: expiresAt,
      download_url_created: createdAt,
      last_updated: createdAt
    };
    
    console.log(`🔄 Attempting to update job ${jobId} with download URL fields:`, updatePayload);
    
    const updateResponse = await fetch(`${API_BASE_URL}/jobs/${jobId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatePayload)
    });
    
    console.log(`📥 Job update response status: ${updateResponse.status}`);
    
    if (!updateResponse.ok) {
      const updateError = await updateResponse.json();
      console.error(`❌ Job update failed:`, {
        status: updateResponse.status,
        error: updateError,
        payload: updatePayload
      });
      throw new Error(`Failed to save download URL to job: ${updateError.message || updateResponse.status}`);
    }
    
    const updateResponseData = await updateResponse.json();
    console.log(`✅ Job update response data:`, updateResponseData);
    console.log(`✅ Successfully saved download URL to job ${jobId}`);
    
    return {
      success: true,
      message: 'Download URL generated and saved successfully',
      download_url: downloadUrl,
      download_url_expires: expiresAt
    };
    
  } catch (error) {
    console.error(`❌ Error generating download URL for job ${jobId}:`, error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
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

export async function DELETE(request: NextRequest) {
  return handleRequest(request, 'DELETE');
}

async function handleRequest(request: NextRequest, method: string) {
  const { searchParams } = new URL(request.url);
  let body: any = {};
  
  // Safely parse request body for non-GET requests
  if (method !== 'GET') {
    try {
      const requestText = await request.text();
      if (requestText.trim()) {
        body = JSON.parse(requestText);
      }
    } catch (parseError) {
      console.warn('Failed to parse request body as JSON, using empty object:', parseError);
    }
  }
  
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
        // Pass 'status' parameter directly to backend
        const statusParam = searchParams.get('status');
        console.log('🔍 Debug status parameter:', {
          statusParam,
          hasStatus: !!statusParam,
          allSearchParams: Object.fromEntries(searchParams.entries())
        });
        
        if (statusParam) {
          // Backend expects simple 'status' parameter
          jobParams.append('status', statusParam);
          console.log('🔍 Status filter mapped:', {
            frontend_status: statusParam,
            backend_status: statusParam
          });
        } else {
          console.log('⚠️ No status parameter found in request');
        }
        if (jobParams.toString()) {
          apiUrl += `?${jobParams.toString()}`;
        }
        console.log('🔗 Final API URL for list_jobs:', apiUrl);
        console.log('🔗 Job params constructed:', jobParams.toString());
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

      case 'regenerate_assets':
        if (!id) {
          return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
        }
        apiUrl += `/jobs/${id}/regenerate`;
        apiMethod = 'POST';
        // Get session and add user information for regeneration tracking
        try {
          const session = await auth();
          if (session?.user) {
            apiBody = {
              ...apiBody,
              regenerated_by_user_id: session.user.id || session.user.email || 'unknown',
              regenerated_by_user_name: session.user.name || session.user.email || 'Unknown User'
            };
          }
        } catch (error) {
          console.warn('Failed to get session for asset regeneration:', error);
        }
        break;

      case 'update_download_url':
        if (!id) {
          return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
        }
        
        try {
          const downloadResult = await generateAndSaveDownloadUrl(id);
          return NextResponse.json(downloadResult, { 
            status: downloadResult.success ? 200 : 500 
          });
        } catch (error) {
          console.error('Error in update_download_url:', error);
          return NextResponse.json({ 
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error occurred'
          }, { status: 500 });
        }

      case 'create_asset':
        if (!id) {
          return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
        }
        apiUrl += `/jobs/${id}/assets`;
        apiMethod = 'POST';
        // Pass asset_config directly to backend - server will generate ID
        break;

      case 'update_asset':
        if (!id) {
          return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
        }
        const assetId = searchParams.get('asset_id');
        if (!assetId) {
          return NextResponse.json({ error: 'Asset ID is required' }, { status: 400 });
        }
        apiUrl += `/jobs/${id}/assets/${assetId}`;
        apiMethod = 'PUT';
        // Pass asset config directly to backend without adding tracking fields
        break;

      case 'delete_asset':
        if (!id) {
          return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
        }
        const deleteAssetId = searchParams.get('asset_id');
        if (!deleteAssetId) {
          return NextResponse.json({ error: 'Asset ID is required' }, { status: 400 });
        }
        apiUrl += `/jobs/${id}/assets/${deleteAssetId}`;
        apiMethod = 'DELETE';
        // Don't send body with DELETE request - some backends don't accept it
        apiBody = {}; // Empty body for DELETE
        break;

      case 'pdf-extract':
        apiUrl += '/pdf-extract';
        apiMethod = 'POST';
        break;
        
      default:
        return NextResponse.json({ 
          error: 'Invalid operation',
          available_operations: [
            'create_job', 'get_job', 'update_job', 'list_jobs', 'rerun_job',
            'create_file', 'get_file', 'update_file', 'list_files',
            'batch_create_files', 'batch_get_files', 'update_pdf_status', 'batch_update_pdf_status',
            'generate_assets', 'regenerate_assets', 'update_download_url',
            'create_asset', 'update_asset', 'delete_asset',
            'pdf-extract',
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
    
    // Add body for POST/PUT requests only (DELETE typically doesn't have body)
    if (apiMethod === 'POST' || apiMethod === 'PUT') {
      fetchOptions.body = JSON.stringify(apiBody);
    }
    
    console.log(`Making ${apiMethod} request to: ${apiUrl}`);
    console.log('Request headers:', JSON.stringify(headers, null, 2));
    if (apiBody) {
      console.log('Request body:', JSON.stringify(apiBody, null, 2));
      // Log user information for job operations
      if (operation === 'create_job' || operation === 'rerun_job' || operation === 'update_job' || operation === 'generate_assets' || operation === 'regenerate_assets') {
        if (apiBody.user_id || apiBody.updated_by_user_id || apiBody.generated_by_user_id || apiBody.regenerated_by_user_id) {
          console.log(`✅ User context included for ${operation}:`, {
            user_id: apiBody.user_id,
            user_name: apiBody.user_name,
            updated_by_user_id: apiBody.updated_by_user_id,
            updated_by_user_name: apiBody.updated_by_user_name,
            generated_by_user_id: apiBody.generated_by_user_id,
            generated_by_user_name: apiBody.generated_by_user_name,
            regenerated_by_user_id: apiBody.regenerated_by_user_id,
            regenerated_by_user_name: apiBody.regenerated_by_user_name
          });
        } else {
          console.log(`⚠️ No user context found for ${operation}`);
        }
      }
    }
    
    const response = await fetch(apiUrl, fetchOptions);
    
    console.log(`Response status: ${response.status}`);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    
    // Check if response has specific headers that indicate source (proxy vs API)
    const server = response.headers.get('server');
    const poweredBy = response.headers.get('x-powered-by');
    const via = response.headers.get('via');
    const apiGateway = response.headers.get('x-amzn-requestid') || response.headers.get('x-amz-apigw-id');
    
    console.log('🔍 Response source indicators:', {
      server,
      poweredBy, 
      via,
      apiGateway,
      isLikelyProxy: !!via || server?.toLowerCase().includes('proxy'),
      isLikelyAWS: !!apiGateway,
      url: apiUrl,
      method: apiMethod
    });
    
    // Get response text to handle both JSON and non-JSON responses
    const responseText = await response.text();
    console.log('Response body:', responseText);
    
    let responseData: any;
    
    try {
      if (!responseText.trim()) {
        console.warn('⚠️ Empty response body from backend API');
        responseData = { success: false, message: 'Empty response from backend API' };
      } else {
        responseData = JSON.parse(responseText);
        
        // Add extra debugging for authentication errors
        if (response.status === 403 && responseData.message?.includes('Authentication')) {
          console.error('🚨 Authentication error analysis:', {
            errorMessage: responseData.message,
            isProxy: !!via || server?.toLowerCase().includes('proxy'),
            isAWSAPI: !!apiGateway,
            responseHeaders: Object.fromEntries(response.headers.entries()),
            requestUrl: apiUrl,
            requestHeaders: headers,
            likely_source: apiGateway ? 'AWS API Gateway' : via ? 'Proxy Layer' : server ? `Server: ${server}` : 'Unknown'
          });
        }
      }
    } catch (parseError) {
      console.error('❌ Failed to parse backend API response as JSON:', parseError);
      console.log('Raw response:', responseText);
      responseData = {
        success: false,
        error: 'Invalid JSON response from backend API',
        message: responseText || 'Unknown error',
        details: parseError instanceof Error ? parseError.message : 'JSON parsing failed'
      };
    }
    
    console.log('Parsed response data:', JSON.stringify(responseData, null, 2));
    
    // If auth error, log more details
    if (responseData.message === "Missing Authentication Token") {
      console.error('❌ Authentication token required by Content Pipeline API');
      console.error('API URL:', apiUrl);
      console.error('Headers sent:', headers);
    }
    
    // Post-process successful asset generation to create download URL
    if (operation === 'generate_assets' && response.ok && responseData.success && id) {
      console.log(`🎨 Asset generation successful for job ${id}, generating download URL...`);
      
      // Generate and save download URL in the background (don't wait for it)
      generateAndSaveDownloadUrl(id).then(downloadResult => {
        if (downloadResult.success) {
          console.log(`✅ Download URL saved for job ${id}: ${downloadResult.download_url}`);
        } else {
          console.error(`❌ Failed to save download URL for job ${id}: ${downloadResult.message}`);
        }
      }).catch(error => {
        console.error(`❌ Error in background download URL generation for job ${id}:`, error);
      });
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