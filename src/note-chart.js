const colors = ['#2cae85', '#6a94e9', '#db9857', '#aa7ddb', '#c6b35c', '#4eafc7'];
const number = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 });

function escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

const text = (x, y, value, attributes = '') =>
  '<text x="' + x + '" y="' + y + '" ' + attributes + '>' + escape(value) + '</text>';
const line = (x1, y1, x2, y2) => '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"/>';
const rect = (x, y, width, height, color, title) =>
  '<rect x="' + x + '" y="' + y + '" width="' + width + '" height="' + height + '" rx="2" fill="' + color + '"><title>' + escape(title) + '</title></rect>';
const dot = (x, y, size, color, title) =>
  '<circle cx="' + x + '" cy="' + y + '" r="' + size + '" fill="' + color + '"><title>' + escape(title) + '</title></circle>';

function seriesLegend(items) {
  return '<div class="legend">' + items.map(([color, label]) =>
    '<span><i style="background:' + color + '"></i>' + escape(label) + '</span>').join('') + '</div>';
}

function renderPie(labels, values, suffix) {
  const positive = values[0].map((value, index) => ({ value, index })).filter(({ value }) => value > 0);
  if (!positive.length || values[0].some((value) => value < 0)) {
    throw new Error('饼图需要非负数值，且至少有一个大于零');
  }
  const total = positive.reduce((sum, { value }) => sum + value, 0);
  const center = [300, 130];
  const radius = 100;
  let angle = -Math.PI / 2;
  const point = (at) => [center[0] + radius * Math.cos(at), center[1] + radius * Math.sin(at)];
  const slices = positive.map(({ value, index }) => {
    const part = value / total;
    const title = labels[index] + '：' + number.format(value) + suffix + '（' + number.format(part * 100) + '%）';
    const color = colors[index % colors.length];
    if (part === 1) return dot(...center, radius, color, title);
    const start = point(angle);
    angle += part * Math.PI * 2;
    const end = point(angle);
    return '<path fill="' + color + '" d="M ' + center.join(' ') + ' L ' + start.join(' ')
      + ' A ' + radius + ' ' + radius + ' 0 ' + Number(part > .5) + ' 1 ' + end.join(' ')
      + ' Z"><title>' + escape(title) + '</title></path>';
  });
  return slices.join('');
}

function renderAxes(config, labels, values, suffix) {
  const { chartType, layout, yAxisMin, yAxisMax, xAxisScale, series } = config;
  const left = 92, right = 574, top = 20, bottom = 222;
  const bar = chartType === 'bar';
  const horizontal = bar && layout === 'horizontal';
  const linear = !bar && (xAxisScale === 'linear' || xAxisScale === 'time');
  const positions = labels.map((value, i) => {
    if (!linear) return i;
    return xAxisScale === 'time' ? Date.parse(value) : Number(value);
  });
  if (positions.some((value) => !Number.isFinite(value))) {
    throw new Error('xAxisScale 与数据不匹配');
  }
  const all = values.flat().filter((value) => value !== null);
  const naturalMin = Math.min(...all, ...(bar ? [0] : []));
  const naturalMax = Math.max(...all, ...(bar ? [0] : []));
  const min = yAxisMin ?? naturalMin - (naturalMin === naturalMax ? 1 : 0);
  const max = yAxisMax ?? naturalMax + (naturalMin === naturalMax ? 1 : 0);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
    throw new Error('数值轴上下限无效');
  }

  const valueAt = (value) => horizontal
    ? left + (right - left) * (value - min) / (max - min)
    : bottom - (bottom - top) * (value - min) / (max - min);
  const first = Math.min(...positions);
  const last = Math.max(...positions);
  const interval = (horizontal ? bottom - top : right - left) / labels.length;
  const categoryAt = (i) => {
    if (bar) return (horizontal ? top : left) + interval * (i + .5);
    const ratio = (positions[i] - first) / (last - first || 1);
    return first === last ? (left + right) / 2 : left + (right - left) * ratio;
  };
  const grid = [];
  for (let i = 0; i <= 4; i += 1) {
    const n = min + (max - min) * i / 4;
    const pos = valueAt(n);
    grid.push(horizontal
      ? line(pos, top, pos, bottom) + text(pos, bottom + 17, number.format(n) + suffix, 'text-anchor="middle"')
      : line(left, pos, right, pos) + text(left - 8, pos + 4, number.format(n) + suffix, 'text-anchor="end"'));
  }
  const showEvery = Math.max(1, Math.ceil(labels.length / (horizontal ? 10 : 7)));
  labels.forEach((label, i) => {
    if (i % showEvery) return;
    const name = String(label);
    const shortened = name.length > 10 ? name.slice(0, 9) + '…' : name;
    grid.push(horizontal
      ? text(left - 8, categoryAt(i) + 4, shortened, 'text-anchor="end"')
      : text(categoryAt(i), bottom + 17, shortened, 'text-anchor="middle"'));
  });
  grid.push(text((left + right) / 2, 267, horizontal ? config.axisLabel : config.xAxisLabel, 'text-anchor="middle"'));
  grid.push(text(18, 121, horizontal ? config.xAxisLabel : config.axisLabel, 'text-anchor="middle" transform="rotate(-90 18 121)"'));

  const marks = values.map((row, s) => {
    const color = colors[s % colors.length];
    const path = [];
    const points = [];
    const width = Math.min(interval * .75 / series.length, 36);
    const base = valueAt(Math.max(min, Math.min(max, 0)));
    let penDown = false;
    row.forEach((value, i) => {
      if (value === null) {
        penDown = false;
        return;
      }
      const title = labels[i] + ' · ' + (series[s].label ?? series[s].dataKey) + '：' + number.format(value) + suffix;
      const category = categoryAt(i);
      const ordinate = valueAt(value);
      if (bar) {
        const offset = category + width * (s - series.length / 2);
        points.push(horizontal
          ? rect(Math.min(base, ordinate), offset, Math.abs(ordinate - base), Math.max(0, width - 1), color, title)
          : rect(offset, Math.min(base, ordinate), width - 1, Math.abs(ordinate - base), color, title));
      } else {
        path.push((penDown ? 'L' : 'M') + category + ' ' + ordinate);
        penDown = true;
        points.push(dot(category, ordinate, 4.3, color, title));
      }
    });
    const stroke = chartType === 'line' ? '<path d="' + path.join(' ') + '" fill="none" stroke="' + color + '" stroke-width="2.5"/>' : '';
    return stroke + points.join('');
  });
  const clip = '<defs><clipPath id="plot"><rect x="' + (left - 5) + '" y="' + (top - 5) + '" width="' +
    (right - left + 10) + '" height="' + (bottom - top + 10) + '"/></clipPath></defs>';
  return clip + '<g class="grid">' + grid.join('') + '</g><g clip-path="url(#plot)">' + marks.join('') + '</g>';
}

