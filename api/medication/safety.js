const { review } = require('../../server-src/medication/safety-engine.cjs');
module.exports = async function handler(request,response){
  response.setHeader('Cache-Control','no-store');
  if(request.method!=='POST') return response.status(405).json({error:'Method not allowed.'});
  let body=request.body||{}; try{body=typeof body==='string'?JSON.parse(body):body;}catch{return response.status(400).json({error:'Invalid request.'});}
  const medications=Array.isArray(body.medications)?body.medications.slice(0,50):[];
  const allergies=Array.isArray(body.allergies)?body.allergies.slice(0,50):[];
  const conditions=Array.isArray(body.conditions)?body.conditions.slice(0,50):[];
  return response.status(200).json(review({medications,allergies,conditions}));
};
