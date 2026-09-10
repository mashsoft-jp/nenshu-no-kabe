'use strict';
const assert=require('node:assert/strict');
const U=require('./unified-engine.js'),B=require('./policy-engine.js'),M=require('./monthly-engine.js');
let checks=0;const check=(v,msg)=>{assert.ok(v,msg);checks++;};
const equal=(a,b,msg)=>{assert.deepEqual(a,b,msg);checks++;};
const input=(changes={})=>{const x={...U.defaultInput(),...changes};x.annualGross=U.annualGross(x);return x;};
let x=input(),r=U.calculate(x);
equal(r.net,4662100,'no-bonus annual baseline unchanged');
equal(r.monthly.net,383080,'monthly withholding baseline');
// Compare all valid 1-yen monthly examples, no bonus, to the original two engines.
for(const gross of [80000,100000,250000,300000,500000,590000,600000,2000000])for(const age of [30,45])for(const prefecture of ['東京都','埼玉県']){
 x=input({monthlyGross:gross,age,prefecture});r=U.calculate(x);
 const old=B.calculate({...B.defaultInput(),annualGross:gross*12,age,prefecture});
 equal(r.net,old.net,'annual no-bonus regression');
 const oldm=M.calculate({gross,nonTax:0,age,prefecture,other:0,employment:50,dependents:0,standardMode:'auto',residentMode:'estimate'});
 equal(r.monthly.net,oldm.net,'monthly no-bonus regression');
}
x=input({monthlyGross:300000,bonuses:[{month:6,gross:300000},{month:12,gross:300000}]});r=U.calculate(x);
equal(r.gross,4200000,'monthly×12+bonus');equal(r.social.annual,616980,'salary and bonuses contributions');
equal(r.social.bonusTotal,88140,'300k+300k bonus contributions');equal(r.net,3328920,'annual example');
check(r.monthly.net!==Math.round(r.net/12),'month cash estimate is not annual average');
const zero=U.calculate(input({monthlyGross:300000}));equal(r.social.std,zero.social.std,'bonuses not spread into salary standard bands');
equal(r.monthly.incomeTax,zero.monthly.incomeTax,'bonus does not change ordinary monthly withholding');
// Thousand-yen and exact half-yen rounding.
r=U.calculate(input({bonuses:[{month:6,gross:1000999}]}));equal(r.social.bonusRows[0].standard,1000000,'round bonus standard down');
r=U.calculate(input({bonuses:[{month:6,gross:999}]}));equal(r.social.bonusParts.health,0,'sub-1000 health base');equal(r.social.bonusParts.employment,5,'employment uses actual gross');
r=U.calculate(input({prefecture:'埼玉県',monthlyGross:600000}));equal(r.social.monthlyParts.health,28526,'exact 50 sen rounds down');
// Pension cap per month vs distinct months; aggregate same month BEFORE rounding.
let a=U.calculate(input({bonuses:[{month:6,gross:1000000},{month:6,gross:1000000}]}));
let b=U.calculate(input({bonuses:[{month:6,gross:1000000},{month:12,gross:1000000}]}));
equal(a.social.bonusParts.pension,137250,'same month pension cap');equal(b.social.bonusParts.pension,183000,'distinct month pension caps');
r=U.calculate(input({bonuses:[{month:6,gross:999},{month:6,gross:999}]}));equal(r.social.bonusRows[0].standard,1000,'same-month thousand-yen combine');
// Health fiscal-year cap and March/April separation.
r=U.calculate(input({bonuses:[{month:6,gross:4000000},{month:12,gross:4000000}]}));
equal(r.social.bonusRows.map(b=>b.healthBase),[4000000,1730000],'fiscal health cap 5.73m');
r=U.calculate(input({priorBonusStandard:5700000,bonuses:[{month:3,gross:1000000},{month:4,gross:1000000}]}));
equal(r.social.bonusRows.map(b=>b.healthBase),[30000,1000000],'April health-cap reset');
equal(r.gross,8000000,'previous fiscal bonuses not added to current gross');
equal(r.social.bonusRows.map(b=>b.fiscalYear),[2025,2026],'cap fiscal-year attribution');
// The same integer health+care allocation as the original engine.
r=U.calculate(input({age:45,bonuses:[{month:6,gross:590000}]}));
equal(r.social.bonusParts.health+r.social.bonusParts.care,M.roundHalfDownRatio(590000*(985+162),20000),'combined health/care rounding');
r=U.calculate(input({age:39,bonuses:[{month:6,gross:1000000}]}));equal(r.social.parts.care,0,'under 40 excluded');
// Tax-free commuting is included in cash/insurance and excluded from taxable salary.
x=input({nonTax:15000,monthlyGross:500000,bonuses:[{month:6,gross:300000}]});r=U.calculate(x);
equal(r.taxableGross,r.gross-180000,'annual commuting exclusion');
equal(r.social.std,M.standard(500000),'commuting included in insurance standard');
check(r.national.annual<U.calculate(input({monthlyGross:500000,bonuses:x.bonuses})).national.annual,'non-tax commuting reduces annual tax');
// Explicit standards and annual-only overrides.
x=input({monthlyGross:600000,standardMode:'manual',healthStandard:300000,pensionStandard:300000,bonuses:[{month:6,gross:1000000}]});r=U.calculate(x);
equal(r.social.std,{health:300000,pension:300000},'manual standards');equal(r.social.bonusRows[0].standard,1000000,'manual salary bands do not alter bonuses');
x=input({socialMode:'manual',socialAnnual:1000000,residentMode:'manual',residentAnnual:100000,monthlyResidentMode:'manual',residentMonthly:12000,other:5000});r=U.calculate(x);
equal(r.social.annual,1000000,'manual annual insurance');equal(r.monthly.social,73450,'annual override leaves monthly auto');equal(r.monthly.residentTax,12000,'monthly manual resident tax');equal(r.resident.annual,100000,'annual resident separate');equal(r.other,60000,'other deductions annualized');
const withoutOther=U.calculate({...x,other:0});equal(r.national.annual,withoutOther.national.annual,'other payroll deductions not income deductions');
// Hypothetical tax is annual only and preserves original schedule.
x=input({bonuses:[{month:6,gross:500000}]});const p=U.currentPolicy();p.brackets[0].upper=3000000;
const c=U.compare(x,p);check(c.delta>0,'threshold example increases net');equal(c.current.monthly,c.changed.monthly,'monthly withholding unaffected by annual hypothesis');
equal(c.current.social,c.changed.social,'insurance fixed across policy scenarios');equal(c.current.resident,c.changed.resident,'resident tax fixed across scenarios');
// Save, load, migration, validation.
let doc={format:'nenshu-no-kabe',version:2,input:x,policy:p,graphMax:12000000};equal(U.validateDocument(doc).input,x,'v2 roundtrip');
let legacy=U.validateDocument({format:'tedori-policy',version:1,input:{...B.defaultInput(),annualGross:4000000},policy:p,graphMax:12000000});equal(legacy.input.monthlyGross,333333,'legacy floor to whole yen');equal(legacy.input.bonuses,[],'legacy means no bonus');check(legacy.legacy,'legacy conversion flagged');
for(const bad of [input({monthlyGross:-1}),input({bonuses:[{month:0,gross:5}]}),input({bonuses:[{month:6,gross:-1}]}),input({bonuses:[{month:1,gross:0},{month:2,gross:0},{month:3,gross:0},{month:4,gross:0}]}),input({priorBonusStandard:1001}),input({nonTax:600000}),input({monthlyGross:NaN}),input({bonuses:[{month:6,gross:NaN}]}),{...input(),annualGross:1},input({age:65})]){assert.throws(()=>U.calculate(bad));checks++;}
// Graph must preserve the fixed bonuses and stay inside supported input conditions.
x=input({monthlyGross:800000,bonuses:[{month:6,gross:5000000},{month:12,gross:2000000}]});
const samples=U.sampleForInput(x,30000000);check(samples.length>100,'graph sampling');
for(const sample of samples){U.validateInput(sample);equal(sample.bonuses,x.bonuses,'graph bonus identity');equal(sample.annualGross,sample.monthlyGross*12+7000000,'graph derived gross invariant');}
for(const gross of [960000,1000000,5000000,99999999,100000000]){const point=U.atAnnual(x,gross);U.validateInput(point);checks++;}
// Randomized accounting identities, including caps, 0-rate employment and manual amounts.
let seed=571;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32;};
for(let i=0;i<120;i++){
 const gross=80000+Math.floor(random()*2000000),count=i%4;
 x=input({monthlyGross:gross,age:i%2?45:30,employment:[0,50,60][i%3],prefecture:['東京都','埼玉県','佐賀県'][i%3],bonuses:Array.from({length:count},(_,j)=>({month:[3,6,12][j],gross:Math.floor(random()*4000000)}))});
 r=U.calculate(x);equal(r.gross,r.net+r.deductions,'annual accounting identity');equal(r.monthly.gross,r.monthly.net+r.monthly.deductions,'monthly accounting identity');
 equal(r.social.annual,Object.values(r.social.parts).reduce((a,b)=>a+b,0),'social sum');
 for(const key of ['health','care','pension','child','employment'])equal(r.social.parts[key],r.social.monthlyParts[key]*12+r.social.bonusParts[key],'salary plus bonus decomposition');
 check(Number.isSafeInteger(r.net),'integer yen net');
}
console.log(`PASS ${checks} unified engine checks`);

