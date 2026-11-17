import { useState } from 'react';
import { ChevronDown, FileText, Globe2, Info, Link2, ShieldAlert } from 'lucide-react';
import type { AttachmentFile, Fragment } from '../lib/types';
import { api } from '../lib/api';
import { formatBytes } from '../lib/utils';

export function ThinkBlock({ fragment, streaming }: { fragment: Fragment; streaming?: boolean }) {
  const [open, setOpen] = useState(!!streaming);
  const content = String(fragment.content || '');
  const seconds = Number(fragment.elapsed_secs || 0);
  return (
    <div className="think-block">
      <button className="think-head" onClick={() => setOpen((v) => !v)}>
        <span className="think-pulse">
          <i />
          <i />
          <i />
        </span>
        <span>
          {streaming ? '正在深度思考…' : `思考过程${seconds ? ` · ${seconds.toFixed(1)}s` : ''}`}
        </span>
        <ChevronDown size={14} className={`chev ${open ? 'open' : ''}`} />
      </button>
      {open && <div className="think-body">{content || '（无思考内容）'}</div>}
    </div>
  );
}

export function SearchBlock({ fragment }: { fragment: Fragment }) {
  const [open, setOpen] = useState(false);
  const results = Array.isArray(fragment.results) ? fragment.results : [];
  const queries = Array.isArray(fragment.queries) ? fragment.queries : [];
  return (
    <div className="search-block">
      <button className="search-head" onClick={() => setOpen((v) => !v)}>
        <Globe2 size={13} />
        <span>
          {results.length ? `已联网检索 ${results.length} 条资料` : '联网检索已完成'}
        </span>
        <ChevronDown size={14} className={`chev ${open ? 'open' : ''}`} />
      </button>
      {open && (
        <div className="search-body">
          {queries.length > 0 && (
            <div className="search-queries">
              {queries.map((query, index) => (
                <span className="query-chip" key={`${query}-${index}`}>
                  {query}
                </span>
              ))}
            </div>
          )}
          {results.length ? (
            <div className="search-list">
              {results.map((item, index) => (
                <a className="search-item" key={`${item.url}-${index}`} href={item.url} target="_blank" rel="noreferrer">
                  <div className="search-item-title">
                    [{index + 1}] {item.title}
                  </div>
                  <div className="search-item-meta">
                    <span>{item.siteName || item.site_name || item.url}</span>
                  </div>
                  {item.snippet ? <div className="search-item-snippet">{item.snippet}</div> : null}
                </a>
              ))}
            </div>
          ) : (
            <div className="search-empty">未获取到可用的实时结果，回答将基于模型自身知识。</div>
          )}
        </div>
      )}
    </div>
  );
}

function fileUrl(file: AttachmentFile): string | null {
  if (file.url) return file.url.startsWith('http') ? file.url : `${file.url}?token=${encodeURIComponent(localStorage.getItem('nexus_token') || '')}`;
  if (file.export_path) return api.importedFileUrl(file.export_path);
  return null;
}

export function FileList({ files }: { files: AttachmentFile[] }) {
  if (!files.length) return null;
  return (
    <div className="file-list">
      {files.map((file, index) => {
        const name = file.file_name || file.name || '未命名文件';
        const size = Number(file.file_size || file.size || 0);
        const url = fileUrl(file);
        if (file.is_image && url) {
          return (
            <a key={`${name}-${index}`} href={url} target="_blank" rel="noreferrer" title={name}>
              <img className="file-thumb" src={url} alt={name} />
            </a>
          );
        }
        return (
          <a className="file-chip" key={`${name}-${index}`} href={url || undefined} target="_blank" rel="noreferrer">
            <FileText size={14} />
            <span className="name">{name}</span>
            {size ? <span className="size">{formatBytes(size)}</span> : null}
          </a>
        );
      })}
    </div>
  );
}

export function RiskNote({ text }: { text: string }) {
  return (
    <div className="risk-note">
      <Info size={12} />
      <span>{text}</span>
    </div>
  );
}

export function ToolTrace({ fragment }: { fragment: Fragment }) {
  if (fragment.type === 'TOOL_OPEN') {
    const url = String(fragment.url || '');
    return (
      <div className="risk-note" style={{ marginBottom: 10 }}>
        <Link2 size={12} />
        <span>
          已阅读：
          <a href={url} target="_blank" rel="noreferrer">
            {String(fragment.title || url)}
          </a>
        </span>
      </div>
    );
  }
  if (fragment.type === 'PARTIAL_FILE_READ') {
    return (
      <div className="risk-note" style={{ marginBottom: 10 }}>
        <FileText size={12} />
        <span>已读取文件约 {Number(fragment.ratio || 0).toFixed(0)}% 的内容</span>
      </div>
    );
  }
  if (fragment.type === 'READ_LINK') {
    return (
      <div className="risk-note" style={{ marginBottom: 10 }}>
        <Link2 size={12} />
        <span>已完成链接解析</span>
      </div>
    );
  }
  if (fragment.type === 'CONTENT_RISK') {
    return <RiskNote text={String(fragment.content || '内容提示')} />;
  }
  if (fragment.type === 'TEMPLATE_RESPONSE') {
    return (
      <div className="notice" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <ShieldAlert size={14} color="var(--warn)" />
        {String(fragment.content || '该回答未成功生成')}
      </div>
    );
  }
  return null;
}
