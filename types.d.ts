type Statistics = {
    cpuUsage: number;
    ramUsage: number;
    storageData: number;
}

type StaticData = {
    totalStorage: number;
    cpuModel: string;
    totalMemoryGB: number;
}

type UnsubscribeFunction = () => void;

type SessionTemplate = {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  initialPrompt: string;
  suggestedCwd?: string;
  allowedTools?: string;
  tags?: string[];
  version: string;
  author?: string;
};

type StoredSession = {
  id: string;
  title: string;
  status: "idle" | "running" | "completed" | "error" | "stopped";
  cwd?: string;
  allowedTools?: string;
  lastPrompt?: string;
  claudeSessionId?: string;
  createdAt: number;
  updatedAt: number;
};

type AuditOperation = "read" | "write" | "delete" | "move" | "execute" | "security-block" | "session-start" | "session-stop" | "permission-grant" | "permission-deny";

type AuditLogEntry = {
  id: string;
  sessionId: string;
  timestamp: number;
  operation: AuditOperation;
  path?: string;
  details?: string;
  success: boolean;
  duration?: number;
  metadata?: Record<string, unknown>;
};

type AuditQueryOptions = {
  sessionId?: string;
  operation?: AuditOperation;
  startDate?: number;
  endDate?: number;
  limit?: number;
  offset?: number;
};

type AuditStatistics = {
  totalOperations: number;
  successRate: number;
  operationsByType: Record<AuditOperation, number>;
  averageDuration: number;
  errorCount: number;
};

// EventPayloadMapping 映射事件键到返回值类型
type EventPayloadMapping = {
    statistics: Statistics;
    getStaticData: StaticData;
    "generate-session-title": string;
    "get-recent-cwds": string[];
    "select-directory": string | null;
    "get-api-config": { apiKey: string; baseURL: string; model: string; apiType?: "anthropic" } | null;
    "save-api-config": { success: boolean; error?: string };
    "check-api-config": { hasConfig: boolean; config: { apiKey: string; baseURL: string; model: string; apiType?: "anthropic" } | null };
    "get-templates": SessionTemplate[];
    "get-template": SessionTemplate | undefined;
    "search-templates": SessionTemplate[];
    "add-template": { success: boolean; error?: string };
    "search-sessions": StoredSession[];
    "search-messages": unknown[];
    "advanced-search": StoredSession[];
    "get-audit-logs": AuditLogEntry[];
    "get-recent-logs": AuditLogEntry[];
    "get-audit-statistics": AuditStatistics | null;
    "export-audit-logs": string;
    "cleanup-audit-logs": number;
}

interface Window {
    electron: {
        subscribeStatistics: (callback: (statistics: Statistics) => void) => UnsubscribeFunction;
        getStaticData: () => Promise<StaticData>;
        // Claude Agent IPC APIs
        sendClientEvent: (event: any) => void;
        onServerEvent: (callback: (event: any) => void) => UnsubscribeFunction;
        generateSessionTitle: (userInput: string | null) => Promise<string>;
        getRecentCwds: (limit?: number) => Promise<string[]>;
        selectDirectory: () => Promise<string | null>;
        getApiConfig: () => Promise<{ apiKey: string; baseURL: string; model: string; apiType?: "anthropic" } | null>;
        saveApiConfig: (config: { apiKey: string; baseURL: string; model: string; apiType?: "anthropic" }) => Promise<{ success: boolean; error?: string }>;
        checkApiConfig: () => Promise<{ hasConfig: boolean; config: { apiKey: string; baseURL: string; model: string; apiType?: "anthropic" } | null }>;
        // Template APIs
        getTemplates: () => Promise<SessionTemplate[]>;
        getTemplate: (id: string) => Promise<SessionTemplate | undefined>;
        searchTemplates: (query: string) => Promise<SessionTemplate[]>;
        addTemplate: (template: SessionTemplate) => Promise<{ success: boolean; error?: string }>;
        // Search APIs
        searchSessions: (query: string, options?: { limit?: number; includeMessages?: boolean }) => Promise<StoredSession[]>;
        searchMessages: (sessionId: string, query: string, options?: { limit?: number; includeContext?: boolean }) => Promise<unknown[]>;
        advancedSearch: (filters: { query?: string; status?: "idle" | "running" | "completed" | "error" | "stopped"; cwd?: string; startDate?: number; endDate?: number; limit?: number; offset?: number }) => Promise<StoredSession[]>;
        // Audit Log APIs
        getAuditLogs: (sessionId: string, options?: AuditQueryOptions) => Promise<AuditLogEntry[]>;
        getRecentLogs: (limit?: number) => Promise<AuditLogEntry[]>;
        getAuditStatistics: (sessionId?: string) => Promise<AuditStatistics | null>;
        exportAuditLogs: (options: AuditQueryOptions, format: 'json' | 'csv') => Promise<string>;
        cleanupAuditLogs: (beforeDate: number) => Promise<number>;
    }
}
