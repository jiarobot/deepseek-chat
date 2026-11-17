import { useState } from 'react';
import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import { Check, Copy } from 'lucide-react';
import { extractText } from '../lib/utils';

function CodeBlock({ code, lang, children }: { code: string; lang?: string; children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="code-block">
      <div className="code-head">
        <span className="code-dots">
          <i />
          <i />
          <i />
        </span>
        <span className="code-lang">{lang || 'code'}</span>
        <button className="code-copy" onClick={copy}>
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

/** 兼容导出历史中的 \( ... \) 与 \[ ... \] 公式写法（跳过代码块） */
function normalizeMath(source: string): string {
  const parts = source.split(/(```[\s\S]*?```|`[^`\n]*`)/g);
  return parts
    .map((part, index) => {
      if (index % 2 === 1) return part;
      return part
        .replace(/\\\[([\s\S]*?)\\\]/g, (_match, expr) => `\n$$\n${expr}\n$$\n`)
        .replace(/\\\(([\s\S]*?)\\\)/g, (_match, expr) => `$${expr}$`);
    })
    .join('');
}

export function Markdown({ content }: { content: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, [rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          pre: ({ children }) => {
            const child = Array.isArray(children) ? children[0] : children;
            const className =
              (child as { props?: { className?: string } })?.props?.className || '';
            const lang = /language-([\w-]+)/.exec(className)?.[1];
            const code = extractText(child);
            return (
              <CodeBlock code={code} lang={lang}>
                {children}
              </CodeBlock>
            );
          },
          code: (props) => {
            const { className, children, ...rest } = props as {
              className?: string;
              children?: ReactNode;
            } & Record<string, unknown>;
            const isBlock = !!className && (className.includes('language-') || className.includes('hljs'));
            return (
              <code className={isBlock ? className : 'inline-code'} {...rest}>
                {children}
              </code>
            );
          },
          a: (props) => (
            <a {...props} target="_blank" rel="noreferrer noopener">
              {props.children}
            </a>
          )
        }}
      >
        {normalizeMath(content)}
      </ReactMarkdown>
    </div>
  );
}
