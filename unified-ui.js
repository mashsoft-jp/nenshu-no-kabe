/* Interactive comparison UI. All data remains in this browser until explicit file export. */
(() => {
  'use strict';
  const P = window.Nenshu;
  const el = id => document.getElementById(id);
  const nf = new Intl.NumberFormat('ja-JP', {maximumFractionDigits:2});
  const n = value => nf.format(value);
  const yen = value => n(Math.round(value))+'円';
  const signed = value => value>0?'＋'+yen(value):value<0?'−'+yen(-value):'0円';
  const tone = value => value>0?'sim-positive':value<0?'sim-negative':'sim-neutral';
  const man = value => n(value/10000)+'万円';
  const number = id => el(id).valueAsNumber;
  const yenInput = id => Math.round(number(id)*10000);
  const ranges = [3000000,6000000,12000000,30000000,60000000,100000000];
  let input = P.defaultInput(), policy = P.currentPolicy(), selected = 0;
  let graphMode='net', detailMode='current', graphMax=12000000, lastComparison=null;
  let history=[P.clone(policy)], frame=0, chartCacheKey='', chartData=[];
  let chartGeometry=null, dragIndex=null, didDrag=false;
  let allValid=true, lastViewSignature="";

  function notify(text) {
    el('toast').textContent=text;el('toast').hidden=false;
    clearTimeout(notify.timer);notify.timer=setTimeout(()=>el('toast').hidden=true,3500);
  }
  function hasPolicyChange() { return JSON.stringify(policy)!==JSON.stringify(P.currentPolicy()); }
  function commit() {
    try { P.validatePolicy(policy); } catch { return; }
    if(JSON.stringify(policy)!==JSON.stringify(history.at(-1))) {
      history.push(P.clone(policy));if(history.length>80)history.shift();
    }
    updateUndo();
  }
  function updateUndo() {
    el('simUndo').disabled=history.length<=1 && JSON.stringify(policy)===JSON.stringify(history[0]);
  }
  function undo() {
    if(JSON.stringify(policy)!==JSON.stringify(history.at(-1))) policy=P.clone(history.at(-1));
    else if(history.length>1) {history.pop();policy=P.clone(history.at(-1));}
    selected=Math.min(selected,policy.brackets.length-1);renderEditor();syncBasic();update();
  }
  function changePolicy(fn) {
    try { P.validatePolicy(policy);fn();P.validatePolicy(policy);commit();selected=Math.min(selected,policy.brackets.length-1);renderEditor();syncBasic();update(); }
    catch(e){notify(e.message);}
  }
  function renderBonusRows() {
    const host=el('bonusRows');host.replaceChildren();
    input.bonuses.forEach((b,i)=>{
      const row=document.createElement('div');row.className='bonus-row';row.dataset.bonusRow=i;
      const month=document.createElement('select');month.dataset.bonusField='month';month.setAttribute('aria-label','賞与'+(i+1)+'の支給月');
      for(let m=1;m<=12;m++){const o=document.createElement('option');o.value=m;o.textContent=m+'月';month.append(o);}month.value=b.month;
      const wrap=document.createElement('div');wrap.className='bonus-amount';
      const amount=document.createElement('input');amount.type='number';amount.inputMode='numeric';amount.min=0;amount.max=P.MAX_GROSS;amount.step=1;amount.value=Number.isFinite(b.gross)?b.gross:'';amount.dataset.bonusField='gross';amount.setAttribute('aria-label','賞与'+(i+1)+'の額面（円）');
      const unit=document.createElement('span');unit.textContent='円';wrap.append(amount,unit);
      const remove=document.createElement('button');remove.type='button';remove.textContent='削除';remove.dataset.removeBonus=i;remove.setAttribute('aria-label','賞与'+(i+1)+'を削除');
      row.append(month,wrap,remove);host.append(row);
    });
  }
  const dependentLabels={under16:'16歳未満',young:'16〜18歳',specific:'19〜22歳（特定）',adult:'23〜69歳',elderly:'70歳以上（同居老親等以外）',cohabiting:'70歳以上（同居老親等）'};
  function createDependentFields(){
    for(const prefix of ['dependent','previousDependent']){
      const host=el(prefix+'Fields');
      P.dependentKeys.forEach(key=>{
        const field=document.createElement('div');field.className='sim-field';
        const label=document.createElement('label');label.htmlFor=prefix+'_'+key;label.textContent=dependentLabels[key]+'（人）';
        const control=document.createElement('input');control.id=label.htmlFor;control.type='number';control.min=0;control.max=10;control.step=1;control.inputMode='numeric';control.value=0;
        field.append(label,control);host.append(field);
      });
    }
  }
  function dependentText(d){return P.dependentKeys.filter(k=>d[k]>0).map(k=>dependentLabels[k]+':'+d[k]+'人').join('／')||'なし';}
  function populateConditions() {
    const fields={withholdingDependentMode:'withholdingDependentMode',withholdingDependents:'withholdingDependents',previousDependentMode:'previousDependentMode',monthlyGross:'monthlyGross',simAge:'age',simPrefecture:'prefecture',simEmployment:'employment',
      simSocialMode:'socialMode',simSocialAnnual:'socialAnnual',simResidentMode:'residentMode',simResidentAnnual:'residentAnnual',
      standardMode:'standardMode',healthStandard:'healthStandard',pensionStandard:'pensionStandard',nonTax:'nonTax',
      monthlyResidentMode:'monthlyResidentMode',residentCollectionMode:'residentCollectionMode',residentMonthly:'residentMonthly',previousSalary:'previousSalary',previousSocial:'previousSocial',
      otherDeduction:'other',priorBonusStandard:'priorBonusStandard'};
    P.dependentKeys.forEach(k=>{el('dependent_'+k).value=input.dependents[k];el('previousDependent_'+k).value=input.previousDependents[k];});
    Object.entries(fields).forEach(([id,key])=>el(id).value=input[key]);
    if(!Array.from(el('simGraphMax').options).some(o=>+o.value===graphMax)) {
      const opt=document.createElement('option');opt.value=graphMax;opt.textContent=man(graphMax);el('simGraphMax').append(opt);
    }
    el('simGraphMax').value=graphMax;renderBonusRows();syncConditions();
  }
  function readConditions() {
    input={dependents:Object.fromEntries(P.dependentKeys.map(k=>[k,number('dependent_'+k)])),
      previousDependents:Object.fromEntries(P.dependentKeys.map(k=>[k,number('previousDependent_'+k)])),
      withholdingDependentMode:el('withholdingDependentMode').value,withholdingDependents:number('withholdingDependents'),previousDependentMode:el('previousDependentMode').value,
      monthlyGross:number('monthlyGross'),bonuses:[...el('bonusRows').children].map(row=>({month:+row.querySelector('select').value,gross:row.querySelector('input').valueAsNumber})),
      age:number('simAge'),prefecture:el('simPrefecture').value,employment:+el('simEmployment').value,
      socialMode:el('simSocialMode').value,socialAnnual:number('simSocialAnnual'),residentMode:el('simResidentMode').value,residentAnnual:number('simResidentAnnual'),
      standardMode:el('standardMode').value,healthStandard:+el('healthStandard').value,pensionStandard:+el('pensionStandard').value,
      nonTax:number('nonTax'),monthlyResidentMode:el('monthlyResidentMode').value,residentCollectionMode:el('residentCollectionMode').value,residentMonthly:number('residentMonthly'),
      previousSalary:number('previousSalary'),previousSocial:number('previousSocial'),other:number('otherDeduction'),priorBonusStandard:number('priorBonusStandard')};
    input.annualGross=P.annualGross(input);
  }
  function growRange() {
    if(Number.isFinite(input.annualGross)&&input.annualGross>graphMax&&input.annualGross<=P.MAX_GROSS) {
      graphMax=ranges.find(v=>v>=input.annualGross)||P.MAX_GROSS;el('simGraphMax').value=graphMax;
    }
    if(Number.isFinite(P.graphMinimum(input))&&graphMax<=P.graphMinimum(input)) {
      graphMax=ranges.find(v=>v>P.graphMinimum(input))||P.MAX_GROSS;el('simGraphMax').value=graphMax;
    }
  }
  function syncConditions() {
    el('withholdingDependentsWrap').hidden=input.withholdingDependentMode!=='manual';
    el('previousDependentFields').hidden=input.previousDependentMode!=='manual';
    try {
      const d=P.dependentAmounts(input.dependents);
      el('dependentSummary').textContent=d.count?d.count+'人':'なし';
      el('dependentDeductionHint').textContent='年間の扶養控除：所得税 '+yen(d.national)+'／住民税 '+yen(d.resident)+'。通常月の源泉徴収人数：'+P.withholdingCount(input)+'人。16歳未満は扶養控除なし・住民税の非課税人数に含めます。';
    }catch{el('dependentSummary').textContent='入力を確認';el('dependentDeductionHint').textContent='人数は合計10人までの整数で入力してください。';}
    el('simSocialManualWrap').hidden=input.socialMode!=='manual';el('simResidentManualWrap').hidden=input.residentMode!=='manual';
    el('standardManualWrap').hidden=input.standardMode!=='manual';el('monthlyResidentManualWrap').hidden=input.monthlyResidentMode!=='manual';
    el('previousWrap').hidden=input.monthlyResidentMode!=='previous';
    el('residentAnnualOption').disabled=input.residentMode!=='manual';
    el('monthlyResidentHint').textContent=input.monthlyResidentMode==='annual'
      ?'通知書の対象年度の7月〜翌5月分を通常月に使用します。6月分は別に表示します。'
      :input.monthlyResidentMode==='manual'
      ?'通知書・給与明細の月額を優先します。年額を変更しても、この月額は上書きしません。'
      :'2026年度を東京23区の制度と前年の扶養条件で概算。通知書の年額とは連動しません。';
    el('priorBonusWrap').hidden=!input.bonuses.some(b=>b.month<=3);
    el('bonusEmpty').hidden=input.bonuses.length!==0;el('bonusTotalWrap').hidden=input.bonuses.length===0;el('bonusLimitHint').hidden=input.bonuses.length===0;
    el('addBonus').disabled=input.bonuses.length>=3;
    const bonus=P.bonusTotal(input),valid=Number.isFinite(input.annualGross);
    el('bonusTotal').textContent=Number.isFinite(bonus)?yen(bonus):'—';
    el('derivedAnnualGross').textContent=valid?yen(input.annualGross):'—';
    el('grossFormula').textContent=valid?yen(input.monthlyGross)+' × 12 ＋ '+yen(bonus):'月給・賞与を入力してください。';
    el('nonTaxAnnualHint').hidden=!(input.nonTax>0);
    el('nonTaxAnnualHint').textContent=valid?'課税対象の給与収入 '+yen(input.annualGross-input.nonTax*12):'';
    el('monthlySlider').max=Math.max(2000000,Number.isFinite(input.monthlyGross)?input.monthlyGross:2000000);
    if(Number.isFinite(input.monthlyGross))el('monthlySlider').value=input.monthlyGross;
    document.querySelectorAll('[data-monthly]').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.monthly===input.monthlyGross)));
  }

  function syncResidentSelection(id) {
    if(!['simResidentMode','simResidentAnnual'].includes(id))return;
    const monthly=el('monthlyResidentMode');
    if(el('simResidentMode').value==='manual'){
      // Explicit monthly amounts are authoritative, even when the annual total changes.
      if(monthly.value!=='manual')monthly.value='annual';
    }else if(monthly.value==='annual')monthly.value='estimate';
  }
  function monthlyResidentLabel() {
    return input.monthlyResidentMode==='annual'?'通知書の対象年度・7月〜翌5月':
      input.monthlyResidentMode==='manual'?'通知書の指定月額':'2026年度概算（年額入力とは独立）';
  }
  function renderResidentNotice(c) {
    const r=c.current,m=r.monthly,linked=input.monthlyResidentMode==='annual';
    el('residentSchedule').hidden=input.residentMode!=='manual';
    if(input.residentMode==='manual'){
      const d=P.residentInstallments(input.residentAnnual,input.residentCollectionMode);
      el('residentJune').textContent=yen(d.june);el('residentRegular').textContent=yen(d.monthly);
      el('residentScheduleTotal').textContent=yen(d.june)+' ＋ '+yen(d.monthly)+' × 11 ＝ '+yen(d.annual);
      el('residentScheduleUse').textContent=linked?'7月〜翌5月分を通常月の手取りに反映。':
        input.monthlyResidentMode==='manual'?'通常月は指定した月額を優先。上の配分は参考です。':'通常月は別の概算設定。上の配分は参考です。';
    }
    el('monthlyPayHeading').textContent=linked?'通常月（7月〜翌5月）':'通常月';
    el('residentJunePay').hidden=!linked;
    if(linked)el('residentJuneNet').textContent=yen(m.net+m.residentTax-m.residentDetail.june);
    el('residentSummaryNote').textContent='年間は2026年分の所得税・9月の社会保険料率と、'+
      (input.residentMode==='manual'?'通知書などの対象年度の住民税年額を使用します。翌年度の住民税予測ではありません。':'2027年度の住民税予測額を使用します。')+
      '実際の年間振込総額ではありません。';
    el('residentBreakdownNote').textContent=linked?
      '通常月の住民税は通知書年額から算出した7月〜翌5月分。6月は端数等を含むため、住民税年額は通常月×12と一致しない場合があります。所得税の月額は源泉徴収、年額は年間所得から計算します。':
      '住民税の月額と年額は別設定です。月額の所得税は源泉徴収額、年額は年間所得から計算した税額です。年額は通常月×12とは限りません。';
  }
  function residentAllocationDetails(box,d) {
    annualParagraph(box,'通知書の対象年度：6月 '+yen(d.june)+'／7月〜翌5月 各'+yen(d.monthly),'detail-result');
    annualParagraph(box,d.collection==='june'?'通知書に合わせて6月に全額徴収。7月〜翌5月は0円。':
      '7月〜翌5月：'+yen(d.annual)+' ÷ 12 → 100円未満切捨て ＝ '+yen(d.monthly),'detail-step');
    annualParagraph(box,'6月：'+yen(d.annual)+' − '+yen(d.monthly)+' × 11 ＝ '+yen(d.june),'detail-formula');
    annualParagraph(box,'給与特別徴収の年額（森林環境税込み）を使用します。年度途中の転職・税額変更や通知書と配分が違う場合は、通知書の月額を直接指定してください。');
  }

  function syncBasic() {
    el('simBasicMode').value=policy.basicMode;
    el('simBasicAmount').value=Number.isFinite(policy.basicAmount)?policy.basicAmount/10000:'';
    el('simBasicAmountWrap').hidden=policy.basicMode==='current';
    el('simBasicAmount').min=policy.basicMode==='add'?-1000:0;
    el('simBasicAmountLabel').textContent=policy.basicMode==='flat'?'全所得帯に適用する控除額（万円）':'各控除額への加算・減算額（万円）';
    el('simBasicNote').textContent=policy.basicMode==='flat'?
      '所得制限もなくし、どの所得帯でも同じ控除額にする仮想制度です。':policy.basicMode==='add'?
      '現行で控除0円となる高所得帯も含め、全所得帯で加減算します。減算後の最低額は0円です。':
      '現行は合計所得489万円以下で104万円、655万円以下で67万円など、所得に応じて変わります。';
  }
  function pick(index) {selected=index;syncEditorLabels();}
  function renderEditor() {
    const rows=el('simBracketRows');rows.replaceChildren();
    policy.brackets.forEach((b,i)=>{
      const row=document.createElement('div');row.className='sim-bracket-row';row.dataset.index=i;
      const pickButton=document.createElement('button');pickButton.type='button';pickButton.className='sim-pick';pickButton.textContent=i+1;
      pickButton.setAttribute('aria-label','第'+(i+1)+'段階をスライダーで編集');pickButton.addEventListener('click',()=>pick(i));
      const upperWrap=document.createElement('div');const lower=document.createElement('div');lower.className='sim-range-lower';upperWrap.append(lower);
      if(b.upper===null) {const noLimit=document.createElement('div');noLimit.className='sim-no-limit';noLimit.textContent='上限なし';upperWrap.append(noLimit);}
      else {
        const upper=document.createElement('input');upper.type='number';upper.inputMode='decimal';upper.min='.1';upper.max='10000';upper.step='.1';upper.value=b.upper/10000;upper.dataset.field='upper';
        upper.setAttribute('aria-label','第'+(i+1)+'段階の課税所得上限（万円）');upper.addEventListener('focus',()=>pick(i));upperWrap.append(upper);
      }
      const rate=document.createElement('input');rate.type='number';rate.inputMode='decimal';rate.min='0';rate.max='100';rate.step='.01';rate.value=b.rateBp/100;rate.dataset.field='rate';
      rate.setAttribute('aria-label','第'+(i+1)+'段階の税率（%）');rate.addEventListener('focus',()=>pick(i));
      const ops=document.createElement('div');ops.className='sim-row-ops';
      const add=document.createElement('button');add.type='button';add.textContent='＋';add.title='この段階を分割';add.setAttribute('aria-label','第'+(i+1)+'段階を分割');add.disabled=policy.brackets.length>=20;
      add.addEventListener('click',()=>changePolicy(()=>{
        const old=policy.brackets[i],lo=i===0?0:policy.brackets[i-1].upper;
        const midpoint=old.upper===null?Math.min(P.MAX_GROSS,lo+1000000):Math.floor((lo+old.upper)/2000)*1000;
        if(midpoint<=lo||(old.upper!==null&&midpoint>=old.upper))throw new Error('この区間には新しい境目を置けません。上限額を広げてください。');
        policy.brackets.splice(i,1,{upper:midpoint,rateBp:old.rateBp},{...old});selected=i;
      }));
      const remove=document.createElement('button');remove.type='button';remove.textContent='−';remove.title='この段階を削除';remove.setAttribute('aria-label','第'+(i+1)+'段階を削除');remove.disabled=policy.brackets.length<=1;
      remove.addEventListener('click',()=>changePolicy(()=>{
        if(i===policy.brackets.length-1){policy.brackets.pop();policy.brackets.at(-1).upper=null;}
        else policy.brackets.splice(i,1);
        selected=Math.min(i,policy.brackets.length-1);
      }));
      ops.append(add,remove);row.append(pickButton,upperWrap,rate,ops);rows.append(row);
    });
    syncEditorLabels();
  }
  function syncEditorLabels() {
    const bs=policy.brackets;
    el('simStageBadge').textContent=bs.length+'段階';
    document.querySelectorAll('#simBracketRows .sim-bracket-row').forEach((r,i)=>{
      r.classList.toggle('is-selected',i===selected);
      r.querySelector('.sim-pick').setAttribute('aria-pressed',i===selected);
      const lo=i===0?0:bs[i-1].upper;
      r.querySelector('.sim-range-lower').textContent=Number.isFinite(lo)?(i===0?'0万円から':man(lo)+'を超える部分'):'上の上限額を入力';
    });
    const b=bs[selected];if(!b)return;
    el('simSelectedTitle').textContent='第'+(selected+1)+'段階の設定';
    el('simBoundarySliderWrap').hidden=b.upper===null;
    const lo=selected===0?0:bs[selected-1].upper;
    const next=bs[selected+1]?.upper;
    const hi=next===null||next===undefined?P.MAX_GROSS:next-1000;
    el('simBoundarySlider').min=Number.isFinite(lo)?lo+1000:1000;
    el('simBoundarySlider').max=Number.isFinite(hi)?hi:P.MAX_GROSS;
    el('simBoundarySlider').disabled=!Number.isFinite(b.upper)||!Number.isFinite(lo)||hi<=lo;
    if(Number.isFinite(b.upper))el('simBoundarySlider').value=b.upper;
    el('simBoundaryValue').textContent=Number.isFinite(b.upper)?man(b.upper):'—';
    if(Number.isFinite(b.rateBp))el('simRateSlider').value=b.rateBp;
    el('simRateValue').textContent=Number.isFinite(b.rateBp)?n(b.rateBp/100)+'%':'—';
    updateUndo();
  }
  function refreshEditorNumbers() {
    document.querySelectorAll('#simBracketRows .sim-bracket-row').forEach((r,i)=>{
      const b=policy.brackets[i],u=r.querySelector('[data-field=upper]');if(u)u.value=Number.isFinite(b.upper)?b.upper/10000:'';
      r.querySelector('[data-field=rate]').value=Number.isFinite(b.rateBp)?b.rateBp/100:'';
    });syncEditorLabels();
  }
  function scheduleUpdate() {if(frame)cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{frame=0;update();});}
  function classValue(id,text,value) {el(id).textContent=text;el(id).classList.remove('sim-positive','sim-negative','sim-neutral');el(id).classList.add(tone(value));}
  function renderSummary(c) {
    const {current:a,changed:b,delta}=c,m=a.monthly,modified=hasPolicyChange();
    classValue('simDelta',signed(delta),delta);
    el('simPolicyComparison').hidden=!modified;
    el('simOptionState').textContent=modified?'変更中':'未変更';el('simOptionState').classList.toggle('green',modified);
    el('simOptionDescription').textContent=modified?'変更した所得税で比較中です。閉じても設定は保持されます。':'税率・課税所得の上限・段階数・基礎控除を変更できます。';
    el('simFloatingLabel').textContent=modified?'所得税変更による年間増減':'年間手取り（賞与込み）';
    classValue('simFloatingDelta',modified?signed(delta):yen(a.net),modified?delta:1);
    renderResidentNotice(c);
    el('monthlyNet').textContent=yen(m.net);el('monthlyNetRate').textContent='手取り率 '+(m.net/m.gross*100).toFixed(1)+'%';
    el('simCurrentNet').textContent=yen(a.net);el('simChangedNet').textContent=yen(b.net);
    el('simCurrentMonthly').textContent='月平均 約'+yen(a.net/12)+'（年額÷12）';
    el('annualNetRate').textContent='手取り率 '+(a.net/a.gross*100).toFixed(1)+'%';
    el('simChangedMonthly').textContent='月平均 約'+yen(b.net/12)+'（年額÷12）';
    el('simDeltaMonthly').textContent='月平均の差額 約'+signed(delta/12);
    el('salaryAnnual').textContent=yen(input.monthlyGross*12);el('summaryBonus').textContent=yen(a.bonusGross);el('summaryGross').textContent=yen(a.gross);
    el('simChangeStatus').textContent=!modified?'現行と同じ設定':delta===0?'この年収では差額なし':'仮想制度で比較中';
    el('simEqualHint').hidden=delta!==0;
    if(input.annualGross+12000<=P.MAX_GROSS&&input.monthlyGross+1000<=P.MAX_MONTHLY) {
      const nextInput={...input,monthlyGross:input.monthlyGross+1000,annualGross:input.annualGross+12000};
      const next=P.compare(nextInput,policy);
      classValue('simNextCurrent',signed(next.current.net-a.net),next.current.net-a.net);
      classValue('simNextChanged',signed(next.changed.net-b.net),next.changed.net-b.net);
    }else{el('simNextCurrent').textContent=el('simNextChanged').textContent='上限のため対象外';}
    const note=el('simModelNote');note.replaceChildren();
    const para=(title,text)=>{const p=document.createElement('p');p.className='sim-note-item';const strong=document.createElement('strong');strong.textContent=title;p.append(strong,document.createTextNode(' '+text));note.append(p);};
    para('通常月', '2026年9月の源泉徴収。住民税は'+(input.monthlyResidentMode==='annual'?'通知書の対象年度の7月〜翌5月分。6月の手取りは住民税差だけを反映。':input.monthlyResidentMode==='manual'?'通知書などの入力月額。':input.monthlyResidentMode==='previous'?'入力した前年実績から概算。':'前年も同じ給与・賞与と仮定し、社会保険料も今回の年額から支援金を除いた額と仮定。')+'賞与が支給されない月の概算です。');
    para('年間', '所得税は2026年分、住民税は'+(input.residentMode==='manual'?'入力した年額を固定。':'東京23区の2027年度負担を概算。')+'社会保険は'+(input.socialMode==='manual'?'入力した年額を固定。':'9月の料率で月給分×12＋賞与分。')+'年内の料率変更や年末調整の還付時期は再現せず、実際の年間振込総額とは異なります。');
    para('賞与', '賞与ごとの振込額・源泉徴収額は算出しません。額面と社会保険料を年間に合算し、所得税は年間所得に対して計算します。1〜3月の賞与にも9月の固定料率を使用します。');
    para('グラフ', '賞与・その他条件を固定し、月給を変えて年収別の手取りを計算します。所得税の税率区分以外にも、基礎控除・保険料等級・住民税の判定・端数処理による段差があります。社会保険の加入・脱退の壁は対象外です。');
    if(input.socialMode==='manual'||input.residentMode==='manual'||input.standardMode==='manual')para('固定条件', '入力した年間保険料・年間住民税や、指定した標準報酬月額は、グラフで月給を動かしても固定します。');
    if(a.net<0||b.net<0||m.net<0)para('控除超過', '控除が給与を超えています。負の手取りは計算上の値です。税率や入力額を確認してください。');
    el('bonusSummaryNote').hidden=a.bonusGross===0;
    el('bonusSummaryNote').textContent='賞与額面 '+yen(a.bonusGross)+'／賞与の社会保険料 '+yen(a.automaticSocial.bonusTotal)+'。賞与ごとの源泉徴収・振込額は算出せず、所得税は年間で合算計算します。'+(a.social.manual?'年額の社会保険料は手入力値を使用しています。':'');
  }

  function appendTableRow(tbody,values,cls='',lastTone=null) {
    const row=document.createElement('tr');row.className=cls;
    values.forEach((v,i)=>{const cell=document.createElement('td');cell.textContent=v;if(i===values.length-1&&lastTone!==null)cell.className=tone(lastTone);row.append(cell);});
    tbody.append(row);return row;
  }
  // Per-item details replace the separate social and income-tax explanation cards.
  const openAnnualDetails = new Set();
  const annualTaxPanel = el('simTaxDetails');
  const annualItemLabels = {gross:'額面給与',health:'健康保険',care:'介護保険',pension:'厚生年金',child:'子ども・子育て支援金',employment:'雇用保険',social:'社会保険料',incomeTax:'所得税・復興特別所得税',residentTax:'住民税・森林環境税',other:'その他の控除'};
  const annualItemColors = {gross:'var(--muted)',net:'var(--net)',health:'var(--health)',care:'var(--care)',pension:'var(--pension)',child:'var(--child)',employment:'var(--employment)',social:'var(--pension)',incomeTax:'var(--income)',residentTax:'var(--resident)',other:'var(--other)'};
  function annualParagraph(box,text,cls='detail-note') {
    const p=document.createElement('p');p.className=cls;p.textContent=text;box.append(p);return p;
  }
  function annualDetailContent(key,c,box) {
    const r=c.current,s=r.automaticSocial,m=r.monthly;
    annualParagraph(box,annualItemLabels[key]+'の計算','detail-heading');
    if(key==='gross'){
      annualParagraph(box,yen(input.monthlyGross)+' × 12 ＋ '+yen(r.bonusGross)+' ＝ '+yen(r.gross),'detail-formula');
      input.bonuses.forEach((b,i)=>annualParagraph(box,'賞与'+(i+1)+'：'+b.month+'月 '+yen(b.gross),'detail-step'));
      annualParagraph(box,input.nonTax?'非課税通勤手当 '+yen(r.nonTax)+'／年を除いた、税計算上の給与収入は '+yen(r.taxableGross)+'。':'月給は毎月同額、賞与は入力分の合計です。');return;
    }
    if(key==='social'){
      annualParagraph(box,'年間：入力した本人負担 '+yen(r.social.annual),'detail-formula');
      annualParagraph(box,'通常月：月給と等級から計算した '+yen(m.social),'detail-result');
      annualParagraph(box,'年額だけを上書きしています。通常月は自動計算のままです。保険別の年額内訳は不明のため表示しません。年額は年間所得の社会保険料控除にも使用します。');return;
    }
    if(key==='other'){
      annualParagraph(box,'月額 '+yen(m.other)+' × 12 ＝ '+yen(r.other),'detail-formula');
      annualParagraph(box,'指定された給与控除です。所得税・住民税の所得控除には含めません。');return;
    }
    if(key==='residentTax'){
      annualParagraph(box,'通常月（'+(input.monthlyResidentMode==='annual'?'通知書の対象年度・7月〜翌5月':input.monthlyResidentMode==='manual'?'通知書の指定月額':'2026年度・概算')+'）：'+yen(m.residentTax),'detail-formula');
      if(m.residentDetail?.notice){
        residentAllocationDetails(box,m.residentDetail);
      }else if(m.residentDetail){const d=m.residentDetail;
        annualParagraph(box,'2025年給与収入 '+yen(d.yearSalary)+' − 給与所得控除 − 所得金額調整控除 '+yen(d.incomeAdjustment||0)+' → 給与所得 '+yen(d.income)+'。社会保険料 '+yen(d.yearSocial)+'・基礎控除 '+yen(d.basic)+'・扶養控除 '+yen(d.dependentDeduction||0)+'を控除 → 課税所得 '+yen(d.taxable)+'.');
        annualParagraph(box,'2026年度年額 '+yen(d.annual)+'。6月 '+yen(d.june)+'、7月〜翌5月 各'+yen(d.monthly)+'。');
        annualParagraph(box,'前年の扶養：'+dependentText(P.previousFamily(input))+'（'+(input.previousDependentMode==='same'?'今年と同じ区分と仮定':'2025年末を個別指定')+'）。');
        if(input.monthlyResidentMode==='estimate')annualParagraph(box,'前年も同じ給与・賞与、前年保険料は今回の年間自動概算から子ども・子育て支援金を除いた額と仮定しています。');
      }else annualParagraph(box,'通知書などの入力月額を使用。通常月の自動計算は行いません。');
      const d=r.resident;
      annualParagraph(box,'年間手取りに使う住民税：'+yen(d.annual),'detail-subtitle');
      if(d.manual){
        annualParagraph(box,'通知書などの入力年額を固定しています。2027年度の予測額ではありません。');
        if(input.monthlyResidentMode!=='annual'){
          residentAllocationDetails(box,P.residentInstallments(d.annual,input.residentCollectionMode));
          annualParagraph(box,input.monthlyResidentMode==='manual'?'通常月は通知書の指定月額を優先。年額からの配分は参考です。':'通常月は別の概算設定を使用中です。年額からの配分は参考です。');
        }
      }
      else{
        annualParagraph(box,'給与所得 '+yen(r.income)+' − 社会保険料 '+yen(r.social.annual)+' − 基礎控除 '+yen(d.basic)+' − 扶養控除 '+yen(d.dependentDeduction||0)+' → 課税所得 '+yen(d.taxable),'detail-step');
        annualParagraph(box,'所得割 '+yen(d.ward+d.metro)+' ＋ 均等割・森林環境税 '+yen(d.flat)+' ＝ '+yen(d.annual),'detail-formula');
        annualParagraph(box,d.flat===0?'非課税判定により0円。':'特別区民税 '+yen(d.ward)+'（6%）＋都民税 '+yen(d.metro)+'（4%）。調整控除を反映。均等割4,000円＋森林環境税1,000円。');
        annualParagraph(box,'東京23区・2027年度・入力した扶養条件での概算です。所得税の設定変更では住民税の制度を変更しません。');
      }
      return;
    }
    const month=s.monthlyParts[key],bonus=s.bonusParts[key],rate=key==='health'?s.healthRate:key==='care'?s.careRate:key==='pension'?1830:key==='child'?23:input.employment;
    let formula=key==='employment'?yen(input.monthlyGross)+' × '+n(rate/100)+'%':yen(key==='pension'?s.std.pension:s.std.health)+' × '+n(rate/100)+'% ÷ 2';
    if(key==='health')formula+='（'+input.prefecture+'支部）';
    if(key==='care'&&!s.careRate)formula='40歳未満のため対象外（'+input.age+'歳）';
    if(key==='employment'&&!input.employment)formula='加入対象外として指定';
    annualParagraph(box,formula,'detail-formula');
    annualParagraph(box,'月額 '+yen(month)+' × 12 ＋ 賞与分 '+yen(bonus)+' ＝ '+yen(s.parts[key])+'／年','detail-result');
    if(s.bonusRows.length){
      annualParagraph(box,'賞与分','detail-subtitle');
      s.bonusRows.forEach(b=>{
        let text;
        if(key==='employment')text=b.month+'月：額面 '+yen(b.gross)+' × '+n(rate/100)+'% → '+yen(b.parts[key])+(b.payments>1?'（各支給分で端数処理後に合算）':'');
        else if(key==='care'&&!rate)text=b.month+'月：40歳未満のため0円';
        else text=b.month+'月：標準賞与額 '+yen(key==='pension'?b.pensionBase:b.healthBase)+' × '+n(rate/100)+'% ÷ 2 → '+yen(b.parts[key]);
        annualParagraph(box,text,'detail-step');
        if(key==='health'||key==='pension')annualParagraph(box,'額面 '+yen(b.gross)+' → 1,000円未満切捨て '+yen(b.standard)+(key==='health'?'。'+b.fiscalYear+'年度の既使用枠 '+yen(b.healthBefore)+'。':'。上限150万円／同月合算。'));
      });
      if(key!=='employment')annualParagraph(box,'賞与は同じ月の額面を合算して1,000円未満切捨て。健康保険等は年度（4月〜翌3月）573万円、厚生年金は月150万円が上限です。');
    }
    if(key==='care'&&s.careRate)annualParagraph(box,'健康保険と介護保険の合算額を端数処理し、健康保険との差額を介護分として表示しています。');
    if(key==='employment')annualParagraph(box,'本人負担率を使用。「÷2」は不要です。');
    else if(key!=='care'||s.careRate)annualParagraph(box,'標準報酬月額は'+(input.standardMode==='manual'?'決定済みの指定等級':'賞与を含まない月給からの仮置き')+'。料率は労使合計、本人はその半分です。');
    annualParagraph(box,'全月・賞与とも2026年9月の料率で計算する年額換算です。本人負担は50銭以下切捨て・50銭超切上げ。実際の2026年中の支払総額とは異なります。');
    if(key==='child')annualParagraph(box,'子ども・子育て支援金です。事業主のみの「子ども・子育て拠出金」とは別です。');
  }
  function appendAnnualItem(tbody,key,label,oldValue,newValue,delta,c) {
    const m=c.current.monthly;
    const mv=key==='gross'?m.gross:key==='net'?m.net:key==='social'?m.social:m[key];
    const row=appendTableRow(tbody,[label,yen(mv),yen(oldValue),yen(newValue)],key==='net'?'sim-total':'');
    row.dataset.annualItem=key;row.children[3].className='policy-col';row.children[3].hidden=!hasPolicyChange();
    if(!annualItemLabels[key])return;
    const cell=row.children[0];cell.replaceChildren();
    const labelWrap=document.createElement('div');labelWrap.className='sim-item-label';
    const title=document.createElement('span');title.className='breakdown-name';
    const dot=document.createElement('i');dot.className='dot';dot.style.background=annualItemColors[key];title.append(dot,document.createTextNode(label));
    const button=document.createElement('button');button.type='button';button.className='detail-toggle';button.id='annual-button-'+key;button.dataset.annualDetail=key;
    labelWrap.append(title,button);cell.append(labelWrap);
    const detailRow=document.createElement('tr');detailRow.className='sim-detail-row';detailRow.id='annual-detail-'+key;
    const detailCell=document.createElement('td');detailCell.colSpan=hasPolicyChange()?4:3;detailRow.append(detailCell);
    const panel=key==='incomeTax'?annualTaxPanel:document.createElement('div');
    if(key!=='incomeTax'){panel.className='item-detail';panel.style.setProperty('--detail-color',annualItemColors[key]);panel.setAttribute('role','region');panel.setAttribute('aria-label',label+'の計算詳細');annualDetailContent(key,c,panel);}
    panel.hidden=false;detailCell.append(panel);tbody.append(detailRow);button.setAttribute('aria-controls',detailRow.id);
    const sync=()=>{const open=openAnnualDetails.has(key);button.setAttribute('aria-expanded',String(open));button.textContent=open?'閉じる':'詳細';button.setAttribute('aria-label',label+'の詳細を'+(open?'閉じる':'開く'));detailRow.hidden=!open;};
    button.addEventListener('click',()=>{if(openAnnualDetails.has(key))openAnnualDetails.delete(key);else openAnnualDetails.add(key);sync();});sync();
  }
  function renderBars(c){
    const a=c.current;
    const annualParts=a.social.manual?{social:a.social.annual}:a.social.parts;
    const monthlyParts=Object.fromEntries(['health','care','pension','child','employment'].map(k=>[k,a.monthly[k]]));
    const sets=[['monthly',a.monthly.gross,a.monthly.net,{...monthlyParts,incomeTax:a.monthly.incomeTax,residentTax:a.monthly.residentTax,other:a.monthly.other}],['annual',a.gross,a.net,{...annualParts,incomeTax:a.national.annual,residentTax:a.resident.annual,other:a.other}]];
    sets.forEach(([id,gross,net,parts])=>{
      const host=el(id+'Bar');host.replaceChildren();el(id+'BarLabel').textContent='手取り '+(net/gross*100).toFixed(1)+'%';
      const entries=[['net',net],...Object.entries(parts)].filter(([,v])=>v>0);
      if(net<0){host.textContent='控除が額面を超えています';host.setAttribute('aria-label','控除が額面を超えています');return;}
      entries.forEach(([k,v])=>{const seg=document.createElement('div');seg.className='segment';seg.style.width=(v/gross*100)+'%';seg.style.background=annualItemColors[k];seg.title=(k==='net'?'手取り':annualItemLabels[k])+' '+yen(v);host.append(seg);});
      host.setAttribute('aria-label',entries.map(([k,v])=>(k==='net'?'手取り':annualItemLabels[k])+' '+yen(v)).join('、'));
    });
  }
  function renderComparison(c) {
    const a=c.current,b=c.changed,tbody=el('simComparisonBody');
    annualTaxPanel.remove();tbody.replaceChildren();
    document.querySelectorAll('th.policy-col').forEach(e=>e.hidden=!hasPolicyChange());
    appendAnnualItem(tbody,'gross','額面給与',a.gross,b.gross,0,c);
    if(a.social.manual)appendAnnualItem(tbody,'social','社会保険料',a.social.annual,b.social.annual,0,c);
    else ['health','care','pension','child','employment'].forEach(key=>appendAnnualItem(tbody,key,annualItemLabels[key],a.social.parts[key],b.social.parts[key],0,c));
    appendAnnualItem(tbody,'incomeTax',annualItemLabels.incomeTax,a.national.annual,b.national.annual,a.national.annual-b.national.annual,c);
    appendAnnualItem(tbody,'residentTax',annualItemLabels.residentTax,a.resident.annual,b.resident.annual,0,c);
    if(input.other)appendAnnualItem(tbody,'other',annualItemLabels.other,a.other,b.other,0,c);
    appendAnnualItem(tbody,'net','手取り',a.net,b.net,c.delta,c);renderBars(c);
  }
  function renderTax(c) {
    const r=c[detailMode],t=r.national,body=el('simTaxBody');body.replaceChildren();
    const m=c.current.monthly;el('monthlyTaxDetail').textContent='通常月（現行）：社保控除後 '+yen(m.income.a)+' → 課税給与所得 '+yen(m.income.taxable)+' → 所得税等 '+yen(m.incomeTax)+'。甲欄・扶養'+P.withholdingCount(input)+'人（控除 '+yen(m.income.dependentDeduction)+'）の電算機計算特例。賞与の源泉徴収額は含めません。';
    const route=el('simTaxRoute');route.replaceChildren();
    [['給与所得',r.income],['− 社会保険料控除',r.social.annual],['− 基礎控除',t.basic],['− 扶養控除',t.dependentDeduction],['＝ 課税所得',t.taxable]].forEach(([title,v])=>{const span=document.createElement('span');span.textContent=title+' ';const strong=document.createElement('strong');strong.textContent=man(v);span.append(strong);route.append(span);});
    t.portions.forEach(part=>{
      const range=part.upper===null?man(part.lower)+'超':man(part.lower)+'〜'+man(part.upper);
      const row=appendTableRow(body,[range,yen(part.used),n(part.rateBp/100)+'%',yen(part.tax)],part.used===0?'sim-zero':'');
      const bar=document.createElement('span');bar.className='sim-proportion';const inner=document.createElement('i');inner.style.width=(t.taxable?part.used/t.taxable*100:0)+'%';bar.append(inner);row.children[1].prepend(bar);
    });
    appendTableRow(body,['本体の所得税 合計','','',yen(t.tax)],'sim-total');
    el('simTaxFooter').textContent=(detailMode==='current'?'現行制度':'仮想制度')+'の内訳。給与所得は、課税対象の年間給与収入（非課税通勤手当を除く）から給与所得控除 '+yen(r.salaryDeduction)+' と所得金額調整控除 '+yen(r.incomeAdjustment)+' を引いた金額です。扶養区分：'+dependentText(input.dependents)+'。上の表は復興特別所得税を加える前。復興特別所得税 '+yen(t.reconstruction)+' を加え、合計の100円未満切捨て後 '+yen(t.annual)+' として比較しています。区間内の小数円は表では四捨五入表示し、計算は合計後に切捨てます。';
  }
  function renderIncomeTable() {
    const samples=new Set([1000000,1190000,1500000,1780000,2000000,3000000,4000000,5000000,6000000,7000000,8000000,10000000,12000000,20000000,30000000,50000000,100000000].filter(v=>v<=graphMax&&v>=P.graphMinimum(input)));
    samples.add(input.annualGross);const body=el('simIncomeTableBody');body.replaceChildren();
    [...samples].sort((a,b)=>a-b).forEach(g=>{const c=P.compare(P.atAnnual(input,g),policy);appendTableRow(body,[man(c.current.gross),yen(c.current.net),yen(c.changed.net),signed(c.delta)],g===input.annualGross?'sim-taxband-active':'',c.delta);});
  }
  function getChartData() {
    const {annualGross,monthlyGross,...common}=input;
    const key=JSON.stringify({common,policy,graphMax});
    if(key!==chartCacheKey) {
      chartData=P.sampleForInput(input,graphMax).map(x=>({gross:x.annualGross,...P.compare(x,policy)}));
      chartCacheKey=key;
    }
    return chartData;
  }
  const svgNS='http://www.w3.org/2000/svg';
  function svgNode(tag,attrs={},text=null) {const node=document.createElementNS(svgNS,tag);for(const [k,v]of Object.entries(attrs))node.setAttribute(k,v);if(text!==null)node.textContent=text;return node;}
  function niceScale(lo,hi) {
    if(lo===hi){lo-=10000;hi+=10000;}
    const raw=(hi-lo)/4,power=10**Math.floor(Math.log10(Math.max(1,raw))),f=raw/power;
    const step=(f<=1?1:f<=2?2:f<=2.5?2.5:f<=5?5:10)*power;
    return {lo:Math.floor(lo/step)*step,hi:Math.ceil(hi/step)*step,step};
  }
  function drawGraph() {
    if(!lastComparison)return;
    const svg=el('simGraph');el('simTooltip').hidden=true;
    const W=Math.max(330,Math.round(svg.getBoundingClientRect().width)||820),H=W<500?282:335;
    const left=W<500?52:64,right=20,top=28,bottom=45,x1=W-right,y1=H-bottom;
    svg.setAttribute('viewBox',`0 0 ${W} ${H}`);svg.replaceChildren();
    const title=svgNode('title',{},graphMode==='rates'?'課税所得別の所得税率の段階':graphMode==='delta'?'額面年収別の手取り増減額':'額面年収別の手取り比較');
    svg.append(title,svgNode('desc',{},'詳細な金額は下の比較表でも確認できます。現行制度を基準に仮想制度の効果を比較します。'));
    let xMin=graphMode==='rates'?0:P.graphMinimum(input),xMax=graphMax,yMin,yMax,yStep,data=[];
    if(graphMode==='rates') {yMin=0;yMax=Math.max(50,Math.ceil(Math.max(...P.CURRENT.map(b=>b.rateBp),...policy.brackets.map(b=>b.rateBp))/1000)*10);yStep=yMax>50?20:10;}
    else {
      data=getChartData();
      const vals=graphMode==='net'?data.flatMap(c=>[c.current.net,c.changed.net]):data.map(c=>c.delta);
      const scale=niceScale(Math.min(0,...vals),Math.max(0,...vals));yMin=scale.lo;yMax=scale.hi;yStep=scale.step;
    }
    if(xMax<=xMin)xMin=xMax-12;
    const sx=x=>left+(x-xMin)/(xMax-xMin)*(x1-left),sy=y=>y1-(y-yMin)/(yMax-yMin)*(y1-top);
    chartGeometry={W,H,left,top,x1,y1,xMin,xMax,yMin,yMax,sx,sy};
    const labelColor='#9aaac0',gridColor='#2b394c';
    svg.append(svgNode('text',{x:left,y:13,fill:labelColor,'font-size':10},graphMode==='rates'?'所得税率（%）':graphMode==='delta'?'手取りの差（万円）':'手取り（万円）'));
    for(let value=yMin;value<=yMax+yStep*.001;value+=yStep){
      const py=sy(value);svg.append(svgNode('line',{x1:left,y1:py,x2:x1,y2:py,stroke:gridColor,'stroke-width':1}));
      svg.append(svgNode('text',{x:left-10,y:py+4,fill:labelColor,'font-size':11,'text-anchor':'end'},graphMode==='rates'?n(value):n(value/10000)));
    }
    const xTickCount=W<500?3:6;
    const rawX=xMax/xTickCount,powerX=10**Math.floor(Math.log10(rawX));
    const stepX=([1,2,2.5,4,5,10].find(v=>v>=rawX/powerX)||10)*powerX;
    const xTicks=[];for(let value=Math.ceil(xMin/stepX)*stepX;value<=xMax;value+=stepX)xTicks.push(value);
    if(xTicks.length&&xTicks.at(-1)<xMax&&sx(xMax)-sx(xTicks.at(-1))>45)xTicks.push(xMax);
    for(const value of xTicks){
      const px=sx(value);const text=graphMode==='rates'?n(value/10000):n(Math.round(value/10000));
      svg.append(svgNode('text',{x:px,y:y1+23,fill:labelColor,'font-size':11,'text-anchor':'middle'},text));
    }
    svg.append(svgNode('text',{x:x1,y:H-3,fill:labelColor,'font-size':10,'text-anchor':'end'},graphMode==='rates'?'課税所得（万円） ※額面年収ではありません':'額面年収（万円）'));
    const linePath=points=>points.map(([x,y],i)=>(i?'L':'M')+sx(x).toFixed(2)+' '+sy(y).toFixed(2)).join(' ');
    if(graphMode==='rates') {
      function stepPoints(bs) {let lo=0,points=[];for(const b of bs){if(lo>xMax)break;const hi=b.upper===null?xMax:Math.min(b.upper,xMax);points.push([lo,b.rateBp/100],[hi,b.rateBp/100]);lo=hi;if(hi===xMax)break;}return points;}
      const custom=stepPoints(policy.brackets),current=stepPoints(P.CURRENT);
      svg.append(svgNode('path',{d:linePath(current),fill:'none',stroke:'#88aafa','stroke-width':2,'stroke-dasharray':'6 5'}));
      svg.append(svgNode('path',{d:linePath(custom),fill:'none',stroke:'#5fe0ba','stroke-width':2.5}));
      policy.brackets.forEach((b,i)=>{if(b.upper!==null&&b.upper<=xMax){
        const point=svgNode('circle',{cx:sx(b.upper),cy:sy(b.rateBp/100),r:6,fill:'#142820',stroke:'#5fe0ba','stroke-width':2,class:'sim-handle','data-bound':i});
        point.append(svgNode('title',{},'第'+(i+1)+'段階の上限 '+man(b.upper)+'。左右にドラッグして変更。'));
        svg.append(point);
      }});
      el('simGraphHint').textContent='横軸は課税所得です。緑の丸を左右にドラッグして境目を変更。各段階の数字や下のスライダーからも調整できます。';
      svg.setAttribute('aria-label','課税所得別の所得税率。境目は編集欄または緑の丸で変更できます。');
    } else if(graphMode==='net') {
      const a=data.map(c=>[c.gross,c.current.net]),b=data.map(c=>[c.gross,c.changed.net]);
      svg.append(svgNode('path',{d:linePath(b)+linePath([...a].reverse()).replace(/^M/,'L')+'Z',fill:'#5fe0ba','fill-opacity':.09,stroke:'none'}));
      svg.append(svgNode('path',{d:linePath(a),fill:'none',stroke:'#88aafa','stroke-width':2,'stroke-dasharray':'6 5','stroke-linejoin':'round'}));
      svg.append(svgNode('path',{d:linePath(b),fill:'none',stroke:'#5fe0ba','stroke-width':2.5,'stroke-linejoin':'round'}));
    } else {
      const positive=data.map(c=>[c.gross,Math.max(0,c.delta)]),negative=data.map(c=>[c.gross,Math.min(0,c.delta)]);
      const close=` L${sx(xMax)} ${sy(0)} L${sx(xMin)} ${sy(0)} Z`;
      svg.append(svgNode('path',{d:linePath(positive)+close,fill:'#5fe0ba','fill-opacity':.12}));
      svg.append(svgNode('path',{d:linePath(negative)+close,fill:'#ff9bad','fill-opacity':.12}));
      svg.append(svgNode('line',{x1:left,y1:sy(0),x2:x1,y2:sy(0),stroke:'#88aafa','stroke-width':1.5,'stroke-dasharray':'5 5'}));
      svg.append(svgNode('path',{d:linePath(positive),fill:'none',stroke:'#5fe0ba','stroke-width':2.3}));
      svg.append(svgNode('path',{d:linePath(negative),fill:'none',stroke:'#ff9bad','stroke-width':2.3}));
    }
    if(graphMode!=='rates') {
      const g=input.annualGross;
      if(g>=xMin&&g<=xMax){
        svg.append(svgNode('line',{x1:sx(g),y1:top,x2:sx(g),y2:y1,stroke:'#bed2dc','stroke-width':1,'stroke-dasharray':'3 5',opacity:.5}));
        const vals=graphMode==='net'?[[lastComparison.current.net,'#88aafa'],[lastComparison.changed.net,'#5fe0ba']]:[[lastComparison.delta,lastComparison.delta>=0?'#5fe0ba':'#ff9bad']];
        vals.forEach(([value,color])=>svg.append(svgNode('circle',{cx:sx(g),cy:sy(value),r:4.5,fill:'#12202b',stroke:color,'stroke-width':2})));
        svg.append(svgNode('text',{x:Math.min(x1-4,Math.max(left+4,sx(g))),y:top-7,fill:'#dceae7','font-size':11,'text-anchor':sx(g)>x1-45?'end':sx(g)<left+45?'start':'middle'},man(g)));
      }
      el('simGraphHint').textContent='賞与を固定し、タップした年収に合わせて月給を変更。左右キーは月給を1,000円ずつ変更。'+(g>xMax?'選択中の年収は表示範囲外です。':'細かな段差も含む概算です。');
      svg.setAttribute('aria-label',graphMode==='net'?'額面年収別の現行制度と仮想制度の手取り比較':'額面年収別の仮想制度による手取り増減額。0円が現行制度。');
    }
    el('simGraphLegendRight').textContent=graphMode==='rates'?'復興特別所得税を除く':graphMode==='delta'?'0円＝現行制度と同じ':'賞与を固定・月給を変更';
    const legend=document.querySelector('.sim-legend-series');legend.replaceChildren();
    const legendItem=(text,cls)=>{const span=document.createElement('span');span.className='sim-series-label';const line=document.createElement('i');line.className='sim-series-line '+cls;span.append(line,document.createTextNode(text));legend.append(span);return line;};
    if(graphMode==='delta'){legendItem('増加（＋）','');legendItem('減少（−）','').style.borderTopColor='#ff9bad';}
    else{legendItem('現行制度','current');legendItem('仮想制度','');}
  }
  function graphPoint(event) {
    const r=el('simGraph').getBoundingClientRect(),g=chartGeometry;
    const px=(event.clientX-r.left)/r.width*g.W,py=(event.clientY-r.top)/r.height*g.H;
    return {px,py,value:g.xMin+(px-g.left)/(g.x1-g.left)*(g.xMax-g.xMin),r};
  }
  function graphMove(e) {
    if(!allValid||!chartGeometry)return;
    const g=chartGeometry,{value,px,py,r}=graphPoint(e);
    if(dragIndex!==null) {
      e.preventDefault();didDrag=true;const i=dragIndex,lo=i===0?0:policy.brackets[i-1].upper,next=policy.brackets[i+1].upper;
      const max=next===null?P.MAX_GROSS:next-1000;
      policy.brackets[i].upper=Math.max(lo+1000,Math.min(max,Math.round(value/1000)*1000));
      selected=i;refreshEditorNumbers();update();return;
    }
    if(graphMode==='rates'||px<g.left||px>g.x1||py<g.top||py>g.y1){el('simTooltip').hidden=true;return;}
    const gross=Math.max(P.graphMinimum(input),Math.min(graphMax,Math.round(value/1000)*1000)),c=P.compare(P.atAnnual(input,gross),policy);
    const tip=el('simTooltip');tip.replaceChildren();
    const title=document.createElement('strong');title.textContent='額面年収 '+man(gross);tip.append(title);
    for(const text of ['現行：'+yen(c.current.net),'仮想：'+yen(c.changed.net),'差額：'+signed(c.delta)]){const div=document.createElement('div');div.textContent=text;tip.append(div);}
    tip.lastChild.className=tone(c.delta);tip.hidden=false;
    const tipWidth=tip.offsetWidth,left=Math.max(4,Math.min(r.width-tipWidth-4,e.clientX-r.left+12));
    tip.style.left=left+'px';tip.style.top=Math.max(0,e.clientY-r.top-tip.offsetHeight-14)+'px';
  }
  function changeGraph(mode) {
    graphMode=mode;document.querySelectorAll('[data-sim-chart]').forEach(b=>{const active=b.dataset.simChart===mode;b.setAttribute('aria-selected',active);b.tabIndex=active?0:-1;});
    el('simGraphPanel').setAttribute('aria-labelledby',document.querySelector('[data-sim-chart="'+mode+'"]').id);
    if(allValid)drawGraph();
  }
  function update() {
    syncConditions();syncEditorLabels();
    try {
      P.validateInput(input);P.validatePolicy(policy);
      const viewSignature=JSON.stringify([input,policy,graphMax]);
      if(allValid&&lastComparison&&lastViewSignature===viewSignature)return;
      lastComparison=P.compare(input,policy);allValid=true;lastViewSignature=viewSignature;
      el('simError').hidden=true;el('simEditorError').hidden=true;el('simRoot').classList.remove('sim-invalid');
      document.querySelectorAll('#simBracketRows input').forEach(e=>e.removeAttribute('aria-invalid'));
      renderSummary(lastComparison);renderComparison(lastComparison);renderTax(lastComparison);renderIncomeTable();drawGraph();
    } catch(error) {
      el('residentSchedule').hidden=true;el('residentJunePay').hidden=true;
      allValid=false;lastComparison=null;el('simError').textContent=error.message+' 正しい条件になるまで、結果の更新と保存を停止しています。';el('simError').hidden=false;el('simRoot').classList.add('sim-invalid');
      el('simTooltip').hidden=true;
      el('simEditorError').textContent=error.message;el('simEditorError').hidden=false;
      el('simFloatingDelta').textContent='入力を確認';
      el('simOptionState').textContent='入力エラー';
      el('simOptionDescription').textContent='入力内容を確認してください。正しい条件になるまで結果の更新を停止しています。';
      document.querySelectorAll('#simBracketRows .sim-bracket-row').forEach((row,i)=>{
        const b=policy.brackets[i],lo=i===0?0:policy.brackets[i-1].upper,next=policy.brackets[i+1]?.upper;
        const u=row.querySelector('[data-field=upper]'),r=row.querySelector('[data-field=rate]');
        if(u)u.setAttribute('aria-invalid',!Number.isFinite(b.upper)||b.upper<=lo||(next!==null&&next!==undefined&&b.upper>=next)||b.upper%1000!==0);
        r.setAttribute('aria-invalid',!Number.isFinite(b.rateBp)||b.rateBp<0||b.rateBp>10000);
      });
    }
    el('simSave').disabled=!allValid;el('simCSV').disabled=!allValid;el('copyButton').disabled=!allValid;
    updateUndo();
  }
  function download(contents,type,filename) {
    const blob=new Blob([contents],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
  }
  function documentForExport() {return {format:'nenshu-no-kabe',version:4,checkedAt:'2026-09-09',model:'unified-salary-bonus_2026-income-tax_fy2027-resident-tax_september-social-snapshot',input,policy,graphMax};}

  // A shortcut opens the optional editor explicitly; collapsing never resets a policy.
  document.querySelectorAll('[data-sim-open-editor]').forEach(link=>link.addEventListener('click',e=>{
    e.preventDefault();el('simEditor').open=true;
    el('simEditorSummary').focus({preventScroll:true});
    el('simEditor').scrollIntoView({block:'start'});
  }));
  Tedori.healthRates.forEach(([p])=>{const o=document.createElement('option');o.value=p;o.textContent=p;el('simPrefecture').append(o);});
  Tedori.bands.forEach(([,v])=>{const o=document.createElement('option');o.value=v;o.textContent=yen(v);el('healthStandard').append(o);if(v>=88000&&v<=650000)el('pensionStandard').append(o.cloneNode(true));});
  const reference=el('simCurrentReference');let previous=0;
  P.CURRENT.forEach(b=>{const p=document.createElement('p');p.className='sim-hint';p.textContent=(b.upper===null?man(previous)+'超':man(previous)+'〜'+man(b.upper))+'：'+n(b.rateBp/100)+'%';reference.append(p);previous=b.upper;});
  el('simConditions').addEventListener('submit',e=>e.preventDefault());
  el('simConditions').addEventListener('input',e=>{
    if(e.target.id==='monthlySlider')el('monthlyGross').value=number('monthlySlider');
    syncResidentSelection(e.target.id);readConditions();growRange();scheduleUpdate();
  });
  el('simConditions').addEventListener('change',e=>{syncResidentSelection(e.target.id);readConditions();growRange();scheduleUpdate();});
  el('bonusRows').addEventListener('click',e=>{
    const button=e.target.closest('[data-remove-bonus]');if(!button)return;
    readConditions();input.bonuses.splice(+button.dataset.removeBonus,1);input.annualGross=P.annualGross(input);renderBonusRows();growRange();update();el('addBonus').focus({preventScroll:true});
  });
  el('addBonus').addEventListener('click',()=>{
    readConditions();if(input.bonuses.length>=3)return;
    const used=new Set(input.bonuses.map(b=>b.month)),month=[6,12,3].find(m=>!used.has(m))||6;
    input.bonuses.push({month,gross:0});input.annualGross=P.annualGross(input);renderBonusRows();growRange();update();
    el('bonusRows').lastElementChild.querySelector('input').focus({preventScroll:true});
  });
  document.querySelectorAll('[data-monthly]').forEach(b=>b.addEventListener('click',()=>{readConditions();input.monthlyGross=+b.dataset.monthly;input.annualGross=P.annualGross(input);growRange();populateConditions();update();}));
  el('simResetInputs').addEventListener('click',()=>{input=P.defaultInput();graphMax=12000000;populateConditions();update();notify('給与条件を初期値に戻しました。所得税の変更設定は保持しています。');});
  el('simGraphMax').addEventListener('change',()=>{graphMax=+el('simGraphMax').value;growRange();syncConditions();update();});
  el('simBracketRows').addEventListener('input',e=>{
    const row=e.target.closest('[data-index]');if(!row||!e.target.dataset.field)return;
    const i=+row.dataset.index;selected=i;
    if(e.target.dataset.field==='upper')policy.brackets[i].upper=Math.round(e.target.valueAsNumber*10000);
    else policy.brackets[i].rateBp=Math.round(e.target.valueAsNumber*100);
    scheduleUpdate();
  });
  el('simBracketRows').addEventListener('change',commit);
  el('simBoundarySlider').addEventListener('input',()=>{policy.brackets[selected].upper=number('simBoundarySlider');refreshEditorNumbers();scheduleUpdate();});
  el('simRateSlider').addEventListener('input',()=>{policy.brackets[selected].rateBp=number('simRateSlider');refreshEditorNumbers();scheduleUpdate();});
  el('simBoundarySlider').addEventListener('change',commit);el('simRateSlider').addEventListener('change',commit);
  el('simUndo').addEventListener('click',undo);
  el('simRestore').addEventListener('click',()=>{policy=P.currentPolicy();selected=0;commit();renderEditor();syncBasic();update();notify('仮想制度を現行と同じ税率・基礎控除に戻しました。');});
  el('simExampleThreshold').addEventListener('click',()=>{policy=P.currentPolicy();policy.brackets[0].upper=3000000;selected=0;commit();renderEditor();syncBasic();update();});
  el('simExampleRate').addEventListener('click',()=>{policy=P.currentPolicy();policy.brackets.forEach(b=>b.rateBp=Math.max(0,b.rateBp-100));selected=0;commit();renderEditor();syncBasic();update();});
  el('simExampleZero').addEventListener('click',()=>{policy=P.currentPolicy();policy.brackets.unshift({upper:500000,rateBp:0});selected=0;commit();renderEditor();syncBasic();update();});
  el('simBasicMode').addEventListener('change',()=>{policy.basicMode=el('simBasicMode').value;policy.basicAmount=policy.basicMode==='flat'?1040000:0;syncBasic();commit();update();});
  el('simBasicAmount').addEventListener('input',()=>{policy.basicAmount=yenInput('simBasicAmount');scheduleUpdate();});
  el('simBasicAmount').addEventListener('change',commit);
  document.querySelectorAll('[data-sim-chart]').forEach(b=>b.addEventListener('click',()=>changeGraph(b.dataset.simChart)));
  document.querySelector('.sim-chart-modes').addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const modes=['net','delta','rates'],i=modes.indexOf(graphMode);const index=e.key==='Home'?0:e.key==='End'?2:(i+(e.key==='ArrowRight'?1:2))%3;changeGraph(modes[index]);document.querySelector('[data-sim-chart="'+modes[index]+'"]').focus();}});
  el('simGraph').addEventListener('pointermove',graphMove);
  el('simGraph').addEventListener('pointerleave',()=>{if(dragIndex===null)el('simTooltip').hidden=true;});
  el('simGraph').addEventListener('pointerdown',e=>{
    if(!allValid)return;
    didDrag=false;const handle=e.target.closest('[data-bound]');
    if(handle&&graphMode==='rates'){dragIndex=+handle.dataset.bound;selected=dragIndex;syncEditorLabels();el('simGraph').setPointerCapture(e.pointerId);e.preventDefault();}
  });
  el('simGraph').addEventListener('pointerup',e=>{if(dragIndex!==null){dragIndex=null;commit();if(el('simGraph').hasPointerCapture(e.pointerId))el('simGraph').releasePointerCapture(e.pointerId);}});
  el('simGraph').addEventListener('pointercancel',()=>{dragIndex=null;commit();});
  el('simGraph').addEventListener('click',e=>{
    if(!allValid||graphMode==='rates'||didDrag||!chartGeometry)return;const pt=graphPoint(e),g=chartGeometry;
    if(pt.px<g.left||pt.px>g.x1||pt.py<g.top||pt.py>g.y1)return;
    input=P.atAnnual(input,Math.max(P.graphMinimum(input),Math.min(graphMax,Math.round(pt.value/10000)*10000)));populateConditions();update();
  });
  el('simGraph').addEventListener('keydown',e=>{if(graphMode!=='rates'&&allValid&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();input=P.atAnnual(input,Math.max(P.graphMinimum(input),Math.min(P.MAX_GROSS,input.annualGross+(e.key==='ArrowRight'?12000:-12000))));growRange();populateConditions();update();}});
  ['Current','Changed'].forEach(name=>el('simDetail'+name).addEventListener('click',()=>{detailMode=name.toLowerCase();el('simDetailCurrent').setAttribute('aria-pressed',detailMode==='current');el('simDetailChanged').setAttribute('aria-pressed',detailMode==='changed');if(lastComparison)renderTax(lastComparison);}));
  el('simSave').addEventListener('click',()=>{if(!allValid)return;download(JSON.stringify(documentForExport(),null,2),'application/json','nenshu-no-kabe-settings.json');});
  el('simLoad').addEventListener('click',()=>el('simFile').click());
  el('simFile').addEventListener('change',async()=>{
    const file=el('simFile').files[0];if(!file)return;
    try {
      if(file.size>200000)throw new Error('設定ファイルは200KB以下にしてください。');
      const doc=P.validateDocument(JSON.parse(await file.text()));
      input=doc.input;policy=doc.policy;graphMax=doc.graphMax;selected=0;history=[P.currentPolicy()];commit();
      populateConditions();renderEditor();syncBasic();update();notify((doc.legacy?'旧設定を月給（年収÷12・1円未満切捨て）・賞与なしに変換して読み込みました。':doc.residentLegacy?'旧設定の年額・月額を別々に保持しました。月額を連動するには「通知書の年額から算出」を選んでください。':'設定を読み込みました。')+(doc.dependentLegacy?' 旧設定の扶養は0人として保持しました。':''));
    } catch(error){notify('読み込みできません：'+error.message);}
    el('simFile').value='';
  });
  el('simCSV').addEventListener('click',()=>{
    if(!allValid)return;
    const data=[...getChartData()];
    if(!data.some(c=>c.gross===input.annualGross))data.push({gross:input.annualGross,...P.compare(input,policy)});
    data.sort((a,b)=>a.gross-b.gross);
    const header=['月給（円）','賞与額面合計（円）','額面年収（円）','現行手取り（円）','仮想手取り（円）','手取り増減（円）','社会保険料年額（円）','現行所得税等（円）','仮想所得税等（円）','住民税等年額（円）','現行基礎控除（円）','仮想基礎控除（円）','現行課税所得（円）','仮想課税所得（円）','住民税年額の根拠','通常月住民税（円）','住民税月額の根拠','通知書配分6月（参考・円）','通知書配分7月〜翌5月（参考・円）','2026年の扶養区分','通常月の源泉徴収人数','2025年の扶養区分','所得税扶養控除（円）','住民税扶養控除（概算用・円）','所得金額調整控除（円）'];
    const rows=data.map(c=>[c.current.monthly.gross,c.current.bonusGross,c.gross,c.current.net,c.changed.net,c.delta,c.current.social.annual,c.current.national.annual,c.changed.national.annual,c.current.resident.annual,c.current.national.basic,c.changed.national.basic,c.current.national.taxable,c.changed.national.taxable,input.residentMode==='manual'?'通知書等の対象年度・固定年額':'2027年度予測',c.current.monthly.residentTax,monthlyResidentLabel(),input.residentMode==='manual'?P.residentInstallments(input.residentAnnual,input.residentCollectionMode).june:'',input.residentMode==='manual'?P.residentInstallments(input.residentAnnual,input.residentCollectionMode).monthly:'',dependentText(input.dependents),P.withholdingCount(input),dependentText(P.previousFamily(input)),c.current.national.dependentDeduction,P.dependentAmounts(input.dependents).resident,c.current.incomeAdjustment]);
    download('\uFEFF'+[header,...rows].map(row=>row.join(',')).join('\r\n'),'text/csv;charset=utf-8','nenshu-no-kabe-comparison.csv');
  });
  el('copyButton').addEventListener('click',async()=>{
    if(!allValid||!lastComparison)return;
    const a=lastComparison.current,b=lastComparison.changed;
    const lines=['年収の壁｜試算（2026-09-09）','月給（額面）：'+yen(input.monthlyGross),
      ...input.bonuses.map((bonus,i)=>'賞与'+(i+1)+'（'+bonus.month+'月）：'+yen(bonus.gross)),
      '額面年収：'+yen(a.gross)+'（月給×12＋賞与）','通常月の手取り：'+yen(a.monthly.net),
      '通常月の住民税：'+yen(a.monthly.residentTax)+'（'+monthlyResidentLabel()+'）',
      ...(a.monthly.residentDetail?.notice?['6月の住民税：'+yen(a.monthly.residentDetail.june),'6月の手取り（住民税差のみ）：'+yen(a.monthly.net+a.monthly.residentTax-a.monthly.residentDetail.june)]:[]),
      '年間の手取り：'+yen(a.net),'月平均：'+yen(a.net/12)+'（年間手取り÷12）',
      '加入支部：'+input.prefecture+'／年齢：'+input.age+'歳',
      '扶養（2026年）：'+dependentText(input.dependents),'通常月の源泉徴収人数：'+P.withholdingCount(input)+'人','扶養（2025年）：'+dependentText(P.previousFamily(input)),
      '所得税の年間扶養控除：'+yen(a.national.dependentDeduction),'住民税の扶養控除（概算用）：'+yen(P.dependentAmounts(input.dependents).resident),'所得金額調整控除：'+yen(a.incomeAdjustment),
      '年間社会保険料：'+yen(a.social.annual),'年間所得税等：'+yen(a.national.annual),'年間住民税等：'+yen(a.resident.annual),
      ...(hasPolicyChange()?['変更後の年間手取り：'+yen(b.net),'年間手取り増減：'+signed(lastComparison.delta)]:[]),
      '所得税は2026年分、社会保険は9月の固定料率。年間住民税は'+(input.residentMode==='manual'?'通知書等の対象年度の入力年額（2027年度の予測ではない）。':'2027年度の予測額。')+'実際の年間振込総額ではありません。'];
    const text=lines.join('\n');
    try{await navigator.clipboard.writeText(text);notify('計算条件と結果をコピーしました。');}
    catch{const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.left='-9999px';document.body.append(area);area.select();const ok=document.execCommand('copy');area.remove();notify(ok?'計算条件と結果をコピーしました。':'コピーできませんでした。ブラウザの権限を確認してください。');}
  });
  let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(allValid&&!el('policyView').hidden)drawGraph();},100);});
  createDependentFields();populateConditions();renderEditor();syncBasic();update();
})();
