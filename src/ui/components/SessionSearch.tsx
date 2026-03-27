import { useCallback, useEffect, useState } from "react";

export interface StoredSession {
  id: string;
  title: string;
  status: "idle" | "running" | "completed" | "error";
  cwd?: string;
  allowedTools?: string;
  lastPrompt?: string;
  claudeSessionId?: string;
  createdAt: number;
  updatedAt: number;
}

interface SearchResultsProps {
  sessions: StoredSession[];
  onSelectSession: (sessionId: string) => void;
  loading?: boolean;
}

function SearchResults({ sessions, onSelectSession, loading }: SearchResultsProps) {
  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <svg
          aria-hidden="true"
          className="h-6 w-6 animate-spin text-accent"
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
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="text-center">
          <svg
            className="mx-auto mb-2 h-8 w-8 text-muted"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-sm text-muted">No sessions found</p>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: StoredSession["status"]) => {
    switch (status) {
      case "running":
        return "text-blue-500 bg-blue-50";
      case "completed":
        return "text-green-500 bg-green-50";
      case "error":
        return "text-red-500 bg-red-50";
      default:
        return "text-muted bg-surface-secondary";
    }
  };

  const getStatusLabel = (status: StoredSession["status"]) => {
    switch (status) {
      case "running":
        return "Running";
      case "completed":
        return "Completed";
      case "error":
        return "Error";
      default:
        return "Idle";
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;

    return date.toLocaleDateString();
  };

  return (
    <div className="max-h-96 space-y-2 overflow-y-auto">
      {sessions.map((session) => (
        <button
          key={session.id}
          onClick={() => onSelectSession(session.id)}
          className="group w-full rounded-lg border border-ink-900/10 bg-surface p-3 text-left hover:border-accent/30 hover:bg-surface-tertiary transition-all duration-200"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1">
              <h4 className="truncate text-sm font-medium text-ink-800 group-hover:text-accent transition-colors">
                {session.title}
              </h4>
              {session.lastPrompt && (
                <p className="mt-1 line-clamp-1 text-xs text-muted">
                  {session.lastPrompt}
                </p>
              )}
              {session.cwd && (
                <p className="mt-1 truncate text-[10px] text-muted-light">
                  {session.cwd}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${getStatusColor(session.status)}`}
              >
                {getStatusLabel(session.status)}
              </span>
              <span className="text-[10px] text-muted-light">
                {formatDate(session.updatedAt)}
              </span>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

interface SessionSearchProps {
  onSelectSession: (sessionId: string) => void;
  onClose: () => void;
}

export function SessionSearch({ onSelectSession, onClose }: SessionSearchProps) {
  const [query, setQuery] = useState("");
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchType, setSearchType] = useState<"basic" | "advanced">("basic");

  const performSearch = useCallback(async () => {
    if (!query.trim()) return;

    try {
      setLoading(true);
      setError(null);

      let results: StoredSession[];
      if (searchType === "basic") {
        results = await window.electron.searchSessions(query, { limit: 20 });
      } else {
        results = await window.electron.advancedSearch({
          query,
          limit: 20,
        });
      }

      setSessions(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      console.error("Search failed:", err);
    } finally {
      setLoading(false);
    }
  }, [query, searchType]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (query.trim()) {
        performSearch();
      } else {
        setSessions([]);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query, performSearch]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20%] px-4">
      <div className="w-full max-w-2xl rounded-2xl border border-ink-900/5 bg-surface shadow-elevated">
        {/* Search Input */}
        <div className="flex items-center gap-2 border-b border-ink-900/5 p-4">
          <div className="relative flex-1">
            <svg
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search sessions by title, prompt, or path..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-lg border border-ink-900/10 bg-surface-secondary py-2 pl-9 pr-4 text-sm text-ink-800 placeholder:text-muted-light focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors"
              autoFocus
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSearchType(searchType === "basic" ? "advanced" : "basic")}
              className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                searchType === "basic"
                  ? "bg-surface-tertiary text-muted hover:text-ink-700"
                  : "bg-accent/10 text-accent"
              }`}
            >
              {searchType === "basic" ? "Basic" : "Advanced"}
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-muted hover:bg-surface-tertiary hover:text-ink-700 transition-colors"
              aria-label="Close"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="p-4">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
          <SearchResults
            sessions={sessions}
            onSelectSession={onSelectSession}
            loading={loading}
          />
        </div>

        {/* Keyboard Hint */}
        {query && (
          <div className="border-t border-ink-900/5 px-4 py-2">
            <p className="text-[10px] text-muted-light">
              Press <kbd className="rounded bg-surface-secondary px-1.5 py-0.5">Esc</kbd> to close
            </p>
          </div>
        )}
      </div>
    </div>
  );
}