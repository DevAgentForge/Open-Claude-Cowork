# 功能 4: 会话搜索功能

## 4.1 技术方案

### 4.1.1 文件结构
```
src/electron/libs/
└── session-store.ts          # 添加搜索方法

src/ui/components/
├── SessionSearch.tsx         # 搜索组件
└── SearchResults.tsx         # 搜索结果组件

__tests__/
├── session-store.test.ts     # 添加搜索测试
└── components/
    ├── SessionSearch.test.tsx
    └── SearchResults.test.tsx
```

### 4.1.2 核心实现

#### 搜索方法
```typescript
// src/electron/libs/session-store.ts

export class SessionStore {
  // ... 现有方法 ...
  
  /**
   * 搜索会话
   * @param query 搜索关键词
   * @param options 搜索选项
   * @returns 匹配的会话列表
   */
  searchSessions(
    query: string,
    options: {
      limit?: number;
      includeMessages?: boolean;
    } = {}
  ): StoredSession[] {
    if (!query.trim()) {
      return this.listSessions();
    }
    
    const searchTerm = `%${query}%`;
    const { limit = 50, includeMessages = false } = options;
    
    let sql = `
      SELECT DISTINCT
        s.id, s.title, s.claude_session_id, s.status, 
        s.cwd, s.allowed_tools, s.last_prompt, 
        s.created_at, s.updated_at
      FROM sessions s
    `;
    
    const params: (string | number)[] = [];
    
    if (includeMessages) {
      sql += `
        LEFT JOIN messages m ON s.id = m.session_id
        WHERE 
          s.title LIKE ? 
          OR s.last_prompt LIKE ? 
          OR s.cwd LIKE ?
          OR m.data LIKE ?
      `;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    } else {
      sql += `
        WHERE 
          s.title LIKE ? 
          OR s.last_prompt LIKE ? 
          OR s.cwd LIKE ?
      `;
      params.push(searchTerm, searchTerm, searchTerm);
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
      lastPrompt: row.last_prompt ? String(row.last_prompt) : undefined,
      claudeSessionId: row.claude_session_id ? String(row.claude_session_id) : undefined,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at)
    }));
  }
  
  /**
   * 在会话中搜索消息
   * @param sessionId 会话 ID
   * @param query 搜索关键词
   * @param options 搜索选项
   * @returns 匹配的消息列表
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
      includeContext = false,
      contextBefore = 2,
      contextAfter = 2
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
   * @param filters 搜索过滤条件
   * @returns 匹配的会话列表
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
}
```

### 4.1.3 数据库优化

```sql
-- 为搜索添加全文本搜索索引（可选）
-- SQLite FTS5 扩展

CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(
  title,
  last_prompt,
  cwd,
  content='sessions',
  content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS sessions_ai AFTER INSERT ON sessions BEGIN
  INSERT INTO sessions_fts(rowid, title, last_prompt, cwd)
  VALUES (new.rowid, new.title, new.last_prompt, new.cwd);
END;

CREATE TRIGGER IF NOT EXISTS sessions_ad AFTER DELETE ON sessions BEGIN
  INSERT INTO sessions_fts(sessions_fts, rowid, title, last_prompt, cwd)
  VALUES ('delete', old.rowid, old.title, old.last_prompt, old.cwd);
END;

CREATE TRIGGER IF NOT EXISTS sessions_au AFTER UPDATE ON sessions BEGIN
  INSERT INTO sessions_fts(sessions_fts, rowid, title, last_prompt, cwd)
  VALUES ('delete', old.rowid, old.title, old.last_prompt, old.cwd);
  INSERT INTO sessions_fts(rowid, title, last_prompt, cwd)
  VALUES (new.rowid, new.title, new.last_prompt, new.cwd);
END;
```

### 4.1.4 IPC 接口

```typescript
// src/electron/ipc-handlers.ts

// 搜索会话
ipcMainHandle("search-sessions", (_: any, query: string, options?: any) => {
  return sessions.searchSessions(query, options);
});

// 搜索消息
ipcMainHandle("search-messages", (_: any, sessionId: string, query: string, options?: any) => {
  return sessions.searchMessages(sessionId, query, options);
});

// 高级搜索
ipcMainHandle("advanced-search", (_: any, filters: any) => {
  return sessions.advancedSearch(filters);
});
```

### 4.1.5 UI 组件设计

