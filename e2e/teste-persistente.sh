#!/usr/bin/env bash
# Teste de ponta a ponta num emulador: joga, escolhe a pasta, desinstala, reinstala e
# confere se o progresso voltou da pasta Documents.
set -euo pipefail

APK=${1:?caminho do APK}
PACOTE=io.github.iapetec.codexlab_teste
ARQUIVO=/sdcard/Documents/progresso-$PACOTE.json
mkdir -p e2e/saida

tela() {
    adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || true
    adb pull /sdcard/ui.xml e2e/saida/ui.xml >/dev/null 2>&1 || true
}

tem_texto() {
    tela
    python3 - "$1" <<'EOF'
import re, sys, xml.etree.ElementTree as ET
alvo = sys.argv[1].lower()
try:
    raiz = ET.parse('e2e/saida/ui.xml').getroot()
except (OSError, ET.ParseError):
    sys.exit(1)
textos = [(n.get('text') or '') + ' ' + (n.get('content-desc') or '') for n in raiz.iter('node')]
sys.exit(0 if any(alvo in t.lower() for t in textos) else 1)
EOF
}

centro_de() {
    tela
    python3 - "$1" <<'EOF'
import re, sys, xml.etree.ElementTree as ET
alvo = sys.argv[1].lower()
try:
    raiz = ET.parse('e2e/saida/ui.xml').getroot()
except (OSError, ET.ParseError):
    sys.exit(1)
# Só o que está visível na tela (fora da tela o Android informa tamanho zero).
nos = [n for n in raiz.iter('node')
       if (lambda a, b, c, d: c > a and d > b)(*map(int, re.findall(r'\d+', n.get('bounds') or '[0,0][0,0]')))]
def texto(n):
    return ((n.get('text') or '') + ' ' + (n.get('content-desc') or '')).strip().lower()
# Primeiro o texto exato (botão "Allow"), só depois o que começa igual (título "Allow ... ?").
for criterio in (lambda t: t == alvo, lambda t: t.startswith(alvo)):
    for n in nos:
        if criterio(texto(n)):
            a, b, c, d = map(int, re.findall(r'\d+', n.get('bounds')))
            print((a + c) // 2, (b + d) // 2)
            sys.exit(0)
sys.exit(1)
EOF
}

esperar_texto() {
    local texto=$1 limite=${2:-60}
    for _ in $(seq "$limite"); do
        if tem_texto "$texto"; then return 0; fi
        sleep 1
    done
    echo "FALHOU: não apareceu na tela: $texto" >&2
    adb exec-out screencap -p > "e2e/saida/falha-$(date +%s).png" || true
    cp e2e/saida/ui.xml "e2e/saida/falha-$(date +%s).xml" || true
    return 1
}

tocar() {
    local alvo=$1 limite=${2:-30} posicao=""
    for tentativa in $(seq "$limite"); do
        if posicao=$(centro_de "$alvo"); then
            # shellcheck disable=SC2086
            adb shell input tap $posicao
            return 0
        fi
        # A cada 3 tentativas, rola a tela para baixo: o botão pode estar fora da vista.
        if [ $((tentativa % 3)) -eq 0 ]; then adb shell input swipe 160 500 160 200 300; fi
        sleep 1
    done
    echo "FALHOU: não achei para tocar: $alvo" >&2
    adb exec-out screencap -p > "e2e/saida/falha-toque.png" || true
    return 1
}

escolher_documents() {
    tocar "Escolher pasta para guardar o progresso"
    tocar "Use this folder" 40
    tocar "Allow" 20
}

abrir_app() {
    adb shell am force-stop "$PACOTE" || true
    adb shell monkey -p "$PACOTE" -c android.intent.category.LAUNCHER 1 >/dev/null
}

# Logo depois do boot a memória compartilhada ainda pode não estar montada.
for _ in $(seq 60); do adb shell test -d /sdcard/Download && break; sleep 2; done
adb shell mkdir -p /sdcard/Documents
adb shell rm -f "$ARQUIVO"
adb install -r "$APK"

echo "== 1. abre o jogo (WebView carregou os arquivos do APK)"
abrir_app
esperar_texto "Teste CodexLab" 90
esperar_texto "Escolher pasta para guardar o progresso"

echo "== 2. joga uma partida"
tocar "Jogar"
posicao=$(for _ in $(seq 20); do centro_de "Toque!" && break; sleep 1; done)
for _ in $(seq 12); do
    # shellcheck disable=SC2086
    adb shell input tap $posicao
done
esperar_texto "Pontuação salva!" 30
tela
pontos=$(python3 - <<'EOF'
import re, xml.etree.ElementTree as ET
raiz = ET.parse('e2e/saida/ui.xml').getroot()
textos = ' '.join((n.get('text') or '') for n in raiz.iter('node'))
m = re.search(r'Melhor: (\d+)', textos)
print(m.group(1) if m else '0')
EOF
)
echo "pontos da partida: $pontos"
test "$pontos" -gt 0

echo "== 3. escolhe a pasta Documents e o arquivo é criado"
escolher_documents
esperar_texto "Progresso guardado na pasta Documents" 30
adb shell cat "$ARQUIVO" | tee e2e/saida/arquivo-antes.json
grep -q "\"melhor\": *$pontos" e2e/saida/arquivo-antes.json || grep -q "\"melhor\":$pontos" e2e/saida/arquivo-antes.json

echo "== 4. desinstala: o arquivo continua no celular"
adb uninstall "$PACOTE"
adb shell ls -l "$ARQUIVO"

echo "== 5. reinstala: começa zerado até escolher a pasta"
adb install "$APK"
abrir_app
esperar_texto "Melhor: 0" 90

echo "== 6. escolhe a mesma pasta e o progresso volta"
escolher_documents
esperar_texto "Progresso antigo encontrado e recuperado!" 30
esperar_texto "Melhor: $pontos" 10
adb exec-out screencap -p > e2e/saida/recuperado.png

echo "== 7. sem erros de JavaScript"
# Só o console da WebView (tag chromium); o resto do log é do próprio Android.
adb logcat -d -s chromium:V | grep -iE "CONSOLE.*(Uncaught|Error)" | tee e2e/saida/erros-js.txt || true
test ! -s e2e/saida/erros-js.txt
echo "TUDO CERTO: progresso de $pontos pontos sobreviveu à desinstalação."
