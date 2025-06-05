import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const form = formidable({});
    const [fields, files] = await form.parse(req);
    
    const presignedUrl = Array.isArray(fields.presignedUrl) ? fields.presignedUrl[0] : fields.presignedUrl;
    const file = Array.isArray(files.file) ? files.file[0] : files.file;

    if (!presignedUrl || !file) {
      return res.status(400).json({ error: 'Missing presignedUrl or file' });
    }

    console.log('S3 Upload: Uploading file to S3 via presigned URL...');
    console.log('File size:', file.size);
    console.log('File type:', file.mimetype);

    // Read the file data
    const fs = require('fs');
    const fileData = fs.readFileSync(file.filepath);

    // Upload to S3 using the presigned URL
    const uploadResponse = await fetch(presignedUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.mimetype || 'application/octet-stream',
      },
      body: fileData,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('S3 Upload failed:', uploadResponse.status, errorText);
      return res.status(500).json({ 
        error: `S3 upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`,
        details: errorText
      });
    }

    console.log('S3 Upload: Successfully uploaded to S3');
    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('S3 Upload error:', error);
    return res.status(500).json({ error: 'Upload failed', details: error.message });
  }
} 