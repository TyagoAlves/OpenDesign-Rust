/*
 * OpenDesign — parallax em camadas do hero e das seções (branch gh-pages)
 * ---------------------------------------------------------------------------
 * Vanilla, sem dependências e sem build. As imagens ficam dentro de .hero,
 * são decorativas (aria-hidden) e não recebem cliques (pointer-events:none).
 *
 * Regras desta entrega:
 *   - requestAnimationFrame + transform: translate3d(...);
 *   - só calcula enquanto o hero cruza a viewport (checagem de rect em aplicar(), sem IntersectionObserver);
 *   - respeita prefers-reduced-motion, mobile/touch e aba oculta;
 *   - nunca mexe em nav, aviso de prévia, CTA nem em position/z-index.
 */
(function () {
  'use strict';

  var doc = document;
  var hero = doc.querySelector('.hero');
  var camadas = hero ? Array.prototype.slice.call(hero.querySelectorAll('[data-speed]')) : [];
  var cenas = Array.prototype.slice.call(doc.querySelectorAll('.scene'));

  var MQ_DESLIGADO = '(max-width: 640px), (pointer: coarse), (orientation: landscape) and (max-height: 480px)';
  var MQ_REDUCAO = '(prefers-reduced-motion: reduce)';
  var DESLOCAMENTO_MAXIMO = 120; // px: teto para não revelar bordas das imagens
  var DESLOCAMENTO_CENA = 40; // px: folga da camada estendida das seções

  var mqDesligado = window.matchMedia ? window.matchMedia(MQ_DESLIGADO) : null;
  var mqReducao = window.matchMedia ? window.matchMedia(MQ_REDUCAO) : null;
  var pedirQuadro = window.requestAnimationFrame || window.webkitRequestAnimationFrame ||
    function (cb) { return window.setTimeout(function () { cb(Date.now()); }, 16); };
  var cancelarQuadro = window.cancelAnimationFrame || window.webkitCancelAnimationFrame ||
    function (id) { window.clearTimeout(id); };

  var ativo = false;
  var raf = 0;
  var alturaHero = 1;

  function podeAnimar() {
    return !!((camadas.length || cenas.length) && !doc.hidden &&
      !(mqReducao && mqReducao.matches) &&
      !(mqDesligado && mqDesligado.matches));
  }

  function medir() {
    alturaHero = hero ? (hero.offsetHeight || 1) : 1;
  }

  function aplicar() {
    raf = 0;
    if (!ativo || !podeAnimar()) return;

    var alturaViewport = window.innerHeight || doc.documentElement.clientHeight;
    var rect = hero ? hero.getBoundingClientRect() : null;
    // Fora da viewport: não gasta CPU e deixa as camadas do hero onde estão.
    var heroVisivel = !!(hero && rect.bottom >= 0 && rect.top <= alturaViewport);

    if (heroVisivel) {
      var progresso = Math.min(1, Math.max(0, -rect.top / alturaHero));
      for (var i = 0; i < camadas.length; i++) {
        var velocidade = parseFloat(camadas[i].getAttribute('data-speed'));
        if (!isFinite(velocidade)) velocidade = 0;
        var off = Math.round(progresso * (1 - velocidade) * DESLOCAMENTO_MAXIMO * 100) / 100;
        camadas[i].style.transform = 'translate3d(0,' + off + 'px,0)';
      }
    }

    // Cenas das seções: deslocamento curto e nominal, só enquanto a seção cruza a viewport.
    for (var j = 0; j < cenas.length; j++) {
      var cena = cenas[j];
      var r = cena.getBoundingClientRect();
      if (r.bottom < -80 || r.top > alturaViewport + 80) continue;
      var p = (alturaViewport - r.top) / (alturaViewport + r.height);
      p = Math.min(1, Math.max(0, p));
      var fator = 0.45 + (j % 4) * 0.12;
      var desloc = Math.round((p - 0.5) * 2 * DESLOCAMENTO_CENA * fator * 100) / 100;
      cena.style.setProperty('--scene-shift', desloc + 'px');
    }
  }

  function pedirFrame() {
    if (ativo && !raf) raf = pedirQuadro(aplicar);
  }

  function aoRedimensionar() {
    medir();
    pedirFrame();
  }

  function ouvir(mql) {
    if (!mql) return;
    if (mql.addEventListener) mql.addEventListener('change', aoPreferencia);
    else if (mql.addListener) mql.addListener(aoPreferencia);
  }

  function parar() {
    ativo = false;
    if (raf) { cancelarQuadro(raf); raf = 0; }
    for (var i = 0; i < camadas.length; i++) camadas[i].style.transform = '';
    for (var j = 0; j < cenas.length; j++) cenas[j].style.removeProperty('--scene-shift');
  }

  function iniciar() {
    if (ativo || !podeAnimar()) return;
    medir();
    ativo = true;
    pedirFrame();
  }

  function aoPreferencia() {
    if (!podeAnimar()) parar();
    else iniciar();
  }

  window.addEventListener('scroll', pedirFrame, { passive: true });
  window.addEventListener('resize', aoRedimensionar);
  window.addEventListener('orientationchange', aoRedimensionar);
  window.addEventListener('load', aoRedimensionar);
  doc.addEventListener('visibilitychange', aoPreferencia);
  ouvir(mqDesligado);
  ouvir(mqReducao);

  // Gancho pequeno para QA/integração (respeita as preferências ao reiniciar).
  window.OpenDesignParallax = {
    reiniciar: function () { parar(); aoPreferencia(); },
    parar: parar,
    aplicar: aplicar,
    quantidade: function () { return ativo ? camadas.length : 0; },
    quantidadeCenas: function () { return ativo ? cenas.length : 0; }
  };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', aoPreferencia);
  else aoPreferencia();
})();
