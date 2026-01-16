# Plan: Fix Provider Persistence, Theme Toggle, and Input Performance

## Resumen

Tres bugs requieren corrección en la aplicación Claude Cowork:

1. **Provider Configuration**: El modal abre vacío en lugar de pre-poblado con datos del provider seleccionado
2. **Theme Toggle Icon**: Muestra el icono del estado actual en vez del icono de la acción a realizar
3. **Prompt Input Performance**: Escritura lenta debido a cálculos de altura redundantes

## Clasificación

| Atributo | Valor |
|----------|-------|
| Complejidad | 5/10 (Moderada) |
| Archivos | 3 archivos UI |
| Riesgo | Bajo |

---

## Fase 1: Fix Provider Configuration Flow

### Problema Actual

```
Sidebar.tsx línea 105: onClick={onOpenProviderSettings}  ← No pasa provider
    ↓
App.tsx línea 175: setEditingProvider(null)  ← Siempre null
    ↓
ProviderModal recibe provider={null}  ← Formulario vacío
```

### Solución

**Archivo: `src/ui/components/Sidebar.tsx`**

1. Cambiar la firma del prop `onOpenProviderSettings`:
```tsx
// De:
onOpenProviderSettings: () => void;

// A:
onOpenProviderSettings: (provider: SafeProviderConfig | null) => void;
```

2. Pasar el provider seleccionado al hacer click:
```tsx
// De línea 105:
onClick={onOpenProviderSettings}

// A:
onClick={() => onOpenProviderSettings(selectedProvider || null)}
```

**Archivo: `src/ui/App.tsx`**

3. Actualizar `handleOpenProviderSettings` para recibir el provider:
```tsx
// De línea 174-177:
const handleOpenProviderSettings = useCallback(() => {
  setEditingProvider(null);
  setShowProviderModal(true);
}, [setShowProviderModal]);

// A:
const handleOpenProviderSettings = useCallback((provider: SafeProviderConfig | null) => {
  setEditingProvider(provider);
  setShowProviderModal(true);
}, [setShowProviderModal]);
```

---

## Fase 2: Fix Theme Toggle Icon

### Problema Actual (Sidebar.tsx líneas 136-146)

- Light mode → muestra Sol → texto "Light"
- Dark mode → muestra Luna → texto "Dark"

**Convención UX**: El botón debe mostrar la ACCIÓN, no el estado actual.

### Solución

Intercambiar los iconos y el texto:

```tsx
// De líneas 136-146:
{theme.mode === "light" ? (
  <svg>/* SOL */</svg>
) : (
  <svg>/* LUNA */</svg>
)}
{theme.mode === "light" ? "Light" : "Dark"}

// A:
{theme.mode === "light" ? (
  <svg>/* LUNA - para cambiar a dark */</svg>
) : (
  <svg>/* SOL - para cambiar a light */</svg>
)}
{theme.mode === "light" ? "Dark" : "Light"}
```

---

## Fase 3: Optimize Prompt Input Performance

### Problema Actual (PromptInput.tsx)

Dos lugares calculan altura duplicadamente:
- `handleInput` (líneas 91-102) - en cada keystroke
- `useEffect` (líneas 104-115) - cuando cambia `prompt`

### Solución

1. **Eliminar el useEffect redundante** (líneas 104-115)
   - El `handleInput` ya maneja la altura durante la escritura del usuario
   - Solo mantener useEffect para cambios programáticos externos

2. **Agregar debounce al cálculo de altura** (~16ms):
```tsx
const heightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
  const target = e.currentTarget;

  if (heightTimeoutRef.current) {
    clearTimeout(heightTimeoutRef.current);
  }
  heightTimeoutRef.current = setTimeout(() => {
    target.style.height = "auto";
    const scrollHeight = target.scrollHeight;
    if (scrollHeight > MAX_HEIGHT) {
      target.style.height = `${MAX_HEIGHT}px`;
      target.style.overflowY = "auto";
    } else {
      target.style.height = `${scrollHeight}px`;
      target.style.overflowY = "hidden";
    }
  }, 16); // ~1 frame a 60fps
};
```

---

## Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `src/ui/components/Sidebar.tsx` | Fix iconos theme (líneas 136-146), pasar provider al callback (línea 105), actualizar interface (línea 11) |
| `src/ui/App.tsx` | Actualizar firma de `handleOpenProviderSettings` (líneas 174-177) |
| `src/ui/components/PromptInput.tsx` | Debounce altura (líneas 91-102), eliminar useEffect redundante (líneas 104-115) |

---

## Verificación

### Testing Manual

1. **Provider Configuration**:
   - Seleccionar un provider del dropdown (ej: "MiniMax")
   - Click "Configure"
   - Verificar que modal muestra datos del provider pre-poblados
   - Guardar con token
   - Reiniciar app, verificar persistencia

2. **Theme Toggle**:
   - En modo Light: verificar icono Luna, texto "Dark"
   - Click toggle, cambiar a Dark
   - En modo Dark: verificar icono Sol, texto "Light"

3. **Input Performance**:
   - Escribir rápidamente en el prompt
   - Verificar que no hay lag ni stuttering

### Comandos

```bash
bun run lint
bun run build
bun run dev  # Testing manual
```

---

## Seguridad

- **NO modificar** el manejo de tokens con `safeStorage` (ya está correcto)
- Mantener `encryptSensitiveData()` y `validateProviderUrl()` intactos
- Los tokens nunca se envían al renderer (solo `hasToken: boolean`)
