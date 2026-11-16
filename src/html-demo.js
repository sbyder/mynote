const marker = '[data-mynote-html-demo]';
const policy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; base-uri 'none'; form-action 'none'";

export function renderHtmlDemo(language, source) {
  if (language.toLowerCase() !== 'html-demo' || !source.trim()) return null;

  // The editor sanitizes previews, so only a placeholder goes through its HTML renderer.
  const placeholder = document.createElement('div');
  placeholder.dataset.mynoteHtmlDemo = encodeURIComponent(source);
  return placeholder;
}

function mountHtmlDemo(placeholder) {
  if (placeholder.firstElementChild || !placeholder.isConnected) return;

  const frame = document.createElement('iframe');
  frame.className = 'html-demo-frame';
  frame.title = 'HTML 交互预览';
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.referrerPolicy = 'no-referrer';
  frame.srcdoc = '<!doctype html><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<meta http-equiv="Content-Security-Policy" content="' + policy + '">'
    + decodeURIComponent(placeholder.dataset.mynoteHtmlDemo).replace(/^\s*<!doctype html\s*>/i, '');
  placeholder.append(frame);
}

export function observeHtmlDemos(editor) {
  const observer = new MutationObserver((mutations) => {
    for (const { addedNodes } of mutations) {
      for (const node of addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches(marker)) mountHtmlDemo(node);
        node.querySelectorAll(marker).forEach(mountHtmlDemo);
      }
    }
  });
  observer.observe(editor, { childList: true, subtree: true });
}
