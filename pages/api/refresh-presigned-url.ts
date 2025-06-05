import { NextApiRequest, NextApiResponse } from 'next';

const S3_SERVICE_URL = 'https://devops-dev.services.toppsapps.com/s3/presigned-url';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { filePath, expiresIn = 604800 } = req.body; // Default to 1 week

  if (!filePath) {
    return res.status(400).json({ error: 'File path is required' });
  }

  try {
    console.log(`Refreshing pre-signed URL for: ${filePath} with expiration: ${expiresIn}s`);
    
    // Clean the file path - remove leading slash if present
    const cleanFilePath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
    
    // Call the S3 service directly (server-side, no CORS issues)
    const s3Response = await fetch(S3_SERVICE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_method: 'get',
        filename: cleanFilePath,
        expires_in: expiresIn
      }),
    });

    console.log(`S3 service response status: ${s3Response.status}`);

    if (!s3Response.ok) {
      const errorData = await s3Response.json().catch(() => ({}));
      console.error('S3 service error:', errorData);
      throw new Error(errorData.error || `S3 service returned ${s3Response.status}`);
    }

    const data = await s3Response.json();
    console.log('Successfully refreshed pre-signed URL');
    
    // Return the new URL
    res.status(200).json({ 
      url: data.url,
      expiresIn: expiresIn
    });
  } catch (error) {
    console.error('Error refreshing pre-signed URL:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to refresh pre-signed URL' 
    });
  }
} 