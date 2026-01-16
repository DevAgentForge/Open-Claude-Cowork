import Database from 'better-sqlite3';
import { safeStorage } from 'electron';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface AppConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  defaultCwd?: string;
  configVersion?: number;
  migratedFromClaudeCode?: boolean;
}

type ConfigRow = {
  key: string;
  value: string;
  encrypted: number;
};

export class ConfigStore {
  private db: Database.Database;
  private encryptionAvailable: boolean;
  private static readonly CONFIG_VERSION = 1;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.encryptionAvailable = safeStorage.isEncryptionAvailable();

    if (!this.encryptionAvailable) {
      console.warn('⚠️ Encryption not available, API keys will be stored in plaintext');
    }

    this.initTable();
    this.migrateFromClaudeCodeIfNeeded();
  }

  private initTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT,
        encrypted INTEGER DEFAULT 0
      )
    `);
  }

  getConfig(): AppConfig {
    const rows = this.db.prepare('SELECT key, value, encrypted FROM config').all() as ConfigRow[];
    const config: AppConfig = {};

    for (const row of rows) {
      if (row.key === 'apiKey' && row.encrypted && this.encryptionAvailable) {
        try {
          const buffer = Buffer.from(row.value, 'base64');
          config.apiKey = safeStorage.decryptString(buffer);
        } catch (error) {
          console.error('Failed to decrypt API key:', error);
        }
      } else if (row.key === 'migratedFromClaudeCode' || row.key === 'configVersion') {
        (config as Record<string, unknown>)[row.key] = row.value === 'true' || Number(row.value);
      } else {
        (config as Record<string, string>)[row.key] = row.value;
      }
    }

    return config;
  }

  setConfig(config: Partial<AppConfig>): void {
    const stmt = this.db.prepare(
      'INSERT OR REPLACE INTO config (key, value, encrypted) VALUES (?, ?, ?)'
    );

    for (const [key, value] of Object.entries(config)) {
      if (value === undefined || value === null) continue;

      if (key === 'apiKey') {
        if (this.encryptionAvailable) {
          const encrypted = safeStorage.encryptString(value as string);
          stmt.run('apiKey', encrypted.toString('base64'), 1);
        } else {
          stmt.run('apiKey', value, 0);
        }
      } else {
        stmt.run(key, String(value), 0);
      }
    }
  }

  isConfigured(): boolean {
    const config = this.getConfig();
    return !!config.apiKey;
  }

  private migrateFromClaudeCodeIfNeeded(): void {
    const config = this.getConfig();

    if (config.migratedFromClaudeCode || config.apiKey) {
      return;
    }

    try {
      const settingsPath = join(homedir(), '.claude', 'settings.json');
      
      if (!existsSync(settingsPath)) {
        this.setConfig({
          migratedFromClaudeCode: true,
          configVersion: ConfigStore.CONFIG_VERSION,
        });
        return;
      }

      const raw = readFileSync(settingsPath, 'utf8');
      const parsed = JSON.parse(raw) as { env?: Record<string, unknown> };

      if (parsed.env) {
        const migratedConfig: Partial<AppConfig> = {
          migratedFromClaudeCode: true,
          configVersion: ConfigStore.CONFIG_VERSION,
        };

        if (parsed.env.ANTHROPIC_AUTH_TOKEN) {
          migratedConfig.apiKey = String(parsed.env.ANTHROPIC_AUTH_TOKEN);
        }

        if (parsed.env.ANTHROPIC_BASE_URL) {
          migratedConfig.baseUrl = String(parsed.env.ANTHROPIC_BASE_URL);
        }

        if (parsed.env.ANTHROPIC_MODEL) {
          migratedConfig.model = String(parsed.env.ANTHROPIC_MODEL);
        }

        this.setConfig(migratedConfig);
        console.log('✅ Successfully migrated config from ~/.claude/settings.json');
      } else {
        this.setConfig({
          migratedFromClaudeCode: true,
          configVersion: ConfigStore.CONFIG_VERSION,
        });
      }
    } catch (error) {
      console.log('No Claude Code config to migrate or migration failed:', error);
      this.setConfig({
        migratedFromClaudeCode: true,
        configVersion: ConfigStore.CONFIG_VERSION,
      });
    }
  }

  clearConfig(): void {
    this.db.exec('DELETE FROM config');
  }
}
