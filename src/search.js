function excerpt(text, query, terms) {
  const lower = text.toLowerCase();
  let index = lower.indexOf(query);
  if (index < 0) {
    index = terms.map((term) => lower.indexOf(term)).filter((i) => i >= 0)
      .reduce((first, i) => Math.min(first, i), text.length);
  }
  if (index === text.length) index = 0;
  const start = Math.max(0, index - 30);
  const end = Math.min(text.length, Math.max(index + query.length, start + 110));
  return (start ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

function searchNotes(paths, query, sources, readDraft) {
  const terms = query.split(' ');
  const matches = [];
  for (const path of paths) {
    const name = path.split('/').at(-1);
    const title = name.replace(/\.md$/i, '').toLowerCase();
    const body = (readDraft(path) ?? sources.get(path) ?? '').replace(/\s+/g, ' ').trim();
    const lower = body.toLowerCase();
    if (!terms.every((term) => title.includes(term) || lower.includes(term))) continue;
    const rank = title.includes(query) ? 3
      : terms.some((term) => title.includes(term)) ? 2
      : lower.includes(query) ? 1 : 0;
    matches.push({ path, name, rank, detail: excerpt(body, query, terms) });
  }
  return matches.sort((a, b) => b.rank - a.rank);
}

export function setupSearch({ paths, tree, fetchNote, readDraft, openNote }) {
  const input = document.getElementById('note-search');
  const results = document.getElementById('search-results');
  const status = document.createElement('p');
  const list = document.createElement('ul');
  status.className = 'search-status';
  status.setAttribute('role', 'status');
  results.append(status, list);

  const sources = new Map();
  let loading;
  let revision = 0;
  let matches = [];

  function loadNotes() {
    loading ??= Promise.allSettled(paths.filter((path) => !sources.has(path)).map(async (path) => {
      sources.set(path, await fetchNote(path));
    })).finally(() => { loading = undefined; });
    return loading;
  }

  async function refresh() {
    const request = ++revision;
    const query = input.value.trim().toLowerCase().replace(/\s+/g, ' ');
    tree.hidden = Boolean(query);
    results.hidden = !query;
    matches = [];
    list.replaceChildren();
    if (!query) return;

    if (sources.size < paths.length) {
      status.textContent = '正在读取笔记正文…';
      await loadNotes();
    }
    if (request !== revision) return;

    matches = searchNotes(paths, query, sources, readDraft);
    const unavailable = paths.filter((path) => !sources.has(path) && readDraft(path) == null).length;
    status.textContent = (matches.length ? matches.length + ' 篇匹配' : '未找到匹配的笔记')
      + (unavailable ? ' · ' + unavailable + ' 篇正文未能读取' : '');
    for (const { path, name, detail } of matches) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'search-result';
      const title = document.createElement('strong');
      title.textContent = name;
      const location = document.createElement('small');
      location.textContent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '根目录';
      const snippet = document.createElement('span');
      snippet.textContent = detail;
      button.append(title, location, snippet);
      button.addEventListener('click', () => openNote(path));
      item.append(button);
      list.append(item);
    }
  }

  input.disabled = false;
  input.addEventListener('input', refresh);
  input.addEventListener('keydown', (event) => {
    if (event.isComposing) return;
    if (event.key === 'Escape' && input.value) {
      event.preventDefault();
      input.value = '';
      refresh();
    }
    if (event.key === 'Enter' && matches.length) {
      event.preventDefault();
      openNote(matches[0].path);
    }
  });
}
