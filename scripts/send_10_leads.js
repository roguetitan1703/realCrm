import http from 'http';

const apiKey = process.env.INGEST_API_KEY || 'sk_test_placeholder';

async function sendLeads() {
  for (let i = 1; i <= 10; i++) {
    const payload = JSON.stringify({
      name: `Magic Brisk Batch2 Lead ${i}`,
      phone: `91111111${i < 10 ? '0' + i : i}`,
      locality: `Sector ${i}`,
      budget: `50-${60+i} Lacs`,
      project: `Brisk Towers ${i}`
    });

    await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: 'localhost',
        port: 5000,
        path: `/api/v1/ingest/delpat?key=${apiKey}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          console.log(`Lead ${i} response status:`, res.statusCode, data);
          resolve(data);
        });
      });

      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }
}

sendLeads().catch(console.error);
