/*
 * Tela do jogo de exemplo "Toque Rápido". Mostra o jeito certo de ligar o jogo ao placar:
 *   1. PlacarUI.montar(...) desenha login/pasta/ranking;
 *   2. await Placar.iniciar() carrega o progresso salvo;
 *   3. no fim de cada partida, Placar.registrarPartida(pontos).
 * Troque este arquivo pelo seu jogo, mantendo esses três passos.
 */
(async function () {
  'use strict';

  const config = window.JOGO_CONFIG || {};
  const $ = (id) => document.getElementById(id);

  document.title = config.nome || 'Jogo';
  $('titulo').textContent = config.nome || 'Jogo';
  if (config.cor) {
    document.documentElement.style.setProperty('--cor', config.cor);
    document.querySelector('meta[name="theme-color"]').setAttribute('content', config.cor);
  }

  PlacarUI.montar($('painel-placar'));
  const progresso = await Placar.iniciar();
  $('melhor').textContent = progresso.melhor;
  Placar.aoMudar((p) => { $('melhor').textContent = p.melhor; });

  let estado = null;
  let relogio = null;

  function mostrar(tela) {
    ['tela-inicio', 'tela-jogo', 'tela-fim'].forEach((id) => { $(id).hidden = id !== tela; });
  }

  function atualizarTela() {
    const restante = Regras.tempoRestante(estado, performance.now());
    $('tempo').textContent = (restante / 1000).toFixed(1);
    $('toques').textContent = Regras.pontos(estado);
    if (restante === 0) terminar();
  }

  function comecar() {
    estado = Regras.novaPartida(performance.now());
    mostrar('tela-jogo');
    $('botao-toque').focus();
    relogio = setInterval(atualizarTela, 100);
    atualizarTela();
  }

  async function terminar() {
    clearInterval(relogio);
    const pontos = Regras.pontos(estado);
    $('resultado').textContent = pontos;
    $('situacao-salvamento').textContent = 'Salvando...';
    mostrar('tela-fim');
    try {
      const salvo = await Placar.registrarPartida(pontos);
      $('situacao-salvamento').textContent = Placar.modo() === 'nuvem' && !salvo.salvoNaNuvem
        ? 'Salvo neste aparelho. Entre com apelido e PIN para ir ao ranking.'
        : 'Pontuação salva!';
    } catch (erro) {
      $('situacao-salvamento').textContent = 'Não deu para salvar: ' + erro.message;
    }
  }

  $('botao-jogar').addEventListener('click', comecar);
  $('botao-de-novo').addEventListener('click', comecar);
  $('botao-toque').addEventListener('pointerdown', (evento) => {
    evento.preventDefault();
    if (!estado || estado.terminou) return;
    estado = Regras.tocar(estado, performance.now());
    atualizarTela();
  });
  mostrar('tela-inicio');
})();
