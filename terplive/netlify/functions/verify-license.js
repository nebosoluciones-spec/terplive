// netlify/functions/verify-license.js
const SUPABASE_URL = 'https://vtljsmizxchnbgduojqz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0bGpzbWl6eGNobmJnZHVvanF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2NzA1OTcsImV4cCI6MjA5MDI0NjU5N30.lUK71hrRC8UpAoJ-1wD-tQ8J0e66NtRzewsyYRg7cuY';

// Your Gumroad product ID (found in Content → License Key section)
const GUMROAD_PRODUCT_ID = 'T4yKpzpEr3az0M4Jm1_3IA==';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

async function supabaseQuery(path, method='GET', body=null){
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': method==='POST' ? 'return=representation' : ''
    },
    body: body ? JSON.stringify(body) : null
  });
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, data: JSON.parse(text) }; }
  catch(e) { return { ok: res.ok, status: res.status, data: text }; }
}

async function verifyWithGumroad(licenseKey){
  const res = await fetch('https://api.gumroad.com/v2/licenses/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      product_id: GUMROAD_PRODUCT_ID,
      license_key: licenseKey,
      increment_uses_count: 'false'
    })
  });
  return res.json();
}

exports.handler = async (event) => {
  if(event.httpMethod === 'OPTIONS') return { statusCode:200, headers, body:'' };
  if(event.httpMethod !== 'POST') return { statusCode:405, headers, body: JSON.stringify({error:'Method not allowed'}) };

  let license_key, fingerprint;
  try {
    const body = JSON.parse(event.body);
    license_key = body.license_key?.trim().toUpperCase();
    fingerprint = body.fingerprint;
  } catch(e) {
    return { statusCode:400, headers, body: JSON.stringify({error:'Invalid body'}) };
  }

  if(!license_key) return { statusCode:400, headers, body: JSON.stringify({error:'Missing license key'}) };

  try {
    // 1. Check if already activated in our DB
    const existing = await supabaseQuery(`licenses?license_key=eq.${encodeURIComponent(license_key)}&select=license_key,fingerprint`);
    if(existing.ok && existing.data && existing.data.length > 0){
      // Already in DB — valid
      return { statusCode:200, headers, body: JSON.stringify({ valid: true, source: 'db' }) };
    }

    // 2. Verify with Gumroad using product_id
    const result = await verifyWithGumroad(license_key);
    if(!result.success){
      return { statusCode:200, headers, body: JSON.stringify({ valid: false, error: 'License not found in Gumroad' }) };
    }

    // 3. Save to Supabase
    await supabaseQuery('licenses', 'POST', { license_key, fingerprint });

    return { statusCode:200, headers, body: JSON.stringify({ valid: true, source: 'gumroad' }) };

  } catch(err) {
    return { statusCode:500, headers, body: JSON.stringify({error: err.message}) };
  }
};
