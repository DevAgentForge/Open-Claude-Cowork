/**
 * AI 助手管理面板组件
 * 展示和管理 Sub Agent（AI 助手）列表
 */

import { useEffect, useState, useCallback } from "react";

/** AI 助手信息 */
interface AgentInfo {
    id: string;
    name: string;
    description: string;
    prompt: string;
    enabled: boolean;
    model: string;
    isBuiltin: boolean;
    createdAt: string;
    updatedAt: string;
}

/** 助手表单数据 */
interface AgentFormData {
    name: string;
    description: string;
    prompt: string;
}

/** 助手表单组件 Props */
interface AgentFormProps {
    initialData?: AgentFormData & { id?: string };
    onClose: () => void;
    onSave: (data: AgentFormData) => Promise<void>;
    onDelete?: () => Promise<void>;
}

/** 助手创建/编辑表单 */
function AgentForm({ initialData, onClose, onSave, onDelete }: AgentFormProps) {
    const [name, setName] = useState(initialData?.name || "");
    const [description, setDescription] = useState(initialData?.description || "");
    const [prompt, setPrompt] = useState(initialData?.prompt || "");
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isEdit = !!initialData?.id;

    const handleSave = async () => {
        if (!name.trim() || !description.trim() || !prompt.trim()) {
            setError("请填写所有必填项");
            return;
        }
        setSaving(true);
        setError(null);
        try {
            await onSave({ name: name.trim(), description: description.trim(), prompt: prompt.trim() });
            onClose();
        } catch (err) {
            setError(`保存失败: ${err}`);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!onDelete) return;
        if (!window.confirm("确定要删除这个助手吗？删除后不可恢复。")) return;
        setDeleting(true);
        try {
            await onDelete();
            onClose();
        } catch (err) {
            setError(`删除失败: ${err}`);
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-ink-900/20 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-2xl border border-ink-900/5 bg-surface shadow-elevated max-h-[85vh] flex flex-col">
                {/* 头部 */}
                <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-ink-900/5">
                    <span className="text-base font-semibold text-ink-800">
                        {isEdit ? "编辑助手" : "添加自定义助手"}
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
                <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
                    {/* 名称 */}
                    <div>
                        <label className="text-sm font-medium text-ink-700">
                            助手名称 <span className="text-error">*</span>
                        </label>
                        <p className="mt-1 text-xs text-muted">给你的助手起一个简短的名称</p>
                        <input
                            type="text"
                            className="mt-2 w-full rounded-xl border border-ink-900/10 bg-surface-secondary px-4 py-2.5 text-sm text-ink-800 placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
                            placeholder="例如：会议纪要助手"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>

                    {/* 描述 */}
                    <div>
                        <label className="text-sm font-medium text-ink-700">
                            用途说明 <span className="text-error">*</span>
                        </label>
                        <p className="mt-1 text-xs text-muted">简要描述这个助手能帮你做什么</p>
                        <input
                            type="text"
                            className="mt-2 w-full rounded-xl border border-ink-900/10 bg-surface-secondary px-4 py-2.5 text-sm text-ink-800 placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
                            placeholder="例如：帮助整理会议内容、生成会议纪要"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </div>

                    {/* 提示词 */}
                    <div>
                        <label className="text-sm font-medium text-ink-700">
                            使用说明 <span className="text-error">*</span>
                        </label>
                        <p className="mt-1 text-xs text-muted">
                            告诉 AI 这个助手应该怎么工作、有哪些注意事项
                        </p>
                        <textarea
                            className="mt-2 w-full rounded-xl border border-ink-900/10 bg-surface-secondary px-4 py-3 text-sm text-ink-800 placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30 resize-none"
                            rows={6}
                            placeholder="例如：你是一位专业的会议纪要助手。请根据会议内容，整理出结构清晰的会议纪要，包括：参会人员、议题、讨论要点、决议事项和待办任务。"
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                        />
                    </div>

                    {/* 错误提示 */}
                    {error && (
                        <div className="p-3 rounded-xl bg-error-light text-sm text-error">
                            {error}
                        </div>
                    )}
                </div>

                {/* 底部按钮 */}
                <div className="px-6 py-4 border-t border-ink-900/5 flex justify-between">
                    <div>
                        {isEdit && onDelete && (
                            <button
                                className="px-4 py-2.5 text-sm font-medium text-error hover:bg-error-light rounded-xl transition-colors disabled:opacity-50"
                                onClick={handleDelete}
                                disabled={saving || deleting}
                            >
                                {deleting ? "删除中..." : "删除助手"}
                            </button>
                        )}
                    </div>
                    <div className="flex gap-3">
                        <button
                            className="px-4 py-2.5 text-sm font-medium text-ink-700 hover:bg-surface-tertiary rounded-xl transition-colors"
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
            </div>
        </div>
    );
}

export function AgentsPanel() {
    const [agents, setAgents] = useState<AgentInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showAddForm, setShowAddForm] = useState(false);
    const [editingAgent, setEditingAgent] = useState<AgentInfo | null>(null);

    // 加载助手列表
    const loadAgents = useCallback(async () => {
        try {
            const result = await window.electron.getAgents();
            setAgents(result);
            setError(null);
        } catch (err) {
            console.error("Failed to load agents:", err);
            setError("加载 AI 助手列表失败");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadAgents();

        // 监听配置变化
        const unsubscribe = window.electron.onAgentsConfigChange(() => {
            loadAgents();
        });

        return unsubscribe;
    }, [loadAgents]);

    // 切换启用/禁用
    const handleToggle = async (agentId: string, enabled: boolean) => {
        setActionLoading(agentId);
        try {
            await window.electron.toggleAgent(agentId, enabled);
            await loadAgents();
        } catch (err) {
            console.error("Failed to toggle agent:", err);
            setError(`操作失败: ${err}`);
        } finally {
            setActionLoading(null);
        }
    };

    // 添加助手
    const handleAdd = async (data: AgentFormData) => {
        await window.electron.addAgent({
            name: data.name,
            description: data.description,
            prompt: data.prompt,
        });
        await loadAgents();
    };

    // 更新助手
    const handleUpdate = async (agentId: string, data: AgentFormData) => {
        await window.electron.updateAgent(agentId, {
            name: data.name,
            description: data.description,
            prompt: data.prompt,
        });
        await loadAgents();
    };

    // 删除助手
    const handleDelete = async (agentId: string) => {
        await window.electron.deleteAgent(agentId);
        await loadAgents();
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

    // 分离内置和自定义助手
    const builtinAgents = agents.filter((a) => a.isBuiltin);
    const customAgents = agents.filter((a) => !a.isBuiltin);

    return (
        <div className="space-y-5">
            {/* 描述 */}
            <p className="text-sm text-muted">
                AI 助手是具备专项能力的 AI 角色。启用后，AI 会在合适的场景自动调用对应的助手来更好地完成任务。
            </p>

            {/* 错误提示 */}
            {error && (
                <div className="rounded-xl border border-error/20 bg-error-light px-4 py-3 text-sm text-error">
                    {error}
                    <button
                        className="ml-2 underline hover:no-underline"
                        onClick={() => setError(null)}
                    >
                        关闭
                    </button>
                </div>
            )}

            {/* 内置助手 */}
            <div className="space-y-3">
                <span className="text-sm font-medium text-ink-700">预设助手</span>
                <div className="space-y-2">
                    {builtinAgents.map((agent) => (
                        <div
                            key={agent.id}
                            className="rounded-xl border border-ink-900/5 bg-surface-secondary p-4 hover:border-ink-900/10 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                {/* 助手图标 */}
                                <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${agent.enabled ? "bg-accent/10" : "bg-ink-100"}`}>
                                    <svg viewBox="0 0 24 24" className={`w-4.5 h-4.5 ${agent.enabled ? "text-accent" : "text-muted"}`} fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                        <circle cx="12" cy="7" r="4" />
                                    </svg>
                                </div>

                                {/* 助手信息 */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-ink-800 truncate">
                                            {agent.name}
                                        </span>
                                        <span className="px-1.5 py-0.5 text-xs text-muted bg-ink-100 rounded">
                                            内置
                                        </span>
                                    </div>
                                    <p className="mt-0.5 text-xs text-muted truncate">
                                        {agent.description}
                                    </p>
                                </div>

                                {/* 启用/禁用开关 */}
                                <button
                                    className={`
                                        relative w-11 h-6 rounded-full transition-colors
                                        ${agent.enabled ? "bg-accent" : "bg-ink-200"}
                                        ${actionLoading === agent.id ? "opacity-50" : ""}
                                    `}
                                    onClick={() => handleToggle(agent.id, !agent.enabled)}
                                    disabled={actionLoading === agent.id}
                                    aria-label={agent.enabled ? "禁用" : "启用"}
                                >
                                    <span
                                        className={`
                                            absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform
                                            ${agent.enabled ? "left-6" : "left-1"}
                                        `}
                                    />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* 自定义助手 */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-ink-700">自定义助手</span>
                    <button
                        className="text-xs text-accent hover:text-accent-hover transition-colors"
                        onClick={() => setShowAddForm(true)}
                    >
                        + 添加助手
                    </button>
                </div>

                {customAgents.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-ink-900/10 bg-surface-secondary p-6 text-center">
                        <div className="w-12 h-12 mx-auto rounded-full bg-ink-100 flex items-center justify-center">
                            <svg viewBox="0 0 24 24" className="w-6 h-6 text-muted" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                        </div>
                        <p className="mt-3 text-sm text-muted">还没有自定义助手</p>
                        <p className="mt-1 text-xs text-muted-light">
                            点击「添加助手」创建一个专属助手，例如会议纪要、周报撰写等
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {customAgents.map((agent) => (
                            <div
                                key={agent.id}
                                className="rounded-xl border border-ink-900/5 bg-surface-secondary p-4 hover:border-ink-900/10 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    {/* 助手图标 */}
                                    <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${agent.enabled ? "bg-accent/10" : "bg-ink-100"}`}>
                                        <svg viewBox="0 0 24 24" className={`w-4.5 h-4.5 ${agent.enabled ? "text-accent" : "text-muted"}`} fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                                        </svg>
                                    </div>

                                    {/* 助手信息 */}
                                    <div className="flex-1 min-w-0">
                                        <span className="text-sm font-medium text-ink-800 truncate block">
                                            {agent.name}
                                        </span>
                                        <p className="mt-0.5 text-xs text-muted truncate">
                                            {agent.description}
                                        </p>
                                    </div>

                                    {/* 操作按钮 */}
                                    <div className="flex items-center gap-2">
                                        {/* 编辑按钮 */}
                                        <button
                                            className="p-1.5 text-muted hover:text-ink-700 hover:bg-surface-tertiary rounded-lg transition-colors"
                                            onClick={() => setEditingAgent(agent)}
                                            title="编辑"
                                        >
                                            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                            </svg>
                                        </button>

                                        {/* 启用/禁用开关 */}
                                        <button
                                            className={`
                                                relative w-11 h-6 rounded-full transition-colors
                                                ${agent.enabled ? "bg-accent" : "bg-ink-200"}
                                                ${actionLoading === agent.id ? "opacity-50" : ""}
                                            `}
                                            onClick={() => handleToggle(agent.id, !agent.enabled)}
                                            disabled={actionLoading === agent.id}
                                            aria-label={agent.enabled ? "禁用" : "启用"}
                                        >
                                            <span
                                                className={`
                                                    absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform
                                                    ${agent.enabled ? "left-6" : "left-1"}
                                                `}
                                            />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* 添加助手表单 */}
            {showAddForm && (
                <AgentForm
                    onClose={() => setShowAddForm(false)}
                    onSave={handleAdd}
                />
            )}

            {/* 编辑助手表单 */}
            {editingAgent && (
                <AgentForm
                    initialData={{
                        id: editingAgent.id,
                        name: editingAgent.name,
                        description: editingAgent.description,
                        prompt: editingAgent.prompt,
                    }}
                    onClose={() => setEditingAgent(null)}
                    onSave={(data) => handleUpdate(editingAgent.id, data)}
                    onDelete={() => handleDelete(editingAgent.id)}
                />
            )}
        </div>
    );
}
