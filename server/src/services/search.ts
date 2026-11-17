import type { SearchResult } from '../types';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function siteName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** 解析 Bing 搜索结果页（HTML），失败时返回空数组 */
export function parseBingResults(html: string, limit = 6): SearchResult[] {
  const results: SearchResult[] = [];
  const blocks = html.match(/<li class="b_algo"[\s\S]*?<\/li>/g) || [];
  for (const block of blocks) {
    const linkMatch = block.match(/<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!linkMatch) continue;
    const url = decodeEntities(linkMatch[1]);
    if (!/^https?:\/\//i.test(url)) continue;
    const title = stripTags(linkMatch[2]);
    const snippetMatch =
      block.match(/<p class="[^"]*b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>/) ||
      block.match(/<div class="b_caption"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/) ||
      block.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    const snippet = snippetMatch ? stripTags(snippetMatch[1]) : '';
    results.push({ url, title: title || url, snippet, siteName: siteName(url) });
    if (results.length >= limit) break;
  }
  return results;
}

/** 把口语化的长提问压缩为适合搜索引擎的关键词 */
export function buildSearchQuery(text: string): string {
  let value = text.replace(/\s+/g, ' ').trim();
  if (!value) return '';
  value = value.split(/[。！？!?；;\n]/)[0];
  value = value
    .replace(/^(请|请你|麻烦|麻烦你|帮我|帮忙|能否|可否|可以)\s*/g, '')
    .replace(/(联网|在线)?(检索|搜索|查询|查找|查一下|搜一下)/g, ' ')
    .replace(/(只|仅)?(回答|输出|给出|告诉我)/g, ' ')
    .replace(/^(一下|下)\s*/g, '');
  const clauses = value.split(/[，,]/).map((item) => item.trim()).filter(Boolean);
  if (clauses.length > 1) value = clauses[0];
  value = value
    .replace(/^(关于|有关|什么是|是什么|介绍一下|解释一下)/g, '')
    .replace(/(的?(名称|内容|信息|情况|链接|来源))$/g, '')
    .replace(/[的了吗呢吧呀]$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const words = value.split(' ').filter(Boolean);
  if (words.length > 10) value = words.slice(0, 10).join(' ');
  return value.slice(0, 80).trim();
}

export async function searchWeb(query: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const q = buildSearchQuery(query);
  if (!q) return [];
  const timeout = AbortSignal.timeout(9000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    const res = await fetch(
      `https://www.bing.com/search?q=${encodeURIComponent(q)}&setlang=zh-Hans&ensearch=0`,
      {
        headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' },
        signal: combined
      }
    );
    if (!res.ok) return [];
    const html = await res.text();
    return parseBingResults(html);
  } catch {
    return [];
  }
}
