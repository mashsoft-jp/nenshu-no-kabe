/*
 * 年収の壁税制比較エンジン v0.2 / 2026-09-09
 * Pure calculations; no DOM, network, or storage.
 * Japanese yen are integers. Rates are integer basis points: 500 = 5.00%.
 * Model: enacted 2026 annual income tax + FY2027 Tokyo-23-ward resident tax;
 * social contributions use September-2026 rates annualized (NOT actual 2026 cash flow).
 * Current source references and exclusions: SOURCES.md / README.md.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./monthly-engine.js'));
  else root.TedoriPolicy = factory(Tedori);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Monthly) {
  'use strict';
  const MAX_GROSS = 100000000, MIN_GROSS = 960000;
  const CURRENT = Object.freeze([
    {upper:1950000, rateBp:500}, {upper:3300000, rateBp:1000},
    {upper:6950000, rateBp:2000}, {upper:9000000, rateBp:2300},
    {upper:18000000, rateBp:3300}, {upper:40000000, rateBp:4000},
    {upper:null, rateBp:4500}
  ].map(Object.freeze));
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function currentPolicy() { return {brackets:clone(CURRENT), basicMode:'current', basicAmount:0}; }
  function defaultInput() {
    return {annualGross:6000000, age:30, prefecture:'東京都', employment:50,
      socialMode:'auto', socialAnnual:881400, residentMode:'estimate', residentAnnual:307200};
  }
  function int(n, min, max, label) {
    if (!Number.isSafeInteger(n) || n < min || n > max) {
      throw new Error(label + 'は' + min.toLocaleString('ja-JP') + '〜' + max.toLocaleString('ja-JP') + 'の整数で指定してください。');
    }
    return n;
  }
  function validatePolicy(p) {
    if (!p || !Array.isArray(p.brackets) || p.brackets.length < 1 || p.brackets.length > 20)
      throw new Error('税率は1〜20段階で設定してください。');
    let prev = 0;
    p.brackets.forEach((b, i) => {
      if (!b || typeof b !== 'object') throw new Error('税率区分の形式が不正です。');
      int(b.rateBp, 0, 10000, '第' + (i+1) + '段階の税率（0.01%単位）');
      if (i === p.brackets.length-1) {
        if (b.upper !== null) throw new Error('最終段階の上限は「上限なし」にしてください。');
      } else {
        int(b.upper, 1000, MAX_GROSS, '第' + (i+1) + '段階の上限（円）');
        if (b.upper % 1000) throw new Error('課税所得の上限は0.1万円（1,000円）単位で設定してください。');
        if (b.upper <= prev) throw new Error('上限額は下の段階ほど大きくしてください。同じ金額・逆順・重複は設定できません。');
        prev = b.upper;
      }
    });
    if (!['current','add','flat'].includes(p.basicMode)) throw new Error('基礎控除の設定方法が不正です。');
    int(p.basicAmount, p.basicMode === 'add' ? -10000000 : 0, 10000000, '基礎控除の設定額（円）');
    return p;
  }
  function validateInput(x) {
    if (!x || typeof x !== 'object') throw new Error('給与条件がありません。');
    int(x.annualGross, MIN_GROSS, MAX_GROSS, '額面年収（円）');
    int(x.age, 20, 64, '年齢');
    if (!Monthly.healthRates.some(([p]) => p === x.prefecture)) throw new Error('協会けんぽの加入支部を選んでください。');
    if (![0,50,60].includes(x.employment)) throw new Error('雇用保険の区分が不正です。');
    if (!['auto','manual'].includes(x.socialMode)) throw new Error('社会保険料の設定が不正です。');
    if (!['estimate','manual'].includes(x.residentMode)) throw new Error('住民税の設定が不正です。');
    int(x.socialAnnual, 0, 50000000, '手入力の年間社会保険料（円）');
    int(x.residentAnnual, 0, 50000000, '手入力の年間住民税（円）');
    return x;
  }
  // NTA 2026 salary-income table, including statutory low-income special rounding.
  function salaryIncome(gross) {
    int(gross, 0, MAX_GROSS, '給与収入');
    if (gross <= 740999) return 0;
    if (gross < 2191000) return gross - 740000;
    if (gross < 2193000) return 1451000;
    if (gross < 2196000) return 1453000;
    if (gross < 2200000) return 1456000;
    if (gross < 3600000) return Math.floor(gross / 4000) * 2800 - 80000;
    if (gross < 6600000) return Math.floor(gross / 4000) * 3200 - 440000;
    if (gross < 8500000) return Math.floor(gross * 9 / 10) - 1100000;
    return gross - 1950000;
  }
  function currentBasic(income) {
    if (income <= 4890000) return 1040000;
    if (income <= 6550000) return 670000;
    if (income <= 23500000) return 620000;
    if (income <= 24000000) return 480000;
    if (income <= 24500000) return 320000;
    if (income <= 25000000) return 160000;
    return 0;
  }
  function basicDeduction(income, p) {
    if (p.basicMode === 'flat') return p.basicAmount;
    return Math.max(0, currentBasic(income) + (p.basicMode === 'add' ? p.basicAmount : 0));
  }
  // Integrate the marginal-rate schedule; never apply the top rate to all income.
  function progressive(taxable, brackets) {
    int(taxable, 0, MAX_GROSS, '課税所得');
    validatePolicy({brackets, basicMode:'current', basicAmount:0});
    let lower = 0, numerator = 0, marginalBp = brackets[brackets.length-1].rateBp;
    const portions = brackets.map((b,i) => {
      const upper = b.upper === null ? Infinity : b.upper;
      const used = Math.max(0, Math.min(taxable, upper) - lower);
      const partNumerator = used * b.rateBp;
      numerator += partNumerator;
      const row = {lower, upper:b.upper, used, rateBp:b.rateBp, tax:partNumerator / 10000};
      if (taxable >= lower && taxable < upper) marginalBp = b.rateBp;
      lower = upper;
      return row;
    });
    return {tax:Math.floor(numerator / 10000), portions, marginalBp};
  }
  function incomeTax(income, social, p, dependentDeduction=0, additionalDeduction=0, taxCredit=0) {
    int(dependentDeduction,0,6300000,'扶養控除（円）');
    int(additionalDeduction,0,500000000,'追加所得控除（円）');int(taxCredit,0,50000000,'税額控除（円）');
    const basic = basicDeduction(income, p);
    const taxable = Math.max(0, Math.floor((income - social - basic - dependentDeduction - additionalDeduction) / 1000) * 1000);
    const pTax = progressive(taxable, p.brackets);
    const appliedCredit=Math.min(pTax.tax,taxCredit),afterCredit=pTax.tax-appliedCredit;
    const reconstruction = Math.floor(afterCredit * 21 / 1000);
    const annual = Math.floor((afterCredit + reconstruction) / 100) * 100;
    return {...pTax, basic, taxable, reconstruction, annual, dependentDeduction, additionalDeduction, taxCredit, appliedCredit, afterCredit};
  }
  // FY2027 assessment of 2026 earnings, no dependents/other deductions/credits.
  // Tokyo 23 wards: 6% + 4%, per-capita 4,000 + forest tax 1,000 yen.
  function residentTax(income, social) {
    const basic = income<=24000000 ? 430000 : income<=24500000 ? 290000 : income<=25000000 ? 150000 : 0;
    const taxable = Math.max(0, Math.floor((income-social-basic)/1000)*1000);
    if (income <= 450000) return {annual:0, taxable, basic, ward:0, metro:0, flat:0, adjustment:0};
    const adjustmentBase = income>25000000 ? 0 : taxable<=2000000 ? Math.min(50000,taxable) : 50000;
    const ward = Math.floor(Math.max(0, taxable*6-adjustmentBase*3)/10000)*100;
    const metro = Math.floor(Math.max(0, taxable*4-adjustmentBase*2)/10000)*100;
    return {annual:ward+metro+5000, taxable, basic, ward, metro, flat:5000, adjustment:adjustmentBase*.05};
  }
  function socialContributions(x) {
    if (x.socialMode === 'manual') return {annual:x.socialAnnual, manual:true, parts:null, std:null};
    const std = Monthly.standard(x.annualGross / 12);
    const healthRate = Monthly.healthRates.find(([p])=>p===x.prefecture)[1];
    const careRate = x.age >= 40 ? 162 : 0;
    const round = Monthly.roundHalfDownRatio;
    const health = round(std.health*healthRate,20000);
    const care = round(std.health*(healthRate+careRate),20000)-health;
    const parts = {
      health:health*12, care:care*12, child:Math.ceil(std.health*23/20000)*12,
      pension:round(std.pension*1830,20000)*12,
      employment:round(x.annualGross*x.employment,120000)*12
    };
    return {annual:Object.values(parts).reduce((a,b)=>a+b,0), manual:false, parts, std, healthRate, careRate};
  }
  function calculate(x, policy=currentPolicy()) {
    validateInput(x); validatePolicy(policy);
    const income = salaryIncome(x.annualGross);
    const social = socialContributions(x);
    const national = incomeTax(income,social.annual,policy);
    const resident = x.residentMode === 'manual' ? {annual:x.residentAnnual,manual:true} : residentTax(income,social.annual);
    const deductions = social.annual+national.annual+resident.annual;
    return {gross:x.annualGross, income, salaryDeduction:x.annualGross-income, social,
      national, resident, deductions, net:x.annualGross-deductions};
  }
  function compare(x,p) {
    const current = calculate(x), changed = calculate(x,p);
    return {current, changed, delta:changed.net-current.net};
  }
  function firstSalaryAboveIncome(value) {
    let lo=0,hi=MAX_GROSS;
    while(lo<hi){const mid=Math.floor((lo+hi)/2);if(salaryIncome(mid)>value)hi=mid;else lo=mid+1;}
    return lo;
  }
  // Add exact discontinuity-adjacent points, so narrow cliffs are not smoothed away.
  function sampleSalaries(min,max,count=360,extra=[]) {
    int(min,MIN_GROSS,MAX_GROSS,'表示下限');int(max,min+1,MAX_GROSS,'表示上限');
    const points=new Set([min,max]);
    for(let i=0;i<=count;i++) points.add(Math.round(min+(max-min)*i/count));
    const special = [2191000,2193000,2196000,2200000,3600000,6600000,8500000,1190001,
      ...[4890000,6550000,23500000,24000000,24500000,25000000].map(firstSalaryAboveIncome),
      ...Monthly.bands.map(([v])=>v*12),...extra];
    special.forEach(v=>[-1,0,1].forEach(d=>{const n=v+d;if(Number.isSafeInteger(n)&&n>=min&&n<=max)points.add(n);}));
    return [...points].sort((a,b)=>a-b);
  }
  function validateDocument(doc) {
    if (!doc || doc.format!=='tedori-policy' || doc.version!==1)
      throw new Error('このアプリで保存した形式のJSONファイルを選んでください。');
    validateInput(doc.input);validatePolicy(doc.policy);
    int(doc.graphMax,3000000,MAX_GROSS,'グラフ上限');
    return {format:'tedori-policy',version:1,input:clone(doc.input),policy:clone(doc.policy),graphMax:doc.graphMax};
  }
  return {CURRENT,MAX_GROSS,MIN_GROSS,clone,currentPolicy,defaultInput,validatePolicy,validateInput,
    salaryIncome,currentBasic,basicDeduction,progressive,incomeTax,residentTax,socialContributions,
    calculate,compare,firstSalaryAboveIncome,sampleSalaries,validateDocument};
});
