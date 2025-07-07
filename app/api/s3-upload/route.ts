import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const presignedUrl = formData.get('presignedUrl') as string;
    const file = formData.get('file') as File;

    if (!presignedUrl || !file) {
      return NextResponse.json({ error: 'Missing presignedUrl or file' }, { status: 400 });
    }

    console.log('S3 Upload: Uploading file to S3 via presigned URL...');
    console.log('File size:', file.size);
    console.log('File type:', file.type);

    // Convert file to buffer
    const fileBuffer = await file.arrayBuffer();

    // Upload to S3 using the presigned URL
    const uploadResponse = await fetch(presignedUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
      },
      body: fileBuffer,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('S3 Upload failed:', uploadResponse.status, errorText);
      return NextResponse.json({ 
        error: `S3 upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`,
        details: errorText
      }, { status: 500 });
    }

    console.log('S3 Upload: Successfully uploaded to S3');
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('S3 Upload error:', error);
    return NextResponse.json({ 
      error: 'Upload failed', 
      details: (error as Error).message 
    }, { status: 500 });
  }
} 