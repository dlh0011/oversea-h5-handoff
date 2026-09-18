import path from 'node:path';
import { Storage } from '../server/storage.js';
import { importPackage } from '../server/import.js';
const archive = process.argv[2];
if (!archive) throw new Error('用法：npm run seed -- <交付.zip>（请在服务器停止时使用）');
const store = new Storage(path.resolve(process.env.HANDOFF_DATA_DIR || 'data'));
await store.init();
const version = await importPackage(store, path.resolve(archive), {});
console.log(`导入完成：${version.label}，${version.pages.length} 个页面状态`);
