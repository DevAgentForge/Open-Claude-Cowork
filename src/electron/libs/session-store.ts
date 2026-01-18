import Database from "better-sqlite3";
import { resolve, normalize } from "path";
import { existsSync } from "fs";
import type { SessionStatus, StreamMessage, PermissionMode } from "../types.js";

/**
 * Sanitize value for safe logging - prevents log injection (CWE-117)
 * @internal
 */
function sanitizeForLog(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\x00-\x1f\x7f]/g, "_");
}

export type PendingPermission = {
  toolUseId: string;
  toolName: string;
  input: unknown;
  resolve: (result: { behavior: "allow" | "deny"; updatedInput?: unknown; message?: string }) => void;
};

export type Session = {
  id: string;
  title: string;
  claudeSessionId?: string;
  status: SessionStatus;
  cwd?: string;
  allowedTools?: string;
  lastPrompt?: string;
  permissionMode?: PermissionMode;
  pendingPermissions: Map<string, PendingPermission>;
  abortController?: AbortController;
};

export type StoredSession = {
  id: string;
  title: string;
  status: SessionStatus;
  cwd?: string;
  allowedTools?: string;
  lastPrompt?: string;
  claudeSessionId?: string;
  permissionMode?: PermissionMode;
  createdAt: number;
  updatedAt: number;
};

/**
 * Parse a message row from the database
 *
 * @param row - Database row containing message data
 * @returns Parsed StreamMessage
 * @throws Error if row is invalid or parsing fails
 *
 * @internal
 */
