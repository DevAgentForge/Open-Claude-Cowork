import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export interface MCPServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface HookConfig {
  matcher: string;
  hooks: Array<{
    command: string;
    timeout?: number;
    type: "command";
  }>;
}

export interface PluginConfig {
  name: string;
  enabled: boolean;
  config?: Record<string, unknown>;
}

export interface ActiveSkill {
  name: string;
  type: "slash" | "skill";
  args?: string[];
}

export interface GlobalSettings {
  env?: Record<string, string>;
  language?: string;
  mcpServers?: Record<string, MCPServerConfig>;
  hooks?: Record<string, HookConfig[]>;
  enabledPlugins?: Record<string, boolean>;
  activeSkills?: ActiveSkill[];
  systemPrompt?: string;
  alwaysThinkingEnabled?: boolean;
}

export interface ParsedSettings {
  env: Record<string, string>;
  mcp: Map<string, MCPServerConfig>;
  hooks: Map<string, HookConfig[]>;
  plugins: Map<string, PluginConfig>;
  language: string;
  activeSkills: ActiveSkill[];
  systemPrompt: string;
  alwaysThinkingEnabled: boolean;
}

export class SettingsManager {
  private static instance: SettingsManager | null = null;
  private settings: ParsedSettings;
  private settingsPath: string;

  private constructor() {
    this.settingsPath = join(homedir(), ".claude", "settings.json");
    this.settings = this.loadSettings();
  }

  static getInstance(): SettingsManager {
    if (SettingsManager.instance === null) {
      SettingsManager.instance = new SettingsManager();
    }
    return SettingsManager.instance;
  }

  private loadSettings(): ParsedSettings {
    let rawSettings: GlobalSettings = {};

    if (existsSync(this.settingsPath)) {
      try {
        const content = readFileSync(this.settingsPath, "utf8");
        const parsed = JSON.parse(content);
        // Basic schema validation (CWE-20)
        rawSettings = this.validateSettings(parsed);
      } catch (error) {
        // Log errors with timestamp and error type
        const timestamp = new Date().toISOString();
        const errorType = error instanceof SyntaxError ? "SYNTAX_ERROR" : "IO_ERROR";
        console.error(`[${timestamp}] SETTINGS-MANAGER-${errorType}: Failed to parse settings file - ${error instanceof Error ? error.message : error}`);
      }
    }

    return {
      env: rawSettings.env || {},
      mcp: new Map(Object.entries(rawSettings.mcpServers || {})),
      hooks: this.parseHooks(rawSettings.hooks || {}),
      plugins: this.parsePlugins(rawSettings.enabledPlugins || {}),
      language: rawSettings.language || "English",
      activeSkills: rawSettings.activeSkills || [],
      systemPrompt: rawSettings.systemPrompt || "",
      alwaysThinkingEnabled: rawSettings.alwaysThinkingEnabled || false
    };
  }

  /**
   * Basic schema validation for settings (CWE-20)
   * Ensures expected types and rejects unexpected fields
   */
  private validateSettings(input: unknown): GlobalSettings {
    if (typeof input !== "object" || input === null) {
      throw new Error("Settings must be an object");
    }

    const obj = input as Record<string, unknown>;
    const validated: GlobalSettings = {};

    // Validate env (must be Record<string, string>)
    if (obj.env !== undefined) {
      if (typeof obj.env !== "object" || obj.env === null) {
        throw new Error("env must be an object");
      }
      validated.env = {};
      for (const [key, value] of Object.entries(obj.env as Record<string, unknown>)) {
        if (typeof value === "string") {
          validated.env[key] = value;
        }
      }
    }

    // Validate language (must be string)
    if (obj.language !== undefined) {
      if (typeof obj.language !== "string") {
        throw new Error("language must be a string");
      }
      validated.language = obj.language;
    }

    // Validate mcpServers (must be Record<string, MCPServerConfig>)
    if (obj.mcpServers !== undefined) {
      if (typeof obj.mcpServers !== "object" || obj.mcpServers === null) {
        throw new Error("mcpServers must be an object");
      }
      validated.mcpServers = {};
      for (const [name, config] of Object.entries(obj.mcpServers as Record<string, unknown>)) {
        if (this.isValidMCPConfig(config)) {
          validated.mcpServers[name] = config;
        }
      }
    }

    // Validate hooks (deep structure check - CWE-20)
    if (obj.hooks !== undefined) {
      if (typeof obj.hooks !== "object" || obj.hooks === null) {
        throw new Error("hooks must be an object");
      }
      validated.hooks = {};
      for (const [event, eventHooks] of Object.entries(obj.hooks as Record<string, unknown>)) {
        if (Array.isArray(eventHooks)) {
          const validHooks = eventHooks.filter(h => this.isValidHookConfig(h));
          if (validHooks.length > 0) {
            validated.hooks[event] = validHooks as HookConfig[];
          }
        }
      }
    }

    // Validate enabledPlugins (must be Record<string, boolean>)
    if (obj.enabledPlugins !== undefined) {
      if (typeof obj.enabledPlugins !== "object" || obj.enabledPlugins === null) {
        throw new Error("enabledPlugins must be an object");
      }
      validated.enabledPlugins = {};
      for (const [name, enabled] of Object.entries(obj.enabledPlugins as Record<string, unknown>)) {
        if (typeof enabled === "boolean") {
          validated.enabledPlugins[name] = enabled;
        }
      }
    }

    // Validate activeSkills (must be array)
    if (obj.activeSkills !== undefined) {
      if (!Array.isArray(obj.activeSkills)) {
        throw new Error("activeSkills must be an array");
      }
      validated.activeSkills = obj.activeSkills.filter(
        (s): s is ActiveSkill =>
          typeof s === "object" && s !== null &&
          typeof (s as ActiveSkill).name === "string" &&
          ((s as ActiveSkill).type === "slash" || (s as ActiveSkill).type === "skill")
      );
    }

    // Validate systemPrompt (must be string)
    if (obj.systemPrompt !== undefined) {
      if (typeof obj.systemPrompt !== "string") {
        throw new Error("systemPrompt must be a string");
      }
      validated.systemPrompt = obj.systemPrompt;
    }

    // Validate alwaysThinkingEnabled (must be boolean)
    if (obj.alwaysThinkingEnabled !== undefined) {
      if (typeof obj.alwaysThinkingEnabled !== "boolean") {
        throw new Error("alwaysThinkingEnabled must be a boolean");
      }
      validated.alwaysThinkingEnabled = obj.alwaysThinkingEnabled;
    }

    return validated;
  }

