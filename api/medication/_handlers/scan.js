const core = require('../../../server-src/_lib/doctorai-core.cjs');

const json = (response, status, payload) => core.json(response, status, payload);
const MAX_REQUEST_BYTES = 4_000_000;
const MAX_IMAGE_DATA_URL = 3_900_000;
const MEDICATION_FIELDS = ['name', 'dose', 'activeIngredients', 'frequency', 'time', 'instructions', 'supply', 'refill', 'startDate', 'endDate', 'prescriptionExpiry', 'repeats'];
const FREQUENCIES = new Set(['Once daily', 'Twice daily', 'As needed', 'Weekly']);

const medicationSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', description: 'Medicine name copied only from clearly visible text, or an empty string.' },
    dose: { type: 'string', description: 'Strength or dosage copied only from clearly visible text, or an empty string.' },
    activeIngredients: { type: 'array', description: 'Active ingredient names only when clearly printed in the visible active-ingredient/composition section. Never infer ingredients from a brand name. Return an empty array when absent or unclear.', items: { type: 'string', maxLength: 120 }, maxItems: 8 },
    frequency: { type: 'string', enum: ['', 'Once daily', 'Twice daily', 'As needed', 'Weekly'] },
    time: { type: 'string', description: 'Explicit visible time in 24-hour HH:MM format, or an empty string.' },
    instructions: { type: 'string', description: 'Visible patient directions copied exactly, or an empty string.' },
    supply: { type: 'string', description: 'Visible numeric quantity supplied, digits only, or an empty string.' },
    refill: { type: 'string', description: 'Explicit visible refill date as YYYY-MM-DD, or an empty string.' },
    startDate: { type: 'string', description: 'Explicit visible start date as YYYY-MM-DD, or an empty string.' },
    endDate: { type: 'string', description: 'Explicit visible end date as YYYY-MM-DD, or an empty string.' },
    prescriptionExpiry: { type: 'string', description: 'Explicit visible prescription expiry date as YYYY-MM-DD, or an empty string.' },
    repeats: { type: 'string', description: 'Visible repeat count text, or an empty string.' }
  },
  required: MEDICATION_FIELDS
};

function decodedImage(image) {
  if (!image || image.length > MAX_IMAGE_DATA_URL) return null;
  const match = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(image);
  if (!match || match[2].length % 4 !== 0) return null;
  const mime = match[1].toLowerCase() === 'jpg' ? 'jpeg' : match[1].toLowerCase();
  const bytes = Buffer.from(match[2], 'base64');
  const normalizedInput = match[2].replace(/=+$/, '');
  const normalizedOutput = bytes.toString('base64').replace(/=+$/, '');
  if (!bytes.length || normalizedInput !== normalizedOutput) return null;
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp = bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  if ((mime === 'jpeg' && !jpeg) || (mime === 'png' && !png) || (mime === 'webp' && !webp)) return null;
  return { mime, bytes: bytes.length };
}

function outputContent(result) {
  return Array.isArray(result?.output)
    ? result.output.flatMap(item => Array.isArray(item?.content) ? item.content : [])
    : [];
}

