const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_START = '2025-01-01';
const core = require('../server-src/_lib/doctorai-core.cjs');

const validDate = (value, fallback) => {
  const candidate = String(value || fallback);
  if (!DATE_PATTERN.test(candidate)) return fallback;
  const parsed = new Date(`${candidate}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? fallback : candidate;
};

const topicTerms = value => String(value || '')
  .normalize('NFKC')
  .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
  .toLowerCase()
  .split(/\s+/)
  .filter(term => term.length > 1)
  .slice(0, 8);

const researchQuery = (topic, start, end, broad = false) => {
  const terms = topicTerms(topic);
  const topicPart = terms.map(term => `"${term}"`).join(broad ? ' OR ' : ' AND ');
  return `${topicPart ? `(${topicPart}) AND ` : ''}FIRST_PDATE:[${start} TO ${end}] AND HAS_ABSTRACT:Y`;
};

module.exports = async function handler(request, response) {
  const query = request.query || {};
  const today = new Date().toISOString().slice(0, 10);
  const start = validDate(query.start, DEFAULT_START);
  const end = validDate(query.end, today);
  const pageSize = Math.min(Math.max(Number.parseInt(query.pageSize, 10) || 30, 1), 50);
  const requestIndex = async broad => {
    const params = new URLSearchParams({
      query: researchQuery(query.topic, start, end, broad),
      format: 'json',
      pageSize: String(pageSize),
      resultType: 'core'
    });
    const upstream = await fetch(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?${params}`, {
      headers: { accept: 'application/json', 'user-agent': 'DoctorAI research library/1.0' },
      signal: AbortSignal.timeout(12_000)
    });
    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) throw new Error('Research updates are unavailable.');
    return payload;
  };

  try {
    let payload = await requestIndex(false);
    let fallback = false;
    if (topicTerms(query.topic).length > 1 && !(Array.isArray(payload.resultList?.result) && payload.resultList.result.length)) {
      payload = await requestIndex(true);
      fallback = true;
    }
    response.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return response.status(200).json({
      source: 'Europe PMC',
      query: { topic: String(query.topic || '').slice(0, 80), start, end, fallback },
      results: Array.isArray(payload.resultList?.result) ? payload.resultList.result : []
    });
  } catch (error) {
    core.reportError('research_request_failed', { route: '/api/research', provider: 'europe-pmc', name: error?.name });
    return response.status(502).json({ error: 'Research updates are unavailable.' });
  }
}
