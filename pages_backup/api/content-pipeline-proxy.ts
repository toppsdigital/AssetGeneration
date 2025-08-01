import { NextApiRequest, NextApiResponse } from 'next';

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

// Configuration - replace with your actual API Gateway URL
const API_BASE_URL = process.env.CONTENT_PIPELINE_API_URL;

// If no API URL is configured, return mock data for development
if (!API_BASE_URL) {
  console.warn('CONTENT_PIPELINE_API_URL not configured, using mock data');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method, body, query } = req;
  
  // If API URL is not configured, return appropriate error
  if (!API_BASE_URL) {
    return res.status(503).json({ 
      error: 'Content Pipeline API not configured',
      message: 'Please set CONTENT_PIPELINE_API_URL environment variable in Vercel',
      details: 'The Content Pipeline API endpoint is not configured for this deployment'
    });
  }
  
  try {
    // Parse the operation from query parameters
    const { operation, resource, id } = query;
    
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
          return res.status(400).json({ error: 'Job ID is required' });
        }
        apiUrl += `/jobs/${id}`;
        apiMethod = 'GET';
        break;
        
      case 'update_job':
        if (!id) {
          return res.status(400).json({ error: 'Job ID is required' });
        }
        apiUrl += `/jobs/${id}`;
        apiMethod = 'PUT';
        break;
        
      case 'list_jobs':
        apiUrl += '/jobs';
        apiMethod = 'GET';
        // Add query parameters for pagination and filtering
        const jobParams = new URLSearchParams();
        if (query.limit) jobParams.append('limit', query.limit as string);
        if (query.recent_only) jobParams.append('recent_only', query.recent_only as string);
        if (query.last_modified_only) jobParams.append('last_modified_only', query.last_modified_only as string);
        if (query.exclusive_start_key) jobParams.append('exclusive_start_key', query.exclusive_start_key as string);
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
          return res.status(400).json({ error: 'Filename is required' });
        }
        apiUrl += `/files/${encodeURIComponent(id as string)}`;
        apiMethod = 'GET';
        break;
        
      case 'update_file':
        if (!id) {
          return res.status(400).json({ error: 'Filename is required' });
        }
        apiUrl += `/files/${encodeURIComponent(id as string)}`;
        apiMethod = 'PUT';
        break;
        
      case 'list_files':
        apiUrl += '/files';
        apiMethod = 'GET';
        // Add query parameters for pagination
        const fileParams = new URLSearchParams();
        if (query.limit) fileParams.append('limit', query.limit as string);
        if (query.exclusive_start_key) fileParams.append('exclusive_start_key', query.exclusive_start_key as string);
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
          return res.status(400).json({ error: 'Group filename is required' });
        }
        if (!body.pdf_filename || !body.status) {
          return res.status(400).json({ error: 'pdf_filename and status are required' });
        }
        
        try {
          // First, get the current file data using the existing get_file operation
          const getFileUrl = `${API_BASE_URL}/files/${encodeURIComponent(id as string)}`;
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
            return res.status(getResponse.status).json(errorData);
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
            return res.status(404).json({ error: `PDF file ${pdfFilename} not found in original_files` });
          }
          
          // Now update the file using the existing update_file operation
          const updateFileUrl = `${API_BASE_URL}/files/${encodeURIComponent(id as string)}`;
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
          return res.status(updateResponse.status).json(updateData);
          
        } catch (error) {
          console.error('Error in update_pdf_status:', error);
          return res.status(500).json({ 
            error: 'Failed to update PDF status',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
        }
        
      case 'generate_assets':
        if (!id) {
          return res.status(400).json({ error: 'Job ID is required' });
        }
        if (!body.colors || !body.layers || !body.psd_file) {
          return res.status(400).json({ error: 'colors, layers, and psd_file are required' });
        }
        apiUrl += `/jobs/${id}/generate-assets`;
        apiMethod = 'POST';
        break;
        
      default:
        return res.status(400).json({ 
          error: 'Invalid operation',
          available_operations: [
            'create_job', 'get_job', 'update_job', 'list_jobs',
            'create_file', 'get_file', 'update_file', 'list_files',
            'batch_create_files', 'batch_get_files', 'update_pdf_status',
            'generate_assets'
          ]
        });
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
    res.status(response.status).json(responseData);
    
  } catch (error) {
    console.error('Content Pipeline API proxy error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 