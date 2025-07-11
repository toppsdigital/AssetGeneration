import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import formidable from 'formidable';
import { IncomingMessage } from 'http';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const form = formidable({ uploadDir: path.join(process.cwd(), 'inputs') });

  form.parse(req as IncomingMessage, (err, fields, files) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.status(200).json({ success: true });
  });
} 