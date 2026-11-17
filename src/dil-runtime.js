import { cloneElement, Component, Fragment, h, render, toChildArray } from 'preact';
import { useState, useEffect, useCallback, useMemo, useRef, useId } from 'preact/hooks';
import { renderChart } from './note-chart.js';

const spacing = (value) => typeof value === 'number' ? value * 4 + 'pt' : value;
const length = (value) => typeof value === 'number' ? value + 'px' : value;
const align = (value) => ({
  start: 'flex-start', end: 'flex-end', between: 'space-between',
  around: 'space-around', evenly: 'space-evenly',
})[value] ?? value;
const fontSizes = {
  xs: '0.75rem', sm: '0.875rem', md: '1rem', lg: '1.125rem',
  xl: '1.25rem', '2xl': '1.5rem', '3xl': '1.875rem', '4xl': '2.25rem',
};
const tones = {
  primary: '#39815f', success: '#24865a', danger: '#c34f4f',
  warning: '#a56b18', info: '#3976bd', neutral: '#737b76',
  blue: '#3976bd', green: '#24865a', red: '#c34f4f',
  purple: '#8b5cc7', orange: '#bd7138', gray: '#737b76',
};
const tone = (value, fallback = 'var(--dil-accent)') => tones[value] ?? value ?? fallback;
const attrs = (props) => Object.fromEntries(
  ['id', 'name', 'disabled', 'required', 'placeholder', 'role', 'title', 'tabIndex',
    'htmlFor', 'aria-label', 'aria-describedby', 'aria-live', 'aria-pressed']
    .filter((key) => props[key] != null).map((key) => [key, props[key]]),
);
const fontSize = (value, fallback) => value == null ? fallback : fontSizes[value] ?? length(value);

function textStyle(props, fallbackSize) {
  const style = {
    color: props.color,
    fontSize: fontSize(props.size, fallbackSize),
    fontWeight: props.weight ?? (props.strong ? 650 : undefined),
    fontStyle: props.italic ? 'italic' : undefined,
    textAlign: props.textAlign,
    width: length(props.width),
    maxWidth: length(props.maxWidth),
    background: props.highlight || undefined,
    textDecoration: props.lineThrough ? 'line-through' : props.underline ? 'underline' : undefined,
    whiteSpace: props.preserveWhitespace ? 'pre-wrap' : undefined,
  };
  if (props.truncate) {
    style.overflow = 'hidden';
    style.textOverflow = 'ellipsis';
    style.whiteSpace = 'nowrap';
  }
  if (props.maxLines != null) {
    style.display = '-webkit-box';
    style.webkitBoxOrient = 'vertical';
    style.webkitLineClamp = props.maxLines;
    style.overflow = 'hidden';
  }
  return style;
}