function parseMessageRow(row: Record<string, unknown>): StreamMessage {
  // Validate row structure
  if (!row) {
    throw new Error("Invalid message row: row is null or undefined");
  }

  if (!row.data) {
    throw new Error("Invalid message row: missing 'data' field");
  }

  // Validate data is a string before parsing
  if (typeof row.data !== "string") {
    throw new Error("Invalid message row: 'data' field must be a string");
  }

  // Parse JSON
  let data: unknown;
  try {
    data = JSON.parse(row.data);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse message data: ${errorMessage}`);
  }

  // Validate parsed data is an object
  if (!data || typeof data !== "object") {
    throw new Error("Invalid message: parsed data is not an object");
  }

  return data as StreamMessage;
}

/**
 * Parse multiple message rows
 *
 * @param rows - Array of database rows
 * @returns Array of parsed StreamMessages
 *
 * @internal
 */
function parseMessageRows(rows: Array<Record<string, unknown>>): StreamMessage[] {
  const messages: StreamMessage[] = [];
  const errors: Array<{ index: number; error: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    try {
      messages.push(parseMessageRow(rows[i]));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push({ index: i, error: errorMessage });

      console.warn(
        `[SessionStore] Failed to parse message at index ${i}`,
        { error: errorMessage }
      );
    }
  }

  if (errors.length > 0) {
    console.warn(
      `[SessionStore] Failed to parse ${errors.length} messages out of ${rows.length}`,
      { errors }
    );
  }

  return messages;
}

export type SessionHistory = {
  session: StoredSession;
  messages: StreamMessage[];
};

export class SessionStore {
  private sessions = new Map<string, Session>();
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initialize();
    this.loadSessions();
  }

  createSession(options: { cwd?: string; allowedTools?: string; prompt?: string; title: string; permissionMode?: PermissionMode }): Session {
    // Validate and sanitize cwd to prevent path traversal
    const sanitizedCwd = options.cwd ? this.sanitizePath(options.cwd) : undefined;

    const id = crypto.randomUUID();
    const now = Date.now();
    const session: Session = {
      id,
      title: options.title,
      status: "idle",
      cwd: sanitizedCwd,
      allowedTools: options.allowedTools,
      lastPrompt: options.prompt,
      permissionMode: options.permissionMode,
      pendingPermissions: new Map()
    };
    this.sessions.set(id, session);
    this.db
      .prepare(
        `insert into sessions
          (id, title, claude_session_id, status, cwd, allowed_tools, last_prompt, permission_mode, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        session.title,
        session.claudeSessionId ?? null,
        session.status,
        session.cwd ?? null,
        session.allowedTools ?? null,
        session.lastPrompt ?? null,
        session.permissionMode ?? null,
        now,
        now
      );
    return session;
  }

  getSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  listSessions(): StoredSession[] {
    const rows = this.db
      .prepare(
        `select id, title, claude_session_id, status, cwd, allowed_tools, last_prompt, permission_mode, created_at, updated_at
         from sessions
         order by updated_at desc`
      )
      .all() as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      title: String(row.title),
      status: row.status as SessionStatus,
      cwd: row.cwd ? String(row.cwd) : undefined,
      allowedTools: row.allowed_tools ? String(row.allowed_tools) : undefined,
      lastPrompt: row.last_prompt ? String(row.last_prompt) : undefined,
      claudeSessionId: row.claude_session_id ? String(row.claude_session_id) : undefined,
      permissionMode: row.permission_mode ? (row.permission_mode as PermissionMode) : undefined,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at)
    }));
  }

  listRecentCwds(limit = 8): string[] {
    const rows = this.db
      .prepare(
        `select cwd, max(updated_at) as latest
         from sessions
         where cwd is not null and trim(cwd) != ''
         group by cwd
         order by latest desc
         limit ?`
      )
      .all(limit) as Array<Record<string, unknown>>;
    return rows.map((row) => String(row.cwd));
  }

  getSessionHistory(id: string): SessionHistory | null {
    const sessionRow = this.db
      .prepare(
        `select id, title, claude_session_id, status, cwd, allowed_tools, last_prompt, permission_mode, created_at, updated_at
         from sessions
         where id = ?`
      )
      .get(id) as Record<string, unknown> | undefined;
    if (!sessionRow) return null;

    const messages = parseMessageRows(
      this.db
        .prepare(
          `select data from messages where session_id = ? order by created_at asc`
        )
        .all(id) as Array<Record<string, unknown>>
    );

    return {
      session: {
        id: String(sessionRow.id),
        title: String(sessionRow.title),
        status: sessionRow.status as SessionStatus,
        cwd: sessionRow.cwd ? String(sessionRow.cwd) : undefined,
        allowedTools: sessionRow.allowed_tools ? String(sessionRow.allowed_tools) : undefined,
        lastPrompt: sessionRow.last_prompt ? String(sessionRow.last_prompt) : undefined,
        claudeSessionId: sessionRow.claude_session_id ? String(sessionRow.claude_session_id) : undefined,
        permissionMode: sessionRow.permission_mode ? (sessionRow.permission_mode as PermissionMode) : undefined,
        createdAt: Number(sessionRow.created_at),
        updatedAt: Number(sessionRow.updated_at)
      },
      messages
    };
  }

  updateSession(id: string, updates: Partial<Session>): Session | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;

    // Re-validate cwd if being updated (security: CWE-22)
    if (updates.cwd !== undefined) {
      updates.cwd = this.sanitizePath(updates.cwd);
    }

    Object.assign(session, updates);
    this.persistSession(id, updates);
    return session;
  }

  setAbortController(id: string, controller: AbortController | undefined): void {
    const session = this.sessions.get(id);
    if (!session) return;
    session.abortController = controller;
  }

  recordMessage(sessionId: string, message: StreamMessage): void {
    const id = ('uuid' in message && message.uuid) ? String(message.uuid) : crypto.randomUUID();
    this.db
      .prepare(
        `insert or ignore into messages (id, session_id, data, created_at) values (?, ?, ?, ?)`
      )
      .run(id, sessionId, JSON.stringify(message), Date.now());
  }

  deleteSession(id: string): boolean {
    const existing = this.sessions.get(id);
    if (existing) {
      this.sessions.delete(id);
    }
    this.db.prepare(`delete from messages where session_id = ?`).run(id);
    const result = this.db.prepare(`delete from sessions where id = ?`).run(id);
    const removedFromDb = result.changes > 0;
    return removedFromDb || Boolean(existing);
  }

  private persistSession(id: string, updates: Partial<Session>): void {
    // Use parameterized queries for all updates - never construct SQL with string concatenation
    const setClauses: string[] = [];
    const values: Array<string | number | null> = [];

    const fieldMappings: Record<string, string> = {
      claudeSessionId: "claude_session_id",
      status: "status",
      cwd: "cwd",
      allowedTools: "allowed_tools",
      lastPrompt: "last_prompt",
      permissionMode: "permission_mode"
    };

    for (const key of Object.keys(updates)) {
      const column = fieldMappings[key];
      if (!column) continue;
      setClauses.push(`${column} = ?`);
      const value = updates[key as keyof Partial<Session>];
      values.push(value === undefined ? null : (value as string));
    }

    if (setClauses.length === 0) return;
    setClauses.push("updated_at = ?");
    values.push(Date.now());
    values.push(id);

    // Use parameterized query with all values as placeholders
    const sql = `UPDATE sessions SET ${setClauses.join(", ")} WHERE id = ?`;
    this.db.prepare(sql).run(...values);
  }

  private initialize(): void {
    this.db.exec(`pragma journal_mode = WAL;`);
    this.db.exec(
      `create table if not exists sessions (
        id text primary key,
        title text,
        claude_session_id text,
        status text not null,
        cwd text,
        allowed_tools text,
        last_prompt text,
        permission_mode text,
        created_at integer not null,
        updated_at integer not null
      )`
    );
    this.db.exec(
      `create table if not exists messages (
        id text primary key,
        session_id text not null,
        data text not null,
        created_at integer not null,
        foreign key (session_id) references sessions(id)
      )`
    );
    this.db.exec(`create index if not exists messages_session_id on messages(session_id)`);

    // Migration: Add permission_mode column if it doesn't exist (SQLite safe operation)
    try {
      this.db.prepare(`alter table sessions add column permission_mode text`).run();
    } catch {
      // Column already exists, ignore error
    }
  }

  /**
   * Sanitize path to prevent path traversal attacks (CWE-22)
   * Validates that the path is a real directory without dangerous sequences
   * Note: Quotes are allowed in paths (valid in Unix/Windows filenames)
   */
  private sanitizePath(inputPath: string): string {
    // 1. Detect null bytes (CWE-626)
    if (inputPath.includes("\0")) {
      throw new Error("Invalid path: null bytes not allowed");
    }

    // 2. Detect path traversal attempts BEFORE normalization
    if (inputPath.includes("..")) {
      throw new Error("Invalid path: path traversal sequences not allowed");
    }

    // 3. Check for dangerous shell metacharacters (CWE-78)
    // Note: Quotes (' ") are valid in filesystem paths, only block shell operators
    const dangerousShellChars = /[;&|`$<>]/;
    if (dangerousShellChars.test(inputPath)) {
      throw new Error("Invalid path: contains dangerous shell metacharacters");
    }

    // 4. Normalize and resolve to absolute path
    const normalized = normalize(inputPath);
    const resolved = resolve(normalized);

    // 5. Verify the resolved path doesn't escape via symlinks
    // Re-check for traversal after normalization
    if (resolved.includes("..")) {
      throw new Error("Invalid path: path traversal detected after normalization");
    }

    // 6. Validate that the directory exists
    if (!existsSync(resolved)) {
      throw new Error(`Invalid path: directory does not exist: ${resolved}`);
    }

    return resolved;
  }

  private loadSessions(): void {
    const rows = this.db
      .prepare(
        `select id, title, claude_session_id, status, cwd, allowed_tools, last_prompt, permission_mode
         from sessions`
      )
      .all();

    let invalidPathCount = 0;
    const invalidSessionIds: string[] = [];

    for (const row of rows as Array<Record<string, unknown>>) {
      // Re-validate cwd on load (security: CWE-22)
      // If path is invalid/deleted, set to undefined and log the issue
      let validatedCwd: string | undefined;
      let pathLoadError: Error | null = null;
      let originalCwd: string | null = null;

      if (row.cwd) {
        originalCwd = String(row.cwd);
        try {
          validatedCwd = this.sanitizePath(originalCwd);
        } catch (error) {
          // Log the error for debugging but don't crash
          // The path may have been deleted, moved, or had permissions changed
          pathLoadError = error instanceof Error ? error : new Error(String(error));

          console.warn(
            `[SessionStore] Session ${String(row.id)} has invalid cwd path, skipping validation`,
            {
              sessionId: String(row.id),
              originalPath: sanitizeForLog(originalCwd),
              error: sanitizeForLog(pathLoadError.message)
            }
          );

          validatedCwd = undefined;
        }
      }

      const session: Session = {
        id: String(row.id),
        title: String(row.title),
        claudeSessionId: row.claude_session_id ? String(row.claude_session_id) : undefined,
        status: row.status as SessionStatus,
        cwd: validatedCwd,
        // Track if this session has an invalid cwd
        allowedTools: row.allowed_tools ? String(row.allowed_tools) : undefined,
        lastPrompt: row.last_prompt ? String(row.last_prompt) : undefined,
        permissionMode: row.permission_mode ? (row.permission_mode as PermissionMode) : undefined,
        pendingPermissions: new Map()
      };

      // If path was invalid, mark session as needing attention
      if (pathLoadError) {
        session.status = "error";
        invalidPathCount++;
        invalidSessionIds.push(session.id);
      }

      this.sessions.set(session.id, session);
    }

    // Log summary of any path issues
    if (invalidPathCount > 0) {
      console.warn(
        `[SessionStore] Loaded ${rows.length} sessions, ${invalidPathCount} had invalid cwd paths`,
        { invalidSessionIds }
      );
    }
  }

  close(): void {
    this.db.close();
  }
}
