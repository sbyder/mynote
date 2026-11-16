import { renderChart } from './note-chart.js';
import { compileDIL } from './dil-compiler.js';
import runtime from 'virtual:dil-runtime';
import dilStyle from './dil-style.css?raw';

const dilFrames = new WeakMap();
const marker = '[data-mynote-component]';
const policy = "default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; base-uri 'none'; form-action 'none'";

function appBlock(source) {
  if (!source.startsWith('{')) return { html: source, title: 'AppBlock', scripts: true };

  const { content, ...props } = JSON.parse(source);
  if (typeof content !== 'string') throw new Error('AppBlock 的 content 必须是 HTML 字符串');
  if (props.language && props.language.toLowerCase() !== 'html') {
    throw new Error('AppBlock 支持 HTML 内容');
  }
  const encoded = JSON.stringify(encodeURIComponent(JSON.stringify(props)));
  const bindings = '<script>window.appBlock=JSON.parse(decodeURIComponent(' + encoded + '));</script>';
  return { html: bindings + content, title: props.title || 'AppBlock', scripts: true };
}

export function renderComponent(language, source) {
  const body = source.trim().replace(/^<!doctype\s+html\s*>\s*/i, '');
  if (!body) return null;

  let preview;
  try {
    switch (language.toLowerCase()) {
      case 'dil-native':
      case 'dil': {
        const code = encodeURIComponent(runtime + '\n' + compileDIL(body));
        const bootstrap = '<script>const script=document.createElement("script");script.textContent=decodeURIComponent('
          + JSON.stringify(code) + ');document.body.append(script);</script>';
        preview = {
          html: '<style>' + dilStyle + '</style><div id="dil-root"></div>' + bootstrap,
          title: 'DIL 交互组件', scripts: true, dil: true,
        };
        break;
      }
      case 'chart': {
        const block = JSON.parse(body);
        preview = { html: renderChart(block.content ?? block), title: String(block.id ?? 'Chart') };
        break;
      }
      case 'appblock':
        preview = appBlock(body);
        break;
      case 'html-demo': // Existing browser drafts can still contain this fence.
        preview = { html: body, title: 'AppBlock', scripts: true };
        break;
      case 'svg':
        if (!/^<svg(?:\s|>)/i.test(body) || !/<\/svg>$/i.test(body)) {
          throw new Error('svg 代码块需要完整的 <svg> 元素');
        }
        preview = { html: body, title: 'SVG 图示', graphic: true };
        break;
      default:
        return null;
    }
  } catch (error) {
    const message = document.createElement('p');
    message.textContent = language + ' 无法预览：' + error.message;
    return message;
  }

  // Only the encoded placeholder goes through the editor's HTML sanitizer.
  const placeholder = document.createElement('div');
  placeholder.dataset.mynoteComponent = encodeURIComponent(JSON.stringify(preview));
  return placeholder;
}

function mountComponent(placeholder) {
  if (placeholder.firstElementChild || !placeholder.isConnected) return;

  const { html, title, scripts, graphic, dil } = JSON.parse(decodeURIComponent(placeholder.dataset.mynoteComponent));
  const frame = document.createElement('iframe');
  frame.className = 'note-component-frame';
  if (dil) placeholder.classList.add('dil-preview');
  frame.title = title;
  frame.setAttribute('sandbox', scripts ? 'allow-scripts' : '');
  frame.referrerPolicy = 'no-referrer';
  const scriptPolicy = scripts ? "script-src 'unsafe-inline'" : "script-src 'none'";
  const svgStyle = graphic
    ? '<style>html,body{margin:0;height:100%;color-scheme:light dark}body{display:grid;place-items:center}body>svg{max-width:100%;max-height:100%;font-family:system-ui}</style>'
    : '';
  frame.srcdoc = '<!doctype html><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<meta http-equiv="Content-Security-Policy" content="' + policy + '; ' + scriptPolicy
    + (dil ? '; frame-src about:' : '') + '">'
    + svgStyle + html;
  placeholder.append(frame);
  if (dil && frame.contentWindow) dilFrames.set(frame.contentWindow, placeholder);
}

export function observeComponents(editor) {
  const observer = new MutationObserver((mutations) => {
    for (const { addedNodes } of mutations) {
      for (const node of addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches(marker)) mountComponent(node);
        node.querySelectorAll(marker).forEach(mountComponent);
      }
    }
  });
  observer.observe(editor, { childList: true, subtree: true });
  window.addEventListener('message', (event) => {
    if (event.origin !== 'null' || event.data?.type !== 'mynote-dil-size') return;
    const placeholder = event.source && dilFrames.get(event.source);
    const { height } = event.data;
    if (placeholder?.isConnected && Number.isFinite(height)) {
      placeholder.style.height = Math.min(850, Math.max(80, height)) + 'px';
    }
  });
}
