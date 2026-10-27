import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const Placar = require('../docs/jogo/placar.js');
const p = Placar._interno;

test('progresso estranho vira progresso vazio', () => {
  assert.deepEqual(p.normalizarProgresso(null), p.progressoVazio());
  const r = p.normalizarProgresso({ melhor: -5, partidas: 'abc', dados: [1], recordes: 'x' });
  assert.equal(r.melhor, 0);
  assert.equal(r.partidas, 0);
  assert.deepEqual(r.dados, {});
  assert.deepEqual(r.recordes, []);
});

test('aplicarPartida guarda o recorde e só os 10 melhores', () => {
  let progresso = p.progressoVazio();
  for (let i = 1; i <= 12; i++) progresso = p.aplicarPartida(progresso, i * 10, 'Ana', '2026-10-27T10:00:' + String(i).padStart(2, '0') + 'Z');
  assert.equal(progresso.partidas, 12);
  assert.equal(progresso.melhor, 120);
  assert.equal(progresso.recordes.length, 10);
  assert.equal(progresso.recordes[0].pontos, 120);
  assert.equal(progresso.recordes[9].pontos, 30);
});

test('mesclar nunca perde o maior recorde nem as partidas', () => {
  const celular = { melhor: 50, partidas: 3, dados: { nivel: 1 }, atualizadoEm: '2026-10-01T00:00:00Z' };
  const nuvem = { melhor: 80, partidas: 2, dados: { nivel: 4 }, atualizadoEm: '2026-10-05T00:00:00Z' };
  const junto = p.mesclar(celular, nuvem);
  assert.equal(junto.melhor, 80);
  assert.equal(junto.partidas, 3);
  assert.deepEqual(junto.dados, { nivel: 4 }, 'dados vêm do mais recente');
});

test('valida apelido e PIN', () => {
  assert.equal(p.validarApelido('  Ana   Lima ').valor, 'Ana Lima');
  assert.equal(p.validarApelido('João_2').ok, true);
  assert.equal(p.validarApelido('a').ok, false);
  assert.equal(p.validarApelido('=SOMA(1)').ok, false);
  assert.equal(p.validarApelido('-ana').ok, false);
  assert.equal(p.validarPin('1234').ok, true);
  assert.equal(p.validarPin('12a4').ok, false);
  assert.equal(p.validarPin('123').ok, false);
});

test('limite de tamanho dos dados do jogo', () => {
  assert.equal(p.dadosCabem({ nivel: 3 }), true);
  assert.equal(p.dadosCabem({ texto: 'x'.repeat(p.LIMITE_DADOS) }), false);
});

test('chave do apelido + PIN é sempre a mesma e não contém o PIN', async () => {
  const a = await p.derivarChave('Ana', '1234', 'br.iape.jogo.teste');
  const b = await p.derivarChave('ana', '1234', 'br.iape.jogo.teste');
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a, b, 'apelido não diferencia maiúsculas');
  assert.ok(!a.includes('1234'));
  assert.notEqual(a, await p.derivarChave('Ana', '1235', 'br.iape.jogo.teste'));
});

test('URL do Apps Script e parâmetros', () => {
  assert.ok(p.URL_EXEC.test('https://script.google.com/macros/s/AKfycbx_ABC-123/exec'));
  assert.ok(!p.URL_EXEC.test('https://script.google.com/macros/s/AKfy/dev'));
  const url = p.montarUrl('https://script.google.com/macros/s/X/exec', { acao: 'ranking', limite: 10, vazio: undefined });
  assert.equal(url, 'https://script.google.com/macros/s/X/exec?acao=ranking&limite=10');
});
