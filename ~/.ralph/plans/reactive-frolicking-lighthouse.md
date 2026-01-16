# Plan: Theme System + API Key Security + Provider Switching

## Prioridad de Implementación

**CRÍTICO (Fase 1)**: Seguridad de API Keys - ZERO margen de error
**MEDIO (Fase 2)**: Sistema de Temas Light/Dark
**BAJO (Fase 3)**: Mejoras UX Provider Switching

---

## FASE 1: SEGURIDAD DE API KEYS (Token Vault Architecture)

### Objetivo
Los tokens NUNCA deben salir del proceso main de Electron excepto hacia el subprocess de Claude.

### Vulnerabilidades Identificadas (Codex Audit)

| Severidad | Ubicación | Problema |
|-----------|-----------|----------|
| **ALTA** | `useAppStore.ts:33` | Token en React State (DevTools visible) |
| **ALTA** | `ipc-handlers.ts:234-272` | Token broadcast en JSON plaintext |
| **MEDIA** | `ProviderModal.tsx:14` | Token en useState durante edición |
| **MEDIA** | `provider-config.ts:39-52` | Decryption eager de todos los tokens |

### Arquitectura Token Vault

```
┌─────────────────────────────────────────────────────────────┐
│                    RENDERER PROCESS                          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  SafeProviderConfig (sin tokens)                     │    │
│  │  { id, name, baseUrl, model, isDefault, hasToken }  │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ IPC (solo SafeProviderConfig)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     MAIN PROCESS                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Token Vault (safeStorage encrypted)                 │    │
│  │  Decryption on-demand solo para subprocess          │    │
│  └─────────────────────────────────────────────────────┘    │
│                              │                               │
│                              │ ENV vars (solo subprocess)    │
│                              ▼                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Claude Subprocess                                   │    │
│  │  (recibe tokens via process.env)                    │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Cambios Requeridos

#### 1.1 Tipos seguros (`src/electron/types.ts`)

```typescript
// Tipo SEGURO para enviar al renderer (SIN tokens)
export interface SafeProviderConfig {
  id: string;
  name: string;
  baseUrl?: string;
  model?: string;
  isDefault?: boolean;
  hasToken: boolean; // indica si tiene token configurado
}
```

#### 1.2 Modificar `provider-config.ts`

- `toSafeProvider()`: Convierte LlmProviderConfig → SafeProviderConfig
- `loadProvidersSafe()`: Carga metadata sin decryptar tokens
- `getProviderEnvById()`: Decrypt on-demand solo para subprocess

#### 1.3 Modificar `ipc-handlers.ts`

- `provider.list` → usar `loadProvidersSafe()`
- `provider.saved` → retornar `toSafeProvider()`

#### 1.4 Modificar `useAppStore.ts`

- Cambiar `providers: LlmProviderConfig[]` → `providers: SafeProviderConfig[]`

#### 1.5 Modificar `ProviderModal.tsx`

- Token input separado, nunca mostrar token existente
- Mostrar "••••••••" si hasToken=true

#### 1.6 Modificar `runner.ts`

- Usar `providerId` en lugar de `provider` object
- Decrypt ocurre solo en main process

### Verificación de Seguridad

```bash
# Test 1: React DevTools
# Abrir DevTools → Components → Buscar "providers" → NO debe mostrar apiKey

# Test 2: IPC Monitor
# electron-devtools-installer → Network → Filtrar "server-event"
# provider.list payload NO debe contener apiKey

# Test 3: localStorage
# DevTools → Application → localStorage → NO debe contener tokens
```

---

## FASE 2: SISTEMA DE TEMAS

### Objetivo
Toggle rápido Light/Dark en Sidebar + Panel Settings con 2 selectores de color.

### Archivos Nuevos

- `src/ui/contexts/ThemeContext.tsx` - Context + Provider
- `src/ui/components/ThemeSettings.tsx` - Panel de configuración

### Archivos Modificados

- `src/ui/components/Sidebar.tsx` - Agregar toggle button
- `src/ui/App.css` - CSS variables dinámicas

### Persistencia

```typescript
localStorage.setItem('claude-cowork-theme', JSON.stringify({
  theme: 'dark',
  sidebarColor: '#1a1a1a',
  workspaceColor: '#0a0a0a'
}));
```

---

## FASE 3: PROVIDER SWITCHING UX

### Archivos Modificados

- `src/electron/libs/default-providers.ts` - Agregar GLM, OpenRouter, Anthropic
- `src/ui/components/ProviderModal.tsx` - Mostrar defaults como placeholders
- Provider list UI - Agrupar "Configured" vs "Available"

---

## Orden de Implementación

1. **Fase 1.1-1.2**: Tipos seguros + provider-config.ts
2. **Fase 1.3**: ipc-handlers.ts
3. **Fase 1.4**: useAppStore.ts
4. **Fase 1.5**: ProviderModal.tsx
5. **Fase 1.6**: runner.ts
6. **VERIFICACIÓN SEGURIDAD** (obligatoria antes de continuar)
7. **Fase 2**: Sistema de temas
8. **Fase 3**: Provider UX

## Archivos a Modificar

| Archivo | Fase | Cambios |
|---------|------|---------|
| `src/electron/types.ts` | 1 | +SafeProviderConfig |
| `src/electron/libs/provider-config.ts` | 1 | +toSafeProvider, +loadProvidersSafe |
| `src/electron/ipc-handlers.ts` | 1 | Usar SafeProviderConfig |
| `src/ui/store/useAppStore.ts` | 1 | providers: SafeProviderConfig[] |
| `src/ui/components/ProviderModal.tsx` | 1,3 | Token seguro + placeholders |
| `src/electron/libs/runner.ts` | 1 | Usar providerId |
| `src/electron/libs/default-providers.ts` | 3 | +GLM, +OpenRouter, +Anthropic |
| `src/ui/contexts/ThemeContext.tsx` | 2 | NUEVO |
| `src/ui/components/Sidebar.tsx` | 2 | +theme toggle |
| `src/ui/components/ThemeSettings.tsx` | 2 | NUEVO |
| `src/ui/App.css` | 2 | CSS variables |

## Verificación Final

1. **Seguridad**: DevTools + IPC audit manuales
2. **Temas**: Toggle funciona, colores persisten
3. **Providers**: Cambio inmediato, defaults visibles
4. **Build**: `npm run build` sin errores
5. **Lint**: `npm run lint` sin errores
