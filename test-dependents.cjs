'use strict';
// All fixtures below are synthetic. Sources and hand calculations: docs/DEPENDENTS.md.
const assert=require('node:assert/strict');
const U=require('./unified-engine.js'),M=require('./monthly-engine.js');
let checks=0;
const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
const bad=fn=>{assert.throws(fn);checks++;};
const family=changes=>({...U.emptyDependents(),...changes});
const input=changes=>{const x={...U.defaultInput(),...changes};x.annualGross=U.annualGross(x);return x;};
for(const [key,national,resident,difference,withholding] of [
 ['under16',0,0,0,0],['young',380000,330000,50000,1],['specific',630000,450000,180000,1],
 ['adult',380000,330000,50000,1],['elderly',480000,380000,100000,1],['cohabiting',580000,450000,130000,1]]){
 const d=U.dependentAmounts(family({[key]:1}));
 eq([d.national,d.resident,d.difference,d.withholding],[national,resident,difference,withholding],key+' official deductions');
}
for(const v of [-1,0.5,11,NaN,Infinity,null,'1',undefined])bad(()=>U.calculate(input({dependents:family({young:v})})));
bad(()=>U.calculate(input({dependents:family({young:6,adult:5})})));
bad(()=>U.calculate(input({dependents:{...family({}),spouse:1}})));
for(const key of ['dependents','previousDependents'])for(const v of [null,[],{},'bad'])bad(()=>U.calculate(input({[key]:v})));
for(const key of ['withholdingDependentMode','previousDependentMode'])bad(()=>U.calculate(input({[key]:'bad'})));
for(const v of [-1,0.5,41,NaN])bad(()=>U.calculate(input({withholdingDependents:v})));
eq(U.dependentAmounts(family({adult:10})).national,3800000,'ten supported');
// NTA published monthly special-calculation example; one child adds exactly 31,667 yen to deduction.
eq(M.withholding(175000,2).tax,210,'official example');
const x=input({monthlyGross:400000,socialMode:'manual',socialAnnual:600000,dependents:family({young:1})});
const r=U.calculate(x);
eq(r.monthly.incomeTax,7920,'synthetic monthly hand calculation');
eq(r.national.taxable,1380000,'3.4m salary income - .6m insurance - 1.04m basic - .38m dependent');
eq(r.national.annual,70400,'69000 * 1.021, floor to 100 yen');
eq(r.resident.taxable,2040000,'3.4m - .6m - .43m - .33m');
eq([r.resident.ward,r.resident.metro,r.resident.annual],[120600,80400,206000],'adjustment base 60000 at taxable 2.04m');
const manual=U.calculate({...x,withholdingDependentMode:'manual',withholdingDependents:0});
eq(manual.national,r.national,'monthly override does not change annual tax');
assert(manual.monthly.incomeTax>r.monthly.incomeTax);checks++;
const previous=U.calculate({...x,previousDependentMode:'manual',previousDependents:family({specific:1})});
eq(previous.national,r.national,'previous year does not change current income tax');
eq(previous.resident,r.resident,'previous year does not change next-year resident tax');
eq(previous.monthly.residentDetail.dependentDeduction,450000,'previous year uses separate age category');
const specified=U.calculate({...x,residentMode:'manual',residentAnnual:100000,monthlyResidentMode:'manual',residentMonthly:0});
eq(specified.resident.annual,100000,'annual notice remains authoritative');eq(specified.monthly.residentTax,0,'direct monthly zero remains authoritative');
for(const [income,annual] of [[1009999,0],[1010000,0],[1010001,5000],[1119999,5000],[1120000,5000],[1120001,5000],[1120500,5500]])
 eq(U.familyResidentTax(income,0,family({under16:1})).annual,annual,'one minor exemption/levy adjustment '+income);
for(const [gross,expected] of [[8499999,0],[8500000,0],[8500001,1],[8500010,1],[8500011,2],[9999999,150000],[10000000,150000],[10000001,150000]]){
 eq(U.salaryAdjustment(gross,family({young:1})),expected,'salary adjustment boundary '+gross);
 eq(U.salaryAdjustment(gross,family({specific:2})),expected,'not per-child deduction '+gross);
 eq(U.salaryAdjustment(gross,family({adult:1})),0,'adult not eligible '+gross);
}
const high=U.calculate(input({monthlyGross:900000,dependents:family({young:1})}));
eq(high.incomeAdjustment,150000,'high income with child');eq(high.income,8700000,'salary income after adjustment');
const policy=U.currentPolicy();policy.basicMode='flat';policy.basicAmount=0;
const comparison=U.compare(x,policy);
eq(comparison.current.monthly,comparison.changed.monthly,'policy leaves monthly unchanged');
eq(comparison.current.resident,comparison.changed.resident,'policy leaves resident unchanged');
eq(comparison.changed.national.dependentDeduction,380000,'dependent deduction shared by both policies');
for(const sample of U.sampleForInput(x,12000000,15))eq(sample.dependents,x.dependents,'graph preserves family');
const doc={format:'nenshu-no-kabe',version:5,input:x,policy:U.currentPolicy(),graphMax:12000000};
eq(U.validateDocument(doc).input,x,'v5 complete round trip');
for(const key of ['dependents','previousDependents','previousDependentMode','withholdingDependentMode','withholdingDependents']){
 const broken=JSON.parse(JSON.stringify(doc));delete broken.input[key];bad(()=>U.validateDocument(broken));
}
for(const version of [2,3]){
 const old=JSON.parse(JSON.stringify(doc));old.version=version;
 // Even injected new fields in an old document cannot change the old no-dependent model.
 const migrated=U.validateDocument(old);eq(migrated.version,7,'upgrade');eq(migrated.dependentLegacy,true,'migration notice');
 eq(migrated.input.dependents,family({}),'old family is zero');
 eq(U.calculate(migrated.input).net,U.calculate({...x,dependents:family({})}).net,'old results preserved');
}
for(const version of [0,8,'5'])bad(()=>U.validateDocument({...doc,version}));
// Dependent deductions must not lower the income used to choose a basic deduction.
eq(U.incomeTax(4890001,0,U.currentPolicy(),380000).basic,670000,'basic deduction phaseout is before dependent deduction');
// Personal deduction difference is fixed, not the enlarged 2026 national basic deduction.
eq(U.familyResidentTax(2800000,410000,family({specific:1})).adjustment,11500,'specific-dependent personal difference below 2m taxable');
eq(U.familyResidentTax(25000001,0,family({adult:1})).adjustment,0,'no adjustment above 25m income');
console.log(`PASS ${checks} dependent checks`);
