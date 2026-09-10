#!/usr/bin/env python3
"""Result layout and live deduction sliders; synthetic data only."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parent
with sync_playwright() as p:
 b=p.chromium.launch(headless=True)
 for width in [1440,1024,768,390,320]:
  page=b.new_page(viewport={'width':width,'height':1000},accept_downloads=True);page.emulate_media(reduced_motion='reduce')
  errors=[];requests=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url))
  page.set_content((ROOT/'index.html').read_text());expect(page.locator('#resultSticky')).to_be_hidden()
  page.locator('#monthlyGross').fill('400000')
  for _ in range(5):page.locator('#setupNext').click()
  assert not page.locator('#salaryConditions').evaluate('(e)=>e.open')
  assert not page.locator('#breakdownItems').evaluate('(e)=>e.open')
  expect(page.locator('#annualBar')).to_be_visible();expect(page.locator('#monthlyGross')).to_be_hidden()
  assert page.locator('.sim-floating-summary').count()==0
  monthly=page.locator('#monthlyNet').inner_text();annual=page.locator('#simCurrentNet').inner_text()
  expect(page.locator('#stickyMonthly')).to_have_text(monthly);expect(page.locator('#stickyAnnual')).to_have_text(annual)
  page.locator('#simEditorSummary').click();page.locator('#salarySlider').scroll_into_view_if_needed()
  assert abs(page.locator('#resultSticky').bounding_box()['y'])<=1
  def slide(id,value):
   page.locator('#'+id).evaluate('(e,v)=>{e.value=v;e.dispatchEvent(new Event("input",{bubbles:true}));}',str(value))
  slide('salarySlider',1500000)
  expect(page.locator('#salarySliderValue')).to_have_text('1,500,000円')
  expect(page.locator('#stickyAnnual')).not_to_have_text(annual)
  after=page.locator('#stickyAnnual').inner_text()
  slide('basicSlider',1140000);expect(page.locator('#basicSliderValue')).to_have_text('1,140,000円')
  expect(page.locator('#stickyAnnual')).not_to_have_text(after)
  expect(page.locator('#stickyMonthly')).to_have_text(monthly);expect(page.locator('#simCurrentNet')).to_have_text(annual)
  expect(page.locator('#stickyAnnual')).to_have_text(page.locator('#simChangedNet').inner_text())
  # Keyboard also updates immediately, without waiting for blur/change.
  page.locator('#salarySlider').focus();page.keyboard.press('ArrowRight');expect(page.locator('#salarySliderValue')).to_have_text('1,510,000円')
  with page.expect_download() as dl:page.locator('#simSave').click()
  doc=json.loads(Path(dl.value.path()).read_text());assert doc['version']==8;assert doc['policy']['salaryAmount']==1510000
  page.locator('#salaryAmount').fill('');expect(page.locator('#stickyMonthly')).to_have_text('入力を確認');expect(page.locator('#simSave')).to_be_disabled()
  page.locator('#simFile').set_input_files({'name':'synthetic.json','mimeType':'application/json','buffer':json.dumps(doc).encode()})
  expect(page.locator('#salarySliderValue')).to_have_text('1,510,000円');expect(page.locator('#simSave')).to_be_enabled()
  page.locator('#breakdownItems>summary').click();page.locator('#annual-button-health').click();page.locator('#annual-button-care').click()
  slide('salarySlider',1600000);expect(page.locator('#annual-detail-health')).to_be_visible();expect(page.locator('#annual-detail-care')).to_be_visible()
  page.locator('#salaryConditionsSummary').click();expect(page.locator('#monthlyGross')).to_have_value('400000')
  page.locator('#salaryConditionsSummary').click();page.locator('#salarySlider').scroll_into_view_if_needed()
  assert abs(page.locator('#resultSticky').bounding_box()['y'])<=1
  assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
  if width==390:page.screenshot(path='/tmp/nenshu-sticky-sliders.png')
  page.locator('#simRestore').click();expect(page.locator('#stickyAnnual')).to_have_text(annual)
  assert not errors,errors;assert not requests,requests
  print('PASS sticky, collapsed defaults, live sliders, JSON, keyboard',width,flush=True);page.close()
 b.close()
