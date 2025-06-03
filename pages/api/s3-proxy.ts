import type { NextApiRequest, NextApiResponse } from 'next';

const S3_SERVICE_URL = 'https://devops-dev.services.toppsapps.com/s3/presigned-url';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { client_method } = req.body;

  if (client_method === 'list') {
    // Use the working endpoint and payload from the user's curl command
    const backendEndpoint = 'https://devops-dev.services.toppsapps.com/s3/presigned-url';

    const listRes = await fetch(backendEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_method: 'list',
        expires_in: 3600,
      }),
    });
    if (!listRes.ok) {
      return res.status(500).json({ error: 'Failed to get presigned S3 LIST URL' });
    }
    const { url } = await listRes.json();

    const s3Res = await fetch(url);
    if (!s3Res.ok) {
      return res.status(500).json({ error: 'Failed to fetch S3 file list' });
    }
    const xml = await s3Res.text();
    const matches = Array.from(xml.matchAll(/<Key>([^<]+\.psd)<\/Key>/g));
    const files = matches.map(m => m[1]);
    return res.status(200).json({ files });
  }

  if (client_method === 'put') {
    const { filename } = req.body;
    const backendEndpoint = 'https://devops-dev.services.toppsapps.com/s3/presigned-url';

    const putRes = await fetch(backendEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_method: 'put',
        filename,
      }),
    });
    if (!putRes.ok) {
      return res.status(500).json({ error: 'Failed to get presigned S3 PUT URL' });
    }
    const { url } = await putRes.json();
    return res.status(200).json({ url });
  }

  if (client_method === 'get') {
    const { filename } = req.body;
    if (!filename) {
      return res.status(400).json({ error: 'Missing filename for GET request' });
    }

    const backendEndpoint = 'https://devops-dev.services.toppsapps.com/s3/presigned-url';
    const getRes = await fetch(backendEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_method: 'get',
        filename,
        expires_in: 720,
      }),
    });

    if (!getRes.ok) {
      return res.status(500).json({ error: 'Failed to get presigned S3 GET URL' });
    }
    const { url } = await getRes.json();
    return res.status(200).json({ url });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Forward the request body exactly as received
    const requestBody = req.body;
    
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
    return res.status(s3Res.status).json(data);
  } catch (error) {
    console.error('S3 Proxy - Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
} 