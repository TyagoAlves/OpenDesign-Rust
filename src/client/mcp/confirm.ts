/** Consentimento D2: pedido por arquivo, "lembrar" só em memória do backend. */
import { useEffect, useState } from "preact/hooks";
import type { PedidoConfirmacao, RespostaConfirmacao } from "./backend-tauri";

interface Pedido {
  pedido: PedidoConfirmacao;
  resolver: (resposta: RespostaConfirmacao) => void;
}

let atual: Pedido | null = null;
const ouvintes = new Set<() => void>();

function notificar(): void {
  for (const ouvinte of ouvintes) ouvinte();
}

export function pedirConfirmacao(pedido: PedidoConfirmacao): Promise<RespostaConfirmacao> {
  return new Promise((resolver) => {
    atual = { pedido, resolver };
    notificar();
  });
}

export function responderConfirmacao(resposta: RespostaConfirmacao): void {
  const pedido = atual;
  if (!pedido) return;
  atual = null;
  pedido.resolver(resposta);
  notificar();
}

export function usePedidoConfirmacao(): PedidoConfirmacao | null {
  const [pedido, setPedido] = useState<PedidoConfirmacao | null>(atual?.pedido ?? null);
  useEffect(() => {
    const ouvinte = () => setPedido(atual?.pedido ?? null);
    ouvintes.add(ouvinte);
    return () => { ouvintes.delete(ouvinte); };
  }, []);
  return pedido;
}
