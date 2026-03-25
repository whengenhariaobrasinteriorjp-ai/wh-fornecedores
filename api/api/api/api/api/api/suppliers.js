module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const saved = process.env.WH_SUPPLIERS_SHARED || '[]';
    return res.status(200).send(saved);
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    const s = body.supplier;
    if (!s?.empresa) return res.status(400).json({ error: 'Dados inválidos' });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
};
