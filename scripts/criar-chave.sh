#!/usr/bin/env bash
# Cria a chave que assina o APK e guarda nos Secrets do repositório no GitHub.
# Rode UMA vez, depois de criar o repositório e ANTES do primeiro push:
#     bash scripts/criar-chave.sh
#
# Por que: o Android só aceita atualizar um app se a versão nova tiver a mesma assinatura.
# A chave fica só no cofre (Secrets) do GitHub; nada dela vai para o código.
set -euo pipefail

for programa in gh openssl base64; do
    command -v "$programa" >/dev/null || { echo "Falta o programa $programa." >&2; exit 1; }
done
if ! gh auth status >/dev/null 2>&1; then
    echo "Faça login no GitHub primeiro:  gh auth login --web --git-protocol https" >&2
    exit 1
fi
repositorio=$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null) || {
    echo "Crie o repositório antes (gh repo create NOME --public --source=. --remote=origin)." >&2
    exit 1
}
if gh secret list --repo "$repositorio" | grep -q '^ANDROID_CHAVE_BASE64'; then
    echo "A chave já existe em $repositorio. Nada a fazer."
    exit 0
fi

pasta=$(mktemp -d)
trap 'rm -rf "$pasta"' EXIT
senha=$(openssl rand -hex 16)
openssl req -x509 -newkey rsa:2048 -nodes -days 10000 \
    -subj "/CN=${repositorio}/O=Eletiva IAPE" \
    -keyout "$pasta/chave.pem" -out "$pasta/certificado.pem" 2>/dev/null
openssl pkcs12 -export -name jogo -inkey "$pasta/chave.pem" -in "$pasta/certificado.pem" \
    -out "$pasta/chave.p12" -passout "pass:$senha"

base64 -w0 "$pasta/chave.p12" | gh secret set ANDROID_CHAVE_BASE64 --repo "$repositorio"
printf '%s' "$senha" | gh secret set ANDROID_CHAVE_SENHA --repo "$repositorio"
echo "Chave criada e guardada nos Secrets de $repositorio."
