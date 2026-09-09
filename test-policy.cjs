'use strict';
const assert = require('node:assert/strict');
const P = require('./policy-engine.js');
let checks=0;
const eq=(a,b,msg)=>{assert.deepEqual(a,b,msg);checks++;};
const ok=(a,msg)=>{assert.ok(a,msg);checks++;};
const throws=fn=>{assert.throws(fn);checks++;};
const x=P.defaultInput(), base=P.currentPolicy();
// NTA published annual examples, before reconstruction surtax.
eq(P.progressive(5000000,P.CURRENT).tax,572500);
eq(P.progressive(7000000,P.CURRENT).tax,974000);
// Independently verify integration against every row of the official quick table.
const quick=[[1950000,500,0],[3300000,1000,97500],[6950000,2000,427500],[9000000,2300,636000],
 [18000000,3300,1536000],[40000000,4000,2796000],[Infinity,4500,4796000]];
for(let income=0;income<=100000000;income+=137000){
 const [limit,rate,offset]=quick.find(([limit])=>income<limit);
 eq(P.progressive(income,P.CURRENT).tax,Math.floor(income*rate/10000-offset));
}
for(const b of P.CURRENT.filter(b=>b.upper!==null)) {
 const at=P.progressive(b.upper,P.CURRENT).tax;
 ok(P.progressive(b.upper+1,P.CURRENT).tax-at<=1,'no whole-income jump at bracket');
 ok(at-P.progressive(b.upper-1,P.CURRENT).tax<=1,'no whole-income jump at bracket');
}
// Salary income special cases from NTA's 2026 table.
for(const [gross,income] of [[0,0],[740999,0],[741000,1000],[1780000,1040000],
 [2190999,1450999],[2191000,1451000],[2192999,1451000],[2193000,1453000],
 [2195999,1453000],[2196000,1456000],[2199999,1456000],[2200000,1460000],
 [3600000,2440000],[5000000,3560000],[6000000,4360000],[6600000,4840000],[8500000,6550000]])eq(P.salaryIncome(gross),income);
for(const [income,deduction] of [[4890000,1040000],[4890001,670000],[6550000,670000],[6550001,620000],
 [23500000,620000],[23500001,480000],[24000000,480000],[24000001,320000],
 [24500001,160000],[25000000,160000],[25000001,0]])eq(P.currentBasic(income),deduction);
eq(P.firstSalaryAboveIncome(4890000),6655557);
eq(P.firstSalaryAboveIncome(6550000),8500001);
// The 1.78m point assumes zero social deductions; adding social deductions shifts taxable start.
eq(P.calculate({...x,annualGross:1780000,socialMode:'manual',socialAnnual:0}).national.annual,0);
eq(P.calculate({...x,annualGross:1790000,socialMode:'manual',socialAnnual:0}).national.annual,500);
eq(P.residentTax(P.salaryIncome(1190000),0).annual,0);
eq(P.residentTax(P.salaryIncome(1190001),0).annual,6000);
eq(P.residentTax(25000001,0).adjustment,0);
// Defaults and the threshold example are independently hand calculated in README.
const a=P.calculate(x);
eq(a.social.parts,{health:295500,care:0,child:6900,pension:549000,employment:30000});
eq(a.social.annual,881400);eq(a.national.taxable,2438000);eq(a.national.annual,149300);
eq(a.resident.annual,307200);eq(a.net,4662100);
const changed=P.currentPolicy();changed.brackets[0].upper=3000000;
const c=P.compare(x,changed);eq(c.changed.national.annual,124400);eq(c.changed.net,4687000);eq(c.delta,24900);
eq(c.current.social,c.changed.social);eq(c.current.resident,c.changed.resident);
eq(P.currentPolicy().brackets[0].upper,1950000,'baseline immutable');
const zero={brackets:[{upper:null,rateBp:0}],basicMode:'current',basicAmount:0};
eq(P.compare(x,zero).delta,149300);
const flat={brackets:[{upper:null,rateBp:1000}],basicMode:'flat',basicAmount:1000000};
ok(P.calculate(x,flat).national.annual>0);
const twenty={...base,brackets:[...Array.from({length:19},(_,i)=>({upper:(i+1)*100000,rateBp:500})),{upper:null,rateBp:500}]};
eq(P.progressive(3000000,twenty.brackets).tax,150000);
eq(P.calculate(x,{...base,basicMode:'add',basicAmount:-10000000}).national.basic,0);
eq(P.calculate({...x,annualGross:100000000},{...base,basicMode:'add',basicAmount:500000}).national.basic,500000);
const split={...base,brackets:[{upper:1000000,rateBp:500},...base.brackets]};
for(const gross of [960000,1780000,6000000,100000000])eq(P.calculate({...x,annualGross:gross},split),
 {...P.calculate({...x,annualGross:gross}),national:{...P.calculate({...x,annualGross:gross}).national,portions:P.calculate({...x,annualGross:gross},split).national.portions}});
// All branch/rate combinations preserve the accounting identities.
for(const gross of [960000,1190000,1780000,2191000,6000000,6655556,6655557,8500000,100000000]) {
 for(const age of [20,39,40,64]) for(const prefecture of ['東京都','佐賀県','新潟県'])for(const employment of [0,50,60]) {
  for(const p of [base,changed,zero,flat]) {
   const r=P.calculate({...x,annualGross:gross,age,prefecture,employment},p);
   eq(r.net+r.deductions,gross);eq(r.deductions,r.social.annual+r.national.annual+r.resident.annual);
   ok(Number.isSafeInteger(r.net));ok(Number.isSafeInteger(r.social.annual));
  }
 }
}
// Verify the discontinuity is sampled at both sides, not interpolated away.
const samples=P.sampleSalaries(960000,12000000);
for(const v of [6655556,6655557,6655558,8500000,8500001,8500002,3719999,3720000,3720001])ok(samples.includes(v));
const cliff1=P.calculate({...x,annualGross:6655556}),cliff2=P.calculate({...x,annualGross:6655557});
ok(cliff2.net<cliff1.net,'base deduction phaseout can create an actual net-income drop');
// Invalid schedules, values and imported configuration must be rejected.
for(const brackets of [[],[{upper:1000,rateBp:500}],
 [{upper:1950000,rateBp:500},{upper:1500000,rateBp:1000},{upper:null,rateBp:2000}],
 [{upper:1950000,rateBp:500},{upper:1950000,rateBp:1000},{upper:null,rateBp:2000}],
 [{upper:1950010,rateBp:500},{upper:null,rateBp:2000}],
 [{upper:null,rateBp:NaN}],[{upper:null,rateBp:10001}],[{upper:null,rateBp:-1}],
 Array.from({length:21},(_,i)=>({upper:i===20?null:(i+1)*1000,rateBp:500}))])throws(()=>P.validatePolicy({...base,brackets}));
for(const bad of [{annualGross:959999},{annualGross:100000001},{age:19},{age:65},{prefecture:'不明'},
 {employment:55},{socialAnnual:-1},{residentAnnual:NaN},{annualGross:Infinity}])throws(()=>P.calculate({...x,...bad}));
throws(()=>P.validateDocument({format:'other',version:1,input:x,policy:base,graphMax:12000000}));
throws(()=>P.validateDocument({format:'tedori-policy',version:2,input:x,policy:base,graphMax:12000000}));
eq(P.validateDocument({format:'tedori-policy',version:1,input:x,policy:base,graphMax:3000000}).graphMax,3000000);
console.log(`PASS: ${checks} assertions; official examples, all tax bands, 2026 deductions, caps, cliffs, custom schedules, validation.`);
