import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('Firefly Proxy - Incoming request:', body);

    const { action, ...params } = body;

    // Forward request to the Firefly service
    const FIREFLY_API_URL = process.env.FIREFLY_API_URL || 'https://firefly-api.adobe.io';
    
    let endpoint = '';
    let method = 'POST';
    let requestBody = params;

    switch (action) {
      case 'create':
        endpoint = '/v3/images/modify';
        break;
      case 'status':
        endpoint = params.jobUrl?.replace(FIREFLY_API_URL, '') || '/v3/images/status';
        method = 'GET';
        requestBody = undefined;
        break;
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    const response = await fetch(`${FIREFLY_API_URL}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.FIREFLY_ACCESS_TOKEN}`,
        'x-api-key': process.env.FIREFLY_CLIENT_ID || '',
      },
      body: requestBody ? JSON.stringify(requestBody) : undefined,
    });

    console.log('Firefly API response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Firefly API error:', errorText);
      return NextResponse.json(
        { error: 'Firefly API error', details: errorText },
        { status: response.status }
      );
    }

    const result = await response.json();
    console.log('Firefly API success:', result);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Firefly Proxy error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
} 