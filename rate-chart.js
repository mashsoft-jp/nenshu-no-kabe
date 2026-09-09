/* Read-only overview of the bracket editor. The existing inputs remain the source
 * of truth. Observe their rendered labels/selection as well as direct input so
 * sliders, undo, examples, JSON imports and the existing drag chart all sync.
 * This component never changes a tax value or owns a second policy/history.
 */
(() => {
  'use strict';
  const host = document.getElementById('rateOverview');
  const rows = document.getElementById('simBracketRows');
  const editor = document.getElementById('simEditor');
  const svg = document.getElementById('rateChart');
  const info = document.getElementById('rateChartSelection');
  const error = document.getElementById('rateChartError');
  const nf = new Intl.NumberFormat('ja-JP', {maximumFractionDigits: 2});
  const man = value => nf.format(value / 10000) + '万円';
  const percent = value => nf.format(value / 100) + '%';
  const ns = 'http://www.w3.org/2000/svg';
  let frame = 0, signature = '', geometry = null;

  function node(tag, attrs = {}, text) {
    const item = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs)) item.setAttribute(key, value);
    if (text !== undefined) item.textContent = text;
    return item;
  }
  function readEditor() {
    const elements = [...rows.querySelectorAll('.sim-bracket-row')];
    const brackets = elements.map(row => {
      const upper = row.querySelector('[data-field="upper"]');
      return {
        upper: upper ? Math.round(upper.valueAsNumber * 10000) : null,
        rateBp: Math.round(row.querySelector('[data-field="rate"]').valueAsNumber * 100)
      };
    });
    // Validate only the plotted bracket schedule, not unrelated salary/deductions.
    window.Nenshu.validatePolicy({brackets, basicMode: 'current', basicAmount: 0});
    return {brackets, selected: Math.max(0, elements.findIndex(row => row.classList.contains('is-selected')))};
  }
  function describe(brackets, index) {
    const lower = index ? brackets[index - 1].upper : 0;
    const upper = brackets[index].upper;
    const range = upper === null
      ? (index ? man(lower) + '超（上限なし）' : '0万円から（上限なし）')
      : (index ? man(lower) + '超〜' : '0〜') + man(upper);
    return '第' + (index + 1) + '段階：' + range + ' ／ ' + percent(brackets[index].rateBp);
  }
  function select(index) {
    // Delegate selection to the existing editor; its sliders and history stay intact.
    rows.querySelectorAll('.sim-pick')[index]?.click();
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; draw(); });
  }
  function draw() {
    if (!editor.open) return;
    let state;
    try {
      state = readEditor();
    } catch {
      geometry = null;
      signature = '';
      svg.replaceChildren();
      svg.setAttribute('hidden', '');
      svg.setAttribute('aria-label', '税率設定が不正なためグラフを表示できません。');
      error.hidden = false;
      info.textContent = '区分の金額・税率を確認してください。';
      return;
    }
    const width = Math.round(host.getBoundingClientRect().width);
    if (width <= 0) return;
    const {brackets, selected} = state;
    const nextSignature = JSON.stringify([brackets, selected, width]);
    if (nextSignature === signature) return;
    signature = nextSignature;
    svg.removeAttribute('hidden');
    error.hidden = true;
    const W = width, H = W < 500 ? 320 : 330;
    const left = 36, right = W - 25, top = 32, bottom = H - 91;
    // Include every boundary, independently of the take-home graph's range.
    // Space after the final boundary illustrates an unbounded final interval.
    const lastBoundary = brackets.length > 1 ? brackets.at(-2).upper : 0;
    const maxX = Math.max(1000000, lastBoundary * 1.15);
    const maxY = Math.max(10, Math.ceil(Math.max(...brackets.map(b => b.rateBp)) / 1000) * 10);
    const sx = value => left + value / maxX * (right - left);
    const sy = rate => bottom - rate / 100 / maxY * (bottom - top);
    geometry = {W, H, left, right, top, bottom, maxX, brackets, selected};
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('aria-label', '課税所得別の税率設定。' + describe(brackets, selected));
    svg.replaceChildren();
    svg.append(node('title', {}, '課税所得ごとの税率'),
      node('desc', {}, brackets.map((_, i) => describe(brackets, i)).join('。')));
    svg.append(node('text', {x: left, y: 14, class: 'rate-axis-title'}, '税率（%）'));
    const yStep = maxY <= 20 ? 5 : maxY <= 50 ? 10 : 20;
    const ticks = new Set([0, maxY]);
    for (let y = yStep; y < maxY; y += yStep) ticks.add(y);
    for (const y of [...ticks].sort((a, b) => a - b)) {
      const py = sy(y * 100);
      svg.append(node('line', {x1: left, x2: right, y1: py, y2: py, class: 'rate-grid'}),
        node('text', {x: left - 8, y: py + 4, 'text-anchor': 'end', class: 'rate-axis'}, nf.format(y)));
    }
    const lower = selected ? brackets[selected - 1].upper : 0;
    const upper = brackets[selected].upper ?? maxX;
    svg.append(node('rect', {x: sx(lower), y: top, width: sx(upper) - sx(lower), height: bottom - top, class: 'rate-selection-band'}));
    let path = '', lo = 0;
    brackets.forEach((b, i) => {
      const hi = b.upper ?? maxX;
      // Horizontal within each interval, vertical exactly at each boundary.
      path += (i ? ' V' : 'M' + sx(lo) + ' ') + sy(b.rateBp) + ' H' + sx(hi);
      if (b.upper !== null) svg.append(node('line', {
        x1: sx(hi), x2: sx(hi), y1: sy(b.rateBp), y2: bottom,
        class: 'rate-boundary', 'data-rate-boundary': b.upper
      }));
      lo = hi;
    });
    svg.append(node('path', {d: path, class: 'rate-step-line', 'data-rate-line': ''}));
    const lastY = sy(brackets.at(-1).rateBp);
    svg.append(node('path', {d: `M${right - 5} ${lastY - 4} L${right + 2} ${lastY} L${right - 5} ${lastY + 4}`, class: 'rate-step-line'}));
    const rateLabels = [];
    lo = 0;
    brackets.forEach((b, i) => {
      const hi = b.upper ?? maxX, x0 = sx(lo), x1 = sx(hi), y = sy(b.rateBp);
      const mark = node('circle', {
        cx: x0, cy: y, r: i === selected ? 5 : 3.5,
        class: 'rate-point' + (i === selected ? ' is-selected' : ''), 'data-rate-stage': i
      });
      mark.append(node('title', {}, describe(brackets, i)));
      svg.append(mark);
      rateLabels.push({text: percent(b.rateBp), x: (x0 + x1) / 2, y: y - 10, index: i});
      lo = hi;
    });
    // Labels may be wider than a narrow plateau when their heights differ. Keep
    // all seven default rates on desktop, without overlapping custom schedules.
    const occupied = [];
    rateLabels.sort((a, b) => (a.index === selected ? -1 : b.index === selected ? 1 : a.index - b.index));
    for (const label of rateLabels) {
      const size = label.text.length * 7 + 8;
      const x = Math.max(left + size / 2, Math.min(right - size / 2, label.x));
      const box = {left: x - size / 2, right: x + size / 2, top: label.y - 12, bottom: label.y + 3};
      if (occupied.some(b => box.left < b.right && box.right > b.left && box.top < b.bottom && box.bottom > b.top)) continue;
      occupied.push(box);
      svg.append(node('text', {x, y: label.y, 'text-anchor': 'middle', class: 'rate-value'}, label.text));
    }
    // Stagger boundary labels in three lanes. Avoid overlapping numbers at small
    // widths or tightly spaced custom boundaries; selected boundaries take priority.
    const labels = [{value: 0, priority: 1}];
    brackets.forEach((b, i) => {
      if (b.upper !== null) labels.push({value: b.upper, priority: i === selected || i === selected - 1 ? 0 : 2});
    });
    labels.sort((a, b) => a.priority - b.priority || a.value - b.value);
    const lanes = [[], [], []];
    for (const {value} of labels) {
      const text = nf.format(value / 10000), size = text.length * 7 + 8;
      const x = Math.min(W - size / 2 - 2, Math.max(size / 2 + 2, sx(value)));
      const a = x - size / 2, b = x + size / 2;
      const lane = lanes.findIndex(intervals => intervals.every(([start, end]) => b < start || a > end));
      if (lane < 0) continue;
      lanes[lane].push([a, b]);
      const y = bottom + 21 + lane * 18;
      svg.append(node('line', {x1: sx(value), x2: sx(value), y1: bottom + 2, y2: y - 12, class: 'rate-boundary'}),
        node('text', {x, y, 'text-anchor': 'middle', class: 'rate-axis', 'data-rate-label': value}, text));
    }
    svg.append(node('text', {x: right, y: H - 9, 'text-anchor': 'end', class: 'rate-axis-title'}, '課税所得（万円）'));
    const description = describe(brackets, selected);
    if (info.textContent !== description) info.textContent = description;
  }

  svg.addEventListener('click', event => {
    if (!geometry) return;
    const {W, H, left, right, top, bottom, maxX, brackets} = geometry;
    const rect = svg.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * W;
    const y = (event.clientY - rect.top) / rect.height * H;
    if (x < left - 6 || x > right + 6 || y < top - 6 || y > bottom + 6) return;
    const point = event.target.closest('[data-rate-stage]');
    const value = Math.max(0, (x - left) / (right - left) * maxX);
    select(point ? +point.dataset.rateStage : brackets.findIndex(b => b.upper === null || value < b.upper));
  });
  svg.addEventListener('keydown', event => {
    if (!geometry || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    let state;
    try { state = readEditor(); } catch { return; }
    const {selected, brackets} = state;
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? brackets.length - 1
      : Math.max(0, Math.min(brackets.length - 1, selected + (event.key === 'ArrowRight' ? 1 : -1)));
    select(index);
  });
  const observer = new MutationObserver(schedule);
  observer.observe(rows, {childList: true, subtree: true, attributes: true, attributeFilter: ['aria-pressed']});
  rows.addEventListener('input', schedule);
  editor.addEventListener('toggle', schedule);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(schedule).observe(host);
  else window.addEventListener('resize', schedule);
  schedule();
})();
