import type { NextApiRequest, NextApiResponse } from 'next';
import fetch from 'node-fetch';

export const config = {
  api: {
    bodyParser: false, // Disable body parsing to handle streams
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const presignedUrl = req.headers['x-presigned-url'] as string;

  if (!presignedUrl) {
    return res.status(400).json({ error: 'Missing x-presigned-url header' });
  }

  try {
    console.log('--- s3-upload: Forwarding file to S3 ---');
    console.log('Presigned URL:', presignedUrl);

    const response = await fetch(presignedUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/octet-stream',
        'Content-Length': req.headers['content-length'] || '0',
      },
      body: req, // Forward the raw request body stream
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('s3-upload: Error from S3:', response.status, errorText);
      return res.status(response.status).json({ error: 'Failed to upload to S3', details: errorText });
    }

    console.log('--- s3-upload: File successfully uploaded to S3 ---');
    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('s3-upload: Internal server error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
} 