function layout(tag, props) {
  const isGrid = tag === 'grid' || tag === 'flow';
  const isItem = tag === 'grid-item' || tag === 'flow-item';
  const direction = props.direction === 'horizontal' ? 'row'
    : props.direction === 'vertical' ? 'column'
      : props.direction ?? (tag === 'row' ? 'row' : 'column');
  const style = {
    display: isGrid ? 'grid' : isItem ? 'block' : 'flex',
    flexDirection: isGrid || isItem ? undefined : direction,
    flexWrap: props.wrap ? 'wrap' : undefined,
    alignItems: align(props.align),
    justifyContent: align(props.justify),
    gap: props.gap == null ? (props.disableAutoSpacing ? 0 : undefined) : spacing(props.gap),
    // A CSS custom property also feeds gap: some Preact DOM updates omit
    // shorthand spacing; this ensures authored DIL gap values are retained.
    '--dil-gap': props.gap == null ? (props.disableAutoSpacing ? '0px' : undefined) : spacing(props.gap),
    padding: spacing(props.padding),
    width: length(props.width),
    height: length(props.height),
    maxWidth: length(props.maxWidth),
    minWidth: length(props.minWidth),
    maxHeight: length(props.maxHeight),
    minHeight: length(props.minHeight),
    background: props.background,
    border: props.border,
    borderRadius: length(props.radius),
    flex: props.flex,
    overflow: props.scrollable ? 'auto' : props.clip ? 'hidden' : undefined,
    columnGap: props.columnGap == null ? undefined : spacing(props.columnGap),
    rowGap: props.rowGap == null ? undefined : spacing(props.rowGap),
    aspectRatio: props.aspectRatio,
    boxShadow: props.shadow === true ? '0 8px 24px rgb(0 0 0 / .12)' : props.shadow || undefined,
  };

  if (props.size != null && !Object.hasOwn(fontSizes, String(props.size))) {
    style.width ??= length(props.size);
    style.height ??= length(props.size);
  }
  if (props.maxSize != null) {
    style.maxWidth ??= length(props.maxSize);
    style.maxHeight ??= length(props.maxSize);
  }
  if (props.minSize != null) {
    style.minWidth ??= length(props.minSize);
    style.minHeight ??= length(props.minSize);
  }
  if (isGrid) {
    if (props.minChildWidth != null) {
      style.gridTemplateColumns = 'repeat(auto-fit, minmax(' + length(props.minChildWidth) + ', 1fr))';
    } else if (props.columns != null) {
      // When two columns would be too narrow, keep the cards readable.
      style.gridTemplateColumns = props.columns === 2
        ? 'repeat(auto-fit, minmax(min(100%, 245px), 1fr))'
        : typeof props.columns === 'number'
          ? 'repeat(' + props.columns + ', minmax(0, 1fr))' : props.columns;
    }
    if (props.rows != null) {
      style.gridTemplateRows = typeof props.rows === 'number'
        ? 'repeat(' + props.rows + ', minmax(0, 1fr))' : props.rows;
    }
    if (tag === 'flow' && props.layout) {
      style.gridAutoFlow = props.layout === 'vertical' ? 'column' : props.layout === 'horizontal' ? 'row' : props.layout;
    }
  }
  if (isItem) {
    if (props.span != null) style.gridColumn = typeof props.span === 'number' ? 'span ' + props.span : props.span;
    if (props.rowSpan != null) style.gridRow = typeof props.rowSpan === 'number' ? 'span ' + props.rowSpan : props.rowSpan;
  }

  const variant = tag === 'card' ? ' dil-card--' + (props.variant ?? 'outline') : '';
  const className = 'dil-' + tag + variant + (props.className ? ' ' + props.className : '');
  return h(tag === 'form' ? 'form' : 'div', {
    ...attrs(props),
    class: className,
    style,
    'data-theme': props.theme,
    onSubmit: tag === 'form' ? (event) => { event.preventDefault(); props.onSubmit?.(); } : undefined,
  }, props.children);
}

function button(props) {
  const variant = props.variant ?? 'solid';
  const size = props.size ?? 'md';
  const style = {
    width: props.block ? '100%' : props.uniform ? length(40) : undefined,
    '--dil-tone': tone(props.color),
  };
  return h('button', {
    ...attrs(props),
    type: props.submit ? 'submit' : 'button',
    class: 'dil-button dil-button--' + variant + ' dil-button--' + size
      + (props.pill ? ' dil-button--pill' : '') + (props.uniform ? ' dil-button--uniform' : ''),
    disabled: props.disabled || props.loading,
    'aria-busy': props.loading ? 'true' : undefined,
    onClick: () => props.onClick?.(),
    style,
  }, props.children ?? props.label);
}

function pressable(props) {
  const disabled = Boolean(props.disabled);
  const style = {
    padding: spacing(props.padding ?? 2),
    background: props.background,
    border: props.border,
    borderRadius: length(props.radius ?? 10),
    width: length(props.width),
    minWidth: length(props.minWidth),
    minHeight: length(props.minHeight),
    flex: props.flex,
    cursor: disabled ? 'default' : 'pointer',
  };
  return h('div', {
    ...attrs(props),
    class: 'dil-pressable' + (disabled ? ' is-disabled' : ''),
    role: props.role ?? 'button',
    tabIndex: disabled ? -1 : (props.tabIndex ?? 0),
    'aria-disabled': disabled ? 'true' : undefined,
    title: props.tooltip ?? props.title,
    style,
    onClick: () => { if (!disabled) props.onClick?.(); },
    onKeyDown: (event) => {
      if (!disabled && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        props.onClick?.();
      }
    },
  }, props.children);
}

