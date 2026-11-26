const $=s=>document.querySelector(s);
const urlList=$('#url-list'),csvFile=$('#csv-file'),analyzeButton=$('#analyze');
let reportBlob=null,seogetsChoices=[],seoSitesPromise=Promise.resolve(),seoSitesError='';

async function api(path,body){
  const options={method:body===undefined?'GET':'POST',headers:{}};
  if(body!==undefined){options.headers['content-type']='application/json';options.body=JSON.stringify(body)}
  const response=await fetch(path,options);
  const data=await response.json().catch(()=>({error:'The server returned an unreadable response.'}));
  if(!response.ok)throw new Error(data.error||`Server returned ${response.status}.`);return data;
}

function localDate(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}

function countUrls(){const count=urlList.value.split(/\r?\n/).map(x=>x.trim()).filter(x=>x&&!x.startsWith('#')).length;$('#url-count').textContent=`${count} URL${count===1?'':'s'}`}
urlList.addEventListener('input',countUrls);$('#clear-urls').addEventListener('click',()=>{urlList.value='';countUrls()});
$('#threshold').addEventListener('input',e=>$('#threshold-value').textContent=e.target.value);
csvFile.addEventListener('change',()=>{$('#file-name').textContent=csvFile.files[0]?.name||'Use a url column. Role is inferred from each URL slug.'});
const dropzone=$('#dropzone');
for(const name of ['dragenter','dragover'])dropzone.addEventListener(name,e=>{e.preventDefault();dropzone.classList.add('drag')});
for(const name of ['dragleave','drop'])dropzone.addEventListener(name,e=>{e.preventDefault();dropzone.classList.remove('drag')});
dropzone.addEventListener('drop',e=>{const f=e.dataTransfer.files[0];if(f){const dt=new DataTransfer();dt.items.add(f);csvFile.files=dt.files;csvFile.dispatchEvent(new Event('change'))}});

function parseCsv(text){const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){cell+='"';i++}else if(c==='"')quoted=false;else cell+=c}else if(c==='"')quoted=true;else if(c===','){row.push(cell);cell=''}else if(c==='\n'){row.push(cell);rows.push(row);row=[];cell=''}else if(c!=='\r')cell+=c}if(cell||row.length){row.push(cell);rows.push(row)}if(!rows.length)return[];const first=rows[0].map(x=>x.trim().toLowerCase().replace(/ /g,'_'));const col=first.findIndex(x=>['url','urls','address'].includes(x));const data=col>=0?rows.slice(1):rows;return data.map(r=>r[col>=0?col:0]?.trim()).filter(x=>x&&!x.startsWith('#'))}

function candidates(value,out=[]){if(typeof value==='string'){const s=value.trim();const matches=[...s.matchAll(/(?:https?:\/\/[^\s|,]+|sc-domain:[^\s|,]+)/g)].map(m=>m[0].replace(/[),.;]+$/,''));if(matches.length)out.push(...matches);else if(/^[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s|,]*)?$/i.test(s))out.push(s);return out}if(Array.isArray(value)){for(const v of value)candidates(v,out);return out}if(value&&typeof value==='object'){for(const[k,v]of Object.entries(value)){if(typeof v==='string'&&/(site|domain|property|name)/i.test(k)){const s=v.trim();if(s&&s.length<220)candidates(s,out)}else candidates(v,out)}}return out}
function propertyHost(value){const s=String(value||'').trim().toLowerCase();if(s.startsWith('sc-domain:'))return s.slice(10).replace(/^www\./,'');try{return new URL(s.includes('://')?s:`https://${s}`).hostname.replace(/^www\./,'')}catch{return ''}}
function autoSelectSeoSite(urls){const hosts=urls.map(x=>{try{return new URL(x).hostname.toLowerCase().replace(/^www\./,'')}catch{return ''}}).filter(Boolean);if(!hosts.length||!seogetsChoices.length)return '';return seogetsChoices.find(choice=>{const domain=propertyHost(choice);return domain&&hosts.every(host=>host===domain||host.endsWith(`.${domain}`))})||''}
async function loadSeoSites(){try{const data=await api('/api/seogets/sites',{});seogetsChoices=[...new Set(candidates(data.sites))];if(!seogetsChoices.length)throw new Error('SEO Gets did not return any Search Console properties.')}catch(e){seoSitesError=e.message}}
seoSitesPromise=loadSeoSites();

