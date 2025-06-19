import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.query;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid URL parameter' });
  }

  try {
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
      return res.status(response.status).json({ 
        error: `Failed to fetch TIFF: ${response.status} ${response.statusText}` 
      });
    }

    // Get the content type
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    
    // Set appropriate headers to allow CORS and caching
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    
    console.log('TIFF Proxy: Successfully proxying TIFF file');
    
    // Stream the response
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    res.status(200).send(buffer);
    
  } catch (error) {
    console.error('TIFF Proxy: Error:', error);
    res.status(500).json({ 
      error: 'Failed to proxy TIFF file',
      details: (error as Error).message 
    });
  }
} 