function input(tag, props) {
  const type = {
    slider: 'range', checkbox: 'checkbox', 'date-picker': 'date',
    input: props.inputType ?? 'text',
  }[tag];
  const range = tag === 'slider';
  const check = tag === 'checkbox';
  const valueProps = check
    ? { checked: props.checked, defaultChecked: props.defaultChecked }
    : { value: props.value, defaultValue: props.defaultValue };
  if (range && props.value != null) valueProps.value = String(props.value);
  if (range && props.defaultValue != null) valueProps.defaultValue = String(props.defaultValue);
  const rangeMin = Number(props.min ?? 0);
  const rangeMax = Number(props.max ?? 100);
  const rangeValue = Number(props.value ?? props.defaultValue ?? rangeMin);
  const rangePercent = rangeMax > rangeMin
    ? Math.max(0, Math.min(100, (rangeValue - rangeMin) / (rangeMax - rangeMin) * 100))
    : 0;

  const control = h(tag === 'textarea' ? 'textarea' : 'input', {
    ...attrs(props),
    ...valueProps,
    type,
    min: props.min,
    max: props.max,
    step: props.step,
    rows: props.rows,
    class: check ? 'dil-check-control' : 'dil-control dil-control--' + (props.size ?? 'md')
      + (props.pill ? ' dil-control--pill' : '')
      + (props.invalid ? ' is-invalid' : ''),
    style: check ? undefined : {
      fontSize: fontSize(props.fontSize),
      resize: tag === 'textarea' ? 'vertical' : undefined,
      '--dil-range-progress': range ? rangePercent + '%' : undefined,
    },
    'aria-invalid': props.invalid ? 'true' : undefined,
    'aria-label': props.label ?? props['aria-label'],
    onInput: check ? undefined : (event) => props.onChange?.(
      range ? event.currentTarget.valueAsNumber : event.currentTarget.value,
    ),
    onChange: check ? (event) => props.onChange?.(event.currentTarget.checked) : undefined,
  });

  if (!props.label) return control;
  if (check) {
    return h('label', { class: 'dil-checkbox-field' }, control, h('span', null, props.label));
  }
  return h('label', { class: 'dil-field-label', htmlFor: props.id },
    h('span', null, props.label), control);
}

function optionsControl(tag, props) {
  const options = (props.options ?? []).map((option) =>
    typeof option === 'object' ? option : { label: option, value: option },
  );
  const valueOf = (string) => options.find((option) => String(option.value) === string)?.value ?? string;
  if (tag === 'select') {
    return h('select', {
      ...attrs(props),
      class: 'dil-control dil-control--' + (props.size ?? 'md') + (props.pill ? ' dil-control--pill' : ''),
      value: props.value,
      defaultValue: props.defaultValue,
      'aria-label': props.label,
      onChange: (event) => props.onChange?.(valueOf(event.currentTarget.value)),
    },
    props.placeholder && h('option', { disabled: !props.clearable, value: '' }, props.placeholder),
    options.map(({ value, label, disabled }) =>
      h('option', { key: value, value, disabled }, label ?? value),
    ));
  }
  return h(Segmented, { ...props, options });
}

function Segmented({ options, value, defaultValue, onChange, disabled, label, id, size, pill }) {
  const [initial, setInitial] = useState(defaultValue);
  return h('div', {
    id,
    class: 'dil-segmented dil-segmented--' + (size ?? 'md') + (pill ? ' dil-segmented--pill' : ''),
    role: 'group',
    'aria-label': label,
  }, options.map((item) => h('button', {
    key: item.value,
    type: 'button',
    disabled: disabled || item.disabled,
    'aria-pressed': Object.is(value ?? initial, item.value),
    onClick: () => { setInitial(item.value); onChange?.(item.value); },
  }, item.label ?? item.value)));
}

function RadioGroup(props) {
  const id = useId();
  const [initial, setInitial] = useState(props.defaultValue);
  const selected = props.value ?? initial;
  return h('div', {
    id: props.id,
    role: 'radiogroup',
    'aria-label': props.label,
    class: props.direction === 'vertical' ? 'dil-radio-group dil-radio-group--vertical' : 'dil-radio-group',
  }, toChildArray(props.children).map((node) => {
    if (node?.type !== Radio) return node;
    return cloneElement(node, {
      group: props.name ?? id,
      disabled: props.disabled || node.props.disabled,
      required: props.required || node.props.required,
      checked: Object.is(node.props.value, selected),
      choose: () => { setInitial(node.props.value); props.onChange?.(node.props.value); },
    });
  }));
}

