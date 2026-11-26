// Gera as miniaturas "sem cor" (só o contorno das áreas) da galeria.
// Usa o mesmo gerador do jogo. Requer Node 18+ e GraphicsMagick (gm).
//
//   node ferramentas/gerar-contornos.mjs            # todas
//   node ferramentas/gerar-contornos.mjs gato peixe # só algumas
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gerar } from '../js/numeros-gerador.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const GM = process.env.GM || 'gm';
const TAM = 1000;     // mesmo tamanho de trabalho do jogo
const MINI = 320;     // tamanho da miniatura

const lista = JSON.parse(readFileSync(join(raiz, 'numeros/numeros.json'), 'utf8'));
const so = process.argv.slice(2);
const tmp = mkdtempSync(join(tmpdir(), 'contornos-'));

try {
  for (const item of lista) {
    if (so.length && !so.includes(item.id)) continue;
    const src = join(raiz, 'numeros', item.arquivo);
    const png = join(tmp, 'base.png');
    execFileSync(GM, ['convert', src, '-background', 'white', '-flatten', '-resize', `${TAM}x${TAM}`, png]);
    const [W, H] = execFileSync(GM, ['identify', '-format', '%w %h', png]).toString().trim().split(' ').map(Number);
    const px = new Uint8ClampedArray(execFileSync(GM, ['convert', png, '-depth', '8', 'rgba:-'], { maxBuffer: 64 << 20 }));

    const { borda, total } = gerar(px, W, H, item.cores, item.minimo);

    // traço com 3 px para continuar visível depois de reduzir
    const cinza = Buffer.alloc(W * H, 255);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!borda[y * W + x]) continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H) cinza[yy * W + xx] = 70;
      }
    }
    const saida = join(raiz, 'numeros/contorno', `${item.id}.png`);
    execFileSync(GM, ['convert', '-size', `${W}x${H}`, '-depth', '8', 'gray:-', '-resize', `${MINI}x${MINI}`, '-colors', '8', saida], { input: cinza });
    console.log(`${item.id}: ${total} áreas → numeros/contorno/${item.id}.png`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
