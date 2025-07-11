import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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
    return res.status(500).json({ error: 'Failed to get presigned S3 LIST URL' });
  }
  const { url } = await listRes.json();

  // Fetch the list of files from S3 using the presigned URL
  const s3Res = await fetch(url);
  if (!s3Res.ok) {
    return res.status(500).json({ error: 'Failed to fetch S3 file list' });
  }
  const xml = await s3Res.text();

  // Parse the XML to extract .psd file names
  const matches = Array.from(xml.matchAll(/<Key>([^<]+\.psd)<\/Key>/g));
  const files = matches.map(m => m[1]);

  res.status(200).json({ files });
} 