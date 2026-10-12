import assert from 'node:assert/strict';
import { readFile, stat, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const repo=resolve(process.argv[2]||'..');
const run=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8'}).trim();
const changed=run('diff','--name-only').split('\n').filter(Boolean);
const forbidden=p=>p.startsWith('lib/')||p.startsWith('.git/')||p.startsWith('.github/')||p.split('/').some(x=>/^\.env(?:\.|$)/.test(x))||/^(?:foundry\.toml|foundry\.lock|remappings\.txt|\.gitmodules)$/.test(p)||/(?:^|\/)(?:package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|vite\.config\.ts|tsconfig\.json)$/.test(p);
assert(!changed.some(forbidden),'Restricted configuration, dependencies or paths changed.');
assert(!run('ls-files','--stage').split('\n').some(x=>x.startsWith('160000 ')),'Gitlink/submodule present');
const candidates=[...new Set(run('ls-files','--cached','--others','--exclude-standard').split('\n'))].filter(Boolean);
assert(!candidates.some(p=>p.split('/').includes('node_modules')||/\.(?:tgz|map)$/.test(p)||p.includes('npm-cache')),'Generated dependencies/caches/archive/source maps included');
let bytes=0,count=0;for(const p of candidates){try{const info=await stat(join(repo,p));if(info.isFile()){bytes+=info.size;count++;}}catch{}}
assert(bytes<8388608,'Source file bytes exceed submission budget');
const html=await readFile(join(repo,'dist/index.html'),'utf8');
assert(/<title>[^<]+<\/title>/.test(html));
for(const tag of ['name="description"','property="og:title"','property="og:image"','rel="icon"'])assert(html.includes(tag),'Missing '+tag);
const assets=[...html.matchAll(/(?:src|href)="(\.\/[^\"]+)"/g)].map(x=>x[1]);
for(const path of assets)assert((await stat(join(repo,'dist',path))).size>0,'Missing '+path);
assert(!/(?:src|href)="\/(?!\/)/.test(html),'Absolute runtime asset URL');
const files=await readdir(join(repo,'dist/assets'));
for(const file of files){if(!/\.(?:js|css)$/.test(file))continue;const data=await readFile(join(repo,'dist/assets',file),'utf8');assert(!/papertrade|paper-page|#\/paper/i.test(data),'Removed feature in export');}
for(const path of ['src/deployment.json','src/verified.json','src/abis.json'])assert(!changed.includes('web/'+path),'Pinned addresses/ABIs changed');
const social=await readFile(join(repo,'dist/social.png'));assert(social.subarray(1,4).toString()==='PNG');
assert(social.equals(await readFile(join(repo,'web/public/social.png'))),'Social asset not rebuilt');
const digest={};for(const file of ['dist/index.html',...files.map(x=>'dist/assets/'+x),'dist/social.png'])digest[file]=createHash('sha256').update(await readFile(join(repo,file))).digest('hex');
console.log(JSON.stringify({status:'passed',fileBytes:bytes,fileCount:count,budget:8388608,checks:['Protected build configuration, dependencies and pinned addresses/ABIs unchanged','No gitlinks, dependency/cache folders, npm archives or source maps in candidate submission','Required metadata, favicon and bundled social image','Relative production assets resolve','Removed feature absent from runtime bundles','Public social PNG matches source'],sha256:digest},null,2));
