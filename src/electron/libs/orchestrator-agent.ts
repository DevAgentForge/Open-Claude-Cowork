import { settingsManager, type ActiveSkill, type HookConfig } from "./settings-manager.js";
import { unifiedCommandParser, type ParsedInput } from "./unified-commands.js";
import { unifiedTaskRunner, type TaskConfig, type ThinkModeConfig } from "./unified-task-runner.js";

export type OrchestratorEvent =
  | { type: "skill.activated"; payload: { skill: ActiveSkill } }
  | { type: "skill.deactivated"; payload: { skillName: string } }
  | { type: "hook.triggered"; payload: { event: string; hook: HookConfig } }
  | { type: "command.parsed"; payload: { input: ParsedInput } }
  | { type: "task.configured"; payload: { config: TaskConfig } }
  | { type: "error"; payload: { message: string; code: string } };

export type OrchestratorCallback = (event: OrchestratorEvent) => void;

/**
 * OrchestratorAgent coordinates skills, hooks, commands, and task execution.
 * It serves as the central coordination point for the unified architecture.
 */
export class OrchestratorAgent {
  private callbacks: Set<OrchestratorCallback> = new Set();
  private initialized = false;

  /**
   * Initialize the orchestrator with settings from ~/.claude/settings.json
   */
  initialize(): void {
    if (this.initialized) return;

    // Load active skills into command parser
    const activeSkills = settingsManager.getActiveSkills();
    for (const skill of activeSkills) {
      unifiedCommandParser.registerSkill(skill);
    }

    this.initialized = true;
  }

  /**
   * Subscribe to orchestrator events
   */
  subscribe(callback: OrchestratorCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  private emit(event: OrchestratorEvent): void {
    for (const callback of this.callbacks) {
      try {
        callback(event);
      } catch (error) {
        console.error("[OrchestratorAgent] Callback error:", error);
      }
    }
  }

  /**
   * Process user input and determine the action to take
   */
  processInput(input: string): ParsedInput {
    try {
      const parsed = unifiedCommandParser.parse(input);
      this.emit({ type: "command.parsed", payload: { input: parsed } });
      return parsed;
    } catch (error) {
      this.emit({
        type: "error",
        payload: {
          message: `Failed to parse input: ${error instanceof Error ? error.message : String(error)}`,
          code: "PARSE_ERROR"
        }
      });
      // Return empty parsed result on error
      return { command: "", args: [], raw: input, isUnified: false };
    }
  }

  /**
   * Activate a skill by name
   */
  activateSkill(skill: ActiveSkill): boolean {
    const added = settingsManager.addActiveSkill(skill);
    if (added) {
      unifiedCommandParser.registerSkill(skill);
      this.emit({ type: "skill.activated", payload: { skill } });
    }
    return added;
  }

  /**
   * Deactivate a skill by name
   */
  deactivateSkill(skillName: string): boolean {
    const removed = settingsManager.removeActiveSkill(skillName);
    if (removed) {
      unifiedCommandParser.unregisterSkill(skillName);
      this.emit({ type: "skill.deactivated", payload: { skillName } });
    }
    return removed;
  }

  /**
   * Check if a skill is currently active
   */
  isSkillActive(skillName: string): boolean {
    return settingsManager.hasActiveSkill(skillName);
  }

  /**
   * Get all active skills
   */
  getActiveSkills(): ActiveSkill[] {
    return settingsManager.getActiveSkills();
  }

  /**
   * Configure and prepare a task for execution
   */
  configureTask(config: TaskConfig): void {
    unifiedTaskRunner.configureTask(config);
    this.emit({ type: "task.configured", payload: { config } });
  }

  /**
   * Prepare a prompt with all active context (skills, system prompt, etc.)
   */
  preparePrompt(userRequest: string): string {
    return unifiedTaskRunner.preparePrompt(userRequest);
  }

  /**
   * Get the final system prompt with all layers applied
   */
  getSystemPrompt(): string {
    return unifiedTaskRunner.buildFinalSystemPrompt();
  }

  /**
   * Check if thinking mode is enabled
   */
  isThinkingEnabled(): boolean {
    return unifiedTaskRunner.isThinkingEnabled();
  }

  /**
   * Get current think mode configuration
   */
  getThinkMode(): ThinkModeConfig {
    return unifiedTaskRunner.getThinkMode();
  }

  /**
   * Get hooks for a specific event
   */
  getHooksForEvent(event: string): HookConfig[] {
    return settingsManager.getHooks(event);
  }

  /**
   * Trigger hooks for an event
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async triggerHooks(event: string, _context: Record<string, unknown>): Promise<void> {
    const hooks = this.getHooksForEvent(event);
    for (const hookConfig of hooks) {
      this.emit({ type: "hook.triggered", payload: { event, hook: hookConfig } });
      // Hook execution would happen here - currently just emits the event
      // Actual execution requires shell execution which should be handled by the caller
    }
  }

  /**
   * Clear the current task context
   */
  clearTaskContext(): void {
    unifiedTaskRunner.clearContext();
  }

  /**
   * Check if orchestrator has been initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Reload settings from disk
   */
  reload(): void {
    settingsManager.reload();
    unifiedCommandParser.clearCustomSkills();

    // Re-register active skills
    const activeSkills = settingsManager.getActiveSkills();
    for (const skill of activeSkills) {
      unifiedCommandParser.registerSkill(skill);
    }
  }

  /**
   * Get environment variables from settings
   */
  getEnv(): Record<string, string> {
    return settingsManager.getEnv();
  }

  /**
   * Get configured language
   */
  getLanguage(): string {
    return settingsManager.getLanguage();
  }

  /**
   * Check if a command is a built-in native command
   */
  isNativeCommand(commandName: string): boolean {
    return unifiedCommandParser.isBuiltInCommand(commandName);
  }

  /**
   * Get all available commands (built-in + skills)
   */
  getAllCommands(): Array<{ name: string; type: string; description: string }> {
    return unifiedCommandParser.getAllCommands();
  }
}

export const orchestratorAgent = new OrchestratorAgent();
