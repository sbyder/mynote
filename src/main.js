import { Crepe } from '@milkdown/crepe';
import { setCodeMirrorTheme } from '@milkdown/crepe/feature/code-mirror';
import { oneDark } from '@codemirror/theme-one-dark';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import './style.css';
import { setupSearch } from './search.js';
import { observeComponents, renderComponent } from './note-components.js';
import { prepareDIL, restoreDIL } from './dil-compiler.js';

const byId = (id) => document.getElementById(id);
const tree = byId('tree');
const scope = byId('scope');
const status = byId('status');
const message = byId('message');
const download = byId('download');
const editor = byId('editor');
observeComponents(editor);
const scrollArea = byId('scroll-area');
const menu = byId('sidebar-toggle');
const themeToggle = byId('theme-toggle');
const outline = byId('outline');
const outlineLinks = byId('outline-links');
const narrowLayout = matchMedia('(max-width: 1180px)');
const headingSelector = '.ProseMirror :is(h1, h2, h3, h4, h5, h6)';
const base = new URL(import.meta.env.BASE_URL, document.baseURI);
const notebook = new URL('notes/', base);
const draftCache = new Map();
let paths = [];
let selection;
let current;
let requested = 0;
let opening = Promise.resolve();
let outlineSignature;

function readDraft(path) {
  if (draftCache.has(path)) return draftCache.get(path);

  try {
    const draft = JSON.parse(localStorage.getItem(draftKey(path)));
    if (typeof draft?.markdown === 'string' && typeof draft.baseline === 'string') return draft;
  } catch {
    // Browsers can disable access to local storage.
  }
}

function draftKey(path) {
  return 'mynote:draft:' + noteUrl(path).href;
}

function noteUrl(path) {
  return new URL(path.split('/').map(encodeURIComponent).join('/'), notebook);
}

async function fetchNote(path) {
  const response = await fetch(noteUrl(path));
  if (!response.ok || response.headers.get('content-type')?.includes('text/html')) {
    throw new Error('笔记文件读取失败');
  }
  return response.text();
}

function routeUrl(path, fragment = '') {
  const url = new URL(location.href);
  url.searchParams.set('note', path);
  url.hash = fragment;
  return url;
}

function navigateToNote(path, fragment = '') {
  const url = routeUrl(path, fragment);
  if (url.href !== location.href) history.pushState(null, '', url);
  openNote(path, fragment);
}

function openRoute() {
  const url = new URL(location.href);
  const path = url.searchParams.get('note');
  const initial = paths.includes('欢迎使用.md') ? '欢迎使用.md' : paths[0];
  if (paths.includes(path)) openNote(path, url.hash);
  else if (initial) openNote(initial);
}

function headingText(heading) {
  return (heading.innerText ?? heading.textContent).trim();
}

function scrollToHeading(fragment) {
  scrollArea.scrollTop = 0;
  if (!fragment) return;

  let target;
  try {
    target = decodeURIComponent(fragment.slice(1));
  } catch {
    return;
  }

  const headings = [...editor.querySelectorAll(headingSelector)];
  const used = new Set();
  const heading = headings.find((element) => {
    const slug = headingText(element).toLowerCase().replace(/[^\p{L}\p{M}\p{N}_\-\s]/gu, '').replace(/\s/g, '-');
    let unique = slug;
    for (let suffix = 1; used.has(unique); suffix += 1) unique = slug + '-' + suffix;
    used.add(unique);
    return unique === target || element.id === target;
  }) ?? headings.find((element) => headingText(element) === target);
  if (heading) heading.scrollIntoView({ block: 'start' });
  else status.textContent = '找不到章节：' + target;
}

function followNoteLink(event) {
  if (event.defaultPrevented || !current || current.path !== selection) return;
  if (event.button !== 0 && event.button !== 1) return;
  const href = event.target.closest?.('a[href]')?.getAttribute('href');
  if (!href) return;

  let url;
  let path;
  try {
    url = new URL(href, noteUrl(current.path));
    if (url.origin !== notebook.origin || !url.pathname.startsWith(notebook.pathname)) return;
    path = decodeURIComponent(url.pathname.slice(notebook.pathname.length));
  } catch {
    return;
  }
  if (!/\.md$/i.test(path)) return;

  event.preventDefault();
  event.stopPropagation();
  if (!paths.includes(path)) {
    status.textContent = '找不到笔记：' + path;
    return;
  }
  if (event.button === 1 || event.ctrlKey || event.metaKey || event.shiftKey) {
    window.open(routeUrl(path, url.hash).href, '_blank', 'noopener');
  } else {
    navigateToNote(path, url.hash);
  }
}

