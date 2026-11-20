/*
 * OpenDesign — parallax vanilla para a landing (branch gh-pages)
 * ---------------------------------------------------------------------------
 * Arquivo de STAGING. A integração cola este bloco em <script> antes de </body>.
 * Sem dependências externas, sem build e sem publicação automática.
 *
 * Regras desta entrega:
 *   - animação com requestAnimationFrame + transform: translate3d(...);
 *   - IntersectionObserver para atualizar só o que está perto da viewport;
 *   - respeita prefers-reduced-motion, inclusive se o usuário mudar no meio;
 *   - NUNCA aplica parallax na nav sticky, nos CTAs de download nem no aviso
 *     de prévia. O efeito é apenas translate3d: não mexe em position/z-index
 *     e não cria camada que possa cobrir esses elementos.
 *
 * Como usar:
 *   1) Padrão: sem marcar nada no HTML, já anima `.hero .mock` e `.shot img`.
 *   2) Explícito: marque elementos decorativos com data-parallax="0.08".
 *      Fator sugerido: 0.05 a 0.25 (quanto maior, mais "lento" em relação à
 *      rolagem). Se existir ao menos um [data-parallax], os padrões são
 *      ignorados. Evite marcar algo com transform próprio (ex.: `.tile`).
 *
 * O aviso de prévia e o link do binário permanecem intocados até QA verde
 * e OK final do Tyago.
 */