// Run notice allocation regressions in the existing CI entry point.
require('./test-resident-notice.cjs');

// Qualified dependent regressions run through the existing CI entry point.
require('./test-dependents.cjs');

require('./test-deductions.cjs');

// User-selected child support rounding: independent yen ceiling, not half-down.
// 88,000 × .0023 / 2 = 101.2; 110,000 => 126.5; 300,000 => 345 exactly.
for(const [gross,expected] of [[88000,102],[110000,127],[300000,345]]) {
 const result=U.calculate(input({monthlyGross:gross,bonuses:[{month:6,gross}]}));
 equal(result.social.monthlyParts.child,expected,'child salary ceiling');
 equal(result.social.bonusParts.child,expected,'child bonus ceiling');
 equal(result.social.parts.child,expected*13,'round each payment before annual sum');
 equal(B.calculate({...B.defaultInput(),annualGross:gross*12}).social.parts.child,expected*12,'legacy annual ceiling');
 equal(M.calculate({gross,nonTax:0,age:30,prefecture:'東京都',other:0,employment:0,dependents:0,standardMode:'auto',residentMode:'manual',residentMonthly:0}).child,expected,'legacy monthly ceiling');
}
equal(U.calculate(input({bonuses:[{month:6,gross:999}]})).social.bonusParts.child,0,'zero standard bonus remains zero');
equal(U.calculate(input({bonuses:[{month:6,gross:5000},{month:6,gross:5000}]})).social.bonusParts.child,12,'same-month combined base 10,000 gives 11.5 => 12');
equal(U.calculate(input({bonuses:[{month:6,gross:6000000},{month:12,gross:100000}]})).social.bonusParts.child,6590,'FY cap 5,730,000 gives 6589.5 => 6590; exhausted cap gives zero');
console.log('PASS child support ceiling boundaries, annual sum, bonus grouping and cap');

