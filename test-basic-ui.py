#!/usr/bin/env python3
import os,json,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parent
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'),headless=True,args=['--no-sandbox'])
    for width in [1440,1024,768,390,320]:
        page=browser.new_page(viewport={'width':width,'height':1000},accept_downloads=True)
        errors=[];requests=[]
        page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url))
        page.set_content((ROOT/'index.html').read_text());page.locator('#setupAll').click();page.locator('#breakdownItems').evaluate('(e)=>e.open=true')
        expect(page.locator('#simBasicMode')).to_be_hidden()
        monthly=page.locator('#monthlyNet').inner_text();current=page.locator('#simCurrentNet').inner_text()
        page.locator('#simEditorSummary').click()
        expect(page.locator('#simBasicMode')).to_be_visible()
        expect(page.locator('#simBasicDetails')).to_contain_text('2025年分の160万円')
        page.locator('[data-basic-flat="95"]').click()
        expect(page.locator('#simBasicMode')).to_have_value('flat');expect(page.locator('#simBasicAmount')).to_have_value('95')
        expect(page.locator('#basicComparison')).to_contain_text('950,000円')
        expect(page.locator('#monthlyNet')).to_have_text(monthly);expect(page.locator('#simCurrentNet')).to_have_text(current)
        page.locator('#simBasicMode').select_option('add');page.locator('#simBasicAmount').fill('10')
        expect(page.locator('#basicComparison')).to_contain_text('1,140,000円')
        page.locator('#simBasicAmount').fill('')
        expect(page.locator('#basicComparison')).to_have_text('入力内容を確認してください。');expect(page.locator('#simSave')).to_be_disabled()
        page.locator('#simBasicAmount').fill('10')
        expect(page.locator('#simSave')).to_be_enabled()
        with page.expect_download() as dl:page.locator('#simSave').click()
        doc=json.loads(Path(dl.value.path()).read_text());assert doc['policy']['basicMode']=='add' and doc['policy']['basicAmount']==100000
        page.locator('#basicRestore').click();expect(page.locator('#simBasicMode')).to_have_value('current')
        page.locator('#simFile').set_input_files({'name':'synthetic.json','mimeType':'application/json','buffer':json.dumps(doc).encode()})
        expect(page.locator('#simBasicMode')).to_have_value('add');expect(page.locator('#simBasicAmount')).to_have_value('10')
        page.locator('#simEditorSummary').click();page.locator('#simEditorSummary').click()
        expect(page.locator('#simBasicAmount')).to_have_value('10')
        assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
        if width==390:page.locator('#simBasicDetails').screenshot(path='/tmp/nenshu-basic-comparison.png')
        assert not errors,errors;assert not requests,requests
        print('PASS basic deduction',width,flush=True);page.close()
    browser.close()
