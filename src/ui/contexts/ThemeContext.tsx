import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type ThemeMode = "light" | "dark";

export interface ThemeConfig {
  mode: ThemeMode;
  sidebarColor: string;
  workspaceColor: string;
}

const DEFAULT_LIGHT_THEME: ThemeConfig = {
  mode: "light",
  sidebarColor: "#FAF9F6",
  workspaceColor: "#FFFFFF"
};

const DEFAULT_DARK_THEME: ThemeConfig = {
  mode: "dark",
  sidebarColor: "#1a1a1a",
  workspaceColor: "#0a0a0a"
};

const STORAGE_KEY = "claude-cowork-theme";

interface ThemeContextValue {
  theme: ThemeConfig;
  setMode: (mode: ThemeMode) => void;
  setSidebarColor: (color: string) => void;
  setWorkspaceColor: (color: string) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function loadThemeFromStorage(): ThemeConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.mode && parsed.sidebarColor && parsed.workspaceColor) {
        return parsed;
      }
    }
  } catch {
    // Ignore storage errors
  }
  return DEFAULT_LIGHT_THEME;
}

function saveThemeToStorage(theme: ThemeConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
  } catch {
    // Ignore storage errors
  }
}

function applyThemeToDOM(theme: ThemeConfig): void {
  const root = document.documentElement;

  // Apply dark mode class
  if (theme.mode === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }

  // Apply custom colors as CSS variables
  root.style.setProperty("--theme-sidebar-color", theme.sidebarColor);
  root.style.setProperty("--theme-workspace-color", theme.workspaceColor);
}

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setTheme] = useState<ThemeConfig>(() => loadThemeFromStorage());

  // Apply theme to DOM when it changes
  useEffect(() => {
    applyThemeToDOM(theme);
    saveThemeToStorage(theme);
  }, [theme]);

  const setMode = (mode: ThemeMode) => {
    // When switching modes, apply default colors for the new mode
    const defaults = mode === "dark" ? DEFAULT_DARK_THEME : DEFAULT_LIGHT_THEME;
    setTheme({
      mode,
      sidebarColor: defaults.sidebarColor,
      workspaceColor: defaults.workspaceColor
    });
  };

  const setSidebarColor = (color: string) => {
    setTheme(prev => ({ ...prev, sidebarColor: color }));
  };

  const setWorkspaceColor = (color: string) => {
    setTheme(prev => ({ ...prev, workspaceColor: color }));
  };

  const toggleMode = () => {
    setMode(theme.mode === "light" ? "dark" : "light");
  };

  return (
    <ThemeContext.Provider value={{ theme, setMode, setSidebarColor, setWorkspaceColor, toggleMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
