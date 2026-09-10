#!/usr/bin/env python3
"""Assemble a self-contained HTML file. No network dependencies or build packages."""
from pathlib import Path
import base64
import re
ROOT=Path(__file__).resolve().parent
logo_src='data:image/png;base64,'+base64.b64encode((ROOT/'assets/logo.png').read_bytes()).decode('ascii')
css='\n'.join((ROOT/n).read_text(encoding='utf-8') for n in ['base.css','policy.css','unified.css','rate-chart.css','setup-wizard.css','theme.css'])
view=(ROOT/'unified-view.html').read_text(encoding='utf-8')
scripts='\n'.join('<script>\n'+(ROOT/n).read_text(encoding='utf-8')+'\n</script>' for n in ['monthly-engine.js','policy-engine.js','deduction-engine.js','unified-engine.js','setup-wizard.js','unified-ui.js','rate-chart.js'])
html='''<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="light"><meta name="description" content="月給×12＋賞与から年収と手取りを計算。通常月と年間の内訳・計算式を同じページに表示。所得税の仮想変更に対応。"><title>年収の壁</title><style>'''+css+'''</style></head><body class="policy-mode">
<noscript>計算にはJavaScriptを有効にしてください。入力値はサーバーに送信されません。</noscript>
<header><div class="shell"><div class="logo"><img class="site-logo" src="'''+logo_src+'''" alt="年収の壁" width="1672" height="941"></div><div class="header-right"><span class="badge green">入力データの送信なし</span><button class="ghost" id="copyButton" type="button">結果をコピー</button></div></div></header>
'''+view+'''<div id="toast" class="toast" role="status" aria-live="polite" hidden></div>'''+scripts+'''</body></html>'''
(ROOT/'index.html').write_text(html,encoding='utf-8')
print(f'Built {ROOT / "index.html"} ({len(html.encode()):,} bytes)')
