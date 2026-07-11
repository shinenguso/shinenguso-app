export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { system, user, meta } = req.body;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 3500,
        system: system,
        messages: [{ role: 'user', content: user }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return res.status(response.status).json({ error });
    }

    const data = await response.json();
    const text = data.content?.map(c => c.text || '').join('') || '';

    if (process.env.GOOGLE_SHEET_URL && meta) {
      try {
        const sheetData = {
          timestamp: new Date().toISOString(),
          name: meta.name || '',
          soul: meta.soul || '',
          year: meta.year || '',
          coord: meta.coord || '',
          question: meta.question || '',
          report: text,
          dataType: meta.dataType || 'B2C自測',
          client: meta.client || '',
          useCase: meta.useCase || '',
          targetRole: meta.targetRole || '',
          feedback: meta.feedback || '',
          status: meta.status || '',
        };
        console.log('Sheets logging: attempting to POST to', process.env.GOOGLE_SHEET_URL);
        const sheetRes = await fetch(process.env.GOOGLE_SHEET_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sheetData),
        });
        const sheetResText = await sheetRes.text();
        console.log('Sheets logging: response status =', sheetRes.status, ', body =', sheetResText);
      } catch (logErr) {
        console.error('Sheets log setup error:', logErr);
      }
    }

    return res.status(200).json({ text });

  } catch (err) {
    console.error('API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
