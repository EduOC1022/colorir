// Web Worker: roda o gerador fora da thread principal para não travar a tela.
import { gerar } from './numeros-gerador.js';

self.onmessage = (e) => {
  const { px, W, H, cores, minimo } = e.data;
  const r = gerar(px, W, H, cores, minimo);
  self.postMessage(r, [r.rot.buffer, r.corDaRegiao.buffer, r.caixas.buffer, r.rotulos.buffer, r.borda.buffer]);
};
