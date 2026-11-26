// Motor de pintura por regiões.
//
// Ideia: ao carregar o desenho, a imagem é dividida uma única vez em
// "regiões" (áreas brancas fechadas pelas linhas). Pintar = trocar a cor
// de uma região. Isso deixa cada clique muito barato, e o progresso salvo
// é só uma lista curta de pares [região, cor].
//
// A cor final de cada pixel = cor da região × luminosidade do traço
// (efeito "multiply"), então as bordas anti-aliased dos traços ficam lisas.

const LIMIAR_TRACO = 150; // luminosidade abaixo disso conta como linha
const TAMANHO_MIN = 1000; // desenhos menores são ampliados até isso
const TAMANHO_MAX = 1600; // e maiores são reduzidos
const BRANCO = 0xffffff;

export class Pintura {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.desfazerPilha = [];
    this.refazerPilha = [];
    this.aoMudar = () => {};
  }

  async carregar(src) {
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
    await img.decode();

    const maior = Math.max(img.naturalWidth, img.naturalHeight);
    const escala = maior < TAMANHO_MIN ? TAMANHO_MIN / maior : maior > TAMANHO_MAX ? TAMANHO_MAX / maior : 1;
    const W = Math.round(img.naturalWidth * escala);
    const H = Math.round(img.naturalHeight * escala);

    const tmp = document.createElement('canvas');
    tmp.width = W;
    tmp.height = H;
    const tctx = tmp.getContext('2d', { willReadFrequently: true });
    tctx.fillStyle = '#fff';
    tctx.fillRect(0, 0, W, H);
    tctx.imageSmoothingQuality = 'high';
    tctx.drawImage(img, 0, 0, W, H);
    const px = tctx.getImageData(0, 0, W, H).data;

    const n = W * H;
    const lum = new Uint8Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      lum[i] = (px[j] * 77 + px[j + 1] * 150 + px[j + 2] * 29) >> 8;
    }

    this.W = W;
    this.H = H;
    this.lum = lum;
    this._rotular();

    this.canvas.width = W;
    this.canvas.height = H;
    this.saida = this.ctx.createImageData(W, H);
    this.desfazerPilha = [];
    this.refazerPilha = [];
    this._desenharTudo();
  }

  // Encontra as regiões (componentes conexos de pixels claros).
  _rotular() {
    const { W, H, lum } = this;
    const n = W * H;
    const rot = new Int32Array(n); // 0 = traço (sem região)
    const pilha = new Int32Array(n);
    const caixas = [0, 0, 0, 0]; // [x0,y0,x1,y1] por região; índice 0 não usado
    let total = 0;

    for (let s = 0; s < n; s++) {
      if (rot[s] || lum[s] < LIMIAR_TRACO) continue;
      const r = ++total;
      let x0 = W, y0 = H, x1 = 0, y1 = 0;
      let topo = 0;
      pilha[topo++] = s;
      rot[s] = r;
      while (topo) {
        const i = pilha[--topo];
        const x = i % W;
        const y = (i - x) / W;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
        if (x > 0 && !rot[i - 1] && lum[i - 1] >= LIMIAR_TRACO) { rot[i - 1] = r; pilha[topo++] = i - 1; }
        if (x < W - 1 && !rot[i + 1] && lum[i + 1] >= LIMIAR_TRACO) { rot[i + 1] = r; pilha[topo++] = i + 1; }
        if (y > 0 && !rot[i - W] && lum[i - W] >= LIMIAR_TRACO) { rot[i - W] = r; pilha[topo++] = i - W; }
        if (y < H - 1 && !rot[i + W] && lum[i + W] >= LIMIAR_TRACO) { rot[i + W] = r; pilha[topo++] = i + W; }
      }
      caixas.push(x0, y0, x1, y1);
    }

    // Expande as regiões 2px para dentro dos traços, cobrindo as bordas
    // anti-aliased (senão sobra um halo branco entre a cor e a linha).
    for (let passo = 0; passo < 2; passo++) {
      const antes = rot.slice();
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          if (antes[i]) continue;
          const r =
            (x > 0 && antes[i - 1]) ||
            (x < W - 1 && antes[i + 1]) ||
            (y > 0 && antes[i - W]) ||
            (y < H - 1 && antes[i + W]);
          if (r) {
            rot[i] = r;
            const k = r * 4;
            if (x < caixas[k]) caixas[k] = x;
            if (x > caixas[k + 2]) caixas[k + 2] = x;
            if (y < caixas[k + 1]) caixas[k + 1] = y;
            if (y > caixas[k + 3]) caixas[k + 3] = y;
          }
        }
      }
    }

    this.rot = rot;
    this.caixas = Int32Array.from(caixas);
    this.totalRegioes = total;
    this.cores = new Uint32Array(total + 1).fill(BRANCO);
  }

  _desenharTudo() {
    this._redesenhar(0, 0, this.W - 1, this.H - 1, -1);
  }

  // Recalcula os pixels dentro do retângulo. Se `so` >= 0, só os da região `so`.
  _redesenhar(x0, y0, x1, y1, so) {
    const { W, rot, lum, cores } = this;
    const d = this.saida.data;
    for (let y = y0; y <= y1; y++) {
      let i = y * W + x0;
      for (let x = x0; x <= x1; x++, i++) {
        const r = rot[i];
        if (so >= 0 && r !== so) continue;
        const l = lum[i];
        const c = r ? cores[r] : BRANCO;
        const j = i * 4;
        d[j] = (((c >> 16) & 255) * l) / 255;
        d[j + 1] = (((c >> 8) & 255) * l) / 255;
        d[j + 2] = ((c & 255) * l) / 255;
        d[j + 3] = 255;
      }
    }
    this.ctx.putImageData(this.saida, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  }

  // Região no ponto (x, y); se cair em cima de um traço, procura a mais próxima.
  regiaoEm(x, y) {
    const { W, H, rot } = this;
    x = Math.round(x);
    y = Math.round(y);
    for (let raio = 0; raio <= 4; raio++) {
      for (let dy = -raio; dy <= raio; dy++) {
        for (let dx = -raio; dx <= raio; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const r = rot[yy * W + xx];
          if (r) return r;
        }
      }
    }
    return 0;
  }

  _definirCor(r, cor) {
    this.cores[r] = cor;
    const k = r * 4;
    const c = this.caixas;
    this._redesenhar(c[k], c[k + 1], c[k + 2], c[k + 3], r);
  }

  pintar(x, y, cor) {
    const r = this.regiaoEm(x, y);
    if (!r || this.cores[r] === cor) return false;
    this.desfazerPilha.push([r, this.cores[r], cor]);
    if (this.desfazerPilha.length > 500) this.desfazerPilha.shift();
    this.refazerPilha.length = 0;
    this._definirCor(r, cor);
    this.aoMudar();
    return true;
  }

  desfazer() {
    const passo = this.desfazerPilha.pop();
    if (!passo) return;
    this.refazerPilha.push(passo);
    this._definirCor(passo[0], passo[1]);
    this.aoMudar();
  }

  refazer() {
    const passo = this.refazerPilha.pop();
    if (!passo) return;
    this.desfazerPilha.push(passo);
    this._definirCor(passo[0], passo[2]);
    this.aoMudar();
  }

  limpar() {
    this.cores.fill(BRANCO);
    this.desfazerPilha = [];
    this.refazerPilha = [];
    this._desenharTudo();
    this.aoMudar();
  }

  // Progresso compacto: só as regiões pintadas.
  exportarEstado() {
    const pintadas = [];
    for (let r = 1; r < this.cores.length; r++) {
      if (this.cores[r] !== BRANCO) pintadas.push(r, this.cores[r]);
    }
    return { v: 1, w: this.W, h: this.H, n: this.totalRegioes, p: pintadas };
  }

  importarEstado(e) {
    if (!e || e.w !== this.W || e.h !== this.H || e.n !== this.totalRegioes) return false;
    for (let k = 0; k < e.p.length; k += 2) this.cores[e.p[k]] = e.p[k + 1];
    this._desenharTudo();
    return true;
  }

  get temPintura() {
    return this.cores.some((c, i) => i > 0 && c !== BRANCO);
  }
}
