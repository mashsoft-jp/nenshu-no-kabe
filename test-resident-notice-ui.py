#!/usr/bin/env python3
"""Resident notice integration regression. Build first; synthetic input only.
Uses Playwright set_content, not a live Pages URL. CHROMIUM_PATH is optional.
"""
import csv
import io
import json
import os
import shutil
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parent
HTML = (ROOT / 'index.html').read_text(encoding='utf-8')
checks = 0

def check(value, label):
    global checks
    assert value, label
    checks += 1

def saved(page):
    with page.expect_download() as download:
        page.locator('#simSave').click()
    return json.loads(Path(download.value.path()).read_text(encoding='utf-8'))

def load(page, doc):
    page.locator('#simFile').set_input_files({
        'name': 'synthetic.json', 'mimeType': 'application/json',
        'buffer': json.dumps(doc).encode('utf-8')})

with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'),
        headless=True, args=['--no-sandbox'])
    for width in [1440, 1024, 768, 390, 320]:
        print('Resident notice viewport', width, flush=True)
        page = browser.new_page(viewport={'width': width, 'height': 1000}, accept_downloads=True)
        errors, requests = [], []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('request', lambda request: requests.append(request.url))
        page.set_default_timeout(8000)
        page.emulate_media(reduced_motion='reduce')
        page.set_content(HTML)
        expect(page.locator('#monthlyNet')).to_have_text('383,080円')
        expect(page.locator('#residentJunePay')).to_be_hidden()
        initial = saved(page)
        page.locator('#advancedConditions>summary').click()
        page.locator('#simResidentMode').select_option('manual')
        expect(page.locator('#monthlyResidentMode')).to_have_value('annual')
        page.locator('#simResidentAnnual').fill('240500')
        expect(page.locator('#residentJune')).to_have_text('20,500円')
        expect(page.locator('#residentRegular')).to_have_text('20,000円')
        expect(page.locator('#residentScheduleTotal')).to_have_text('20,500円 ＋ 20,000円 × 11 ＝ 240,500円')
        expect(page.locator('#monthlyNet')).to_have_text('388,680円')
        expect(page.locator('#residentJuneNet')).to_have_text('388,180円')
        expect(page.locator('#simCurrentNet')).to_have_text('4,728,800円')
        expect(page.locator('#monthlyPayHeading')).to_have_text('通常月（7月〜翌5月）')
        expect(page.locator('#residentSummaryNote')).to_contain_text('翌年度の住民税予測ではありません')
        page.locator('#annual-button-residentTax').click()
        details = page.locator('#annual-detail-residentTax')
        expect(details).to_contain_text('100円未満切捨て ＝ 20,000円')
        expect(details).to_contain_text('240,500円 − 20,000円 × 11 ＝ 20,500円')
        check('2025年給与収入' not in details.inner_text(), 'notice is not estimated tax')
        page.locator('#simResidentAnnual').fill('241700')
        expect(page.locator('#residentJune')).to_have_text('20,600円')
        expect(page.locator('#residentRegular')).to_have_text('20,100円')
        expect(page.locator('#monthlyNet')).to_have_text('388,580円')
        expect(page.locator('#residentJuneNet')).to_have_text('388,080円')
        expect(page.locator('#annual-button-residentTax')).to_have_attribute('aria-expanded','true')
        expect(details).to_contain_text('241,700円 − 20,100円 × 11 ＝ 20,600円')
        # No stale allocation or exports while the amount is invalid.
        for value in ['', '-1', '50000001', '1.5']:
            page.locator('#simResidentAnnual').fill(value)
            expect(page.locator('#simError')).to_be_visible()
            expect(page.locator('#residentSchedule')).to_be_hidden()
            expect(page.locator('#residentJunePay')).to_be_hidden()
            expect(page.locator('#simSave')).to_be_disabled()
            expect(page.locator('#simCSV')).to_be_disabled()
            page.locator('#simResidentAnnual').fill('241700')
            expect(page.locator('#simError')).to_be_hidden()
            expect(page.locator('#residentSchedule')).to_be_visible()
        # Notice controls zero and small-tax June-only cases, not inferred locale.
        page.locator('#simResidentAnnual').fill('0')
        expect(page.locator('#residentRegular')).to_have_text('0円')
        expect(page.locator('#residentJune')).to_have_text('0円')
        page.locator('#simResidentAnnual').fill('5000')
        page.locator('#residentCollectionMode').select_option('june')
        expect(page.locator('#residentRegular')).to_have_text('0円')
        expect(page.locator('#residentJune')).to_have_text('5,000円')
        june_saved = saved(page)
        check(june_saved['version']==4 and june_saved['input']['residentCollectionMode']=='june','v4 includes collection choice')
        page.locator('#residentCollectionMode').select_option('split')
        load(page,june_saved)
        expect(page.locator('#residentCollectionMode')).to_have_value('june')
        expect(page.locator('#residentRegular')).to_have_text('0円')
        # Explicit notice month is authoritative even on annual edit or mode toggle.
        page.locator('#monthlyResidentMode').select_option('manual')
        page.locator('#residentMonthly').fill('12345')
        page.locator('#simResidentAnnual').fill('240500')
        expect(page.locator('#monthlyResidentMode')).to_have_value('manual')
        expect(details).to_contain_text('通常月（通知書の指定月額）：12,345円')
        expect(page.locator('#residentJunePay')).to_be_hidden()
        expect(page.locator('#residentScheduleUse')).to_contain_text('指定した月額を優先')
        page.locator('#simResidentMode').select_option('estimate')
        page.locator('#simResidentMode').select_option('manual')
        expect(page.locator('#residentMonthly')).to_have_value('12345')
        expect(page.locator('#monthlyResidentMode')).to_have_value('manual')
        # Explicit opt-in to linking; forecast restores its own monthly estimate.
        page.locator('#residentCollectionMode').select_option('split')
        page.locator('#monthlyResidentMode').select_option('annual')
        expect(page.locator('#monthlyNet')).to_have_text('388,680円')
        page.locator('#simResidentMode').select_option('estimate')
        expect(page.locator('#monthlyResidentMode')).to_have_value('estimate')
        expect(page.locator('#residentSchedule')).to_be_hidden()
        expect(page.locator('#residentJunePay')).to_be_hidden()
        expect(page.locator('#monthlyNet')).to_have_text('383,080円')
        expect(page.locator('#simCurrentNet')).to_have_text('4,662,100円')
        expect(page.locator('#residentSummaryNote')).to_contain_text('2027年度の住民税予測額')
        # v2 annual/monthly independence is not silently changed at import.
        legacy = json.loads(json.dumps(initial))
        legacy['version']=2
        legacy['input'].pop('residentCollectionMode')
        legacy['input'].update(residentMode='manual',residentAnnual=240500,monthlyResidentMode='estimate')
        load(page,legacy)
        expect(page.locator('#monthlyNet')).to_have_text('383,080円')
        expect(page.locator('#monthlyResidentMode')).to_have_value('estimate')
        expect(page.locator('#residentScheduleUse')).to_contain_text('別の概算設定')
        expect(page.locator('#toast')).to_contain_text('年額・月額を別々に保持')
        page.locator('#monthlyResidentMode').select_option('annual')
        expect(page.locator('#monthlyNet')).to_have_text('388,680円')
        linked_saved = saved(page)
        load(page,initial)
        load(page,linked_saved)
        expect(page.locator('#monthlyResidentMode')).to_have_value('annual')
        expect(page.locator('#monthlyNet')).to_have_text('388,680円')
        # CSV and copy include the monthly source, not just a FY2027 label.
        page.locator('#simIncomeTableDetails>summary').click()
        with page.expect_download() as download:
            page.locator('#simCSV').click()
        rows=list(csv.reader(io.StringIO(Path(download.value.path()).read_text(encoding='utf-8-sig'))))
        idx=rows[0].index('通常月住民税（円）')
        check(all(row[idx]=='20000' and row[idx+2]=='20500' and row[idx+3]=='20000' for row in rows[1:]), 'CSV fixed notice and allocation')
        page.evaluate("""() => Object.defineProperty(navigator, 'clipboard', {configurable:true,
            value:{writeText: async text => {window.__copied=text;}}})""")
        page.locator('#copyButton').click()
        page.wait_for_function('typeof window.__copied === "string"')
        text=page.evaluate('window.__copied')
        check('6月の住民税：20,500円' in text and '通知書の対象年度・7月〜翌5月' in text,'copy contains period and rounding')
        check('2027年度住民税（または指定年額）' not in text,'copy does not mislabel the notice')
        # The existing optional staircase and interactions still work.
        page.locator('#simEditorSummary').click()
        expect(page.locator('#rateChart')).to_be_visible()
        page.locator('#simExampleThreshold').click()
        expect(page.locator('#monthlyNet')).to_have_text('388,680円')
        expect(page.locator('#residentJuneNet')).to_have_text('388,180円')
        check(not page.evaluate('document.documentElement.scrollWidth > innerWidth'), 'no page overflow')
        check(page.evaluate("""() => [...document.querySelectorAll('.resident-schedule,.resident-june-pay,.item-detail')]
            .filter(el=>el.getClientRects().length).every(el=>el.scrollWidth<=el.clientWidth+2)"""),'no section overflow')
        check(not errors,'no JS errors: '+str(errors));check(not requests,'no input network requests')
        if os.environ.get('RESIDENT_SCREENSHOTS') and width in [1440,390]:
            page.locator('#simRestore').click()
            page.locator('#simEditorSummary').click()
            page.add_style_tag(content='.sim-floating-summary{display:none!important}')
            # Capture the actual changed result card, not a mockup.
            page.locator('.unified-summary').screenshot(path=str(Path(os.environ['RESIDENT_SCREENSHOTS'])/f'resident-notice-{width}.png'))
        page.close()
    browser.close()
print(f'PASS {checks} resident browser checks + Playwright assertions (5 viewport widths)')
