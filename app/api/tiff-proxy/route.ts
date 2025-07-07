import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) {
      return NextResponse.json({ error: 'Missing or invalid URL parameter' }, { status: 400 });
    }

    console.log('TIFF Proxy: Fetching URL:', url);
    
    // Fetch the TIFF file from the presigned URL
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'AssetGeneration-TiffProxy/1.0',
      },
    });

    if (!response.ok) {
      console.error('TIFF Proxy: Failed to fetch:', response.status, response.statusText);
      return NextResponse.json({ 
        error: `Failed to fetch TIFF: ${response.status} ${response.statusText}` 
      }, { status: response.status });
    }

    // Get the content type
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    
    console.log('TIFF Proxy: Successfully proxying TIFF file');
    
    // Stream the response
    const arrayBuffer = await response.arrayBuffer();
    
    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
    
  } catch (error) {
    console.error('TIFF Proxy: Error:', error);
    return NextResponse.json({ 
      error: 'Failed to proxy TIFF file',
      details: (error as Error).message 
    }, { status: 500 });
  }
} 