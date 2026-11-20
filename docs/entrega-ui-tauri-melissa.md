# Entrega UI/Tauri — Melissa (AG-01 apoio, 2026-11-20)

Escopo atendido (apenas dentro de `OpenDesign/`, sem commit/push/publicação):

## 1) Janela principal (layout 1200×800)
- `tauri.conf.json` (raiz) e `src-tauri/tauri.conf.json`:
  - janela `main`: **1200×800**, `minWidth 800` × `minHeight 600`, `resizable: true`, `center: true`, inicia `visible: false` (revelada após o splash, quando a UI sinaliza “pronta”).
- Comportamento de arranque em `src-tauri/src/lib.rs`: fecha `splashscreen` e exibe/foca `main` ao receber o sinal `app_ready` do frontend, respeitando **tempo mínimo de ~1500 ms** de exibição (evita flash) e com **fallback de segurança de ~8 s** (nunca trava no splash se o sinal não chegar).

## 2) Tela de splash (sinal “app pronto”)
- Asset: `public/splashscreen.html` (copiado para `dist/` no `vite build`; servido em dev pelo Vite).
  - Visual alinhado ao `icon.svg` aprovado (paleta #1e1b4b/#6366f1/#818cf8/#a78bfa/#f59e0b), marca + wordmark “OpenDesign” + loader; `prefers-reduced-motion` respeitado.
- Janela `splashscreen` nos dois `tauri.conf.json`: 420×320, sem decorações, transparente, centralizada, `alwaysOnTop`, `shadow: false`, `skipTaskbar: true`, `url: splashscreen.html`.
- `src-tauri/capabilities/default.json`: janela `splashscreen` adicionada à lista `windows` (além de `main`).
- **Rust (`src-tauri/src/lib.rs`)**: estado `SplashState` (início/fechamento único), comando Tauri `app_ready` e timer de fallback (~8 s); fechamento único com mínimo de ~1500 ms.
- **Frontend (`src/client/`)**: helper `src/client/lib/tauri.ts` (`isTauri`/`invokeTauri`/`signalAppReady`, via `__TAURI_INTERNALS__`, no-op fora do Tauri) e emissão em `src/client/app.tsx` quando a UI inicial fica utilizável (após mount/carregamento inicial ou tela de erro de fontes), **não** no import do módulo. Sem dependência nova de `@tauri-apps/api`.

## 3) Ícones (bundle) e coordenação com Renato
- `bundle.icon` (config): `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns`, `icon.ico` — **todos já presentes** em `src-tauri/icons/` (junto a variantes Store/Square e `icon.png`).
  - `src-tauri/tauri.conf.json`: paths relativos `icons/...` (corretos a partir de `src-tauri/`).
  - `tauri.conf.json` (raiz): paths ajustados para `src-tauri/icons/...` (consistência quando executado da raiz).
- **Licença/procedência: VALIDADA (2026-11-20).** Conforme `LICENCAS.md` (Renato/AG-03): `icon.svg` é arte original do projeto (MIT, sem assets de terceiros/IA) e todos os derivados em `src-tauri/icons/` (e favicons gerados) são derivados do mesmo `icon.svg` sob MIT. **Não é necessário trocar nem regenerar ícones.** (Hugo não é responsável nem canal; decisões finais somente com o Tyago.)
- **Alinhamento visual:** `public/splashscreen.html` usa a marca/mesma geometria e paleta do `icon.svg` aprovado — splash e assets visuais alinhados a essa versão.

## Verificação sugerida (Renata/time/Luan)
1. `npm run build` (gera `dist/` incluindo `splashscreen.html`).
2. `npx tauri dev` — conferir: splash aparece centralizado; fecha quando a UI sinaliza “pronta” (mín. ~1500 ms, máx. ~8 s de fallback) e a janela principal abre 1200×800 centralizada (“OpenDesign”).
3. `npx tauri build` — validar ícone do executável/instalador (Windows: `.ico`).
4. Se necessário, ajustar tempos mínimos/fallback em `src-tauri/src/lib.rs` (`Duration::from_millis(1500/8000)`) em conjunto com Renata/Luan.

## Fora do escopo / não feito
- Nenhum commit/push/publicação.
- Nenhuma alteração fora de `OpenDesign/`.
- Ícones não regenerados/substituídos (conjunto aprovado/validado em `LICENCAS.md` mantido como está).
