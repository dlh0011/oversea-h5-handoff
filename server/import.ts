import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { Transform } from 'node:stream';
import yauzl from 'yauzl';
import { ZipArchive } from 'archiver';
import { z } from 'zod';
import { HttpError, safePath, Storage } from './storage.js';
import type {FileEntry, Manifest, Page, Version} from '../shared/types.js';
const pageSchema=z.object({id:z.string().min(1).max(100),name:z.string().min(1).max(120),path:z.string().min(1).max(500),width:z.number().int().min(240).max(2560).default(402),height:z.number().int().min(200).max(5000).default(903),note:z.string().max(2000).optional()});
const manifestSchema=z.object({schemaVersion:z.literal(1),name:z.string().min(1).max(120),version:z.string().min(1).max(80),notes:z.string().max(10000).optional(),figmaUrl:z.string().max(1000).optional(),previewRoot:z.string().max(300).default('.'),sourceArchive:z.string().max(300).optional(),pages:z.array(pageSchema).min(1).max(100)});
const MAX_EXPANDED=250*1024*1024, MAX_ENTRY=80*1024*1024;
export async function extractZip(zipPath:string,destination:string){
 const files:FileEntry[]=[]; let bytes=0, actualTotal=0, count=0;
 await fs.mkdir(destination,{recursive:true});
 await new Promise<void>((resolve,reject)=>{
  yauzl.open(zipPath,{lazyEntries:true,validateEntrySizes:true,strictFileNames:true},(error,zip)=>{
   if(error || !zip){reject(new HttpError(400,'无法打开 ZIP，请确认文件完整且未加密'));return;}
   let ended=false;
   const fail=(e:unknown)=>{if(ended)return;ended=true;zip.close();reject(e);};
   zip.on('error',e=>fail(new HttpError(400,`ZIP 无效：${e.message}`)));
   zip.on('end',()=>{if(!ended){ended=true;resolve();}});
   zip.on('entry',entry=>{void(async()=>{
    if(++count>3000)throw new HttpError(400,'文件超过 3000 个，请排除 node_modules 后重新打包');
    const rel=entry.fileName;
    if(rel.split('/').some((part: string)=>part==='node_modules'||part==='.git'||part==='.env'||part.startsWith('.env.')))throw new HttpError(400,'交付包含 node_modules、Git 或环境配置，请使用干净的交付包');
    const target=safePath(destination,rel);
    if(((entry.externalFileAttributes>>>16)&0xf000)===0xa000)throw new HttpError(400,'交付包不能包含符号链接');
    if(entry.generalPurposeBitFlag&1)throw new HttpError(400,'不支持加密 ZIP');
    bytes+=entry.uncompressedSize;
    if(bytes>MAX_EXPANDED||entry.uncompressedSize>MAX_ENTRY)throw new HttpError(400,'解压后体积超限（总计 250MB，单文件 80MB）');
    if(rel.endsWith('/')){await fs.mkdir(target,{recursive:true});zip.readEntry();return;}
    await fs.mkdir(path.dirname(target),{recursive:true});
    const stream=await new Promise<import('node:stream').Readable>((r,j)=>zip.openReadStream(entry,(e,s)=>e||!s?j(e):r(s)));
    let size=0;
    await pipeline(stream,new Transform({transform(chunk,enc,done){size+=chunk.length;actualTotal+=chunk.length;if(size>MAX_ENTRY||actualTotal>MAX_EXPANDED)done(new HttpError(400,'ZIP 实际解压体积超限'));else done(null,chunk);}}),createWriteStream(target,{flags:'wx'}));
    files.push({path:rel,size});zip.readEntry();
   })().catch(fail);});
   zip.readEntry();
  });
 });return files;
}
export async function archiveSingleHtml(htmlPath:string,archivePath:string){
 const stream=createWriteStream(archivePath);
 const done=new Promise<void>((resolve,reject)=>{stream.on('close',resolve);stream.on('error',reject);});
 const archive=new ZipArchive({zlib:{level:9}});
 archive.on('error',error=>stream.destroy(error));archive.pipe(stream);
 archive.file(htmlPath,{name:'standalone.html'});
 await archive.finalize();await done;
}
function validateUrl(value=''){if(value && !/^https:\/\/(www\.)?figma\.com\//.test(value))throw new HttpError(400,'设计链接须为 Figma HTTPS 链接');return value;}
export async function importPackage(store:Storage,zipPath:string,input:{projectId?:string;name?:string;label?:string;notes?:string}){
 const id=crypto.randomUUID(), directory=store.directory(id), content=path.join(directory,'content');
 try{
  const rawFiles=await extractZip(zipPath,content);
  const manifests=rawFiles.filter(f=>/(^|\/)handoff\.json$/.test(f.path)).sort((a,b)=>a.path.split('/').length-b.path.split('/').length);
  let manifest:Manifest, base='';
  if(manifests.length){
   base=path.posix.dirname(manifests[0].path);if(base==='.')base='';
   let parsed;try{parsed=manifestSchema.safeParse(JSON.parse(await fs.readFile(safePath(content,manifests[0].path),'utf8')));}catch{throw new HttpError(400,'handoff.json 不是有效 JSON');}
   if(!parsed.success)throw new HttpError(400,`交付清单无效：${parsed.error.issues[0].path.join('.')} ${parsed.error.issues[0].message}`);
   manifest=parsed.data;
  }else{
   const entries=rawFiles.filter(f=>/(^|\/)(standalone|index)\.html$/i.test(f.path)).sort((a,b)=>a.path.split('/').length-b.path.split('/').length||Number(!a.path.endsWith('standalone.html'))-Number(!b.path.endsWith('standalone.html')));
   if(!entries.length)throw new HttpError(400,'找不到预览入口。请上传包含 standalone.html 或构建后 index.html 的 ZIP');
   const entry=entries[0].path;const html=await fs.readFile(safePath(content,entry),'utf8');
   if(/src=["']\/?src\/.+\.(tsx?|jsx?)["']/.test(html))throw new HttpError(400,'这是未构建的 React 源码，请先执行 npm run build -- --base=./ 再上传 dist 预览');
   manifest={schemaVersion:1,name:input.name||'未命名活动',version:input.label||'v1',previewRoot:path.posix.dirname(entry),pages:[{id:'home',name:'活动首页',path:path.posix.basename(entry),width:402,height:903}]};
  }
  if(new Set(manifest.pages.map(p=>p.id)).size!==manifest.pages.length)throw new HttpError(400,'页面 ID 不能重复');
  safePath(content,manifest.previewRoot||'.');
  const previewRoot=path.posix.join(base,manifest.previewRoot||'.');
  const root=safePath(content,previewRoot);
  for(const page of manifest.pages){
   if(/^[a-z]+:|^\/|\?/.test(page.path))throw new HttpError(400,'页面路径只能是包内相对 HTML 路径，可带 #状态');
   const file=safePath(root,page.path.split('#')[0]);
   if(!/\.html?$/i.test(file))throw new HttpError(400,'预览入口必须是 HTML 文件');
   try{await fs.access(file);}catch{throw new HttpError(400,`缺少页面：${page.path}`);}
   await validateResources(root,file);
  }
  let sourceArchive:string|undefined;
  if(manifest.sourceArchive){safePath(content,manifest.sourceArchive);sourceArchive=path.posix.join(base,manifest.sourceArchive);if(!sourceArchive.endsWith('.zip')||!rawFiles.some(f=>f.path===sourceArchive))throw new HttpError(400,'源码 ZIP 不存在');}
  const now=new Date().toISOString(),stat=await fs.stat(zipPath);
  await fs.copyFile(zipPath,path.join(directory,'package.zip'));
  const version:Version={id,projectId:input.projectId||crypto.randomUUID(),label:input.label?.trim()||manifest.version,notes:input.notes?.trim()||manifest.notes||'',createdAt:now,previewKey:crypto.randomBytes(24).toString('hex'),previewRoot,pages:manifest.pages,files:rawFiles,sourceArchive,archiveSize:stat.size,status:'reviewing',workflowStatus:input.projectId?'ready':'reviewing',revision:0,issues:[]};
  await store.update(state=>{
   if(input.projectId&&!state.projects.some(p=>p.id===input.projectId))throw new HttpError(404,'项目不存在');
   if(state.versions.some(v=>v.projectId===version.projectId&&v.label===version.label))throw new HttpError(409,'这个版本号已存在，请使用新的版本号');
   if(!input.projectId)state.projects.push({id:version.projectId,name:input.name?.trim()||manifest.name,figmaUrl:validateUrl(manifest.figmaUrl),createdAt:now});
   state.versions.push(version);
  });return version;
 }catch(error){await fs.rm(directory,{recursive:true,force:true});throw error;}
}
async function validateResources(root:string,htmlFile:string){
 const html=await fs.readFile(htmlFile,'utf8');const refs=[...html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)].map(m=>m[1]);
 for(const ref of refs){
  if(/^(?:[a-z][\w+.-]*:|\/\/|#)/i.test(ref))continue;
  if(ref.startsWith('/'))throw new HttpError(400,`资源使用根路径 ${ref}，请以相对路径构建（Vite: --base=./）`);
  const clean=ref.split(/[?#]/)[0];if(!clean)continue;
  let file;try{file=path.resolve(path.dirname(htmlFile),decodeURIComponent(clean));}catch{throw new HttpError(400,'资源路径编码无效');}
  if(!file.startsWith(root+path.sep))throw new HttpError(400,'预览引用了目录外资源');
  try{await fs.access(file);}catch{throw new HttpError(400,`缺少预览资源：${ref}`);}
 }
}
