'use strict';
// Independently transcribed statutory tables and hand calculations; synthetic data only.
const assert=require('node:assert/strict'),U=require('./unified-engine.js'),D=U.Deductions;
let checks=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;},bad=f=>{assert.throws(f);checks++;};
const t=v=>({...D.defaults(),...v}),family=v=>({...U.emptyDependents(),...v});
const input=(v={})=>{const x={...U.defaultInput(),monthlyGross:400000,socialMode:'manual',socialAnnual:600000,...v};x.annualGross=U.annualGross(x);return x;};
const sp=(own,other,elder=false,year=2026)=>D.spouse(t({spouseEligible:true,spouseIncome:other,spouseElderly:elder}),own,year);
for(const [own,n,r,en,er] of [[9000000,380000,330000,480000,380000],[9000001,260000,220000,320000,260000],[9500000,260000,220000,320000,260000],[9500001,130000,110000,160000,130000],[10000000,130000,110000,160000,130000],[10000001,0,0,0,0]]){
 eq([sp(own,620000).national,sp(own,620000).resident],[n,r],'spouse taxpayer boundary');
 eq([sp(own,620000,true).national,sp(own,620000,true).resident],[en,er],'elder spouse boundary');
}
for(const [amount,n,r] of [[620001,380000,330000],[950000,380000,330000],[950001,360000,330000],[1000000,360000,330000],[1000001,310000,310000],[1050001,260000,260000],[1100001,210000,210000],[1150001,160000,160000],[1200001,110000,110000],[1250001,60000,60000],[1300001,30000,30000],[1330000,30000,30000],[1330001,0,0]]){
 eq([sp(4000000,amount).national,sp(4000000,amount).resident,sp(4000000,amount).difference],[n,r,0],'special spouse table and zero adjustment difference');
}
eq(sp(4000000,580000,true,2025).national,480000,'2025 inclusive 580k');
eq(sp(4000000,580001,true,2025).national,380000,'2025 after 580k');
eq(sp(4000000,600000,true).national,480000,'2026 elderly spouse');
eq(D.amounts(t({spouseEligible:true,spouseIncome:600000,spouseDisability:'cohabiting'}),11000000).national,750000,'same household disability independent of taxpayer spouse ceiling');
eq(D.amounts(t({spouseEligible:true,spouseIncome:620001,spouseDisability:'cohabiting'}),11000000).national,0,'spouse disability income ceiling');
for(const [kind,n,r,diff] of [['general',270000,260000,10000],['special',400000,300000,100000]]){
 const a=D.amounts(t({selfDisability:kind}),4000000);eq([a.national,a.resident,a.difference],[n,r,diff],'self disability');
}
eq(D.amounts(t({disabledCohabiting:1}),4000000).resident,530000,'cohabiting includes special disability');
for(const [kind,n,r,diff] of [['father',350000,300000,10000],['mother',350000,300000,50000],['divorced',270000,260000,10000],['bereaved',270000,260000,10000]]){
 const a=D.amounts(t({parent:kind}),5000000);eq([a.national,a.resident,a.difference],[n,r,diff],'parent table');
 eq(D.amounts(t({parent:kind}),5000001).national,0,'parent ceiling');
}
for(const [year,limit] of [[2025,850000],[2026,890000]]){
 eq(D.amounts(t({student:true}),limit,year).national,270000,'student inclusive');eq(D.amounts(t({student:true}),limit+1,year).national,0,'student above');
}
for(const [income,n,r] of [[620001,630000,450000],[850000,630000,450000],[850001,610000,450000],[900001,510000,450000],[950001,410000,410000],[1000001,310000,310000],[1050001,210000,210000],[1100001,110000,110000],[1150001,60000,60000],[1200001,30000,30000],[1230000,30000,30000]]){
 const a=D.amounts(t({specialIncomes:[income]}),4000000);eq([a.national,a.resident,a.difference],[n,r,0],'special relative table');
}
eq(D.monthlyCount(t({spouseEligible:true,spouseIncome:950000}),9000000),1,'source spouse inclusive');
eq(D.monthlyCount(t({spouseEligible:true,spouseIncome:950001}),9000000),0,'source spouse over');
eq(D.monthlyCount(t({spouseEligible:true}),9000001),0,'source taxpayer over');
eq(D.monthlyCount(t({spouseEligible:true,spouseDisability:'cohabiting',selfDisability:'special',disabledCohabiting:2}),4000000),8,'source count adds spouse and disabilities');
eq(D.monthlyCount(t({specialIncomes:[1000000,1000001]}),4000000),1,'source special relative 1m limit');
eq(D.monthlyCount(t({student:true}),850001),0,'source pre-December student ceiling');
const x=input({taxConditions:t({spouseEligible:true})}),a=U.calculate(x);
// Income 3.4m - social .6m - basic 1.04m - spouse .38m = 1.38m.
// 1.38m*5%=69,000; reconstruction 1,449; combined floor100=70,400.
eq(a.national.taxable,1380000,'hand taxable');eq(a.national.annual,70400,'hand annual');
eq(a.monthly.incomeTax,7920,'hand source: 339822-104632-48334-31667=155189; *5.105%, nearest10');
// Resident taxable 2.04m; personal difference100k, adjusted60k => ward120600+metro80400+5000.
eq(a.resident.annual,206000,'hand resident');
const credits=U.calculate(input({taxConditions:t({spouseEligible:true,nationalCredit:10001,wardCredit:1001,metroCredit:2002})}));
eq([credits.national.afterCredit,credits.national.reconstruction,credits.national.annual],[58999,1238,60200],'credit BEFORE reconstruction/final100 floor');
eq([credits.resident.ward,credits.resident.metro,credits.resident.annual],[119500,78300,202800],'independent credit floors');
const full=U.calculate(input({taxConditions:t({nationalCredit:50000000,wardCredit:50000000,metroCredit:50000000})}));
eq(full.national.annual,0,'national cannot be negative');eq(full.resident.annual,5000,'resident credit cannot consume flat/forest levy');
const money=t({extraSocial:100000,smallEnterprise:240000,lifeNational:120000,lifeResident:70000,earthquakeNational:50000,earthquakeResident:25000,medicalNational:300000,medicalResident:300000,casualtyNational:12345,casualtyResident:23456,donationNational:48000});
eq([D.amounts(money,3400000).national,D.amounts(money,3400000).resident],[870345,758456],'sum separately entered deductions');
const cash=U.calculate(input({taxConditions:money}));eq(cash.social.annual,600000,'extra contributions not payroll twice');eq(cash.monthly.incomeTax,U.calculate(input()).monthly.incomeTax,'annual amounts do not alter monthly source');
eq(D.amounts(t({donationNational:500000}),1000000).national,398000,'donation 40% minus2000 cap');
for(const kind of ['general','special'])for(const [income,zero] of [[1350000,true],[1350001,false]])eq(U.familyResidentTax(income,0,family({}),t({selfDisability:kind})).annual===0,zero,'disabled resident exemption');
eq(U.familyResidentTax(1009999,0,family({}),t({spouseEligible:true})).annual,0,'spouse counts for exempt threshold');
for(const v of [{selfDisability:'special'},{disabledSpecial:1},{adjustmentOther:true},{spouseEligible:true,spouseDisability:'special'}]){
 eq(U.salaryAdjustment(8500001,family({}),t(v)),1,'adjustment ceil1');eq(U.salaryAdjustment(10000001,family({}),t(v)),150000,'adjustment cap');
}
eq(U.salaryAdjustment(10000000,family({}),t({specialIncomes:[900000]})),0,'special relatives are not qualified dependents for income adjustment');
const prior=U.calculate(input({taxConditions:t({spouseEligible:true,spouseIncome:600000,spouseElderly:true})}));
eq([prior.extra.national,prior.monthly.residentDetail.extra.resident],[480000,330000],'2026annual vs2025prior threshold');
const independent=U.calculate(input({taxConditions:t({spouseEligible:true}),previousTaxMode:'manual',previousTaxConditions:t({lifeResident:70000}),monthlyResidentMode:'manual',residentMonthly:0}));
eq(independent.monthly.residentTax,0,'manual zero remains');eq(independent.extra.national,380000,'prior settings do not alter national');
const manual=U.calculate(input({residentMode:'manual',residentAnnual:240500,monthlyResidentMode:'annual',taxConditions:t({wardCredit:5000,metroCredit:5000})}));
eq([manual.resident.annual,manual.monthly.residentTax],[240500,20000],'notice priority');
const p=U.currentPolicy();p.brackets=p.brackets.map(b=>({...b,rateBp:0}));const c=U.compare(x,p);eq(c.changed.national.annual,0,'policy changes keep deductions');eq(c.changed.monthly,c.current.monthly,'monthly unaffected by policy');
for(const key of Object.keys(D.amountLimits))for(const value of [-1,0.5,NaN,Infinity,D.amountLimits[key]+1,'1',null])bad(()=>U.calculate(input({taxConditions:t({[key]:value})})));
for(const key of ['spouseEligible','spouseElderly','student','adjustmentOther'])bad(()=>U.calculate(input({taxConditions:t({[key]:1})})));
for(const v of [{spouseEligible:true,parent:'mother'},{disabledGeneral:1},{specialIncomes:[620000]},{specialIncomes:[1230001]},{specialIncomes:'900000'},{parent:'father'}])bad(()=>U.calculate(input({taxConditions:t(v)})));
const doc={format:'nenshu-no-kabe',version:5,input:x,policy:U.currentPolicy(),graphMax:12000000};eq(U.validateDocument(doc).input,x,'v5 roundtrip');
for(const key of Object.keys(D.defaults())){const d=U.clone(doc);delete d.input.taxConditions[key];bad(()=>U.validateDocument(d));}
for(const oldVersion of [2,3,4]){const old=U.clone(doc);old.version=oldVersion;old.input.taxConditions=t({nationalCredit:999999});const migrated=U.validateDocument(old);eq(migrated.version,8,'version upgraded');eq(migrated.input.taxConditions,D.defaults(),'old versions cannot inject new deductions');eq(migrated.deductionLegacy,true,'migration notified');}
for(const income of [0,450000,450001,450999,451000,1000000,25000001])eq(U.familyResidentTax(income,0,family({})).annual,U.residentTax(income,0).annual,'zero conditions retain old edge results');
// Near exemption: before credits ward18,600 / metro12,400; excess income500.
// Removing ward alone leaves metro to absorb the entire relief (not a fixed 40% share).
const asymmetric=U.familyResidentTax(1120500,0,family({young:1}),t({wardCredit:18600}));
eq([asymmetric.ward,asymmetric.metro,asymmetric.annual],[0,500,5500],'relief uses actual levy composition');
const oneStop=U.familyResidentTax(1120500,0,family({young:1}),t({wardCredit:18600,metroOneStopCredit:200}));
eq([oneStop.ward,oneStop.metro,oneStop.annual],[0,300,5300],'one-stop additional credit AFTER relief');
const samples=U.sampleForInput(input({taxConditions:t({spouseEligible:true})}),15000000,20);
eq(samples.some(v=>v.annualGross===10950000),true,'sample exact spouse income9m edge');
eq(samples.some(v=>v.annualGross===10950012),true,'sample immediately above spouse edge');
const before=U.clone(x);U.calculate(x);eq(x,before,'pure input not mutated');
console.log(`PASS ${checks} additional deduction checks`);