function validDate(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const parsed = new Date(`${text}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text ? text : '';
}

function normalizeExtractedMedication(medication) {
  const field = (name, max) => String(medication?.[name] || '').replace(/\s+/g, ' ').trim().slice(0, max);
  const frequency = field('frequency', 20);
  const time = field('time', 5);
  const supply = field('supply', 20);
  const activeIngredients = Array.isArray(medication?.activeIngredients)
    ? [...new Set(medication.activeIngredients.map(item => String(item || '').replace(/\s+/g, ' ').trim().slice(0, 120)).filter(Boolean))].slice(0, 8)
    : [];
  const scanned = {
    name: field('name', 120),
    dose: field('dose', 80),
    activeIngredients,
    frequency: FREQUENCIES.has(frequency) ? frequency : '',
    time: /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : '',
    instructions: field('instructions', 500),
    supply: /^\d{1,6}$/.test(supply) ? supply : '',
    refill: validDate(medication?.refill),
    startDate: validDate(medication?.startDate),
    endDate: validDate(medication?.endDate),
    prescriptionExpiry: validDate(medication?.prescriptionExpiry),
    repeats: field('repeats', 30)
  };
  const missing = ['name', 'dose'].filter(key => !scanned[key]);
  const fields = Object.fromEntries(MEDICATION_FIELDS.map(key => [key, {
    status: Array.isArray(scanned[key]) ? (scanned[key].length ? 'extracted' : 'not_extracted') : (scanned[key] ? 'extracted' : 'not_extracted'),
    confirmation: 'required',
    confidence: 'not_reported'
  }]));
  return { medication: scanned, review: { required: true, confirmed: false, fields, missing, message: missing.length ? 'Some required label details were not clear enough to fill. Enter and review them manually; every extracted field still needs confirmation against the original.' : 'Review every extracted field against the medicine box or prescription before saving. An empty field may mean the scan did not read it; check the original label.' } };
}

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') return json(response, 405, { error: 'Method not allowed.' });
  const contentLength = Number(request.headers?.['content-length'] || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) return json(response, 413, { error: 'That image is too large to scan. Try a closer photo or choose a smaller image.' });
  const account = await core.identityFromRequest(request);
  if (!account) return json(response, 401, { error: 'Sign in before scanning a medicine label.' });
  if (!core.storageConfigured()) return json(response, 503, { error: 'Secure account access is temporarily unavailable. Please try again shortly.' });
  const access = await core.activeEntitlement(request, account);
  if (!access) return json(response, 403, { error: 'Medication image scanning is a DoctorAI Pro feature.' });

  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  const model = String(process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || 'gpt-5-mini').trim();
  if (!apiKey || !/^[A-Za-z0-9._:-]{1,120}$/.test(model)) return json(response, 503, { error: 'Medication image scanning is not configured yet.' });

  let body = {};
  try {
    body = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : (request.body || {});
  } catch {
    return json(response, 400, { error: 'Invalid image scan request.' });
  }
  if (body.consent !== true) return json(response, 400, { error: 'Confirm that you want to send this medicine-label image to OpenAI for text extraction.' });
  const image = String(body.image || '');
  if (!decodedImage(image)) return json(response, 400, { error: 'Use a clear JPG, PNG or WEBP image small enough to send securely.' });

  const limit = await core.rateLimit(request, `medication-scan:${core.accountKey(account)}`, 12, 60 * 60 * 1000);
  if (!limit.allowed) {
    response.setHeader('Retry-After', String(limit.retryAfter));
    return json(response, 429, { error: 'Too many label scans. Please try again later.' });
  }

  try {
    const upstream = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({
        model,
        store: false,
        ...(model.startsWith('gpt-5') ? { reasoning: { effort: 'minimal' } } : {}),
        instructions: 'Read only clearly visible medicine-box or prescription-label text. Copy text exactly and leave any unclear or absent value empty. Copy active ingredient names only if a clearly visible active-ingredient or composition section explicitly names them; never infer an ingredient from a brand, medicine name, strength, or image. Do not include excipients as active ingredients. Never infer a prescription, diagnosis, treatment, dosage, schedule, refill, or instruction. The person must review every field against the original label before saving.',
        input: [{ role: 'user', content: [{ type: 'input_text', text: 'Extract only the visible medication details into the required schema.' }, { type: 'input_image', image_url: image, detail: 'high' }] }],
        text: { format: { type: 'json_schema', name: 'visible_medication_label', strict: true, schema: medicationSchema } },
        max_output_tokens: 1600
      })
    });
    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      core.reportError('medication_scan_provider_error', { route: '/api/medication/scan', provider: 'openai', status: upstream.status, type: result?.error?.type, code: result?.error?.code });
      if ([401, 403].includes(upstream.status)) return json(response, 503, { error: 'Medication scanning is temporarily unavailable. You can enter the details manually.' });
      if (upstream.status === 429) return json(response, 503, { error: 'Medication scanning is busy right now. Please wait a moment and try again.' });
      if (upstream.status >= 500) return json(response, 502, { error: 'Medication scanning is temporarily unavailable. Please try again.' });
      return json(response, 422, { error: 'This image could not be processed. Try a clearer label photo or enter the details manually.' });
    }

    const parts = outputContent(result);
    const refusal = parts.some(part => part?.type === 'refusal' || part?.refusal);
    if (refusal) {
      core.reportError('medication_scan_refused', { route: '/api/medication/scan', provider: 'openai', type: 'refusal' });
      return json(response, 422, { error: 'This image could not be read safely. Try a clear photo showing only the medicine label, or enter the details manually.' });
    }
    if (result?.status && result.status !== 'completed') {
      core.reportError('medication_scan_incomplete', { route: '/api/medication/scan', provider: 'openai', status: result.status, code: result?.incomplete_details?.reason || result?.error?.code });
      return json(response, 502, { error: 'The scan could not finish. Please try once more with the label in good light.' });
    }

    const rawText = String(result?.output_text || parts.map(part => part?.text || part?.output_text || '').join('') || '').trim();
    if (!rawText) {
      core.reportError('medication_scan_empty', { route: '/api/medication/scan', provider: 'openai', code: 'empty_output' });
      return json(response, 502, { error: 'No readable label details were returned. Try a closer photo or enter them manually.' });
    }
    return json(response, 200, normalizeExtractedMedication(JSON.parse(rawText)));
  } catch (error) {
    const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    core.reportError(timeout ? 'medication_scan_timeout' : 'medication_scan_failed', { route: '/api/medication/scan', provider: 'openai', name: error?.name, operation: timeout ? 'timeout' : 'parse_or_transport' });
    return json(response, timeout ? 504 : 502, { error: timeout ? 'The scan took too long. Please try again with a closer label photo.' : 'The image could not be read. You can enter the details manually.' });
  }
};

module.exports.normalizeExtractedMedication = normalizeExtractedMedication;
