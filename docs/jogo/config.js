// Configuração do jogo. O APK (GitHub Actions) e a página de download leem este arquivo.
// Mantenha o objeto em formato JSON: aspas duplas, sem vírgula sobrando, sem comentários dentro.
//
// nome        nome que aparece no celular (até 30 letras)
// pacote      identidade única do app: io.github.SEU_USUARIO_DO_GITHUB.nomedojogo (minúsculas)
// modo        "local" | "persistente" | "nuvem"  (veja o README)
// urlExec     só no modo "nuvem": a URL do Apps Script terminada em /exec
// cor         cor principal, em hexadecimal (#RRGGBB)
// orientacao  "retrato" | "paisagem" | "livre"
// emoji       um emoji que representa o jogo na página de download
window.JOGO_CONFIG = {
  "nome": "Teste CodexLab",
  "pacote": "io.github.iapetec.codexlab_teste",
  "modo": "persistente",
  "urlExec": "",
  "cor": "#0F766E",
  "orientacao": "retrato",
  "emoji": "🎮",
  "descricao": "Jogo de exemplo do modelo: toque o mais rápido que puder em 10 segundos."
};
