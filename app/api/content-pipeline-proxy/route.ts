import { NextRequest, NextResponse } from 'next/server';

// Types matching the contentPipelineApi.ts structure
interface JobData {
  job_id?: string;
  app_name: string;
  release_name: string;
  subset_name: string;
  source_folder: string;
  files?: string[];
  description?: string;
  job_status?: 'uploading' | 'uploaded' | 'upload-failed' | 'extracting' | 'extracted' | 'extraction-failed' | 'generating' | 'generated' | 'generation-failed' | 'completed';
  created_at?: string;
  last_updated?: string;
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
  mode: 'download';
  bucket: string;
  key: string;
}

interface S3DownloadFolderRequest {
  mode: 'download';
  bucket: string;
  prefix: string;
}

interface S3UploadFilesRequest {
  mode: 'upload';
  bucket: string;
  files: Array<{
    filename: string;
    content: string; // base64 encoded
  }>;
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

// Mock S3 responses for development/testing when env vars aren't configured
const createMockS3Response = (operation: string, requestData: any) => {
  console.log(`🧪 Mock S3 ${operation} operation:`, requestData);
  
  switch (operation) {
    case 's3_upload_files':
      const files = requestData.files || [];
      return {
        success: true,
        message: `Mock upload successful for ${files.length} files`,
        uploaded_files: files.map((file: any) => ({
          filename: file.filename,
          s3_path: `mock/uploads/${file.filename}`,
          size: file.content ? file.content.length : 0,
          status: 'uploaded'
        }))
      };
      
    case 's3_download_file':
      return {
        success: true,
        message: 'Mock download successful',
        file_content: 'data:text/plain;base64,VGhpcyBpcyBhIG1vY2sgZmlsZQ==', // "This is a mock file"
        filename: requestData.filename || 'mock-file.txt'
      };
      
    case 's3_download_folder':
      return {
        success: true,
        message: 'Mock folder download successful',
        files: [
          { filename: 'mock-file1.pdf', s3_path: 'mock/folder/file1.pdf' },
          { filename: 'mock-file2.pdf', s3_path: 'mock/folder/file2.pdf' }
        ]
      };
      
    default:
      return {
        success: false,
        message: `Mock operation ${operation} not implemented`
      };
  }
};

// Enhanced S3 request handler with mock mode fallback
async function handleS3Request(operation: string, requestData: any): Promise<NextResponse> {
  const S3_FILE_MANAGER_URL = process.env.S3_FILE_MANAGER_API_URL;
  
  // Check if S3 API is configured
  if (!S3_FILE_MANAGER_URL) {
    console.warn('S3_FILE_MANAGER_API_URL not configured, using mock mode');
    const mockResponse = createMockS3Response(operation, requestData);
    return NextResponse.json(mockResponse);
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add Authorization header if API key is configured
    if (process.env.S3_FILE_MANAGER_API_KEY) {
      headers['Authorization'] = `Bearer ${process.env.S3_FILE_MANAGER_API_KEY}`;
    }

    const response = await fetch(`${S3_FILE_MANAGER_URL}/${operation}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`S3 API error (${response.status}):`, errorText);
      throw new Error(`S3 API request failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    return NextResponse.json(result);

  } catch (error) {
    console.error('S3 request failed:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'S3 request failed', 
        details: (error as Error).message 
      },
      { status: 500 }
    );
  }
}

// Configuration - replace with your actual API Gateway URL
const API_BASE_URL = process.env.CONTENT_PIPELINE_API_URL;

// If no API URL is configured, return mock data for development
if (!API_BASE_URL) {
  console.warn('CONTENT_PIPELINE_API_URL not configured, using mock data');
}

export async function GET(request: NextRequest) {
  return handleRequest(request, 'GET');
}

export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const operation = url.searchParams.get('operation');
    
    if (!operation) {
      return NextResponse.json(
        { error: 'Missing operation parameter' },
        { status: 400 }
      );
    }

    const body = await request.json();

    // Handle S3 operations
    if (operation === 's3_download_file') {
      if (!body.bucket || !body.key) {
        return NextResponse.json(
          { error: 'Missing required fields: bucket, key' },
          { status: 400 }
        );
      }
      return handleS3Request('s3_download_file', {
        mode: 'download',
        bucket: body.bucket,
        key: body.key
      });
    }

