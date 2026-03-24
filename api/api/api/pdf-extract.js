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
        catch(e) { resolve({ status: res.statusCode, body: { raw: data } }); }
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
  if (!KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada.' });

  const body = req.body || {};
  const { pdf_base64, obra } = body;
  if (!pdf_base64) return res.status(400).json({ error: 'PDF não enviado' });

  const systemPrompt = `Você é especialista em levantamento de quantitativos para engenharia civil no Brasil.
Analise o PDF e extraia TODOS os materiais, equipamentos e especificações.
Retorne SOMENTE um JSON válido, sem texto adicional, sem markdown:
{"tipo_documento":"elétrico/hidráulico/arquitetônico/estrutural/memorial/outro","descricao_projeto":"breve descrição","items":[{"nome":"nome do item","descricao":"descrição completa","especificacao":"especificação técnica","quantidade":0,"unidade":"m/m²/UN/kg","categoria":"eletrica/arco/drywall/alvenaria/piso/hidraulica/esgoto/logistica/outros"}],"observacoes":"observações"}`;

  const payload = JSON.stringify({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 4000,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf_base64 } },
        { type: 'text', text: `Extraia todos os materiais e quantitativos${obra ? ' para a obra: ' + obra : ''}. Retorne apenas o JSON.` }
      ]
    }]
  });

  try {
    const result = await post({
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'x-api-key': KEY,
      'anthropic-version': '2023-06-01'
    }, payload);

    if (result.status !== 200) {
      return res.status(result.status).json({ error: result.body?.error?.message || `Erro API ${result.status}` });
    }
    const text = (result.body?.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const clean = text.replace(/```json|```/g, '').trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) return res.status(200).json({ error: 'Não foi possível extrair dados do PDF.' });
    return res.status(200).send(match[0]);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
