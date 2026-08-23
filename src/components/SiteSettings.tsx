'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { KeyRound, Loader2, Save, RefreshCw, ShieldCheck, ClipboardPaste, FlaskConical, AlertTriangle } from 'lucide-react';

interface SiteCookieInfo {
  id: string;
  name: string;
  needCookie: boolean;
  hasCookie: boolean;
  cookie: string;
  hasApiToken?: boolean;
  apiToken?: string;
  apiTokenLabel?: string;
}

interface TestResult {
  testing: boolean;
  message: string;
  ok: boolean;
}

interface GuideStep {
  text: string;
  url?: string;
  urlLabel?: string;
}

interface SiteGuide {
  title: string;
  steps: GuideStep[];
  note?: string;
}

const SITE_GUIDES: Record<string, SiteGuide> = {
  thingiverse: {
    title: '推荐：API Token（无需 Cookie）',
    steps: [
      { text: '登录 Thingiverse 账号', url: 'https://www.thingiverse.com/login', urlLabel: '去登录 ↗' },
      { text: '打开开发者文档页，按文档创建应用并生成 Access Token', url: 'https://www.thingiverse.com/developers', urlLabel: '开发者文档 ↗' },
      { text: '直接创建应用入口（登录后可用）', url: 'https://www.thingiverse.com/apps/create', urlLabel: '创建应用 ↗' },
      { text: '用 OAuth 授权链接生成 Access Token：浏览器打开授权地址并登录授权，地址栏中 access_token= 后面的值就是 Token' },
      { text: '把 Token 粘贴到下方输入框，点「保存配置」' },
    ],
    note: '备用 Cookie 方式：登录后按 F12 → Network → 刷新 → 任意请求的 Headers → 复制 cookie: 整行值。部分模型无需任何配置即可匿名下载。',
  },
  printables: {
    title: '绑定方法：登录后复制 Cookie（可选）',
    steps: [
      { text: '登录 Printables（免费模型不配置也能直接下载，可跳过）', url: 'https://www.printables.com/login', urlLabel: '去登录 ↗' },
      { text: '按 F12 → Network → 刷新页面 → 点击第一个请求 → Headers → 复制 cookie: 整行值' },
      { text: '点「从剪贴板粘贴」或手动粘贴到下方输入框，保存配置' },
    ],
    note: '登录 Cookie 是 HttpOnly，浏览器 JS 无法自动读取，必须用 Network 面板复制。',
  },
  aigei: {
    title: '绑定方法：登录后复制 Cookie（可选）',
    steps: [
      { text: '注册并登录爱给网', url: 'https://www.aigei.com/login', urlLabel: '去登录 ↗' },
      { text: '按 F12 → Network → 刷新 → 任意请求 Headers → 复制 cookie: 整行值' },
      { text: '粘贴到下方输入框，保存配置' },
    ],
    note: '爱给网部分免费模型可直接下载，部分需要登录。',
  },
  '3d66': {
    title: '绑定方法：登录后复制 Cookie（可选）',
    steps: [
      { text: '注册并登录 3D溜溜网', url: 'https://www.3d66.com', urlLabel: '去官网 ↗' },
      { text: '按 F12 → Network → 刷新 → 任意请求 Headers → 复制 cookie: 整行值' },
      { text: '粘贴到下方输入框，保存配置' },
    ],
  },
  sketchfab: {
    title: '绑定方法：登录后复制 Cookie（可选）',
    steps: [
      { text: '登录 Sketchfab', url: 'https://sketchfab.com/login', urlLabel: '去登录 ↗' },
      { text: '按 F12 → Network → 刷新 → 任意请求 Headers → 复制 cookie: 整行值' },
      { text: '粘贴到下方输入框，保存配置' },
    ],
    note: '部分模型需付费购买，本系统不会绕过付费墙。',
  },
  yeggi: {
    title: '无需配置',
    steps: [],
    note: 'Yeggi 是聚合搜索引擎，仅提供站内搜索跳转，不需要 Cookie 或 Token。',
  },
};

