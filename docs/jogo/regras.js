/*
 * Regras do jogo: só funções puras (sem tela, sem tempo real, sem sorteio escondido).
 * Assim dá para testar tudo em tests/regras.test.mjs com `node --test`.
 *
 * Jogo de exemplo "Toque Rápido": quantos toques você dá em 10 segundos?
 * Troque estas regras pelas do seu jogo.
 */
(function (raiz, fabrica) {
  const api = fabrica();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    raiz.Regras = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const DURACAO_MS = 10000;

  function novaPartida(agora) {
    return { inicio: agora, toques: 0, terminou: false };
  }

  function tempoRestante(estado, agora) {
    return Math.max(0, DURACAO_MS - (agora - estado.inicio));
  }

  function tocar(estado, agora) {
    if (estado.terminou || tempoRestante(estado, agora) === 0) {
      return Object.assign({}, estado, { terminou: true });
    }
    return Object.assign({}, estado, { toques: estado.toques + 1 });
  }

  function pontos(estado) {
    return estado.toques;
  }

  return { DURACAO_MS, novaPartida, tempoRestante, tocar, pontos };
});
