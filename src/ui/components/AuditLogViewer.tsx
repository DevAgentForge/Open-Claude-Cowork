import { useCallback, useEffect, useState } from "react";

export type AuditOperation =
  | "read"
  | "write"
  | "delete"
  | "move"
  | "execute"
  | "security-block"
  | "session-start"
  | "session-stop"
  | "permission-grant"
  | "permission-deny";

export interface AuditLogEntry {
  id: string;
  sessionId: string;
  timestamp: number;
  operation: AuditOperation;
  path?: string;
  details?: string;
  success: boolean;
  duration?: number;
  metadata?: Record<string, unknown>;
}

export interface AuditStatistics {
  totalOperations: number;
  successRate: number;
  operationsByType: Record<AuditOperation, number>;
  averageDuration: number;
  errorCount: number;
}

interface AuditLogEntryProps {
  entry: AuditLogEntry;
}

function AuditLogEntry({ entry }: AuditLogEntryProps) {
  const getOperationIcon = (operation: AuditOperation) => {
    switch (operation) {
      case "read":
        return (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        );
      case "write":
        return (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        );
      case "delete":
        return (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        );
      case "execute":
        return (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case "security-block":
        return (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        );
      case "session-start":
        return (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        );
      case "session-stop":
        return (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
          </svg>
        );
      case "permission-grant":
        return (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case "permission-deny":
        return (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      default:
        return (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  const getOperationColor = (operation: AuditOperation, success: boolean) => {
    if (!success) return "text-red-500 bg-red-50";

    switch (operation) {
      case "read":
        return "text-blue-500 bg-blue-50";
      case "write":
        return "text-green-500 bg-green-50";
      case "delete":
        return "text-orange-500 bg-orange-50";
      case "execute":
        return "text-purple-500 bg-purple-50";
      case "security-block":
        return "text-red-500 bg-red-50";
      case "session-start":
        return "text-emerald-500 bg-emerald-50";
      case "session-stop":
        return "text-gray-500 bg-gray-50";
      case "permission-grant":
        return "text-green-500 bg-green-50";
      case "permission-deny":
        return "text-red-500 bg-red-50";
      default:
        return "text-muted bg-surface-secondary";
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return "-";
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${(ms / 60000).toFixed(2)}m`;
  };

  return (
    <div className="flex items-start gap-3 rounded-lg border border-ink-900/5 bg-surface p-3">
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${getOperationColor(
          entry.operation,
          entry.success
        )}`}
      >
        {getOperationIcon(entry.operation)}
      </div>
      <div className="flex min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-ink-800 capitalize">
                {entry.operation.replace(/-/g, " ")}
              </span>
              {!entry.success && (
                <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
                  Failed
                </span>
              )}
            </div>
            {entry.path && (
              <p className="mt-0.5 truncate text-[10px] text-muted">
                {entry.path}
              </p>
            )}
            {entry.details && (
              <p className="mt-0.5 line-clamp-1 text-[10px] text-muted-light">
                {entry.details}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-0.5">
            <span className="text-[10px] text-muted-light">{formatDate(entry.timestamp)}</span>
            {entry.duration !== undefined && (
              <span className="text-[10px] text-muted">{formatDuration(entry.duration)}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface AuditLogViewerProps {
  sessionId?: string;
  onClose: () => void;
}

export function AuditLogViewer({ sessionId, onClose }: AuditLogViewerProps) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [statistics, setStatistics] = useState<AuditStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "read" | "write" | "delete" | "execute" | "security">("all");

  const loadLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [logsData, statsData] = await Promise.all([
        window.electron.getAuditLogs(sessionId || "", { limit: 100 }),
        window.electron.getAuditStatistics(sessionId),
      ]);

      setLogs(logsData);
      setStatistics(statsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit logs");
      console.error("Failed to load audit logs:", err);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const filteredLogs = logs.filter((log) => {
    if (filter === "all") return true;
    if (filter === "security") {
      return (
        log.operation === "security-block" ||
        log.operation === "permission-grant" ||
        log.operation === "permission-deny"
      );
    }
    return log.operation === filter;
  });

  const handleExport = async () => {
    try {
      const data = await window.electron.exportAuditLogs(
        { sessionId, limit: 1000 },
        "json"
      );
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-logs-${sessionId || "all"}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to export logs:", err);
    }
  };

  const handleCleanup = async () => {
    if (!confirm("Are you sure you want to delete logs older than 30 days?")) {
      return;
    }

    try {
      const beforeDate = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const count = await window.electron.cleanupAuditLogs(beforeDate);
      alert(`Deleted ${count} old log entries`);
      loadLogs();
    } catch (err) {
      console.error("Failed to cleanup logs:", err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/20 px-4 py-8 backdrop-blur-sm">
      <div className="flex h-[600px] w-full max-w-4xl flex-col rounded-2xl border border-ink-900/5 bg-surface shadow-elevated">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ink-900/5 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-ink-800">Audit Logs</h2>
            <p className="mt-0.5 text-xs text-muted">
              {sessionId ? `Session: ${sessionId}` : "All sessions"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="rounded-lg px-3 py-2 text-xs font-medium text-ink-700 hover:bg-surface-tertiary transition-colors"
            >
              Export
            </button>
            <button
              onClick={handleCleanup}
              className="rounded-lg px-3 py-2 text-xs font-medium text-ink-700 hover:bg-surface-tertiary transition-colors"
            >
              Cleanup
            </button>
            <button
              onClick={onClose}
              className="rounded-full p-1.5 text-muted hover:bg-surface-tertiary hover:text-ink-700 transition-colors"
              aria-label="Close"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Statistics */}
        {statistics && (
          <div className="border-b border-ink-900/5 px-6 py-3">
            <div className="flex items-center gap-6">
              <div>
                <span className="text-[10px] uppercase tracking-wide text-muted">Total</span>
                <p className="text-lg font-semibold text-ink-800">{statistics.totalOperations}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wide text-muted">Success Rate</span>
                <p className="text-lg font-semibold text-green-600">
                  {(statistics.successRate * 100).toFixed(1)}%
                </p>
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wide text-muted">Errors</span>
                <p className="text-lg font-semibold text-red-600">{statistics.errorCount}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wide text-muted">Avg Duration</span>
                <p className="text-lg font-semibold text-ink-800">
                  {statistics.averageDuration > 0
                    ? `${statistics.averageDuration.toFixed(0)}ms`
                    : "-"}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Filter */}
        <div className="border-b border-ink-900/5 px-6 py-3">
          <div className="flex gap-2 overflow-x-auto">
            {[
              { value: "all", label: "All" },
              { value: "read", label: "Read" },
              { value: "write", label: "Write" },
              { value: "delete", label: "Delete" },
              { value: "execute", label: "Execute" },
              { value: "security", label: "Security" },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => setFilter(option.value as "all" | "read" | "write" | "delete" | "execute" | "security")}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  filter === option.value
                    ? "bg-accent/10 text-accent"
                    : "bg-surface-tertiary text-muted hover:text-ink-700"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <svg
                aria-hidden="true"
                className="h-8 w-8 animate-spin text-accent"
                viewBox="0 0 100 101"
                fill="none"
              >
                <path
                  d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z"
                  fill="currentColor"
                  opacity="0.3"
                />
                <path
                  d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z"
                  fill="white"
                />
              </svg>
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
                  <svg
                    className="h-6 w-6 text-red-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <p className="text-sm text-red-600">{error}</p>
                <button
                  onClick={loadLogs}
                  className="mt-2 text-sm text-accent hover:text-accent-hover"
                >
                  Try again
                </button>
              </div>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-surface-secondary">
                  <svg
                    className="h-6 w-6 text-muted"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <p className="text-sm text-muted">No audit logs found</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredLogs.map((log) => (
                <AuditLogEntry key={log.id} entry={log} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}