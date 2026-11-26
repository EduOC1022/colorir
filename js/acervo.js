// Regras do acervo de desenhos do usuário (tudo guardado no navegador).
//
// - A tela "Para pintar" mostra todos os desenhos guardados, em ordem de chegada.
// - "Mais desenhos" acrescenta 10: primeiro os do catálogo do app, depois gerados por IA.
// - No máximo 100 desenhos não pintados guardados. Ao chegar em 100, não gera mais:
//   continuam na tela os que já existem e ainda não foram pintados.
// - Favoritos: no máximo 30 (pintados ou não). Para favoritar mais, é preciso liberar um.
// - Desenhos pintados que NÃO são favoritos saem do acervo ao pedir outros desenhos.

import { bd } from './bd.js';
import { escolherTema, gerarImagem, gerarContorno } from './ia.js';

export const LOTE = 10;
export const LIMITE_GUARDADOS = 100;
export const LIMITE_FAVORITOS = 30;
const INTERVALO_IA = 46000; // plano gratuito da IA: 1 imagem a cada ~45 s
const PROPORCAO_LIVRE = 5; // 1 em cada 5 gerados é para pintura livre

const pintado = (r) => r.pct >= 100;
const ativo = (r) => r.status !== 'erro';

export class Acervo {
  constructor(catalogo) {
    this.catalogo = catalogo; // itens fixos do app, em ordem
    this.aoMudar = () => {}; // (id) => void — um desenho mudou (ex.: terminou de gerar)
    this.fila = [];
  }

  async iniciar() {
    const todos = await bd.todos();
    if (!todos.length) await this.outros();
    // retoma gerações interrompidas (aba fechada no meio), na ordem em que foram pedidas
    for (const r of todos.sort((a, b) => a.criado - b.criado)) if (r.status === 'gerando') this._enfileirar(r.id);
  }

  // Todos os desenhos guardados, em ordem de chegada.
  async lista() {
    return (await bd.todos()).sort((a, b) => a.criado - b.criado);
  }

  async favoritos() {
    return (await bd.todos()).filter((r) => r.favorito).sort((a, b) => b.favoritadoEm - a.favoritadoEm);
  }

  async contagem() {
    const todos = (await bd.todos()).filter(ativo);
    return {
      guardados: todos.filter((r) => !pintado(r)).length,
      favoritos: todos.filter((r) => r.favorito).length,
    };
  }

  // Acrescenta até 10 desenhos novos (se ainda não chegou ao limite de 100 não pintados).
  async outros() {
    // limpa pintados não favoritos e falhas
    for (const r of await bd.todos()) {
      if ((pintado(r) && !r.favorito) || r.status === 'erro') await bd.apagar(r.id);
    }
    const todos = await bd.todos();
    const guardados = todos.filter((r) => !pintado(r)).length;
    let vagas = Math.min(LOTE, LIMITE_GUARDADOS - guardados);
    const novos = [];

    // 1. catálogo do app que ainda não entrou
    const usados = new Set(await bd.meta('catalogoUsado', []));
    for (const item of this.catalogo) {
      if (vagas <= 0) break;
      if (usados.has(item.id)) continue;
      const rec = { ...item, origem: 'catalogo', status: 'pronto', favorito: false, pct: 0, criado: Date.now() + novos.length };
      await bd.salvar(rec);
      usados.add(item.id);
      novos.push(rec.id);
      vagas--;
    }
    await bd.definirMeta('catalogoUsado', [...usados]);

    // 2. IA (precisa de internet)
    if (vagas > 0 && navigator.onLine) {
      let semente = await bd.meta('semente', Math.floor(Math.random() * 1e6));
      for (; vagas > 0; vagas--) {
        semente++;
        const [titulo, en] = escolherTema(semente);
        const modo = semente % PROPORCAO_LIVRE === 0 ? 'livre' : 'numeros';
        const rec = {
          id: `ia:${semente}`, origem: 'ia', modo, titulo, en, semente, cores: 12,
          status: 'gerando', favorito: false, pct: 0, criado: Date.now() + novos.length,
        };
        await bd.salvar(rec);
        novos.push(rec.id);
        this._enfileirar(rec.id);
      }
      await bd.definirMeta('semente', semente);
    }

    return { novos: novos.length, semInternet: !navigator.onLine };
  }

  _enfileirar(id) {
    if (!this.fila.includes(id) && this.atual !== id) this.fila.push(id);
    this._processar();
  }

  // Posição na fila: 0 = sendo criado agora; 1, 2... = aguardando; -1 = fora da fila.
  posicaoNaFila(id) {
    if (this.atual === id) return 0;
    const i = this.fila.indexOf(id);
    return i < 0 ? -1 : i + 1;
  }

  // Uma geração por vez, respeitando o intervalo do plano gratuito (também entre recargas da página).
  async _processar() {
    if (this.processando) return;
    this.processando = true;
    try {
      while (this.fila.length) {
        const ultima = Number(localStorage.getItem('colorir:iaUltima')) || 0;
        const espera = ultima + INTERVALO_IA - Date.now();
        if (espera > 0) await new Promise((r) => setTimeout(r, espera));
        this.atual = this.fila.shift();
        this.aoMudar(this.atual);
        localStorage.setItem('colorir:iaUltima', String(Date.now()));
        await this._gerar(this.atual);
        this.atual = null;
      }
    } finally {
      this.processando = false;
    }
  }

  async _gerar(id, tentativas = 4) {
    const rec = await bd.obter(id);
    if (!rec || rec.status !== 'gerando') return;
    try {
      const imagem = await gerarImagem(rec);
      const contorno = rec.modo === 'numeros' ? await gerarContorno(imagem, rec.cores) : null;
      await bd.atualizar(id, { imagem, contorno, status: 'pronto' });
    } catch (err) {
      if (err.esperar && tentativas > 0) {
        localStorage.setItem('colorir:iaUltima', String(Date.now() + err.esperar - INTERVALO_IA));
        await new Promise((r) => setTimeout(r, err.esperar));
        return this._gerar(id, tentativas - 1);
      }
      console.warn('Falha ao gerar', id, err);
      await bd.atualizar(id, { status: 'erro' });
    }
    this.aoMudar(id);
  }

  async tentarDeNovo(id) {
    await bd.atualizar(id, { status: 'gerando' });
    this._enfileirar(id);
  }

  // Retorna true, ou false se os favoritos estão cheios.
  async favoritar(id) {
    const { favoritos } = await this.contagem();
    if (favoritos >= LIMITE_FAVORITOS) return false;
    await bd.atualizar(id, { favorito: true, favoritadoEm: Date.now() });
    navigator.storage?.persist?.(); // pede ao navegador para não apagar os dados
    return true;
  }

  async desfavoritar(id) {
    await bd.atualizar(id, { favorito: false });
  }

  async salvarProgresso(id, { estado, pct, retrato }) {
    await bd.atualizar(id, { estado, pct, retrato, pintadoEm: Date.now() });
  }

  // Imagem do computador do usuário: entra no acervo.
  async adicionarArquivo(blob, titulo, modo) {
    const rec = {
      id: `arq:${Date.now()}`, origem: 'arquivo', modo, titulo, imagem: blob, cores: 16,
      status: 'pronto', favorito: false, pct: 0, criado: Date.now(),
    };
    if (modo === 'numeros') rec.contorno = await gerarContorno(blob, 16).catch(() => null);
    await bd.salvar(rec);
    return rec;
  }

  obter(id) {
    return bd.obter(id);
  }
}
