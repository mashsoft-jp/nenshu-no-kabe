#!/usr/bin/env python3
"""追加控除の画面・保存・入力エラー。個人情報を使わない合成ケース。"""
import csv, io, json, os, shutil
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parent
checks=0

def check(v,label):
    global checks
    assert v,label
    checks+=1

def save(page):
    with page.expect_download() as dl:page.locator('#simSave').click()
    return json.loads(Path(dl.value.path()).read_text())

def load(page,doc):
    page.locator('#simFile').set_input_files({'name':'synthetic.json','mimeType':'application/json','buffer':json.dumps(doc).encode()})

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'),headless=True,args=['--no-sandbox'])
    for width in [1440,1024,768,390,320]:
        print('Deduction viewport',width,flush=True)
        page=browser.new_page(viewport={'width':width,'height':1100},accept_downloads=True)
        page.set_default_timeout(12000);page.emulate_media(reduced_motion='reduce')
        errors=[];requests=[]
        page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url))
        page.set_content((ROOT/'index.html').read_text())
        page.locator('#setupAll').click()
        initial=save(page)
        page.locator('#taxConditions>summary').focus();page.keyboard.press('Enter')
        page.locator('#taxFields .tax-group>summary').nth(0).click()
        page.locator('#monthlyGross').fill('400000')
        page.locator('#tax_spouseEligible').select_option('true')
        page.locator('#advancedConditions>summary').click();page.locator('#simSocialMode').select_option('manual');page.locator('#simSocialAnnual').fill('600000')
        page.locator('#annual-button-incomeTax').click();page.locator('#annual-button-residentTax').click()
        expect(page.locator('#simTaxFooter')).to_contain_text('配偶者控除 380,000円')
        expect(page.locator('#simTaxFooter')).to_contain_text('70,400円')
        expect(page.locator('#monthlyTaxDetail')).to_contain_text('所得税等 7,920円')
        expect(page.locator('#annual-detail-residentTax')).to_contain_text('206,000円')
        page.locator('#tax_spouseIncome').fill('1000000')
        expect(page.locator('#simTaxFooter')).to_contain_text('配偶者特別控除 360,000円')
        expect(page.locator('#monthlyTaxDetail')).to_contain_text('扶養0人')
        page.locator('#tax_spouseIncome').fill('0')
        page.locator('#taxFields .tax-group>summary').nth(3).click()
        page.locator('#tax_smallEnterprise').fill('240000')
        expect(page.locator('#simTaxFooter')).to_contain_text('小規模企業共済等掛金控除（iDeCo等） 240,000円')
        expect(page.locator('#simTaxFooter')).to_contain_text('58,100円')
        expect(page.locator('#monthlyTaxDetail')).to_contain_text('所得税等 7,920円')
        page.locator('#taxFields .tax-group>summary').nth(4).click()
        page.locator('#tax_nationalCredit').fill('10000')
        expect(page.locator('#simTaxFooter')).to_contain_text('税額控除 10,000円')
        expect(page.locator('#simTaxFooter')).to_contain_text('47,900円')
        page.locator('#tax_wardCredit').fill('1000')
        page.locator('#monthlyResidentMode').select_option('manual');page.locator('#residentMonthly').fill('0')
        page.locator('#previousTaxConditions>summary').click();page.locator('#previousTaxMode').select_option('manual')
        page.locator('#previousTaxFields .tax-group>summary').nth(0).click()
        page.locator('#previousTax_spouseEligible').select_option('true');page.locator('#previousTax_spouseElderly').select_option('true')
        page.locator('#monthlyResidentMode').select_option('previous')
        expect(page.locator('#annual-detail-residentTax')).to_contain_text('老人配偶者控除 380,000円')
        expect(page.locator('#simTaxFooter')).to_contain_text('47,900円')
        page.locator('#tax_metroOneStopCredit').fill('500')
        expect(page.locator('#annual-detail-residentTax')).to_contain_text('ワンストップ申告特例分（区／都）：0円／500円')
        saved=save(page);check(saved['version']==6,'v5 saved');check(saved['input']['taxConditions']['smallEnterprise']==240000,'amount saved')
        page.locator('#tax_smallEnterprise').fill('0');load(page,saved)
        expect(page.locator('#tax_smallEnterprise')).to_have_value('240000')
        expect(page.locator('#annual-button-incomeTax')).to_have_attribute('aria-expanded','true')
        expect(page.locator('#annual-button-residentTax')).to_have_attribute('aria-expanded','true')
        for invalid in ['','-1','1.5','120001']:
            page.locator('#tax_lifeNational').fill(invalid)
            expect(page.locator('#simError')).to_be_visible()
            for selector in ['#simSave','#simCSV','#copyButton']:expect(page.locator(selector)).to_be_disabled()
        page.locator('#tax_lifeNational').fill('0');expect(page.locator('#simError')).to_be_hidden()
        page.locator('#taxFields .tax-group>summary').nth(2).click()
        page.locator('#tax_specialIncomes').fill('900000;1100000')
        expect(page.locator('#simTaxFooter')).to_contain_text('特定親族特別控除 820,000円')
        for invalid in ['600000','1230001','900000;','abc','900000,1100000']:
            page.locator('#tax_specialIncomes').fill(invalid);expect(page.locator('#simError')).to_be_visible()
        page.locator('#tax_specialIncomes').fill('');expect(page.locator('#simError')).to_be_hidden()
        page.locator('#taxFields .tax-group>summary').nth(1).click()
        page.locator('#tax_parent').select_option('father');expect(page.locator('#simError')).to_be_visible()
        page.locator('#tax_parent').select_option('none');expect(page.locator('#simError')).to_be_hidden()
        page.locator('#tax_disabledGeneral').fill('1');expect(page.locator('#simError')).to_be_visible()
        page.locator('#tax_disabledGeneral').fill('0');expect(page.locator('#simError')).to_be_hidden()
        page.locator('#tax_selfDisability').select_option('general')
        expect(page.locator('#simTaxFooter')).to_contain_text('本人の障害者控除 270,000円')
        page.locator('#tax_selfDisability').select_option('none')
        expect(page.locator('#monthlyTaxDetail')).to_contain_text('扶養1人')
        page.locator('#taxFields .tax-group>summary').nth(1).click()
        page.locator('#simIncomeTableDetails>summary').click()
        with page.expect_download() as dl:page.locator('#simCSV').click()
        rows=list(csv.reader(io.StringIO(Path(dl.value.path()).read_text(encoding='utf-8-sig'))))
        check(all(len(row)==len(rows[0]) for row in rows),'CSV columns remain aligned')
        check('追加所得控除・所得税（円）' in rows[0],'CSV includes amounts')
        check(any('iDeCo等' in cell for cell in rows[1]),'CSV includes conditions')
        page.evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copied=text}}})")
        page.locator('#copyButton').click();check('所得税の適用税額控除：10,000円' in page.evaluate('window.copied'),'copy credit')
        check(not page.evaluate('document.documentElement.scrollWidth>innerWidth'),'no horizontal overflow')
        if width in [1440,390]:page.locator('#taxConditions').screenshot(path=f'/tmp/deductions-{width}.png')
        old=json.loads(json.dumps(initial));old['version']=4
        for key in ['taxConditions','previousTaxConditions','previousTaxMode']:old['input'].pop(key)
        load(page,old);expect(page.locator('#tax_spouseEligible')).to_have_value('false');expect(page.locator('#toast')).to_contain_text('追加控除はなし')
        broken=json.loads(json.dumps(saved));broken['input']['taxConditions'].pop('spouseIncome');load(page,broken)
        expect(page.locator('#toast')).to_contain_text('読み込みできません');expect(page.locator('#tax_spouseEligible')).to_have_value('false')
        check(not errors,'no JS errors');check(not requests,'no external requests')
        page.close()
    browser.close()
print(f'PASS {checks} additional deduction browser checks + Playwright assertions (5 widths)')
