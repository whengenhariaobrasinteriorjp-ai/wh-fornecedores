const https = require('https');

function httpsPost(options, bodyStr) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: { raw: data } }); }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada.' });

  const body = req.body || {};
  const { produto, quantidade, unidade, cidade } = body;
  if (!produto) return res.status(400).json({ error: 'Campo produto obrigatório' });

  const systemPrompt = `Você é especialista em orçamentos para engenharia civil e construção no Brasil.
Estime o preço atual do material com base no mercado brasileiro.
Retorne SOMENTE um JSON válido, sem texto adicional, sem markdown:
{"produto":"nome","unidade":"UN/m/m²/kg","preco_minimo":0.00,"preco_medio":0.00,"preco_maximo":0.00,"fontes":[{"site":"nome site","preco":0.00,"url":"","descricao":"desc produto"}],"observacoes":"variações relevantes","data_pesquisa":"março 2026","confiabilidade":"ALTA/MEDIA/BAIXA","nota_tecnica":"info técnica relevante"}`;

  const userMsg = `Estime preço de: ${produto}${quantidade ? ` — ${quantidade} ${unidade||'UN'}` : ''}. Região: ${cidade || 'São Paulo/Campinas SP'}. Foco em preço para construtoras.`;

  const tryRequest = async (useWebSearch) => {
    const reqBody = {
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1200,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMsg }]
    };
    if (useWebSearch) reqBody.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
    const payload = JSON.stringify(reqBody);
    const reqHeaders = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01'
    };
    if (useWebSearch) reqHeaders['anthropic-beta'] = 'web-search-2025-03-05';
    return httpsPost({ hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST', headers: reqHeaders }, payload);
  };

  try {
    let result = await tryRequest(true);
    if (result.status !== 200) result = await tryRequest(false);
    if (result.status !== 200) {
      return res.status(result.status).json({ error: result.body?.error?.message || `Erro ${result.status}` });
    }
    const content = result.body?.content || [];
    const text = content.filter(b => b.type === 'text').map(b => b.text).join('');
    const clean = text.replace(/```json|```/g, '').trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) return res.status(200).json({ error: 'Não foi possível estruturar os preços.' });
    return res.status(200).send(match[0]);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
