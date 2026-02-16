/**
 * API 配置面板组件
 * 从 SettingsModal 中抽取的 API 配置功能
 */

import { useEffect, useState } from "react";

interface APIConfigPanelProps {
    onSuccess?: () => void;
}

export function APIConfigPanel({ onSuccess }: APIConfigPanelProps) {
    const [apiKey, setApiKey] = useState("");
    const [baseURL, setBaseURL] = useState("");
    const [model, setModel] = useState("");
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        // 加载当前配置
        setLoading(true);
        window.electron.getApiConfig()
            .then((config) => {
                if (config) {
                    setApiKey(config.apiKey);
                    setBaseURL(config.baseURL);
                    setModel(config.model);
                }
            })
            .catch((err) => {
                console.error("Failed to load API config:", err);
                setError("加载配置失败");
            })
            .finally(() => {
                setLoading(false);
            });
    }, []);

    const handleSave = async () => {
        // 验证输入
        if (!apiKey.trim()) {
            setError("请输入 API Key");
            return;
        }
        if (!baseURL.trim()) {
            setError("请输入 Base URL");
            return;
        }
        if (!model.trim()) {
            setError("请输入模型名称");
            return;
        }

        // 验证 URL 格式
        try {
            new URL(baseURL);
        } catch {
            setError("Base URL 格式不正确");
            return;
        }

        setError(null);
        setSaving(true);

        try {
            const result = await window.electron.saveApiConfig({
                apiKey: apiKey.trim(),
                baseURL: baseURL.trim(),
                model: model.trim(),
                apiType: "anthropic"
            });

            if (result.success) {
                setSuccess(true);
                setTimeout(() => {
                    setSuccess(false);
                    onSuccess?.();
                }, 1500);
            } else {
                setError(result.error || "保存配置失败");
            }
        } catch (err) {
            console.error("Failed to save API config:", err);
            setError("保存配置失败");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <svg aria-hidden="true" className="w-6 h-6 animate-spin text-accent" viewBox="0 0 100 101" fill="none">
                    <path d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z" fill="currentColor" opacity="0.3" />
                    <path d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z" fill="currentColor" />
                </svg>
            </div>
        );
    }

    return (
        <div className="grid gap-4">
            <p className="text-sm text-muted">
                支持 Anthropic 官方 API 以及兼容 Anthropic 格式的第三方 API。
            </p>

            <label className="grid gap-1.5">
                <span className="text-xs font-medium text-muted">Base URL</span>
                <input
                    type="url"
                    className="rounded-xl border border-ink-900/10 bg-surface-secondary px-4 py-2.5 text-sm text-ink-800 placeholder:text-muted-light focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors"
                    placeholder="https://api.anthropic.com"
                    value={baseURL}
                    onChange={(e) => setBaseURL(e.target.value)}
                    required
                />
            </label>

            <label className="grid gap-1.5">
                <span className="text-xs font-medium text-muted">API Key</span>
                <input
                    type="password"
                    className="rounded-xl border border-ink-900/10 bg-surface-secondary px-4 py-2.5 text-sm text-ink-800 placeholder:text-muted-light focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors"
                    placeholder="sk-..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    required
                />
            </label>

            <label className="grid gap-1.5">
                <span className="text-xs font-medium text-muted">模型名称</span>
                <input
                    type="text"
                    className="rounded-xl border border-ink-900/10 bg-surface-secondary px-4 py-2.5 text-sm text-ink-800 placeholder:text-muted-light focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors"
                    placeholder="claude-sonnet-4-20250514"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    required
                />
            </label>

            {error && (
                <div className="rounded-xl border border-error/20 bg-error-light px-4 py-2.5 text-sm text-error">
                    {error}
                </div>
            )}

            {success && (
                <div className="rounded-xl border border-success/20 bg-success-light px-4 py-2.5 text-sm text-success">
                    配置保存成功！
                </div>
            )}

            <button
                className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white shadow-soft hover:bg-accent-hover transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                onClick={handleSave}
                disabled={saving || !apiKey.trim() || !baseURL.trim() || !model.trim()}
            >
                {saving ? (
                    <svg aria-hidden="true" className="mx-auto w-5 h-5 animate-spin" viewBox="0 0 100 101" fill="none">
                        <path d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z" fill="currentColor" opacity="0.3" />
                        <path d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z" fill="white" />
                    </svg>
                ) : "保存配置"}
            </button>
        </div>
    );
}
