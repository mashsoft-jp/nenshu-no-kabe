/* Additional deductions, yen integers. Domestic, salary-only taxpayer.
 * Income year 2026 / FY2027; prior income year 2025 / FY2026.
 * Primary sources, eligibility declarations and limits: docs/DEDUCTIONS.md.
 */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.NenshuDeductions=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const amountLimits={extraSocial:50000000,smallEnterprise:50000000,lifeNational:120000,lifeResident:70000,
    earthquakeNational:50000,earthquakeResident:25000,medicalNational:2000000,medicalResident:2000000,
    casualtyNational:100000000,casualtyResident:100000000,donationNational:40000000,
    nationalCredit:50000000,wardCredit:50000000,metroCredit:50000000,wardOneStopCredit:50000000,metroOneStopCredit:50000000};
  const defaults=()=>({spouseEligible:false,spouseIncome:0,spouseElderly:false,spouseDisability:'none',
    selfDisability:'none',disabledGeneral:0,disabledSpecial:0,disabledCohabiting:0,
    parent:'none',student:false,adjustmentOther:false,specialIncomes:[],
    ...Object.fromEntries(Object.keys(amountLimits).map(k=>[k,0]))});
  const integer=(n,max,label)=>{if(!Number.isSafeInteger(n)||n<0||n>max)throw new Error(label+'は0〜'+max.toLocaleString('ja-JP')+'の整数で入力してください。');};
  function validate(t){
    const base=defaults();
    if(!t||typeof t!=='object'||Array.isArray(t)||Object.keys(t).length!==Object.keys(base).length||Object.keys(t).some(k=>!(k in base)))throw new Error('追加控除の形式が不正です。');
    ['spouseEligible','spouseElderly','student','adjustmentOther'].forEach(k=>{if(typeof t[k]!=='boolean')throw new Error('追加控除の選択が不正です。');});
    integer(t.spouseIncome,100000000,'配偶者の合計所得金額');
    ['disabledGeneral','disabledSpecial','disabledCohabiting'].forEach(k=>integer(t[k],10,'障害者人数'));
    if(!['none','general','special'].includes(t.selfDisability)||!['none','general','special','cohabiting'].includes(t.spouseDisability)||!['none','father','mother','divorced','bereaved'].includes(t.parent))throw new Error('本人・配偶者の控除区分が不正です。');
    if(t.spouseEligible&&t.parent!=='none')throw new Error('配偶者とひとり親・寡婦の同時適用は、この年末時点モデルの対象外です。');
    if(!Array.isArray(t.specialIncomes)||t.specialIncomes.length>10)throw new Error('特定親族の所得は10人まで入力できます。');
    t.specialIncomes.forEach(n=>integer(n,100000000,'特定親族の合計所得金額'));
    Object.entries(amountLimits).forEach(([k,max])=>integer(t[k],max,'追加控除額（円）'));
    return t;
  }
  function spouse(t,income,year){
    const limit=year===2025?580000:620000,same=t.spouseEligible&&t.spouseIncome<=limit;
    const col=income<=9000000?0:income<=9500000?1:income<=10000000?2:-1;
    const result={national:0,resident:0,difference:0,same,count:same?1:0,kind:'対象外'};
    if(!t.spouseEligible||col<0||t.spouseIncome>1330000)return result;
    if(same){
      result.national=(t.spouseElderly?[480000,320000,160000]:[380000,260000,130000])[col];
      result.resident=(t.spouseElderly?[380000,260000,130000]:[330000,220000,110000])[col];
      result.difference=result.national-result.resident;result.kind=t.spouseElderly?'老人配偶者控除':'配偶者控除';
    }else{
      const rows=[[950000,38,26,13],[1000000,36,24,12],[1050000,31,21,11],[1100000,26,18,9],[1150000,21,14,7],[1200000,16,11,6],[1250000,11,8,4],[1300000,6,4,2],[1330000,3,2,1]];
      result.national=rows.find(r=>t.spouseIncome<=r[0])[col+1]*10000;
      result.resident=t.spouseIncome<=1000000?[330000,220000,110000][col]:result.national;
      result.kind='配偶者特別控除'; // Statutory adjustment difference is ZERO, not national minus resident.
    }
    return result;
  }
  function amounts(t,income,year=2026){
    validate(t);
    const s=spouse(t,income,year),rows=[];
    const add=(label,national,resident,difference=0)=>rows.push({label,national,resident,difference});
    add(s.kind,s.national,s.resident,s.difference);
    const disabled={none:[0,0,0],general:[270000,260000,10000],special:[400000,300000,100000],cohabiting:[750000,530000,220000]};
    add('本人の障害者控除',...disabled[t.selfDisability]);
    add('配偶者の障害者控除',...disabled[s.same?t.spouseDisability:'none']);
    for(const [key,kind] of [['disabledGeneral','general'],['disabledSpecial','special'],['disabledCohabiting','cohabiting']])add('扶養親族の障害者控除（'+({general:'一般',special:'特別',cohabiting:'同居特別'})[kind]+'）',...disabled[kind].map(v=>v*t[key]));
    const parent=income<=5000000?t.parent:'none';
    add('ひとり親・寡婦控除',...(['father','mother'].includes(parent)?[350000,300000,parent==='father'?10000:50000]:parent==='none'?[0,0,0]:[270000,260000,10000]));
    add('勤労学生控除',...(t.student&&income>0&&income<=(year===2025?850000:890000)?[270000,260000,10000]:[0,0,0]));
    const nationalTable=[[850000,630000],[900000,610000],[950000,510000],[1000000,410000],[1050000,310000],[1100000,210000],[1150000,110000],[1200000,60000],[1230000,30000]];
    let specialNational=0,specialResident=0;
    t.specialIncomes.forEach(n=>{if(n>(year===2025?580000:620000)&&n<=1230000){const value=nationalTable.find(r=>n<=r[0])[1];specialNational+=value;specialResident+=n<=950000?450000:value;}});
    add('特定親族特別控除',specialNational,specialResident);
    add('追加の社会保険料控除',t.extraSocial,t.extraSocial);
    add('小規模企業共済等掛金控除（iDeCo等）',t.smallEnterprise,t.smallEnterprise);
    add('生命保険料控除',t.lifeNational,t.lifeResident);
    add('地震保険料控除',t.earthquakeNational,t.earthquakeResident);
    add('医療費控除',t.medicalNational,t.medicalResident);
    add('雑損控除',t.casualtyNational,t.casualtyResident);
    // User enters the deduction after the 2,000-yen exclusion, capped for each income scenario.
    add('寄附金控除',Math.min(t.donationNational,Math.max(0,Math.floor(income*4/10)-2000)),0);
    return {rows,national:rows.reduce((v,r)=>v+r.national,0),resident:rows.reduce((v,r)=>v+r.resident,0),difference:rows.reduce((v,r)=>v+r.difference,0),spouse:s,
      exempt:income<=1350000&&(t.selfDisability!=='none'||parent!=='none'),
      nationalCredit:t.nationalCredit,wardCredit:t.wardCredit,metroCredit:t.metroCredit};
  }
  function adjustmentEligible(t,year){
    return t.adjustmentOther||t.selfDisability==='special'||t.disabledSpecial+t.disabledCohabiting>0||
      (spouse(t,0,year).same&&['special','cohabiting'].includes(t.spouseDisability));
  }
  // September 2026 uses the pre-December income requirements. This is a count for the monthly table.
  function monthlyCount(t,income){
    const s=t.spouseEligible&&t.spouseIncome<=950000&&income<=9000000?1:0;
    const spouseDisabled=t.spouseEligible&&t.spouseIncome<=580000?t.spouseDisability:'none';
    return s+(t.selfDisability!=='none'?1:0)+(spouseDisabled==='none'?0:spouseDisabled==='cohabiting'?2:1)+
      t.disabledGeneral+t.disabledSpecial+2*t.disabledCohabiting+
      (t.parent!=='none'&&income<=5000000?1:0)+(t.student&&income>0&&income<=850000?1:0)+
      t.specialIncomes.filter(n=>n>580000&&n<=1000000).length;
  }
  return {defaults,validate,amountLimits,spouse,amounts,adjustmentEligible,monthlyCount};
});
