/**
 * MCP Server 配置表单组件
 * 支持添加和编辑 MCP Server 配置
 */

import { useState } from "react";

/** 表单数据类型 */
interface MCPServerFormData {
    name: string;
    description: string;
    command: string;
    args: string;
    envVars: string;
    transportType: "stdio" | "sse";
}

/** 表单验证错误 */
interface FormErrors {
    name?: string;
    command?: string;
    args?: string;
    envVars?: string;
}

interface MCPServerFormProps {
    /** 编辑模式时传入的初始数据 */
    initialData?: {
        id: string;
        name: string;
        description?: string;
        command: string;
        args?: string[];
        env?: Record<string, string>;
        transportType: "stdio" | "sse";
    };
    /** 关闭表单 */
    onClose: () => void;
    /** 保存成功回调 */
    onSave: (data: {
        name: string;
        description?: string;
        command: string;
        args?: string[];
        env?: Record<string, string>;
        transportType: "stdio" | "sse";
    }) => Promise<void>;
    /** 删除回调（编辑模式） */
    onDelete?: () => Promise<void>;
}

export function MCPServerForm({ initialData, onClose, onSave, onDelete }: MCPServerFormProps) {
    const isEditMode = !!initialData;

    const [formData, setFormData] = useState<MCPServerFormData>({
        name: initialData?.name || "",
        description: initialData?.description || "",
        command: initialData?.command || "",
        args: initialData?.args?.join(" ") || "",
        envVars: initialData?.env
            ? Object.entries(initialData.env).map(([k, v]) => `${k}=${v}`).join("\n")
            : "",
        transportType: initialData?.transportType || "stdio",
    });

    const [errors, setErrors] = useState<FormErrors>({});
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    /** 验证表单 */
    const validateForm = (): boolean => {
        const newErrors: FormErrors = {};

        if (!formData.name.trim()) {
            newErrors.name = "请输入工具名称";
        }

        if (!formData.command.trim()) {
            newErrors.command = "请输入启动命令";
        }

        // 验证环境变量格式
        if (formData.envVars.trim()) {
            const lines = formData.envVars.trim().split("\n");
            for (const line of lines) {
                if (line.trim() && !line.includes("=")) {
                    newErrors.envVars = "环境变量格式不正确，每行应为 KEY=VALUE 格式";
                    break;
                }
            }
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    /** 解析环境变量字符串 */
    const parseEnvVars = (str: string): Record<string, string> | undefined => {
        if (!str.trim()) return undefined;

        const result: Record<string, string> = {};
        const lines = str.trim().split("\n");

        for (const line of lines) {
            if (!line.trim()) continue;
            const eqIndex = line.indexOf("=");
            if (eqIndex > 0) {
                const key = line.substring(0, eqIndex).trim();
                const value = line.substring(eqIndex + 1).trim();
                if (key) result[key] = value;
            }
        }

        return Object.keys(result).length > 0 ? result : undefined;
    };

    /** 解析参数字符串 */
    const parseArgs = (str: string): string[] | undefined => {
        if (!str.trim()) return undefined;
        // 简单按空格分割，支持引号包裹的参数
        const args: string[] = [];
        let current = "";
        let inQuote = false;
        let quoteChar = "";

        for (const char of str) {
            if ((char === '"' || char === "'") && !inQuote) {
                inQuote = true;
                quoteChar = char;
            } else if (char === quoteChar && inQuote) {
                inQuote = false;
                quoteChar = "";
            } else if (char === " " && !inQuote) {
                if (current.trim()) args.push(current.trim());
                current = "";
            } else {
                current += char;
            }
        }

        if (current.trim()) args.push(current.trim());
        return args.length > 0 ? args : undefined;
    };

    /** 保存表单 */
    const handleSave = async () => {
        if (!validateForm()) return;

        setSaving(true);
        try {
            await onSave({
                name: formData.name.trim(),
                description: formData.description.trim() || undefined,
                command: formData.command.trim(),
                args: parseArgs(formData.args),
                env: parseEnvVars(formData.envVars),
                transportType: formData.transportType,
            });
            onClose();
        } catch (err) {
            console.error("Failed to save MCP server:", err);
            setErrors({ ...errors, name: `保存失败: ${err}` });
        } finally {
            setSaving(false);
        }
    };

    /** 删除确认 */
    const handleDelete = async () => {
        if (!onDelete) return;

        setDeleting(true);
        try {
            await onDelete();
            onClose();
        } catch (err) {
            console.error("Failed to delete MCP server:", err);
            setErrors({ ...errors, name: `删除失败: ${err}` });
        } finally {
            setDeleting(false);
            setShowDeleteConfirm(false);
        }
    };

    return (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-ink-900/20 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-2xl border border-ink-900/5 bg-surface shadow-elevated max-h-[90vh] flex flex-col">
                {/* 头部 */}
                <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-ink-900/5">
                    <span className="text-base font-semibold text-ink-800">
                        {isEditMode ? "编辑 MCP 工具" : "添加 MCP 工具"}
                    </span>
                    <button
                        className="rounded-full p-1.5 text-muted hover:bg-surface-tertiary hover:text-ink-700 transition-colors"
                        onClick={onClose}
                        disabled={saving || deleting}
                    >
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* 表单内容 */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                    {/* 名称 */}
                    <label className="block">
                        <span className="text-xs font-medium text-muted">工具名称 *</span>
                        <input
                            type="text"
                            className={`
                mt-1.5 w-full rounded-xl border bg-surface-secondary px-4 py-2.5 text-sm text-ink-800 
                placeholder:text-muted-light focus:outline-none focus:ring-1 transition-colors
                ${errors.name
                                    ? "border-error focus:border-error focus:ring-error/20"
                                    : "border-ink-900/10 focus:border-accent focus:ring-accent/20"
                                }
              `}
                            placeholder="例如：浏览器工具"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        />
                        {errors.name && <p className="mt-1 text-xs text-error">{errors.name}</p>}
                    </label>

                    {/* 描述 */}
                    <label className="block">
                        <span className="text-xs font-medium text-muted">描述</span>
                        <input
                            type="text"
                            className="mt-1.5 w-full rounded-xl border border-ink-900/10 bg-surface-secondary px-4 py-2.5 text-sm text-ink-800 placeholder:text-muted-light focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors"
                            placeholder="简要描述此工具的功能"
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        />
                    </label>

                    {/* 启动命令 */}
                    <label className="block">
                        <span className="text-xs font-medium text-muted">启动命令 *</span>
                        <input
                            type="text"
                            className={`
                mt-1.5 w-full rounded-xl border bg-surface-secondary px-4 py-2.5 text-sm text-ink-800 
                placeholder:text-muted-light focus:outline-none focus:ring-1 transition-colors font-mono
                ${errors.command
                                    ? "border-error focus:border-error focus:ring-error/20"
                                    : "border-ink-900/10 focus:border-accent focus:ring-accent/20"
                                }
              `}
                            placeholder="例如：npx"
                            value={formData.command}
                            onChange={(e) => setFormData({ ...formData, command: e.target.value })}
                        />
                        {errors.command && <p className="mt-1 text-xs text-error">{errors.command}</p>}
                    </label>

                    {/* 命令参数 */}
                    <label className="block">
                        <span className="text-xs font-medium text-muted">命令参数</span>
                        <input
                            type="text"
                            className="mt-1.5 w-full rounded-xl border border-ink-900/10 bg-surface-secondary px-4 py-2.5 text-sm text-ink-800 placeholder:text-muted-light focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors font-mono"
                            placeholder="例如：@playwright/mcp@latest --headless"
                            value={formData.args}
                            onChange={(e) => setFormData({ ...formData, args: e.target.value })}
                        />
                        <p className="mt-1 text-xs text-muted-light">多个参数用空格分隔</p>
                    </label>

                    {/* 环境变量 */}
                    <label className="block">
                        <span className="text-xs font-medium text-muted">环境变量</span>
                        <textarea
                            className={`
                mt-1.5 w-full rounded-xl border bg-surface-secondary px-4 py-2.5 text-sm text-ink-800 
                placeholder:text-muted-light focus:outline-none focus:ring-1 transition-colors font-mono resize-none
                ${errors.envVars
                                    ? "border-error focus:border-error focus:ring-error/20"
                                    : "border-ink-900/10 focus:border-accent focus:ring-accent/20"
                                }
              `}
                            rows={3}
                            placeholder="KEY=VALUE&#10;ANOTHER_KEY=another_value"
                            value={formData.envVars}
                            onChange={(e) => setFormData({ ...formData, envVars: e.target.value })}
                        />
                        {errors.envVars && <p className="mt-1 text-xs text-error">{errors.envVars}</p>}
                        <p className="mt-1 text-xs text-muted-light">每行一个环境变量，格式为 KEY=VALUE</p>
                    </label>

                    {/* 传输类型 */}
                    <label className="block">
                        <span className="text-xs font-medium text-muted">传输类型</span>
                        <select
                            className="mt-1.5 w-full rounded-xl border border-ink-900/10 bg-surface-secondary px-4 py-2.5 text-sm text-ink-800 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors"
                            value={formData.transportType}
                            onChange={(e) => setFormData({ ...formData, transportType: e.target.value as "stdio" | "sse" })}
                        >
                            <option value="stdio">stdio（标准输入输出）</option>
                            <option value="sse">SSE（Server-Sent Events）</option>
                        </select>
                    </label>
                </div>

                {/* 底部按钮 */}
                <div className="px-6 py-4 border-t border-ink-900/5 flex gap-3">
                    {isEditMode && onDelete && (
                        <button
                            className="px-4 py-2.5 text-sm font-medium text-error hover:bg-error-light rounded-xl transition-colors disabled:opacity-50"
                            onClick={() => setShowDeleteConfirm(true)}
                            disabled={saving || deleting}
                        >
                            删除
                        </button>
                    )}
                    <div className="flex-1" />
                    <button
                        className="px-4 py-2.5 text-sm font-medium text-ink-700 hover:bg-surface-tertiary rounded-xl transition-colors disabled:opacity-50"
                        onClick={onClose}
                        disabled={saving || deleting}
                    >
                        取消
                    </button>
                    <button
                        className="px-6 py-2.5 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-xl shadow-soft transition-colors disabled:opacity-50"
                        onClick={handleSave}
                        disabled={saving || deleting}
                    >
                        {saving ? "保存中..." : "保存"}
                    </button>
                </div>
            </div>

            {/* 删除确认对话框 */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 z-70 flex items-center justify-center bg-ink-900/40">
                    <div className="w-full max-w-sm rounded-2xl border border-ink-900/5 bg-surface p-6 shadow-elevated">
                        <h3 className="text-base font-semibold text-ink-800">确认删除</h3>
                        <p className="mt-2 text-sm text-muted">
                            确定要删除「{formData.name}」吗？此操作无法撤销。
                        </p>
                        <div className="mt-5 flex gap-3">
                            <button
                                className="flex-1 px-4 py-2.5 text-sm font-medium text-ink-700 hover:bg-surface-tertiary rounded-xl transition-colors"
                                onClick={() => setShowDeleteConfirm(false)}
                                disabled={deleting}
                            >
                                取消
                            </button>
                            <button
                                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-error hover:bg-error/90 rounded-xl transition-colors disabled:opacity-50"
                                onClick={handleDelete}
                                disabled={deleting}
                            >
                                {deleting ? "删除中..." : "确认删除"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