function Radio(props) {
  return h('label', { class: 'dil-checkbox-field' }, h('input', {
    ...attrs(props),
    type: 'radio',
    name: props.group,
    checked: props.checked,
    disabled: props.disabled,
    required: props.required,
    onChange: props.choose,
  }), h('span', null, props.children ?? props.value));
}

function badge(props) {
  return h('span', {
    ...attrs(props),
    class: 'dil-badge dil-badge--' + (props.variant ?? 'soft')
      + (props.pill ? ' dil-badge--pill' : ''),
    style: {
      '--dil-tone': tone(props.color),
      padding: props.padding == null ? undefined : spacing(props.padding),
      fontSize: fontSize(props.size, undefined),
      fontWeight: props.weight,
      maxWidth: length(props.maxWidth),
    },
  }, props.label ?? props.children);
}

function title(props) {
  return h('div', {
    ...attrs(props),
    class: 'dil-title',
    style: textStyle({ ...props, strong: props.strong ?? true }, fontSize(props.size, '1.2rem')),
  }, props.children);
}

function text(props) {
  return h(props.inline ? 'span' : 'p', {
    ...attrs(props),
    class: 'dil-text',
    style: textStyle(props),
  }, props.children);
}

function caption(props) {
  return h('small', {
    ...attrs(props),
    class: 'dil-caption',
    style: textStyle({ ...props, color: props.color ?? 'var(--dil-muted)' }, fontSize(props.size, '0.84rem')),
  }, props.children);
}

function label(props) {
  return h('label', {
    ...attrs(props),
    class: 'dil-label',
    style: textStyle({ ...props, strong: props.strong ?? true }, fontSize(props.size, '0.9rem')),
  }, props.children);
}

function hyperlink(props) {
  const url = props.url ?? props.href ?? '';
  const safe = /^(?:https?:|mailto:|tel:|#)/i.test(url) ? url : undefined;
  return h('a', {
    href: safe,
    target: url.startsWith('#') ? undefined : '_blank',
    rel: 'noopener noreferrer',
    title: props.title,
  }, props.children ?? props.title ?? url);
}

function AppBlock({ content, children, title: heading, language, bind, ...metadata }) {
  const ref = useRef(null);
  const source = content ?? toChildArray(children).join('');
  const meta = JSON.stringify({ title: heading, language, bind, ...metadata });
  const initial = useMemo(() => {
    const encoded = JSON.stringify(encodeURIComponent(meta));
    return '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<script>window.appBlock=JSON.parse(decodeURIComponent(' + encoded + '));'
      + 'addEventListener("message",event=>{if(event.source===parent&&event.data?.type==="dil-appblock-bind"){'
      + 'window.appBlock.bind=event.data.bind;dispatchEvent(new CustomEvent("appblock:bind",{detail:event.data.bind}));}});</script>'
      + source;
  }, [source, meta]);
  const notify = () => ref.current?.contentWindow?.postMessage({ type: 'dil-appblock-bind', bind }, '*');
  useEffect(notify, [bind]);
  if (language && language.toLowerCase() !== 'html') return h('p', null, 'AppBlock 支持内联 HTML');
  return h('iframe', {
    ref,
    class: 'dil-appblock',
    title: heading ?? 'AppBlock',
    srcdoc: initial,
    sandbox: 'allow-scripts',
    referrerPolicy: 'no-referrer',
    onLoad: notify,
  });
}

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

// Theme messages must work for every component, not only notes calling DIL.useTheme().
addEventListener('message', (event) => {
  if (event.source !== parent || event.data?.type !== 'mynote-theme') return;
  const theme = event.data.theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  dispatchEvent(new CustomEvent('mynote:themechange', { detail: theme }));
});

function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme
    || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  useEffect(() => {
    const onTheme = (event) => setTheme(event.detail);
    addEventListener('mynote:themechange', onTheme);
    return () => removeEventListener('mynote:themechange', onTheme);
  }, []);
  return theme;
}

