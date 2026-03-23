/// <reference types="vite/client" />

import type { ServerEvent, ClientEvent } from "./types";

type MCPServerStatus = "running" | "stopped" | "error" | "starting";

interface ElectronAPI {
  // Claude Agent IPC
  onServerEvent: (callback: (event: ServerEvent) => void) => () => void;
  sendClientEvent: (event: ClientEvent) => void;
  generateSessionTitle: (userInput: string | null) => Promise<string>;
  getRecentCwds: (limit?: number) => Promise<string[]>;
  selectDirectory: () => Promise<string | null>;
  getApiConfig: () => Promise<any>;
  saveApiConfig: (config: any) => Promise<{ success: boolean; error?: string }>;
  checkApiConfig: () => Promise<{ hasConfig: boolean }>;

  // MCP APIs
  getMCPServers: () => Promise<any[]>;
  enableMCPServer: (serverId: string) => Promise<void>;
  disableMCPServer: (serverId: string) => Promise<void>;
  enableBrowserAutomation: () => Promise<void>;
  addMCPServer: (config: any) => Promise<void>;
  updateMCPServer: (serverId: string, config: any) => Promise<void>;
  deleteMCPServer: (serverId: string) => Promise<void>;
  onMCPStatusChange: (callback: (serverId: string, status: MCPServerStatus, errorMsg?: string) => void) => () => void;
  updateBrowserConfig: (options: {
    browserMode?: 'visible' | 'headless';
    userDataDir?: string | null;
    enablePersistence?: boolean;
    persistBrowser?: boolean;
  }) => Promise<void>;
  getDefaultUserDataDir: () => Promise<string>;

  // Agent APIs
  getAgents: () => Promise<any[]>;
  addAgent: (agent: { name: string; description: string; prompt: string; model?: string }) => Promise<void>;
  updateAgent: (agentId: string, updates: { name?: string; description?: string; prompt?: string; model?: string }) => Promise<void>;
  deleteAgent: (agentId: string) => Promise<void>;
  toggleAgent: (agentId: string, enabled: boolean) => Promise<void>;
  onAgentsConfigChange: (callback: () => void) => () => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}
