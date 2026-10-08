import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { createPublicClient, http, parseAbi } from 'viem';
import verified from '../src/verified.json' with { type: 'json' };
const root = resolve(process.argv[2] || '../dist');
const output = resolve(process.argv[3] || '../artifacts');
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/preview\/?/, '');
    const file = resolve(root, path || 'index.html');
    if (!file.startsWith(root + '/') || !req.url.startsWith('/preview/')) { res.writeHead(404).end(); return; }
    const data = await readFile(file);
    const type = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.woff2':'font/woff2', '.woff':'font/woff' }[extname(file)] || 'application/octet-stream';
    res.writeHead(200, {'Content-Type':type, 'Cache-Control':'no-store'}).end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/preview/`;
let browser;
const results = { status:'running', checks:[], viewports:[], contrast:[], consoleErrors:[], failedStatic:[], liveLimitations:[] };
try {
  const candidates = await readdir('/root/.cache/ms-playwright').catch(()=>[]);
  const cache = candidates.filter(v=>/^chromium-\d+$/.test(v)).sort().at(-1);
  browser = await chromium.launch({ headless:true, executablePath: process.env.PAPER_CHROME || (cache ? `/root/.cache/ms-playwright/${cache}/chrome-linux64/chrome` : undefined), args:['--no-sandbox'] });
  const context = await browser.newContext({viewport:{width:1440,height:1080}});
  const page = await context.newPage();
  page.on('pageerror', e=>results.consoleErrors.push(String(e)));
  page.on('response', r=>{if(r.url().startsWith(url)&&r.status()>=400)results.failedStatic.push([r.url(),r.status()]);});
  await page.goto(url+'#/paper');
  await page.getByRole('heading',{level:1,name:'Two legs. One plan.'}).waitFor();
  await page.locator('[data-testid="paper-minted"]').filter({hasText:'9,800.00'}).waitFor();
  assert.equal(await page.locator('[data-testid="paper-cost"]').innerText(),'$0.001491');
  for(const width of [1440,1024,768,430,390,320]) {
    await page.setViewportSize({width,height:960});
    const metrics = await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,inputs:[...document.querySelectorAll('.paper-page input,.paper-page select')].filter(e=>e.getClientRects().length).map(e=>parseFloat(getComputedStyle(e).fontSize))}));
    assert(metrics.scrollWidth<=width,`overflow at ${width}`);
    assert(metrics.inputs.every(n=>n>=16));
    results.viewports.push(metrics);
  }
  results.checks.push('Production assets served at /preview/ subpath; default economics; six widths without page overflow; visible inputs >=16px.');
  await page.setViewportSize({width:1440,height:1080});
  await page.getByLabel('Market',{exact:true}).selectOption('ETH');
  assert.notEqual(await page.locator('[data-testid="paper-cost"]').innerText(),'$0.001491');
  await page.getByLabel('Queue / LP scenario').selectOption('active');
  assert.equal(await page.locator('[data-testid="paper-minted"]').innerText(),'10,000.00');
  await page.getByLabel('Target absolute move (%)').fill('0');
  assert.equal(await page.locator('[data-testid="paper-cost"]').innerText(),'Undefined');
  await page.getByLabel('Leverage (×)').fill('1000');
  await page.getByLabel('Target absolute move (%)').fill('1');
  await page.getByText('Hard-bust scenario:',{exact:false}).waitFor();
  await page.getByLabel('Deposit (USDC)').fill('');
  await page.getByRole('heading',{name:'Adjust the scenario'}).waitFor();
  assert.equal(await page.getByLabel('Deposit (USDC)').getAttribute('aria-invalid'),'true');
  await page.getByRole('button',{name:'Reset preset'}).click();
  await page.locator('.paper-advanced summary').click();
  await page.getByLabel('Mint regime (scenario)').selectOption('tail');
  await page.getByLabel('Cumulative tail progress H (USD)').fill('120000000');
  assert.equal(await page.locator('[data-testid="paper-minted"]').innerText(),'2,450.00');
  await page.getByLabel('Winner recovery value (%)').fill('0');
  await page.getByLabel('Inbound route costs (USDC)').fill('5');
  assert.notEqual(await page.locator('[data-testid="paper-minted"]').innerText(),'2,450.00');
  await page.getByRole('button',{name:'Reset preset'}).click();
  results.checks.push('Market, queue, zero-move, liquidation, empty input, reset, tail progress, recovery and route-cost interactions.');
  await page.getByLabel('Deposit currency').selectOption('ETH');
  await page.getByLabel('Deposit (ETH)').fill('0.1');
  await page.getByRole('button',{name:'Refresh route quote'}).click();
  await page.getByRole('button',{name:'Refresh route quote'}).waitFor({state:'visible',timeout:60000});
  const quoteStatus = await page.locator('.paper-quote-status').innerText();
  results.routeStatus = quoteStatus;
  results.routeRows = await page.locator('#paper-route .paper-data-rows').innerText();
  results.liveLimitations = await page.locator('#paper-route .paper-inline-error').allTextContents();
  const usePrice = page.getByRole('button',{name:'Use quoted ETH price in calculator'});
  if(await usePrice.count()) {
    await usePrice.click();
    assert.notEqual(await page.getByLabel('ETH price (USDC)').inputValue(),'3000');
    await page.getByLabel('Deposit (ETH)').fill('0.2');
    assert(await usePrice.isDisabled());
    assert((await page.locator('.paper-quote-status').innerText()).includes('Inputs changed'));
  }
  await page.getByRole('button',{name:'Reset preset'}).click();
  results.checks.push('Live route read and explicit unknown fees; quote price application; changed-input quote disabled.');
  const steps = page.locator('.paper-step-list button');
  for(let i=0;i<7;i++) { await steps.nth(i).click(); assert.equal(await steps.nth(i).getAttribute('aria-current'),'step'); assert(await page.locator('.paper-step-detail > button').isDisabled()); }
  await page.getByRole('button',{name:'Previous step'}).click();
  assert((await page.locator('.paper-step-detail h3').innerText()).includes('Stake'));
  await page.getByRole('button',{name:'Next step'}).click();
  assert(await page.getByRole('button',{name:'Next step'}).isDisabled());
  await page.getByRole('button',{name:'Guide & risks',exact:true}).click();
  await page.getByText('Queue risk: cash loss now, possible payment later',{exact:true}).click();
  assert(await page.getByText('Only the profit on a USD-funded win queues;',{exact:false}).isVisible());
  results.checks.push('All seven step details, disabled launch actions, previous/next bounds, section focus and risk disclosure.');
  await page.getByRole('button',{name:'Connect to check'}).click();
  assert(await page.getByRole('dialog').isVisible());
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'Connect to check');
  // Fixture uses a discovered public NFT owner. No private key or signing implementation.
  const rpc = createPublicClient({ transport: http('https://ethereum-rpc.publicnode.com') });
  const owner = await rpc.readContract({ address: verified.contracts.collection.address, abi: parseAbi(['function ownerOf(uint256) view returns (address)']), functionName:'ownerOf', args:[1n] });
  await page.evaluate(owner=>{
    window.paperWalletMethods=[]; window.paperWalletListeners={};
    const provider={request:async({method})=>{window.paperWalletMethods.push(method);if(method==='eth_requestAccounts'||method==='eth_accounts')return [owner];if(method==='eth_chainId')return '0x1';throw Error('Test wallet blocks all signing and writes.');},on:(e,fn)=>{window.paperWalletListeners[e]=fn;},removeListener:(e)=>{delete window.paperWalletListeners[e];}};
    window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info:{uuid:'paper-readonly-validation',name:'Read-only validation wallet',rdns:'test.invalid'},provider}}));
  },owner);
  await page.getByRole('button',{name:'Connect to check'}).click();
  await page.getByRole('button',{name:'Read-only validation wallet'}).click();
  await page.getByText('✓ Holder · Ethereum verified').waitFor({timeout:60000});
  await page.getByText('View NFT levels and weights',{exact:true}).click();
  await page.locator('.paper-holder-result li').filter({hasText:'Pepe #1 · level'}).waitFor();
  results.holder = await page.locator('.paper-holder-result').innerText();
  assert.deepEqual(await page.evaluate(()=>window.paperWalletMethods),['eth_requestAccounts','eth_chainId']);
  await page.evaluate(()=>window.paperWalletListeners.accountsChanged([]));
  assert.equal(await page.locator('.paper-holder-result').count(),0);
  results.checks.push('EIP-6963 fixture connection with live NFT/OG/level/weight reads; only account+chain RPC requested; account removal clears holder results; wallet dialog Escape restores focus.');
  await page.getByRole('button',{name:'Calculator',exact:true}).click();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'Reset preset');
  const focus = await page.evaluate(()=>{const c=getComputedStyle(document.activeElement);return {width:c.outlineWidth,style:c.outlineStyle,color:c.outlineColor};});
  assert.equal(focus.width,'2px');
  results.focus=focus;
  const audit = await new AxeBuilder({page}).include('.paper-page').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  results.axe = { violations: audit.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})), incomplete:audit.incomplete.map(v=>v.id), passes:audit.passes.length };
  assert.equal(audit.violations.length,0,JSON.stringify(results.axe));
  results.contrast=await page.evaluate(()=>{
    const lum=rgb=>{const s=rgb.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return .2126*s[0]+.7152*s[1]+.0722*s[2];};
    return ['.paper-main-result strong','.paper-main-result p','.paper-cash-risk strong','.paper-field label','.paper-holder .primary'].map(selector=>{const e=document.querySelector(selector);const fg=getComputedStyle(e).color;let b=e;while(b&&getComputedStyle(b).backgroundColor==='rgba(0, 0, 0, 0)')b=b.parentElement;const bg=getComputedStyle(b).backgroundColor;const [a,z]=[lum(fg),lum(bg)].sort((a,b)=>b-a);return {selector,fg,bg,ratio:(a+.05)/(z+.05)};});
  });
  assert(results.contrast.every(p=>p.ratio>=4.5));
  await page.emulateMedia({reducedMotion:'reduce'});
  const motion=await page.locator('.paper-holder button').evaluate(e=>getComputedStyle(e).transitionDuration);
  results.reducedMotion=motion;
  await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});
  await page.setViewportSize({width:768,height:1080});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.evaluate(()=>{document.documentElement.style.fontSize='';});
  results.checks.push('Keyboard focus, scoped axe WCAG A/AA scan, measured rendered contrast, reduced motion and 200% text enlargement at 768px. Native zoom not tested.');
  for(const route of ['home','trade','my-pepes','leaderboard','auctions','stats']) {
    await page.locator(`header nav a[href="#/${route}"]`).click();
    assert.equal(await page.locator('main h1').count(),1);
    assert.equal(await page.locator('.paper-page').count(),0);
  }
  await page.locator('header nav a[href="#/paper"]').click();
  await page.setViewportSize({width:1440,height:1080}); await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:resolve(output,'paper-desktop.jpg'),type:'jpeg',quality:80});
  await page.getByRole('button',{name:'Calculator',exact:true}).click();
  await page.screenshot({path:resolve(output,'paper-calculator.jpg'),type:'jpeg',quality:80});
  await page.setViewportSize({width:390,height:900}); await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:resolve(output,'paper-mobile.jpg'),type:'jpeg',quality:80});
  results.checks.push('All six existing OG routes still navigate; desktop, calculator and mobile production screenshots saved.');
  assert.equal(results.consoleErrors.length,0); assert.equal(results.failedStatic.length,0);
  results.status='passed';
} catch(e) {results.status='failed';results.error=String(e);process.exitCode=1;}
finally { await writeFile(resolve(output,'paper-browser-results.json'),JSON.stringify(results,null,2)+'\n'); await browser?.close(); await new Promise(r=>server.close(r)); }
console.log(JSON.stringify(results,null,2));
