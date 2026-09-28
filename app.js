const video=document.querySelector('#video'),canvas=document.querySelector('#canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
const $=s=>document.querySelector(s);let stream=null,running=false,busy=false,track=null,lastSeen='',lastAt=0;const codes=[];
const formats=['Code128','Code39','Code93','Codabar','EAN13','EAN8','ITF','UPCA','UPCE'];
const LOT_KEY='invenscan_saved_lots_v3';

function status(t){$('#status').textContent=t}
function classify(text){
 const raw=(text||'').trim().toUpperCase();
 if(/^\d{6}$/.test(raw)) return {type:'Etiqueta inventario',value:raw};

 // Algunos fabricantes codifican varios campos en una sola lectura.
 // No intentamos separar posiciones que pueden variar entre modelos.
 // Solo quitamos el identificador inicial "1S" cuando realmente está al principio,
 // y conservamos TODO el resto de la lectura para no perder información.
 const value=/^1S[A-Z0-9]/.test(raw) ? raw.slice(2) : raw;

 if(/^[A-Z0-9-]{6,}$/.test(value)&&/[A-Z]/.test(value)&&/\d/.test(value))
   return {type:'Nº serie / código fabricante',value};
 return {type:'Código de barras',value};
}
function render(){
 $('#count').textContent=codes.length;$('#items').className=codes.length?'':'empty';
 $('#items').innerHTML=codes.length?codes.map((x,i)=>`<div class="row"><span>${esc(x.value)}<small>${esc(x.type)} · ${esc(x.format||'Código de barras')}</small></span><span>${String(i+1).padStart(2,'0')}</span></div>`).join(''):'Todavía no hay códigos leídos.';
}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function start(){try{stop();stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}}});video.srcObject=stream;track=stream.getVideoTracks()[0];await video.play();running=true;setupCaps();status('Apunta el código dentro del marco');scan()}catch(e){status('No se pudo abrir la cámara: '+e.message)}}
function stop(){running=false;if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;track=null;video.srcObject=null;$('#torch').disabled=true;$('#zoom').disabled=true}
function setupCaps(){if(!track?.getCapabilities)return;const c=track.getCapabilities();if(c.torch)$('#torch').disabled=false;if(c.zoom){const z=$('#zoom');z.min=c.zoom.min;z.max=c.zoom.max;z.step=c.zoom.step||.1;z.value=track.getSettings().zoom||c.zoom.min;z.disabled=false}}
async function scan(){if(!running)return;if(!busy&&video.readyState>=2){busy=true;try{const vw=video.videoWidth,vh=video.videoHeight;const sx=Math.round(vw*.05),sy=Math.round(vh*.32),sw=Math.round(vw*.90),sh=Math.round(vh*.36);canvas.width=sw;canvas.height=sh;ctx.drawImage(video,sx,sy,sw,sh,0,0,sw,sh);const data=ctx.getImageData(0,0,sw,sh);const res=await ZXingWASM.readBarcodes(data,{formats,tryHarder:true,tryRotate:true,tryInvert:true,maxNumberOfSymbols:1});if(res?.length)accept(res[0])}catch(e){}finally{busy=false}}setTimeout(scan,110)}
function accept(r){const text=(r.text||'').trim();if(!text)return;const now=Date.now();if(text===lastSeen&&now-lastAt<1800)return;lastSeen=text;lastAt=now;const c=classify(text);$('#last').textContent=c.value;$('#format').textContent=r.format||'';$('#type').textContent=c.type;if(!codes.some(x=>x.raw===text)){codes.unshift({raw:text,value:c.value,type:c.type,format:r.format||'',time:new Date().toISOString()});render();navigator.vibrate?.(80);status('✓ Leído: '+c.value)}else status('Código ya incluido: '+c.value)}
function lotTitle(){return (($('#location').value.trim()||'Sin ubicación')+' - '+($('#office').value.trim()||'Sin despacho'))}
function updateLotName(){$('#lotName').textContent=lotTitle()}
function getLots(){try{return JSON.parse(localStorage.getItem(LOT_KEY)||'[]')}catch{return[]}}
function setLots(v){localStorage.setItem(LOT_KEY,JSON.stringify(v))}
function refreshLots(){const lots=getLots();$('#savedLots').innerHTML='<option value="">Seleccionar lote…</option>'+lots.map((l,i)=>`<option value="${i}">${esc(l.name)} · ${l.codes.length}</option>`).join('')}
function saveLot(){if(!codes.length){status('No hay lecturas para guardar');return}const lots=getLots();lots.unshift({name:lotTitle(),location:$('#location').value.trim(),office:$('#office').value.trim(),created:new Date().toISOString(),codes:[...codes]});setLots(lots);refreshLots();status('✓ Lote guardado: '+lotTitle())}
function exportCsv(){
 if(!codes.length){status('No hay lecturas para exportar');return}
 const rows=[['Ubicación','Despacho','Valor','Tipo','Formato','Lectura original','Fecha'],...codes.map(x=>[$('#location').value.trim(),$('#office').value.trim(),x.value,x.type,x.format,x.raw,x.time])];
 const csv='\uFEFF'+rows.map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(';')).join('\r\n');
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=lotTitle().replace(/[\\/:*?"<>|]/g,'_')+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)
}
$('#savedLots').onchange=e=>{const l=getLots()[Number(e.target.value)];if(!e.target.value||!l){$('#savedDetail').className='empty';$('#savedDetail').textContent='Selecciona un lote guardado.';return}$('#savedDetail').className='';$('#savedDetail').innerHTML=`<div class="lotTitle">${esc(l.name)}</div>`+l.codes.map(x=>`<div class="row"><span>${esc(x.value)}<small>${esc(x.type)}</small></span></div>`).join('')};
$('#location').oninput=updateLotName;$('#office').oninput=updateLotName;$('#saveLot').onclick=saveLot;$('#exportCsv').onclick=exportCsv;
$('#start').onclick=start;$('#stop').onclick=()=>{stop();status('Cámara cerrada')};$('#clear').onclick=()=>{codes.length=0;render();$('#last').textContent='—';$('#format').textContent='';$('#type').textContent=''};
$('#torch').onclick=async()=>{if(!track)return;const on=$('#torch').dataset.on!=='1';try{await track.applyConstraints({advanced:[{torch:on}]});$('#torch').dataset.on=on?'1':'0';$('#torch').textContent=on?'🔦 Apagar':'🔦 Linterna'}catch(e){status('La linterna no está disponible')}};
$('#zoom').oninput=async e=>{try{await track?.applyConstraints({advanced:[{zoom:Number(e.target.value)}]})}catch{}};
window.addEventListener('pagehide',stop);render();refreshLots();updateLotName();