// Monthly withholding choice must never erase annual resident tax.
for(const residentMode of ['manual','estimate']) {
 const withTax=input({residentMode,residentAnnual:240500,monthlyResidentMode:'manual',residentMonthly:20000});
 const withoutTax={...withTax,monthlyResidentMode:'none'};
 const before=U.calculate(withTax),after=U.calculate(withoutTax);
 equal(after.monthly.residentTax,0,'no monthly resident withholding');
 equal(after.monthly.net,before.monthly.net+20000,'only monthly resident deduction removed');
 equal(after.resident,before.resident,'annual resident unchanged');equal(after.net,before.net,'annual net unchanged');
 const doc6={format:'nenshu-no-kabe',version:6,input:withoutTax,policy:U.currentPolicy(),graphMax:12000000};
 equal(U.validateDocument(doc6).input,withoutTax,'v6 no withholding roundtrip');
 assert.throws(()=>U.validateDocument({...doc6,version:5}));
 assert.throws(()=>U.calculate({...withoutTax,monthlyResidentMode:'invalid'}));
 equal(U.validateDocument({...doc6,version:5,input:withTax}).input,withTax,'v5 preserves monthly setting');
}
console.log('PASS no resident withholding, annual independence, JSON migration and validation');

// Pay type: officer report excludes employment contributions on salary and bonus.
const officerInput=input({payType:'officer',employment:0,monthlyGross:300000,bonuses:[{month:6,gross:100000}]});
const officerResult=U.calculate(officerInput);
equal(officerResult.monthly.employment,0,'officer monthly employment zero');
equal(officerResult.social.bonusParts.employment,0,'officer bonus employment zero');
assert.throws(()=>U.calculate({...officerInput,employment:50}));
assert.throws(()=>U.calculate({...officerInput,payType:'unknown'}));
const payDoc={format:'nenshu-no-kabe',version:7,input:officerInput,policy:U.currentPolicy(),graphMax:12000000};
equal(U.validateDocument(payDoc).input,officerInput,'pay type JSON roundtrip');
assert.throws(()=>U.validateDocument({...payDoc,input:{...officerInput,payType:undefined}}));
for(const employment of [0,50,60]){
 const migrated=U.validateDocument({...payDoc,version:6,input:{...officerInput,employment}});
 equal(migrated.input.employment,employment,'old JSON preserves employment rate');
 equal(migrated.input.payType,employment===0?'custom':'employee','old rate does not invent officer status');
}
console.log('PASS pay type, salary/bonus insurance, JSON migration and invalid settings');
