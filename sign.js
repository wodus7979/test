const fs=require('fs');
const OUT=__dirname+'/sign.log';
fs.writeFileSync(OUT,'');
const log=s=>fs.appendFileSync(OUT,s+'\n');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page = await b.newPage({viewport:{width:520,height:340}});
  page.on('pageerror',e=>log('[pageerror] '+e.message));
  await page.goto('file:///home/user/test/dist/minecraft.html');
  await page.check('#chk-creative'); await page.fill('#seed-input','icn1');
  await page.evaluate(()=>{const r=document.getElementById('rng-dist');r.value='7';r.dispatchEvent(new Event('input'));});
  await page.click('#btn-city-ICN');
  await page.waitForFunction(()=>window.game&&window.game.running,null,{timeout:600000});
  const info = await page.evaluate(()=>{
    const g=window.game,w=g.world,hw=w.highway();
    // 안내판 기둥이 중앙선에서 몇 칸 떨어져 서는지 (블록 좌표로 반올림한 뒤)
    const out=[];
    for(let k=0;k<hw.signs.length && out.length<8;k++){
      const sg=hw.signs[k], rec=hw.paths[sg.pi], p=rec.pts[sg.i];
      if(hw.insideCity(p[0],p[1])) continue;
      const j=Math.min(rec.pts.length-1,sg.i+1), q=Math.max(0,sg.i-1);
      let tx=rec.pts[j][0]-rec.pts[q][0], tz=rec.pts[j][1]-rec.pts[q][1];
      const tl=Math.hypot(tx,tz)||1; tx/=tl; tz/=tl;
      const nx=tz, nz=-tx;
      const ox=Math.round(p[0]+nx*HW_SIGN_OFF), oz=Math.round(p[1]+nz*HW_SIGN_OFF);
      let minOff=1e9;
      // 기둥 두 개와 판때기가 차지하는 칸들
      for(let s=-4;s<=4;s++){
        const cx=Math.round(ox+tx*s), cz=Math.round(oz+tz*s);
        const off=Math.abs((cx-p[0])*nx+(cz-p[1])*nz);
        if(off<minOff) minOff=off;
      }
      out.push(+minOff.toFixed(2));
    }
    return {signOff:HW_SIGN_OFF, pavedHalf:HW_HALF, railOuter:HW_HALF+1.8,
      minOffPerSign:out, worst:Math.min.apply(null,out)};
  });
  log(JSON.stringify(info));
  log('DONE');
  await b.close();
})().catch(e=>{log('FATAL '+e.message);process.exit(0);});