function saveDraft(session) {
  const markdown = restoreDIL(session.crepe.getMarkdown());
  const draft = markdown === session.baseline ? null : { markdown, baseline: session.baseline };
  draftCache.set(session.path, draft);
  let label = '仓库版本';

  try {
    if (draft) {
      localStorage.setItem(draftKey(session.path), JSON.stringify(draft));
      label = '草稿已保存到此浏览器';
    } else {
      localStorage.removeItem(draftKey(session.path));
    }
  } catch {
    if (draft) label = '草稿仅保留在当前页面';
  }

  if (current === session && selection === session.path) status.textContent = label;
  return draft?.markdown ?? session.original;
}

function closeSidebar() {
  menu.setAttribute('aria-expanded', 'false');
  byId('sidebar').classList.remove('is-open');
  menu.setAttribute('aria-label', '打开笔记目录');
}

function fileTree(entries, prefix, parent) {
  const directories = new Map();
  const files = [];
  for (const entry of entries) {
    const [name, ...rest] = entry.split('/');
    if (!rest.length) {
      files.push(name);
      continue;
    }
    if (!directories.has(name)) directories.set(name, []);
    directories.get(name).push(rest.join('/'));
  }

  for (const [name, children] of directories) {
    const folder = document.createElement('details');
    const summary = document.createElement('summary');
    const branch = document.createElement('div');
    folder.open = true;
    summary.textContent = name;
    branch.className = 'branch';
    fileTree(children, prefix + name + '/', branch);
    folder.append(summary, branch);
    parent.append(folder);
  }

  for (const name of files) {
    const path = prefix + name;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'note';
    button.textContent = name;
    button.dataset.path = path;
    button.title = path;
    if (path === selection) button.setAttribute('aria-current', 'page');
    button.addEventListener('click', () => navigateToNote(path));
    parent.append(button);
  }
}

function renderTree() {
  const prefix = scope.value;
  const inScope = paths.filter((path) => path.startsWith(prefix));
  tree.replaceChildren();
  fileTree(inScope.map((path) => path.slice(prefix.length)), prefix, tree);
  byId('count').textContent = inScope.length + ' 篇笔记';
  return inScope;
}

function showMessage(label) {
  message.textContent = label;
  message.hidden = !label;
}

function applyTheme(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  themeToggle.setAttribute('aria-pressed', String(dark));
  current?.crepe.editor.action(setCodeMirrorTheme(dark ? oneDark : []));
  document.querySelector('meta[name="theme-color"]').content = dark ? '#191e1b' : '#f8f7f2';
}

function updateOutline() {
  const headings = [...editor.querySelectorAll(headingSelector)];
  const entries = headings.map((heading, index) => ({
    index,
    level: Number(heading.tagName.slice(1)),
    title: headingText(heading),
  })).filter(({ title }) => title);
  outline.hidden = entries.length === 0;
  const signature = JSON.stringify(entries);
  if (signature === outlineSignature) return;
  outlineSignature = signature;

  const firstLevel = Math.min(...entries.map(({ level }) => level));
  const list = document.createElement('ul');
  for (const { index, level, title } of entries) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    item.style.setProperty('--heading-indent', level - firstLevel);
    button.type = 'button';
    button.textContent = title;
    button.addEventListener('click', () => {
      if (narrowLayout.matches) outline.open = false;
      editor.querySelectorAll(headingSelector)[index]?.scrollIntoView({ block: 'start' });
    });
    item.append(button);
    list.append(item);
  }
  outlineLinks.replaceChildren(list);
}

function imageUrl(url, path) {
  try {
    const resolved = new URL(url, noteUrl(path));
    if (['http:', 'https:', 'data:', 'blob:'].includes(resolved.protocol)) return resolved.href;
  } catch {
    // Invalid URLs display the image placeholder.
  }
  return '';
}

