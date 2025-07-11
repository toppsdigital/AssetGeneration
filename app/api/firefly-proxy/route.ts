import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, jobUrl } = body;

    if (action === 'auth') {
      // Get Firefly token
      const tokenResponse = await fetch('https://ims-na1.adobelogin.com/ims/token/v3', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: process.env.FIREFLY_CLIENT_ID,
          client_secret: process.env.FIREFLY_CLIENT_SECRET,
          scope: 'openid,AdobeID,session,additional_info,read_organizations,firefly_api,ff_apis',
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error('Failed to get Firefly token');
      }

      const tokenData = await tokenResponse.json();
      return NextResponse.json(tokenData, { status: 200 });
    } 
    else if (action === 'status' && jobUrl) {
      // Get current token
      const tokenResponse = await fetch('https://ims-na1.adobelogin.com/ims/token/v3', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: process.env.FIREFLY_CLIENT_ID,
          client_secret: process.env.FIREFLY_CLIENT_SECRET,
          scope: 'openid,AdobeID,session,additional_info,read_organizations,firefly_api,ff_apis',
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error('Failed to get Firefly token');
      }

      const tokenData = await tokenResponse.json();
      const token = tokenData.access_token;

      // Check job status
      const statusResponse = await fetch(jobUrl, {
        headers: {
          'x-api-key': process.env.FIREFLY_CLIENT_ID,
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
      });

      if (!statusResponse.ok) {
        throw new Error('Failed to check job status');
      }

      const statusData = await statusResponse.json();
      return NextResponse.json(statusData, { status: 200 });
    }
    else {
      // Create Firefly asset
      const tokenResponse = await fetch('https://ims-na1.adobelogin.com/ims/token/v3', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: process.env.FIREFLY_CLIENT_ID,
          client_secret: process.env.FIREFLY_CLIENT_SECRET,
          scope: 'openid,AdobeID,session,additional_info,read_organizations,firefly_api,ff_apis',
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error('Failed to get Firefly token');
      }

      const tokenData = await tokenResponse.json();
      const token = tokenData.access_token;

      // Use the correct endpoint for Photoshop/Firefly PSD asset creation
      const response = await fetch('https://image.adobe.io/pie/psdService/documentOperations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.FIREFLY_CLIENT_ID,
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Firefly asset creation failed:', errorText);
        return NextResponse.json({ error: errorText }, { status: response.status });
      }

      const data = await response.json();
      return NextResponse.json(data, { status: 200 });
    }
  } catch (error: any) {
    console.error('Firefly proxy error:', error);
    return NextResponse.json({ 
      error: error.message || error.toString() || 'Internal server error' 
    }, { status: 500 });
  }
} 