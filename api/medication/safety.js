const { review } = require('../../server-src/medication/safety-engine.cjs');
module.exports = async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' });
  try {
    const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
    return response.status(200).json(review(body));
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError) return response.status(400).json({ error: 'Invalid medication check request. Provide 1–50 non-empty medicine names and valid allergy/condition lists. No partial check was returned.' });
    return response.status(500).json({ error: 'Medication check unavailable. Unable to determine from available data.' });
  }
};
