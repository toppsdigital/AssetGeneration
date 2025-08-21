import { NextRequest, NextResponse } from 'next/server';

export async function PUT(request: NextRequest) {
  try {
    const presignedUrl = request.headers.get('x-presigned-url');

    if (!presignedUrl) {
      return NextResponse.json({ error: 'Missing x-presigned-url header' }, { status: 400 });
    }

    console.log('--- s3-upload: Forwarding file to S3 ---');
    console.log('Presigned URL:', presignedUrl);
    console.log('Content-Type:', request.headers.get('content-type'));
    console.log('Content-Length:', request.headers.get('content-length'));
    
    // Add request details for debugging
    console.log('Request method:', request.method);
    console.log('Request URL:', request.url);

    // Convert the request body to an ArrayBuffer to ensure proper handling
    console.log('🔄 Converting request body to ArrayBuffer...');
    let bodyBuffer;
    try {
      bodyBuffer = await request.arrayBuffer();
      console.log('✅ Body buffer size:', bodyBuffer.byteLength);
    } catch (bufferError) {
      console.error('❌ Failed to convert request body to ArrayBuffer:', bufferError);
      return NextResponse.json({ 
        error: 'Failed to process request body', 
        details: bufferError.message 
      }, { status: 500 });
    }

    const uploadHeaders: Record<string, string> = {
      'Content-Type': request.headers.get('content-type') || 'application/octet-stream',
    };

    // Only set Content-Length if we have a valid size
    if (bodyBuffer.byteLength > 0) {
      uploadHeaders['Content-Length'] = bodyBuffer.byteLength.toString();
    }

    console.log('Upload headers:', uploadHeaders);

    console.log('🚀 Uploading to S3 via presigned URL...');
    let response;
    try {
      // Add timeout and DNS resolution retry logic
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      response = await fetch(presignedUrl, {
        method: 'PUT',
        headers: uploadHeaders,
        body: bodyBuffer,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      console.log('✅ S3 fetch completed, status:', response.status);
    } catch (fetchError) {
      console.error('❌ S3 fetch failed:', fetchError);
      return NextResponse.json({ 
        error: 'Failed to connect to S3', 
        details: fetchError.message 
      }, { status: 500 });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('s3-upload: Error from S3:', response.status, errorText);
      console.error('s3-upload: Response headers:', Object.fromEntries(response.headers.entries()));
      return NextResponse.json({ 
        error: 'Failed to upload to S3', 
        details: errorText 
      }, { status: response.status });
    }

    console.log('--- s3-upload: File successfully uploaded to S3 ---');
    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error) {
    console.error('s3-upload: Internal server error:', error);
    console.error('Error details:', {
      name: error?.name,
      message: error?.message,
      stack: error?.stack,
      cause: error?.cause
    });
    return NextResponse.json({ 
      error: 'Internal Server Error',
      details: error?.message || 'Unknown error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get upload instructions from headers
    const uploadUrl = request.headers.get('x-upload-url');
    const uploadFieldsHeader = request.headers.get('x-upload-fields');
    const uploadMethod = request.headers.get('x-upload-method');

    if (!uploadUrl) {
      return NextResponse.json({ error: 'Missing x-upload-url header' }, { status: 400 });
    }

    console.log('--- s3-upload: Handling presigned POST form upload ---');
    console.log('Upload URL:', uploadUrl);
    console.log('Upload Method:', uploadMethod);
    console.log('Content-Type:', request.headers.get('content-type'));

    // Parse upload fields from header
    let uploadFields: Record<string, string> = {};
    if (uploadFieldsHeader) {
      try {
        uploadFields = JSON.parse(uploadFieldsHeader);
        console.log('Upload fields count:', Object.keys(uploadFields).length);
      } catch (error) {
        console.error('Failed to parse upload fields:', error);
        return NextResponse.json({ error: 'Invalid upload fields format' }, { status: 400 });
      }
    }

    // Get file from request body
    console.log('🔄 Converting request body to file...');
    let fileBuffer;
    try {
      fileBuffer = await request.arrayBuffer();
      console.log('✅ File buffer size:', fileBuffer.byteLength);
    } catch (bufferError) {
      console.error('❌ Failed to convert request body to ArrayBuffer:', bufferError);
      return NextResponse.json({ 
        error: 'Failed to process request body', 
        details: bufferError.message 
      }, { status: 500 });
    }

    // Create FormData for S3 POST upload
    const formData = new FormData();
    
    // Filter out problematic metadata fields that cause policy violations
    // The backend provides these fields in upload instructions but they're not allowed by the policy
    const allowedFields = Object.entries(uploadFields).filter(([key, value]) => {
      // Skip x-amz-meta-* fields that often cause "Extra input fields" policy violations
      if (key.startsWith('x-amz-meta-')) {
        console.log(`⚠️ Skipping metadata field (not in policy): ${key}`);
        return false;
      }
      
      // Allow all other fields provided by the backend
      return true;
    });
    
    console.log(`📤 Adding ${allowedFields.length} fields to form (filtered out ${Object.keys(uploadFields).length - allowedFields.length} fields)`);
    
    // Add filtered fields first (order matters for S3)
    allowedFields.forEach(([key, value]) => {
      formData.append(key, value);
      console.log(`📤 Adding field: ${key} = ${value.substring(0, 50)}${value.length > 50 ? '...' : ''}`);
    });
    
    // Add file last (required by S3)
    // Don't set the Blob type - let the Content-Type field from upload instructions handle it
    const file = new Blob([fileBuffer]);
    formData.append('file', file);
    console.log('📤 Added file to form data');

    console.log('🚀 Uploading to S3 via presigned POST...');
    let response;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout for form uploads
      
      response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      console.log('✅ S3 form POST completed, status:', response.status);
    } catch (fetchError) {
      console.error('❌ S3 form POST failed:', fetchError);
      return NextResponse.json({ 
        error: 'Failed to connect to S3', 
        details: fetchError.message 
      }, { status: 500 });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('s3-upload: Error from S3 form POST:', response.status, errorText);
      console.error('s3-upload: Response headers:', Object.fromEntries(response.headers.entries()));
      console.error('s3-upload: Fields sent to S3:', allowedFields.map(([key]) => key));
      console.error('s3-upload: Metadata fields filtered out:', Object.keys(uploadFields).filter(key => key.startsWith('x-amz-meta-')));
      return NextResponse.json({ 
        error: 'Failed to upload to S3 via form POST', 
        details: errorText,
        debug: {
          fieldsCount: allowedFields.length,
          filteredMetadataFields: Object.keys(uploadFields).filter(key => key.startsWith('x-amz-meta-')).length
        }
      }, { status: response.status });
    }

    console.log('--- s3-upload: File successfully uploaded to S3 via form POST ---');
    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error) {
    console.error('s3-upload: POST Internal server error:', error);
    console.error('Error details:', {
      name: error?.name,
      message: error?.message,
      stack: error?.stack,
      cause: error?.cause
    });
    return NextResponse.json({ 
      error: 'Internal Server Error',
      details: error?.message || 'Unknown error'
    }, { status: 500 });
  }
} 