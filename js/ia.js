// Geração de desenhos por IA.
// Usa o Pollinations.ai (gratuito, sem chave, com CORS liberado). O plano gratuito
// libera 1 imagem a cada ~45 s por internet; a fila do acervo respeita isso.
// Para trocar de serviço, basta reescrever `gerarImagem` mantendo a mesma assinatura.

const TEMAS = [
  ['Raposa', 'a cute fox'], ['Gatinho', 'a playful kitten'], ['Cachorrinho', 'a happy puppy'],
  ['Coruja', 'an owl on a branch'], ['Panda', 'a panda eating bamboo'], ['Leão', 'a friendly lion'],
  ['Elefante', 'a baby elephant'], ['Girafa', 'a giraffe'], ['Tartaruga', 'a sea turtle swimming'],
  ['Baleia', 'a whale in the ocean'], ['Polvo', 'a smiling octopus'], ['Peixinhos', 'tropical fish and coral'],
  ['Borboleta', 'a colorful butterfly on flowers'], ['Joaninha', 'a ladybug on a leaf'], ['Abelha', 'a bee and a sunflower'],
  ['Papagaio', 'a parrot on a branch'], ['Flamingo', 'a flamingo in a lake'], ['Pinguim', 'a penguin on ice'],
  ['Coelho', 'a bunny in a garden'], ['Esquilo', 'a squirrel with an acorn'], ['Ouriço', 'a hedgehog with mushrooms'],
  ['Dinossauro', 'a friendly dinosaur'], ['Dragão', 'a cute little dragon'], ['Unicórnio', 'a unicorn with a rainbow'],
  ['Sereia', 'a mermaid tail and seashells'], ['Castelo', 'a fairy tale castle'], ['Foguete', 'a rocket in space with planets'],
  ['Astronauta', 'an astronaut floating among stars'], ['Robô', 'a friendly robot'], ['Balão', 'a hot air balloon over hills'],
  ['Farol', 'a lighthouse by the sea'], ['Casinha', 'a cozy cottage with a garden'], ['Montanhas', 'mountains and a lake at sunset'],
  ['Praia', 'a beach with palm trees'], ['Floresta', 'a forest with a river'], ['Fazenda', 'a farm with a red barn'],
  ['Cidade', 'a small colorful town'], ['Trem', 'a steam train in the countryside'], ['Barco', 'a sailboat on the sea'],
  ['Carro antigo', 'a vintage car'], ['Bicicleta', 'a bicycle with a flower basket'], ['Flores', 'a bouquet of flowers in a vase'],
  ['Girassóis', 'sunflowers in a field'], ['Cacto', 'cacti in pots'], ['Cogumelos', 'mushrooms in the forest'],
  ['Frutas', 'a basket of fruits'], ['Cupcake', 'cupcakes and sweets'], ['Sorvete', 'an ice cream cone'],
  ['Pizza', 'a pizza with toppings'], ['Café', 'a cup of coffee and croissant'], ['Bolo', 'a birthday cake'],
  ['Mandala', 'a symmetrical floral mandala'], ['Vitral', 'a stained glass rose window'], ['Arco-íris', 'a rainbow with clouds and sun'],
  ['Lua e estrelas', 'the moon and stars at night'], ['Aquário', 'a fish bowl with a goldfish'], ['Cavalo', 'a horse in a meadow'],
  ['Vaquinha', 'a cow in a field'], ['Sapo', 'a frog on a lily pad'], ['Caracol', 'a snail in the garden'],
];

const ESTILO = {
  numeros: 'flat vector illustration, simple large shapes, bold solid colors, no gradients, no shadows, no text, centered, plain light background',
  livre: 'black and white coloring book page, thick clean black outlines, no shading, no color, no text, white background',
};

const TAM = 768;
const MARCA = 56; // faixa de baixo cortada (marca d'água do serviço)

export function escolherTema(semente) {
  return TEMAS[semente % TEMAS.length];
}

export async function gerarImagem({ en, modo, semente }) {
  const prompt = `${en}, ${ESTILO[modo]}`;
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
    `?width=${TAM}&height=${TAM + MARCA}&seed=${semente}&nologo=true`;
  const resp = await fetch(url);
  if (resp.status === 402 || resp.status === 429) {
    // plano gratuito: 1 imagem a cada ~45 s por internet; o serviço diz quanto esperar
    const texto = await resp.text().catch(() => '');
    const s = Number(texto.match(/after (\d+)\s*s/i)?.[1]) || 45;
    throw Object.assign(new Error('limite da IA'), { esperar: (s + 2) * 1000 });
  }
  if (!resp.ok || !resp.headers.get('content-type')?.startsWith('image/')) throw new Error(`IA respondeu ${resp.status}`);
  const bmp = await createImageBitmap(await resp.blob());
  const c = new OffscreenCanvas(bmp.width, bmp.height - MARCA);
  c.getContext('2d').drawImage(bmp, 0, 0);
  bmp.close();
  return c.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
}

// Miniatura "sem cor" (só contorno das áreas), gerada no navegador com o mesmo gerador do jogo.
export async function gerarContorno(blob, cores) {
  const bmp = await createImageBitmap(blob);
  const esc = 1000 / Math.max(bmp.width, bmp.height);
  const W = Math.round(bmp.width * esc), H = Math.round(bmp.height * esc);
  const c = new OffscreenCanvas(W, H);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
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
  const m = new OffscreenCanvas(Math.round(W * 0.32), Math.round(H * 0.32));
  const mctx = m.getContext('2d');
  mctx.imageSmoothingQuality = 'high';
  mctx.drawImage(c, 0, 0, m.width, m.height);
  return m.convertToBlob({ type: 'image/webp', quality: 0.8 });
}
