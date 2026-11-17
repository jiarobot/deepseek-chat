import { useEffect, useState } from 'react';
import { ArrowRight, Brain, Database, Globe2, HardDrive, ShieldCheck } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { LogoMark } from '../components/Common';

export function LoginPage() {
  const login = useAppStore((s) => s.login);
  const register = useAppStore((s) => s.register);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setError('');
  }, [mode]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(username.trim(), password);
      } else {
        await register(username.trim(), password, displayName.trim() || username.trim());
      }
    } catch (err) {
      setError((err as Error).message || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <section className="login-visual">
        <div className="login-grid" />
        <div className="orb a" />
        <div className="orb b" />
        <div className="orb c" />

        <div className="login-brand">
          <LogoMark size={52} className="brand-mark" />
          <div>
            <div className="brand-name" style={{ fontSize: 14 }}>
              DEEPSEEK NEXUS
            </div>
            <div className="brand-sub">Local Intelligence Gateway · v1.0</div>
          </div>
        </div>

        <span className="kicker">
          <span className="dot" /> 本地部署 · 数据自持
        </span>
        <h1 className="login-title">
          把 DeepSeek
          <br />
          装进你的工作台
        </h1>
        <p className="login-tagline">
          网页端限流时，Nexus 依然稳定可用。历史会话完整迁移到本地数据库，
          支持流式回答、深度思考、联网检索与一键归档，界面全面升级为科技感控制台。
        </p>

        <div className="feature-list">
          <div className="feature-item">
            <Database size={16} />
            <div>
              <div className="feature-name">历史全量归档</div>
              <div className="feature-desc">自动解析导出的会话 JSON，9537 个会话秒级检索</div>
            </div>
          </div>
          <div className="feature-item">
            <Brain size={16} />
            <div>
              <div className="feature-name">深度思考链</div>
              <div className="feature-desc">独立思考过程可折叠查看，流式输出不中断</div>
            </div>
          </div>
          <div className="feature-item">
            <Globe2 size={16} />
            <div>
              <div className="feature-name">联网检索</div>
              <div className="feature-desc">实时抓取网页资料，回答自动标注引用来源</div>
            </div>
          </div>
          <div className="feature-item">
            <HardDrive size={16} />
            <div>
              <div className="feature-name">本地化存储</div>
              <div className="feature-desc">SQLite + 压缩负载，数据不出本机</div>
            </div>
          </div>
        </div>
      </section>

      <section className="login-panel">
        <div className="auth-card">
          <div className="auth-head">
            <h2 className="auth-title">{mode === 'login' ? '接入控制台' : '创建本地账号'}</h2>
            <p className="auth-sub">
              {mode === 'login' ? 'AUTHENTICATE TO CONTINUE' : 'REGISTER A NEW NODE OPERATOR'}
            </p>
          </div>

          <div className="auth-tabs">
            <button className={`auth-tab ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')}>
              登录
            </button>
            <button className={`auth-tab ${mode === 'register' ? 'active' : ''}`} onClick={() => setMode('register')}>
              注册
            </button>
          </div>

          <form onSubmit={submit}>
            <div className="field">
              <label>账号</label>
              <input
                className="input"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="输入账号"
                autoComplete="username"
                autoFocus
              />
            </div>
            {mode === 'register' ? (
              <div className="field">
                <label>显示名称（可选）</label>
                <input
                  className="input"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="例如：夜航星"
                />
              </div>
            ) : null}
            <div className="field">
              <label>密码</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={mode === 'register' ? '至少 6 位字符' : '输入密码'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </div>

            {error ? <p className="auth-error">{error}</p> : null}

            <button className="auth-submit" type="submit" disabled={submitting || !username || !password}>
              {submitting ? '正在验证…' : mode === 'login' ? '进入控制台' : '创建并进入'}
              {!submitting ? <ArrowRight size={15} style={{ marginLeft: 8, verticalAlign: -2 }} /> : null}
            </button>
          </form>

          <div className="auth-hint">
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
              <ShieldCheck size={12} /> 本机默认账号：<code>owner</code> / 密码：<code>owner123</code>
            </div>
            首次登录后请尽快在「设置 → 账户」中修改密码。API Key 只从环境变量或本次运行内存读取，不写入任何配置文件。
          </div>
        </div>
      </section>
    </div>
  );
}
