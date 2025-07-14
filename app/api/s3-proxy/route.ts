import { NextRequest, NextResponse } from 'next/server';

const S3_SERVICE_URL = 'https://devops-dev.services.toppsapps.com/s3/presigned-url';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
  console.log('--- S3 Proxy: Incoming request ---');
    console.log('Method:', request.method);
    console.log('Body:', JSON.stringify(body, null, 2));
    
    const { client_method } = body;



  if (client_method === 'put') {
      const { filename, upload, expires_in = 720 } = body;
    console.log('S3 Proxy: PUT - filename:', filename, 'upload:', upload, 'expires_in:', expires_in);
    const backendEndpoint = 'https://devops-dev.services.toppsapps.com/s3/presigned-url';
    const putRes = await fetch(backendEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_method: 'put',
        filename,
        expires_in,
      }),
    });
    console.log('S3 Proxy: PUT - Backend response status:', putRes.status);
    if (!putRes.ok) {
      const errorData = await putRes.json().catch(() => ({}));
      console.error('S3 Proxy: PUT - Backend error:', errorData);
        return NextResponse.json({ 
          error: 'Failed to get presigned S3 PUT URL', 
          details: errorData 
        }, { status: 500 });
    }
    const { url } = await putRes.json();
    
    // If upload=true, we'll handle the upload via FormData in a separate endpoint
    if (upload) {
        return NextResponse.json({ 
          uploadUrl: '/api/s3-upload', 
          presignedUrl: url 
        }, { status: 200 });
    }
    
      return NextResponse.json({ url }, { status: 200 });
  }

  if (client_method === 'get') {
      const { filename, key, download, direct_url } = body;
    console.log('S3 Proxy: GET - filename:', filename, 'key:', key, 'download:', download, 'direct_url:', direct_url);
    if (!filename && !key) {
        return NextResponse.json({ 
          error: 'Missing filename or key for GET request' 
        }, { status: 400 });
    }
    
    // If download=true, fetch the content and return it directly (to avoid CORS)
    if (download) {
      let fetchUrl;
      
      // Check if this is a direct URL (full HTTP URL) or needs presigned URL
      if (direct_url) {
        // For direct URLs, use the URL as-is
        fetchUrl = filename || key;
        console.log('S3 Proxy: Downloading content from direct URL to avoid CORS...');
        console.log('S3 Proxy: Using direct URL:', fetchUrl);
      } else {
        // For S3 paths, get presigned URL first
        console.log('S3 Proxy: Getting presigned URL for S3 path...');
        const backendEndpoint = 'https://devops-dev.services.toppsapps.com/s3/presigned-url';
        const getRes = await fetch(backendEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_method: 'get',
            filename: filename || key,
            key: key || filename,
            expires_in: 720,
          }),
        });
        console.log('S3 Proxy: GET - Backend response status:', getRes.status);
        if (!getRes.ok) {
            const errorText = await getRes.text().catch(() => 'Unknown error');
            console.error('S3 Proxy: GET - Backend error response:', errorText);
            return NextResponse.json({ 
              error: 'Failed to get presigned S3 GET URL',
              details: errorText 
            }, { status: 500 });
        }
        const backendData = await getRes.json();
        console.log('S3 Proxy: GET - Backend response data:', backendData);
        fetchUrl = backendData.url;
        console.log('S3 Proxy: Downloading content from S3 to avoid CORS...');
        console.log('S3 Proxy: Using presigned URL:', fetchUrl);
      }
      
      // Fetch the content
      const contentResponse = await fetch(fetchUrl);
      console.log('S3 Proxy: Content response status:', contentResponse.status);
      console.log('S3 Proxy: Content response headers:', Object.fromEntries(contentResponse.headers.entries()));
      
      if (!contentResponse.ok) {
          const errorText = await contentResponse.text().catch(() => 'Unknown error');
          console.error('S3 Proxy: Content error response:', errorText);
          return NextResponse.json({ 
            error: 'Failed to download file',
            status: contentResponse.status,
            details: errorText
          }, { status: 500 });
      }
      
      try {
        const content = await contentResponse.json();
        console.log('S3 Proxy: Successfully downloaded and parsed JSON content');
        return NextResponse.json(content, { status: 200 });
      } catch (parseError) {
        console.error('S3 Proxy: Failed to parse JSON content:', parseError);
        return NextResponse.json({ 
          error: 'Failed to parse JSON content',
          details: parseError.message 
        }, { status: 500 });
      }
    }
    
    // For non-download requests, get presigned URL
    const backendEndpoint = 'https://devops-dev.services.toppsapps.com/s3/presigned-url';
    const getRes = await fetch(backendEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_method: 'get',
        filename: filename || key,
        key: key || filename,
        expires_in: 720,
      }),
    });
    console.log('S3 Proxy: GET - Backend response status:', getRes.status);
    if (!getRes.ok) {
        const errorText = await getRes.text().catch(() => 'Unknown error');
        console.error('S3 Proxy: GET - Backend error response:', errorText);
        return NextResponse.json({ 
          error: 'Failed to get presigned S3 GET URL',
          details: errorText 
        }, { status: 500 });
    }
    const backendData = await getRes.json();
    console.log('S3 Proxy: GET - Backend response data:', backendData);
    const { url } = backendData;
    
      return NextResponse.json({ url }, { status: 200 });
  }

    if (client_method === 'fetch_public_files') {
      const { public_url, file_type = 'pdf' } = body;
      console.log('S3 Proxy: FETCH_PUBLIC_FILES - public_url:', public_url, 'file_type:', file_type);
      
      if (!public_url) {
        return NextResponse.json({ 
          error: 'Missing public_url for fetch_public_files request' 
        }, { status: 400 });
  }

  try {
        console.log('S3 Proxy: Fetching file objects from public URL...');
        const response = await fetch(public_url);
        
        if (!response.ok) {
          console.error('S3 Proxy: Failed to fetch public URL, status:', response.status);
          return NextResponse.json({ 
            error: 'Failed to fetch from public URL',
            status: response.status 
          }, { status: 500 });
        }
        
        const fileObjects = await response.json();
        console.log('S3 Proxy: Retrieved file objects:', fileObjects);
        
        // Filter by file type if specified
        let filteredFiles = fileObjects;
        if (file_type && Array.isArray(fileObjects)) {
          filteredFiles = fileObjects.filter(file => {
            const fileName = file.file_name || file.name || '';
            const extension = fileName.split('.').pop()?.toLowerCase();
            return extension === file_type.toLowerCase();
          });
          console.log('S3 Proxy: Filtered files by type', file_type, ':', filteredFiles);
        }
        
        return NextResponse.json({ 
          files: filteredFiles,
          total_count: Array.isArray(filteredFiles) ? filteredFiles.length : 0,
          file_type: file_type,
          source_url: public_url
        }, { status: 200 });
        
      } catch (error) {
        console.error('S3 Proxy: Error fetching public files:', error);
        return NextResponse.json({ 
          error: 'Failed to parse response from public URL',
          details: error.message 
        }, { status: 500 });
      }
    }

    // Default case - forward the request body exactly as received
    const requestBody = body;
    
    // Log the exact request we're about to send
    console.log('S3 Proxy - Sending request to:', S3_SERVICE_URL);
    console.log('S3 Proxy - Request body:', JSON.stringify(requestBody, null, 2));

    // Make the request to S3 service
    const s3Res = await fetch(S3_SERVICE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      redirect: 'follow',  // equivalent to --location in curl
      body: JSON.stringify(requestBody)
    });

    // Log the raw response
    console.log('S3 Proxy - Response status:', s3Res.status);
    console.log('S3 Proxy - Response headers:', Object.fromEntries(s3Res.headers.entries()));

    const data = await s3Res.json();
    console.log('S3 Proxy - Response data:', data);

    // Forward the exact response from S3
    return NextResponse.json(data, { status: s3Res.status });
  } catch (error) {
    console.error('S3 Proxy - Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 