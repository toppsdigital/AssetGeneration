import { NextRequest, NextResponse } from 'next/server';

// Types based on the Postman collection structure
interface JobData {
  job_id?: string;
  app_name: string;
  release_name: string;
  source_folder: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high';
  job_status?: string;
  progress_percentage?: number;
  current_step?: string;
  metadata?: Record<string, any>;
  created_at?: string;
  last_updated?: string;
}

interface FileData {
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

interface BatchCreateRequest {
  files: FileData[];
}

interface BatchGetRequest {
  filenames: string[];
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
  return handleRequest(request, 'POST');
}

export async function PUT(request: NextRequest) {
  return handleRequest(request, 'PUT');
}

async function handleRequest(request: NextRequest, method: string) {
  // If API URL is not configured, return appropriate error
  if (!API_BASE_URL) {
    return NextResponse.json({ 
      error: 'Content Pipeline API not configured',
      message: 'Please set CONTENT_PIPELINE_API_URL environment variable in Vercel',
      details: 'The Content Pipeline API endpoint is not configured for this deployment'
    }, { status: 503 });
  }
  
  try {
    const url = new URL(request.url);
    const body = method !== 'GET' ? await request.json() : null;
    
    // Parse the operation from query parameters
    const operation = url.searchParams.get('operation');
    const resource = url.searchParams.get('resource');
    const id = url.searchParams.get('id');
    
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
        if (url.searchParams.get('limit')) jobParams.append('limit', url.searchParams.get('limit')!);
        if (url.searchParams.get('recent_only')) jobParams.append('recent_only', url.searchParams.get('recent_only')!);
        if (url.searchParams.get('last_modified_only')) jobParams.append('last_modified_only', url.searchParams.get('last_modified_only')!);
        if (url.searchParams.get('exclusive_start_key')) jobParams.append('exclusive_start_key', url.searchParams.get('exclusive_start_key')!);
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
        if (url.searchParams.get('limit')) fileParams.append('limit', url.searchParams.get('limit')!);
        if (url.searchParams.get('exclusive_start_key')) fileParams.append('exclusive_start_key', url.searchParams.get('exclusive_start_key')!);
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
        
      default:
        return NextResponse.json({ 
          error: 'Invalid operation',
          available_operations: [
            'create_job', 'get_job', 'update_job', 'list_jobs',
            'create_file', 'get_file', 'update_file', 'list_files',
            'batch_create_files', 'batch_get_files'
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