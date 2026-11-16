import { cloneElement, Component, Fragment, h, render, toChildArray } from 'preact';
import { useState, useEffect, useCallback, useMemo, useRef, useId } from 'preact/hooks';
import { renderChart } from './note-chart.js';

const px = (value) => typeof value === 'number' ? value * 4 / 3 + 'px' : value;
const attrs = (props) => Object.fromEntries(['id', 'name', 'disabled', 'required', 'placeholder', 'role', 'title']
  .filter((key) => props[key] != null).map((key) => [key, props[key]]));
const align = (value) => ({ start: 'flex-start', end: 'flex-end', between: 'space-between', around: 'space-around' })[value] ?? value;

function layout(tag, props) {
  const { children, direction, gap, padding, align: cross, justify, wrap, scrollable, columns } = props;
  const style = {
    display: ['grid', 'flow'].includes(tag) ? 'grid' : ['grid-item', 'flow-item'].includes(tag) ? 'block' : 'flex',
    flexDirection: direction ?? (tag === 'row' ? 'row' : 'column'),
    flexWrap: wrap ? 'wrap' : undefined,
    alignItems: align(cross),
    justifyContent: align(justify),
    gap: px(gap ?? (props.disableAutoSpacing ? 0 : undefined)),
    padding: px(padding),
    height: px(props.height),
    width: px(props.width),
    maxWidth: px(props.maxWidth),
    minWidth: px(props.minWidth),
    maxHeight: px(props.maxHeight),
    minHeight: px(props.minHeight),
    background: props.background,
    border: props.border,
    borderRadius: px(props.radius),
    flex: props.flex,
    overflow: scrollable ? 'auto' : props.clip ? 'hidden' : undefined,
    gridTemplateColumns: columns ? 'repeat(' + columns + ', minmax(0, 1fr))' : undefined,
    gridColumn: props.span ? 'span ' + props.span : undefined,
    gridRow: props.rowSpan ? 'span ' + props.rowSpan : undefined,
    columnGap: px(props.columnGap),
    rowGap: px(props.rowGap),
    aspectRatio: props.aspectRatio,
  };
  return h(tag === 'form' ? 'form' : 'div', {
    ...attrs(props), class: 'dil-' + tag, style,
    onSubmit: tag === 'form' ? (event) => { event.preventDefault(); props.onSubmit?.(); } : undefined,
  }, children);
}

function button(props) {
  return h('button', {
    ...attrs(props), type: props.submit ? 'submit' : 'button',
    disabled: props.disabled || props.loading, onClick: () => props.onClick?.(),
    style: { width: props.block ? '100%' : undefined },
  }, props.children ?? props.label);
}

function input(tag, props) {
  const type = { slider: 'range', checkbox: 'checkbox', 'date-picker': 'date', input: props.inputType ?? 'text' }[tag];
  const range = tag === 'slider';
  const check = tag === 'checkbox';
  const valueProps = check ? { checked: props.checked, defaultChecked: props.defaultChecked }
    : { value: props.value, defaultValue: props.defaultValue };
  if (range && props.value != null) valueProps.value = String(props.value);
  if (range && props.defaultValue != null) valueProps.defaultValue = String(props.defaultValue);
  const control = h(tag === 'textarea' ? 'textarea' : 'input', {
    ...attrs(props), ...valueProps, type, min: props.min, max: props.max, step: props.step, rows: props.rows,
    'aria-label': props.label ?? props['aria-label'],
    onInput: check ? undefined : (event) => props.onChange?.(range ? event.currentTarget.valueAsNumber : event.currentTarget.value),
    onChange: check ? (event) => props.onChange?.(event.currentTarget.checked) : undefined,
  });
  return props.label ? h('label', { class: check ? 'dil-checkbox' : 'dil-field' }, props.label, control) : control;
}

function optionsControl(tag, props) {
  const options = (props.options ?? []).map((option) => typeof option === 'object' ? option : { label: option, value: option });
  const valueOf = (string) => options.find((option) => String(option.value) === string)?.value ?? string;
  if (tag === 'select') {
    return h('select', {
      ...attrs(props), value: props.value, defaultValue: props.defaultValue, 'aria-label': props.label,
      onChange: (event) => props.onChange?.(valueOf(event.currentTarget.value)),
    }, props.placeholder && h('option', { disabled: !props.clearable, value: '' }, props.placeholder),
    options.map(({ value, label, disabled }) => h('option', { key: value, value, disabled }, label ?? value)));
  }
  return h(Segmented, { ...props, options });
}

function Segmented({ options, value, defaultValue, onChange, disabled, label, id }) {
  const [initial, setInitial] = useState(defaultValue);
  return h('div', { id, class: 'dil-segmented', role: 'group', 'aria-label': label }, options.map((item) =>
    h('button', {
      key: item.value, type: 'button', disabled: disabled || item.disabled,
      'aria-pressed': Object.is(value ?? initial, item.value),
      onClick: () => { setInitial(item.value); onChange?.(item.value); },
    }, item.label ?? item.value)));
}

