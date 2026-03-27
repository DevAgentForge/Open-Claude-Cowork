import Database from "better-sqlite3";
import type { SessionStatus, StreamMessage } from "../types.js";

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
  prompt?: string; // 添加 prompt 字段作为 lastPrompt 的别名
  claudeSessionId?: string;
  createdAt: number;
  updatedAt: number;
};

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

  createSession(options: { cwd?: string; allowedTools?: string; prompt?: string; title: string }): Session {
    const id = crypto.randomUUID();
    const now = Date.now();
    const session: Session = {
      id,
      title: options.title,
      status: "idle",
      cwd: options.cwd,
      allowedTools: options.allowedTools,
      lastPrompt: options.prompt,
      pendingPermissions: new Map()
    };
    this.sessions.set(id, session);
    this.db
      .prepare(
        `insert into sessions
          (id, title, claude_session_id, status, cwd, allowed_tools, last_prompt, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        session.title,
        session.claudeSessionId ?? null,
        session.status,
        session.cwd ?? null,
        session.allowedTools ?? null,
        session.lastPrompt ?? null,
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
        `select id, title, claude_session_id, status, cwd, allowed_tools, last_prompt, created_at, updated_at
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
        `select id, title, claude_session_id, status, cwd, allowed_tools, last_prompt, created_at, updated_at
         from sessions
         where id = ?`
      )
      .get(id) as Record<string, unknown> | undefined;
    if (!sessionRow) return null;

    const messages = (this.db
      .prepare(
        `select data from messages where session_id = ? order by created_at asc`
      )
      .all(id) as Array<Record<string, unknown>>)
      .map((row) => JSON.parse(String(row.data)) as StreamMessage);

    return {
      session: {
        id: String(sessionRow.id),
        title: String(sessionRow.title),
        status: sessionRow.status as SessionStatus,
        cwd: sessionRow.cwd ? String(sessionRow.cwd) : undefined,
        allowedTools: sessionRow.allowed_tools ? String(sessionRow.allowed_tools) : undefined,
        lastPrompt: sessionRow.last_prompt ? String(sessionRow.last_prompt) : undefined,
        claudeSessionId: sessionRow.claude_session_id ? String(sessionRow.claude_session_id) : undefined,
        createdAt: Number(sessionRow.created_at),
        updatedAt: Number(sessionRow.updated_at)
      },
      messages
    };
  }

  updateSession(id: string, updates: Partial<Session>): Session | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;
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
    const fields: string[] = [];
    const values: Array<string | number | null> = [];
    const updatable = {
      claudeSessionId: "claude_session_id",
      status: "status",
      cwd: "cwd",
      allowedTools: "allowed_tools",
      lastPrompt: "last_prompt"
    } as const;

    for (const key of Object.keys(updates) as Array<keyof typeof updatable>) {
      const column = updatable[key];
      if (!column) continue;
      fields.push(`${column} = ?`);
      const value = updates[key];
      values.push(value === undefined ? null : (value as string));
    }

    if (fields.length === 0) return;
    fields.push("updated_at = ?");
    values.push(Date.now());
    values.push(id);
    this.db
      .prepare(`update sessions set ${fields.join(", ")} where id = ?`)
      .run(...values);
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
  }

  private loadSessions(): void {
    const rows = this.db
      .prepare(
        `select id, title, claude_session_id, status, cwd, allowed_tools, last_prompt
         from sessions`
      )
      .all();
    for (const row of rows as Array<Record<string, unknown>>) {
      const session: Session = {
        id: String(row.id),
        title: String(row.title),
        claudeSessionId: row.claude_session_id ? String(row.claude_session_id) : undefined,
        status: row.status as SessionStatus,
        cwd: row.cwd ? String(row.cwd) : undefined,
        allowedTools: row.allowed_tools ? String(row.allowed_tools) : undefined,
        lastPrompt: row.last_prompt ? String(row.last_prompt) : undefined,
        pendingPermissions: new Map()
      };
      this.sessions.set(session.id, session);
    }
  }

  /**
   * 搜索会话
   */
  searchSessions(
    query: string,
    options: {
      limit?: number;
      includeMessages?: boolean;
      status?: SessionStatus;
      startDate?: number;
      endDate?: number;
      offset?: number;
      cwd?: string;
    } = {}
  ): StoredSession[] {
    const { limit = 50, includeMessages = false, status, startDate, endDate, offset = 0, cwd } = options;

    let sql = `
      SELECT DISTINCT
        s.id, s.title, s.claude_session_id, s.status,
        s.cwd, s.allowed_tools, s.last_prompt,
        s.created_at, s.updated_at
      FROM sessions s
    `;

    const params: (string | number)[] = [];

    if (includeMessages) {
      sql += ` LEFT JOIN messages m ON s.id = m.session_id`;
    }

    const conditions: string[] = [];

    // 添加搜索条件
    if (query.trim()) {
      const searchTerm = `%${query}%`;
      if (includeMessages) {
        conditions.push(`(s.title LIKE ? OR s.last_prompt LIKE ? OR s.cwd LIKE ? OR m.data LIKE ?)`);
        params.push(searchTerm, searchTerm, searchTerm, searchTerm);
      } else {
        conditions.push(`(s.title LIKE ? OR s.last_prompt LIKE ? OR s.cwd LIKE ?)`);
        params.push(searchTerm, searchTerm, searchTerm);
      }
    }

    // 添加状态筛选
    if (status) {
      conditions.push(`s.status = ?`);
      params.push(status);
    }

    // 添加日期范围筛选
    if (startDate) {
      conditions.push(`s.created_at >= ?`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`s.created_at <= ?`);
      params.push(endDate);
    }

    // 添加工作目录筛选
    if (cwd) {
      conditions.push(`s.cwd = ?`);
      params.push(cwd);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += ` ORDER BY s.updated_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id),
      title: String(row.title),
      status: row.status as SessionStatus,
      cwd: row.cwd ? String(row.cwd) : undefined,
      allowedTools: row.allowed_tools ? String(row.allowed_tools) : undefined,
      lastPrompt: row.last_prompt ? String(row.last_prompt) : undefined,
      prompt: row.last_prompt ? String(row.last_prompt) : undefined, // 添加 prompt 字段作为别名
      claudeSessionId: row.claude_session_id ? String(row.claude_session_id) : undefined,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at)
    }));
  }

  /**
   * 在会话中搜索消息
   */
  searchMessages(
    sessionId: string,
    query: string,
    options: {
      limit?: number;
      includeContext?: boolean;
      contextBefore?: number;
      contextAfter?: number;
    } = {}
  ): StreamMessage[] {
    if (!query.trim()) {
      return [];
    }

    const {
      limit = 100,
      includeContext = false
    } = options;

    const searchTerm = `%${query}%`;

    // 查找匹配的消息 ID
    const matchedRows = this.db.prepare(`
      SELECT id, created_at
      FROM messages
      WHERE session_id = ? AND data LIKE ?
      ORDER BY created_at ASC
      LIMIT ?
    `).all(sessionId, searchTerm, limit * 10) as Array<{ id: string; created_at: number }>;

    if (matchedRows.length === 0) {
      return [];
    }

    const matchedIds = matchedRows.map(r => r.id);
    const matchedTimestamps = matchedRows.map(r => r.created_at);

    let sql = `
      SELECT data, created_at
      FROM messages
      WHERE session_id = ? AND (
    `;

    const params: (string | number)[] = [sessionId];

    if (includeContext) {
      // 包含上下文：查找匹配消息前后的消息
      const conditions: string[] = [];

      for (const timestamp of matchedTimestamps) {
        const start = timestamp - 86400000; // 1天前
        const end = timestamp + 86400000;   // 1天后

        conditions.push(`(created_at >= ? AND created_at <= ?)`);
        params.push(start, end);
      }

      sql += conditions.join(' OR ');
    } else {
      // 只返回匹配的消息
      const placeholders = matchedIds.map(() => '?').join(',');
      sql += `id IN (${placeholders})`;
      params.push(...matchedIds);
    }

    sql += `) ORDER BY created_at ASC LIMIT ?`;
    params.push(limit);

    const rows = this.db.prepare(sql).all(...params) as Array<{
      data: string;
      created_at: number;
    }>;

    return rows.map(row => JSON.parse(row.data) as StreamMessage);
  }

  /**
   * 高级搜索
   */
  advancedSearch(filters: {
    query?: string;
    status?: SessionStatus;
    cwd?: string;
    startDate?: number;
    endDate?: number;
    limit?: number;
  }): StoredSession[] {
    const {
      query,
      status,
      cwd,
      startDate,
      endDate,
      limit = 50
    } = filters;

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (query) {
      conditions.push('(s.title LIKE ? OR s.last_prompt LIKE ?)');
      params.push(`%${query}%`, `%${query}%`);
    }

    if (status) {
      conditions.push('s.status = ?');
      params.push(status);
    }

    if (cwd) {
      conditions.push('s.cwd LIKE ?');
      params.push(`%${cwd}%`);
    }

    if (startDate) {
      conditions.push('s.updated_at >= ?');
      params.push(startDate);
    }

    if (endDate) {
      conditions.push('s.updated_at <= ?');
      params.push(endDate);
    }

    let sql = `
      SELECT
        s.id, s.title, s.claude_session_id, s.status,
        s.cwd, s.allowed_tools, s.last_prompt,
        s.created_at, s.updated_at
      FROM sessions s
    `;

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += ` ORDER BY s.updated_at DESC LIMIT ?`;
    params.push(limit);

    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id),
      title: String(row.title),
      status: row.status as SessionStatus,
      cwd: row.cwd ? String(row.cwd) : undefined,
      allowedTools: row.allowed_tools ? String(row.allowed_tools) : undefined,
      lastPrompt: row.lastPrompt ? String(row.lastPrompt) : undefined,
      claudeSessionId: row.claude_session_id ? String(row.claude_session_id) : undefined,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updatedAt)
    }));
  }

  close(): void {
    this.db.close();
  }
}
