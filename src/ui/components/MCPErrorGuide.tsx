/**
 * MCP 错误引导组件
 * 展示错误详情和解决建议
 */

import { useState } from "react";

interface MCPErrorGuideProps {
    /** 错误类型 */
    errorType: "node-not-found" | "network" | "timeout" | "server-crash" | "unknown";
    /** 错误消息 */
    errorMessage?: string;
    /** 错误详情 */
    errorDetails?: string;
    /** 重试回调 */
    onRetry?: () => void;
    /** 关闭回调 */
    onClose?: () => void;
}

/** 错误类型配置 */
const ERROR_CONFIGS: Record<string, {
    title: string;
    description: string;
    suggestions: string[];
    helpUrl?: string;
}> = {
    "node-not-found": {
        title: "Node.js 环境未检测到",
        description: "MCP 工具需要 Node.js 环境才能运行。",
        suggestions: [
            "请访问 https://nodejs.org 下载并安装 Node.js",
            "安装完成后，请重启应用",
            "确保 Node.js 已添加到系统 PATH 环境变量",
        ],
        helpUrl: "https://nodejs.org/",
    },
    "network": {
        title: "网络连接问题",
        description: "无法下载 MCP 工具所需的依赖包。",
        suggestions: [
            "请检查您的网络连接是否正常",
            "如果您使用代理，请确保代理设置正确",
            "尝试稍后重试",
        ],
    },
    "timeout": {
        title: "启动超时",
        description: "MCP Server 启动时间过长，已自动终止。",
        suggestions: [
            "这可能是由于网络缓慢或首次下载依赖导致",
            "请检查网络连接后重试",
            "如果问题持续，请查看错误详情获取更多信息",
        ],
    },
    "server-crash": {
        title: "服务异常退出",
        description: "MCP Server 意外崩溃，已尝试自动重启但失败。",
        suggestions: [
            "请检查错误详情获取更多信息",
            "尝试禁用后重新启用该工具",
            "如果问题持续，请检查系统资源是否充足",
        ],
    },
    "unknown": {
        title: "发生错误",
        description: "MCP 工具遇到了一个问题。",
        suggestions: [
            "请查看错误详情获取更多信息",
            "尝试重新启用该工具",
            "如果问题持续，请联系技术支持",
        ],
    },
};

export function MCPErrorGuide({
    errorType,
    errorMessage,
    errorDetails,
    onRetry,
    onClose,
}: MCPErrorGuideProps) {
    const [showDetails, setShowDetails] = useState(false);

    const config = ERROR_CONFIGS[errorType] || ERROR_CONFIGS["unknown"];

    return (
        <div className="rounded-xl border border-error/20 bg-error-light/50 p-4">
            {/* 头部 */}
            <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-error/10 flex items-center justify-center">
                    <svg viewBox="0 0 24 24" className="w-4 h-4 text-error" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-ink-800">{config.title}</h3>
                    <p className="mt-1 text-xs text-muted">{config.description}</p>

                    {/* 错误消息 */}
                    {errorMessage && (
                        <p className="mt-2 text-xs text-error font-mono bg-error/5 rounded px-2 py-1">
                            {errorMessage}
                        </p>
                    )}
                </div>

                {/* 关闭按钮 */}
                {onClose && (
                    <button
                        className="flex-shrink-0 p-1 text-muted hover:text-ink-700 transition-colors"
                        onClick={onClose}
                    >
                        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>
                )}
            </div>

            {/* 解决建议 */}
            <div className="mt-4 pl-11">
                <p className="text-xs font-medium text-ink-700 mb-2">解决建议：</p>
                <ul className="space-y-1.5">
                    {config.suggestions.map((suggestion, index) => (
                        <li key={index} className="flex items-start gap-2 text-xs text-muted">
                            <span className="flex-shrink-0 w-4 h-4 rounded-full bg-ink-100 flex items-center justify-center text-xs text-ink-500">
                                {index + 1}
                            </span>
                            {suggestion}
                        </li>
                    ))}
                </ul>
            </div>

            {/* 错误详情（可折叠） */}
            {errorDetails && (
                <div className="mt-4 pl-11">
                    <button
                        className="text-xs text-muted hover:text-ink-700 transition-colors flex items-center gap-1"
                        onClick={() => setShowDetails(!showDetails)}
                    >
                        <svg
                            viewBox="0 0 24 24"
                            className={`w-3 h-3 transition-transform ${showDetails ? "rotate-90" : ""}`}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                        >
                            <path d="M9 18l6-6-6-6" />
                        </svg>
                        {showDetails ? "隐藏详情" : "显示详情"}
                    </button>

                    {showDetails && (
                        <pre className="mt-2 p-3 rounded-lg bg-ink-900 text-ink-100 text-xs font-mono overflow-x-auto max-h-40 overflow-y-auto">
                            {errorDetails}
                        </pre>
                    )}
                </div>
            )}

            {/* 操作按钮 */}
            <div className="mt-4 pl-11 flex items-center gap-3">
                {onRetry && (
                    <button
                        className="px-4 py-2 text-xs font-medium text-white bg-accent rounded-lg hover:bg-accent-hover transition-colors"
                        onClick={onRetry}
                    >
                        重试
                    </button>
                )}

                {config.helpUrl && (
                    <a
                        href={config.helpUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 text-xs font-medium text-accent hover:text-accent-hover transition-colors"
                    >
                        获取帮助 →
                    </a>
                )}
            </div>
        </div>
    );
}

/**
 * 根据错误消息推断错误类型
 */
export function inferErrorType(errorMessage: string): MCPErrorGuideProps["errorType"] {
    const msg = errorMessage.toLowerCase();

    if (msg.includes("node") && (msg.includes("not found") || msg.includes("未检测"))) {
        return "node-not-found";
    }

    if (msg.includes("network") || msg.includes("enotfound") || msg.includes("econnrefused")) {
        return "network";
    }

    if (msg.includes("timeout") || msg.includes("超时")) {
        return "timeout";
    }

    if (msg.includes("crash") || msg.includes("exit") || msg.includes("崩溃")) {
        return "server-crash";
    }

    return "unknown";
}