export function renderChart(config) {
  const { chartType, xKey, series, data, valueSuffix = '' } = config;
  if (!['line', 'bar', 'scatter', 'pie'].includes(chartType)) throw new Error('chartType 需要是 line、bar、scatter 或 pie');
  if (typeof xKey !== 'string' || !Array.isArray(data) || !data.length
    || !Array.isArray(series) || !series.length || series.some((item) => typeof item?.dataKey !== 'string')) {
    throw new Error('需要 xKey、series 和 data');
  }
  if (data.some((item) => !item || item[xKey] == null)) throw new Error('数据缺少 xKey 对应的值');
  const labels = data.map((item) => item[xKey]);
  const values = series.map(({ dataKey }) => data.map((item) => Number.isFinite(item[dataKey]) ? item[dataKey] : null));
  if (!values.some((row) => row.some((value) => value !== null))) throw new Error('数据中没有可绘制的数值');
  const pie = chartType === 'pie';
  if (pie && series.length !== 1) throw new Error('饼图需要一个数据系列');
  const drawing = pie ? renderPie(labels, values, valueSuffix) : renderAxes(config, labels, values, valueSuffix);
  const legend = pie ? labels.map((label, i) => [colors[i % colors.length], label])
    : series.map(({ dataKey, label }, i) => [colors[i % colors.length], label ?? dataKey]);
  return `<style>
    :root { color-scheme: light dark; font: 14px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; padding: .45rem .55rem; color: CanvasText; background: Canvas; overflow-x: auto; }
    svg { display: block; width: 100%; min-width: 520px; height: auto; overflow: visible; }
    text { fill: CanvasText; font-size: 13px; font-family: inherit; }
    .grid line { stroke: currentColor; stroke-opacity: .18; stroke-dasharray: 3 5; }
    .legend { display: flex; gap: .45rem 1.1rem; justify-content: center; flex-wrap: wrap; padding: .45rem 0 .2rem; color: CanvasText; }
    .legend span { display: inline-flex; gap: .45rem; align-items: center; font-size: 13px; }
    .legend i { width: .68rem; height: .68rem; flex: none; border-radius: 50%; }
    rect, circle, path { transition: filter .15s ease; }
    rect:hover, circle:hover, path:has(title):hover { filter: brightness(1.2); }
    @media (max-width: 560px) {
      body { padding: .35rem .25rem; }
      svg { min-width: 0; }
      svg text { font-size: 20px; }
      .legend { justify-content: center; }
    }
  </style><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 275" role="img" aria-label="图表">${drawing}</svg>${seriesLegend(legend)}`;
}
