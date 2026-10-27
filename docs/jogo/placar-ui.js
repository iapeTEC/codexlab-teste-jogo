/*
 * Painel pronto do placar: login (nuvem), escolha de pasta (persistente), aviso (local)
 * e ranking. NÃO PRECISA MEXER NESTE ARQUIVO.
 *
 * Uso no jogo:   PlacarUI.montar(document.getElementById('painel-placar'));
 * Depois de cada partida o painel se atualiza sozinho.
 */
(function (raiz) {
  'use strict';

  function criar(tag, atributos, filhos) {
    const elemento = document.createElement(tag);
    Object.keys(atributos || {}).forEach((nome) => {
      if (nome === 'texto') elemento.textContent = atributos[nome];
      else if (nome === 'classe') elemento.className = atributos[nome];
      else if (nome.startsWith('on')) elemento.addEventListener(nome.slice(2), atributos[nome]);
      else elemento.setAttribute(nome, atributos[nome]);
    });
    (filhos || []).forEach((filho) => filho && elemento.appendChild(filho));
    return elemento;
  }

  function formatarPontos(valor) {
    return Number(valor || 0).toLocaleString('pt-BR');
  }

  function montar(container) {
    if (!container) throw new Error('PlacarUI.montar precisa de um elemento.');
    const Placar = raiz.Placar;
    container.classList.add('placar');
    const areaConta = criar('div', { classe: 'placar-conta' });
    const mensagem = criar('p', { classe: 'placar-mensagem', role: 'status', 'aria-live': 'polite' });
    const titulo = criar('h2', { classe: 'placar-titulo', texto: 'Ranking' });
    const lista = criar('ol', { classe: 'placar-lista' });
    const atualizar = criar('button', { type: 'button', classe: 'placar-botao placar-secundario',
      texto: 'Atualizar ranking', onclick: () => desenharRanking() });
    container.replaceChildren(areaConta, mensagem, titulo, lista, atualizar);

    function avisar(texto, erro) {
      mensagem.textContent = texto || '';
      mensagem.classList.toggle('placar-erro', Boolean(erro));
    }

    function desenharConta() {
      const modo = Placar.modo();
      const p = Placar.progresso();
      const resumo = criar('p', { classe: 'placar-resumo',
        texto: 'Melhor: ' + formatarPontos(p.melhor) + ' · Partidas: ' + p.partidas });

      if (modo === 'local') {
        areaConta.replaceChildren(resumo, criar('p', { classe: 'placar-nota',
          texto: 'Seu progresso fica só neste aparelho. Se apagar o app, ele some.' }));
        return;
      }

      if (modo === 'persistente') {
        if (Placar.noAplicativo()) {
          const pasta = Placar.pasta();
          if (pasta.escolhida) {
            areaConta.replaceChildren(resumo, criar('p', { classe: 'placar-nota',
              texto: 'Progresso guardado na pasta ' + pasta.nome + '. Ele continua lá mesmo se você apagar o app.' }));
          } else {
            const botao = criar('button', { type: 'button', classe: 'placar-botao',
              texto: 'Escolher pasta para guardar o progresso' });
            botao.addEventListener('click', async () => {
              botao.disabled = true;
              try {
                const resultado = await Placar.escolherPasta();
                avisar(resultado.restaurado ? 'Progresso antigo encontrado e recuperado!' : 'Pronto! O progresso será guardado nessa pasta.');
              } catch (erro) {
                avisar(erro.message, true);
              } finally {
                botao.disabled = false;
              }
            });
            areaConta.replaceChildren(resumo, criar('p', { classe: 'placar-nota',
              texto: 'Toque no botão, abra a pasta Documents (Documentos) e toque em “Usar esta pasta” e depois em “Permitir”. Se você já jogou antes neste celular, escolha a mesma pasta para recuperar seu progresso.' }), botao);
          }
          return;
        }
        const baixar = criar('button', { type: 'button', classe: 'placar-botao placar-secundario',
          texto: 'Baixar meu progresso' });
        baixar.addEventListener('click', () => {
          const arquivo = new Blob([Placar.exportar()], { type: 'application/json' });
          const link = criar('a', { href: URL.createObjectURL(arquivo), download: 'progresso.json' });
          link.click();
          setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        });
        const entrada = criar('input', { type: 'file', accept: 'application/json,.json', classe: 'placar-arquivo',
          'aria-label': 'Carregar progresso salvo' });
        entrada.addEventListener('change', async () => {
          const arquivo = entrada.files && entrada.files[0];
          if (!arquivo) return;
          try {
            Placar.importar(await arquivo.text());
            avisar('Progresso carregado!');
          } catch (erro) {
            avisar(erro.message, true);
          }
          entrada.value = '';
        });
        areaConta.replaceChildren(resumo, criar('p', { classe: 'placar-nota',
          texto: 'No navegador, guarde seu progresso num arquivo e carregue de volta quando quiser.' }),
        baixar, criar('label', { classe: 'placar-nota', texto: 'Carregar progresso: ' }, [entrada]));
        return;
      }

      // modo nuvem
      const apelido = Placar.jogador();
      if (apelido) {
        const sair = criar('button', { type: 'button', classe: 'placar-botao placar-secundario', texto: 'Sair',
          onclick: () => { Placar.sair(); avisar('Você saiu. O progresso continua guardado na nuvem.'); } });
        areaConta.replaceChildren(criar('p', { classe: 'placar-nota', texto: 'Jogando como ' + apelido + '.' }),
          resumo, sair);
        return;
      }
      const campoApelido = criar('input', { type: 'text', maxlength: '16', autocomplete: 'nickname',
        placeholder: 'Apelido', 'aria-label': 'Apelido', classe: 'placar-campo' });
      const campoPin = criar('input', { type: 'password', inputmode: 'numeric', maxlength: '8',
        autocomplete: 'current-password', placeholder: 'PIN (4 a 8 números)', 'aria-label': 'PIN',
        classe: 'placar-campo' });
      const entrar = criar('button', { type: 'submit', classe: 'placar-botao', texto: 'Entrar ou criar conta' });
      const formulario = criar('form', { classe: 'placar-formulario' }, [campoApelido, campoPin, entrar]);
      formulario.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        entrar.disabled = true;
        avisar('Conectando...');
        try {
          const resultado = await Placar.entrar(campoApelido.value, campoPin.value);
          avisar(resultado.novo ? 'Conta criada! Use o mesmo apelido e PIN em outro aparelho.' : 'Bem-vindo de volta, ' + resultado.apelido + '!');
        } catch (erro) {
          avisar(erro.message, true);
        } finally {
          entrar.disabled = false;
        }
      });
      areaConta.replaceChildren(resumo, criar('p', { classe: 'placar-nota',
        texto: 'Entre para aparecer no ranking e recuperar seu progresso em qualquer celular. Não use uma senha de verdade: crie um PIN só para o jogo.' }), formulario);
    }

    let pedidoAtual = 0;
    async function desenharRanking() {
      const meu = ++pedidoAtual;
      atualizar.disabled = true;
      const resultado = await Placar.ranking();
      atualizar.disabled = false;
      if (meu !== pedidoAtual) return;
      titulo.textContent = resultado.global ? 'Ranking de todos os jogadores' : 'Seus melhores resultados';
      if (resultado.erro) avisar('Ranking da nuvem indisponível: ' + resultado.erro, true);
      const itens = (resultado.lista || []).map((linha) => criar('li', {}, [
        criar('span', { classe: 'placar-nome', texto: linha.apelido }),
        criar('span', { classe: 'placar-pontos', texto: formatarPontos(linha.pontos) })
      ]));
      lista.replaceChildren.apply(lista, itens.length ? itens : [criar('li', { classe: 'placar-vazio', texto: 'Ninguém jogou ainda. Seja o primeiro!' })]);
    }

    Placar.aoMudar(() => {
      desenharConta();
      desenharRanking();
    });
    desenharConta();
    desenharRanking();
  }

  raiz.PlacarUI = { montar };
})(window);