function useBreakpoint() {
  const small = useQuery('(max-width: 600px)');
  const medium = useQuery('(min-width: 601px) and (max-width: 1024px)');
  return small ? 'sm' : medium ? 'md' : 'lg';
}

const registry = {
  ...Object.fromEntries(
    ['box', 'row', 'col', 'grid', 'grid-item', 'flow', 'flow-item', 'card', 'form']
      .map((tag) => [tag, (props) => layout(tag, props)]),
  ),
  ...Object.fromEntries(
    ['input', 'textarea', 'checkbox', 'slider', 'date-picker']
      .map((tag) => [tag, (props) => input(tag, props)]),
  ),
  button,
  pressable,
  select: (props) => optionsControl('select', props),
  'radio-group': RadioGroup,
  radio: Radio,
  'segmented-control': (props) => optionsControl('segmented-control', props),
  divider: (props) => h('hr', {
    ...attrs(props),
    class: 'dil-divider',
    style: {
      borderColor: props.color,
      borderTopWidth: props.size == null ? undefined : spacing(props.size),
      marginBlock: props.spacing == null ? undefined : spacing(props.spacing),
    },
  }),
  spacer: (props) => h('div', {
    ...attrs(props),
    class: 'dil-spacer',
    style: { minHeight: length(props.minSize ?? 4), minWidth: length(props.minSize ?? 4) },
  }),
  badge,
  text,
  title,
  caption,
  label,
  bold: (props) => h('strong', attrs(props), props.children),
  italic: (props) => h('em', attrs(props), props.children),
  underline: (props) => h('u', attrs(props), props.children),
  strikethrough: (props) => h('s', attrs(props), props.children),
  Chart: ({ content, id }) => {
    const theme = useTheme();
    const srcdoc = renderChart(content).replace('color-scheme: light dark;', 'color-scheme: ' + theme + ';');
    return h('iframe', {
      id,
      class: 'dil-chart-frame',
      title: 'Chart',
      sandbox: '',
      srcdoc,
    });
  },
  AppBlock,
  Link: hyperlink,
  a: hyperlink,
};

const htmlPrimitives = new Set((
  'p span strong b em i u s del ins code pre h1 h2 h3 h4 h5 h6 small mark kbd samp sub sup br hr '
  + 'ul ol li blockquote details summary figure figcaption table thead tbody tfoot tr td th caption '
  + 'img picture source audio video'
).split(' '));
const svgPrimitives = new Set((
  'svg g path circle rect ellipse line polyline polygon text tspan defs marker linearGradient radialGradient stop '
  + 'clipPath title desc use filter feGaussianBlur feDropShadow feColorMatrix feOffset feBlend feMerge feMergeNode '
  + 'mask pattern symbol textPath animate animateTransform set'
).split(' '));

globalThis.Fragment = Fragment;
globalThis.DIL = Object.freeze({
  useState, useEffect, useCallback, useMemo, useRef, useId,
  useTheme,
  useBreakpoint,
});
globalThis.component = (tag, props, ...children) => {
  if (tag === Fragment) return h(tag, props, children);
  if (typeof tag === 'string' && Object.hasOwn(registry, tag)) return h(registry[tag], props, children);
  if (htmlPrimitives.has(tag)) return h(tag, props, children);
  return h('span', { role: 'status' }, 'MyNote 暂不支持组件 ' + tag);
};
globalThis.svgElement = (tag, props, ...children) =>
  tag === Fragment || svgPrimitives.has(tag) ? h(tag, props, children) : null;

globalThis.mountDIL = (Note) => {
  const root = document.getElementById('dil-root');
  if (!root) return;
  render(h(ErrorBoundary, null, h(Note)), root);
  const sendHeight = () => parent.postMessage({
    type: 'mynote-dil-size',
    height: Math.ceil(root.getBoundingClientRect().height + 4),
  }, '*');
  if (typeof ResizeObserver === 'function') new ResizeObserver(sendHeight).observe(root);
  sendHeight();
  document.fonts?.ready?.then(sendHeight);
};

class ErrorBoundary extends Component {
  state = { error: null };
  componentDidCatch(error) { this.setState({ error }); }
  render({ children }, { error }) {
    return error ? h('p', { role: 'alert' }, 'DIL 无法运行：' + error.message) : children;
  }
}