#### SessionSearch 组件
```typescript
// src/ui/components/SessionSearch.tsx

interface SessionSearchProps {
  onSessionSelect: (sessionId: string) => void;
}

export function SessionSearch({ onSessionSelect }: SessionSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StoredSession[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // 高级搜索过滤器
  const [filters, setFilters] = useState({
    status: undefined as SessionStatus | undefined,
    cwd: '',
    startDate: undefined as number | undefined,
    endDate: undefined as number | undefined
  });
  
  // 防抖搜索
  const debouncedSearch = useMemo(
    () => debounce(async (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setResults([]);
        return;
      }
      
      setIsSearching(true);
      try {
        const data = await window.electron.searchSessions(searchQuery, {
          limit: 20
        });
        setResults(data);
      } catch (error) {
        console.error('Search failed:', error);
      } finally {
        setIsSearching(false);
      }
    }, 300),
    []
  );
  
  useEffect(() => {
    debouncedSearch(query);
  }, [query, debouncedSearch]);
  
  const handleAdvancedSearch = async () => {
    setIsSearching(true);
    try {
      const data = await window.electron.advancedSearch({
        query: query || undefined,
        status: filters.status,
        cwd: filters.cwd || undefined,
        startDate: filters.startDate,
        endDate: filters.endDate,
        limit: 50
      });
      setResults(data);
    } catch (error) {
      console.error('Advanced search failed:', error);
    } finally {
      setIsSearching(false);
    }
  };
  
  return (
    <div className="session-search">
      <div className="search-input-wrapper">
        <input
          type="text"
          placeholder="搜索会话..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="search-input"
        />
        <button 
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="advanced-toggle"
        >
          {showAdvanced ? '▲' : '▼'}
        </button>
      </div>
      
      {showAdvanced && (
        <div className="advanced-filters">
          <select
            value={filters.status || ''}
            onChange={(e) => setFilters({ 
              ...filters, 
              status: e.target.value as SessionStatus || undefined 
            })}
          >
            <option value="">所有状态</option>
            <option value="idle">空闲</option>
            <option value="running">运行中</option>
            <option value="completed">已完成</option>
            <option value="error">错误</option>
          </select>
          
          <input
            type="text"
            placeholder="工作目录..."
            value={filters.cwd}
            onChange={(e) => setFilters({ ...filters, cwd: e.target.value })}
          />
          
          <input
            type="date"
            onChange={(e) => setFilters({ 
              ...filters, 
              startDate: e.target.value ? new Date(e.target.value).getTime() : undefined 
            })}
          />
          
          <input
            type="date"
            onChange={(e) => setFilters({ 
              ...filters, 
              endDate: e.target.value ? new Date(e.target.value).getTime() + 86400000 : undefined 
            })}
          />
          
          <button onClick={handleAdvancedSearch}>搜索</button>
        </div>
      )}
      
      {isSearching && (
        <div className="search-loading">
          <span>搜索中...</span>
        </div>
      )}
      
      {results.length > 0 && (
        <SearchResults 
          results={results} 
          query={query}
          onSessionSelect={onSessionSelect} 
        />
      )}
    </div>
  );
}
```

