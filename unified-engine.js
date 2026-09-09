/* 年収の壁 v0.7 — shared salary/bonus model.
 * Pure functions. September 2026 social-rate snapshot; annual income tax 2026,
 * accrued resident tax FY2027. Not a reconstruction of calendar-2026 bank deposits.
 * Bonus bases: https://www.nenkin.go.jp/service/kounen/hokenryo/hoshu/20141203.html
 */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./monthly-engine.js'),require('./policy-engine.js'));
  else root.Nenshu=factory(Tedori,root.TedoriPolicy);
})(typeof globalThis!=='undefined'?globalThis:this,function(Monthly,Base){
  'use strict';
  const MAX_MONTHLY=8333333, MIN_MONTHLY=80000;
  const keys=['health','care','pension','child','employment'];
  const emptyParts=()=>Object.fromEntries(keys.map(k=>[k,0]));
  const sum=o=>Object.values(o).reduce((a,b)=>a+b,0);
  const integer=(v,min,max,label)=>{
    if(!Number.isSafeInteger(v)||v<min||v>max)throw new Error(`${label}は${min.toLocaleString('ja-JP')}〜${max.toLocaleString('ja-JP')}の整数で入力してください。`);
    return v;
  };
  const bonusTotal=x=>x.bonuses.reduce((a,b)=>a+b.gross,0);
  const annualGross=x=>x.monthlyGross*12+bonusTotal(x);
  function defaultInput(){return {
    monthlyGross:500000,annualGross:6000000,bonuses:[],nonTax:0,age:30,prefecture:'東京都',employment:50,
    standardMode:'auto',healthStandard:500000,pensionStandard:500000,priorBonusStandard:0,
    socialMode:'auto',socialAnnual:881400,residentMode:'estimate',residentAnnual:307200,
    monthlyResidentMode:'estimate',residentMonthly:25600,previousSalary:6000000,previousSocial:867600,other:0
  };}
  function validateInput(x){
    if(!x||typeof x!=='object')throw new Error('給与条件がありません。');
    integer(x.monthlyGross,MIN_MONTHLY,MAX_MONTHLY,'月給（円）');
    if(!Array.isArray(x.bonuses)||x.bonuses.length>3)throw new Error('賞与は年3回まで入力できます。年4回以上の支給はこのモデルの対象外です。');
    x.bonuses.forEach((b,i)=>{if(!b||typeof b!=='object')throw new Error('賞与の形式が不正です。');integer(b.month,1,12,`賞与${i+1}の支給月`);integer(b.gross,0,Base.MAX_GROSS,`賞与${i+1}の額面（円）`);});
    integer(annualGross(x),Base.MIN_GROSS,Base.MAX_GROSS,'額面年収（円）');
    if(x.annualGross!==annualGross(x))throw new Error('年収と「月給×12＋賞与合計」が一致しません。');
    integer(x.nonTax,0,x.monthlyGross,'月給に含む非課税通勤手当（円）');
    integer(x.age,20,64,'年齢');
    if(!Monthly.healthRates.some(([p])=>p===x.prefecture))throw new Error('協会けんぽの加入支部を選んでください。');
    if(![0,50,60].includes(x.employment))throw new Error('雇用保険の区分が不正です。');
    if(!['auto','manual'].includes(x.standardMode))throw new Error('標準報酬月額の設定が不正です。');
    if(x.standardMode==='manual'){
      if(!Monthly.bands.some(([,v])=>v===x.healthStandard))throw new Error('健康保険の標準報酬月額を選択してください。');
      if(!Monthly.bands.some(([,v])=>v===x.pensionStandard&&v>=88000&&v<=650000))throw new Error('厚生年金の標準報酬月額を選択してください。');
    }
    integer(x.priorBonusStandard,0,5730000,'前年4〜12月の標準賞与累計額（円）');
    if(x.priorBonusStandard%1000)throw new Error('前年の標準賞与累計額は1,000円単位で入力してください。');
    if(!['auto','manual'].includes(x.socialMode))throw new Error('年間社会保険料の設定が不正です。');
    if(!['estimate','manual'].includes(x.residentMode))throw new Error('年間住民税の設定が不正です。');
    if(!['estimate','previous','manual'].includes(x.monthlyResidentMode))throw new Error('通常月の住民税の設定が不正です。');
    integer(x.socialAnnual,0,50000000,'年間社会保険料（円）');
    integer(x.residentAnnual,0,50000000,'年間住民税（円）');
    integer(x.residentMonthly,0,MAX_MONTHLY,'通常月の住民税（円）');
    integer(x.previousSalary,0,Base.MAX_GROSS,'前年の課税給与収入（円）');
    integer(x.previousSocial,0,50000000,'前年の社会保険料（円）');
    integer(x.other,0,MAX_MONTHLY,'その他の月額控除（円）');
    return x;
  }
  function automaticSocial(x){
    const round=Monthly.roundHalfDownRatio;
    const std=x.standardMode==='manual'?{health:x.healthStandard,pension:x.pensionStandard}:Monthly.standard(x.monthlyGross);
    const healthRate=Monthly.healthRates.find(([p])=>p===x.prefecture)[1],careRate=x.age>=40?162:0;
    function partsFor(healthBase,pensionBase,employmentAmount){
      const health=round(healthBase*healthRate,20000);
      return {health,care:round(healthBase*(healthRate+careRate),20000)-health,
        pension:round(pensionBase*1830,20000),child:round(healthBase*23,20000),employment:employmentAmount};
    }
    const monthlyParts=partsFor(std.health,std.pension,round(x.monthlyGross*x.employment,10000));
    // Combine same-month bonuses BEFORE rounding the standard bonus base.
    const grouped=new Map();
    x.bonuses.filter(b=>b.gross>0).forEach(b=>{
      const g=grouped.get(b.month)||{month:b.month,gross:0,employment:0,payments:0};
      g.gross+=b.gross;g.employment+=round(b.gross*x.employment,10000);g.payments++;grouped.set(b.month,g);
    });
    const used={previous:x.priorBonusStandard,current:0};
    const bonusParts=emptyParts(),bonusRows=[];
    [...grouped.values()].sort((a,b)=>a.month-b.month).forEach(g=>{
      const standard=Math.floor(g.gross/1000)*1000,fy=g.month<=3?'previous':'current';
      const healthBase=Math.max(0,Math.min(standard,5730000-used[fy]));
      const before=used[fy];used[fy]+=healthBase;
      const pensionBase=Math.min(standard,1500000),parts=partsFor(healthBase,pensionBase,g.employment);
      keys.forEach(k=>bonusParts[k]+=parts[k]);
      bonusRows.push({...g,standard,healthBase,pensionBase,healthBefore:before,fiscalYear:fy==='previous'?2025:2026,parts,total:sum(parts)});
    });
    const parts=Object.fromEntries(keys.map(k=>[k,monthlyParts[k]*12+bonusParts[k]]));
    return {manual:false,annual:sum(parts),parts,monthlyParts,bonusParts,bonusRows,std,healthRate,careRate,
      monthlyTotal:sum(monthlyParts),bonusTotal:sum(bonusParts)};
  }
  // FY2026 resident tax, based on 2025 earnings, same single/no-dependent scope.
  function resident2025(gross,social){
    let income;
    if(gross<=650999)income=0;
    else if(gross<1900000)income=gross-650000;
    else if(gross<3600000)income=Math.floor(gross/4000)*2800-80000;
    else if(gross<6600000)income=Math.floor(gross/4000)*3200-440000;
    else if(gross<8500000)income=Math.floor(gross*9/10)-1100000;
    else income=gross-1950000;
    const r=Base.residentTax(income,social),monthly=Math.floor(r.annual/1200)*100;
    return {...r,income,yearSalary:gross,yearSocial:social,monthly,june:r.annual-monthly*11};
  }
  function monthlyResult(x,auto){
    const withholding=Monthly.withholding(x.monthlyGross-x.nonTax-auto.monthlyTotal,0);
    let residentDetail=null,resident;
    if(x.monthlyResidentMode==='manual')resident=x.residentMonthly;
    else{
      const previous=x.monthlyResidentMode==='previous';
      residentDetail=resident2025(previous?x.previousSalary:x.annualGross-x.nonTax*12,
        previous?x.previousSocial:auto.annual-auto.parts.child);
      resident=residentDetail.monthly;
    }
    const deductions=auto.monthlyTotal+withholding.tax+resident+x.other;
    return {gross:x.monthlyGross,...auto.monthlyParts,social:auto.monthlyTotal,income:withholding,
      incomeTax:withholding.tax,residentTax:resident,residentDetail,other:x.other,deductions,net:x.monthlyGross-deductions};
  }
  function socialContributions(x){
    const auto=automaticSocial(x);
    return x.socialMode==='manual'?{manual:true,annual:x.socialAnnual,parts:null,automatic:auto}:auto;
  }
  function calculate(x,policy=Base.currentPolicy()){
    validateInput(x);Base.validatePolicy(policy);
    const auto=automaticSocial(x),social=x.socialMode==='manual'?{manual:true,annual:x.socialAnnual,parts:null,automatic:auto}:auto;
    const taxableGross=x.annualGross-x.nonTax*12,income=Base.salaryIncome(taxableGross);
    const national=Base.incomeTax(income,social.annual,policy);
    const resident=x.residentMode==='manual'?{annual:x.residentAnnual,manual:true}:Base.residentTax(income,social.annual);
    const other=x.other*12,deductions=social.annual+national.annual+resident.annual+other;
    return {gross:x.annualGross,taxableGross,nonTax:x.nonTax*12,income,salaryDeduction:taxableGross-income,
      bonusGross:bonusTotal(x),social,automaticSocial:auto,national,resident,other,deductions,
      net:x.annualGross-deductions,monthly:monthlyResult(x,auto)};
  }
  const compare=(x,p)=>{const current=calculate(x),changed=calculate(x,p);return {current,changed,delta:changed.net-current.net};};
  const graphMinimum=x=>Math.max(MIN_MONTHLY,x.nonTax)*12+bonusTotal(x);
  function atAnnual(x,gross){
    const b=bonusTotal(x),monthlyGross=Math.max(Math.max(MIN_MONTHLY,x.nonTax),Math.min(MAX_MONTHLY,Math.floor((Math.min(Base.MAX_GROSS,gross)-b)/12)));
    return {...x,monthlyGross,annualGross:monthlyGross*12+b};
  }
  function sampleForInput(x,max,count=220){
    const min=graphMinimum(x);
    if(max<=min)return [atAnnual(x,min)];
    const bonus=bonusTotal(x);
    const shifted=Monthly.bands.flatMap(([v])=>[-12,0,12].map(d=>v*12+bonus+d));
    const targets=Base.sampleSalaries(min,max,count,[x.annualGross,...shifted]);
    const unique=new Map();targets.forEach(g=>{const next=atAnnual(x,g);unique.set(next.annualGross,next);});
    return [...unique.values()].sort((a,b)=>a.annualGross-b.annualGross);
  }
  function validateDocument(doc){
    let x,legacy=false;
    if(doc?.format==='tedori-policy'&&doc.version===1){
      const d=Base.validateDocument(doc);x={...defaultInput(),...d.input,monthlyGross:Math.floor(d.input.annualGross/12),bonuses:[]};
      x.annualGross=annualGross(x);legacy=true;
    } else if(doc?.format==='nenshu-no-kabe'&&doc.version===2)x=Base.clone(doc.input);
    else throw new Error('このアプリで保存した設定JSONを選んでください。');
    validateInput(x);Base.validatePolicy(doc.policy);integer(doc.graphMax,3000000,Base.MAX_GROSS,'グラフ上限');
    return {format:'nenshu-no-kabe',version:2,input:x,policy:Base.clone(doc.policy),graphMax:Math.max(doc.graphMax,x.annualGross),legacy};
  }
  return {...Base,MAX_MONTHLY,MIN_MONTHLY,defaultInput,validateInput,bonusTotal,annualGross,
    automaticSocial,socialContributions,resident2025,monthlyResult,calculate,compare,
    graphMinimum,atAnnual,sampleForInput,validateDocument};
});
