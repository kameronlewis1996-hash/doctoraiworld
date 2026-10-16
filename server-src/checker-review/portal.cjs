'use strict';
const crypto = require('node:crypto');
const COOKIE = '__Host-doctorai_checker_review';
const POLICY = Object.freeze({ inviteMs:30*60*1000, accessMs:7*24*60*60*1000, sessionMs:2*60*60*1000, idleMs:20*60*1000, minPassword:14, maxPassword:128 });
const ROLES = new Set(['owner','reviewer']);
const STATUSES = new Set(['draft','reviewed','needs-change']);
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const equal = (a,b) => {const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&crypto.timingSafeEqual(x,y);};
const escape = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const idOK = value => typeof value==='string'&&/^[a-zA-Z0-9._-]{1,80}$/.test(value);
const clean = (value,max=2000) => typeof value==='string'?value.trim().slice(0,max):'';
const passwordHash = (password,salt) => crypto.scryptSync(String(password),salt,64,{N:16384,r:8,p:1}).toString('hex');
function makeCredential(password) {
 if(typeof password!=='string'||password.length<POLICY.minPassword||password.length>POLICY.maxPassword)throw new Error('Use a passphrase between 14 and 128 characters.');
 const salt=crypto.randomBytes(24).toString('hex');return {salt,passwordHash:passwordHash(password,salt)};
}
function verifyPassword(password,member) {
 if(typeof password!=='string'||password.length>POLICY.maxPassword)return false;
 const calculated=passwordHash(password,member?.salt||'invalid-user-constant-work');
 return Boolean(member&&equal(calculated,member.passwordHash));
}
function validatePack(pack,workspaceId) {
 if(!pack||pack.workspaceId!==workspaceId||!idOK(pack.version)||!/^[a-f0-9]{40}$/.test(pack.checkerCommit||'')||!clean(pack.rulesetVersion,80)||pack.clinicalStatus!=='unvalidated')throw new Error('A versioned, unvalidated review pack for this workspace is required.');
 if(JSON.stringify(pack).length>500000||!Array.isArray(pack.sections)||!Array.isArray(pack.tests)||!Array.isArray(pack.sources)||!Array.isArray(pack.gaps))throw new Error('Invalid review pack shape or size.');
 if(pack.tests.length>100||pack.sections.length>30||pack.sources.length>100||pack.gaps.length>100)throw new Error('Review pack limits exceeded.');
 const seen=new Set;
 for(const test of pack.tests){if(!idOK(test.id)||seen.has(test.id)||test.synthetic!==true||test.clinicalStatus!=='unvalidated'||test.observedStatus!=='not-run'||!clean(test.input)||!clean(test.proposedCheck))throw new Error('Tests must be unique, fictional, unvalidated and not marked as run.');seen.add(test.id);}
 for(const section of pack.sections){if(!idOK(section.id)||!clean(section.title)||!Array.isArray(section.paragraphs)||section.paragraphs.some(p=>typeof p!=='string'||p.length>12000))throw new Error('Invalid review section.');}
 for(const source of pack.sources){if(!idOK(source.id)||!['metadata-only','approved-excerpt','withheld'].includes(source.shareMode))throw new Error('Every source needs an explicit sharing decision.');if(source.shareMode==='approved-excerpt'&&!(source.rights?.status==='approved'&&clean(source.rights.permissionRecord)&&clean(source.rights.attribution)))throw new Error('Source excerpts require reviewed reuse rights.');if(source.url&&!/^https:\/\//.test(source.url))throw new Error('Invalid source link.');}
 return pack;
}
function publicPack(pack) {
 return {version:pack.version,title:clean(pack.title,200),checkerCommit:pack.checkerCommit,rulesetVersion:clean(pack.rulesetVersion,80),clinicalStatus:'unvalidated',sections:pack.sections.map(s=>({id:s.id,title:clean(s.title,200),paragraphs:s.paragraphs.map(p=>clean(p,12000))})),gaps:pack.gaps.map(g=>clean(g)),tests:pack.tests.map(t=>({id:t.id,input:clean(t.input),proposedCheck:clean(t.proposedCheck),clinicianQuestion:clean(t.clinicianQuestion),clinicalStatus:'unvalidated',observedStatus:'not-run'})),sources:pack.sources.map(s=>s.shareMode==='withheld'?{id:s.id,shareMode:'withheld',title:'Withheld pending rights review'}:{id:s.id,title:clean(s.title,300),url:s.url||'',shareMode:s.shareMode,reportedRights:clean(s.reportedRights),reviewStatus:clean(s.reviewStatus,100),...(s.shareMode==='approved-excerpt'?{excerpt:clean(s.excerpt,10000),attribution:clean(s.rights.attribution)}:{})})};
}
const style = 'body{font-family:system-ui,sans-serif;background:#f3f7fc;color:#142d45;margin:0;line-height:1.55}main{max-width:1080px;margin:auto;padding:32px 20px}h1{font-size:2rem;line-height:1.2}h2{font-size:1.35rem;margin-top:0}h3{font-size:1.08rem}a{color:#0758a5}header,section,article{background:white;border:1px solid #bfd0e3;border-radius:14px;padding:22px;margin-bottom:18px}nav{display:flex;flex-wrap:wrap;gap:12px;margin:18px 0}input,textarea,select,button{font:inherit;max-width:100%;box-sizing:border-box}label{display:block;font-weight:650;margin:14px 0 6px}input,textarea,select{display:block;width:100%;padding:12px;border:1px solid #7995af;border-radius:7px;background:#fff;color:#142d45}button{padding:11px 16px;min-height:44px;color:white;background:#0758a5;border:0;border-radius:7px;margin-top:14px;cursor:pointer}button.danger{background:#9d2738}small{display:block;color:#3e566b}code{overflow-wrap:anywhere}fieldset{border:0;padding:0;min-width:0}li{margin:7px 0}.notice{background:#fff3d8;border-left:5px solid #97620c;padding:15px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:16px}.tag{display:inline-block;background:#e6effa;color:#173957;padding:4px 9px;border-radius:5px}details{margin:14px 0}summary{cursor:pointer;min-height:44px;font-weight:700}dd{margin:0 0 10px;overflow-wrap:anywhere}dt{font-weight:700}pre{white-space:pre-wrap;overflow-wrap:anywhere}:focus-visible{outline:3px solid #0072ce;outline-offset:3px}@media(max-width:420px){main{padding:18px 12px}section,article,header{padding:16px}h1{font-size:1.7rem}}';
const styleHash=crypto.createHash('sha256').update(style).digest('base64');
function headers(response) {
 response.setHeader('Cache-Control','private, no-store, max-age=0');response.setHeader('CDN-Cache-Control','no-store');response.setHeader('Vercel-CDN-Cache-Control','no-store');response.setHeader('Vary','Cookie');response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('Referrer-Policy','same-origin');response.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');response.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');response.setHeader('Content-Security-Policy',`default-src 'none'; style-src 'sha256-${styleHash}'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`);
}
const shell=(title,body)=>'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>'+escape(title)+' · DoctorAI private review</title><style>'+style+'</style></head><body><main>'+body+'</main></body></html>';
const hidden=(name,value)=>'<input type="hidden" name="'+name+'" value="'+escape(value)+'">';
const field=(label,name,type='text',value='')=>'<label>'+escape(label)+'<input name="'+name+'" type="'+type+'" value="'+escape(value)+'" required autocomplete="'+(type==='password'?'current-password':'off')+'"></label>';
const statusOptions=selected=>['draft','reviewed','needs-change'].map(s=>'<option'+(s===selected?' selected':'')+'>'+s+'</option>').join('');
function portalHTML(pack,member,session,feedback,members) {
 const root='/api/checker-review',csrf=hidden('csrf',session.csrf),version=hidden('version',pack.version);
 let body='<header><small>DoctorAI · private checker review</small><h1>'+escape(pack.title||'Whole checker review')+'</h1><p class="notice"><b>Review open · clinical outcomes unvalidated.</b> Feedback applies to this version. Reviewed status is not clinical certification. No alert does not mean safe.</p><dl><dt>Pack / checker version</dt><dd>'+escape(pack.version)+' · '+escape(pack.rulesetVersion)+'</dd><dt>Build under review</dt><dd><code>'+escape(pack.checkerCommit)+'</code></dd><dt>Access</dt><dd>'+escape(member.role)+' · expires '+escape(new Date(member.expiresAt).toISOString())+'</dd></dl><form method="post" action="'+root+'/logout">'+csrf+'<button>Sign out of private review</button></form></header>';
 body+='<nav aria-label="Review sections"><a href="#scope">Scope & gaps</a><a href="#sources">Sources & rights</a><a href="#cases">Fictional cases</a><a href="#feedback">Feedback</a>'+(member.role==='owner'?'<a href="#access">Access</a>':'')+'</nav>';
 body+='<section id="scope"><h2>Scope and known gaps</h2>'+pack.sections.map(s=>'<details id="section-'+escape(s.id)+'"><summary>'+escape(s.title)+'</summary>'+s.paragraphs.map(p=>'<p>'+escape(p)+'</p>').join('')+'</details>').join('')+'<h3>Outstanding work</h3><ul>'+pack.gaps.map(g=>'<li>'+escape(g)+'</li>').join('')+'</ul></section>';
 body+='<section id="sources"><h2>Source and rights inventory</h2><p>Links and recorded rights are evidence to review, not permission to reproduce source material or clinical approval. Withheld material is not shared.</p>'+pack.sources.map(s=>'<article><h3>'+escape(s.id)+' · '+escape(s.title)+'</h3><p>'+escape(s.reportedRights||s.shareMode)+'</p><p>'+escape(s.reviewStatus||'Rights/currentness review pending')+'</p>'+(s.url?'<a href="'+escape(s.url)+'" rel="noreferrer noopener" target="_blank">Open source '+escape(s.id)+'</a>':'')+(s.excerpt?'<p>'+escape(s.excerpt)+'</p><small>'+escape(s.attribution)+'</small>':'')+'</article>').join('')+'</section>';
 body+='<section id="cases"><h2>Fictional test cases</h2><p>All expected outcomes need clinician adjudication. No clinical case is marked passed by this portal. Enter fictional evidence only; do not include patient records or identifying screenshots.</p><div class="grid">'+pack.tests.map(t=>'<article id="case-'+escape(t.id)+'"><h3>'+escape(t.id)+'</h3><p>'+escape(t.input)+'</p><p><b>Proposed software check:</b> '+escape(t.proposedCheck)+'</p><p><b>Clinician question:</b> '+escape(t.clinicianQuestion||'Confirm the desired response and source.')+'</p><span class="tag">Unvalidated · not run</span><form method="post" action="'+root+'/feedback">'+csrf+version+hidden('testId',t.id)+field('Observed build / ruleset','build')+'<label>Observed result, desired response, source and reproduction steps<textarea name="note" rows="4" maxlength="4000" required></textarea></label><label>Review status<select name="status">'+statusOptions('draft')+'</select></label><button>Save feedback for '+escape(t.id)+'</button></form></article>').join('')+'</div></section>';
 body+='<section id="feedback"><h2>Versioned reviewer feedback</h2><p>Status describes a feedback record; it never certifies a medicine, rule or release.</p>'+(feedback.length?feedback.map(f=>'<article><h3>'+escape(f.testId)+' · '+escape(f.status)+'</h3><small>Pack '+escape(f.version)+' · reviewer code '+escape(f.authorId)+' · revision '+f.revision+'</small><p>'+escape(f.note)+'</p><p>Observed build: '+escape(f.build)+'</p>'+(f.authorId===member.id?'<form method="post" action="'+root+'/feedback">'+csrf+version+hidden('id',f.id)+hidden('revision',f.revision)+hidden('testId',f.testId)+hidden('build',f.build)+'<label>Update your feedback<textarea name="note" rows="3" maxlength="4000" required>'+escape(f.note)+'</textarea></label><label>Status<select name="status">'+statusOptions(f.status)+'</select></label><button>Update my feedback</button></form>':'')+'</article>').join(''):'<p>No feedback recorded for this version.</p>')+'</section>';
 if(member.role==='owner') body+='<section id="access"><h2>Review access</h2><p>Owner access is limited to this review workspace. Revocation invalidates every private-review session for that member.</p>'+members.filter(m=>m.role==='reviewer').map(m=>'<form method="post" action="'+root+'/revoke">'+csrf+hidden('memberId',m.id)+'<p>Reviewer code '+escape(m.id)+' · '+(m.revokedAt?'revoked':'expires '+escape(new Date(m.expiresAt).toISOString()))+'</p><button class="danger"'+(m.revokedAt?' disabled':'')+'>Revoke this reviewer</button></form>').join('')+'</section>';
 return shell('Checker review',body);
}
function createReviewHandler({enabled=false,workspaceId='',origin='',store=null,rateLimit=null,now=Date.now}={}) {
 const handler = async function(request,response) {
  headers(response);
  const json=(status,payload)=>response.status(status).json(payload);
  const html=(status,title,body)=>{response.setHeader('Content-Type','text/html; charset=utf-8');return response.status(status).send(shell(title,body));};
  // There is no environment-only activation path. Production must be wired after approval.
  if(enabled!==true||!idOK(workspaceId)||!/^https:\/\//.test(origin)||!store?.transaction||typeof rateLimit!=='function')return json(404,{error:'Not found.'});
  const route=String(request.url||'').split('?')[0].replace(/^\/api\/checker-review\/?|^\/checker-review\/?/,'')||'portal';
  if(!['GET','POST'].includes(request.method))return json(405,{error:'Method not allowed.'});
  let body={};
  if(request.method==='POST') {
   if(request.headers?.origin!==origin||request.headers?.['sec-fetch-site']==='cross-site')return json(403,{error:'Request origin not allowed.'});
   try{if(typeof request.body==='string'){if(request.body.length>16000)throw Error();body=request.headers?.['content-type']?.includes('application/x-www-form-urlencoded')?Object.fromEntries(new URLSearchParams(request.body)):JSON.parse(request.body);}else body=request.body||{};if(JSON.stringify(body).length>16000||Array.isArray(body))throw Error();}catch{return json(400,{error:'Invalid request.'});}
   const limited=await rateLimit(request,'checker-review-'+route);if(!limited)return json(429,{error:'Too many requests. Try again later.'});
   if(body.workspaceId&&body.workspaceId!==workspaceId)return json(403,{error:'Workspace not allowed.'});
  }
  try{return await store.transaction(workspaceId,async state=>{
   const time=now();if(!state||state.workspaceId!==workspaceId||state.disabledAt)return json(404,{error:'Not found.'});
   const log=(event,actor,objectId)=>{state.audit.push({event,actor,objectId,at:time,workspaceId});if(state.audit.length>5000)state.audit.shift();};
   if(route==='login'&&request.method==='GET')return html(200,'Private review sign in','<section><h1>Private checker review</h1><p>Use your separate review login. This does not grant health-record, staff or billing access.</p><form method="post" action="/api/checker-review/login">'+field('Review username','username')+field('Password','password','password')+'<button>Sign in</button></form><p><a href="/api/checker-review/setup">Set a password with a one-time setup code</a></p></section>');
   if(route==='setup'&&request.method==='GET')return html(200,'Set review password','<section><h1>Set your private-review password</h1><p>Enter the one-time code given to you directly by the owner. No name or email is required. The code expires after 30 minutes and can be used once.</p><form method="post" action="/api/checker-review/setup">'+field('One-time setup code','code')+field('Review username','username')+'<label>New passphrase (14–128 characters)<input name="password" type="password" autocomplete="new-password" minlength="14" maxlength="128" required></label><button>Set password</button></form></section>');
   if(route==='setup'&&request.method==='POST') {
    const invite=state.invites[hash(body.code||'')],username=clean(body.username,32).toLowerCase();
    if(!invite||invite.workspaceId!==workspaceId||invite.consumedAt||!Number.isFinite(invite.expiresAt)||!Number.isFinite(invite.accessExpiresAt)||invite.expiresAt<=time||invite.accessExpiresAt<=time||!ROLES.has(invite.role)||!equal(username,invite.username)||Object.values(state.members).some(m=>m.username===username))return json(400,{error:'The setup code or username is invalid or expired.'});
    let credential;try{credential=makeCredential(body.password);}catch(error){return json(400,{error:error.message});}
    // Consuming the invite and adding credentials must be one durable atomic transaction.
    state.members[invite.memberId]={...credential,id:invite.memberId,username,role:invite.role,workspaceId,expiresAt:invite.accessExpiresAt,credentialVersion:1,revokedAt:null};invite.consumedAt=time;log('credential-setup',invite.memberId,invite.memberId);
    return html(200,'Password set','<section><h1>Password set</h1><p>Your private-review password is not displayed or sent in chat.</p><a href="/api/checker-review/login">Sign in to private review</a></section>');
   }
   if(route==='login'&&request.method==='POST') {
    const username=clean(body.username,32).toLowerCase();const member=Object.values(state.members).find(m=>m.username===username);
    const valid=verifyPassword(body.password,member);
    if(!valid||member.workspaceId!==workspaceId||!ROLES.has(member.role)||!Number.isInteger(member.credentialVersion)||member.credentialVersion<1||member.revokedAt||!Number.isFinite(member.expiresAt)||member.expiresAt<=time)return json(401,{error:'Review login could not be verified.'});
    const token=crypto.randomBytes(32).toString('base64url');const expiresAt=Math.min(time+POLICY.sessionMs,member.expiresAt);
    state.sessions[hash(token)]={memberId:member.id,workspaceId,expiresAt,idleExpiresAt:Math.min(time+POLICY.idleMs,expiresAt),credentialVersion:member.credentialVersion,csrf:crypto.randomBytes(32).toString('base64url')};
    response.setHeader('Set-Cookie',`${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.floor((expiresAt-time)/1000)}`);log('login',member.id,member.id);response.setHeader('Location','/api/checker-review/portal');return response.status(303).send('');
   }
   const cookies=Object.fromEntries(String(request.headers?.cookie||'').split(';').map(v=>v.trim().split('=')).filter(v=>v.length===2));
   const session=state.sessions[hash(cookies[COOKIE]||'')],member=session&&state.members[session.memberId];
   if(!session||session.workspaceId!==workspaceId||!Number.isFinite(session.expiresAt)||!Number.isFinite(session.idleExpiresAt)||session.expiresAt<=time||session.idleExpiresAt<=time||!member||member.id!==session.memberId||member.workspaceId!==workspaceId||!ROLES.has(member.role)||!Number.isInteger(member.credentialVersion)||member.credentialVersion<1||member.revokedAt||!Number.isFinite(member.expiresAt)||member.expiresAt<=time||member.credentialVersion!==session.credentialVersion)return json(401,{error:'Private review sign-in required.'});
   if(request.method==='POST'&&!equal(body.csrf,session.csrf))return json(403,{error:'Request verification failed.'});
   session.idleExpiresAt=Math.min(time+POLICY.idleMs,session.expiresAt);
   if(route==='logout'&&request.method==='POST'){delete state.sessions[hash(cookies[COOKIE])];response.setHeader('Set-Cookie',`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);log('logout',member.id,member.id);response.setHeader('Location','/api/checker-review/login');return response.status(303).send('');}
   if(route==='revoke'&&request.method==='POST') {
    if(member.role!=='owner')return json(403,{error:'Owner permission required.'});const target=state.members[body.memberId];if(!target||target.workspaceId!==workspaceId||target.role!=='reviewer')return json(404,{error:'Member not found.'});target.revokedAt=time;target.credentialVersion++;for(const [key,s]of Object.entries(state.sessions))if(s.memberId===target.id)delete state.sessions[key];log('revocation',member.id,target.id);response.setHeader('Location','/api/checker-review/portal#access');return response.status(303).send('');
   }
   const version=request.method==='POST'?body.version:request.query?.version||state.activeVersion;
   const raw=state.packs[version];if(!raw||raw.workspaceId!==workspaceId)return json(404,{error:'Review version not found.'});validatePack(raw,workspaceId);const pack=publicPack(raw);
   if(route==='feedback'&&request.method==='POST') {
    if(!STATUSES.has(body.status)||!pack.tests.some(t=>t.id===body.testId)||!clean(body.note,4000)||!clean(body.build,160))return json(400,{error:'Choose a test and review status, and record the observed build and feedback.'});
    const existing=body.id&&state.feedback[body.id];if(body.id&&(!existing||existing.workspaceId!==workspaceId||existing.version!==version))return json(404,{error:'Feedback not found.'});
    if(existing&&(existing.authorId!==member.id||existing.testId!==body.testId))return json(403,{error:'You can update only your own feedback for its original case.'});
    if(existing&&existing.revision!==Number(body.revision))return json(409,{error:'Feedback changed. Reload before saving.'});
    const id=existing?.id||crypto.randomUUID();state.feedback[id]={id,workspaceId,version,testId:body.testId,authorId:member.id,status:body.status,note:clean(body.note,4000),build:clean(body.build,160),createdAt:existing?.createdAt||time,updatedAt:time,revision:(existing?.revision||0)+1};log('feedback',member.id,id);response.setHeader('Location','/api/checker-review/portal#feedback');return response.status(303).send('');
   }
   if(route==='pack'&&request.method==='GET')return json(200,pack);
   if(route==='portal'&&request.method==='GET'){response.setHeader('Content-Type','text/html; charset=utf-8');const feedback=Object.values(state.feedback).filter(f=>f.workspaceId===workspaceId&&f.version===version&&(member.role==='owner'||f.authorId===member.id));return response.status(200).send(portalHTML(pack,member,session,feedback,Object.values(state.members).filter(m=>m.workspaceId===workspaceId)));}
   return json(404,{error:'Not found.'});
  });}catch{response.removeHeader('Set-Cookie');return json(503,{error:'Private review is unavailable. Access was not granted.'});}
 };
 // Do not emit a session cookie or protected body before the durable transaction commits.
 return async function(request,response) {
  const result={status:200,headers:{},kind:'send',body:''};
  const buffer={setHeader:(key,value)=>{result.headers[key]=value;},removeHeader:key=>{delete result.headers[key];},status:status=>{result.status=status;return buffer;},json:body=>{result.kind='json';result.body=body;return buffer;},send:body=>{result.kind='send';result.body=body;return buffer;}};
  try{await handler(request,buffer);}catch{result.status=503;delete result.headers['Set-Cookie'];result.kind='json';result.body={error:'Private review is unavailable. Access was not granted.'};}
  for(const [key,value]of Object.entries(result.headers))response.setHeader(key,value);
  response.status(result.status);return result.kind==='json'?response.json(result.body):response.send(result.body);
 };
}
function prepareInvite({workspaceId,username,role,accessExpiresAt,now=Date.now()}) {
 if(!idOK(workspaceId)||!ROLES.has(role)||!/^[a-z0-9_-]{3,32}$/.test(username)||!(accessExpiresAt>now&&accessExpiresAt<=now+POLICY.accessMs))throw new Error('Invalid review invitation scope or expiry.');
 const code=crypto.randomBytes(32).toString('base64url');return {code,key:hash(code),record:{workspaceId,username,role,memberId:crypto.randomUUID(),expiresAt:now+POLICY.inviteMs,accessExpiresAt,consumedAt:null}};
}
module.exports={createReviewHandler,validatePack,publicPack,prepareInvite,makeCredential,POLICY,COOKIE};
