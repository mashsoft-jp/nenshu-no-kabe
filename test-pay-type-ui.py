#!/usr/bin/env python3
import os,json,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parent
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'),headless=True,args=['--no-sandbox'])
    for width in [1440,1024,768,390,320]:
        page=browser.new_page(viewport={'width':width,'height':950},accept_downloads=True)
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.set_content((ROOT/'index.html').read_text())
        expect(page.locator('#payType')).to_have_value('employee')
        page.locator('#payType').select_option('officer')
        page.locator('#setupNext').click()
        expect(page.locator('#simEmployment')).to_have_value('0')
        expect(page.locator('#simEmployment')).to_be_disabled()
        page.locator('#setupBack').click()
        page.locator('#payType').select_option('employee')
        page.locator('#setupNext').click()
        expect(page.locator('#simEmployment')).to_have_value('50')
        expect(page.locator('#simEmployment')).to_be_enabled()
        page.locator('#simEmployment').select_option('60')
        page.locator('#setupBack').click()
        page.locator('#payType').select_option('custom')
        page.locator('#setupNext').click()
        expect(page.locator('#simEmployment')).to_have_value('60')
        page.locator('#setupBack').click()
        page.locator('#payType').select_option('officer')
        page.locator('#setupAll').click()
        with page.expect_download() as dl:page.locator('#simSave').click()
        doc=json.loads(Path(dl.value.path()).read_text())
        assert doc['version']==7 and doc['input']['payType']=='officer' and doc['input']['employment']==0
        page.locator('#payType').select_option('employee')
        page.locator('#simFile').set_input_files({'name':'synthetic.json','mimeType':'application/json','buffer':json.dumps(doc).encode()})
        expect(page.locator('#payType')).to_have_value('officer')
        # Existing files retain their rate; users explicitly choose the new role.
        doc['version']=6;doc['input'].pop('payType');doc['input']['employment']=50
        page.locator('#simFile').set_input_files({'name':'old.json','mimeType':'application/json','buffer':json.dumps(doc).encode()})
        expect(page.locator('#payType')).to_have_value('employee')
        page.locator('#payType').select_option('officer')
        expect(page.locator('#simEmployment')).to_have_value('0')
        assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
        assert not errors,errors
        print('PASS pay type',width,flush=True);page.close()
    browser.close()
