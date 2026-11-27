const $=s=>document.querySelector(s);
const urlList=$('#url-list'),csvFile=$('#csv-file'),analyzeButton=$('#analyze');
let reportBlob=null,googleConnected=false;
const analysisConfigPromise=api('/api/config').catch(()=>({}));

async function api(path,body){
  const options={method:body===undefined?'GET':'POST',headers:{}};
  if(body!==undefined){options.headers['content-type']='application/json';options.body=JSON.stringify(body)}
  const response=await fetch(path,options);
  const raw=await response.text();let data;
  try{data=raw?JSON.parse(raw):{}}catch{const detail=raw.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,240);throw new Error(`Cloudflare returned HTTP ${response.status}${detail?`: ${detail}`:' without a readable error.'}`)}
  if(!response.ok)throw new Error(data.error||`Server returned ${response.status}.`);return data;
}

async function refreshGoogleStatus(){
  try{
    const status=await api('/api/google/status');googleConnected=status.connected;
    const statusLabel=$('#gsc-status'),connect=$('#gsc-connect'),disconnect=$('#gsc-disconnect');
    if(!status.configured){statusLabel.textContent='Setup needed in Cloudflare';statusLabel.className='gsc-status error';connect.setAttribute('aria-disabled','true');connect.classList.add('disabled');connect.href='#';disconnect.classList.add('hidden');return}
    connect.classList.remove('disabled');connect.removeAttribute('aria-disabled');
    statusLabel.textContent=googleConnected?'Connected — read-only access':'Not connected';statusLabel.className=`gsc-status${googleConnected?' connected':''}`;
    connect.classList.toggle('hidden',googleConnected);disconnect.classList.toggle('hidden',!googleConnected);
    if(new URLSearchParams(location.search).get('google')==='error'){statusLabel.textContent='Connection failed. Please try again.';statusLabel.className='gsc-status error'}
  }catch{const statusLabel=$('#gsc-status');statusLabel.textContent='Could not check connection';statusLabel.className='gsc-status error'}
}
let googleStatusPromise=refreshGoogleStatus();
$('#gsc-connect').addEventListener('click',e=>{if($('#gsc-connect').getAttribute('aria-disabled')==='true'){e.preventDefault();return}e.currentTarget.href=`/api/google/auth?remember=${$('#gsc-remember').checked?'1':'0'}`});
$('#gsc-disconnect').addEventListener('click',async()=>{try{await api('/api/google/disconnect',{});await refreshGoogleStatus()}catch(e){$('#gsc-status').textContent=e.message;$('#gsc-status').className='gsc-status error'}});
if(new URLSearchParams(location.search).has('google'))history.replaceState({},'',location.pathname);

function localDate(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function sixMonthsAgo(from){const month=from.getMonth()-6,year=from.getFullYear()+Math.floor(month/12),targetMonth=(month%12+12)%12;return new Date(year,targetMonth,Math.min(from.getDate(),new Date(year,targetMonth+1,0).getDate()))}
function estimatedAhrefsUnits(urls){return Math.max(50,new Set(urls).size*10)}

function countUrls(){const count=urlList.value.split(/\r?\n/).map(x=>x.trim()).filter(x=>x&&!x.startsWith('#')).length;$('#url-count').textContent=`${count} URL${count===1?'':'s'}`}
urlList.addEventListener('input',countUrls);$('#clear-urls').addEventListener('click',()=>{urlList.value='';countUrls()});
$('#threshold').addEventListener('input',e=>$('#threshold-value').textContent=e.target.value);
csvFile.addEventListener('change',()=>{$('#file-name').textContent=csvFile.files[0]?.name||'Use a url column. Role is inferred from each URL slug.'});
const dropzone=$('#dropzone');
for(const name of ['dragenter','dragover'])dropzone.addEventListener(name,e=>{e.preventDefault();dropzone.classList.add('drag')});
for(const name of ['dragleave','drop'])dropzone.addEventListener(name,e=>{e.preventDefault();dropzone.classList.remove('drag')});
dropzone.addEventListener('drop',e=>{const f=e.dataTransfer.files[0];if(f){const dt=new DataTransfer();dt.items.add(f);csvFile.files=dt.files;csvFile.dispatchEvent(new Event('change'))}});

function parseCsv(text){const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){cell+='"';i++}else if(c==='"')quoted=false;else cell+=c}else if(c==='"')quoted=true;else if(c===','){row.push(cell);cell=''}else if(c==='\n'){row.push(cell);rows.push(row);row=[];cell=''}else if(c!=='\r')cell+=c}if(cell||row.length){row.push(cell);rows.push(row)}if(!rows.length)return[];const first=rows[0].map(x=>x.trim().toLowerCase().replace(/ /g,'_'));const col=first.findIndex(x=>['url','urls','address'].includes(x));const data=col>=0?rows.slice(1):rows;return data.map(r=>r[col>=0?col:0]?.trim()).filter(x=>x&&!x.startsWith('#'))}

