export interface PresignedUrlResponse {
  url: string;
  fields?: Record<string, string>;
}

export async function getPresignedUrl({
  filename,
  method,
  expires_in = 720,
}: {
  filename: string;
  method: 'put' | 'get';
  expires_in?: number;
}): Promise<string> {
  const res = await fetch('/api/s3-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      filename,
      client_method: method, 
      expires_in 
    }),
  });
  if (!res.ok) throw new Error('Failed to get presigned URL');
  const data = await res.json();
  return data.url;
}

export async function uploadFileToPresignedUrl(url: string, file: File | Blob) {
  const res = await fetch(url, {
    method: 'PUT',
    body: file,
  });
  if (!res.ok) throw new Error('Failed to upload file');
  return res;
} 