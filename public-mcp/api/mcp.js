'use strict';

const SITE_ORIGIN = 'https://www.doctoraiworld.com';
const PROTOCOL_VERSION = '2026-01-26';
const SUPPORTED_PROTOCOLS = new Set([PROTOCOL_VERSION, '2025-11-25', '2025-06-18', '2025-03-26']);
const MAX_BODY_BYTES = 32_000;
const MAX_RESEARCH_RESULTS = 5;
const PUBLIC_USE_INSTRUCTION = 'This public plugin handles feature guides, direct website links, and general biomedical literature topics only. Do not ask the user to share symptoms, diagnoses, medicines or doses, medical history, or other personal health details, and do not send such details in a tool call. If the user requests personal medical advice, say this plugin cannot provide it, do not ask follow-up questions for their details, and suggest consulting a licensed clinician or pharmacist.';

const SITE_GUIDE = {
  overview: {
    title: 'DoctorAI Personal Health Hub',
    summary: 'The Health Hub helps people organise symptoms, medicines, appointments, measurements, documents and questions for a care conversation.',
    destination: 'health_hub',
    access: 'The core Hub can be used free. Entries may remain on the device; Google sign-in is needed for account sync and private server features.',
    limits: 'DoctorAI is for organisation and education. It is not a healthcare provider and does not diagnose or prescribe.'
  },
  symptoms: {
    title: 'Symptom Diary',
    summary: 'Record symptoms and surrounding context, then review repeated observations to prepare questions for a clinician.',
    destination: 'symptoms',
    access: 'Open the Health Hub on the website and enter only information you choose to save there. Do not share health details in this ChatGPT conversation.',
    limits: 'Patterns are observations, not confirmed causes or diagnoses.'
  },
  medications: {
    title: 'Medication tracking',
    summary: 'Keep a user-entered medication list, schedules and refill reminders together.',
    destination: 'medications',
    access: 'Basic manual tracking is part of the core Hub.',
    limits: 'Review every medicine and dose against its label and with a pharmacist or prescriber.'
  },
  prescription_scan: {
    title: 'Prescription and medicine-label scan',
    summary: 'The website can copy clearly visible text from a prescription or medicine label into a review form.',
    destination: 'prescription_scan',
    access: 'Scanning requires a signed-in DoctorAI account and an eligible account entitlement. The user reviews extracted fields before saving.',
    limits: 'The scan reads label text; it does not verify a prescription, confirm a dose, or check whether a personal medicine combination is safe.'
  },
  appointments: {
    title: 'Appointments',
    summary: 'Keep appointment details and preparation notes in the Health Hub.',
    destination: 'appointments',
    access: 'Open the Hub to add or review your own appointment information.',
    limits: 'DoctorAI does not book appointments with a clinic.'
  },
  care_summary: {
    title: 'Appointment summary',
    summary: 'Choose saved entries to prepare a concise summary for a care conversation; review it before printing or sharing.',
    destination: 'care_summary',
    access: 'The summary is prepared in the Health Hub from information the user selects.',
    limits: 'It is an organisational summary, not a clinical assessment.'
  },
  results: {
    title: 'Results and measurements',
    summary: 'Keep typed measurements and test information together and review measurement trends.',
    destination: 'results',
    access: 'Typed measurements are available in the core Hub. File and photo uploads and related extraction require an eligible account entitlement.',
    limits: 'AI explanations do not replace clinical advice.'
  },
  documents: {
    title: 'Private document library',
    summary: 'Organise health documents such as prescriptions, results, referrals and letters.',
    destination: 'documents',
    access: 'Private document access requires sign-in; secure uploads require an eligible account entitlement.',
    limits: 'This ChatGPT connection does not read, upload, or share documents.'
  },
  timeline: {
    title: 'Health timeline',
    summary: 'Keep user-entered health events together to prepare for appointments.',
    destination: 'timeline',
    access: 'Open the Health Hub to add or review your own entries.',
    limits: 'Timeline entries are not independently verified.'
  },
  health_memory: {
    title: 'Health Memory',
    summary: 'Choose whether to save approved details and which details to include with a DoctorAI chat question.',
    destination: 'health_memory',
    access: 'Sign in to manage Health Memory in the DoctorAI website.',
    limits: 'This ChatGPT connection cannot read, change, or transmit Health Memory.'
  },
  doctorai_chat: {
    title: 'Ask DoctorAI',
    summary: "Use the website's sign-in-protected AI conversation for health organisation and general education.",
    destination: 'doctorai_chat',
    access: 'Requires sign-in. Users choose what they send and whether approved Health Memory is included.',
    limits: 'The website assistant does not diagnose, prescribe, confirm medicine combinations as safe, or replace a clinician.'
  },
  profile: {
    title: 'Profile and privacy controls',
    summary: 'Choose device or session storage, manage sign-in, and access export or deletion controls.',
    destination: 'profile',
    access: 'Google sign-in is required for account sync and account-level deletion.',
    limits: 'This ChatGPT connection cannot change account settings or access stored health information.'
  }
};

