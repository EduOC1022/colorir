// Transforma uma imagem colorida num quebra-cabeça de "colorir por números".
// Usado pelo Web Worker do jogo e pelo script de miniaturas (ferramentas/).
//
// Etapas:
//  1. k-means reduz a imagem a K cores (determinístico: mesma imagem → mesmas áreas)
//  2. filtro de maioria suaviza pixels soltos
//  3. áreas pequenas demais são fundidas com a vizinha
//  4. rotula as áreas finais e acha o melhor ponto para o número
//     (o pixel mais distante da borda, via transformada de distância)

const LARGURA_MIN = 3; // px

export const minimoPadrao = (W, H) => Math.max(12, Math.round(W * H * 0.00008));

export function gerar(px, W, H, K = 16, minimo = minimoPadrao(W, H)) {
  const N = W * H;

  // --- 1. leve desfoque (só para agrupar cores; a exibição usa a imagem original)
  const rgb = new Uint8Array(N * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= W) continue;
          const j = (yy * W + xx) * 4;
          r += px[j]; g += px[j + 1]; b += px[j + 2]; n++;
        }
      }
      const i = (y * W + x) * 3;
      rgb[i] = r / n; rgb[i + 1] = g / n; rgb[i + 2] = b / n;
    }
  }

  // --- 2. k-means com amostragem e semente fixa
  let semente = 1234567;
  const aleatorio = () => ((semente = (semente * 1103515245 + 12345) >>> 0) / 4294967296);
  const passo = Math.max(1, Math.floor(N / 50000));
  const amostras = [];
  for (let i = 0; i < N; i += passo) amostras.push(i * 3);
  const S = amostras.length;
  const dist = (i, c) => {
    const dr = rgb[i] - c[0], dg = rgb[i + 1] - c[1], db = rgb[i + 2] - c[2];
    return 2 * dr * dr + 4 * dg * dg + 3 * db * db;
  };

  // k-means++
  let centros = [[...rgb.subarray(amostras[0], amostras[0] + 3)]];
  const dmin = new Float64Array(S).fill(Infinity);
  while (centros.length < K) {
    const c = centros[centros.length - 1];
    let soma = 0;
    for (let s = 0; s < S; s++) {
      const d = dist(amostras[s], c);
      if (d < dmin[s]) dmin[s] = d;
      soma += dmin[s];
    }
    if (soma === 0) break;
    let alvo = aleatorio() * soma, s = 0;
    while (s < S - 1 && (alvo -= dmin[s]) > 0) s++;
    centros.push([...rgb.subarray(amostras[s], amostras[s] + 3)]);
  }
  for (let it = 0; it < 12; it++) {
    const acc = centros.map(() => [0, 0, 0, 0]);
    for (let s = 0; s < S; s++) {
      const i = amostras[s];
      let melhor = 0, md = Infinity;
      for (let k = 0; k < centros.length; k++) {
        const d = dist(i, centros[k]);
        if (d < md) { md = d; melhor = k; }
      }
      const a = acc[melhor];
      a[0] += rgb[i]; a[1] += rgb[i + 1]; a[2] += rgb[i + 2]; a[3]++;
    }
    centros = acc.filter((a) => a[3]).map((a) => [a[0] / a[3], a[1] / a[3], a[2] / a[3]]);
  }
  const KC = centros.length;

  // atribui todos os pixels
  const idx = new Uint8Array(N);
  for (let p = 0, i = 0; p < N; p++, i += 3) {
    let melhor = 0, md = Infinity;
    for (let k = 0; k < KC; k++) {
      const d = dist(i, centros[k]);
      if (d < md) { md = d; melhor = k; }
    }
    idx[p] = melhor;
  }

  // --- 3. filtro de maioria: pixel com poucos vizinhos iguais vira a cor mais comum ao redor
  const viz = new Int32Array(8);
  for (let passe = 0; passe < 2; passe++) {
    const antes = idx.slice();
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const p = y * W + x, c = antes[p];
        let n = 0, iguais = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const v = antes[p + dy * W + dx];
          viz[n++] = v;
          if (v === c) iguais++;
        }
        if (iguais >= 3) continue;
        let melhor = c, mc = 0;
        for (let a = 0; a < 8; a++) {
          let cnt = 0;
          for (let b = 0; b < 8; b++) if (viz[b] === viz[a]) cnt++;
          if (cnt > mc) { mc = cnt; melhor = viz[a]; }
        }
        idx[p] = melhor;
      }
    }
  }

  // --- 4. funde áreas pequenas ou finas demais com a vizinha que mais faz fronteira.
  // "Largura" aproximada = 2 × área / perímetro; fiapos são ruins de tocar.
  let rot, total, area, primeiro;
  for (let passe = 0; passe < 10; passe++) {
    ({ rot, total, area } = rotular(idx, W, H));
    const perim = new Int32Array(total + 1);
    for (let p = 0; p < N; p++) {
      const r = rot[p], x = p % W;
      if (x < W - 1 && rot[p + 1] !== r) { perim[r]++; perim[rot[p + 1]]++; }
      if (p < N - W && rot[p + W] !== r) { perim[r]++; perim[rot[p + W]]++; }
    }
    const ruim = new Uint8Array(total + 1);
    for (let r = 1; r <= total; r++) {
      ruim[r] = area[r] < minimo || (area[r] < minimo * 30 && perim[r] && (2 * area[r]) / perim[r] < LARGURA_MIN) ? 1 : 0;
    }
    const pequenas = new Map();
    for (let p = 0; p < N; p++) {
      const r = rot[p];
      if (!ruim[r]) continue;
      const x = p % W;
      const vs = [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W];
      for (const q of vs) {
        if (q < 0 || q >= N || rot[q] === r) continue;
        let m = pequenas.get(r);
        if (!m) pequenas.set(r, (m = new Map()));
        const c = idx[q];
        // prefere vizinhas grandes
        m.set(c, (m.get(c) || 0) + (ruim[rot[q]] ? 1 : 4));
      }
    }
    if (!pequenas.size) break;
    const novaCor = new Int16Array(total + 1).fill(-1);
    for (const [r, m] of pequenas) {
      let melhor = -1, mc = 0;
      for (const [c, n] of m) if (n > mc) { mc = n; melhor = c; }
      novaCor[r] = melhor;
    }
    for (let p = 0; p < N; p++) {
      const c = novaCor[rot[p]];
      if (c >= 0) idx[p] = c;
    }
  }
  ({ rot, total, area, primeiro } = rotular(idx, W, H));

  // --- 5. numera as cores usadas, da mais escura para a mais clara
  const usadas = [...new Set(Array.from({ length: total }, (_, r) => idx[primeiro[r + 1]]))];
  const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  usadas.sort((a, b) => lum(centros[a]) - lum(centros[b]));
  const novoIndice = new Int16Array(KC).fill(-1);
  usadas.forEach((c, n) => (novoIndice[c] = n));
  const paleta = usadas.map((c) => centros[c].map(Math.round));

  const corDaRegiao = new Uint8Array(total + 1);
  const caixas = new Int32Array((total + 1) * 4);
  for (let r = 1; r <= total; r++) {
    caixas[r * 4] = W; caixas[r * 4 + 1] = H; caixas[r * 4 + 2] = 0; caixas[r * 4 + 3] = 0;
  }
  for (let p = 0; p < N; p++) {
    const r = rot[p], x = p % W, y = (p - x) / W, k = r * 4;
    corDaRegiao[r] = novoIndice[idx[p]];
    if (x < caixas[k]) caixas[k] = x;
    if (y < caixas[k + 1]) caixas[k + 1] = y;
    if (x > caixas[k + 2]) caixas[k + 2] = x;
    if (y > caixas[k + 3]) caixas[k + 3] = y;
  }

  // --- 6. bordas (linhas) e transformada de distância para posicionar os números
  const borda = new Uint8Array(N);
  const d = new Uint16Array(N);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x, r = rot[p];
      const ehBorda = (x < W - 1 && rot[p + 1] !== r) || (y < H - 1 && rot[p + W] !== r);
      if (ehBorda) borda[p] = 1;
      const limite = ehBorda || x === 0 || y === 0 || x === W - 1 || y === H - 1 ||
        rot[p - 1] !== r || rot[p - W] !== r;
      d[p] = limite ? 0 : 65535;
    }
  }
  // chamfer 3-4, ida e volta
  for (let y = 1; y < H; y++) for (let x = 1; x < W - 1; x++) {
    const p = y * W + x;
    if (!d[p]) continue;
    d[p] = Math.min(d[p], d[p - 1] + 3, d[p - W] + 3, d[p - W - 1] + 4, d[p - W + 1] + 4);
  }
  for (let y = H - 2; y >= 0; y--) for (let x = W - 2; x > 0; x--) {
    const p = y * W + x;
    if (!d[p]) continue;
    d[p] = Math.min(d[p], d[p + 1] + 3, d[p + W] + 3, d[p + W + 1] + 4, d[p + W - 1] + 4);
  }
  const rotulos = new Float32Array((total + 1) * 3); // x, y, raio (px)
  for (let p = 0; p < N; p++) {
    const r = rot[p], k = r * 3, raio = d[p] / 3;
    if (raio > rotulos[k + 2] || (!rotulos[k + 2] && !rotulos[k])) {
      rotulos[k] = p % W + 0.5;
      rotulos[k + 1] = Math.floor(p / W) + 0.5;
      rotulos[k + 2] = raio;
    }
  }

  return { rot, total, corDaRegiao, caixas, rotulos, borda, paleta };
}

// Componentes conexos (4-vizinhança) de pixels com o mesmo índice de cor.
function rotular(idx, W, H) {
  const N = W * H;
  const rot = new Int32Array(N);
  const pilha = new Int32Array(N);
  const area = [0];
  const primeiro = [0];
  let total = 0;
  for (let s = 0; s < N; s++) {
    if (rot[s]) continue;
    const r = ++total, c = idx[s];
    let topo = 0, n = 0;
    pilha[topo++] = s;
    rot[s] = r;
    while (topo) {
      const p = pilha[--topo];
      n++;
      const x = p % W;
      if (x > 0 && !rot[p - 1] && idx[p - 1] === c) { rot[p - 1] = r; pilha[topo++] = p - 1; }
      if (x < W - 1 && !rot[p + 1] && idx[p + 1] === c) { rot[p + 1] = r; pilha[topo++] = p + 1; }
      if (p >= W && !rot[p - W] && idx[p - W] === c) { rot[p - W] = r; pilha[topo++] = p - W; }
      if (p < N - W && !rot[p + W] && idx[p + W] === c) { rot[p + W] = r; pilha[topo++] = p + W; }
    }
    area.push(n);
    primeiro.push(s);
  }
  return { rot, total, area, primeiro };
}
