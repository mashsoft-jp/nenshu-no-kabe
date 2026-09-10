#!/usr/bin/env python3
import os, shutil, json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parent
HTML=(ROOT/'index.html').read_text()
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'),headless=True,args=['--no-sandbox'])
    for width in [1440,1024,768,390,320]:
        page=browser.new_page(viewport={'width':width,'height':950},accept_downloads=True)
        errors=[];requests=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('request',lambda r:requests.append(r.url))
        page.set_content(HTML)
        expect(page.locator('#setupTitle')).to_have_text('給与・賞与')
        expect(page.locator('#simResults')).to_be_hidden()
        expect(page.locator('#simAge')).to_be_hidden()
        page.locator('#monthlyGross').fill('1')
        page.locator('#setupNext').click()
        expect(page.locator('#setupProgress')).to_have_text('1 / 5')
        expect(page.locator('#setupError')).to_be_visible()
        page.locator('#monthlyGross').fill('330000')
        page.locator('#monthlyGross').press('Enter')
        expect(page.locator('#setupTitle')).to_have_text('社会保険')
        expect(page.locator('#setupTitle')).to_be_focused()
        page.locator('#simAge').fill('42')
        page.locator('#simEmployment').select_option('0')
        page.locator('#setupBack').click()
        expect(page.locator('#monthlyGross')).to_have_value('330000')
        page.locator('#setupNext').click()
        expect(page.locator('#simAge')).to_have_value('42')
        page.locator('#setupNext').click()
        page.locator('#dependentConditions>summary').click()
        page.locator('#dependent_young').fill('1')
        page.locator('#setupNext').click()
        page.locator('#monthlyResidentMode').select_option('none')
        page.locator('#simResidentMode').select_option('manual')
        page.locator('#simResidentAnnual').fill('210000')
        page.locator('#setupNext').click()
        expect(page.locator('#setupPanel4')).to_contain_text('330,000円')
        expect(page.locator('#setupPanel4')).to_contain_text('天引きしない')
        assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
        if width==390:page.screenshot(path='/tmp/nenshu-wizard-review.png',full_page=True)
        page.locator('#setupNext').click()
        expect(page.locator('#simResults')).to_be_visible()
        expect(page.locator('#setupWizard')).to_be_hidden()
        with page.expect_download() as download:page.locator('#simSave').click()
        saved=json.loads(Path(download.value.path()).read_text())
        assert saved['input']['monthlyResidentMode']=='none'
        assert saved['input']['dependents']['young']==1
        expected=page.evaluate('(doc)=>Nenshu.calculate(doc.input,doc.policy).monthly.net',saved)
        expect(page.locator('#monthlyNet')).to_have_text(f'{expected:,}円')
        assert page.locator('#setupLaunch').evaluate('(el)=>el.tabIndex')==0
        page.locator('#setupLaunch').click()
        expect(page.locator('#monthlyGross')).to_have_value('330000')
        # Import while in the wizard updates the same controls and preserves the flow.
        page.locator('#simFile').set_input_files({'name':'settings.json','mimeType':'application/json','buffer':json.dumps(saved).encode()})
        expect(page.locator('#toast')).to_contain_text('設定を読み込みました')
        page.locator('#setupAll').click()
        expect(page.locator('#simResults')).to_be_visible()
        assert not errors,errors
        assert not requests,requests
        assert page.locator('#monthlyGross').count()==1
        print('PASS setup wizard',width,flush=True)
        page.close()
    browser.close()
