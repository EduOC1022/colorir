// De onde vêm os desenhos novos:
//  - pinturas famosas em domínio público, baixadas do Wikimedia Commons (rápido, alta resolução)
//  - mandalas coloridas geradas aqui mesmo no navegador (instantâneo, offline, sem limite)

const TAM = 1400; // lado maior guardado (mesmo tamanho de trabalho do jogo)

/* ---------------- Pinturas (Wikimedia Commons) ---------------- */

const API = 'https://commons.wikimedia.org/w/api.php';

export async function baixarPintura(arquivo) {
  // 1. pede ao Commons a URL de uma miniatura no tamanho certo
  const q = new URLSearchParams({
    action: 'query', format: 'json', origin: '*', prop: 'imageinfo',
    titles: `File:${arquivo}`, iiprop: 'url|size', iiurlwidth: '1920',
  });
  const info = await buscar(`${API}?${q}`).then((r) => r.json());
  const ii = Object.values(info.query.pages)[0]?.imageinfo?.[0];
  if (!ii) throw new Error(`pintura não encontrada: ${arquivo}`);
  // 2. baixa e reduz para o tamanho de trabalho
  const blob = await buscar(ii.thumburl || ii.url).then((r) => r.blob());
  return reduzir(blob);
}

// fetch com nova tentativa se o servidor pedir calma (429/503)
async function buscar(url, tentativas = 3) {
  const r = await fetch(url);
  if ((r.status === 429 || r.status === 503) && tentativas > 0) {
    await new Promise((ok) => setTimeout(ok, 4000));
    return buscar(url, tentativas - 1);
  }
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r;
}

async function reduzir(blob) {
  const bmp = await createImageBitmap(blob);
  const esc = Math.min(1, TAM / Math.max(bmp.width, bmp.height));
  const c = new OffscreenCanvas(Math.round(bmp.width * esc), Math.round(bmp.height * esc));
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
}

/* ---------------- Mandalas ---------------- */

const NOMES_COR = [
  [15, 'Vermelha'], [35, 'Coral'], [50, 'Laranja'], [65, 'Âmbar'], [80, 'Dourada'], [100, 'Limão'],
  [140, 'Verde'], [165, 'Esmeralda'], [185, 'Turquesa'], [205, 'Celeste'], [230, 'Azul'],
  [255, 'Índigo'], [275, 'Violeta'], [300, 'Roxa'], [325, 'Magenta'], [345, 'Rosa'], [361, 'Vermelha'],
];
const nomeDaCor = (h) => NOMES_COR.find(([lim]) => h < lim)[1];

function aleatorioCom(semente) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function criarPaleta(rnd) {
  const h = Math.floor(rnd() * 360);
  const esquemas = [
    { nome: 'Serena', matizes: [h, h + 25, h - 25, h + 50] },
    { nome: 'Vibrante', matizes: [h, h + 180, h + 20, h + 200] },
    { nome: 'Festiva', matizes: [h, h + 120, h + 240, h + 60] },
    { nome: 'Tropical', matizes: [h, h + 150, h + 210, h + 30] },
  ];
  const esq = esquemas[Math.floor(rnd() * esquemas.length)];
  const escura = rnd() < 0.35;
  const cores = [];
  for (const m of esq.matizes) {
    const mm = ((m % 360) + 360) % 360;
    cores.push(`hsl(${mm} ${60 + rnd() * 25}% ${escura ? 45 + rnd() * 15 : 40 + rnd() * 12}%)`);
    cores.push(`hsl(${mm} ${55 + rnd() * 30}% ${escura ? 65 + rnd() * 12 : 65 + rnd() * 15}%)`);
  }
  // embaralha mantendo pares claros/escuros espalhados
  for (let i = cores.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [cores[i], cores[j]] = [cores[j], cores[i]];
  }
  return {
    nome: `Mandala ${nomeDaCor(h)} ${escura ? 'Noturna' : esq.nome}`,
    fundo: escura ? `hsl(${h} 35% 13%)` : `hsl(${h} 45% 94%)`,
    linha: escura ? `hsl(${h} 30% 8%)` : 'hsl(25 30% 15%)',
    cores,
  };
}