const SITE_DESTINATIONS = {
  home: { path: '/', label: 'DoctorAI World home' },
  health_hub: { path: '/health-hub#today', label: 'Health Hub Today' },
  symptoms: { path: '/health-hub#symptoms', label: 'Symptom Diary' },
  medications: { path: '/health-hub#medications', label: 'Medication tracking' },
  prescription_scan: { path: '/health-hub#medications', label: 'Medication scanner' },
  appointments: { path: '/health-hub#appointments', label: 'Appointments' },
  care_summary: { path: '/health-hub#summary', label: 'Appointment summary' },
  results: { path: '/health-hub#results', label: 'Results and measurements' },
  documents: { path: '/health-hub#documents', label: 'Documents' },
  timeline: { path: '/health-hub#timeline', label: 'Health timeline' },
  health_memory: { path: '/health-hub#health', label: 'Health Memory' },
  doctorai_chat: { path: '/health-hub#ask', label: 'Ask DoctorAI' },
  profile: { path: '/health-hub#profile', label: 'Profile and privacy controls' }
};

const TOOLS = [
  {
    name: 'doctorai_website_guide',
    title: 'Guide to the DoctorAI website',
    description: 'Explain real DoctorAI Health Hub features, access requirements, and safety limits. This public tool does not access personal account data or display subscription plans. Do not ask the user to share health details or send them in a tool call; if personal medical advice is requested, decline without asking follow-up health questions.',
    inputSchema: {
      type: 'object',
      properties: {
        feature: {
          type: 'string',
          enum: Object.keys(SITE_GUIDE),
          description: 'Website feature to explain; defaults to overview.'
        }
      },
      additionalProperties: false
    },
    outputSchema: {
      type: 'object',
      properties: {
        feature: { type: 'string' },
        title: { type: 'string' },
        summary: { type: 'string' },
        access: { type: 'string' },
        limits: { type: 'string' },
        url: { type: 'string' }
      },
      required: ['feature', 'title', 'summary', 'access', 'limits', 'url'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  {
    name: 'doctorai_open_site',
    title: 'Open a DoctorAI website section',
    description: "Return a direct link to a real DoctorAI website page or Health Hub section. This opens the user's website workflow; it does not sign in, read, edit, or send personal health information. No subscription or checkout destination is available.",
    inputSchema: {
      type: 'object',
      properties: {
        destination: {
          type: 'string',
          enum: Object.keys(SITE_DESTINATIONS),
          description: 'DoctorAI page or Health Hub section to open.'
        }
      },
      required: ['destination'],
      additionalProperties: false
    },
    outputSchema: {
      type: 'object',
      properties: {
        destination: { type: 'string' },
        label: { type: 'string' },
        url: { type: 'string' }
      },
      required: ['destination', 'label', 'url'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  {
    name: 'search_health_research',
    title: 'Search public health research',
    description: 'Search Europe PMC for public biomedical abstracts by a general, non-identifying topic. Do not ask the user to share symptoms, diagnoses, medicines or doses, medical history, or other personal health details, and do not send them in a tool call. If personal medical advice is requested, decline without asking follow-up health questions. This is not diagnosis, treatment, or personal medication-safety advice.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          minLength: 2,
          maxLength: 180,
          description: 'General, non-identifying biomedical research topic.'
        }
      },
      required: ['topic'],
      additionalProperties: false
    },
    outputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string' },
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              citation: { type: 'string' },
              url: { type: 'string' }
            },
            required: ['title', 'citation', 'url'],
            additionalProperties: false
          }
        },
        notice: { type: 'string' }
      },
      required: ['topic', 'results', 'notice'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }
];

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function mcpError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request body too large.'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function requestObject(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    if (Buffer.byteLength(JSON.stringify(req.body), 'utf8') > MAX_BODY_BYTES) throw Object.assign(new Error('Request body too large.'), { statusCode: 413 });
    return req.body;
  }
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : typeof req.body === 'string' ? req.body : await readBody(req);
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) throw Object.assign(new Error('Request body too large.'), { statusCode: 413 });
  try {
    return JSON.parse(raw);
  } catch {
    throw Object.assign(new Error('Request body must be valid JSON.'), { statusCode: 400 });
  }
}