#### SearchResults 组件
```typescript
// src/ui/components/SearchResults.tsx

interface SearchResultsProps {
  results: StoredSession[];
  query: string;
  onSessionSelect: (sessionId: string) => void;
}

export function SearchResults({ results, query, onSessionSelect }: SearchResultsProps) {
  const highlightMatch = (text: string, query: string) => {
    if (!query) return text;
    
    const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  };
  
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`;
    
    return date.toLocaleDateString();
  };
  
  return (
    <div className="search-results">
      <div className="results-count">
        找到 {results.length} 个结果
      </div>
      
      {results.map(session => (
        <div 
          key={session.id}
          className="search-result-item"
          onClick={() => onSessionSelect(session.id)}
        >
          <div className="result-header">
            <h3 
              dangerouslySetInnerHTML={{ 
                __html: highlightMatch(session.title, query) 
              }}
            />
            <span className={`status-badge status-${session.status}`}>
              {session.status}
            </span>
          </div>
          
          {session.lastPrompt && (
            <div 
              className="result-prompt"
              dangerouslySetInnerHTML={{ 
                __html: highlightMatch(
                  session.lastPrompt.substring(0, 150) + 
                  (session.lastPrompt.length > 150 ? '...' : ''),
                  query
                ) 
              }}
            />
          )}
          
          <div className="result-meta">
            {session.cwd && (
              <span className="result-cwd">
                📁 {session.cwd}
              </span>
            )}
            <span className="result-date">
              🕐 {formatDate(session.updatedAt)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

### 4.1.6 集成到 Sidebar

```typescript
// src/ui/components/Sidebar.tsx

export function Sidebar({ connected, onNewSession, onDeleteSession }: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StoredSession[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  
  const handleSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    
    const results = await window.electron.searchSessions(query);
    setSearchResults(results);
  };
  
  const displaySessions = searchQuery ? searchResults : sessions;
  
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>会话</h2>
        <button onClick={onNewSession}>+ 新建</button>
      </div>
      
      <div className="sidebar-search">
        <input
          type="text"
          placeholder="搜索会话..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            handleSearch(e.target.value);
          }}
          onFocus={() => setShowSearch(true)}
          onBlur={() => setTimeout(() => setShowSearch(false), 200)}
        />
      </div>
      
      <div className="session-list">
        {displaySessions.map(session => (
          <SessionItem
            key={session.id}
            session={session}
            isActive={session.id === activeSessionId}
            onClick={() => setActiveSessionId(session.id)}
            onDelete={() => onDeleteSession(session.id)}
          />
        ))}
      </div>
    </div>
  );
}
```

---

## 4.2 测试计划

### 4.2.1 单元测试

#### 测试组 1: 会话搜索
```typescript
describe('SessionStore - Search Sessions', () => {
  let store: SessionStore;
  
  beforeEach(() => {
    store = new SessionStore(':memory:');
    
    // 创建测试会话
    store.createSession({
      title: '整理下载文件夹',
      cwd: '~/Downloads',
      prompt: '请整理下载文件夹'
    });
    
    store.createSession({
      title: '代码审查',
      cwd: '~/Projects/my-app',
      prompt: '审查代码并提供建议'
    });
    
    store.createSession({
      title: '数据分析',
      cwd: '~/Documents/Data',
      prompt: '分析数据并生成报告'
    });
  });
  
  afterEach(() => {
    store.close();
  });
  
  describe('searchSessions', () => {
    test('should find sessions by title', () => {
      const results = store.searchSessions('整理');
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('整理下载文件夹');
    });
    
    test('should find sessions by prompt', () => {
      const results = store.searchSessions('审查');
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('代码审查');
    });
    
    test('should find sessions by cwd', () => {
      const results = store.searchSessions('Downloads');
      expect(results).toHaveLength(1);
      expect(results[0].cwd).toBe('~/Downloads');
    });
    
    test('should be case insensitive', () => {
      const results = store.searchSessions('DOWNLOADS');
      expect(results).toHaveLength(1);
    });
    
    test('should support partial matching', () => {
      const results = store.searchSessions('数据');
      expect(results).toHaveLength(1);
    });
    
    test('should return empty array for no matches', () => {
      const results = store.searchSessions('xyz');
      expect(results).toHaveLength(0);
    });
    
    test('should return all sessions for empty query', () => {
      const results = store.searchSessions('');
      expect(results).toHaveLength(3);
    });
    
    test('should respect limit parameter', () => {
      store.createSession({
        title: '测试会话 1',
        cwd: '~/test',
        prompt: '测试'
      });
      store.createSession({
        title: '测试会话 2',
        cwd: '~/test',
        prompt: '测试'
      });
      
      const results = store.searchSessions('测试', { limit: 1 });
      expect(results.length).toBeLessThanOrEqual(1);
    });
    
    test('should include messages when specified', () => {
      const session = store.createSession({
        title: '测试',
        cwd: '~/test',
        prompt: '初始消息'
      });
      
      store.recordMessage(session.id, {
        type: 'text',
        text: '这是一条包含搜索关键词的消息'
      });
      
      const results = store.searchSessions('搜索关键词', { includeMessages: true });
      expect(results).toHaveLength(1);
    });
    
    test('should return results in reverse chronological order', () => {
      const results = store.searchSessions('');
      expect(results[0].updatedAt).toBeGreaterThanOrEqual(results[1].updatedAt);
    });
  });
});
```

#### 测试组 2: 消息搜索
```typescript
describe('SessionStore - Search Messages', () => {
  let store: SessionStore;
  let sessionId: string;
  
  beforeEach(() => {
    store = new SessionStore(':memory:');
    
    const session = store.createSession({
      title: '测试会话',
      cwd: '~/test',
      prompt: '初始消息'
    });
    
    sessionId = session.id;
    
    // 添加测试消息
    store.recordMessage(sessionId, {
      type: 'text',
      text: '这是第一条消息'
    });
    
    store.recordMessage(sessionId, {
      type: 'text',
      text: '这是第二条消息，包含关键词'
    });
    
    store.recordMessage(sessionId, {
      type: 'text',
      text: '这是第三条消息'
    });
  });
  
  afterEach(() => {
    store.close();
  });
  
  describe('searchMessages', () => {
    test('should find messages by content', () => {
      const results = store.searchMessages(sessionId, '关键词');
      expect(results).toHaveLength(1);
      expect(results[0].text).toContain('关键词');
    });
    
    test('should return empty array for no matches', () => {
      const results = store.searchMessages(sessionId, 'xyz');
      expect(results).toHaveLength(0);
    });
    
    test('should return empty array for empty query', () => {
      const results = store.searchMessages(sessionId, '');
      expect(results).toHaveLength(0);
    });
    
    test('should respect limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        store.recordMessage(sessionId, {
          type: 'text',
          text: `消息 ${i} 关键词`
        });
      }
      
      const results = store.searchMessages(sessionId, '关键词', { limit: 5 });
      expect(results).toHaveLength(5);
    });
    
    test('should include context when specified', () => {
      const results = store.searchMessages(sessionId, '关键词', {
        includeContext: true,
        contextBefore: 1,
        contextAfter: 1
      });
      
      expect(results.length).toBeGreaterThan(1);
    });
    
    test('should return messages in chronological order', () => {
      const results = store.searchMessages(sessionId, '消息');
      expect(results[0].timestamp).toBeLessThanOrEqual(results[1].timestamp);
    });
  });
});
```

#### 测试组 3: 高级搜索
```typescript
describe('SessionStore - Advanced Search', () => {
  let store: SessionStore;
  
  beforeEach(() => {
    store = new SessionStore(':memory:');
    
    store.createSession({
      title: '会话 1',
      cwd: '~/Downloads',
      prompt: '测试',
      allowedTools: 'file'
    });
    
    const session2 = store.createSession({
      title: '会话 2',
      cwd: '~/Projects',
      prompt: '测试',
      allowedTools: 'file'
    });
    
    store.updateSession(session2.id, { status: 'completed' });
    
    const session3 = store.createSession({
      title: '会话 3',
      cwd: '~/Documents',
      prompt: '测试',
      allowedTools: 'file'
    });
    
    store.updateSession(session3.id, { status: 'error' });
  });
  
  afterEach(() => {
    store.close();
  });
  
  describe('advancedSearch', () => {
    test('should filter by status', () => {
      const results = store.advancedSearch({ status: 'completed' });
      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('completed');
    });
    
    test('should filter by cwd', () => {
      const results = store.advancedSearch({ cwd: 'Downloads' });
      expect(results).toHaveLength(1);
      expect(results[0].cwd).toBe('~/Downloads');
    });
    
    test('should filter by date range', () => {
      const now = Date.now();
      const results = store.advancedSearch({
        startDate: now - 86400000,
        endDate: now + 86400000
      });
      expect(results.length).toBeGreaterThan(0);
    });
    
    test('should combine multiple filters', () => {
      const results = store.advancedSearch({
        query: '会话',
        status: 'completed'
      });
      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('completed');
    });
    
    test('should return all sessions when no filters provided', () => {
      const results = store.advancedSearch({});
      expect(results).toHaveLength(3);
    });
  });
});
```

### 4.2.2 组件测试

#### SessionSearch 测试
```typescript
describe('SessionSearch', () => {
  const mockOnSessionSelect = jest.fn();
  
  beforeEach(() => {
    (window.electron.searchSessions as jest.Mock).mockResolvedValue([]);
  });
  
  test('should render search input', () => {
    render(<SessionSearch onSessionSelect={mockOnSessionSelect} />);
    
    expect(screen.getByPlaceholderText('搜索会话...')).toBeInTheDocument();
  });
  
  test('should debounce search input', async () => {
    render(<SessionSearch onSessionSelect={mockOnSessionSelect} />);
    
    const input = screen.getByPlaceholderText('搜索会话...');
    fireEvent.change(input, { target: { value: 'test' } });
    fireEvent.change(input, { target: { value: 'testing' } });
    fireEvent.change(input, { target: { value: 'testing query' } });
    
    await waitFor(() => {
      expect(window.electron.searchSessions).toHaveBeenCalledTimes(1);
      expect(window.electron.searchSessions).toHaveBeenCalledWith('testing query', expect.any(Object));
    });
  });
  
  test('should show advanced filters when toggle clicked', () => {
    render(<SessionSearch onSessionSelect={mockOnSessionSelect} />);
    
    const toggle = screen.getByText('▼');
    fireEvent.click(toggle);
    
    expect(screen.getByText('所有状态')).toBeInTheDocument();
  });
  
  test('should call advanced search with filters', async () => {
    (window.electron.advancedSearch as jest.Mock).mockResolvedValue([]);
    
    render(<SessionSearch onSessionSelect={mockOnSessionSelect} />);
    
    // 打开高级搜索
    fireEvent.click(screen.getByText('▼'));
    
    // 设置过滤器
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'completed' } });
    
    // 点击搜索按钮
    fireEvent.click(screen.getByText('搜索'));
    
    await waitFor(() => {
      expect(window.electron.advancedSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed'
        })
      );
    });
  });
});
```

#### SearchResults 测试
```typescript
describe('SearchResults', () => {
  const mockResults: StoredSession[] = [
    {
      id: '1',
      title: '测试会话',
      status: 'completed',
      cwd: '~/Downloads',
      lastPrompt: '这是一个测试提示',
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
  ];
  
  test('should render search results', () => {
    render(
      <SearchResults 
        results={mockResults} 
        query="测试"
        onSessionSelect={jest.fn()} 
      />
    );
    
    expect(screen.getByText('测试会话')).toBeInTheDocument();
    expect(screen.getByText('找到 1 个结果')).toBeInTheDocument();
  });
  
  test('should highlight matching text', () => {
    render(
      <SearchResults 
        results={mockResults} 
        query="测试"
        onSessionSelect={jest.fn()} 
      />
    );
    
    const highlighted = screen.getByText('测试', { selector: 'mark' });
    expect(highlighted).toBeInTheDocument();
  });
  
  test('should call onSessionSelect when result clicked', () => {
    const onSelect = jest.fn();
    render(
      <SearchResults 
        results={mockResults} 
        query="测试"
        onSessionSelect={onSelect} 
      />
    );
    
    fireEvent.click(screen.getByText('测试会话'));
    expect(onSelect).toHaveBeenCalledWith('1');
  });
});
```

### 4.2.3 性能测试

```typescript
describe('Search Performance', () => {
  let store: SessionStore;
  
  beforeEach(() => {
    store = new SessionStore(':memory:');
    
    // 创建 100 个会话
    for (let i = 0; i < 100; i++) {
      store.createSession({
        title: `会话 ${i}`,
        cwd: `~/test/${i}`,
        prompt: `测试提示 ${i}`
      });
    }
  });
  
  afterEach(() => {
    store.close();
  });
  
  test('should search 100 sessions in < 50ms', () => {
    const start = performance.now();
    const results = store.searchSessions('会话');
    const duration = performance.now() - start;
    
    expect(results.length).toBeGreaterThan(0);
    expect(duration).toBeLessThan(50);
  });
  
  test('should search with message content in < 100ms', () => {
    const session = store.getSession(store.listSessions()[0].id)!;
    
    for (let i = 0; i < 50; i++) {
      store.recordMessage(session.id, {
        type: 'text',
        text: `消息 ${i} 包含测试内容`
      });
    }
    
    const start = performance.now();
    const results = store.searchSessions('测试', { includeMessages: true });
    const duration = performance.now() - start;
    
    expect(results.length).toBeGreaterThan(0);
    expect(duration).toBeLessThan(100);
  });
  
  test('should handle concurrent searches', async () => {
    const promises = [];
    
    for (let i = 0; i < 10; i++) {
      promises.push(
        new Promise(resolve => {
          setTimeout(() => {
            store.searchSessions(`会话 ${i}`);
            resolve(undefined);
          }, Math.random() * 10);
        })
      );
    }
    
    const start = performance.now();
    await Promise.all(promises);
    const duration = performance.now() - start;
    
    expect(duration).toBeLessThan(100);
  });
});
```

### 4.2.4 数据完整性测试

```typescript
describe('Search Data Integrity', () => {
  test('should handle special characters in search query', () => {
    const store = new SessionStore(':memory:');
    
    store.createSession({
      title: '测试"引号"和\'撇号\'',
      cwd: '~/test',
      prompt: '测试'
    });
    
    const results = store.searchSessions('"引号"');
    expect(results).toHaveLength(1);
    
    store.close();
  });
  
  test('should handle very long search queries', () => {
    const store = new SessionStore(':memory:');
    
    store.createSession({
      title: '测试会话',
      cwd: '~/test',
      prompt: '测试'
    });
    
    const longQuery = 'a'.repeat(1000);
    const results = store.searchSessions(longQuery);
    expect(results).toHaveLength(0);
    
    store.close();
  });
  
  test('should handle unicode characters', () => {
    const store = new SessionStore(':memory:');
    
    store.createSession({
      title: '测试中文🎉和emoji',
      cwd: '~/test',
      prompt: '测试'
    });
    
    const results = store.searchSessions('🎉');
    expect(results).toHaveLength(1);
    
    store.close();
  });
});
```

---

## 4.3 验收标准

### 功能验收
- [ ] 支持按标题搜索会话
- [ ] 支持按 prompt 搜索会话
- [ ] 支持按工作目录搜索会话
- [ ] 支持按消息内容搜索
- [ ] 支持模糊匹配
- [ ] 支持高级搜索（状态、日期范围等）
- [ ] 搜索结果高亮显示
- [ ] 实时搜索（防抖）
- [ ] 搜索结果按时间排序

### 性能验收
- [ ] 搜索 100 个会话 < 50ms
- [ ] 搜索包含消息内容 < 100ms
- [ ] 防抖延迟 300ms
- [ ] 并发搜索无错误

### 用户体验验收
- [ ] 搜索框响应迅速
- [ ] 搜索结果准确
- [ ] 高亮显示正确
- [ ] 高级搜索界面友好
- [ ] 空结果提示清晰

### 测试覆盖率
- [ ] 单元测试覆盖率 ≥ 85%
- [ ] 组件测试覆盖率 ≥ 80%
- [ ] 所有测试用例通过

---

## 4.4 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 搜索性能差 | 中 | 中 | 数据库索引优化，FTS |
| 搜索结果不准确 | 低 | 中 | 优化匹配算法 |
| 特殊字符处理错误 | 低 | 低 | 转义特殊字符 |
| 大量数据导致卡顿 | 低 | 中 | 分页加载，虚拟滚动 |

---

## 4.5 实施计划

### Phase 1: 核心实现（1.5小时）
- [ ] 在 `session-store.ts` 中添加搜索方法
  - [ ] 实现 `searchSessions()` 方法
  - [ ] 实现 `searchMessages()` 方法
  - [ ] 实现 `advancedSearch()` 方法
  - [ ] 添加数据库索引优化
- [ ] 在 IPC handlers 中添加搜索接口

### Phase 2: UI 实现（1.5小时）
- [ ] 创建 `SearchResults.tsx` 组件
- [ ] 创建 `SessionSearch.tsx` 组件
- [ ] 在 `Sidebar` 中集成搜索框
- [ ] 添加样式

### Phase 3: 测试和优化（1小时）
- [ ] 编写单元测试
- [ ] 编写组件测试
- [ ] 性能测试和优化
- [ ] 数据完整性测试

### Phase 4: 文档和验收（0.5小时）
- [ ] 更新代码注释
- [ ] 编写使用文档
- [ ] 验收测试
- [ ] 代码审查

**总计**: 4-4.5 小时

---

## 附录：实施优先级总结

### 总体时间估算
- **功能 1: Prompt 注入检测**: 2.5-3.5 小时
- **功能 2: 会话模板系统**: 4-4.5 小时
- **功能 3: 审计日志系统**: 4-5 小时
- **功能 4: 会话搜索功能**: 4-4.5 小时

**总计**: 14.5-17.5 小时（约 2 个工作日）

### 建议实施顺序
1. **第一天上午**: 功能 1（Prompt 注入检测）- 安全关键
2. **第一天下午**: 功能 4（会话搜索）- 用户体验提升
3. **第二天上午**: 功能 2（会话模板）- 用户体验提升
4. **第二天下午**: 功能 3（审计日志）- 安全审计能力

### 关键里程碑
- [ ] Day 1 上午: Prompt 注入检测完成并测试
- [ ] Day 1 下午: 会话搜索功能完成并测试
- [ ] Day 2 上午: 会话模板系统完成并测试
- [ ] Day 2 下午: 审计日志系统完成并测试
- [ ] 最终验收: 所有功能集成测试通过