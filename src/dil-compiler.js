import { Parser } from 'acorn';
import jsx from 'acorn-jsx';

const JSX = Parser.extend(jsx());
const syntax = { ecmaVersion: 'latest' };
const roots = 'box row col grid grid-item flow flow-item card divider spacer badge button input textarea slider checkbox select radio-group radio segmented-control date-picker form pressable text title caption label bold italic underline strikethrough Chart AppBlock Link a svg'.split(' ');
const rootPattern = new RegExp('^<(?:' + roots.join('|') + ')(?=[\\s/>])');
const html = JSON.stringify;

function bodyEnd(source, start) {
  const parser = JSX.tokenizer(source.slice(start + 6), syntax);
  let depth = 1;
  for (const token of parser) {
    if (token.type.label === '{' || token.type.label === '${') depth += 1;
    if (token.type.label === '}' && --depth === 0) return start + 6 + token.end;
  }
  throw new Error('未闭合的 {@body}');
}

function jsxEnd(source, start) {
  const tag = source.slice(start).match(/^<([\w-]+)/)?.[1] ?? '';
  const ends = new RegExp('(?:<\\/' + tag + '\\s*>|\\/\\s*>)', 'g');
  ends.lastIndex = start;
  for (let end; (end = ends.exec(source));) {
    try {
      const value = source.slice(start, ends.lastIndex);
      if (JSX.parseExpressionAt(value, 0, syntax).end === value.length) return ends.lastIndex;
    } catch {
      // This terminator belongs to a nested tag or JavaScript expression.
    }
  }
}

const fencePattern = /^ {0,3}(`{3,}|~{3,})(.*)$/;

function mapMarkdown(markdown, restore) {
  const chunks = [];
  let cursor = 0;
  let fence;
  while (cursor < markdown.length) {
    const next = markdown.indexOf('\n', cursor);
    const end = next < 0 ? markdown.length : next + 1;
    const line = markdown.slice(cursor, end).trimEnd();
    const marker = line.match(fencePattern);
    if (marker && !fence && restore && marker[2].trim() === 'dil-native') {
      const close = new RegExp('^ {0,3}' + marker[1][0] + '{' + marker[1].length + ',}[ \\t]*$', 'm');
      const inner = markdown.slice(end);
      const match = close.exec(inner);
      if (match) {
        chunks.push(inner.slice(0, match.index));
        cursor = end + match.index + match[0].length;
        continue;
      }
    }
    if (marker) {
      if (!fence) fence = marker[1];
      else if (!marker[2].trim() && marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = undefined;
    } else if (!fence && !restore && !/^ {4}|^\t/.test(line)) {
      const start = cursor + line.length - line.trimStart().length;
      let finish;
      try {
        const rest = markdown.slice(start);
        if (rest.startsWith('{@body') && /\s/.test(rest[6])) {
          const after = bodyEnd(markdown, start);
          const first = after + (markdown.slice(after).match(/^\s*/)?.[0].length ?? 0);
          if (/^<(?:[A-Za-z]|>)/.test(markdown.slice(first))) finish = jsxEnd(markdown, first);
        } else if (rootPattern.test(rest) || rest.startsWith('<>')) {
          finish = jsxEnd(markdown, start);
        }
        while (finish) {
          const after = finish + markdown.slice(finish).match(/^\s*/)[0].length;
          if (!/^<(?:[A-Za-z]|>)/.test(markdown.slice(after))) break;
          const sibling = jsxEnd(markdown, after);
          if (!sibling) break;
          finish = sibling;
        }
      } catch {
        // Leave incomplete markup in the document until it is valid.
      }
      if (finish && /^ *(?:\r?\n|$)/.test(markdown.slice(finish))) {
        const block = markdown.slice(start, finish);
        const ticks = '`'.repeat(Math.max(2, ...[...block.matchAll(/`+/g)].map(([seq]) => seq.length)) + 1);
        chunks.push('\n' + ticks + 'dil-native\n' + block + '\n' + ticks + '\n');
        cursor = finish;
        continue;
      }
    }
    chunks.push(markdown.slice(cursor, end));
    cursor = end;
  }
  return chunks.join('');
}

export const prepareDIL = (markdown) => mapMarkdown(markdown, false);
export const restoreDIL = (markdown) => mapMarkdown(markdown, true);

export function compileDIL(source) {
  const after = source.startsWith('{@body') ? bodyEnd(source, 0) : 0;
  const body = after ? source.slice(6, after - 1) : '';
  const tree = '<>' + source.slice(after).trim() + '</>';
  const program = 'function Note() {\n' + body + '\nreturn (' + tree + ');\n}';
  const ast = JSX.parse(program, syntax);

  function emit(node, inSvg = false) {
    if (node.type === 'JSXFragment') return call('Fragment', '{}', node.children, inSvg);
    if (node.type === 'JSXElement') {
      const { name, attributes } = node.openingElement;
      if (name.type !== 'JSXIdentifier') throw new Error('组件名需要是简单标签');
      const props = attributes.map((attr) => {
        if (attr.type === 'JSXSpreadAttribute') return '...(' + emit(attr.argument, inSvg) + ')';
        const value = attr.value;
        return html(attr.name.name) + ':' + (value?.type === 'Literal' ? html(value.value) : value ? emit(value, inSvg) : 'true');
      });
      return call(html(name.name), '{' + props.join(',') + '}', node.children, inSvg || name.name === 'svg');
    }
    if (node.type === 'JSXExpressionContainer') {
      return node.expression.type === 'JSXEmptyExpression' ? 'null' : '(' + emit(node.expression, inSvg) + ')';
    }
    if (node.type === 'JSXText') {
      return html(node.value.includes('\n') ? node.value.replace(/\s+/g, ' ').trim() : node.value);
    }
    if (node.type === 'Literal') return program.slice(node.start, node.end);

    const children = Object.values(node).flat().filter((value) => value?.type && typeof value.start === 'number');
    const nested = children.sort((a, b) => a.start - b.start).filter((child, i) => !i || child.start !== children[i - 1].start);
    let cursor = node.start;
    let output = '';
    for (const child of nested) {
      output += program.slice(cursor, child.start) + emit(child, inSvg);
      cursor = child.end;
    }
    return output + program.slice(cursor, node.end);
  }

  function call(tag, props, children, inSvg) {
    const create = inSvg ? 'svgElement' : 'component';
    return create + '(' + [tag, props, ...children.map((child) => emit(child, inSvg))].join(',') + ')';
  }

  return emit(ast.body[0]) + '\nmountDIL(Note);';
}
