import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const Regras = require('../docs/jogo/regras.js');

test('cada toque vale um ponto enquanto há tempo', () => {
  let estado = Regras.novaPartida(0);
  estado = Regras.tocar(estado, 100);
  estado = Regras.tocar(estado, 200);
  assert.equal(Regras.pontos(estado), 2);
  assert.equal(Regras.tempoRestante(estado, 1000), Regras.DURACAO_MS - 1000);
});

test('depois do tempo, toque não conta e a partida termina', () => {
  let estado = Regras.novaPartida(0);
  estado = Regras.tocar(estado, Regras.DURACAO_MS + 1);
  assert.equal(estado.terminou, true);
  assert.equal(Regras.pontos(estado), 0);
});