    if (operation === 's3_download_folder') {
      if (!body.bucket || !body.prefix) {
        return NextResponse.json(
          { error: 'Missing required fields: bucket, prefix' },
          { status: 400 }
        );
      }
      return handleS3Request('s3_download_folder', {
        mode: 'download',
        bucket: body.bucket,
        prefix: body.prefix
      });
    }

    if (operation === 's3_upload_files') {
      if (!body.bucket || !body.files || !Array.isArray(body.files)) {
        return NextResponse.json(
          { error: 'Missing required fields: bucket, files (array)' },
          { status: 400 }
        );
      }
      return handleS3Request('s3_upload_files', {
        mode: 'upload',
        bucket: body.bucket,
        files: body.files
      });
    }

    // Handle Content Pipeline operations (existing functionality)
    const CONTENT_PIPELINE_URL = 'https://contentpipeline-dev.services.toppsapps.com';
    
    let endpoint: string;
    switch (operation) {
      case 'createJob':
        endpoint = '/jobs';
        break;
      case 'getJob':
        endpoint = `/jobs/${body.job_id}`;
        break;
      case 'updateJobStatus':
        endpoint = `/jobs/${body.job_id}/status`;
        break;
      case 'batchCreateFiles':
        endpoint = '/files/batch';
        break;
      case 'batchGetFiles':
        endpoint = '/files/batch/read';
        break;
      case 'updatePdfFileStatus':
        endpoint = `/files/${body.filename}/pdf/${body.pdf_filename}/status`;
        break;
      case 'createFireflyAssets':
        endpoint = `/jobs/${body.job_id}/firefly-assets`;
        break;
      default:
        return NextResponse.json(
          { 
            error: 'Unknown operation', 
            available_operations: [
              'createJob', 'getJob', 'updateJobStatus', 
              'batchCreateFiles', 'batchGetFiles', 'updatePdfFileStatus', 'createFireflyAssets',
              's3_download_file', 's3_download_folder', 's3_upload_files'
            ]
          },
          { status: 400 }
        );
    }

    // Make request to Content Pipeline API
    const method = ['createJob', 'updateJobStatus', 'batchCreateFiles', 'updatePdfFileStatus', 'createFireflyAssets'].includes(operation) ? 'POST' : 'GET';
    
    const response = await fetch(`${CONTENT_PIPELINE_URL}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: method === 'POST' ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Content Pipeline API error (${response.status}):`, errorText);
      return NextResponse.json(
        { error: `Content Pipeline API request failed: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Proxy request failed:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: (error as Error).message },
      { status: 500 }
    );
  }
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
          if (process.env.CONTENT_PIPELINE_API_KEY) {
            getHeaders['Authorization'] = `Bearer ${process.env.CONTENT_PIPELINE_API_KEY}`;
          }
          
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
          if (process.env.CONTENT_PIPELINE_API_KEY) {
            updateHeaders['Authorization'] = `Bearer ${process.env.CONTENT_PIPELINE_API_KEY}`;
          }
          
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
        
      case 'generate_assets':
        if (!id) {
          return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
        }
        if (!body.layers || !body.psd_file) {
          return NextResponse.json({ error: 'layers and psd_file are required' }, { status: 400 });
        }
        // colors is optional - only required for spot layers
        apiUrl += `/jobs/${id}/generate-assets`;
        apiMethod = 'POST';
        break;
        
      default:
        return NextResponse.json({ 
          error: 'Invalid operation',
          available_operations: [
            'create_job', 'get_job', 'update_job', 'list_jobs',
            'create_file', 'get_file', 'update_file', 'list_files',
            'batch_create_files', 'batch_get_files', 'update_pdf_status',
            'generate_assets'
          ]
        }, { status: 400 });
    }
    
    // Prepare headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    // Add authorization if available
    if (process.env.CONTENT_PIPELINE_API_KEY) {
      headers['Authorization'] = `Bearer ${process.env.CONTENT_PIPELINE_API_KEY}`;
    }
    
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
    if (apiBody) {
      console.log('Request body:', JSON.stringify(apiBody, null, 2));
    }
    
    const response = await fetch(apiUrl, fetchOptions);
    const responseData = await response.json();
    
    console.log(`Response status: ${response.status}`);
    console.log('Response data:', JSON.stringify(responseData, null, 2));
    
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