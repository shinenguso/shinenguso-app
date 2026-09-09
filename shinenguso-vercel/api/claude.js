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
    const { system, user, meta, max_tokens } = req.body;
    // 預設維持3500（提問框用），模組報告等其他呼叫可在request body帶max_tokens覆蓋，上限20000避免誤用造成成本失控
    const safeMaxTokens = Math.min(20000, Math.max(500, parseInt(max_tokens, 10) || 3500));

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: safeMaxTokens,
        system: system,
        messages: [{ role: 'user', content: user }],
        // claude-sonnet-5 預設會自動開啟「adaptive thinking」，思考過程會佔用max_tokens額度，
        // 導致回應變慢、甚至可能把整個max_tokens額度耗在思考上而沒有真正的輸出文字。
        // 這裡的產品場景是直接生成結構化報告文字，不需要模型內部推理過程，所以明確關閉。
        thinking: { type: 'disabled' },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return res.status(response.status).json({ error });
    }

    const data = await response.json();
    const text = data.content?.map(c => c.text || '').join('') || '';

    // ── Google Sheet 記錄：fire-and-forget（方案A）──
    // 不 await，讓寫入在背景進行，不拖慢回傳給使用者的時間。
    // 取捨：Vercel 有機率在回應送出後就凍結這個執行環境，
    // 導致這個背景請求偶爾來不及送達、漏記一兩筆 log，
    // 但這只影響後台數據追蹤，不影響使用者拿到的報告內容。
    if (process.env.GOOGLE_SHEET_URL && meta) {
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
      fetch(process.env.GOOGLE_SHEET_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sheetData),
      })
        .then(sheetRes => sheetRes.text().then(sheetResText => {
          console.log('Sheets logging: response status =', sheetRes.status, ', body =', sheetResText);
        }))
        .catch(logErr => {
          console.error('Sheets log setup error:', logErr);
        });
    }

    return res.status(200).json({ text });

  } catch (err) {
    console.error('API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