function showError(message){const el=$('#progress-card');el.classList.remove('hidden');$('#progress-title').textContent='Could not complete the analysis';$('#progress-phase').textContent=message;$('#progress-percent').textContent='';$('#progress-fill').style.width='0%';analyzeButton.disabled=false}
async function beginAnalysis(){
  if(analyzeButton.disabled)return;
  const urls=urlList.value.split(/\r?\n/).map(x=>x.trim()).filter(x=>x&&!x.startsWith('#'));
  if(csvFile.files[0])try{urls.push(...parseCsv(await csvFile.files[0].text()))}catch{showError('Could not read the CSV file.');return}
  $('#progress-card').classList.remove('hidden');$('#result-card').classList.add('hidden');$('#progress-title').textContent='Reading and comparing your pages…';$('#progress-phase').textContent=`Submitting ${urls.length} URLs`;$('#progress-percent').textContent='0%';$('#progress-fill').style.width='0%';analyzeButton.disabled=true;
  await seoSitesPromise;const site=autoSelectSeoSite(urls);if(!site){showError(seoSitesError||'Could not automatically match these URLs to an SEO Gets property. Check that they belong to a property in the connected SEO Gets account.');return}
  const end=new Date(),start=new Date();start.setDate(start.getDate()-90);
  try{const data=await api('/api/analyze',{urls,threshold:Number($('#threshold').value),seogets_site:site,start_date:localDate(start),end_date:localDate(end)});$('#progress-percent').textContent='100%';$('#progress-fill').style.width='100%';$('#progress-phase').textContent='Report ready';await showResult(data.result)}catch(e){showError(e.message)}
}

function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function showResult(data){
  $('#progress-card').classList.add('hidden');$('#result-card').classList.remove('hidden');
  const high=data.links.filter(l=>l.risk==='High').length,shared=data.links.filter(l=>l.search_evidence?.shared_query_count>0).length;
  const stats=[['',data.nodes.length,'Pages read'],['',data.links.length,'Content overlaps'],['',data.clusters.length,'Clusters'],['',high,'Strong matches'],['',shared,'Content pairs sharing queries'],['',(data.search_overlaps||[]).length,'Search overlap pairs']];
  $('#result-stats').innerHTML=stats.map(s=>`<div class="stat-pill"><strong>${s[1]}</strong><span>${s[2]}</span></div>`).join('');
  const se=data.search_evidence||{};
  $('#result-method').textContent=`Similarity: ${data.similarity_method}. Page role and intent: ${data.intent_method}. Closest entity: ${data.entity_method}. Cutoff: ${data.threshold}%. Search evidence: ${se.status||'not available'}${se.site?` for ${se.site}, ${se.start_date} to ${se.end_date}`:''}. ${se.message||''}`;
  const errors=$('#error-list');if(data.errors?.length){errors.classList.remove('hidden');errors.innerHTML=`<strong>${data.errors.length} page${data.errors.length===1?'':'s'} could not be read</strong>`+data.errors.map(e=>`<div><code>${esc(e.url)}</code> — ${esc(e.error)}</div>`).join('')}else errors.classList.add('hidden');
  const template=await fetch('/graph.html').then(r=>r.text());const payload=JSON.stringify(data).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');const html=template.replace('/*__DATA__*/null',`/*__DATA__*/${payload}`);$('#graph-frame').srcdoc=html;reportBlob=new Blob([html],{type:'text/html'});$('#download-link').onclick=e=>{e.preventDefault();if(!reportBlob)return;const link=document.createElement('a');link.href=URL.createObjectURL(reportBlob);link.download=`intent-graph-${new Date().toISOString().slice(0,10)}.html`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),30000)};
  $('#result-card').scrollIntoView({behavior:'smooth',block:'start'});
}

analyzeButton.addEventListener('click',beginAnalysis);$('#new-analysis').addEventListener('click',()=>{reportBlob=null;$('#result-card').classList.add('hidden');$('#progress-card').classList.add('hidden');urlList.value='';csvFile.value='';$('#file-name').textContent='Use a url column. Role is inferred from each URL slug.';countUrls();window.scrollTo({top:0,behavior:'smooth'})});
