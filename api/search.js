const https = require('https');

function post(reqHeaders, payload) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: reqHeaders
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, body: { raw: data } }); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const KEY = process.env.ANTHROPIC_API_KEY;
  if (!KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada no Vercel.' });

  const body = req.body || {};
  const query = (body.query || '').trim();
  if (!query) return res.status(400).json({ error: 'Campo query obrigatório' });

  const SYSTEM = `Você é especialista em fornecedores para engenharia civil e construção no Brasil (SP/Campinas).\nRetorne SOMENTE este JSON, sem texto extra, sem markdown:\n{"empresa":"NOME MAIÚSC","ramo":"produto/serviço","contato":"","telefone":"","whatsapp":"","email":"","endereco":"","cidade":"CIDADE - SP","cep":"","cnpj":"","site":"","categoria":"categoria","fonte":""}`;

  const makePayload = (webSearch) => {
    const obj = {
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 600,
      system: SYSTEM,
      messages: [{ role: 'user', content: 'Fornecedor: ' + query }]
    };
    if (webSearch) obj.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
    return JSON.stringify(obj);
  };

  const makeHeaders = (payload, webSearch) => {
    const hh = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'x-api-key': KEY,
      'anthropic-version': '2023-06-01'
    };
    if (webSearch) hh['anthropic-beta'] = 'web-search-2025-03-05';
    return hh;
  };

  try {
    let p1 = makePayload(true);
    let r = await post(makeHeaders(p1, true), p1);
    if (r.status !== 200) {
      let p2 = makePayload(false);
      r = await post(makeHeaders(p2, false), p2);
    }
    if (r.status !== 200) {
      const msg = r.body?.error?.message || r.body?.raw || `Erro ${r.status}`;
      return res.status(r.status).json({ error: msg });
    }
    const text = (r.body?.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const clean = text.replace(/```json|```/g, '').trim();
    const m = clean.match(/\{[\s\S]*\}/);
    if (!m) return res.status(200).json({ error: 'Fornecedor não encontrado.' });
    return res.status(200).send(m[0]);
  } catch (err) {
    return res.status(500).json({ error: 'Erro: ' + err.message });
  }
};
