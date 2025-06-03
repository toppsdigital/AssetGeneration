import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { key } = req.body;
  if (!key) return res.status(400).json({ error: 'Missing key' });

  // Extract just the filename from the full path
  const filename = key.split('/').pop()!;
  const tmpPath = path.join('/tmp', filename);
  
  if (fs.existsSync(tmpPath)) {
    return res.status(200).json({ downloaded: true, localPath: tmpPath });
  }

  // Get presigned GET URL from your local S3 proxy
  console.log('Requesting S3 presigned URL for key:', filename);
  const proxyRes = await fetch('http://localhost:3000/api/s3-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_method: 'get', filename }),
  });
  const { url } = await proxyRes.json();
  console.log('Presigned URL:', url);

  // Download and save to /tmp
  const fileRes = await fetch(url);
  if (!fileRes.ok) {
    console.error(`Failed to download file from S3. Status: ${fileRes.status}`);
    return res.status(500).json({ error: `Failed to download file from S3. Status: ${fileRes.status}` });
  }
  const contentType = fileRes.headers.get('content-type');
  const arrayBuffer = await fileRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  console.log(`Downloaded file size: ${buffer.length} bytes, Content-Type: ${contentType}`);
  if (buffer.length < 1000) { // PSDs are usually much larger
    console.error('Downloaded file is suspiciously small. Aborting.');
    return res.status(500).json({ error: 'Downloaded file is too small to be a valid PSD.' });
  }
  fs.writeFileSync(tmpPath, buffer);

  return res.status(200).json({ downloaded: true, localPath: tmpPath });
} 