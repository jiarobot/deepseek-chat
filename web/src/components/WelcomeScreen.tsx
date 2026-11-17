import { Brain, Database, Globe2, Sparkles, Terminal } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { LogoMark } from './Common';
import { formatNumber } from '../lib/utils';

const SUGGESTIONS = [
  {
    icon: Sparkles,
    title: '解释 Transformer 自注意力',
    desc: '用通俗语言讲清 Q/K/V 与缩放点积，并给出公式',
    prompt: '请用通俗语言解释 Transformer 的自注意力机制，说明 Q、K、V 的含义，并给出缩放点积注意力的公式与计算过程。'
  },
  {
    icon: Terminal,
    title: '编写 Python 批量转换脚本',
    desc: '把目录下的 Markdown 批量转换为带样式的 HTML',
    prompt: '写一个 Python 脚本，把指定目录下的所有 Markdown 文件批量转换成带简洁样式的 HTML，要求支持代码高亮、生成目录，并给出运行说明。'
  },
  {
    icon: Database,
    title: '设计高并发短链接服务',
    desc: '从容量估算到存储、缓存与发号策略',
    prompt: '请设计一个高并发短链接服务：给出容量估算、哈希与发号策略、存储选型、缓存设计、热点与雪崩应对方案，并用表格总结关键指标。'
  },
  {
    icon: Globe2,
    title: '梳理技术方案评审清单',
    desc: '覆盖性能、稳定性、安全与可运维性',
    prompt: '帮我梳理一份技术方案评审清单，覆盖架构合理性、性能容量、稳定性与容灾、安全合规、可观测性与运维成本，每一项给出检查要点。'
  }
];

export function WelcomeScreen() {
  const sessionTotal = useAppStore((s) => s.sessionTotal);
  const system = useAppStore((s) => s.system);
  const send = useAppStore((s) => s.send);
  const streaming = useAppStore((s) => s.streaming);

  return (
    <div className="welcome">
      <div className="welcome-inner">
        <LogoMark size={76} className="welcome-mark" />
        <div className="welcome-kicker">NEXUS · LOCAL INTELLIGENCE GATEWAY</div>
        <h1 className="welcome-title">欢迎接入 DeepSeek Nexus</h1>
        <p className="welcome-sub">
          本地化的 DeepSeek 对话工作台：完整保留你的历史会话，支持流式回答、深度思考与联网检索。
          提问、思考、检索与归档，都在一个界面内完成。
        </p>

        <div className="welcome-meta">
          <span className="mode-chip">
            <Brain size={13} /> 深度思考可用
          </span>
          <span className="mode-chip">
            <Globe2 size={13} /> 联网检索
          </span>
          <span className="mode-chip">
            <Database size={13} /> 历史已本地归档
          </span>
        </div>

        <div className="suggestion-grid">
          {SUGGESTIONS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.title}
                className="suggestion-card"
                onClick={() => {
                  if (!streaming) void send(item.prompt);
                }}
                style={{ textAlign: 'left' }}
              >
                <span className="suggestion-icon">
                  <Icon size={14} />
                </span>
                <div className="suggestion-title">{item.title}</div>
                <div className="suggestion-desc">{item.desc}</div>
              </button>
            );
          })}
        </div>

        <div className="welcome-stats">
          <div className="stat-mini">
            <div className="v">{formatNumber(sessionTotal)}</div>
            <div className="l">历史会话</div>
          </div>
          <div className="stat-mini">
            <div className="v">{system?.import.status === 'running' ? 'SYNC' : 'READY'}</div>
            <div className="l">归档状态</div>
          </div>
          <div className="stat-mini">
            <div className="v">{system?.apiKey.configured ? 'ONLINE' : 'OFFLINE'}</div>
            <div className="l">模型通道</div>
          </div>
          <div className="stat-mini">
            <div className="v">{system?.models[0]?.shortLabel || 'deepseek-chat'}</div>
            <div className="l">默认模型</div>
          </div>
        </div>
      </div>
    </div>
  );
}
