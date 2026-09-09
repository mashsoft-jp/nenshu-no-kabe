const assert=require('node:assert/strict');
const T=require('./monthly-engine.js');
assert.equal(T.healthRates.length,47);
assert.equal(T.bands.length,50);
assert.deepEqual(T.standard(62999),{health:58000,pension:88000});
assert.deepEqual(T.standard(63000),{health:68000,pension:88000});
assert.deepEqual(T.standard(289999),{health:280000,pension:280000});
assert.deepEqual(T.standard(290000),{health:300000,pension:300000});
assert.deepEqual(T.standard(310000),{health:320000,pension:320000});
assert.deepEqual(T.standard(2000000),{health:1390000,pension:650000});
assert.equal(T.roundHalfDownRatio(150,100),1);
assert.equal(T.roundHalfDownRatio(151,100),2);
// Official NTA 2026 examples (denshi_01.pdf p.3).
assert.equal(T.withholding(175000,2).tax,210);
assert.equal(T.withholding(446000,8).tax,940);
assert.equal(T.withholding(775200,3).tax,59470);
assert.equal(T.withholding(0,0).tax,0);
assert.equal(T.resident(1100000,0).annual,0);
assert.equal(T.resident(1101000,0).annual,6000);
assert.equal(T.resident(2935265,0).income,1972400);
const x={gross:300000,nonTax:0,age:30,other:0,prefecture:'東京都',employment:50,standardMode:'auto',
healthStandard:300000,pensionStandard:300000,dependents:0,residentMode:'estimate',previousSalary:3600000,previousSocial:530000,residentMonthly:12000};
const a=T.calculate(x);
assert.equal(a.health,14775);assert.equal(a.pension,27450);assert.equal(a.child,345);assert.equal(a.employment,1500);
assert.equal(a.net+a.deducted,a.gross);assert.equal(a.care,0);
const b=T.calculate({...x,age:40});assert.equal(b.health+b.care,17205);assert.equal(b.care,2430);
assert.equal(T.calculate({...x,residentMode:'manual',residentMonthly:0}).residentTax,0);
for(const [prefecture] of T.healthRates) for(const age of [20,39,40,64]) for(const gross of [80000,101000,299999,300000,635000,1355000,2000000]) {
 const r=T.calculate({...x,prefecture,age,gross});
 for(const key of ['net','deducted','social','taxes','health','care','child','pension','employment','incomeTax','residentTax']) assert(Number.isSafeInteger(r[key]),key);
 assert.equal(r.net+r.deducted,r.gross);
 assert.equal(r.health+r.care+r.child+r.pension+r.employment,r.social);
}
for(const [limit] of T.bands) if(limit>=80000) {
 for(const gross of [limit-1,limit,limit+1]) assert.doesNotThrow(()=>T.calculate({...x,gross}));
}
assert.throws(()=>T.calculate({...x,gross:NaN}));
assert.throws(()=>T.calculate({...x,nonTax:300001}));
assert.throws(()=>T.calculate({...x,age:65}));
console.log('PASS: official NTA examples; contribution table checks; 1,316 scenarios; boundaries; validation.');
console.log(JSON.stringify(a,null,2));