function showError(message){const el=$('#progress-card');el.classList.remove('hidden');$('#progress-title').textContent='Could not complete the analysis';$('#progress-phase').textContent=message;$('#progress-percent').textContent='';$('#progress-fill').style.width='0%';analyzeButton.disabled=false}
async function beginAnalysis(){
  if(analyzeButton.disabled)return;
  await googleStatusPromise;
  if(!googleConnected){showError('Connect Google Search Console above. The app needs read-only access to find each page’s top query.');return}
  const urls=urlList.value.split(/\r?\n/).map(x=>x.trim()).filter(x=>x&&!x.startsWith('#'));
  if(csvFile.files[0])try{urls.push(...parseCsv(await csvFile.files[0].text()))}catch{showError('Could not read the CSV file.');return}
  const config=await analysisConfigPromise;
  if(config.ahrefs_configured){const estimate=estimatedAhrefsUnits(urls);if(!window.confirm(`This run will look up Ahrefs Australian search volume for each page’s top Google Search Console query. Estimated usage: up to about ${estimate.toLocaleString()} API units (50-unit minimum). Continue?`))return}
  $('#progress-card').classList.remove('hidden');$('#result-card').classList.add('hidden');$('#progress-title').textContent='Reading and comparing your pages…';$('#progress-phase').textContent=`Submitting ${urls.length} URLs`;$('#progress-percent').textContent='0%';$('#progress-fill').style.width='0%';analyzeButton.disabled=true;
  const end=new Date();end.setDate(end.getDate()-2);const start=sixMonthsAgo(end),brandTerms=$('#brand-terms').value.split(',').map(x=>x.trim()).filter(Boolean);
  try{const data=await api('/api/analyze',{urls,threshold:Number($('#threshold').value),start_date:localDate(start),end_date:localDate(end),brand_terms:brandTerms});$('#progress-percent').textContent='100%';$('#progress-fill').style.width='100%';$('#progress-phase').textContent='Report ready';await showResult(data.result)}catch(e){await refreshGoogleStatus();showError(e.message)}
}

function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function showResult(data){
  $('#progress-card').classList.add('hidden');$('#result-card').classList.remove('hidden');
  const high=data.links.filter(l=>l.risk==='High').length,shared=data.links.filter(l=>l.search_evidence?.shared_query_count>0).length;
  const stats=[['',data.nodes.length,'Pages read'],['',data.links.length,'Content overlaps'],['',data.clusters.length,'Clusters'],['',high,'Strong matches'],['',(data.cannibalisation_report?.query_count||0),'Cannibalised queries'],['',(data.search_overlaps||[]).length,'Search overlap pairs']];
  $('#result-stats').innerHTML=stats.map(s=>`<div class="stat-pill"><strong>${s[1]}</strong><span>${s[2]}</span></div>`).join('');
  const se=data.search_evidence||{};
  const ah=data.ahrefs_evidence||{};
  const cannib=data.cannibalisation_report||{};
  $('#result-method').textContent=`Similarity: ${data.similarity_method}. Page role and intent: ${data.intent_method}. Closest entity: ${data.entity_method}. Cutoff: ${data.threshold}%. Google Search Console: ${se.status||'not available'}${se.site?` for ${se.site}, ${se.start_date} to ${se.end_date}`:''}. Cannibalisation: ${cannib.query_count||0} qualifying queries (${cannib.start_date||'—'} to ${cannib.end_date||'—'}); ${(cannib.brand_terms||[]).length?`excluded brand terms: ${cannib.brand_terms.join(', ')}`:'brand terms inferred from the domain'}. Ahrefs volume: ${ah.status||'not available'}${ah.message?` — ${ah.message}`:''}. ${se.message||''}`;
  const errors=$('#error-list');if(data.errors?.length){errors.classList.remove('hidden');errors.innerHTML=`<strong>${data.errors.length} page${data.errors.length===1?'':'s'} could not be read</strong>`+data.errors.map(e=>`<div><code>${esc(e.url)}</code> — ${esc(e.error)}</div>`).join('')}else errors.classList.add('hidden');
  const template=await fetch('/graph.html').then(r=>r.text());const payload=JSON.stringify(data).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');const html=template.replace('/*__DATA__*/null',`/*__DATA__*/${payload}`);$('#graph-frame').srcdoc=html;reportBlob=new Blob([html],{type:'text/html'});$('#download-link').onclick=e=>{e.preventDefault();if(!reportBlob)return;const link=document.createElement('a');link.href=URL.createObjectURL(reportBlob);link.download=`intent-graph-${new Date().toISOString().slice(0,10)}.html`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),30000)};
  $('#download-excel').onclick=()=>{const bytes=window.IntentGraphWorkbook.create(data),blob=new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`intent-graph-results-${new Date().toISOString().slice(0,10)}.xlsx`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),30000)};
  $('#result-card').scrollIntoView({behavior:'smooth',block:'start'});
}

analyzeButton.addEventListener('click',beginAnalysis);$('#new-analysis').addEventListener('click',()=>{reportBlob=null;$('#result-card').classList.add('hidden');$('#progress-card').classList.add('hidden');urlList.value='';csvFile.value='';$('#file-name').textContent='Use a url column. Role is inferred from each URL slug.';countUrls();window.scrollTo({top:0,behavior:'smooth'})});