function textResult(value, structuredContent) {
  const result = { content: [{ type: 'text', text: `${JSON.stringify(value, null, 2)}\n\n${PUBLIC_USE_INSTRUCTION}` }] };
  if (structuredContent) result.structuredContent = structuredContent;
  return result;
}

function safeTopic(topic) {
  if (typeof topic !== 'string') throw new Error('Enter a general research topic.');
  const trimmed = topic.trim();
  if (trimmed.length < 2 || trimmed.length > 180) throw new Error('Enter a general research topic between 2 and 180 characters.');
  if (/@|https?:\/\/|www\.|\b\d{7,}\b|\b(?:I|my|mine|me|patient|born|DOB)\b|\b\d{1,4}[-/]\d{1,2}[-/]\d{1,4}\b/i.test(trimmed)) {
    throw new Error('This search only accepts general, non-identifying topics. Do not send personal health information, contact details, or URLs.');
  }
  return trimmed;
}

async function searchHealthResearch(topic) {
  const cleanTopic = safeTopic(topic);
  const url = new URL('https://www.ebi.ac.uk/europepmc/webservices/rest/search');
  url.searchParams.set('query', cleanTopic);
  url.searchParams.set('format', 'json');
  url.searchParams.set('pageSize', String(MAX_RESEARCH_RESULTS));
  url.searchParams.set('resultType', 'core');
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'DoctorAIWorld-Public-MCP/1.0' },
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`Public research search returned HTTP ${response.status}.`);
  const payload = await response.json();
  const records = Array.isArray(payload?.resultList?.result) ? payload.resultList.result : [];
  const results = records.map(item => {
    const identifier = item.pmid ? `PMID:${item.pmid}` : item.doi ? `DOI:${item.doi}` : item.id ? `Europe PMC:${item.id}` : 'Europe PMC';
    const link = item.pmid
      ? `https://europepmc.org/article/MED/${encodeURIComponent(item.pmid)}`
      : item.doi
        ? `https://doi.org/${encodeURIComponent(item.doi)}`
        : item.id
          ? `https://europepmc.org/article/MED/${encodeURIComponent(item.id)}`
          : 'https://europepmc.org/';
    return {
      title: String(item.title || 'Untitled abstract').replace(/\s+/g, ' ').trim(),
      citation: [item.authorString, item.journalTitle, item.pubYear, identifier].filter(Boolean).join('. '),
      url: link
    };
  });
  return {
    topic: cleanTopic,
    results,
    notice: `These are public research abstracts, not personalized diagnosis, treatment, or medication-safety advice. Discuss health decisions with a licensed clinician or pharmacist. ${PUBLIC_USE_INSTRUCTION}`
  };
}

