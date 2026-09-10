'use strict';
const assert = require('node:assert/strict');
const U = require('./unified-engine.js');
const input = changes => {const x={...U.defaultInput(),...changes};x.annualGross=U.annualGross(x);return x;};
let checks=0;
const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
// Independent official example: Mihama town's 60,200 -> June 5,200, others 5,000.
// URLs, scope and manual exception selection: docs/RESIDENT-NOTICE.md.
for (const [annual,june,monthly] of [[0,0,0],[1,1,0],[1199,1199,0],[1200,100,100],
  [60200,5200,5000],[240000,20000,20000],[240500,20500,20000],
  [241199,21199,20000],[241200,20100,20100],[50000000,4167400,4166600]]) {
  eq(U.residentInstallments(annual),{annual,june,monthly,collection:'split'},'independent instalment amount');
}
for (const annual of [0,1,5000,6000,240500,50000000]) {
  eq(U.residentInstallments(annual,'june'),{annual,june:annual,monthly:0,collection:'june'},'notice explicitly says June only');
}
for (let annual=0;annual<=20000;annual++) {
  const d=U.residentInstallments(annual);
  eq(d.june+d.monthly*11,annual,'instalments sum exactly');
  assert.ok(Number.isSafeInteger(d.june)&&d.june>=0&&d.monthly%100===0);checks++;
}
for (const bad of [-1,50000001,NaN,Infinity,1.5,'240500',null]) {
  assert.throws(()=>U.residentInstallments(bad));checks++;
}
assert.throws(()=>U.residentInstallments(240500,'quarterly'));checks++;
const initial=U.calculate(input());
const linked=input({residentMode:'manual',residentAnnual:240500,monthlyResidentMode:'annual'});
const result=U.calculate(linked);
eq(result.resident.annual,240500,'annual deduction uses notice');
eq(result.monthly.residentTax,20000,'regular-month deduction uses schedule');
eq(result.monthly.residentDetail.june,20500,'June keeps rounding difference');
eq(result.monthly.residentDetail.notice,true,'notice identified, no estimated income details');
eq(result.monthly.net,initial.monthly.net+initial.monthly.residentTax-20000,'regular net delta');
eq(result.net,initial.net+initial.resident.annual-240500,'annual net delta');
eq(result.national,initial.national,'resident deduction is not income-tax deduction');
eq(result.automaticSocial,initial.automaticSocial,'insurance unchanged');
const changed=U.calculate({...linked,residentAnnual:241700});
eq(changed.monthly.residentTax,20100,'new 100-yen monthly step');
eq(changed.monthly.residentDetail.june,20600,'new June amount');
eq(changed.monthly.net,result.monthly.net-100,'monthly net update');
eq(changed.net,result.net-1200,'annual net update');
const juneOnly=U.calculate({...linked,residentAnnual:5000,residentCollectionMode:'june'});
eq(juneOnly.monthly.residentTax,0,'June-only monthly zero');
eq(juneOnly.monthly.residentDetail.june,5000,'June-only June amount');
const override=U.calculate({...linked,monthlyResidentMode:'manual',residentMonthly:12345});
eq(override.monthly.residentTax,12345,'explicit notice month overrides derived month');
eq(override.monthly.residentDetail,null,'no invented June amount for manual month');
eq(override.resident.annual,240500,'month override does not replace notice annual');
const previous=U.calculate({...linked,monthlyResidentMode:'previous',previousSalary:0,previousSocial:0});
eq(previous.monthly.residentTax,0,'explicit previous-year mode remains independent');
assert.throws(()=>U.calculate({...linked,residentMode:'estimate'}));checks++;
assert.throws(()=>U.calculate({...linked,residentCollectionMode:'bad'}));checks++;
const policy=U.currentPolicy();policy.brackets[0].rateBp=100;
const compare=U.compare(linked,policy);
eq(compare.current.monthly,compare.changed.monthly,'policy scenarios share monthly amount');
eq(compare.current.resident,compare.changed.resident,'policy scenarios share notice');
for(const sample of U.sampleForInput(linked,12000000,20)) {
 eq(U.calculate(sample).monthly.residentTax,20000,'graph keeps notice monthly fixed');
 eq(U.calculate(sample).resident.annual,240500,'graph keeps notice annual fixed');
}
const doc={format:'nenshu-no-kabe',version:3,input:linked,policy,graphMax:12000000};
eq(U.validateDocument(doc).input,linked,'v3 roundtrip');
eq(U.validateDocument({...doc,input:{...linked,residentCollectionMode:'june'}}).input.residentCollectionMode,'june','v3 June-only saved');
for (const mode of ['estimate','previous','manual']) {
 const old=input({residentMode:'manual',residentAnnual:240500,monthlyResidentMode:mode,residentMonthly:12345});
 const before=U.calculate(old);delete old.residentCollectionMode;
 const migrated=U.validateDocument({...doc,version:2,input:old});
 eq(migrated.version,8,'v2 upgrades to v6');eq(migrated.input.monthlyResidentMode,mode,'migration does not silently link');
 eq(U.calculate(migrated.input),before,'legacy saved result preserved');
 eq(migrated.residentLegacy,true,'legacy independence message');
}
const invalidNew={...linked};delete invalidNew.residentCollectionMode;
assert.throws(()=>U.validateDocument({...doc,input:invalidNew}));checks++;
assert.throws(()=>U.validateDocument({...doc,version:2}));checks++;
eq(U.validateDocument(require('./example-bonus.json')).version,8,'real v2 example migrates');
console.log(`PASS ${checks} resident notice checks`);
