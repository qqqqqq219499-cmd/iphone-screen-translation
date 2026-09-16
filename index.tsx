// Screen-position translation prototype, v0.1.0.
// This source does not call an external translation API.
// Apple Shortcuts translates tagged text between the two script invocations.
export type Rect = { x:number; y:number; width:number; height:number };
export type OCRItem = { content:string; confidence:number; boundingBox:Rect };
export type Region = { id:number; original:string; x:number; y:number; w:number; h:number; fontHeight:number };
export type Session = { version:1; token:string; createdAt:number; dataUrl:string; regions:Region[] };
const CACHE_KEY='screen-overlay.v2.pending';
const CACHE_TTL=10*60*1000;
function normalizeText(s:string):string{return s.replace(/\s+/g,' ').trim();}
export function getRegions(items:OCRItem[]):Region[]{
 const regions:Region[]=[];
 for(const item of items){
  const text=normalizeText(item.content),r=item.boundingBox;
  if(!text || (text.match(/[A-Za-z]/g)||[]).length<2 || item.confidence<.35)continue;
  if(/^https?:\/\/\S+$/i.test(text)||/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(text))continue;
  if(![r.x,r.y,r.width,r.height].every(Number.isFinite)||r.width<=0||r.height<=0)continue;
  const x=Math.max(0,r.x),y=Math.max(0,1-r.y-r.height);
  const w=Math.min(r.width,1-x),h=Math.min(r.height,1-y);
  if(w<=0||h<=0||y<.037)continue;
  regions.push({id:0,original:text,x,y,w,h,fontHeight:h});
 }
 regions.sort((a,b)=>Math.abs(a.y-b.y)<Math.min(a.h,b.h)*.45?a.x-b.x:a.y-b.y);
 const grouped:Region[]=[];
 for(const b of regions){
  const prev=grouped[grouped.length-1];
  // Merge only long, left-aligned paragraph lines; leave menu rows and columns separate.
  const merge=prev&&prev.w>.40&&Math.abs(prev.x-b.x)<.012&&b.y>=prev.y+prev.h-.003&&
   b.y-(prev.y+prev.h)<Math.min(prev.fontHeight,b.h)*.65&&
   Math.abs(prev.fontHeight-b.h)<prev.fontHeight*.3&&prev.h/prev.fontHeight<3.8;
  if(merge){prev.original+=' '+b.original;prev.w=Math.max(prev.w,b.x+b.w-prev.x);prev.h=b.y+b.h-prev.y;}
  else grouped.push({...b});
 }
 if(grouped.length>150)throw new Error('\u6587\u5b57\u533a\u57df\u8fc7\u591a\uff0c\u8bf7\u5148\u7f29\u5c0f\u622a\u56fe\u8303\u56f4\u3002');
 return grouped.map((r,i)=>({...r,id:i+1}));
}
export function makeTaggedText(s:Session):string{
 return s.regions.map(r=>`[[${s.token}:${String(r.id).padStart(4,'0')}]]\n${r.original}`).join('\n\n');
}
function normalizeMarkers(text:string):string{
 return text.replace(/[\uff10-\uff19\uff1a\uff3b\uff3d]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xfee0)).replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g,'');
}
export function parseTranslations(text:string,s:Session):Map<number,string>{
 const normalized=normalizeMarkers(text);
 const re=/\[\s*\[\s*(\d{10})\s*:\s*(\d{4})\s*\]\s*\]/g;
 const matches=Array.from(normalized.matchAll(re));
 if(matches.length!==s.regions.length)throw new Error('\u7ffb\u8bd1\u5220\u6539\u4e86\u4f4d\u7f6e\u6807\u8bb0\uff0c\u5df2\u505c\u6b62\u5408\u6210\uff0c\u907f\u514d\u4e2d\u6587\u9519\u4f4d\u3002\u8bf7\u91cd\u8bd5\u6216\u53cd\u9988\u9519\u8bef\u3002');
 if(normalized.slice(0,matches[0]?.index??0).trim())throw new Error('\u7ffb\u8bd1\u5728\u6807\u8bb0\u5916\u6dfb\u52a0\u4e86\u6587\u5b57\uff0c\u4e0d\u4f1a\u731c\u6d4b\u4f4d\u7f6e\u3002');
 const expected=new Set(s.regions.map(r=>r.id)),result=new Map<number,string>();
 for(let i=0;i<matches.length;i++){
  const m=matches[i],id=Number(m[2]);
  if(m[1]!==s.token||!expected.has(id)||result.has(id))throw new Error('\u4f4d\u7f6e\u6807\u8bb0\u4e0d\u5339\u914d\u6216\u91cd\u590d\uff0c\u5df2\u505c\u6b62\u5408\u6210\u3002');
  const from=(m.index??0)+m[0].length,to=i+1<matches.length?matches[i+1].index:normalized.length;
  const value=normalized.slice(from,to).trim();
  if(!value||value.length>6000)throw new Error('\u8bd1\u6587\u4e3a\u7a7a\u6216\u957f\u5ea6\u5f02\u5e38\u3002');
  result.set(id,value);
 }
 return result;
}
export function escapeJSON(value:unknown):string{
 return JSON.stringify(value).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
}
export function makePayload(s:Session,translations:Map<number,string>){
 // Apply a small, explicitly code-related glossary only on coding-tool screens.
 const joined=s.regions.map(r=>r.original).join('\n');
 const coding=/\b(repo|repository|source control)\b/i.test(joined)&&/\bagents?\b/i.test(joined);
 const glossary:Record<string,string>={
  'no repo':'\u65e0\u4ee3\u7801\u4ed3\u5e93',
  'all agents':'\u5168\u90e8\u667a\u80fd\u4f53',
  'needs attention':'\u9700\u8981\u5904\u7406',
  'working':'\u5904\u7406\u4e2d',
  'in review':'\u5f85\u5ba1\u6838',
  'workspaces':'\u5de5\u4f5c\u533a',
  'connect source control':'\u8fde\u63a5\u4ee3\u7801\u6258\u7ba1\u670d\u52a1'
 };
 return {dataUrl:s.dataUrl,blocks:s.regions.map(r=>{
  let text=translations.get(r.id);
  if(!text)throw new Error('Missing translated region.');
  const key=r.original.toLowerCase().replace(/\s+\d+$/,'');
  if(coding&&glossary[key])text=glossary[key]+(r.original.match(/\s+\d+$/)?.[0]??'');
  return {...r,text};
 })};
}

