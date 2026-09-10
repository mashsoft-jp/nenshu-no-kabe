#!/usr/bin/env python3
"""扶養条件のUI回帰。合成データのみ。ビルド後に実行。"""
import json, os, shutil
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parent
checks=0

def check(value,label):
    global checks
    assert value,label
    checks+=1

def save(page):
    with page.expect_download() as dl: page.locator('#simSave').click()
    return json.loads(Path(dl.value.path()).read_text())

def load(page,doc):
    page.locator('#simFile').set_input_files({'name':'synthetic.json','mimeType':'application/json','buffer':json.dumps(doc).encode()})

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'),headless=True,args=['--no-sandbox'])
    for width in [1440,1024,768,390,320]:
        print('Dependent viewport',width,flush=True)
        page=browser.new_page(viewport={'width':width,'height':1100},accept_downloads=True)
        page.emulate_media(reduced_motion='reduce');page.set_default_timeout(8000)
        errors=[];requests=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('request',lambda r:requests.append(r.url))
        page.set_content((ROOT/'index.html').read_text())
        page.locator('#setupAll').click()
        initial=save(page)
        page.locator('#dependentConditions>summary').focus();page.keyboard.press('Enter')
        expect(page.locator('#dependent_young')).to_be_visible()
        page.locator('#monthlyGross').fill('400000')
        page.locator('#dependent_young').fill('1')
        expect(page.locator('#dependentSummary')).to_have_text('1人')
        expect(page.locator('#dependentDeductionHint')).to_contain_text('所得税 380,000円／住民税 330,000円')
        page.locator('#annual-button-incomeTax').click();page.locator('#annual-button-health').click()
        expect(page.locator('#monthlyTaxDetail')).to_contain_text('所得税等 7,920円')
        expect(page.locator('#monthlyTaxDetail')).to_contain_text('扶養1人（控除 31,667円）')
        page.locator('#advancedConditions>summary').click()
        page.locator('#simSocialMode').select_option('manual');page.locator('#simSocialAnnual').fill('600000');page.locator('#annual-button-social').click()
        expect(page.locator('#simTaxFooter')).to_contain_text('70,400円')
        page.locator('#annual-button-residentTax').click()
        expect(page.locator('#annual-detail-residentTax')).to_contain_text('扶養控除 330,000円')
        expect(page.locator('#annual-detail-residentTax')).to_contain_text('206,000円')
        before=page.locator('#simTaxFooter').inner_text()
        page.locator('#withholdingDependentMode').select_option('manual');page.locator('#withholdingDependents').fill('0')
        expect(page.locator('#monthlyTaxDetail')).to_contain_text('扶養0人')
        expect(page.locator('#simTaxFooter')).to_have_text(before)
        page.locator('#withholdingDependentMode').select_option('same')
        page.locator('#previousDependentConditions>summary').click();page.locator('#previousDependentMode').select_option('manual')
        page.locator('#previousDependent_specific').fill('1')
        expect(page.locator('#annual-detail-residentTax')).to_contain_text('扶養控除 450,000円')
        expect(page.locator('#simTaxFooter')).to_have_text(before)
        page.locator('#monthlyResidentMode').select_option('manual');page.locator('#residentMonthly').fill('0')
        page.locator('#dependent_young').fill('2')
        expect(page.locator('#annual-button-incomeTax')).to_have_attribute('aria-expanded','true')
        expect(page.locator('#annual-button-social')).to_have_attribute('aria-expanded','true')
        expect(page.locator('#residentMonthly')).to_have_value('0')
        page.locator('#dependent_young').fill('1')
        # Policy changes share family assumptions and do not alter monthly withholding.
        page.locator('#simEditorSummary').click();page.locator('#simExampleThreshold').click()
        expect(page.locator('#monthlyTaxDetail')).to_contain_text('所得税等 7,920円')
        saved=save(page);check(saved['version']==7,'v5 saved')
        check(saved['input']['dependents']['young']==1,'current family saved')
        check(saved['input']['previousDependents']['specific']==1,'previous family saved')
        page.locator('#dependent_young').fill('0');load(page,saved)
        expect(page.locator('#dependent_young')).to_have_value('1')
        for value in ['', '-1','1.5','11']:
            page.locator('#dependent_young').fill(value)
            expect(page.locator('#simError')).to_be_visible()
            for selector in ['#simSave','#simCSV','#copyButton']: expect(page.locator(selector)).to_be_disabled()
        page.locator('#dependent_young').fill('1');expect(page.locator('#simError')).to_be_hidden()
        page.locator('#dependent_adult').fill('10');expect(page.locator('#simError')).to_be_visible()
        page.locator('#dependent_adult').fill('0');expect(page.locator('#simError')).to_be_hidden()
        page.locator('#simIncomeTableDetails>summary').click()
        with page.expect_download() as dl: page.locator('#simCSV').click()
        csv=Path(dl.value.path()).read_text();check('所得税扶養控除（円）' in csv and '16〜18歳:1人' in csv,'CSV family basis')
        page.evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copied=text}}})")
        page.locator('#copyButton').click()
        check('通常月の源泉徴収人数：1人' in page.evaluate('window.copied'),'copy family')
        check(not page.evaluate('document.documentElement.scrollWidth>innerWidth'),'no horizontal overflow')
        check(page.evaluate("[...document.querySelectorAll('.item-detail')].filter(e=>e.getClientRects().length).every(e=>e.scrollWidth<=e.clientWidth+2)"),'details fit')
        # Current-year high-income child adjustment is visible in the existing tax detail.
        page.locator('#monthlyGross').fill('900000')
        expect(page.locator('#simTaxFooter')).to_contain_text('所得金額調整控除 150,000円')
        old=json.loads(json.dumps(initial));old['version']=3
        for key in ['dependents','previousDependents','previousDependentMode','withholdingDependentMode','withholdingDependents']:old['input'].pop(key)
        load(page,old);expect(page.locator('#dependent_young')).to_have_value('0')
        expect(page.locator('#toast')).to_contain_text('扶養は0人')
        expect(page.locator('#monthlyNet')).to_have_text('383,080円')
        # A v5 document missing new conditions is rejected without changing the current input.
        broken=json.loads(json.dumps(saved));broken['input'].pop('dependents');load(page,broken)
        expect(page.locator('#toast')).to_contain_text('読み込みできません')
        expect(page.locator('#dependent_young')).to_have_value('0')
        check(not errors,'no JS errors');check(not requests,'no external requests')
        page.close()
    browser.close()
print(f'PASS {checks} dependent browser checks + Playwright assertions (5 viewport widths)')
