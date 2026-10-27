import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { carregarAppsScript } from './simulador-apps-script.mjs';

const CODIGO = new URL('../apps-script/Code.gs', import.meta.url).pathname;
const chave = (texto) => createHash('sha256').update(texto).digest('hex');
const ANA = chave('ana:1234:teste');

function novoServidor() {
  const servidor = carregarAppsScript(CODIGO);
  servidor.contexto.instalar();
  return servidor;
}

test('saude responde por JSONP e por JSON puro', () => {
  const s = novoServidor();
  assert.equal(s.chamar({ acao: 'saude', callback: 'cb_1' }).corpo.ok, true);
  const puro = s.chamar({ acao: 'saude', callback: 'alert(1)' });
  assert.equal(puro.tipo, 'json');
  assert.equal(puro.corpo.ok, true);
});

test('entrar cria a conta e depois confere o PIN', () => {
  const s = novoServidor();
  const primeira = s.chamar({ acao: 'entrar', apelido: 'Ana', chave: ANA, callback: 'cb' }).corpo;
  assert.equal(primeira.ok, true);
  assert.equal(primeira.novo, true);
  const segunda = s.chamar({ acao: 'entrar', apelido: 'ana', chave: ANA, callback: 'cb' }).corpo;
  assert.equal(segunda.novo, false);
  assert.equal(segunda.apelido, 'Ana');
  const errada = s.chamar({ acao: 'entrar', apelido: 'Ana', chave: chave('outra'), callback: 'cb' }).corpo;
  assert.equal(errada.ok, false);
  assert.match(errada.erro, /PIN errado/);
  assert.equal(s.abas.get('Jogadores').linhas.length, 2, 'cabeçalho + 1 jogador');
});

test('partida grava recorde, conta partidas e não duplica pedido repetido', () => {
  const s = novoServidor();
  s.chamar({ acao: 'entrar', apelido: 'Ana', chave: ANA });
  const pedido = { acao: 'partida', apelido: 'Ana', chave: ANA, pontos: 42, pedido: 'pedido-0001',
    dados: JSON.stringify({ nivel: 2 }) };
  const r1 = s.chamar(pedido).corpo;
  const r2 = s.chamar(pedido).corpo;
  assert.deepEqual(r1, r2);
  assert.equal(r1.progresso.melhor, 42);
  assert.equal(r1.progresso.partidas, 1);
  assert.deepEqual(r1.progresso.dados, { nivel: 2 });
  assert.equal(s.abas.get('Partidas').linhas.length, 2, 'cabeçalho + 1 partida');
  const r3 = s.chamar({ acao: 'partida', apelido: 'Ana', chave: ANA, pontos: 10, pedido: 'pedido-0002' }).corpo;
  assert.equal(r3.progresso.melhor, 42, 'pontuação menor não derruba o recorde');
  assert.equal(r3.progresso.partidas, 2);
});

test('salvar exige o PIN certo', () => {
  const s = novoServidor();
  s.chamar({ acao: 'entrar', apelido: 'Ana', chave: ANA });
  const r = s.chamar({ acao: 'salvar', apelido: 'Ana', chave: chave('x'), dados: '{}' }).corpo;
  assert.equal(r.ok, false);
});

test('ranking ordena do maior para o menor e esconde quem tem zero', () => {
  const s = novoServidor();
  const jogadores = [['Ana', 30], ['Bia', 90], ['Caio', 0], ['Davi', 60]];
  jogadores.forEach(([apelido, pontos], i) => {
    const k = chave(apelido);
    s.chamar({ acao: 'entrar', apelido, chave: k });
    if (pontos) s.chamar({ acao: 'partida', apelido, chave: k, pontos, pedido: 'pedido-000' + i });
  });
  const r = s.chamar({ acao: 'ranking', limite: 10, callback: 'cb' }).corpo;
  assert.deepEqual(r.ranking.map((l) => l.apelido), ['Bia', 'Davi', 'Ana']);
});

test('recusa apelido que viraria fórmula, dados grandes e pontos absurdos', () => {
  const s = novoServidor();
  assert.equal(s.chamar({ acao: 'entrar', apelido: '=HYPERLINK("x")', chave: ANA }).corpo.ok, false);
  s.chamar({ acao: 'entrar', apelido: 'Ana', chave: ANA });
  const grande = s.chamar({ acao: 'salvar', apelido: 'Ana', chave: ANA, dados: JSON.stringify({ x: 'a'.repeat(2000) }) }).corpo;
  assert.equal(grande.ok, false);
  const absurdo = s.chamar({ acao: 'partida', apelido: 'Ana', chave: ANA, pontos: 1e15, pedido: 'pedido-9999' }).corpo;
  assert.equal(absurdo.progresso.melhor, s.contexto.PONTOS_MAXIMOS ?? 1000000);
});

test('bloqueia depois de muitas tentativas com PIN errado', () => {
  const s = novoServidor();
  s.chamar({ acao: 'entrar', apelido: 'Ana', chave: ANA });
  for (let i = 0; i < 8; i++) s.chamar({ acao: 'entrar', apelido: 'Ana', chave: chave('erro' + i) });
  const r = s.chamar({ acao: 'entrar', apelido: 'Ana', chave: ANA }).corpo;
  assert.equal(r.ok, false);
  assert.match(r.erro, /Muitas tentativas/);
});
