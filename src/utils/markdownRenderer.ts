import { marked, type Tokens } from 'marked';
import hljs from 'highlight.js';
import 'highlight.js/styles/atom-one-dark.css';

try {
  marked.use({
    breaks: true,
    gfm: true,
    renderer: {
      space(token: Tokens.Space) {
        const blankLineCount = Math.max(1, (token.raw.match(/\n/g) || []).length - 1);
        return `<div class="md-blank-lines" style="--md-blank-lines:${blankLineCount}" aria-hidden="true"></div>`;
      },
    },
  });
} catch {
  /* fallback */
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function highlightCode(code: string, lang: string): string {
  const raw = decodeHtmlEntities(code);
  try {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(raw, { language: lang, ignoreIllegals: true }).value;
    }
    return hljs.highlightAuto(raw).value;
  } catch {
    return code;
  }
}

function decorateCodeBlocks(html: string): string {
  return html.replace(
    /<pre><code( class="language-([^"]+)")?>([\s\S]*?)<\/code><\/pre>/g,
    (_match, _classAttr = '', lang = '', code = '') => {
      const normalized = code.endsWith('\n') ? code.slice(0, -1) : code;
      const highlighted = highlightCode(normalized, lang);
      const lines: string[] = highlighted.split('\n');
      const numbered = lines.map((line: string, index: number) => (
        `<span class="md-code-line"><span class="md-code-number">${index + 1}</span><span class="md-code-text">${line || ' '}</span></span>`
      )).join('');
      const language = lang ? `<div class="md-code-lang">${lang}</div>` : '';
      const codeClass = `hljs${lang ? ` language-${lang}` : ''}`;
      return `<div class="md-codeblock">${language}<pre><code class="${codeClass}">${numbered}</code></pre></div>`;
    },
  );
}

export function renderMarkdown(md: string): string {
  try {
    const result = marked.parse(md);
    return typeof result === 'string' ? decorateCodeBlocks(result) : '';
  } catch {
    return md;
  }
}
