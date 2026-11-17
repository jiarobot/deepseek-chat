import { useEffect, useState } from 'react';
import { ArrowLeft, Database, Flame, MessagesSquare, RefreshCw, Sparkles, Trophy } from 'lucide-react';
import { api } from '../lib/api';
import { useAppStore } from '../store/useAppStore';
import { navigate } from '../lib/router';
import type { StatsResponse } from '../lib/types';
import { formatDate, formatDateTime, formatNumber } from '../lib/utils';

function heatLevel(count: number, max: number): string {
  if (!count) return '';
  const ratio = count / Math.max(1, max);
  if (ratio > 0.75) return 'l4';
  if (ratio > 0.5) return 'l3';
  if (ratio > 0.25) return 'l2';
  return 'l1';
}

export function StatsPage() {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const toast = useAppStore((s) => s.toast);
  const loadSession = useAppStore((s) => s.loadSession);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await api.stats();
      setData(res);
    } catch (err) {
      toast((err as Error).message || '统计数据加载失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const months = data?.months || [];
  const maxMonth = Math.max(1, ...months.map((m) => m.count));

  const activityMap = new Map<string, number>();
  for (const item of data?.activity || []) activityMap.set(item.date, item.count);

  const days: Array<{ date: string; count: number }> = [];
  const today = new Date();
  for (let i = 125; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    days.push({ date: key, count: activityMap.get(key) || 0 });
  }
  const maxHeat = Math.max(1, ...days.map((d) => d.count));
  const weeks: Array<Array<{ date: string; count: number }>> = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return (
    <div className="stats-page">
      <div className="stats-inner">
        <div className="stats-head">
          <button className="icon-btn" onClick={() => navigate('/')} title="返回对话">
            <ArrowLeft size={18} />
          </button>
          <div style={{ flex: 1 }}>
            <h1>数据中心</h1>
            <p>DATA OBSERVATORY · LOCAL SESSIONS ANALYTICS</p>
          </div>
          <button className="btn btn-ghost" onClick={() => void fetchData()} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'spin-icon' : ''} />
            刷新
          </button>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="k">
              <MessagesSquare size={12} /> 会话总数
            </div>
            <div className="v">
              {formatNumber(data?.totals.sessions)}
              <em>个</em>
            </div>
            <div className="spark">
              <Database size={18} />
            </div>
          </div>
          <div className="stat-card">
            <div className="k">
              <Sparkles size={12} /> 消息总数
            </div>
            <div className="v">
              {formatNumber(data?.totals.messages)}
              <em>条</em>
            </div>
          </div>
          <div className="stat-card">
            <div className="k">
              <Flame size={12} /> Token 总量
            </div>
            <div className="v">{formatNumber(data?.totals.tokens)}</div>
          </div>
          <div className="stat-card">
            <div className="k">
              <Trophy size={12} /> 历史导入
            </div>
            <div className="v">
              {formatNumber(data?.totals.imported)}
              <em>个</em>
            </div>
            <div className="spark">
              <span className="badge purple">IMPORT</span>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">月度会话活跃度</div>
            <div className="panel-note">LAST 12 MONTHS</div>
          </div>
          <div className="bar-chart">
            {months.length ? (
              months.map((item) => (
                <div className="bar-col" key={item.month} title={`${item.month} · ${item.count} 个会话`}>
                  <div
                    className="bar"
                    style={{ height: `${Math.max(4, (item.count / maxMonth) * 100)}%` }}
                  />
                  <div className="bar-label">{item.month.slice(5)}月</div>
                </div>
              ))
            ) : (
              <div className="search-empty">暂无统计数据</div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">会话热力图</div>
            <div className="panel-note">最近 18 周 · 每格为一天</div>
          </div>
          <div className="heatmap">
            {weeks.map((week, index) => (
              <div className="heat-col" key={index}>
                {week.map((day) => (
                  <div
                    key={day.date}
                    className={`heat-cell ${heatLevel(day.count, maxHeat)}`}
                    title={`${formatDate(day.date)} · ${day.count} 个会话`}
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="desc" style={{ marginTop: 8, fontSize: 10.5, color: 'var(--text-mute)' }}>
            {data?.range.first ? `归档区间：${formatDate(data.range.first)} → ${formatDate(data.range.last)}` : '暂无归档区间'}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">Token 消耗 Top 8</div>
            <div className="panel-note">点击可直接打开会话</div>
          </div>
          <div className="top-list">
            {(data?.top || []).map((item, index) => (
              <div
                className="top-item"
                key={item.id}
                onClick={() => {
                  void loadSession(item.id);
                  navigate(`/c/${item.id}`);
                }}
              >
                <span className="top-index">{String(index + 1).padStart(2, '0')}</span>
                <span className="top-title">{item.title}</span>
                <span className="top-meta">{formatNumber(item.tokenTotal)} tk</span>
                <span className="top-meta">{item.messageCount} 条</span>
                <span className="top-meta">{formatDateTime(item.updatedAt)}</span>
              </div>
            ))}
            {!data?.top.length ? <div className="search-empty">暂无会话记录</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