function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function openNote(path, fragment = '') {
  closeSidebar();
  if (scope.value && !path.startsWith(scope.value)) {
    scope.value = '';
    renderTree();
  }
  if (path === selection && current?.path === path) {
    scrollToHeading(fragment);
    return;
  }

  if (current) saveDraft(current);
  selection = path;
  for (const button of tree.querySelectorAll('.note')) {
    if (button.dataset.path === path) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }

  const request = ++requested;
  byId('path').textContent = path.split('/').join(' / ');
  status.textContent = '';
  download.disabled = true;
  editor.hidden = true;
  outline.hidden = true;
  showMessage('正在打开笔记…');

  opening = opening.then(async () => {
    if (request !== requested) return;
    if (current) {
      const previous = current;
      current = undefined;
      await previous.crepe.destroy();
    }

    const original = await fetchNote(path);
    if (request !== requested) return;

    const draft = readDraft(path);
    const crepe = new Crepe({
      root: editor,
      defaultValue: prepareDIL(draft?.markdown ?? original),
      featureConfigs: {
        [Crepe.Feature.CodeMirror]: {
          renderPreview: renderComponent,
          previewOnlyByDefault: true,
          previewToggleText: (previewOnly) => previewOnly ? '编辑源码' : '隐藏源码',
        },
        [Crepe.Feature.Placeholder]: { text: '开始写笔记…' },
        [Crepe.Feature.ImageBlock]: {
          proxyDomURL: (url) => imageUrl(url, path),
          onUpload: readImage,
          inlineUploadButton: '上传',
          inlineUploadPlaceholderText: '或粘贴图片网址',
          blockUploadButton: '上传图片',
          blockConfirmButton: '确定',
          blockCaptionPlaceholderText: '图片说明',
          blockUploadPlaceholderText: '或粘贴图片网址',
        },
      },
    });
    const session = { path, original, crepe, baseline: draft?.baseline };
    crepe.on((listener) => listener.markdownUpdated(() => {
      if (current === session && selection === path) {
        saveDraft(session);
        updateOutline();
      }
    }));
    try {
      await crepe.create();
    } catch (error) {
      editor.replaceChildren();
      throw error;
    }
    if (request !== requested) {
      await crepe.destroy();
      return;
    }

    current = session;
    if (document.documentElement.dataset.theme === 'dark') {
      crepe.editor.action(setCodeMirrorTheme(oneDark));
    }
    session.baseline ??= restoreDIL(crepe.getMarkdown());
    saveDraft(session);
    editor.hidden = false;
    updateOutline();
    showMessage('');
    download.disabled = false;
    scrollToHeading(fragment);
  }).catch((error) => {
    if (request !== requested) return;
    console.error(error);
    showMessage('无法打开这篇笔记。点击左侧文件名可重试。');
  });
}

async function initialize() {
  const response = await fetch(new URL('note-index.json', base));
  if (!response.ok) throw new Error('笔记目录读取失败');
  paths = await response.json();

  const folders = new Set();
  for (const path of paths) {
    const parts = path.split('/');
    for (let length = 1; length < parts.length; length += 1) {
      folders.add(parts.slice(0, length).join('/') + '/');
    }
  }
  for (const folder of [...folders].sort((a, b) => a.localeCompare(b, 'zh-CN'))) {
    scope.add(new Option(folder, folder));
  }

  renderTree();
  setupSearch({
    paths,
    tree,
    fetchNote,
    readDraft: (path) => readDraft(path)?.markdown,
    openNote: navigateToNote,
  });
  if (paths.length) openRoute();
  else showMessage('还没有笔记。把 Markdown 文件放进 public/notes/ 后刷新页面。');
}

scope.addEventListener('change', () => {
  const inScope = renderTree();
  if (!inScope.includes(selection) && inScope.length) navigateToNote(inScope[0]);
});

editor.addEventListener('click', followNoteLink, true);
editor.addEventListener('auxclick', followNoteLink, true);
window.addEventListener('popstate', openRoute);

menu.addEventListener('click', () => {
  if (menu.getAttribute('aria-expanded') === 'true') {
    closeSidebar();
    return;
  }
  menu.setAttribute('aria-expanded', 'true');
  menu.setAttribute('aria-label', '关闭笔记目录');
  byId('sidebar').classList.add('is-open');
});

outline.open = !narrowLayout.matches;
narrowLayout.addEventListener('change', ({ matches }) => { outline.open = !matches; });

try {
  applyTheme(localStorage.getItem('mynote:theme') === 'dark');
} catch {
  // The light theme is the default when storage is unavailable.
}

themeToggle.addEventListener('click', () => {
  const dark = themeToggle.getAttribute('aria-pressed') !== 'true';
  applyTheme(dark);
  try {
    localStorage.setItem('mynote:theme', dark ? 'dark' : 'light');
  } catch {
    // The toggle still works for the current page.
  }
});

download.addEventListener('click', () => {
  if (!current) return;
  const markdown = saveDraft(current);
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = current.path.split('/').at(-1);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && current) saveDraft(current);
});

initialize().catch((error) => {
  console.error(error);
  showMessage('无法读取笔记目录，请刷新页面重试。');
});
