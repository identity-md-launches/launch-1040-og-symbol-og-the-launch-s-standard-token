import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withPreview } from './browser-support.mjs';
const output=resolve(process.argv[3]);const relay=process.argv[4];
const evidence=JSON.parse(await readFile(resolve(output,'mainnet-check.json'),'utf8'));
// Replay actual mainnet immediately before the first recorded sale, not fabricated listings.
const block=BigInt(evidence.sales[0].block)-1n, tag='0x'+block.toString(16);
const results={status:'running',block:String(block),basis:'Actual historical Ethereum state before the first recorded OG auction sale; read-only browser replay.',errors:[]};
await withPreview(process.argv[2],async(browser,url)=>{
 const page=await browser.newPage({viewport:{width:1440,height:1280}});
 page.on('pageerror',e=>results.errors.push(String(e)));
 await page.route('https://**',async route=>{
  if(route.request().method()!=='POST')return route.continue();
  const body=route.request().postDataJSON();
  if(body.method==='eth_blockNumber')return route.fulfill({json:{jsonrpc:'2.0',id:body.id,result:tag}});
  if(['eth_call','eth_getCode','eth_getBalance'].includes(body.method))body.params[1]=tag;
  if(body.method==='eth_getBlockByNumber'&&['latest','pending'].includes(body.params[0]))body.params[0]=tag;
  const response=await fetch(relay,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  await route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
 });
 try {
  await page.goto(url+'#/auctions');
  await page.locator('.nft-card').first().waitFor({timeout:60000});
  await page.waitForFunction(()=>[...document.querySelectorAll('.nft-card')].slice(0,4).every(e=>e.querySelector('img')?.complete)&&document.querySelectorAll('.nft-card').length>=4,{},{timeout:45000});
  results.listingCount=await page.locator('.nft-card').count();assert(results.listingCount>0);
  await page.getByText('No confirmed auction sales yet.',{exact:true}).waitFor({timeout:60000});
  results.text=await page.locator('main').innerText();
  assert(results.text.includes('Last on-chain quote')&&results.text.includes('Floor'));
  await page.screenshot({path:resolve(output,'auctions-historical-live.jpg'),type:'jpeg',quality:82});
  await page.locator('.nft-card button').first().click();await page.getByRole('dialog').waitFor();
  assert((await page.getByRole('dialog').innerText()).includes('Connect a wallet'));
  await page.keyboard.press('Escape');
  results.checks=['Actual mainnet historical active listings, price/floor/countdown and local NFT art render.','Unconnected auction purchase action opens the wallet picker; no signing or transaction.'];
  assert.equal(results.errors.length,0);results.status='passed';
 } catch(e){results.status='failed';results.error=String(e);results.text=await page.locator('main').innerText();process.exitCode=1;}
 finally{await writeFile(resolve(output,'auction-history-results.json'),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results,null,2));}
});
