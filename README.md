# 🎨 Colorir

Jogo de pintar desenhos no navegador, sem anúncios e sem dependências.
HTML + CSS + JavaScript puro, sem build, total ~2,5 MB (cada desenho só é baixado quando aberto).

## Como funciona

- Toque/clique numa área para pintá-la com a cor escolhida.
- Arraste para mover; roda do mouse ou pinça (2 dedos) para zoom.
- Ctrl+Z / Ctrl+Y desfazem e refazem; `+`, `-` e `0` controlam o zoom.
- O progresso é salvo sozinho no navegador (localStorage), e o PNG pode ser baixado.
- "Abrir imagem…" pinta qualquer desenho do seu computador (esses não ficam salvos).

Por dentro (`js/pintura.js`): ao abrir, a imagem é dividida uma única vez em regiões
(áreas claras fechadas pelos traços). Pintar só troca a cor de uma região e redesenha
o retângulo dela, o que leva poucos milissegundos. A cor é multiplicada pela luminosidade
do traço, então as bordas ficam lisas. O progresso salvo é só uma lista `[região, cor]`.

## Rodar localmente

Precisa de um servidor HTTP (abrir o `index.html` direto pelo `file://` não funciona):

```bash
python3 -m http.server 8000
```

Depois abra http://localhost:8000.

## Adicionar desenhos

1. Coloque o PNG (traço preto sobre fundo branco, de preferência ≤ 1600 px) em `desenhos/<id>.png`.
2. Crie uma miniatura de ~320 px em `desenhos/mini/<id>.png`.
3. Adicione uma entrada em `desenhos/desenhos.json`:
   ```json
   { "id": "meu-desenho", "titulo": "Meu desenho", "categoria": "Animais", "fonte": "https://...", "licenca": "CC0" }
   ```

Dica: as áreas precisam ser **fechadas** pelos traços; se a linha tiver um buraco, a tinta "vaza".

### Onde achar desenhos livres

- [Wikimedia Commons, Coloring pages](https://commons.wikimedia.org/wiki/Category:Coloring_pages): filtre por domínio público/CC0
- [Openclipart](https://openclipart.org): tudo é CC0
- [FreeSVG](https://freesvg.org) e [Public Domain Vectors](https://publicdomainvectors.org): domínio público
- Livros de colorir do National Park Service (EUA): domínio público

## Créditos dos desenhos

Todos são domínio público ou CC0. As fontes estão no campo `fonte` de `desenhos/desenhos.json`.

## Publicar (GitHub Pages)

Envie para o GitHub e ative em *Settings → Pages → Deploy from branch → `main` / root*.
