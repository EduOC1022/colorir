# 🎨 Colorir

Jogo de pintar no navegador, sem anúncios e sem dependências.
HTML + CSS + JavaScript puro, sem build. Cada imagem só é baixada quando aberta.

## Modos

**Colorir por números** (principal): a imagem colorida vira um quebra-cabeça.
Cada área tem um número; escolha a cor na paleta e toque nas áreas com aquele número.
Ao acertar, a área revela as cores originais da imagem.

- 💡 dica: dá zoom numa área que falta da cor escolhida
- os números aparecem conforme você dá zoom
- ao terminar uma cor, passa sozinho para a próxima

**Pintura livre**: desenhos preto e branco, pinte com qualquer cor (com desfazer/refazer).

Controles: arraste para mover; roda do mouse ou pinça (2 dedos) para zoom;
`+`, `-`, `0` para zoom pelo teclado. O progresso é salvo sozinho no navegador.
"Abrir imagem…" aceita qualquer imagem do computador: colorida vira colorir por números,
preto e branco vira pintura livre.

## Como funciona por dentro

- `js/numeros-gerador.js` (roda num Web Worker, ~0,3–0,5 s por imagem): k-means reduz a imagem a K cores,
  um filtro de maioria limpa pixels soltos, áreas pequenas ou finas demais são fundidas com a
  vizinha, e uma transformada de distância acha o melhor ponto para cada número.
  É determinístico: a mesma imagem sempre gera as mesmas áreas.
- `js/numeros.js`: desenha as áreas, revela a imagem original e põe os números numa camada
  separada no tamanho da tela (só os visíveis e legíveis).
- `js/pintura.js`: pintura livre por regiões fechadas pelos traços.
- Progresso salvo: um bitset em base64 (dezenas de bytes por imagem).

## Rodar localmente

```bash
python3 -m http.server 8000
```

Depois abra http://localhost:8000 (pelo `file://` não funciona).

## Adicionar imagens

### Colorir por números
1. Coloque a imagem em `numeros/` (JPG, PNG ou SVG; ~1000 px no lado maior).
2. Crie uma miniatura de ~320 px em `numeros/mini/` (para SVG pode usar o próprio arquivo).
3. Adicione em `numeros/numeros.json`:
   ```json
   { "id": "meu-id", "titulo": "Título", "arquivo": "meu-id.jpg", "mini": "mini/meu-id.jpg",
     "categoria": "Arte", "cores": 16, "fonte": "https://...", "licenca": "CC0" }
   ```
   `cores` = quantidade de cores (12–20 costuma ficar bom). Opcional: `minimo` = área mínima
   em pixels (padrão ~80); aumente para menos áreas e um jogo mais rápido.
4. Gere a miniatura "sem cor" (só contorno), que a galeria mostra até você começar a pintar
   (precisa de Node 18+ e GraphicsMagick):
   ```bash
   node ferramentas/gerar-contornos.mjs meu-id
   ```

Na galeria: imagem não começada aparece só com contorno; em andamento, mostra como você
deixou; completa, aparece colorida.

Imagens com cores chapadas (ilustrações, vetores) geram os melhores quebra-cabeças.

### Pintura livre
Coloque o PNG de traço preto em `desenhos/`, a miniatura em `desenhos/mini/` e uma entrada
em `desenhos/desenhos.json`.

### Onde achar imagens livres
- [Wikimedia Commons](https://commons.wikimedia.org): obras de arte antigas são domínio público
- [Openclipart](https://openclipart.org): tudo é CC0, ótimo para ilustrações coloridas
- [FreeSVG](https://freesvg.org) e [Public Domain Vectors](https://publicdomainvectors.org)
- No GitHub, só use repositórios com arquivo LICENSE que permita o uso (CC0, CC-BY, domínio público)

## Créditos

Todas as imagens são domínio público ou CC0. As fontes estão no campo `fonte` de
`numeros/numeros.json` e `desenhos/desenhos.json`. Gatinho, peixe, coruja e casinha
foram feitos para este projeto (CC0).

## Publicar (GitHub Pages)

*Settings → Pages → Deploy from branch → `main` / root* (repositório público).
