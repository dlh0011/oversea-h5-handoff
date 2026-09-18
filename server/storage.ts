import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Snapshot, Version } from '../shared/types.js';
export class HttpError extends Error { constructor(public status:number, message:string){super(message);} }
export class Storage {
  private chain:Promise<unknown> = Promise.resolve();
  state:Snapshot = {projects:[],versions:[]};
  constructor(public root:string){}
  async init(){
    await fs.mkdir(path.join(this.root,'versions'),{recursive:true});
    try { this.state = JSON.parse(await fs.readFile(path.join(this.root,'catalog.json'),'utf8')); }
    catch(e) { if((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  }
  async update<T>(mutate:(state:Snapshot)=>T):Promise<T>{
    const run=this.chain.then(async()=>{
      const next=structuredClone(this.state); const result=mutate(next);
      const temp=path.join(this.root,`catalog-${crypto.randomUUID()}.tmp`);
      await fs.writeFile(temp,JSON.stringify(next,null,2));
      await fs.rename(temp,path.join(this.root,'catalog.json'));this.state=next;return result;
    });
    this.chain=run.catch(()=>{});return run;
  }
  version(id:string):Version {const v=this.state.versions.find(v=>v.id===id);if(!v)throw new HttpError(404,'版本不存在');return v;}
  directory(id:string){if(!/^[\da-f-]{36}$/.test(id)) throw new HttpError(400,'版本标识无效');return path.join(this.root,'versions',id);}
}
export function safePath(root:string, relative:string){
  if(relative.includes('\\') || relative.includes('\0') || path.isAbsolute(relative) || relative.split('/').some(p=>p==='..')) throw new HttpError(400,'文件路径越界');
  const result=path.resolve(root,relative);if(result!==root && !result.startsWith(root+path.sep))throw new HttpError(400,'文件路径越界');return result;
}