export function SiteSettings() {
  const [sites, setSites] = useState<SiteCookieInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [snapshot, setSnapshot] = useState<Record<string, string>>({});
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});

  // Browser Agent state
  const [agentUrl, setAgentUrl] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('stl-browser-agent-url') || 'http://127.0.0.1:18789';
    return 'http://127.0.0.1:18789';
  });
  const [agentStatus, setAgentStatus] = useState<'unknown' | 'connected' | 'disconnected' | 'paired'>('unknown');
  const [pairCode, setPairCode] = useState('');
  const [agentToken, setAgentToken] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('stl-browser-agent-token') || '';
    return '';
  });
  const [pairing, setPairing] = useState(false);

  useEffect(() => {
    if (agentToken) checkAgentHealth();
  }, []);

  const saveAgentUrl = (url: string) => {
    setAgentUrl(url);
    localStorage.setItem('stl-browser-agent-url', url);
  };

  const checkAgentHealth = async () => {
    try {
      const res = await fetch(`${agentUrl}/health`, { signal: AbortSignal.timeout(3000) });
      const data = await res.json();
      setAgentStatus(data.paired ? 'paired' : 'connected');
    } catch {
      setAgentStatus('disconnected');
    }
  };

  const handlePairAgent = async () => {
    if (!pairCode.trim()) { alert('请输入配对码'); return; }
    setPairing(true);
    try {
      const res = await fetch(`${agentUrl}/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: pairCode.trim() }),
      });
      const data = await res.json();
      if (data.token) {
        setAgentToken(data.token);
        localStorage.setItem('stl-browser-agent-token', data.token);
        setPairCode('');
        setAgentStatus('paired');
        alert('配对成功！本机浏览器 Agent 已连接。');
      } else {
        alert('配对失败：' + (data.error || '未知错误'));
      }
    } catch {
      alert('无法连接到 Browser Agent，请确认已启动。');
    } finally {
      setPairing(false);
    }
  };

  const unpairAgent = () => {
    setAgentToken('');
    localStorage.removeItem('stl-browser-agent-token');
    setAgentStatus('disconnected');
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/site-settings');
      const data = await res.json();
      if (data.success) {
        setSites(data.sites || []);
        const snap: Record<string, string> = {};
        for (const s of data.sites || []) snap[s.id] = s.cookie || '';
        setSnapshot(snap);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const isDirty = (s: SiteCookieInfo) => s.cookie !== (snapshot[s.id] || '');

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const cookies: Record<string, string> = {};
      for (const s of sites) {
        if (s.cookie.trim()) cookies[s.id] = s.cookie.trim();
        if (s.apiToken && s.apiToken.trim()) cookies['thingiverse_token'] = s.apiToken.trim();
      }
      const res = await fetch('/api/site-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookies }),
      });
      const data = await res.json();
      if (data.success) {
        setSaved(true);
        await load();
      } else {
        alert('保存失败：' + (data.error || '未知错误'));
      }
    } catch {
      alert('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const pasteFromClipboard = async (siteId: string) => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) { alert('剪贴板为空，请先在站点页复制 Cookie'); return; }
      setSites((prev) => prev.map((x) => x.id === siteId ? { ...x, cookie: text.trim() } : x));
      setSaved(false);
    } catch {
      alert('无法读取剪贴板（浏览器权限限制）。请点击输入框手动 Ctrl+V 粘贴。');
    }
  };

  const testSite = async (siteId: string) => {
    setTestResults((prev) => ({ ...prev, [siteId]: { testing: true, message: '', ok: false } }));
    try {
      const res = await fetch('/api/test-site', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId }),
      });
      const data = await res.json();
      setTestResults((prev) => ({ ...prev, [siteId]: { testing: false, message: data.message || data.error || '测试完成', ok: !!data.success } }));
    } catch {
      setTestResults((prev) => ({ ...prev, [siteId]: { testing: false, message: '测试失败', ok: false } }));
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5" />
            <CardTitle>站点设置（API Token / Cookie）</CardTitle>
          </div>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            加载配置
          </Button>
        </div>
        <CardDescription>
          每个站点下方都列出了对应的绑定方法与操作链接，按步骤操作即可。
          配置完点「保存配置」，再用「测试连接」确认是否生效。
          不配置也不影响使用：免费模型大多无需登录即可直接下载。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertTriangle className="w-4 h-4" />
          请只配置你有账号且有权下载的站点。付费资源仍需在原站购买，本系统不会绕过付费墙。
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : (
          <div className="space-y-3">
            {sites.map((s) => {
              const test = testResults[s.id];
              const guide = SITE_GUIDES[s.id];
              return (
                <div key={s.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{s.name}</span>
                      {s.hasCookie || s.hasApiToken ? (
                        <Badge className="bg-green-500 text-white">已保存</Badge>
                      ) : (
                        <Badge variant="outline">未保存</Badge>
                      )}
                      {isDirty(s) && (
                        <Badge className="bg-amber-500 text-white">有改动，待保存</Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{s.id}</span>
                  </div>

                  {guide && (
                    <div className="rounded-lg bg-muted/50 border border-muted p-2.5 space-y-1.5">
                      <p className="text-xs font-medium">{guide.title}</p>
                      {guide.steps.length > 0 && (
                        <ol className="list-decimal pl-4 space-y-1">
                          {guide.steps.map((step, i) => (
                            <li key={i} className="text-xs text-muted-foreground leading-relaxed">
                              <span>{step.text}</span>
                              {step.url && (
                                <a
                                  href={step.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="ml-1.5 text-primary underline underline-offset-2 hover:opacity-80 font-medium"
                                >
                                  {step.urlLabel || '打开 ↗'}
                                </a>
                              )}
                            </li>
                          ))}
                        </ol>
                      )}
                      {guide.note && <p className="text-xs text-amber-600">{guide.note}</p>}
                    </div>
                  )}

                  {s.apiTokenLabel && (
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground">粘贴你生成的 Access Token（获取方法见上方步骤）：</p>
                      <textarea
                        value={s.apiToken || ''}
                        onChange={(e) => {
                          setSites((prev) => prev.map((x) => x.id === s.id ? { ...x, apiToken: e.target.value } : x));
                          setSaved(false);
                        }}
                        placeholder="粘贴 Thingiverse API Access Token"
                        className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 font-mono text-xs min-h-[40px]"
                        rows={2}
                      />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">{s.id === 'thingiverse' ? '或使用 Cookie（备用）' : 'Cookie'}</p>
                      <Button size="xs" variant="outline" onClick={() => pasteFromClipboard(s.id)} disabled={s.id === 'thingiverse' && !!s.apiToken?.trim()}>
                        <ClipboardPaste className="w-3 h-3 mr-1" />
                        从剪贴板粘贴
                      </Button>
                    </div>
                    <textarea
                      value={s.cookie}
                      onChange={(e) => {
                        setSites((prev) => prev.map((x) => x.id === s.id ? { ...x, cookie: e.target.value } : x));
                        setSaved(false);
                      }}
                      placeholder={`粘贴 ${s.name} 的 Cookie 字符串（可选）`}
                      className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 font-mono text-xs min-h-[40px]"
                      rows={2}
                    />
                  </div>

                  {s.needCookie && !s.apiTokenLabel && (
                    <p className="text-xs text-muted-foreground">建议配置：该站点下载需要登录</p>
                  )}

                  <div className="flex items-center gap-3">
                    <Button size="xs" variant="secondary" onClick={() => testSite(s.id)} disabled={test?.testing}>
                      {test?.testing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <FlaskConical className="w-3 h-3 mr-1" />}
                      测试连接
                    </Button>
                    {test && !test.testing && (
                      <span className={`text-xs ${test.ok ? 'text-green-600' : 'text-red-600'}`}>
                        {test.ok ? '✓ ' : '✗ '}{test.message}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving || loading} className="px-6">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            保存配置
          </Button>
          {saved && (
            <span className="flex items-center gap-1 text-green-600 text-sm">
              <ShieldCheck className="w-4 h-4" /> 已保存到服务器
            </span>
          )}
        </div>

        {/* Browser Agent 配对 */}
        <div className="border-t pt-4 mt-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">🌐 本机浏览器 Agent（可选）</span>
            <Badge className={agentStatus === 'paired' ? 'bg-green-500 text-white' : agentStatus === 'connected' ? 'bg-blue-500 text-white' : 'bg-gray-400 text-white'}>
              {agentStatus === 'paired' ? '已配对' : agentStatus === 'connected' ? '已连接' : agentStatus === 'disconnected' ? '未连接' : '检测中…'}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Browser Agent 是运行在本机的 Playwright 服务，用于真实浏览器搜索和自动下载（需要 <code>npm run dev</code> 在 browser-agent 目录下启动）。
          </p>
          <div className="flex gap-2">
            <input
              value={agentUrl}
              onChange={(e) => saveAgentUrl(e.target.value)}
              placeholder="Agent URL"
              className="flex-1 rounded-lg border border-input bg-transparent px-2.5 py-1.5 font-mono text-xs"
            />
            <Button size="sm" variant="outline" onClick={checkAgentHealth}>
              <RefreshCw className="w-3 h-3 mr-1" />
              检测
            </Button>
          </div>
          {agentStatus !== 'paired' ? (
            <div className="flex gap-2">
              <input
                value={pairCode}
                onChange={(e) => setPairCode(e.target.value)}
                placeholder="输入 8 位配对码"
                className="flex-1 rounded-lg border border-input bg-transparent px-2.5 py-1.5 font-mono text-xs"
              />
              <Button size="sm" onClick={handlePairAgent} disabled={pairing} className="bg-purple-600 hover:bg-purple-700 text-white">
                {pairing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                配对
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={unpairAgent} className="text-red-500 hover:text-red-600">
              取消配对
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
