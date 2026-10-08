// npm run preview:ui — renders production React components with local fixture data.
import {build} from 'esbuild';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const dir='/tmp/dashell-studio-preview';
await mkdir(dir,{recursive:true});
await build({entryPoints:['tests/ui/preview.tsx'],bundle:true,format:'esm',outfile:`${dir}/app.js`,alias:{obsidian:resolve('tests/ui/obsidian.ts')},define:{'process.env.NODE_ENV':'"development"'}});
await copyFile('styles-base.css',`${dir}/styles.css`);
await writeFile(`${dir}/index.html`,'<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dashell Studio · UI preview</title><link rel="stylesheet" href="/styles.css"><style>body{margin:0;font-family:system-ui;--text-normal:#25332f;--text-muted:#737d76;--background-primary:#fcfcf9;--interactive-accent:#32796c}button,input,select{font:inherit}button{cursor:pointer}#root{height:100vh}.theme-dark{--text-normal:#e4ebe5;--text-muted:#a0aca3;--background-primary:#202724}</style><div id="root" class="lp-view-content"></div><script type="module" src="/app.js"></script></html>');
// Silent local PCM fixture, long enough to verify seeks and mode changes.
const samples=22050*180;const wav=Buffer.alloc(44+samples*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(22050,24);wav.writeUInt32LE(44100,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples*2,40);await writeFile(`${dir}/sample.wav`,wav);
if (process.argv.includes('--build-only')) process.exit(0);
createServer(async(req,res)=>{const path=new URL(req.url,'http://localhost').pathname;const name=path==='/'?'index.html':path.slice(1);if(!['index.html','app.js','styles.css','sample.wav'].includes(name)){res.writeHead(404).end();return;}try{res.setHeader('Content-Type',name.endsWith('js')?'text/javascript':name.endsWith('css')?'text/css':name.endsWith('wav')?'audio/wav':'text/html');const data=await readFile(`${dir}/${name}`);res.setHeader('Accept-Ranges','bytes');const range=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);if(range){const start=Number(range[1]);const end=Math.min(range[2]?Number(range[2]):data.length-1,data.length-1);res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${data.length}`,'Content-Length':end-start+1});res.end(data.subarray(start,end+1));}else{res.setHeader('Content-Length',data.length);res.end(data);}}catch{res.writeHead(404).end();}}).listen(4173,'127.0.0.1',()=>console.log('Studio preview: http://127.0.0.1:4173'));
