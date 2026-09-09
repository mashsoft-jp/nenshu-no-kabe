/* 年収の壁2026-09 snapshot. Integer yen; rates in 0.01 percentage points.
 * Sources and scope are documented in the accompanying HTML / README.
 * No network access, persistence, or probabilistic calculations.
 */
const Tedori = (() => {
  const healthRates = [
    ['北海道',1028],['青森県',985],['岩手県',951],['宮城県',1010],['秋田県',1001],['山形県',975],['福島県',950],
    ['茨城県',952],['栃木県',982],['群馬県',968],['埼玉県',967],['千葉県',973],['東京都',985],['神奈川県',992],
    ['新潟県',921],['富山県',959],['石川県',970],['福井県',971],['山梨県',955],['長野県',963],['岐阜県',980],
    ['静岡県',961],['愛知県',993],['三重県',977],['滋賀県',988],['京都府',989],['大阪府',1013],['兵庫県',1012],
    ['奈良県',991],['和歌山県',1006],['鳥取県',986],['島根県',994],['岡山県',1005],['広島県',978],['山口県',1015],
    ['徳島県',1024],['香川県',1002],['愛媛県',998],['高知県',1005],['福岡県',1011],['佐賀県',1055],['長崎県',1006],
    ['熊本県',1008],['大分県',1008],['宮崎県',977],['鹿児島県',1013],['沖縄県',944]
  ];
  // [inclusive minimum remuneration, standard monthly remuneration]
  const bands = [
    [0,58000],[63000,68000],[73000,78000],[83000,88000],[93000,98000],[101000,104000],[107000,110000],
    [114000,118000],[122000,126000],[130000,134000],[138000,142000],[146000,150000],[155000,160000],
    [165000,170000],[175000,180000],[185000,190000],[195000,200000],[210000,220000],[230000,240000],
    [250000,260000],[270000,280000],[290000,300000],[310000,320000],[330000,340000],[350000,360000],
    [370000,380000],[395000,410000],[425000,440000],[455000,470000],[485000,500000],[515000,530000],
    [545000,560000],[575000,590000],[605000,620000],[635000,650000],[665000,680000],[695000,710000],
    [730000,750000],[770000,790000],[810000,830000],[855000,880000],[905000,930000],[955000,980000],
    [1005000,1030000],[1055000,1090000],[1115000,1150000],[1175000,1210000],[1235000,1270000],
    [1295000,1330000],[1355000,1390000]
  ];
  function integer(n, min, max, label) {
    if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(`${label}は${min.toLocaleString('ja-JP')}〜${max.toLocaleString('ja-JP')}の整数で入力してください。`);
    return n;
  }
  // Salary deduction rounding: 0.50 yen rounds down; above 0.50 rounds up.
  function roundHalfDownRatio(num, den) {
    const q = Math.floor(num / den), rem = num % den;
    return q + (rem * 2 > den ? 1 : 0);
  }
  function standard(gross) {
    let value = bands[0][1];
    for (const [threshold, amount] of bands) { if (gross >= threshold) value = amount; else break; }
    return {health:value, pension:Math.max(88000, Math.min(650000, value))};
  }
  // NTA 2026 monthly withholding, column A computer-calculation special rule.
  // NOT annual income tax / 12. Reconstruction surtax already included.
  function withholding(afterSocial, dependents = 0) {
    integer(dependents,0,40,'源泉徴収上の扶養親族等の数');
    const a = Math.max(0, afterSocial);
    let earningsDeduction;
    if (a <= 158333) earningsDeduction = 54167;
    else if (a <= 299999) earningsDeduction = Math.ceil((a * 3 + 66670) / 10);
    else if (a <= 549999) earningsDeduction = Math.ceil((a * 2 + 366670) / 10);
    else if (a <= 708330) earningsDeduction = Math.ceil((a + 916670) / 10);
    else earningsDeduction = 162500;
    const basicDeduction = a<=2120833?48334:a<=2162499?40000:a<=2204166?26667:a<=2245833?13334:0;
    const taxable = Math.max(0,a-earningsDeduction-basicDeduction-31667*dependents);
    const brackets = [[162500,5105,0],[275000,10210,8296],[579166,20420,36374],[750000,23483,54113],
      [1500000,33693,130688],[3333333,40840,237893],[Infinity,45945,408061]];
    const [, rate, subtract] = brackets.find(([limit]) => taxable <= limit);
    // rate / 100000, then round half up to the nearest 10 yen.
    const tax = Math.max(0,Math.floor((taxable*rate-subtract*100000+500000)/1000000)*10);
    return {tax,a,taxable,earningsDeduction,basicDeduction,dependentDeduction:31667*dependents};
  }
  // Tokyo 23 wards, FY2026 (2025 salary income): single, no dependents,
  // no other income, no other deductions/credits. This is NOT a nationwide model.
  function resident(yearSalary, yearSocial) {
    integer(yearSalary,0,24000000,'前年の給与収入');
    integer(yearSocial,0,10000000,'前年の社会保険料');
    let income;
    if (yearSalary <= 650999) income = 0;
    else if (yearSalary < 1900000) income = yearSalary-650000;
    else if (yearSalary < 3600000) income = Math.floor(yearSalary/4000)*2800-80000;
    else if (yearSalary < 6600000) income = Math.floor(yearSalary/4000)*3200-440000;
    else if (yearSalary < 8500000) income = Math.floor(yearSalary*9/10)-1100000;
    else income = yearSalary-1950000;
    const taxable = Math.max(0,Math.floor((income-yearSocial-430000)/1000)*1000);
    if (income <= 450000) return {annual:0,monthly:0,june:0,income,taxable,yearSalary,yearSocial};
    const adjustBase = taxable<=2000000?Math.min(50000,taxable):50000;
    const ward = Math.floor(Math.max(0,taxable*6-adjustBase*3)/10000)*100;
    const metro = Math.floor(Math.max(0,taxable*4-adjustBase*2)/10000)*100;
    const annual = ward+metro+5000; // 3,000 + 1,000 + forest environment tax 1,000.
    const monthly = Math.floor(annual/1200)*100;
    return {annual,monthly,june:annual-monthly*11,income,taxable,yearSalary,yearSocial};
  }
  function calculate(x) {
    integer(x.gross,80000,2000000,'月の総支給額');
    integer(x.nonTax,0,x.gross,'非課税通勤手当');
    integer(x.age,20,64,'年齢');
    integer(x.other,0,2000000,'その他の給与控除');
    const prefecture = healthRates.find(([p]) => p === x.prefecture);
    if (!prefecture) throw new Error('協会けんぽの加入支部を選んでください。');
    if (![0,50,60].includes(x.employment)) throw new Error('雇用保険の区分が不正です。');
    let std = standard(x.gross);
    if (x.standardMode==='manual') {
      if (!bands.some(b=>b[1]===x.healthStandard)) throw new Error('健康保険の標準報酬月額を選んでください。');
      if (!bands.some(b=>b[1]===x.pensionStandard&&b[1]>=88000&&b[1]<=650000)) throw new Error('厚生年金の標準報酬月額を選んでください。');
      std={health:x.healthStandard,pension:x.pensionStandard};
    }
    const healthRate = prefecture[1], careRate = x.age>=40?162:0;
    const health = roundHalfDownRatio(std.health*healthRate,20000);
    // Round health+care together as in the Kyokai table, then allocate the difference to care.
    const care = roundHalfDownRatio(std.health*(healthRate+careRate),20000)-health;
    const child = roundHalfDownRatio(std.health*23,20000);
    const pension = roundHalfDownRatio(std.pension*1830,20000);
    const employment = roundHalfDownRatio(x.gross*x.employment,10000);
    const social=health+care+child+pension+employment;
    const income=withholding(x.gross-x.nonTax-social,x.dependents);
    let residentDetail=null, residentTax;
    if (x.residentMode==='manual') residentTax=integer(x.residentMonthly,0,2000000,'住民税の月額');
    else if (x.residentMode==='previous') {
      residentDetail=resident(x.previousSalary,x.previousSocial); residentTax=residentDetail.monthly;
    } else if (x.residentMode==='estimate') {
      // EXPLICIT estimate only; 2025 contribution amounts cannot be inferred from this month's salary.
      // The 2026 child support contribution is excluded from this assumed prior-year amount.
      residentDetail=resident((x.gross-x.nonTax)*12,(social-child)*12); residentTax=residentDetail.monthly;
    } else throw new Error('住民税の計算方法を選んでください。');
    const taxes=income.tax+residentTax;
    const deducted=social+taxes+x.other;
    return {gross:x.gross,net:x.gross-deducted,deducted,social,taxes,health,care,child,pension,employment,
      incomeTax:income.tax,residentTax,other:x.other,std,healthRate,careRate,income,residentDetail};
  }
  return {healthRates,bands,roundHalfDownRatio,standard,withholding,resident,calculate};
})();
if(typeof module!=='undefined') module.exports=Tedori;
