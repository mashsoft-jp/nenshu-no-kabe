/* Reuse the existing form controls: no duplicate state or persistent storage. */
window.initSetupWizard = function ({validate}) {
  const el=id=>document.getElementById(id), form=el('simConditions');
  const titles=['給与・賞与','社会保険','扶養・控除','住民税','入力内容の確認'];
  const hints=['毎月の額面給与と、賞与がある場合はその金額を入力してください。','加入している保険と年齢を確認してください。','該当する項目だけ開いて入力してください。該当しなければそのまま進めます。','給与からの天引き方法と、年間に負担する住民税を確認してください。','初期値のままの項目も含め、計算に使う条件を確認してください。'];
  let active=false, step=0;
  const placements=[], panels=[];
  const nav=document.createElement('section');nav.id='setupWizard';nav.innerHTML='<p id="setupProgress" role="status"></p><h2 id="setupTitle" tabindex="-1"></h2><p id="setupHint"></p><div id="setupPanels"></div><p id="setupError" role="alert" hidden></p><div class="setup-buttons"><button type="button" id="setupBack">戻る</button><button type="button" id="setupNext">次へ</button></div><button type="button" id="setupAll" class="sim-link-button">一覧で入力する</button>';
  form.prepend(nav);
  titles.forEach((_,i)=>{const panel=document.createElement('div');panel.id='setupPanel'+i;panel.className='setup-panel';el('setupPanels').append(panel);panels.push(panel);});
  function remember(node,index){const marker=document.createComment('setup original position');node.before(marker);placements.push({node,marker,index});}
  remember(el('payType').closest('.sim-field'),0);
  remember(el('monthlyGross').closest('.sim-field'),0);
  remember(form.querySelector('.bonus-section'),0);remember(form.querySelector('.gross-total-box'),0);
  remember(el('nonTax').closest('.sim-field'),0);remember(el('otherDeduction').closest('.sim-field'),0);
  remember(el('simAge').closest('.sim-fields-two'),1);
  ['simEmployment','simSocialMode'].forEach(id=>remember(el(id).closest('.sim-field'),1));
  ['simSocialManualWrap'].forEach(id=>remember(el(id),1));
  const standardOptions=document.createElement('details');standardOptions.id='setupStandardOptions';standardOptions.className='sim-conditions';
  standardOptions.innerHTML='<summary>標準報酬月額を指定する（決定済みの場合）</summary><p class="sim-hint">通常は入力した月給から自動で概算します。実際の標準報酬月額は4〜6月の報酬などをもとに決まるため、決定通知書等で確認できる場合だけ指定してください。</p>';
  panels[1].append(standardOptions);
  remember(el('standardMode').closest('.sim-field'),1);remember(el('standardManualWrap'),1);
  ['dependentConditions','taxConditions'].forEach(id=>remember(el(id),2));
  // Withholding choice comes before the annual notice input, including separate payment.
  remember(el('monthlyResidentMode').closest('.sim-field'),3);
  remember(el('simResidentMode').closest('.sim-field'),3);
  ['simResidentManualWrap','previousWrap','monthlyResidentManualWrap'].forEach(id=>remember(el(id),3));
  const launch=document.createElement('button');launch.type='button';launch.id='setupLaunch';launch.textContent='ステップ式で入力';el('simResetInputs').before(launch);
  function summary(){
    panels[4].replaceChildren();
    const list=document.createElement('dl');list.className='setup-review';
    const value=id=>{const c=el(id);return c.tagName==='SELECT'?c.selectedOptions[0]?.textContent:c.value;};
    const rows=[['報酬の区分',value('payType')],['月給（額面）',Number(value('monthlyGross')).toLocaleString('ja-JP')+'円'],['賞与',el('bonusRows').children.length+'件'],['額面年収',el('derivedAnnualGross').textContent],['勤務先の所在地',value('simPrefecture')],['年齢',value('simAge')+'歳'],['雇用保険',value('simEmployment')],['標準報酬月額',value('standardMode')],['扶養親族',el('dependentSummary').textContent],['配偶者控除の資格',value('tax_spouseEligible')],['通常月の住民税',value('monthlyResidentMode')],['年間の住民税',value('simResidentMode')]];
    if(value('simResidentAnnual')&&el('simResidentMode').value==='manual')rows.push(['住民税の年額',Number(value('simResidentAnnual')).toLocaleString('ja-JP')+'円']);
    rows.forEach(([label,text])=>{const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=text;row.append(dt,dd);list.append(row);});panels[4].append(list);
    const note=document.createElement('p');note.className='sim-hint';note.textContent='その他の控除・詳細条件も入力した値を使います。入力は自動保存されません。設定を残すには「設定を保存」を使ってください。';panels[4].append(note);
  }
  function show(focus=true){
    panels.forEach((p,i)=>p.hidden=i!==step);el('setupProgress').textContent=(step+1)+' / '+titles.length;
    el('setupTitle').textContent=titles[step];el('setupHint').textContent=hints[step];el('setupBack').disabled=step===0;
    el('setupNext').textContent=step===4?'手取りを表示':'次へ';el('setupError').hidden=true;
    if(step===4)summary();if(focus){el('setupTitle').focus();nav.scrollIntoView({block:'start'});}
  }
  function enter(){active=true;step=0;document.body.classList.add('setup-active');nav.hidden=false;launch.hidden=true;
    placements.forEach(({node,index})=>panels[index].append(node));standardOptions.append(el('standardMode').closest('.sim-field'),el('standardManualWrap'));panels[1].append(standardOptions);standardOptions.open=el('standardMode').value==='manual';show(false);
  }
  function leave(result=false){active=false;placements.forEach(({node,marker})=>marker.after(node));nav.hidden=true;launch.hidden=false;document.body.classList.remove('setup-active');
    window.dispatchEvent(new Event('resize'));
    const target=result?document.querySelector('#simResults h2'):launch;if(result)target.tabIndex=-1;target.focus();target.scrollIntoView({block:'start'});
  }
  function next(){
    const valid=validate();
    const invalid=[...panels[step].querySelectorAll('input,select')].find(c=>!c.checkValidity()||(c.type==='number'&&c.value===''));
    // Other steps may contain unfinished values after Back. Allow reaching them
    // again; require the entire model to be valid only before showing results.
    if(invalid||(!valid&&step===4)){
      el('setupError').textContent=valid?'入力内容を確認してください。':el('simError').textContent;el('setupError').hidden=false;
      if(invalid){for(let p=invalid.parentElement;p&&p!==panels[step];p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;invalid.focus();}return;
    }
    if(step===4)leave(true);else{step++;show();}
  }
  el('setupNext').addEventListener('click',next);el('setupBack').addEventListener('click',()=>{step--;show();});el('setupAll').addEventListener('click',()=>leave());launch.addEventListener('click',()=>{enter();show();});
  form.addEventListener('keydown',e=>{if(active&&e.key==='Enter'&&e.target.tagName==='INPUT'&&e.target.type!=='file'){e.preventDefault();next();}});
  form.addEventListener('input',()=>{if(active)el('setupError').hidden=true;});
  form.addEventListener('settingsloaded',()=>{if(active){standardOptions.open=el('standardMode').value==='manual';step=0;show(false);}});
  enter();
};
