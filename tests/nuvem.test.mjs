// Modo nuvem de ponta a ponta: placar.js (o jogo) conversa por JSONP com apps-script/Code.gs
// rodando no simulador do Google. Confere que os dois lados falam a mesma língua.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { carregarAppsScript } from './simulador-apps-script.mjs';

const require = createRequire(import.meta.url);
const CAMINHO_PLACAR = require.resolve('../docs/jogo/placar.js');
const CODIGO = new URL('../apps-script/Code.gs', import.meta.url).pathname;
const URL_EXEC = 'https://script.google.com/macros/s/TESTE_123/exec';

/** Um "celular": navegador falso com localStorage próprio, ligado ao mesmo servidor. */
function novoCelular(servidor, rede = { online: true }) {
  const armazenamento = new Map();
  const janela = {
    JOGO_CONFIG: { modo: 'nuvem', urlExec: URL_EXEC, pacote: 'br.iape.jogo.teste' },
    crypto: globalThis.crypto,
    localStorage: {
      getItem: (k) => (armazenamento.has(k) ? armazenamento.get(k) : null),
      setItem: (k, v) => armazenamento.set(k, String(v)),
      removeItem: (k) => armazenamento.delete(k)
    }
  };
  janela.document = {
    createElement: () => ({ remove() {}, onerror: null, src: '' }),
    head: {
      appendChild(script) {
        setTimeout(() => {
          if (!rede.online) { script.onerror(); return; }
          const parametros = Object.fromEntries(new URL(script.src).searchParams);
          const { corpo } = servidor.chamar(parametros);
          janela[parametros.callback](corpo);
        }, 1);
      }
    }
  };
  globalThis.window = janela;
  delete require.cache[CAMINHO_PLACAR];
  const Placar = require(CAMINHO_PLACAR);
  delete globalThis.window;
  return { Placar, armazenamento, rede };
}

function novoServidor() {
  const servidor = carregarAppsScript(CODIGO);
  servidor.contexto.instalar();
  return servidor;
}

test('conta, partida, ranking e recuperação em outro celular', async () => {
  const servidor = novoServidor();
  const celular1 = novoCelular(servidor).Placar;
  await celular1.iniciar();
  const conta = await celular1.entrar('Ana', '1234');
  assert.equal(conta.novo, true);
  const salvo = await celular1.registrarPartida(50, { nivel: 2 });
  assert.equal(salvo.salvoNaNuvem, true);
  const ranking = await celular1.ranking();
  assert.equal(ranking.global, true);
  assert.deepEqual(ranking.lista, [{ apelido: 'Ana', pontos: 50 }]);

  // Apagou o app / trocou de celular: entra com o mesmo apelido e PIN.
  const celular2 = novoCelular(servidor).Placar;
  await celular2.iniciar();
  assert.equal(celular2.progresso().melhor, 0);
  const deVolta = await celular2.entrar('ana', '1234');
  assert.equal(deVolta.novo, false);
  assert.equal(celular2.progresso().melhor, 50);
  assert.equal(celular2.progresso().partidas, 1);
  assert.deepEqual(celular2.progresso().dados, { nivel: 2 });
});

test('PIN errado não entra', async () => {
  const servidor = novoServidor();
  await novoCelular(servidor).Placar.entrar('Bia', '1111');
  const outro = novoCelular(servidor).Placar;
  await assert.rejects(outro.entrar('Bia', '2222'), /PIN errado/);
  assert.equal(outro.jogador(), '');
});

test('partida sem internet fica guardada e sobe quando a internet volta', async () => {
  const servidor = novoServidor();
  const celular = novoCelular(servidor);
  await celular.Placar.entrar('Caio', '4321');
  celular.rede.online = false;
  const semRede = await celular.Placar.registrarPartida(80);
  assert.equal(semRede.salvoNaNuvem, false);
  assert.equal(celular.Placar.progresso().melhor, 80, 'o celular já mostra o recorde');
  celular.rede.online = true;
  await celular.Placar.iniciar();
  const ranking = await celular.Placar.ranking();
  assert.deepEqual(ranking.lista, [{ apelido: 'Caio', pontos: 80 }]);
});

test('sem internet o ranking mostra os recordes do próprio celular', async () => {
  const servidor = novoServidor();
  const celular = novoCelular(servidor, { online: false });
  await celular.Placar.registrarPartida(30);
  const ranking = await celular.Placar.ranking();
  assert.equal(ranking.global, false);
  assert.equal(ranking.lista[0].pontos, 30);
});