async function callTool(name, args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Tool arguments must be an object.');
  const tool = TOOLS.find(item => item.name === name);
  if (!tool) throw new Error('Unknown DoctorAIWorld tool.');
  if (Object.keys(args).some(key => !Object.hasOwn(tool.inputSchema.properties, key))) throw new Error('Only the documented public tool arguments are accepted.');
  for (const key of tool.inputSchema.required || []) {
    if (!Object.hasOwn(args, key)) throw new Error('A required public tool argument is missing.');
  }
  for (const [key, value] of Object.entries(args)) {
    const schema = tool.inputSchema.properties[key];
    if (typeof value !== 'string' || (schema.enum && !schema.enum.includes(value))) throw new Error('Select a supported public tool argument.');
  }
  if (name === 'doctorai_website_guide') {
    const feature = args.feature ?? 'overview';
    const guide = SITE_GUIDE[feature];
    if (!guide) throw new Error('Select a supported DoctorAI website feature.');
    const destination = SITE_DESTINATIONS[guide.destination];
    const { destination: omitted, ...details } = guide;
    const value = { feature, ...details, url: new URL(destination.path, SITE_ORIGIN).toString() };
    return textResult(value, value);
  }
  if (name === 'doctorai_open_site') {
    const destinationName = args.destination;
    const destination = SITE_DESTINATIONS[destinationName];
    if (!destination) throw new Error('Select a supported DoctorAI website section.');
    const value = { destination: destinationName, label: destination.label, url: new URL(destination.path, SITE_ORIGIN).toString() };
    return textResult(value, value);
  }
  if (name === 'search_health_research') {
    const value = await searchHealthResearch(args.topic);
    return textResult(value, value);
  }
  throw new Error('Unknown DoctorAIWorld tool.');
}

module.exports = async function mcp(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Accept, MCP-Protocol-Version');
  const origin = req.headers?.origin;
  if (origin && ![SITE_ORIGIN, 'https://doctoraiworld.com', 'https://doctoraiworld-public-mcp.vercel.app'].includes(origin)) {
    sendJson(res, 403, mcpError(null, -32000, 'Origin is not allowed.'));
    return;
  }
  const headerProtocol = req.headers?.['mcp-protocol-version'];
  if (headerProtocol && !SUPPORTED_PROTOCOLS.has(headerProtocol)) {
    sendJson(res, 400, mcpError(null, -32602, 'Unsupported MCP protocol version.'));
    return;
  }

  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST, OPTIONS');
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    res.status(405).end();
    return;
  }

  try {
    const request = await requestObject(req);
    if (!request || request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
      sendJson(res, 400, mcpError(request?.id ?? null, -32600, 'Invalid JSON-RPC request.'));
      return;
    }

    const isNotification = !Object.prototype.hasOwnProperty.call(request, 'id');
    const protocol = request.params?.protocolVersion;
    if (request.method === 'initialize' && protocol && !SUPPORTED_PROTOCOLS.has(protocol)) {
      sendJson(res, 400, mcpError(request.id ?? null, -32602, 'Unsupported MCP protocol version.'));
      return;
    }

    if (request.method.startsWith('notifications/')) {
      res.statusCode = 202;
      res.end();
      return;
    }
    if (request.method === 'ping') {
      sendJson(res, 200, { jsonrpc: '2.0', id: request.id, result: {} });
      return;
    }
    if (request.method === 'initialize') {
      sendJson(res, 200, {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          protocolVersion: protocol || PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: 'doctoraiworld', version: '1.3.0' },
          instructions: `DoctorAIWorld offers public website guidance, direct links to Health Hub sections, and general searches of public biomedical abstracts. It cannot access a private account, inspect or change health records, diagnose, prescribe, check interactions, or facilitate subscriptions. ${PUBLIC_USE_INSTRUCTION}`
        }
      });
      return;
    }
    if (request.method === 'tools/list') {
      sendJson(res, 200, { jsonrpc: '2.0', id: request.id, result: { tools: TOOLS } });
      return;
    }
    if (request.method === 'tools/call') {
      try {
        const result = await callTool(request.params?.name, request.params?.arguments || {});
        sendJson(res, 200, { jsonrpc: '2.0', id: request.id, result });
      } catch (error) {
        const result = {
          content: [{ type: 'text', text: error?.message || 'The tool could not complete the request.' }],
          isError: true
        };
        sendJson(res, 200, { jsonrpc: '2.0', id: request.id, result });
      }
      return;
    }
    if (isNotification) {
      res.status(202).end();
      return;
    }
    sendJson(res, 200, mcpError(request.id, -32601, 'Method not found.'));
  } catch (error) {
    const code = error?.statusCode === 400 ? -32700 : -32603;
    sendJson(res, error?.statusCode || 500, mcpError(null, code, error?.message || 'MCP request failed.'));
  }
};
