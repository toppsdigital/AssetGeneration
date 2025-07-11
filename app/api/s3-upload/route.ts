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

    // Convert the request body to an ArrayBuffer to ensure proper handling
    const bodyBuffer = await request.arrayBuffer();
    
    console.log('Body buffer size:', bodyBuffer.byteLength);

    const uploadHeaders: Record<string, string> = {
      'Content-Type': request.headers.get('content-type') || 'application/octet-stream',
    };

    // Only set Content-Length if we have a valid size
    if (bodyBuffer.byteLength > 0) {
      uploadHeaders['Content-Length'] = bodyBuffer.byteLength.toString();
    }

    console.log('Upload headers:', uploadHeaders);

    const response = await fetch(presignedUrl, {
      method: 'PUT',
      headers: uploadHeaders,
      body: bodyBuffer,
    });

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
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 