(function () {
  'use strict';

  var doc = document;

  // --- configuração ---------------------------------------------------------
  var SELETOR_EXPLICITO = '[data-parallax]';
  var PADRAO = [
    { seletor: '.hero .mock', fator: 0.06 },
    { seletor: '.shot img', fator: 0.05 }
  ];
  // Protegidos: nav sticky, aviso de prévia, CTAs de download e nota final.
  var PROTEGIDOS = '.nav, .notice, .cta-row, .final .btn, #download, .final__note';
  var MARGEM_OBSERVADOR = '20% 0px 20% 0px'; // antecipa entrada/saída
  var LIMITE_DESLOCAMENTO = 48; // px: teto para não "vazar" da seção
  var FATOR_LIMITE = 0.4;

  // Desliga em mobile/touch, landscape baixo ou reduced-motion (prioridade:
  // movimento reduzido sempre vence). Para ligar em touch, remova `(pointer: coarse)`.
  var MQ_DESLIGADO = '(max-width: 640px), (pointer: coarse), (orientation: landscape) and (max-height: 480px)';

  // --- compatibilidade mínima (sem dependências) ----------------------------
  var pedirQuadro = window.requestAnimationFrame || window.webkitRequestAnimationFrame ||
    function (cb) { return window.setTimeout(function () { cb(Date.now()); }, 16); };
  var cancelarQuadro = window.cancelAnimationFrame || window.webkitCancelAnimationFrame ||
    function (id) { window.clearTimeout(id); };
  var temIO = typeof window.IntersectionObserver === 'function';
  var temRO = typeof window.ResizeObserver === 'function';
  var mq = window.matchMedia ? window.matchMedia(MQ_DESLIGADO) : null;
  var mqReducao = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  // --- estado ---------------------------------------------------------------
  var alvos = [];
  var observer = null;
  var ro = null;
  var raf = 0;
  var rafMedida = 0;
  var ligado = false;

  function reduzido() { return !!(mqReducao && mqReducao.matches); }

  function podeAnimar() {
    if (reduzido()) return false;
    if (doc.hidden) return false; // aba oculta: não gasta CPU
    if (mq && mq.matches) return false;
    return true;
  }

  function scrollY() { return window.pageYOffset || doc.documentElement.scrollTop || 0; }

  function alturaViewport() { return window.innerHeight || doc.documentElement.clientHeight || 0; }

  // Verdadeiro se o elemento É, está DENTRO ou CONTÉM algo protegido.
  // Assim nem um alvo mal marcado consegue deslocar nav/CTA/aviso.
  function protegido(el) {
    if (!el) return true;
    var p = el;
    while (p && p !== doc.documentElement) {
      if (p.matches && p.matches(PROTEGIDOS)) return true;
      p = p.parentElement;
    }
    return !!(el.querySelector && el.querySelector(PROTEGIDOS));
  }

  function criarAlvo(el, fator) {
    var r = el.getBoundingClientRect();
    return {
      el: el,
      fator: Math.max(-FATOR_LIMITE, Math.min(FATOR_LIMITE, fator)),
      base: r.top + scrollY(), // posição no documento, ainda sem offset aplicado
      altura: r.height,
      offset: 0,
      visivel: !temIO // sem IntersectionObserver, atualiza todos
    };
  }

  function medir(a) {
    // O rect já inclui o transform atual; subtrair o offset devolve a base limpa.
    var r = a.el.getBoundingClientRect();
    a.base = r.top + scrollY() - a.offset;
    a.altura = r.height;
  }

  function coletar() {
    var lista = [];
    var marcados = doc.querySelectorAll(SELETOR_EXPLICITO);
    var i, j;

    if (marcados.length) {
      for (i = 0; i < marcados.length; i++) {
        if (protegido(marcados[i])) continue;
        var f = parseFloat(marcados[i].getAttribute('data-parallax'));
        if (!isFinite(f)) f = 0.1;
        lista.push(criarAlvo(marcados[i], f));
      }
    } else {
      for (i = 0; i < PADRAO.length; i++) {
        var els = doc.querySelectorAll(PADRAO[i].seletor);
        for (j = 0; j < els.length; j++) {
          if (protegido(els[j])) continue;
          lista.push(criarAlvo(els[j], PADRAO[i].fator));
        }
      }
    }
    return lista;
  }

  function achar(el) {
    for (var i = 0; i < alvos.length; i++) if (alvos[i].el === el) return alvos[i];
    return null;
  }

  // Um único passe por frame para todos os alvos visíveis.
  function aplicar() {
    raf = 0;
    if (!ligado || !podeAnimar()) return;
    var centro = scrollY() + alturaViewport() / 2;
    for (var i = 0; i < alvos.length; i++) {
      var a = alvos[i];
      if (!a.visivel) continue;
      var delta = centro - (a.base + a.altura / 2);
      var off = Math.round(delta * a.fator * 100) / 100;
      if (off > LIMITE_DESLOCAMENTO) off = LIMITE_DESLOCAMENTO;
      else if (off < -LIMITE_DESLOCAMENTO) off = -LIMITE_DESLOCAMENTO;
      a.offset = off;
      // translate3d promove a camada de composição; como não altera position
      // nem z-index, não pode cobrir a nav, o CTA nem o aviso de prévia.
      a.el.style.transform = 'translate3d(0,' + a.offset + 'px,0)';
    }
  }

  function pedirFrame() {
    if (ligado && !raf) raf = pedirQuadro(aplicar);
  }

  function aoRedimensionar() {
    if (rafMedida) return;
    rafMedida = pedirQuadro(function () {
      rafMedida = 0;
      for (var i = 0; i < alvos.length; i++) medir(alvos[i]);
      pedirFrame();
    });
  }

  function conectar() {
    if (temIO) {
      observer = new window.IntersectionObserver(function (entradas) {
        for (var i = 0; i < entradas.length; i++) {
          var a = achar(entradas[i].target);
          if (!a) continue;
          if (entradas[i].isIntersecting) {
            a.visivel = true;
            medir(a); // recalibra a base ao reentrar na viewport
          } else {
            a.visivel = false;
          }
        }
        pedirFrame();
      }, { rootMargin: MARGEM_OBSERVADOR });
      for (var j = 0; j < alvos.length; j++) observer.observe(alvos[j].el);
    }

    // Imagem lazy (readme-banner.png) e fontes web podem mudar alturas depois.
    if (temRO) {
      ro = new window.ResizeObserver(function () { aoRedimensionar(); });
      for (var k = 0; k < alvos.length; k++) ro.observe(alvos[k].el);
    }

    window.addEventListener('scroll', pedirFrame, { passive: true });
    window.addEventListener('resize', aoRedimensionar);
    window.addEventListener('orientationchange', aoRedimensionar);
    window.addEventListener('load', aoRedimensionar);
    pedirFrame();
  }

  function desligar() {
    ligado = false;
    if (raf) { cancelarQuadro(raf); raf = 0; }
    if (rafMedida) { cancelarQuadro(rafMedida); rafMedida = 0; }
    if (observer) { observer.disconnect(); observer = null; }
    if (ro) { ro.disconnect(); ro = null; }
    window.removeEventListener('scroll', pedirFrame);
    window.removeEventListener('resize', aoRedimensionar);
    window.removeEventListener('orientationchange', aoRedimensionar);
    window.removeEventListener('load', aoRedimensionar);
    for (var i = 0; i < alvos.length; i++) {
      alvos[i].el.style.transform = '';
      alvos[i].offset = 0;
    }
    alvos = [];
  }

  function iniciar() {
    if (ligado || !podeAnimar()) return;
    alvos = coletar();
    if (!alvos.length) return;
    ligado = true;
    conectar();
  }

  function aoPreferencia() {
    if (!podeAnimar()) desligar();
    else iniciar();
  }

  // Reage a mudanças do sistema/usuário (reduzir movimento, touch, aba ativa).
  function ouvir(mql) {
    if (!mql) return;
    if (mql.addEventListener) mql.addEventListener('change', aoPreferencia);
    else if (mql.addListener) mql.addListener(aoPreferencia);
  }
  ouvir(mq);
  ouvir(mqReducao);
  doc.addEventListener('visibilitychange', aoPreferencia);

  // Gancho pequeno para QA/integração (respeita as preferências ao reiniciar).
  window.OpenDesignParallax = {
    reiniciar: function () { desligar(); aoPreferencia(); },
    parar: desligar,
    quantidade: function () { return alvos.length; }
  };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', aoPreferencia);
  else aoPreferencia();
})();
