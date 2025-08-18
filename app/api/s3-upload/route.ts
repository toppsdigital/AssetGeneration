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