export const OCR_LIMITS={dataUrlBytes:8000000, textOut:24000, timeoutMs:90000, maxPixels:24000000, scale:2};

let engine=null, starting=null, broken=null;

const messageOf=e=>String(e&&e.message||e||'unknown error').slice(0,300);

async function loadEngine(){
  if(globalThis.Tesseract) return;
  await new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src=chrome.runtime.getURL('vendor/tesseract/tesseract.min.js');
    script.onload=resolve;
    script.onerror=()=>reject(Error('The bundled OCR engine could not be loaded. Reinstall Orbit from the folder you trust.'));
    document.head.append(script);
  });
}

async function getWorker(){
  if(engine) return engine;
  if(broken) throw Error(broken);
  starting ??= (async()=>{
    await loadEngine();
    const base=chrome.runtime.getURL('vendor/tesseract/');
    return globalThis.Tesseract.createWorker('eng',1,{
      workerPath:base+'worker.min.js', corePath:base, langPath:base+'lang',
      workerBlobURL:false,   // MV3 CSP allows self-hosted workers, not blob: workers
      gzip:true
    });
  })().catch(e=>{
    broken=`OCR could not start on this machine: ${messageOf(e)}`;
    starting=null;
    throw Error(broken);
  });
  engine=await starting;
  return engine;
}

export function ocrState(){return engine?'ready':broken?'unavailable':'idle';}

// OCR quality on a 1x JPEG screenshot is poor; upscaling against a white ground measurably helps.
export async function upscaleForOcr(dataUrl,scale=OCR_LIMITS.scale){
  const img=new Image();
  img.src=dataUrl;
  await img.decode();
  const width=Math.round(img.naturalWidth*scale), height=Math.round(img.naturalHeight*scale);
  if(width*height>OCR_LIMITS.maxPixels) throw Error('Image is too large to read locally. Crop it or zoom out first.');
  const canvas=document.createElement('canvas');
  canvas.width=width; canvas.height=height;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#fff'; ctx.fillRect(0,0,width,height);
  ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
  ctx.drawImage(img,0,0,width,height);
  return canvas.toDataURL('image/png');
}

export async function readImageText(dataUrl,{signal,timeoutMs=OCR_LIMITS.timeoutMs,onStage=()=>{}}={}){
  if(typeof dataUrl!=='string'||!dataUrl.startsWith('data:image/')) throw Error('Only image data can be read.');
  if(dataUrl.length>OCR_LIMITS.dataUrlBytes) throw Error('Image is too large for local OCR (8 MB encoded limit). Reduce browser zoom or crop it.');
  signal?.throwIfAborted?.();
  onStage('starting');
  const worker=await getWorker();
  signal?.throwIfAborted?.();
  onStage('preparing');
  const prepared=await upscaleForOcr(dataUrl);
  onStage('reading');
  let timer,abortFn;
  const deadline=new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(Error('Local OCR timed out after '+Math.round(timeoutMs/1000)+' seconds. Try a smaller image or a zoomed-in region.')),timeoutMs);
    abortFn=()=>reject(signal.reason||Error('Aborted'));
    signal?.addEventListener?.('abort',abortFn,{once:true});
  });
  try{
    const {data}=await Promise.race([worker.recognize(prepared),deadline]);
    const text=String(data?.text||'').replace(/\r/g,'').replace(/[ \t]{2,}/g,' ').replace(/\n{3,}/g,'\n\n').trim();
    const confidence=Math.round(Number(data?.confidence)||0);
    if(!text) throw Error('No readable text was found in that image.');
    return {text:text.slice(0,OCR_LIMITS.textOut), confidence, truncated:text.length>OCR_LIMITS.textOut};
  }finally{
    clearTimeout(timer);
    signal?.removeEventListener?.('abort',abortFn);
  }
}
