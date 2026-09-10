#!/usr/bin/env python3
"""Browser regression tests for the single-page monthly/annual model.
Install Playwright separately and provide Chromium (CHROMIUM_PATH optional).
This test uses set_content; no web server, network or personal data is required.
"""
import json, os, shutil
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parent
HTML=(ROOT/'index.html').read_text(encoding='utf-8')
checks=0

def check(value, label):
    global checks
    assert value, label
    checks+=1

def clean(page,label):
    check(not page.evaluate('document.documentElement.scrollWidth > innerWidth'),label+' page horizontal overflow')
    check(page.evaluate('''() => [...document.querySelectorAll('.item-detail')].filter(e=>e.getClientRects().length).every(e=>e.scrollWidth<=e.clientWidth+2)'''),label+' detail overflow')

def yen(text): return int(''.join(c for c in text if c.isdigit()))

def derived_check(page):
    monthly=int(page.locator('#monthlyGross').input_value())
    bonuses=sum(int(v or 0) for v in page.locator('[data-bonus-field="gross"]').evaluate_all('(els)=>els.map(e=>e.value)'))
    check(yen(page.locator('#derivedAnnualGross').inner_text())==monthly*12+bonuses,'single derived annual income')

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'),headless=True,args=['--no-sandbox'])
    for width in [1440,1024,768,390,320]:
        print('Testing viewport',width,flush=True)
        page=browser.new_page(viewport={'width':width,'height':1100},accept_downloads=True)
        page.emulate_media(reduced_motion='reduce');page.set_default_timeout(8000)
        errors=[];requests=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('request',lambda r:requests.append(r.url))
        page.set_content(HTML)
        page.locator('#setupAll').click()
        expect(page).to_have_title('年収の壁')
        expect(page.locator('#monthlyNet')).to_have_text('383,080円')
        expect(page.locator('#simCurrentNet')).to_have_text('4,662,100円')
        check(page.locator('#navMonthly,#navPolicy,#monthlyView').count()==0,'obsolete page tabs removed')
        check(page.locator('form').count()==1,'one shared form')
        check(not page.locator('#simEditor').evaluate('(e)=>e.open'),'tax option closed')
        expect(page.locator('#simPolicyComparison')).to_be_hidden()
        expect(page.locator('#bonusEmpty')).to_be_visible();clean(page,'initial')
        page.locator('#monthlyGross').fill('300000')
        expect(page.locator('#derivedAnnualGross')).to_have_text('3,600,000円')
        page.locator('#addBonus').click();page.locator('[data-bonus-field="gross"]').nth(0).fill('300000')
        page.locator('#addBonus').click();page.locator('[data-bonus-field="gross"]').nth(1).fill('300000')
        expect(page.locator('#derivedAnnualGross')).to_have_text('4,200,000円')
        expect(page.locator('#simCurrentNet')).to_have_text('3,328,920円')
        expect(page.locator('#monthlyNet')).to_have_text('233,790円');derived_check(page)
        check(page.locator('[data-bonus-field="month"]').evaluate_all('(es)=>es.map(e=>e.value)')==['6','12'],'default bonus month choices')
        page.locator('#annual-button-health').click()
        expect(page.locator('#annual-detail-health')).to_contain_text('月額 14,775円 × 12 ＋ 賞与分 29,550円 ＝ 206,850円')
        expect(page.locator('#annual-detail-health')).to_contain_text('6月：標準賞与額 300,000円')
        page.locator('#simPrefecture').select_option('埼玉県');page.locator('#monthlyGross').fill('600000')
        expect(page.locator('#annual-detail-health')).to_contain_text('590,000円 × 9.67% ÷ 2（埼玉県支部）')
        expect(page.locator('#annual-button-health')).to_have_attribute('aria-expanded','true')
        page.locator('#annual-button-care').click();expect(page.locator('#annual-detail-care')).to_contain_text('40歳未満')
        page.locator('#simAge').fill('45');expect(page.locator('#annual-detail-care')).to_contain_text('590,000円 × 1.62% ÷ 2')
        check(page.locator('.sim-detail-row:not([hidden])').count()==2,'multiple details remain open');clean(page,'bonus detail')
        page.locator('#annual-button-incomeTax').click();expect(page.locator('#monthlyTaxDetail')).to_contain_text('通常月（現行）')
        clean(page,'tax detail')
        page.locator('#annual-button-incomeTax').click();page.locator('#annual-button-health').click();page.locator('#annual-button-care').click()
        monthly_before=page.locator('#monthlyNet').inner_text()
        page.locator('#simEditorSummary').click();page.locator('#simExampleThreshold').click()
        expect(page.locator('#simPolicyComparison')).to_be_visible();expect(page.locator('#simOptionState')).to_have_text('変更中')
        expect(page.locator('#monthlyNet')).to_have_text(monthly_before)
        check(yen(page.locator('#simDelta').inner_text())>0,'hypothetical annual difference')
        page.locator('#simEditorSummary').click();expect(page.locator('#simPolicyComparison')).to_be_visible();clean(page,'policy collapsed')
        # Saved output must contain the shared month, bonus rows and versioned schema.
        with page.expect_download() as dl:
            page.locator('#simSave').click()
        saved=json.loads(Path(dl.value.path()).read_text())
        check(saved['format']=='nenshu-no-kabe' and saved['version']==7,'v5 settings schema')
        check(saved['input']['monthlyGross']==600000 and len(saved['input']['bonuses'])==2,'settings include bonuses')
        # Count limit and prior fiscal cap UI.
        page.locator('#addBonus').click();expect(page.locator('#addBonus')).to_be_disabled();expect(page.locator('#priorBonusWrap')).to_be_visible()
        page.locator('[data-bonus-field="gross"]').nth(2).fill('1000000');page.locator('#priorBonusStandard').fill('5700000')
        page.locator('#annual-button-health').click();expect(page.locator('#annual-detail-health')).to_contain_text('3月：標準賞与額 30,000円')
        page.locator('[data-remove-bonus="2"]').click();expect(page.locator('#addBonus')).to_be_enabled();expect(page.locator('#priorBonusWrap')).to_be_hidden();derived_check(page)
        # Input validation, no stale saving.
        page.locator('[data-bonus-field="gross"]').nth(0).fill('-1');expect(page.locator('#simError')).to_be_visible();expect(page.locator('#simSave')).to_be_disabled();expect(page.locator('#copyButton')).to_be_disabled()
        page.locator('[data-bonus-field="gross"]').nth(0).fill('300000');expect(page.locator('#simError')).to_be_hidden();expect(page.locator('#simSave')).to_be_enabled()
        page.locator('#monthlyGross').fill('');expect(page.locator('#simError')).to_be_visible();page.locator('#monthlyGross').fill('600000');expect(page.locator('#simError')).to_be_hidden()
        # Manual standards, annual-only insurance override and notice amounts.
        page.locator('#advancedConditions>summary').click()
        page.locator('#standardMode').select_option('manual');page.locator('#healthStandard').select_option('300000');page.locator('#pensionStandard').select_option('300000')
        expect(page.locator('#annual-detail-health')).to_contain_text('300,000円 × 9.67% ÷ 2')
        page.locator('#simSocialMode').select_option('manual');page.locator('#simSocialAnnual').fill('1000000')
        expect(page.locator('#annual-button-social')).to_be_visible()
        page.locator('#monthlyResidentMode').select_option('manual');page.locator('#residentMonthly').fill('12000')
        page.locator('#simResidentMode').select_option('manual');page.locator('#simResidentAnnual').fill('100000')
        page.locator('#annual-button-residentTax').click();expect(page.locator('#annual-detail-residentTax')).to_contain_text('通常月（通知書の指定月額）：12,000円');expect(page.locator('#annual-detail-residentTax')).to_contain_text('年間手取りに使う住民税：100,000円')
        clean(page,'manual overrides')
        # Import saved state and legacy annual state.
        page.locator('#simFile').set_input_files({'name':'settings.json','mimeType':'application/json','buffer':json.dumps(saved).encode()})
        expect(page.locator('#simSocialMode')).to_have_value('auto');expect(page.locator('#monthlyGross')).to_have_value('600000');check(page.locator('[data-bonus-row]').count()==2,'v3 reload bonuses')
        legacy={'format':'tedori-policy','version':1,'input':{'annualGross':4000000,'age':30,'prefecture':'東京都','employment':50,'socialMode':'auto','socialAnnual':881400,'residentMode':'estimate','residentAnnual':307200},'policy':saved['policy'],'graphMax':12000000}
        page.locator('#simFile').set_input_files({'name':'old.json','mimeType':'application/json','buffer':json.dumps(legacy).encode()})
        expect(page.locator('#monthlyGross')).to_have_value('333333');expect(page.locator('#derivedAnnualGross')).to_have_text('3,999,996円');check(page.locator('[data-bonus-row]').count()==0,'legacy no-bonus input')
        # Graph keyboard operates on shared salary, not a hidden independent annual input.
        page.locator('#simGraph').focus();page.keyboard.press('ArrowRight');expect(page.locator('#monthlyGross')).to_have_value('334333');derived_check(page)
        check(not errors,'no JS errors: '+str(errors));check(not requests,'no network requests: '+str(requests))
        clean(page,'final');page.close()
    browser.close()
print(f'PASS {checks} browser checks + Playwright assertions (5 viewport widths)')