function hyperlink(props) {
  const url = props.url ?? props.href ?? '';
  return h('a', { href: /^(?:https?:|mailto:|#)/i.test(url) ? url : undefined, target: '_blank', rel: 'noopener noreferrer' },
    props.children ?? props.title ?? url);
}

function RadioGroup(props) {
  const id = useId();
  const [initial, setInitial] = useState(props.defaultValue);
  const selected = props.value ?? initial;
  return h('div', { id: props.id, role: 'radiogroup', 'aria-label': props.label,
    class: props.direction === 'vertical' ? 'dil-field' : 'dil-segmented' },
  toChildArray(props.children).map((node) => {
    if (node?.type !== Radio) return node;
    return cloneElement(node, {
      group: props.name ?? id, disabled: props.disabled || node.props.disabled,
      required: props.required || node.props.required, checked: Object.is(node.props.value, selected),
      choose: () => { setInitial(node.props.value); props.onChange?.(node.props.value); },
    });
  }));
}

function Radio(props) {
  return h('label', { class: 'dil-checkbox' }, h('input', {
    ...attrs(props), type: 'radio', name: props.group, checked: props.checked, onChange: props.choose,
  }), props.children ?? props.value);
}

function AppBlock({ content, children, title, language, bind, ...metadata }) {
  const ref = useRef(null);
  const source = content ?? toChildArray(children).join('');
  const initial = useMemo(() => {
    const encoded = JSON.stringify(encodeURIComponent(JSON.stringify({ title, language, bind, ...metadata })));
    return '<!doctype html><meta charset="utf-8"><script>window.appBlock=JSON.parse(decodeURIComponent('
      + encoded + '));addEventListener("message",event=>{if(event.source===parent&&event.data?.type==="dil-appblock-bind"){'
      + 'window.appBlock.bind=event.data.bind;dispatchEvent(new CustomEvent("appblock:bind",{detail:event.data.bind}));}});</script>'
      + source;
  }, [source, title, language]);
  const notify = () => ref.current?.contentWindow?.postMessage({ type: 'dil-appblock-bind', bind }, '*');
  useEffect(notify, [bind]);
  if (language && language.toLowerCase() !== 'html') return h('p', null, 'AppBlock 支持内联 HTML');
  return h('iframe', { ref, title: title ?? 'AppBlock', srcdoc: initial, sandbox: 'allow-scripts', referrerPolicy: 'no-referrer', onLoad: notify });
}

const registry = {
  ...Object.fromEntries(['box', 'row', 'col', 'grid', 'grid-item', 'flow', 'flow-item', 'card', 'form'].map((tag) => [tag, (p) => layout(tag, p)])),
  ...Object.fromEntries(['input', 'textarea', 'checkbox', 'slider', 'date-picker'].map((tag) => [tag, (p) => input(tag, p)])),
  button, pressable: button, select: (p) => optionsControl('select', p),
  'radio-group': RadioGroup, radio: Radio,
  'segmented-control': (p) => optionsControl('segmented-control', p),
  divider: (p) => h('hr', attrs(p)), spacer: (p) => h('div', { ...attrs(p), style: { minHeight: px(p.minSize ?? 4) } }),
  badge: (p) => h('span', { ...attrs(p), class: 'dil-badge' }, p.label ?? p.children),
  text: (p) => h(p.inline ? 'span' : 'p', attrs(p), p.children),
  title: (p) => h('strong', attrs(p), p.children),
  caption: (p) => h('small', attrs(p), p.children),
  Chart: ({ content, id }) => h('iframe', { id, title: 'Chart', sandbox: '', srcdoc: renderChart(content) }),
  AppBlock,
  Link: hyperlink, a: hyperlink,
};
const primitives = new Set('p span strong b em i u s del code pre h1 h2 h3 h4 h5 h6 small label br ul ol li blockquote svg g path circle rect ellipse line polyline polygon text tspan defs marker linearGradient radialGradient stop clipPath title desc use'.split(' '));

function useQuery(query) {
  const [matches, setMatches] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const media = matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return matches;
}

class ErrorBoundary extends Component {
  state = { error: null };
  componentDidCatch(error) { this.setState({ error }); }
  render({ children }, { error }) {
    return error ? h('p', { role: 'alert' }, 'DIL 无法运行：' + error.message) : children;
  }
}

globalThis.Fragment = Fragment;
globalThis.DIL = Object.freeze({
  useState, useEffect, useCallback, useMemo, useRef, useId,
  useTheme: () => useQuery('(prefers-color-scheme: dark)') ? 'dark' : 'light',
  useBreakpoint: () => useQuery('(max-width: 600px)') ? 'sm' : 'lg',
});
globalThis.component = (tag, props, ...children) => {
  if (tag === Fragment) return h(tag, props, children);
  if (typeof tag === 'string' && Object.hasOwn(registry, tag)) return h(registry[tag], props, children);
  if (primitives.has(tag)) return h(tag, props, children);
  return h('span', { role: 'status' }, 'MyNote 暂不支持组件 ' + tag);
};
globalThis.svgElement = (tag, props, ...children) => tag === Fragment || primitives.has(tag)
  ? h(tag, props, children) : null;
globalThis.mountDIL = (Note) => {
  const root = document.getElementById('dil-root');
  render(h(ErrorBoundary, null, h(Note)), root);
  const sendHeight = () => parent.postMessage({ type: 'mynote-dil-size', height: Math.ceil(root.getBoundingClientRect().height + 32) }, '*');
  if (typeof ResizeObserver === 'function') new ResizeObserver(sendHeight).observe(root);
  sendHeight();
};
