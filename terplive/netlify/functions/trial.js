// netlify/functions/trial.js
const SUPABASE_URL = 'https://vtljsmizxchnbgduojqz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0bGpzbWl6eGNobmJnZHVvanF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2NzA1OTcsImV4cCI6MjA5MDI0NjU5N30.lUK71hrRC8UpAoJ-1wD-tQ8J0e66NtRzewsyYRg7cuY';
const TRIAL_DURATION_MS = 3 * 60 * 60 * 1000;

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

exports.handler = async (event) => {
  if(event.httpMethod === 'OPTIONS') return { statusCode:200, headers, body:'' };
  if(event.httpMethod !== 'POST') return { statusCode:405, headers, body: JSON.stringify({error:'Method not allowed'}) };

  let fingerprint;
  try { fingerprint = JSON.parse(event.body).fingerprint; }
  catch(e) { return { statusCode:400, headers, body: JSON.stringify({error:'Invalid body'}) }; }

  if(!fingerprint || fingerprint.length < 8)
    return { statusCode:400, headers, body: JSON.stringify({error:'Invalid fingerprint'}) };

  try {
    const existing = await supabaseQuery(`trials?fingerprint=eq.${encodeURIComponent(fingerprint)}&select=started_at`);
    let startedAt;

    if(existing.ok && existing.data && existing.data.length > 0){
      startedAt = new Date(existing.data[0].started_at).getTime();
    } else {
      const insert = await supabaseQuery('trials', 'POST', { fingerprint });
      if(!insert.ok) return { statusCode:500, headers, body: JSON.stringify({error:'Could not create trial'}) };
      startedAt = insert.data[0]?.started_at ? new Date(insert.data[0].started_at).getTime() : Date.now();
    }

    const elapsed = Date.now() - startedAt;
    const remaining = Math.max(0, TRIAL_DURATION_MS - elapsed);
    return { statusCode:200, headers, body: JSON.stringify({ remaining, started_at: startedAt }) };

  } catch(err) {
    return { statusCode:500, headers, body: JSON.stringify({error: err.message}) };
  }
};
