// Using built-in fetch (Node 22+), no external package needed

// Magic Brisk API key (provided by user)
const API_KEY = process.env.INGEST_API_KEY || 'sk_test_placeholder';
// Tenant slug for Delpat workspace
const TENANT = 'delpat';
// Ingest endpoint (local dev server)
const ENDPOINT = `http://localhost:5000/api/v1/ingest/${TENANT}`;

// Simple schema for Magic Brisk leads – adjust fields as needed
interface Lead {
  name: string;
  phone: string;
  locality: string;
  source: string; // identifier for source, e.g., 'magic_brisk'
}

// Generate dummy leads
function generateLead(idx: number): Lead {
  return {
    name: `Magic Brisk Lead ${idx}`,
    phone: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
    locality: ['Wakad', 'Baner', 'Kothrud', 'Aundh'][idx % 4],
    source: 'magic_brisk',
  };
}

async function sendLead(lead: Lead) {
  const resp = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
    body: JSON.stringify(lead),
  });
  const data = await resp.json();
  console.log(`[Lead ${lead.name}] status: ${resp.status}`, data);
}

(async () => {
  console.log('=== Magic Brisk Ingest Test: sending 10 leads ===');
  for (let i = 1; i <= 10; i++) {
    const lead = generateLead(i);
    try {
      await sendLead(lead);
    } catch (err) {
      console.error('Error sending lead', i, err);
    }
  }
  console.log('=== Done ===');
})();
