# 🎨 Colorir

Jogo de colorir por números no navegador, sem anúncios e sem dependências.
HTML + CSS + JavaScript puro, sem build. App instalável que funciona offline (PWA),
com tudo salvo no próprio navegador do usuário.

## Como jogar

Cada imagem vira um quebra-cabeça: cada área tem um número; escolha a cor na paleta e
toque nas áreas com aquele número. Ao acertar, a área revela as cores originais.

- 💡 dica: dá zoom numa área que falta da cor escolhida
- os números aparecem conforme você dá zoom; ao terminar uma cor, passa para a próxima
- arraste para mover; roda do mouse ou pinça (2 dedos) para zoom; `+`, `-`, `0` no teclado
- "Abrir imagem…" transforma qualquer imagem do computador em colorir por números

## De onde vêm os desenhos

- **Pinturas famosas** em domínio público (Van Gogh, Hokusai, Vermeer, Monet, Klimt,
  da Vinci...), baixadas do [Wikimedia Commons](https://commons.wikimedia.org) em boa
  resolução (1400 px). Lista em `pinturas/pinturas.json`. Para incluir outra, adicione o
  nome exato do arquivo no Commons (confira se é domínio público).
- **Mandalas coloridas** criadas pelo próprio app (`js/fontes.js`): simetria radial,
  paletas harmônicas, sem limite e funcionam offline.

"✨ Mais desenhos" acrescenta um lote de **10** (6 pinturas + 4 mandalas, intercaladas;
quando as pinturas acabam, só mandalas). Cada desenho aparece assim que fica pronto e o lote
inteiro leva cerca de **7–15 s**. O botão só fica disponível quando o lote anterior terminou.

### Por que não IA?
Testamos o Pollinations.ai (gratuito, sem chave): o limite é **1 imagem a cada ~45 s**,
ou seja, ~7,5 min para 10 desenhos. As pinturas do Commons levam 0,5–2 s cada e as mandalas
~0,15 s. Com uma chave paga de IA dá para voltar a gerar por IA (fonte separada em `js/fontes.js`).

## Seus desenhos e favoritos

- Limite de **100 desenhos sem pintar**.
- **⭐ Favoritos**: até **30** (pintados ou não), cada desenho uma vez só (sem cópias).
  Com 30, para guardar outro é preciso liberar um espaço, podendo baixar o desenho antes.
- Desenhos já pintados que não estão nos favoritos saem da lista quando você pede mais desenhos.
- Na grade: não começado aparece só com contorno; em andamento, como você deixou; completo, colorido.

## App instalável e offline (PWA)

- Tudo fica no navegador (IndexedDB), incluindo as imagens baixadas.
- `manifest.webmanifest` + ícones: dá para instalar (botão "Instalar app" ou menu do navegador).
- `sw.js` (service worker): o app abre offline.
- **Ao publicar uma mudança, aumente `VERSAO` em `sw.js`**: o app mostra "Nova versão disponível".

## Por dentro

- `js/acervo.js`: lotes, limites, favoritos e preparo dos desenhos; `js/bd.js`: IndexedDB
- `js/fontes.js`: download das pinturas, gerador de mandalas e miniatura de contorno
- `js/numeros-gerador.js` (num Web Worker, ~0,5–0,8 s por imagem): k-means reduz a imagem a
  K cores, filtro de maioria, fusão de áreas pequenas/finas e transformada de distância para
  posicionar os números. Determinístico: a mesma imagem sempre gera as mesmas áreas.
- `js/numeros.js`: o jogo; `js/pintura.js`: pintura livre (para desenhos preto e branco enviados)

## Rodar localmente

```bash
python3 -m http.server 8000
```

Depois abra http://localhost:8000.

## Publicar (GitHub Pages)

Repositório público → *Settings → Pages → Deploy from branch → `main` / root*.
