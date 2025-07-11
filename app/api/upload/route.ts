import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import formidable from 'formidable';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const form = formidable({ uploadDir: path.join(process.cwd(), 'inputs') });

    // Convert NextRequest to a format that formidable can understand
    const req = {
      method: 'POST',
      headers: Object.fromEntries(request.headers.entries()),
      body: request.body,
    };

    return new Promise<NextResponse>((resolve) => {
      form.parse(req as any, (err, fields, files) => {
        if (err) {
          resolve(NextResponse.json({ error: err.message }, { status: 500 }));
        } else {
          resolve(NextResponse.json({ success: true }, { status: 200 }));
        }
      });
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 