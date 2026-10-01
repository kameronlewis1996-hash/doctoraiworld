const { review } = require('../../server-src/medication/safety-engine.cjs');
module.exports = async function handler(request,response){
  response.setHeader('Cache-Control','no-store');
  if(request.method!=='POST') return response.status(405).json({error:'Method not allowed.'});
  let body=request.body; try{body=typeof body==='string'?JSON.parse(body):body;}catch{return response.status(400).json({error:'Invalid request.'});}
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Array.isArray(body.medications) || !body.medications.length) return response.status(400).json({error:'Supply at least one medicine in a medications array.'});
  for (const key of ['medications','allergies','conditions']) {
    if (body[key] !== undefined && (!Array.isArray(body[key]) || body[key].length > 50)) return response.status(400).json({error:'Each list supports at most 50 entries. No partial list was checked.'});
    if ((body[key] || []).some(item => typeof item !== 'string' || !item.trim() || item.length > 500)) return response.status(400).json({error:'Use non-empty text entries of at most 500 characters.'});
  }
  const medications=body.medications;
  const allergies=body.allergies || [];
  const conditions=body.conditions || [];
  return response.status(200).json(review({medications,allergies,conditions}));
};
