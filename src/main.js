import { Crepe } from '@milkdown/crepe';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import './style.css';

const byId = (id) => document.getElementById(id);
const tree = byId('tree');
const scope = byId('scope');
const status = byId('status');
const message = byId('message');
const download = byId('download');
const editor = byId('editor');
const menu = byId('sidebar-toggle');
const base = new URL(import.meta.env.BASE_URL, document.baseURI);
const notebook = new URL('notes/', base);
const draftCache = new Map();
let paths = [];
let selection;
let current;
let requested = 0;
let opening = Promise.resolve();

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

function saveDraft(session) {
  const markdown = session.crepe.getMarkdown();
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
    button.addEventListener('click', () => openNote(path));
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

function openNote(path) {
  closeSidebar();
  if (path === selection && current?.path === path) return;

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
  showMessage('正在打开笔记…');

  opening = opening.then(async () => {
    if (request !== requested) return;
    if (current) {
      const previous = current;
      current = undefined;
      await previous.crepe.destroy();
    }

    const response = await fetch(noteUrl(path));
    if (!response.ok || response.headers.get('content-type')?.includes('text/html')) {
      throw new Error('笔记文件读取失败');
    }
    const original = await response.text();
    if (request !== requested) return;

    const draft = readDraft(path);
    const crepe = new Crepe({
      root: editor,
      defaultValue: draft?.markdown ?? original,
      featureConfigs: {
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
      if (current === session) saveDraft(session);
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
    session.baseline ??= crepe.getMarkdown();
    saveDraft(session);
    editor.hidden = false;
    showMessage('');
    download.disabled = false;
    byId('scroll-area').scrollTop = 0;
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
  const initial = paths.includes('欢迎使用.md') ? '欢迎使用.md' : paths[0];
  if (initial) openNote(initial);
  else showMessage('还没有笔记。把 Markdown 文件放进 public/notes/ 后刷新页面。');
}

scope.addEventListener('change', () => {
  const inScope = renderTree();
  if (!inScope.includes(selection) && inScope.length) openNote(inScope[0]);
});

menu.addEventListener('click', () => {
  if (menu.getAttribute('aria-expanded') === 'true') {
    closeSidebar();
    return;
  }
  menu.setAttribute('aria-expanded', 'true');
  menu.setAttribute('aria-label', '关闭笔记目录');
  byId('sidebar').classList.add('is-open');
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
