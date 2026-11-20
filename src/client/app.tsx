import { EditorContext } from "./context";
import { useCanvasState } from "./hooks/use-canvas";
import { useDesigns } from "./hooks/use-designs";
import { useBrandKits } from "./hooks/use-brand-kits";
import { useRouter } from "./hooks/use-router";
import { Editor } from "./components/editor";
import { Home } from "./components/home";
import { useFonts } from "./fonts";
import { AppNav, reportLocation } from "@clawnify/app/client";
import { useEffect, useRef } from "preact/hooks";
import { isTauri, signalAppReady } from "./lib/tauri";

export function App() {
  const { path, navigate, designId } = useRouter();
  const saveSchedulerRef = useRef<() => void>(() => {});
  const canvasState = useCanvasState(() => saveSchedulerRef.current());
  const designState = useDesigns(canvasState.getCanvasJSONForPage, canvasState.getCanvasSize);
  saveSchedulerRef.current = designState.scheduleSave;
  const brandState = useBrandKits();
  const fontState = useFonts();
  const readySignaledRef = useRef(false);

  // Tauri: sinaliza "app pronto" quando a UI inicial está utilizável (fecha o splash
  // respeitando tempo mínimo; fallback de timeout fica no Rust). No-op fora do Tauri.
  useEffect(() => {
    if (readySignaledRef.current) return;
    if (fontState.fontsError || (!designState.loading && !fontState.fontsLoading)) {
      readySignaledRef.current = true;
      void signalAppReady();
    }
  }, [designState.loading, fontState.fontsLoading, fontState.fontsError]);

  // In the Clawnify dashboard the open screen lives in the host URL, so a
  // reload comes back to the same design.
  useEffect(() => {
    // The Clawnify host bridge is meaningless in the desktop webview: it would
    // only post a message to itself. Keep the report in the browser/embedded app.
    if (!isTauri()) reportLocation(path);
  }, [path]);

  // Load design from URL on initial load and when designId changes
  useEffect(() => {
    if (designId && !designState.loading && designState.loadedDesignId !== designId) {
      designState.loadDesign(designId);
    }
  }, [designId, designState.loading, designState.loadedDesignId]);

  // Adopt a design's own frame when it is opened. Keyed on the design id, not
  // the object: saving replaces activeDesign, and re-running then would snap
  // the canvas back to the stored size mid-edit, undoing a resize.
  const framedDesignIdRef = useRef<string | null>(null);
  useEffect(() => {
    const design = designState.activeDesign;
    if (!design || framedDesignIdRef.current === design.id) return;
    framedDesignIdRef.current = design.id;
    if (design.width && design.height) {
      canvasState.setCanvasSize(design.width, design.height, { reflow: false });
    }
  }, [designState.activeDesign]);

  // Auto-activate first page when pages load and canvases are registered
  useEffect(() => {
    if (designState.pages.length > 0 && !canvasState.activeCanvasId) {
      canvasState.setActiveCanvas(designState.pages[0].id);
    }
  }, [designState.pages, canvasState.activeCanvasId]);

  // Inside Clawnify the dashboard draws this navigation. Anywhere else the app
  // keeps its own layout (standalone draws nothing) and AppNav only adds the
  // SDK's notice for a self-hosted copy.
  // No desktop Tauri o cartão/integração Clawnify é suprimido (evita 404 de presence.js).
  const hostNav = isTauri() ? null : (
    <AppNav
      title="Projeto"
      icon="image"
      active={designId ?? "home"}
      groups={[
        { items: [{ id: "home", label: "Projetos", icon: "layout-grid", href: "/", home: true }] },
        {
          label: "Projetos recentes",
          items: designState.designs.map((d) => ({ id: d.id, label: d.name, icon: "image", href: `/design/${d.id}` })),
        },
      ]}
      onNavigate={(item) => item.href && navigate(item.href)}
      standalone={() => null}
    />
  );

  // Falha de persistência (ex.: createDesign no desktop) precisa ficar visível:
  // console.error sozinho não aparece no build Tauri sem devtools.
  const persistenceError = designState.error ? (
    <div
      role="alert"
      class="fixed top-3 left-1/2 -translate-x-1/2 z-50 max-w-[min(90vw,32rem)] px-4 py-2.5 rounded-lg bg-red-600 text-white text-xs shadow-lg flex items-start gap-3"
    >
      <span class="flex-1 leading-relaxed">{designState.error}</span>
      <button
        type="button"
        aria-label="Fechar aviso"
        class="bg-transparent border-none text-white cursor-pointer text-base leading-none p-0"
        onClick={designState.clearError}
      >
        ×
      </button>
    </div>
  ) : null;

  if (fontState.fontsError) {
    return <div class="flex flex-col items-center justify-center gap-3 h-full" role="alert">
      {persistenceError}
      <p>{fontState.fontsError}</p>
      <button class="px-3 py-2 border rounded cursor-pointer" onClick={() => window.location.reload()}>Recarregar</button>
    </div>;
  }

  // Fabric measures text during construction. Load fonts before mounting any canvas.
  if (designState.loading || fontState.fontsLoading) {
    return (
      <>
      {hostNav}
      <div class="flex items-center justify-center h-full bg-[#F3F4F7]">
        <div class="text-center">
          <div class="spinner !w-6 !h-6 !border-accent/30 !border-t-accent mb-3 mx-auto" />
          <p class="text-zinc-400 text-sm">Carregando…</p>
        </div>
      </div>
      </>
    );
  }

  // Home / gallery view
  if (!designId) {
    return (
      <>
      {hostNav}
      {persistenceError}
      <Home
        designs={designState.designs}
        templates={designState.templates}
        navigate={navigate}
        createDesign={designState.createDesign}
        deleteDesign={designState.deleteDesign}
        renameDesign={designState.renameDesign}
        createFromTemplate={designState.createFromTemplate}
      />
      </>
    );
  }

  // Editor view
  const contextValue = {
    ...canvasState,
    ...designState,
    ...brandState,
    ...fontState,
    // activeCanvasId is the source of truth for which page is active
    activePageId: canvasState.activeCanvasId ?? designState.activePageId,
    navigate,
  };

  return (
    <EditorContext.Provider value={contextValue}>
      {hostNav}
      {persistenceError}
      <Editor />
    </EditorContext.Provider>
  );
}
