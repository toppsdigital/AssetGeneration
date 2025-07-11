import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Replace with your backend endpoint that returns the presigned LIST URL
    const backendEndpoint = process.env.LIST_PSD_BACKEND_ENDPOINT || 'http://localhost:5000/api/s3-presigned';

    // Get the presigned LIST URL from your backend
    const listRes = await fetch(backendEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_method: 'list',
        expires_in: 720,
      }),
    });
    
    if (!listRes.ok) {
      return NextResponse.json({ error: 'Failed to get presigned S3 LIST URL' }, { status: 500 });
    }
    
    const { url } = await listRes.json();

    // Fetch the list of files from S3 using the presigned URL
    const s3Res = await fetch(url);
    if (!s3Res.ok) {
      return NextResponse.json({ error: 'Failed to fetch S3 file list' }, { status: 500 });
    }
    
    const xml = await s3Res.text();

    // Parse the XML to extract .psd file names
    const matches = Array.from(xml.matchAll(/<Key>([^<]+\.psd)<\/Key>/g));
    const files = matches.map(m => m[1]);

    return NextResponse.json({ files }, { status: 200 });
  } catch (error) {
    console.error('List PSD files error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 