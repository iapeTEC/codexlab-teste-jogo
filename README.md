# Modelo: jogo com placar que vira APK

Modelo da Eletiva (IAPE) para criar um jogo em HTML, CSS e JavaScript que:

- roda no navegador pelo **GitHub Pages**;
- vira um **APK Android**, compilado de graça pelo **GitHub Actions**;
- tem uma **página de download**, para baixar o APK de qualquer lugar;
- salva o progresso de um de três jeitos (veja abaixo).

```
docs/                    ← o GitHub Pages publica esta pasta
  index.html             ← página de download (não precisa mexer)
  jogo/                  ← O JOGO. É esta pasta que vai dentro do APK.
    config.js            ← nome, pacote, modo de salvamento, cor...
    index.html           ← telas do jogo
    estilo.css
    regras.js            ← regras do jogo, só funções puras (testadas)
    jogo.js              ← liga as telas às regras e ao placar
    placar.js            ← salvamento (NÃO MEXER)
    placar-ui.js         ← painel de login/pasta/ranking (NÃO MEXER)
apps-script/Code.gs      ← "banco de dados" na Planilha Google (modo nuvem)
android/                 ← embala docs/jogo num app (NÃO MEXER)
.github/workflows/apk.yml← compila o APK e publica a Release
scripts/preparar.mjs     ← confere config.js e gera ícones e manifest
scripts/criar-chave.sh   ← cria a chave de assinatura do APK (uma vez)
tests/                   ← testes: node --test tests/*.test.mjs
```

## Os três modos de salvamento (`"modo"` em `config.js`)

| Modo | Onde fica | Apagou o app e instalou de novo |
| --- | --- | --- |
| `"local"` | só no aparelho | perdeu tudo |
| `"persistente"` | arquivo numa pasta do celular (Documents) | escolhe a mesma pasta e o progresso volta |
| `"nuvem"` | Planilha Google, pelo Apps Script `/exec` | entra com o mesmo apelido e PIN e o progresso volta, em qualquer aparelho; tem ranking de todos |

## Como o jogo usa o placar

```js
PlacarUI.montar(document.getElementById('painel-placar')); // painel pronto
const progresso = await Placar.iniciar();                  // { melhor, partidas, recordes, dados }
await Placar.registrarPartida(pontos, { nivel: 3 });       // no fim de cada partida
await Placar.salvar({ nivel: 4, moedas: 120 });            // guardar algo sem ser fim de partida
```

`dados` é livre, com até 1500 caracteres em JSON.

## Passo a passo

1. Edite `docs/jogo/config.js` e rode `node scripts/preparar.mjs`.
2. Faça o jogo em `docs/jogo/` (regras em `regras.js`, tela em `jogo.js`).
3. Rode os testes: `node --test tests/*.test.mjs`.
4. **Só no modo nuvem**: crie a Planilha e o Apps Script (instruções no topo de `apps-script/Code.gs`) e cole a URL `/exec` em `config.js`.
5. Crie o repositório e a chave, e depois envie:

```bash
git init -b main && git add . && git commit -m "Primeira versão do jogo"
gh repo create NOME-DO-JOGO --public --source=. --remote=origin
bash scripts/criar-chave.sh
git push -u origin main
gh api -X POST "repos/$(gh api user --jq .login)/NOME-DO-JOGO/pages" \
  -f "source[branch]=main" -f "source[path]=/docs"
gh run watch
```

6. Abra `https://SEU-USUARIO.github.io/NOME-DO-JOGO/` e toque em **Baixar para Android (APK)**.

Cada `git push` na `main` gera uma versão nova do APK (Releases do repositório).

## Problemas comuns

- **`refusing to allow an OAuth App to create or update workflow`** no push: rode
  `gh auth refresh -s workflow` e tente de novo.
- **O Actions falhou em "Conferir config.js"**: a mensagem diz qual campo arrumar.
- **"App não instalado" ao atualizar**: a versão antiga foi assinada com outra chave.
  Desinstale e instale de novo (no modo `local`, o progresso se perde).
- **Apps Script responde "Acesso negado"**: falta rodar `instalar` no editor e autorizar,
  ou a implantação não está como "Qualquer pessoa".
- **Celular bloqueou o APK** (verificação de desenvolvedor do Android): use
  **Jogar no navegador › Adicionar à tela inicial**.

## Segurança

O modo nuvem é um backend público de demonstração: quem tiver a URL `/exec` pode tentar
mandar pontuações falsas. Use um PIN só para o jogo, nunca uma senha de verdade, e não
guarde dados pessoais na planilha.
