import { useEffect, useState } from 'react';
import { Cpu, Database, KeyRound, RefreshCw, Settings2, ShieldAlert, Trash2, UserRound } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { Modal } from './Common';
import { api } from '../lib/api';
import { formatBytes, formatDateTime, formatNumber } from '../lib/utils';

type Tab = 'general' | 'model' | 'data' | 'account';

export function SettingsModal() {
  const open = useAppStore((s) => s.settingsOpen);
  const setOpen = useAppStore((s) => s.setSettingsOpen);
  const settings = useAppStore((s) => s.settings);
  const saveSettings = useAppStore((s) => s.saveSettings);
  const system = useAppStore((s) => s.system);
  const user = useAppStore((s) => s.user);
  const setApiKey = useAppStore((s) => s.setApiKey);
  const clearApiKey = useAppStore((s) => s.clearApiKey);
  const triggerImport = useAppStore((s) => s.triggerImport);
  const clearSessions = useAppStore((s) => s.clearSessions);
  const confirm = useAppStore((s) => s.confirm);
  const toast = useAppStore((s) => s.toast);
  const logout = useAppStore((s) => s.logout);

  const [tab, setTab] = useState<Tab>('general');
  const [systemPrompt, setSystemPrompt] = useState(settings.systemPrompt);
  const [temperature, setTemperature] = useState(settings.temperature);
  const [keyInput, setKeyInput] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSystemPrompt(settings.systemPrompt);
    setTemperature(settings.temperature);
    setKeyInput('');
    setOldPassword('');
    setNewPassword('');
  }, [open, settings.systemPrompt, settings.temperature]);

  const importState = system?.import;
  const percent =
    importState && importState.total > 0 ? Math.min(100, Math.round((importState.done / importState.total) * 100)) : 0;

  const applyKey = async () => {
    if (!keyInput.trim()) return;
    try {
      await setApiKey(keyInput.trim());
      setKeyInput('');
    } catch {
      /* toast 已在 store 中处理 */
    }
  };

  const changePassword = async () => {
    if (!oldPassword || !newPassword) return;
    setChanging(true);
    try {
      await api.changePassword(oldPassword, newPassword);
      toast('密码已更新', 'success');
      setOldPassword('');
      setNewPassword('');
    } catch (err) {
      toast((err as Error).message || '修改失败', 'error');
    } finally {
      setChanging(false);
    }
  };

  const clearAll = async () => {
    const ok = await confirm(
      '清空全部会话',
      '这将删除本账号下所有会话（包括导入的历史记录）的访问入口，数据库中的原始导出文件不会被删除。建议先导出重要会话。',
      true,
      '全部清空'
    );
    if (ok) await clearSessions();
  };

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="控制台设置"
      subtitle="NEXUS CONFIGURATION"
      footer={
        <>
          <button className="btn btn-ghost" onClick={() => setOpen(false)}>
            关闭
          </button>
        </>
      }
    >
      <div className="settings-tabs">
        <button className={`settings-tab ${tab === 'general' ? 'active' : ''}`} onClick={() => setTab('general')}>
          通用
        </button>
        <button className={`settings-tab ${tab === 'model' ? 'active' : ''}`} onClick={() => setTab('model')}>
          模型与密钥
        </button>
        <button className={`settings-tab ${tab === 'data' ? 'active' : ''}`} onClick={() => setTab('data')}>
          数据
        </button>
        <button className={`settings-tab ${tab === 'account' ? 'active' : ''}`} onClick={() => setTab('account')}>
          账户
        </button>
      </div>

      {tab === 'general' ? (
        <>
          <div className="settings-section">
            <div className="section-title">
              <Settings2 size={12} /> 界面与默认行为
            </div>
            <div className="field-row">
              <div>
                <div className="label">主题</div>
                <div className="desc">深空暗色 / 极光浅色</div>
              </div>
              <div className="control">
                <select
                  className="select"
                  value={settings.theme}
                  onChange={(event) => void saveSettings({ theme: event.target.value as 'dark' | 'light' })}
                >
                  <option value="dark">深空暗色</option>
                  <option value="light">极光浅色</option>
                </select>
              </div>
            </div>
            <div className="field-row">
              <div>
                <div className="label">默认开启深度思考</div>
                <div className="desc">使用 deepseek-reasoner，先思考再回答</div>
              </div>
              <div className="control">
                <button
                  className={`switch ${settings.thinking ? 'on' : ''}`}
                  onClick={() =>
                    void saveSettings({
                      thinking: !settings.thinking,
                      model: !settings.thinking ? 'deepseek-reasoner' : 'deepseek-chat'
                    })
                  }
                  aria-label="切换深度思考"
                />
              </div>
            </div>
            <div className="field-row">
              <div>
                <div className="label">默认开启联网搜索</div>
                <div className="desc">每次提问前自动抓取实时网页资料</div>
              </div>
              <div className="control">
                <button
                  className={`switch ${settings.search ? 'on' : ''}`}
                  onClick={() => void saveSettings({ search: !settings.search })}
                  aria-label="切换联网搜索"
                />
              </div>
            </div>
            <div className="field-row">
              <div>
                <div className="label">温度</div>
                <div className="desc">越高越发散，仅对通用对话模型生效</div>
              </div>
              <div className="control slider-row">
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.1}
                  value={temperature}
                  onChange={(event) => setTemperature(Number(event.target.value))}
                  onMouseUp={() => void saveSettings({ temperature })}
                  onTouchEnd={() => void saveSettings({ temperature })}
                />
                <span className="slider-value">{temperature.toFixed(1)}</span>
              </div>
            </div>
          </div>

          <div className="settings-section">
            <div className="section-title">
              <Cpu size={12} /> 自定义系统指令
            </div>
            <textarea
              className="input"
              rows={5}
              value={systemPrompt}
              placeholder="例如：你是一位严谨的技术顾问，回答时优先给出结论与可执行步骤…"
              onChange={(event) => setSystemPrompt(event.target.value)}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <button className="btn btn-primary" onClick={() => void saveSettings({ systemPrompt })}>
                保存指令
              </button>
            </div>
          </div>
        </>
      ) : null}

      {tab === 'model' ? (
        <>
          <div className="settings-section">
            <div className="section-title">
              <KeyRound size={12} /> API Key 状态
            </div>
            <div className="key-status">
              <span className={`dot ${system?.apiKey.configured ? 'ok' : 'warn'}`} />
              {system?.apiKey.configured
                ? `已配置：${system.apiKey.masked}（来源：${
                    system.apiKey.source === 'env' ? '环境变量' : '本次运行内存'
                  }）`
                : '未配置 API Key，无法发起对话'}
            </div>
            <div className="field">
              <label>临时写入本次运行（不会保存到任何配置文件）</label>
              <input
                className="input"
                type="password"
                placeholder="sk-..."
                value={keyInput}
                onChange={(event) => setKeyInput(event.target.value)}
                autoComplete="off"
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={() => void applyKey()} disabled={!keyInput.trim()}>
                应用密钥
              </button>
              <button className="btn btn-ghost" onClick={() => void clearApiKey()}>
                清除运行期密钥
              </button>
            </div>
            <div className="notice" style={{ marginTop: 12 }}>
              推荐通过环境变量启动服务：<code style={{ fontFamily: 'var(--font-mono)' }}>$env:DEEPSEEK_API_KEY="sk-..."</code>
              <br />
              密钥仅用于服务端请求 DeepSeek 接口，不会写入数据库、日志或前端代码。
            </div>
          </div>

          <div className="settings-section">
            <div className="section-title">
              <Cpu size={12} /> 可用模型
            </div>
            {system?.models.map((model) => (
              <div className="field-row" key={model.id}>
                <div>
                  <div className="label">{model.label}</div>
                  <div className="desc">
                    {model.id} · {model.description}
                  </div>
                </div>
                <span className="badge accent">{model.supportsThinking ? '思考' : '通用'}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {tab === 'data' ? (
        <>
          <div className="settings-section">
            <div className="section-title">
              <Database size={12} /> 历史数据
            </div>
            <div className="field-row">
              <div>
                <div className="label">导入状态</div>
                <div className="desc">{importState?.message || '等待导入'}</div>
              </div>
              <span className={`badge ${importState?.status === 'done' ? 'accent' : ''}`}>
                {importState?.status || 'idle'}
              </span>
            </div>
            {importState && importState.total > 0 ? (
              <div style={{ margin: '6px 0 12px' }}>
                <div className="progress-track" style={{ height: 5 }}>
                  <div className="progress-bar" style={{ width: `${percent}%` }} />
                </div>
                <div className="desc" style={{ marginTop: 6 }}>
                  {importState.done} / {importState.total} · 新增/更新 {importState.imported} · 跳过{' '}
                  {importState.skipped} · 失败 {importState.failed}
                </div>
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn btn-ghost" onClick={() => void triggerImport(false)}>
                <RefreshCw size={13} /> 增量导入
              </button>
              <button className="btn btn-ghost" onClick={() => void triggerImport(true)}>
                <RefreshCw size={13} /> 全量重建
              </button>
            </div>
            <div className="notice" style={{ marginTop: 10 }}>
              增量导入会对比文件修改时间，自动跳过未变化的会话；全量重建会重新写入所有会话内容。
            </div>
          </div>

          <div className="settings-section">
            <div className="section-title">
              <Database size={12} /> 存储概览
            </div>
            <div className="field-row">
              <div className="label">数据库大小</div>
              <div className="control" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                {formatBytes(system?.dbSize || 0)}
              </div>
            </div>
            <div className="field-row">
              <div className="label">导入完成时间</div>
              <div className="control" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                {formatDateTime(importState?.finishedAt)}
              </div>
            </div>
            <div className="field-row">
              <div className="label">会话总数</div>
              <div className="control" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                {formatNumber(useAppStore.getState().sessionTotal)}
              </div>
            </div>
          </div>

          <div className="danger-zone">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <ShieldAlert size={14} color="var(--danger)" />
              <strong style={{ fontSize: 13 }}>危险操作</strong>
            </div>
            <div className="desc" style={{ marginBottom: 10 }}>
              清空后所有会话将从列表中移除，导出的原始 JSON 文件不受影响。
            </div>
            <button className="btn btn-danger" onClick={() => void clearAll()}>
              <Trash2 size={13} /> 清空全部会话
            </button>
          </div>
        </>
      ) : null}

      {tab === 'account' ? (
        <>
          <div className="settings-section">
            <div className="section-title">
              <UserRound size={12} /> 当前账号
            </div>
            <div className="field-row">
              <div className="label">账号</div>
              <div className="control" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                {user?.username}
              </div>
            </div>
            <div className="field-row">
              <div className="label">显示名称</div>
              <div className="control" style={{ fontSize: 12 }}>
                {user?.displayName}
              </div>
            </div>
            <div className="field-row">
              <div className="label">创建时间</div>
              <div className="control" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                {formatDateTime(user?.createdAt)}
              </div>
            </div>
          </div>

          <div className="settings-section">
            <div className="section-title">
              <KeyRound size={12} /> 修改密码
            </div>
            <div className="field">
              <label>当前密码</label>
              <input
                className="input"
                type="password"
                value={oldPassword}
                onChange={(event) => setOldPassword(event.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="field">
              <label>新密码</label>
              <input
                className="input"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
              />
            </div>
            <button
              className="btn btn-primary"
              onClick={() => void changePassword()}
              disabled={changing || !oldPassword || newPassword.length < 6}
            >
              更新密码
            </button>
          </div>

          <div className="field-row">
            <div>
              <div className="label">退出登录</div>
              <div className="desc">清除本机登录状态</div>
            </div>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setOpen(false);
                logout();
              }}
            >
              退出
            </button>
          </div>
        </>
      ) : null}
    </Modal>
  );
}
