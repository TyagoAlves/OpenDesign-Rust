import { useRef, useState } from "preact/hooks";
import { Upload, Plus, Trash2, Download, Wand2 } from "lucide-preact";
import { useEditor } from "../context";
import { FontPicker } from "./font-picker";
import { exportKit, importKit } from "../lib/kit-transfer";

export function BrandKitPanel() {
  const {
    brandKits,
    activeBrandKit,
    activeBrandKitId,
    setActiveBrandKitId,
    createBrandKit,
    updateBrandKit,
    deleteBrandKit,
    applyBrandKit,
    addImage,
    selectedObject,
    updateSelectedObject,
    setBackground,
    customFonts,
    importFont,
  } = useEditor();

  // Um clique na amostra aplica a cor ao item selecionado; sem seleção,
  // o alvo mais sensato é o plano de fundo da página.
  const applyBrandColor = (color: string) => {
    if (selectedObject) updateSelectedObject({ fill: color });
    else setBackground("color", color);
  };

  const logoInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  // Guarda o rótulo da operação assíncrona em andamento, ou null.
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleLogoUpload = async (files: FileList | null) => {
    if (!files?.length || !activeBrandKit) return;
    setBusy("Enviando…");
    try {
      const form = new FormData();
      form.append("file", files[0]);
      const resp = await fetch("/api/uploads", { method: "POST", body: form });
      const data = await resp.json();
      if (data.url) {
        await updateBrandKit(activeBrandKit.id, { logos: [...activeBrandKit.logos, data.url] });
      }
    } catch (e) {
      console.error("Não foi possível enviar o logo:", e);
    } finally {
      setBusy(null);
    }
  };

  const handleExport = async () => {
    if (!activeBrandKit) return;
    setError(null);
    setBusy("Exportando…");
    try {
      const { json, missing } = await exportKit(activeBrandKit, customFonts);
      const blob = new Blob([json], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${activeBrandKit.name.replace(/[^\w-]+/g, "-").toLowerCase()}.brandkit.json`;
      link.click();
      URL.revokeObjectURL(link.href);
      if (missing > 0) setError(`Exportado, mas não foi possível ler ${missing} arquivo(s).`);
    } finally {
      setBusy(null);
    }
  };

  const handleImport = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    setBusy("Importando…");
    try {
      const result = await importKit(await files[0].text(), importFont);
      if (!result) {
        setError("Esse arquivo não é um kit de marca do OpenDesign.");
        return;
      }
      await createBrandKit(result.kit);
      if (result.missing > 0) setError(`Importado, mas não foi possível salvar ${result.missing} arquivo(s).`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div class="flex flex-col gap-4">
      {/* Seletor de kit */}
      <div class="flex gap-1.5">
        <select
          class="flex-1 min-w-0 bg-white border border-zinc-300 rounded-md text-xs text-zinc-700 px-2 py-1.5 outline-none cursor-pointer focus:border-accent"
          value={activeBrandKitId ?? ""}
          onChange={(e) => setActiveBrandKitId((e.target as HTMLSelectElement).value || null)}
          aria-label="Kit de marca ativo"
        >
          {brandKits.length === 0 && <option value="">Nenhum kit de marca ainda</option>}
          {brandKits.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </select>
        <button
          class="shrink-0 p-1.5 rounded-md border border-zinc-300 bg-white text-zinc-500 cursor-pointer hover:border-accent hover:text-accent transition-all"
          onClick={() => createBrandKit()}
          title="Novo kit de marca"
          aria-label="Novo kit de marca"
        >
          <Plus size={14} />
        </button>
      </div>

      {!activeBrandKit ? (
        <p class="text-[11px] text-zinc-400 leading-relaxed">
          Um kit de marca reúne as cores, fontes e logos que você reutiliza em todos os projetos. Crie
          um e aplique-o a qualquer projeto com um clique.
        </p>
      ) : (
        <>
          <div>
            <label class="text-[11px] text-zinc-400 mb-1 block">Nome do kit</label>
            <input
              type="text"
              class="w-full bg-white border border-zinc-300 rounded-md text-xs text-zinc-700 px-2 py-1.5 outline-none focus:border-accent"
              value={activeBrandKit.name}
              onChange={(e) =>
                updateBrandKit(activeBrandKit.id, {
                  name: (e.target as HTMLInputElement).value || "Minha marca",
                })
              }
            />
          </div>

          <div>
            <label class="text-[11px] text-zinc-400 mb-1.5 block">
              Cores da marca <span class="text-zinc-300">— clique para aplicar à seleção</span>
            </label>
            <div class="grid grid-cols-5 gap-1.5">
              {activeBrandKit.colors.map((color, i) => (
                <div key={`${color}-${i}`} class="relative group">
                  <button
                    class="w-full aspect-square rounded-md border border-zinc-300 cursor-pointer transition-all hover:scale-110 hover:border-accent"
                    style={{ background: color }}
                    title={color}
                    aria-label={`Cor da marca ${color}`}
                    onClick={() => applyBrandColor(color)}
                  />
                  <button
                    class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-zinc-700 text-white border-none cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    title={`Remover ${color}`}
                    aria-label={`Remover cor da marca ${color}`}
                    onClick={() =>
                      updateBrandKit(activeBrandKit.id, {
                        colors: activeBrandKit.colors.filter((_, j) => j !== i),
                      })
                    }
                  >
                    <span class="text-[9px] leading-none">×</span>
                  </button>
                </div>
              ))}
              {activeBrandKit.colors.length < 24 && (
                <label class="w-full aspect-square rounded-md border border-dashed border-zinc-300 cursor-pointer flex items-center justify-center text-zinc-400 hover:border-accent hover:text-accent transition-all">
                  <Plus size={14} />
                  <input
                    type="color"
                    class="sr-only"
                    aria-label="Adicionar cor da marca"
                    onChange={(e) =>
                      updateBrandKit(activeBrandKit.id, {
                        colors: [...activeBrandKit.colors, (e.target as HTMLInputElement).value],
                      })
                    }
                  />
                </label>
              )}
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <FontPicker
              label="Fonte do título"
              value={activeBrandKit.heading_font}
              onChange={(heading_font) => updateBrandKit(activeBrandKit.id, { heading_font })}
            />
            <FontPicker
              label="Fonte do texto"
              value={activeBrandKit.body_font}
              onChange={(body_font) => updateBrandKit(activeBrandKit.id, { body_font })}
            />
          </div>

          <div>
            <label class="text-[11px] text-zinc-400 mb-1.5 block">
              Logos <span class="text-zinc-300">— clique para posicionar</span>
            </label>
            <div class="grid grid-cols-3 gap-1.5">
              {activeBrandKit.logos.map((url, i) => (
                <div key={url} class="relative group">
                  <button
                    class="w-full aspect-square rounded-md border border-zinc-200 bg-[repeating-conic-gradient(#f4f4f5_0%_25%,#ffffff_0%_50%)] bg-[length:12px_12px] cursor-pointer p-1 hover:border-accent transition-all"
                    onClick={() => addImage(url)}
                    title="Adicionar logo à tela"
                  >
                    <img src={url} alt="" class="w-full h-full object-contain" />
                  </button>
                  <button
                    class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-zinc-700 text-white border-none cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    aria-label="Remover logo"
                    onClick={() =>
                      updateBrandKit(activeBrandKit.id, {
                        logos: activeBrandKit.logos.filter((_, j) => j !== i),
                      })
                    }
                  >
                    <span class="text-[9px] leading-none">×</span>
                  </button>
                </div>
              ))}
              {activeBrandKit.logos.length < 12 && (
                <button
                  class="w-full aspect-square rounded-md border border-dashed border-zinc-300 cursor-pointer flex items-center justify-center text-zinc-400 hover:border-accent hover:text-accent transition-all"
                  onClick={() => logoInputRef.current?.click()}
                  aria-label="Enviar logo"
                >
                  <Upload size={14} />
                </button>
              )}
            </div>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              class="hidden"
              onChange={(e) => handleLogoUpload((e.target as HTMLInputElement).files)}
            />
          </div>

          <button
            class="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-accent text-white border-none cursor-pointer text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => applyBrandKit(activeBrandKit)}
            disabled={activeBrandKit.colors.length === 0}
            title={
              activeBrandKit.colors.length === 0
                ? "Adicione pelo menos uma cor da marca primeiro"
                : "Aplicar fontes e cores da marca a esta página"
            }
          >
            <Wand2 size={13} />
            Aplicar a esta página
          </button>

          <div class="pt-1 border-t border-zinc-200">
            <p class="text-[10px] text-zinc-400 mt-2 mb-1.5 leading-relaxed">
              Seu kit é um arquivo JSON simples. Leve-o para outra instalação do OpenDesign ou
              entregue-o a um cliente.
            </p>
            <div class="flex gap-1.5">
              <button
                class="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md border border-zinc-300 bg-white text-[11px] text-zinc-500 cursor-pointer hover:border-accent hover:text-accent transition-all"
                onClick={handleExport}
              >
                <Download size={12} />
                Exportar
              </button>
              <button
                class="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md border border-zinc-300 bg-white text-[11px] text-zinc-500 cursor-pointer hover:border-accent hover:text-accent transition-all"
                onClick={() => importInputRef.current?.click()}
              >
                <Upload size={12} />
                Importar
              </button>
              <button
                class="shrink-0 p-1.5 rounded-md border border-zinc-300 bg-white text-zinc-400 cursor-pointer hover:border-red-400 hover:text-red-500 transition-all"
                onClick={() => deleteBrandKit(activeBrandKit.id)}
                title="Excluir este kit"
                aria-label="Excluir este kit de marca"
              >
                <Trash2 size={12} />
              </button>
            </div>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              class="hidden"
              onChange={(e) => handleImport((e.target as HTMLInputElement).files)}
            />
            {busy && <p class="text-[10px] text-zinc-400 mt-1.5">{busy}</p>}
            {error && <p class="text-[10px] text-red-500 mt-1.5">{error}</p>}
          </div>
        </>
      )}
    </div>
  );
}