import { Script, Storage, UIImage, Vision, WebViewController, Pasteboard, Safari, Dialog } from 'scripting';
// The renderer template is injected by the build script; no remote code is loaded.
const HTML_TEMPLATE="<!doctype html>\n<html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1,maximum-scale=5\"><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'\"><title>&#21407;&#20301;&#23631;&#24149;&#32763;&#35793;</title>\n<style>\n*{box-sizing:border-box}body{margin:0;background:#e9edf1;color:#14212e;font-family:-apple-system,BlinkMacSystemFont,sans-serif}header{position:sticky;top:0;z-index:3;padding:10px 12px;background:rgba(248,250,252,.96);border-bottom:1px solid #cbd4dc;display:flex;align-items:center;gap:8px}button{font:inherit;font-size:15px;border:1px solid #b8c6d2;border-radius:10px;padding:8px 12px;background:white;color:#15304b}button:disabled{opacity:.4}#status{font-size:12px;margin-left:auto}main{padding:10px 8px 32px;overflow:auto}canvas{display:block;width:100%;height:auto;max-width:900px;margin:auto;background:white;box-shadow:0 3px 18px #0002}#tip{font-size:12px;text-align:center;color:#475569;padding:0 12px 8px}#detail{position:fixed;inset:auto 10px 14px;z-index:4;max-height:46vh;overflow:auto;background:#fff;border:1px solid #bfcbd7;border-radius:16px;padding:16px;box-shadow:0 4px 32px #0004}#detail[hidden]{display:none}#detail p{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.5;margin:6px 0}#source{font-size:14px;color:#566473}#target{font-size:19px}#close{float:right}#error{color:#8b1a20;padding:20px;white-space:pre-wrap}.demo{background:#fff4d9;padding:8px 12px;font-size:12px}\n</style></head><body>\n<div id=\"demo\" class=\"demo\" hidden></div>\n<header><button id=\"toggle\" disabled>&#30475;&#21407;&#22270;</button><button id=\"zoom\" disabled>&#25918;&#22823;</button><span id=\"status\">&#21152;&#36733;&#20013;</span></header>\n<p id=\"tip\">&#20013;&#25991;&#26174;&#31034;&#22312;&#21407;&#20301;&#32622;&#12290;&#28857;&#25991;&#23383;&#21487;&#30475;&#21407;&#25991;&#65292;&#36825;&#26159;&#25130;&#22270;&#32780;&#38750;&#21407; App &#25353;&#38062;&#12290;</p>\n<main><canvas id=\"screen\"></canvas><div id=\"error\" hidden></div></main>\n<section id=\"detail\" hidden><button id=\"close\">&#20851;&#38381;</button><p id=\"target\"></p><p id=\"source\"></p></section>\n<script>\n'use strict';\nconst payload = __PAYLOAD__;\nconst canvas=document.getElementById('screen'),ctx=canvas.getContext('2d');\nconst original=document.createElement('canvas'),raw=original.getContext('2d',{willReadFrequently:true});\nconst translated=document.createElement('canvas'),out=translated.getContext('2d');\nconst toggle=document.getElementById('toggle'),zoom=document.getElementById('zoom');\nlet showingOriginal=false,zoomed=false,boxes=[];\nfunction label(id,text){document.getElementById(id).textContent=text;}\nfunction sampleBackground(b){\n const samples=[];const pad=Math.max(2,Math.round(b.h*.14));\n for(let k=0;k<13;k++){\n  const x=Math.round(b.x+b.w*k/12);\n  samples.push([x,Math.round(b.y-pad)],[x,Math.round(b.y+b.h+pad)]);\n }\n for(let k=0;k<5;k++){\n  const y=Math.round(b.y+b.h*k/4);\n  samples.push([Math.round(b.x-pad),y],[Math.round(b.x+b.w+pad),y]);\n }\n const bins=new Map();\n for(const [xx,yy] of samples){\n  const x=Math.max(0,Math.min(original.width-1,xx)),y=Math.max(0,Math.min(original.height-1,yy));\n  const p=raw.getImageData(x,y,1,1).data;\n  const key=[p[0]>>4,p[1]>>4,p[2]>>4].join(',');\n  const v=bins.get(key)||{n:0,r:0,g:0,b:0};v.n++;v.r+=p[0];v.g+=p[1];v.b+=p[2];bins.set(key,v);\n }\n const c=[...bins.values()].sort((a,b)=>b.n-a.n)[0];\n return [Math.round(c.r/c.n),Math.round(c.g/c.n),Math.round(c.b/c.n)];\n}\nfunction wrap(text,width,size){\n out.font=`${size}px -apple-system,BlinkMacSystemFont,\"PingFang SC\",\"Noto Sans CJK SC\",sans-serif`;\n const lines=[];\n for(const paragraph of text.split(/\\n/)){\n  let line='';\n  for(const ch of Array.from(paragraph)){\n   if(line && out.measureText(line+ch).width>width){lines.push(line);line=ch;}else{line+=ch;}\n  }\n  lines.push(line);\n }\n return lines;\n}\nfunction fit(text,b){\n const initial=Math.max(6,b.fontHeight*1.13);\n let size=initial,lines=wrap(text,b.w,size);\n while(size>5 && (lines.length*size*1.12>b.h*1.18 || lines.some(s=>out.measureText(s).width>b.w))){\n  size=Math.max(5,size-.5);lines=wrap(text,b.w,size);\n }\n return {size,lines};\n}\nfunction render(){\n out.clearRect(0,0,translated.width,translated.height);out.drawImage(original,0,0);\n boxes=payload.blocks.map(b=>({ ...b,x:b.x*original.width,y:b.y*original.height,w:b.w*original.width,h:b.h*original.height,fontHeight:b.fontHeight*original.height }));\n for(const b of boxes){\n  const [r,g,bb]=sampleBackground(b),pad=Math.max(1,b.fontHeight*.10);\n  const fitResult=fit(b.text,b),lineHeight=fitResult.size*1.12;\n  out.save();\n  // Clip text to its own detected region: never cover an unrelated control.\n  out.beginPath();out.rect(b.x-pad,b.y-pad,b.w+pad*2,b.h+pad*2);out.clip();\n  out.fillStyle=`rgb(${r},${g},${bb})`;out.fillRect(b.x-pad,b.y-pad,b.w+pad*2,b.h+pad*2);\n  out.fillStyle=(.2126*r+.7152*g+.0722*bb)>142?'#111820':'#ffffff';\n  out.font=`${fitResult.size}px -apple-system,BlinkMacSystemFont,\"PingFang SC\",\"Noto Sans CJK SC\",sans-serif`;\n  out.textBaseline='middle';\n  const centered=Math.abs((b.x+b.w/2)/original.width-.5)<.075 && b.w<original.width*.42;\n  out.textAlign=centered?'center':'left';\n  const tx=centered?b.x+b.w/2:b.x;\n  const first=b.y+(b.h-fitResult.lines.length*lineHeight)/2+lineHeight/2;\n  fitResult.lines.forEach((line,i)=>out.fillText(line,tx,first+i*lineHeight));\n  out.restore();\n }\n display();\n}\nfunction display(){ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(showingOriginal?original:translated,0,0);toggle.textContent=showingOriginal?'\\u770b\\u4e2d\\u6587':'\\u770b\\u539f\\u56fe';}\ntoggle.onclick=()=>{showingOriginal=!showingOriginal;display();};\nzoom.onclick=()=>{zoomed=!zoomed;canvas.style.width=zoomed?'180%':'100%';canvas.style.maxWidth=zoomed?'none':'900px';zoom.textContent=zoomed?'\\u9002\\u5408\\u5c4f\\u5e55':'\\u653e\\u5927';};\ncanvas.onclick=e=>{\n const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left)*canvas.width/r.width,y=(e.clientY-r.top)*canvas.height/r.height;\n const candidates=boxes.filter(b=>x>=b.x-6&&x<=b.x+b.w+6&&y>=b.y-6&&y<=b.y+b.h+6).sort((a,b)=>a.w*a.h-b.w*b.h);\n const b=candidates[0];if(!b)return;\n label('target',b.text);label('source',b.original);document.getElementById('detail').hidden=false;\n};\ndocument.getElementById('close').onclick=()=>document.getElementById('detail').hidden=true;\nif(payload.demo){const d=document.getElementById('demo');d.hidden=false;d.textContent=payload.demo;}\nconst image=new Image();\nimage.onload=()=>{\n for(const c of [canvas,original,translated]){c.width=image.naturalWidth;c.height=image.naturalHeight;}\n raw.drawImage(image,0,0);render();toggle.disabled=false;zoom.disabled=false;label('status',`${boxes.length} \\u5904\\u6587\\u5b57`);window.__ST_READY__=true;\n};\nimage.onerror=()=>{const el=document.getElementById('error');el.hidden=false;el.textContent='\\u622a\\u56fe\\u8bfb\\u53d6\\u5931\\u8d25\\uff0c\\u8bf7\\u91cd\\u65b0\\u8fd0\\u884c\\u5feb\\u6377\\u6307\\u4ee4\\u3002';};\nimage.src=payload.dataUrl;\n</script></body></html>\n";
function getPending():Session|null{
 const s=Storage.get<Session>(CACHE_KEY);
 if(s&&(s.version!==1||Date.now()-s.createdAt>CACHE_TTL)){Storage.remove(CACHE_KEY);return null;}
 return s;
}
async function prepare(image:UIImage):Promise<string>{
 // Keep at most one pending screenshot; a token prevents cross-run mixups.
 Storage.remove(CACHE_KEY);
 let usable=image;
 if(Math.max(image.width,image.height)>2400){
  const scale=2400/Math.max(image.width,image.height);
  usable=image.preparingThumbnail({width:Math.round(image.width*scale),height:Math.round(image.height*scale)})??image;
 }
 const recognized=await Vision.recognizeText(usable,{
  recognitionLevel:'accurate',recognitionLanguages:['en-US','zh-Hans'],
  usesLanguageCorrection:true,minimumTextHeight:.005,
  customWords:['Cursor','Repo','GitHub','GitLab','Agents']
 });
 const regions=getRegions(recognized.candidates);
 if(!regions.length)throw new Error('\u6ca1\u6709\u8bc6\u522b\u5230\u53ef\u7ffb\u8bd1\u7684\u82f1\u6587\u3002');
 const base64=usable.toJPEGBase64String(.92);
 if(!base64||base64.length>4000000)throw new Error('\u622a\u56fe\u592a\u5927\u6216\u65e0\u6cd5\u8bfb\u53d6\u3002');
 const s:Session={version:1,createdAt:Date.now(),token:String(Math.floor(1000000000+Math.random()*9000000000)),dataUrl:'data:image/jpeg;base64,'+base64,regions};
 const tagged=makeTaggedText(s);
 if(tagged.length>16000)throw new Error('\u672c\u9875\u6587\u5b57\u8fc7\u591a\uff0c\u8bf7\u5206\u5c4f\u7ffb\u8bd1\u3002');
 if(!Storage.set(CACHE_KEY,s))throw new Error('\u4e34\u65f6\u622a\u56fe\u4fdd\u5b58\u5931\u8d25\u3002');
 return tagged;
}
async function display(text:string):Promise<void>{
 const s=getPending();
 if(!s)throw new Error('\u627e\u4e0d\u5230\u5bf9\u5e94\u622a\u56fe\u3002\u8bf7\u4ece\u5feb\u6377\u6307\u4ee4\u7684\u7b2c\u4e00\u6b65\u91cd\u65b0\u8fd0\u884c\u3002');
 let html:string;
 try{html=HTML_TEMPLATE.replace('__PAYLOAD__',()=>escapeJSON(makePayload(s,parseTranslations(text,s))));}
 finally{Storage.remove(CACHE_KEY);}
 const view=new WebViewController({ephemeral:true});
 view.shouldAllowRequest=async r=>r.url==='about:blank'||r.url.startsWith('data:');
 try{
  if(!await view.loadHTML(html))throw new Error('\u8bd1\u56fe\u9884\u89c8\u52a0\u8f7d\u5931\u8d25\u3002');
  await view.present({fullscreen:true,navigationTitle:'\u539f\u4f4d\u5c4f\u5e55\u7ffb\u8bd1'});
 }finally{view.dispose();}
}