// Desenha uma forma repetida `k` vezes ao redor do centro.
function repetir(ctx, k, desenhar) {
  for (let i = 0; i < k; i++) {
    ctx.save();
    ctx.rotate((i * 2 * Math.PI) / k);
    ctx.beginPath();
    desenhar();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

const FORMAS = {
  petalas(ctx, k, ri, re) {
    const meio = (ri + re) / 2, larg = Math.sin(Math.PI / k) * meio * 1.05;
    repetir(ctx, k, () => {
      ctx.moveTo(ri, 0);
      ctx.bezierCurveTo(meio, -larg, re - (re - ri) * 0.15, -larg * 0.5, re, 0);
      ctx.bezierCurveTo(re - (re - ri) * 0.15, larg * 0.5, meio, larg, ri, 0);
    });
  },
  pontas(ctx, k, ri, re) {
    const a = Math.PI / k;
    repetir(ctx, k, () => {
      ctx.moveTo(ri * Math.cos(-a), ri * Math.sin(-a));
      ctx.lineTo(re, 0);
      ctx.lineTo(ri * Math.cos(a), ri * Math.sin(a));
      ctx.arc(0, 0, ri, a, -a, true);
    });
  },
  arcos(ctx, k, ri, re) {
    const raio = Math.min((re - ri) * 0.9, Math.sin(Math.PI / k) * re);
    repetir(ctx, k, () => ctx.arc(ri + (re - ri) * 0.15, 0, raio, -Math.PI / 2, Math.PI / 2));
  },
  contas(ctx, k, ri, re) {
    const meio = (ri + re) / 2;
    const raio = Math.min((re - ri) * 0.42, Math.sin(Math.PI / k) * meio * 0.85);
    repetir(ctx, k, () => ctx.arc(meio, 0, raio, 0, Math.PI * 2));
  },
  losangos(ctx, k, ri, re) {
    const meio = (ri + re) / 2, larg = Math.sin(Math.PI / k) * meio * 0.8;
    repetir(ctx, k, () => {
      ctx.moveTo(ri, 0);
      ctx.lineTo(meio, -larg);
      ctx.lineTo(re, 0);
      ctx.lineTo(meio, larg);
      ctx.closePath();
    });
  },
};
// pétalas aparecem mais; cada anel sorteia uma destas formas
const TIPOS = ['petalas', 'petalas', 'pontas', 'contas', 'losangos', 'arcos', 'petalas'];

// Retorna { blob, titulo }. A mesma semente sempre gera a mesma mandala.
export async function gerarMandala(semente) {
  const rnd = aleatorioCom(semente);
  const escolher = (lista) => lista[Math.floor(rnd() * lista.length)];
  const p = criarPaleta(rnd);
  const c = new OffscreenCanvas(TAM, TAM);
  const ctx = c.getContext('2d');
  ctx.fillStyle = p.fundo;
  ctx.fillRect(0, 0, TAM, TAM);
  ctx.translate(TAM / 2, TAM / 2);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = p.linha;
  ctx.lineWidth = 3;

  const R = TAM * 0.47;
  const n = escolher([8, 10, 12, 12, 16]);
  // anéis de fora para dentro
  const aneis = [];
  for (let r = R; r > R * 0.12;) {
    const esp = R * (0.075 + rnd() * 0.07);
    aneis.push([Math.max(r - esp, R * 0.1), r]);
    r -= esp;
  }
  let ci = 0;
  const cor = () => p.cores[ci++ % p.cores.length];
  let anterior = '';
  for (const [idx, [ri, re]] of aneis.entries()) {
    // fundo do anel
    ctx.beginPath();
    ctx.arc(0, 0, re, 0, Math.PI * 2);
    ctx.fillStyle = cor();
    ctx.fill();
    ctx.stroke();
    // forma decorativa (sem repetir a do anel anterior)
    let tipo = escolher(TIPOS);
    if (tipo === anterior) tipo = escolher(TIPOS.filter((t) => t !== anterior));
    anterior = tipo;
    const k = tipo === 'contas' ? n * escolher([1, 2]) : n;
    ctx.fillStyle = cor();
    // gira metade do passo em anéis alternados, para intercalar as formas
    ctx.save();
    if (idx % 2) ctx.rotate(Math.PI / k);
    FORMAS[tipo](ctx, k, ri, re);
    if (tipo === 'petalas' && re - ri > R * 0.09) {
      ctx.fillStyle = cor();
      FORMAS.petalas(ctx, k, ri + (re - ri) * 0.25, re - (re - ri) * 0.2);
    }
    ctx.restore();
  }
  // miolo: flor
  const miolo = aneis.at(-1)[0];
  ctx.beginPath();
  ctx.arc(0, 0, miolo, 0, Math.PI * 2);
  ctx.fillStyle = cor();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = cor();
  FORMAS.petalas(ctx, n / 2, miolo * 0.25, miolo * 0.95);
  ctx.beginPath();
  ctx.arc(0, 0, miolo * 0.28, 0, Math.PI * 2);
  ctx.fillStyle = cor();
  ctx.fill();
  ctx.stroke();

  const blob = await c.convertToBlob({ type: 'image/webp', quality: 0.95 });
  return { blob, titulo: `${p.nome} nº ${semente % 1000}`, cores: p.cores.length + 3 };
}

/* ---------------- Miniatura sem cor ---------------- */

// Miniatura "sem cor" (só contorno das áreas), com o mesmo gerador do jogo.
export async function gerarContorno(blob, cores) {
  const bmp = await createImageBitmap(blob);
  const esc = TAM / Math.max(bmp.width, bmp.height);
  const W = Math.round(bmp.width * esc), H = Math.round(bmp.height * esc);
  const c = new OffscreenCanvas(W, H);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, W, H);
  bmp.close();
  const px = ctx.getImageData(0, 0, W, H).data;
  const { borda } = await new Promise((ok, falha) => {
    const w = new Worker(new URL('./numeros-worker.js', import.meta.url), { type: 'module' });
    w.onmessage = (e) => { ok(e.data); w.terminate(); };
    w.onerror = (e) => { falha(e); w.terminate(); };
    w.postMessage({ px, W, H, cores }, [px.buffer]);
  });
  const img = ctx.createImageData(W, H);
  const d = img.data;
  d.fill(255);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!borda[y * W + x]) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = (yy * W + xx) * 4;
      d[j] = d[j + 1] = d[j + 2] = 70;
    }
  }
  ctx.putImageData(img, 0, 0);
  const m = new OffscreenCanvas(Math.round(W * 0.24), Math.round(H * 0.24));
  const mctx = m.getContext('2d');
  mctx.imageSmoothingQuality = 'high';
  mctx.drawImage(c, 0, 0, m.width, m.height);
  return m.convertToBlob({ type: 'image/webp', quality: 0.8 });
}
