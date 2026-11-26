// Jogo de colorir por números.
// A imagem colorida é dividida em áreas (no worker). Cada área mostra um número;
// quando o jogador toca com a cor certa, a área revela os pixels originais.

const TAM = 1400; // lado maior de trabalho (boa resolução para as pinturas)
const COR_LINHA = [110, 110, 110];
const COR_DESTAQUE = [200, 200, 200];
const COR_DESTAQUE2 = [225, 225, 225];

export class Numeros {
  constructor(canvas, sobreposicao) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sob = sobreposicao; // canvas dos números, no tamanho da tela
    this.sctx = sobreposicao.getContext('2d');
    this.selecionada = 0;
    this.aoMudar = () => {};
    this.aoAcertar = () => {};
    this.dica = null;
  }

  async carregar(src, { cores = 16, minimo } = {}) {
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
    await img.decode();
    const w0 = img.naturalWidth || TAM, h0 = img.naturalHeight || TAM;
    const esc = TAM / Math.max(w0, h0);
    const W = Math.round(w0 * esc), H = Math.round(h0 * esc);

    const tmp = new OffscreenCanvas(W, H);
    const t = tmp.getContext('2d', { willReadFrequently: true });
    t.fillStyle = '#fff';
    t.fillRect(0, 0, W, H);
    t.imageSmoothingQuality = 'high';
    t.drawImage(img, 0, 0, W, H);
    const original = t.getImageData(0, 0, W, H).data;

    const dados = await new Promise((ok, falha) => {
      const w = new Worker(new URL('./numeros-worker.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => { ok(e.data); w.terminate(); };
      w.onerror = (e) => { falha(e); w.terminate(); };
      const px = original.slice();
      w.postMessage({ px, W, H, cores, minimo }, [px.buffer]);
    });

    Object.assign(this, dados, { W, H, original });
    this.feitas = new Uint8Array(this.total + 1);
    // quantas áreas faltam por cor
    this.faltam = new Int32Array(this.paleta.length);
    for (let r = 1; r <= this.total; r++) this.faltam[this.corDaRegiao[r]]++;
    // áreas de cada cor (para redesenhar destaque rápido)
    this.porCor = this.paleta.map(() => []);
    for (let r = 1; r <= this.total; r++) this.porCor[this.corDaRegiao[r]].push(r);

    this.canvas.width = W;
    this.canvas.height = H;
    this.saida = this.ctx.createImageData(W, H);
    this.selecionada = 0;
    this._redesenhar(0, 0, W - 1, H - 1, 0);
  }

  _pixel(p, r, d) {
    const j = p * 4;
    let c;
    if (this.feitas[r]) {
      d[j] = this.original[j]; d[j + 1] = this.original[j + 1]; d[j + 2] = this.original[j + 2];
      d[j + 3] = 255;
      return;
    }
    if (this.borda[p]) c = COR_LINHA;
    else if (this.corDaRegiao[r] === this.selecionada) {
      // padrão quadriculado leve, como nos apps do gênero
      const x = p % this.W, y = (p - x) / this.W;
      c = ((x >> 2) + (y >> 2)) & 1 ? COR_DESTAQUE : COR_DESTAQUE2;
    } else c = null;
    if (c) { d[j] = c[0]; d[j + 1] = c[1]; d[j + 2] = c[2]; }
    else { d[j] = d[j + 1] = d[j + 2] = 255; }
    d[j + 3] = 255;
  }

  // Redesenha o retângulo; se `so` > 0, só os pixels da região `so`.
  _redesenhar(x0, y0, x1, y1, so) {
    const { W, rot } = this;
    const d = this.saida.data;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0, p = y * W + x0; x <= x1; x++, p++) {
        const r = rot[p];
        if (so && r !== so) continue;
        this._pixel(p, r, d);
      }
    }
    this.ctx.putImageData(this.saida, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  }

  _redesenharRegiao(r) {
    const k = r * 4, c = this.caixas;
    this._redesenhar(c[k], c[k + 1], c[k + 2], c[k + 3], r);
  }

  selecionar(cor) {
    if (cor === this.selecionada) return;
    const antiga = this.selecionada;
    this.selecionada = cor;
    for (const r of this.porCor[antiga]) if (!this.feitas[r]) this._redesenharRegiao(r);
    for (const r of this.porCor[cor]) if (!this.feitas[r]) this._redesenharRegiao(r);
  }

  regiaoEm(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return 0;
    return this.rot[y * this.W + x];
  }

  // Retorna 'certo', 'errado' ou null (já pintada / fora).
  tocar(x, y) {
    const r = this.regiaoEm(x, y);
    if (!r || this.feitas[r]) return null;
    if (this.corDaRegiao[r] !== this.selecionada) return 'errado';
    this._marcar(r);
    this.aoMudar();
    this.aoAcertar(this.corDaRegiao[r]);
    return 'certo';
  }

  _marcar(r) {
    this.feitas[r] = 1;
    this.faltam[this.corDaRegiao[r]]--;
    this._redesenharRegiao(r);
    if (this.dica && this.dica.r === r) this.dica = null;
  }

  get completo() {
    return this.faltam.every((n) => n === 0);
  }

  get progresso() {
    let f = 0;
    for (let r = 1; r <= this.total; r++) f += this.feitas[r];
    return f / this.total;
  }

  // Maior área ainda não pintada da cor selecionada (ou de qualquer cor).
  acharDica() {
    let melhor = 0, mr = -1;
    const busca = (lista) => {
      for (const r of lista) {
        if (this.feitas[r]) continue;
        const raio = this.rotulos[r * 3 + 2];
        if (raio > mr) { mr = raio; melhor = r; }
      }
    };
    busca(this.porCor[this.selecionada]);
    if (!melhor) this.porCor.forEach(busca);
    if (!melhor) return null;
    const k = melhor * 3;
    this.dica = { r: melhor, x: this.rotulos[k], y: this.rotulos[k + 1], t: performance.now() };
    return this.dica;
  }

  reiniciar() {
    this.feitas.fill(0);
    this.faltam.fill(0);
    for (let r = 1; r <= this.total; r++) this.faltam[this.corDaRegiao[r]]++;
    this._redesenhar(0, 0, this.W - 1, this.H - 1, 0);
    this.aoMudar();
  }

  // Progresso salvo como bitset em base64 (poucas centenas de bytes).
  exportarEstado() {
    const bytes = new Uint8Array(Math.ceil((this.total + 1) / 8));
    for (let r = 1; r <= this.total; r++) if (this.feitas[r]) bytes[r >> 3] |= 1 << (r & 7);
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return { v: 1, n: this.total, k: this.paleta.length, b: btoa(s) };
  }

  importarEstado(e) {
    if (!e || e.n !== this.total || e.k !== this.paleta.length) return false;
    const s = atob(e.b);
    for (let r = 1; r <= this.total; r++) {
      if (s.charCodeAt(r >> 3) & (1 << (r & 7))) {
        this.feitas[r] = 1;
        this.faltam[this.corDaRegiao[r]]--;
      }
    }
    this._redesenhar(0, 0, this.W - 1, this.H - 1, 0);
    return true;
  }

  // Desenha os números na sobreposição, já no espaço da tela.
  // Só desenha os visíveis e grandes o bastante para ler — com zoom aparecem mais.
  desenharNumeros(vista, dpr) {
    const { sob, sctx: c } = this;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, sob.width, sob.height);
    if (!this.rot) return;
    const larg = sob.width / dpr, alt = sob.height / dpr;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const { s, x: vx, y: vy } = vista;
    let fonteAtual = '';
    for (let r = 1; r <= this.total; r++) {
      if (this.feitas[r]) continue;
      const k = r * 3;
      const raioTela = this.rotulos[k + 2] * s;
      const tam = Math.min(raioTela * 1.15, 30);
      if (tam < 7) continue;
      const x = this.rotulos[k] * s + vx, y = this.rotulos[k + 1] * s + vy;
      if (x < -30 || y < -30 || x > larg + 30 || y > alt + 30) continue;
      const sel = this.corDaRegiao[r] === this.selecionada;
      const f = `${sel ? 700 : 500} ${Math.round(tam)}px system-ui, sans-serif`;
      if (f !== fonteAtual) { c.font = f; fonteAtual = f; }
      c.fillStyle = sel ? '#222' : '#777';
      c.fillText(String(this.corDaRegiao[r] + 1), x, y);
    }
    // anel pulsante da dica
    if (this.dica) {
      const t = (performance.now() - this.dica.t) / 1000;
      if (t > 2.5) this.dica = null;
      else {
        const x = this.dica.x * s + vx, y = this.dica.y * s + vy;
        const raio = 18 + 14 * Math.abs(Math.sin(t * 4));
        c.lineWidth = 4;
        c.strokeStyle = 'rgba(249,115,22,.9)';
        c.beginPath();
        c.arc(x, y, raio, 0, Math.PI * 2);
        c.stroke();
        return true; // pede outro quadro de animação
      }
    }
    return false;
  }
}