// App-to-app bridge. The build appends this to the existing OCR/renderer core.
// No screenshot or text is sent to a web server. Clipboard writes are local-only.
const BRIDGE_TTL = 10 * 60 * 1000;
function callbackURL(key: 'x-success' | 'x-error'): string {
  const value = Script.queryParameters[key];
  // Accept only the Shortcuts callback protocol, never a remote upload URL.
  if (typeof value !== 'string' || !/^shortcuts:\/\//i.test(value)) {
    throw new Error('缺少有效的快捷指令回调，请运行配套的快捷指令，不要单独运行准备步骤。');
  }
  return value;
}
async function clearTextIfUnchanged(text: string): Promise<void> {
  // Do not clear content the user copied while the script was working.
  if (await Pasteboard.getString() === text) await Pasteboard.setItems([]);
}
async function bridgeMain(): Promise<void> {
  const mode = Script.queryParameters.mode;
  if (mode === 'prepare') {
    const success = callbackURL('x-success');
    const image = await Pasteboard.getImage();
    if (!image) throw new Error('没有读到截图。请允许 Scripting 从快捷指令粘贴，然后从英文页面重新触发。');
    const tagged = await prepare(image);
    try {
      await Pasteboard.setItems([{ 'public.plain-text': tagged }], {
        localOnly: true, expirationDate: new Date(Date.now() + BRIDGE_TTL)
      });
      if (!await Safari.openURL(success)) throw new Error('无法返回快捷指令，翻译尚未执行。');
    } catch (error) {
      Storage.remove(CACHE_KEY);
      await clearTextIfUnchanged(tagged);
      throw error;
    }
    // exit only after the callback was successfully opened.
    Script.exit();
    return;
  }
  if (mode === 'display') {
    const text = await Pasteboard.getString();
    if (!text) throw new Error('没有读到译文，请重新运行配套快捷指令。');
    const pending = getPending();
    if (!pending) throw new Error('截图已过期或不存在，请从英文页面重新运行。');
    // Validate session and every marker BEFORE clearing the clipboard/cache.
    parseTranslations(text, pending);
    await clearTextIfUnchanged(text);
    await display(text);
    Script.exit();
    return;
  }
  throw new Error('请用“原位屏幕翻译-直装版”快捷指令启动，不能直接运行此脚本。');
}
async function handleBridgeError(error: unknown): Promise<void> {
  if (Script.queryParameters.mode === 'prepare') {
    try {
      const url = callbackURL('x-error');
      const separator = url.includes('?') ? '&' : '?';
      const detail = '截图识别步骤失败，请查看 Scripting 提示；没有继续翻译。';
      if (await Safari.openURL(url + separator + 'errorCode=1&errorMessage=' + encodeURIComponent(detail))) {
        Script.exit();
        return;
      }
    } catch { /* Show the local error if the error callback is unavailable. */ }
  }
  // No screenshot, original text, or translation is included in a remote request/log.
  await Dialog.alert({ title: '原位屏幕翻译未完成', message: error instanceof Error ? error.message : '运行失败，请从英文页面重新触发。' });
  Script.exit();
}
// ENTRYPOINT
void bridgeMain().catch(handleBridgeError);