  private isValidMCPConfig(config: unknown): config is MCPServerConfig {
    if (typeof config !== "object" || config === null) return false;
    const c = config as Record<string, unknown>;
    if (typeof c.command !== "string") return false;
    if (c.args !== undefined && !Array.isArray(c.args)) return false;
    if (c.env !== undefined && (typeof c.env !== "object" || c.env === null)) return false;
    return true;
  }

  /**
   * Validate hook configuration structure (CWE-20)
   * @param hook - The hook object to validate
   * @returns true if valid HookConfig structure
   */
  private isValidHookConfig(hook: unknown): hook is HookConfig {
    if (typeof hook !== "object" || hook === null) return false;
    const h = hook as Record<string, unknown>;

    // matcher must be a string
    if (typeof h.matcher !== "string") return false;

    // hooks must be an array
    if (!Array.isArray(h.hooks)) return false;

    // Validate each hook item
    for (const item of h.hooks) {
      if (typeof item !== "object" || item === null) return false;
      const i = item as Record<string, unknown>;

      // command is required and must be string
      if (typeof i.command !== "string") return false;

      // type must be "command"
      if (i.type !== "command") return false;

      // timeout is optional but must be number if present
      if (i.timeout !== undefined && typeof i.timeout !== "number") return false;
    }

    return true;
  }

  private parseHooks(hooks: Record<string, HookConfig[]>): Map<string, HookConfig[]> {
    const parsed = new Map<string, HookConfig[]>();
    for (const [event, eventHooks] of Object.entries(hooks)) {
      parsed.set(event, eventHooks);
    }
    return parsed;
  }

  private parsePlugins(enabledPlugins: Record<string, boolean>): Map<string, PluginConfig> {
    const parsed = new Map<string, PluginConfig>();
    for (const [name, enabled] of Object.entries(enabledPlugins)) {
      parsed.set(name, { name, enabled });
    }
    return parsed;
  }

  getEnv(): Record<string, string> {
    return { ...this.settings.env };
  }

  getLanguage(): string {
    return this.settings.language;
  }

  setLanguage(lang: string): void {
    this.settings.language = lang;
  }

  getMCPServers(): Map<string, MCPServerConfig> {
    return new Map(this.settings.mcp);
  }

  getHooks(event: string): HookConfig[] {
    return this.settings.hooks.get(event) || [];
  }

  getAllHooks(): Map<string, HookConfig[]> {
    return new Map(this.settings.hooks);
  }

  getEnabledPlugins(): Map<string, PluginConfig> {
    return new Map(this.settings.plugins);
  }

  getActiveSkills(): ActiveSkill[] {
    return [...this.settings.activeSkills];
  }

  addActiveSkill(skill: ActiveSkill): boolean {
    if (this.settings.activeSkills.some(s => s.name === skill.name)) {
      return false;
    }
    this.settings.activeSkills.push(skill);
    return true;
  }

  removeActiveSkill(skillName: string): boolean {
    const index = this.settings.activeSkills.findIndex(s => s.name === skillName);
    if (index === -1) {
      return false;
    }
    this.settings.activeSkills.splice(index, 1);
    return true;
  }

  hasActiveSkill(skillName: string): boolean {
    return this.settings.activeSkills.some(s => s.name === skillName);
  }

  getSystemPrompt(): string {
    return this.settings.systemPrompt;
  }

  setSystemPrompt(prompt: string): void {
    this.settings.systemPrompt = prompt;
  }

  isAlwaysThinkingEnabled(): boolean {
    return this.settings.alwaysThinkingEnabled;
  }

  setAlwaysThinkingEnabled(enabled: boolean): void {
    this.settings.alwaysThinkingEnabled = enabled;
  }

  reload(): void {
    this.settings = this.loadSettings();
  }

  getSettingsPath(): string {
    return this.settingsPath;
  }

  getRawSettings(): ParsedSettings {
    // Deep copy to prevent external mutation (security: encapsulation)
    return {
      env: { ...this.settings.env },
      mcp: new Map(this.settings.mcp),
      hooks: new Map(this.settings.hooks),
      plugins: new Map(this.settings.plugins),
      language: this.settings.language,
      activeSkills: [...this.settings.activeSkills],
      systemPrompt: this.settings.systemPrompt,
      alwaysThinkingEnabled: this.settings.alwaysThinkingEnabled
    };
  }

  /**
   * Reset singleton instance. Only for testing purposes.
   * @internal Do not use in production code
   */
  static resetInstance(): void {
    if (process.env.NODE_ENV !== "test") {
      console.warn("[SettingsManager] resetInstance() called outside test environment - this may cause state inconsistencies");
    }
    SettingsManager.instance = null;
  }
}

export const settingsManager = SettingsManager.getInstance();
