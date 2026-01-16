import { useTheme, ThemeMode } from "../contexts/ThemeContext";

interface ThemeSettingsProps {
  onClose: () => void;
}

export function ThemeSettings({ onClose }: ThemeSettingsProps) {
  const { theme, setMode, setSidebarColor, setWorkspaceColor } = useTheme();

  const handleModeChange = (mode: ThemeMode) => {
    setMode(mode);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/20 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-ink-900/5 bg-surface p-6 shadow-elevated">
        <div className="flex items-center justify-between mb-4">
          <div className="text-base font-semibold text-ink-800 dark:text-white">
            Theme Settings
          </div>
          <button
            className="rounded-full p-1.5 text-muted hover:bg-surface-tertiary hover:text-ink-700 transition-colors"
            onClick={onClose}
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-5">
          {/* Mode Toggle */}
          <div>
            <label className="text-xs font-medium text-muted uppercase tracking-wide mb-2 block">
              Theme Mode
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => handleModeChange("light")}
                className={`flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                  theme.mode === "light"
                    ? "bg-accent text-white"
                    : "bg-surface-secondary text-ink-700 hover:bg-surface-tertiary dark:bg-ink-900/30 dark:text-white"
                }`}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="5" />
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                </svg>
                Light
              </button>
              <button
                onClick={() => handleModeChange("dark")}
                className={`flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                  theme.mode === "dark"
                    ? "bg-accent text-white"
                    : "bg-surface-secondary text-ink-700 hover:bg-surface-tertiary dark:bg-ink-900/30 dark:text-white"
                }`}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
                Dark
              </button>
            </div>
          </div>

          {/* Sidebar Color */}
          <div>
            <label className="text-xs font-medium text-muted uppercase tracking-wide mb-2 block">
              Sidebar Color
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={theme.sidebarColor}
                onChange={(e) => setSidebarColor(e.target.value)}
                className="h-10 w-16 cursor-pointer rounded-lg border border-ink-900/10"
              />
              <input
                type="text"
                value={theme.sidebarColor}
                onChange={(e) => setSidebarColor(e.target.value)}
                className="flex-1 rounded-xl border border-ink-900/10 bg-surface-secondary px-4 py-2.5 text-sm text-ink-800 dark:bg-ink-900/30 dark:text-white placeholder:text-muted-light focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors font-mono"
                placeholder="#FAF9F6"
              />
            </div>
          </div>

          {/* Workspace Color */}
          <div>
            <label className="text-xs font-medium text-muted uppercase tracking-wide mb-2 block">
              Workspace Color
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={theme.workspaceColor}
                onChange={(e) => setWorkspaceColor(e.target.value)}
                className="h-10 w-16 cursor-pointer rounded-lg border border-ink-900/10"
              />
              <input
                type="text"
                value={theme.workspaceColor}
                onChange={(e) => setWorkspaceColor(e.target.value)}
                className="flex-1 rounded-xl border border-ink-900/10 bg-surface-secondary px-4 py-2.5 text-sm text-ink-800 dark:bg-ink-900/30 dark:text-white placeholder:text-muted-light focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors font-mono"
                placeholder="#FFFFFF"
              />
            </div>
          </div>
        </div>

        <div className="mt-6">
          <button
            onClick={onClose}
            className="w-full rounded-full bg-accent px-5 py-3 text-sm font-medium text-white shadow-soft hover:bg-accent-hover transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
