// test-firefly.js
// Using built-in fetch (Node.js 18+)

async function getFireflyToken() {
  const url = 'https://ims-na1.adobelogin.com/ims/token/v3';
  const params = new URLSearchParams();
  params.append('client_id', FIREFLY_CLIENT_ID);
  params.append('client_secret', FIREFLY_CLIENT_SECRET);
  params.append('grant_type', 'client_credentials');
  params.append('scope', 'openid,AdobeID,read_organizations');

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });

  if (!res.ok) {
    throw new Error(`Token request failed: ${res.status} ${res.statusText}\n${await res.text()}`);
  }
  return res.json();
}

async function createFireflyAsset(token) {
  const endpoint = 'https://image.adobe.io/pie/psdService/documentOperations';
  const payload = {
    "inputs": [
      {
        "storage": "external",
        "href": "https://your-s3-url/your.psd" // <-- Replace with your actual PSD S3 URL
      }
    ],
    "options": {
      "layers": [
        // You can leave this empty for a minimal test, or add a sample layer object
      ]
    },
    "outputs": [
      {
        "href": "https://your-s3-url/output.png", // <-- Replace with your actual output S3 URL
        "storage": "external",
        "type": "image/png"
      }
    ]
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'x-api-key': FIREFLY_API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }

  if (!res.ok) {
    throw new Error(`Asset generation failed: ${res.status} ${res.statusText}\n${JSON.stringify(json, null, 2)}`);
  }
  return json;
}

async function testAssetGeneration() {
  try {
    const tokenData = await getFireflyToken();
    const token = tokenData.access_token;
    console.log('Token received:', token.slice(0, 16) + '...');

    const result = await createFireflyAsset(token);
    console.log('Asset generation response:', result);
    console.log('✅ Asset generation test successful!');
  } catch (err) {
    console.error('❌ Asset generation test failed:', err.message);
  }
}

testAssetGeneration(); 