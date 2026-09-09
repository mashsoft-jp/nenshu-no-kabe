#!/usr/bin/env python3
"""Regression tests for the in-editor rate overview. Build first; no network.
Run: python3 build.py && python3 test-rate-chart.py
Requires the same Playwright/Chromium installation as test-unified-ui.py.
"""
import json
import os
import re
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


def verify_geometry(page):
    """Every plateau is horizontal; jumps share the exact previous x boundary."""
    data = page.evaluate('''() => ({
      bs: [...document.querySelectorAll('#simBracketRows .sim-bracket-row')].map(r=>({
        upper: r.querySelector('[data-field=upper]')?.valueAsNumber * 10000 || null,
        rate: r.querySelector('[data-field=rate]').valueAsNumber
      })),
      path: document.querySelector('[data-rate-line]').getAttribute('d'),
      width: document.querySelector('#rateChart').viewBox.baseVal.width,
      height: document.querySelector('#rateChart').viewBox.baseVal.height
    })''')
    bs, width, height = data['bs'], data['width'], data['height']
    nums = [float(n) for n in re.findall(r'-?\d+(?:\.\d+)?(?:e[+-]?\d+)?', data['path'])]
    check(data['path'].count(' H') == len(bs), 'all plateaus represented')
    check(data['path'].count(' V') == len(bs) - 1, 'vertical jumps only')
    check('L' not in data['path'], 'no sloped interpolated rates')
    xmax = max(1000000, (bs[-2]['upper'] if len(bs) > 1 else 0) * 1.15)
    ymax = max(10, -(-max(b['rate'] for b in bs) // 10) * 10)
    check(len(nums) == 1 + 2 * len(bs), 'correct path coordinate count')
    for i, b in enumerate(bs):
        x = 36 + (b['upper'] or xmax) / xmax * (width - 25 - 36)
        y = height - 91 - b['rate'] / ymax * (height - 91 - 32)
        check(abs(nums[2 * i + 1] - y) < 1e-6, f'plateau {i} rate')
        check(abs(nums[2 * i + 2] - x) < 1e-6, f'plateau {i} upper')


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'),
                                headless=True, args=['--no-sandbox'])
    for width in [1440, 1024, 768, 390, 320]:
        print('Rate chart viewport', width, flush=True)
        page = browser.new_page(viewport={'width': width, 'height': 1100}, accept_downloads=True)
        page.set_default_timeout(8000)
        page.emulate_media(reduced_motion='reduce')
        errors, requests = [], []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('request', lambda r: requests.append(r.url))
        page.set_content(HTML)
        expect(page.locator('#rateOverview')).to_be_hidden()
        expect(page.locator('#simPolicyComparison')).to_be_hidden()
        page.locator('#simEditorSummary').click()
        expect(page.locator('#rateHeading')).to_have_text('税率設定')
        expect(page.locator('#rateChartSelection')).to_have_text('第1段階：0〜195万円 ／ 5%')
        expect(page.locator('[data-rate-stage]')).to_have_count(7)
        check(page.locator('#rateOverview').bounding_box()['y'] < page.locator('#simBracketRows').bounding_box()['y'], 'chart before number controls')
        check(page.locator('#simResults').bounding_box()['y'] < page.locator('#rateOverview').bounding_box()['y'], 'take-home remains above option')
        verify_geometry(page)
        if width == 1440:
            check(page.locator('#rateChart .rate-value').all_text_contents() == ['5%', '10%', '20%', '23%', '33%', '40%', '45%'], 'all default rates labelled')
            check(sorted(page.locator('[data-rate-label]').all_text_contents()) == sorted(['0','195','330','695','900','1,800','4,000']), 'all default boundaries labelled')
        # Range is not truncated to the net graph maximum; includes the last stage.
        page.locator('#simGraphMax').select_option('6000000')
        expect(page.locator('[data-rate-stage]')).to_have_count(7)
        expect(page.locator('[data-rate-label="40000000"]')).to_be_visible()
        # Keyboard selection does not change salary, policy, or output.
        monthly, net = page.locator('#monthlyGross').input_value(), page.locator('#simCurrentNet').inner_text()
        page.locator('#rateChart').focus()
        page.keyboard.press('End')
        expect(page.locator('#rateChartSelection')).to_have_text('第7段階：4,000万円超（上限なし） ／ 45%')
        expect(page.locator('#simSelectedTitle')).to_have_text('第7段階の設定')
        page.keyboard.press('Home')
        page.keyboard.press('ArrowRight')
        expect(page.locator('#rateChartSelection')).to_contain_text('第2段階')
        expect(page.locator('#rateChart')).to_be_focused()
        expect(page.locator('#monthlyGross')).to_have_value(monthly)
        expect(page.locator('#simCurrentNet')).to_have_text(net)
        expect(page.locator('#simPolicyComparison')).to_be_hidden()
        # Direct inputs, range sliders, presets, undo and restore.
        page.locator('#simBracketRows [data-field=upper]').first.fill('300')
        page.locator('#simBracketRows [data-field=upper]').first.press('Tab')
        expect(page.locator('#rateChartSelection')).to_contain_text('300万円')
        expect(page.locator('[data-rate-boundary="3000000"]')).to_have_count(1)
        verify_geometry(page)
        page.locator('#simUndo').click()
        expect(page.locator('#rateChartSelection')).to_contain_text('195万円')
        page.locator('#simRateSlider').evaluate("e=>{e.value=1550;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}")
        expect(page.locator('#rateChartSelection')).to_contain_text('15.5%')
        page.locator('#simBoundarySlider').evaluate("e=>{e.value=2500000;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}")
        expect(page.locator('#rateChartSelection')).to_contain_text('250万円')
        verify_geometry(page)
        page.locator('#simExampleZero').click()
        expect(page.locator('[data-rate-stage]')).to_have_count(8)
        expect(page.locator('#rateChartSelection')).to_contain_text('0%')
        page.locator('#simBracketRows .sim-row-ops button').first.click()
        expect(page.locator('[data-rate-stage]')).to_have_count(9)
        page.locator('#simBracketRows .sim-row-ops button').nth(1).click()
        expect(page.locator('[data-rate-stage]')).to_have_count(8)
        # Pointer/touch-style selection delegates to the same row controls.
        mark = page.locator('[data-rate-stage="7"]')
        mark.click()
        expect(page.locator('#simSelectedTitle')).to_have_text('第8段階の設定')
        expect(page.locator('#rateChartSelection')).to_contain_text('第8段階')
        # Clear/reversed/oversized inputs must not leave a stale visible plot.
        for bad in ['', '0', '99999']:
            page.locator('#simBracketRows [data-field=upper]').first.fill(bad)
            expect(page.locator('#rateChart')).to_be_hidden()
            expect(page.locator('#rateChartError')).to_be_visible()
            page.locator('#simRestore').click()
            expect(page.locator('#rateChart')).to_be_visible()
            expect(page.locator('#rateChartError')).to_be_hidden()
        for bad in ['', '-1', '100.01']:
            page.locator('#simBracketRows [data-field=rate]').first.fill(bad)
            expect(page.locator('#rateChart')).to_be_hidden()
            page.locator('#simRestore').click()
            expect(page.locator('#rateChart')).to_be_visible()
        # The existing comparison graph's boundary drag also refreshes the overview.
        if width == 1440:
            page.locator('#simGraphRatesTab').click()
            handle = page.locator('#simGraph [data-bound="0"]')
            handle.scroll_into_view_if_needed()
            box = handle.bounding_box()
            x, y = box['x'] + box['width']/2, box['y'] + box['height']/2
            page.mouse.move(x, y); page.mouse.down(); page.mouse.move(x + 15, y, steps=3); page.mouse.up()
            value = float(page.locator('#simBracketRows [data-field=upper]').first.input_value())
            check(value != 195, 'legacy boundary drag changed the input')
            expect(page.locator(f'[data-rate-boundary="{round(value*10000)}"]')).to_have_count(1)
            verify_geometry(page)
            page.locator('#simRestore').click()
            expect(page.locator('[data-rate-boundary="1950000"]')).to_have_count(1)
        # Repeated key events within one animation frame use the current row selection.
        page.locator('#rateChart').evaluate("s=>{for(const key of ['Home','ArrowRight','ArrowRight'])s.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true}));}")
        expect(page.locator('#rateChartSelection')).to_contain_text('第3段階')
        page.locator('#simRestore').click()
        # Export/import must retain schema, and import while collapsed must sync.
        with page.expect_download() as dl:
            page.locator('#simSave').click()
        doc = json.loads(Path(dl.value.path()).read_text())
        check(doc['format'] == 'nenshu-no-kabe' and doc['version'] == 2, 'unchanged JSON schema')
        for bs in [[{'upper': None, 'rateBp': 0}], [{'upper': None, 'rateBp': 10000}],
                   [{'upper': 100000000, 'rateBp': 4000}, {'upper': None, 'rateBp': 2000}],
                   [{'upper': (i+1)*1000 if i<19 else None, 'rateBp': (i%3)*1000} for i in range(20)]]:
            doc['policy']['brackets'] = bs
            page.locator('#simEditorSummary').click()
            page.locator('#simFile').set_input_files({'name':'case.json','mimeType':'application/json','buffer':json.dumps(doc).encode()})
            expect(page.locator('#simStageBadge')).to_have_text(f'{len(bs)}段階')
            page.locator('#simEditorSummary').click()
            expect(page.locator('[data-rate-stage]')).to_have_count(len(bs))
            expect(page.locator('#rateChartSelection')).to_have_text(re.compile(r'^第1段階：.* ／ ' + re.escape(f"{bs[0]['rateBp']/100:g}%") + '$'))
            verify_geometry(page)
            page.locator('#rateChart').focus(); page.keyboard.press('End')
            expect(page.locator('#rateChartSelection')).to_contain_text('上限なし')
            check(not page.evaluate('document.documentElement.scrollWidth > innerWidth'), 'no page horizontal overflow')
        page.locator('#simRestore').click()
        expect(page.locator('[data-rate-stage]')).to_have_count(7)
        page.set_viewport_size({'width': 640, 'height': 1000})
        page.wait_for_timeout(100)
        verify_geometry(page)
        check(not errors, 'no JS errors: ' + str(errors))
        check(not requests, 'no network requests: ' + str(requests))
        page.close()
    browser.close()
print(f'PASS {checks} rate-chart checks + Playwright assertions (5 viewport widths)')
