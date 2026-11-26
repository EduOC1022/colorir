// Regras do acervo de desenhos do usuário (tudo guardado no navegador).
//
// - Todos os desenhos são de colorir por números.
// - "Mais desenhos" acrescenta um lote: pinturas famosas (Wikimedia Commons) e mandalas
//   geradas no próprio app. Quando as pinturas acabam, vêm só mandalas.
// - Os desenhos novos aparecem na grade à medida que ficam prontos (~1–2 s cada).
// - No máximo 100 desenhos não pintados guardados.
// - Favoritos: no máximo 30, cada desenho uma vez só (sem cópias).
// - Desenhos pintados que NÃO são favoritos saem do acervo ao pedir mais desenhos.

import { bd } from './bd.js';
import { baixarPintura, gerarMandala, gerarContorno } from './fontes.js';

export const LOTE = 10;
export const PINTURAS_POR_LOTE = 6; // o resto do lote são mandalas
export const LIMITE_GUARDADOS = 100;
export const LIMITE_FAVORITOS = 30;
const ESQUEMA = 2; // ao mudar, o acervo antigo do usuário é apagado (reset)

const pintado = (r) => r.pct >= 100;
const ativo = (r) => r.status !== 'erro';

// "Impressão digital" do desenho: a mesma pintura, a mesma mandala ou a mesma imagem
// (pelo SHA-256 do conteúdo) contam como o mesmo desenho.
const digitalDe = (r) => r.hash || r.id;

async function resumo(blob) {
  const h = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class Acervo {
  constructor(pinturas) {
    this.pinturas = pinturas; // lista de pinturas famosas, em ordem
    this.aoMudar = () => {}; // (id) => void — um desenho mudou (ex.: ficou pronto)
    this.fila = [];
    this.lote = { total: 0, feitos: 0 }; // progresso do lote em preparo
  }

  // { feitos, total } do lote sendo preparado; total 0 = nada carregando.
  progressoLote() {
    const pendentes = this.fila.length + (this.atual ? 1 : 0);
    if (!pendentes) return { feitos: 0, total: 0 };
    const total = Math.max(this.lote.total, pendentes + this.lote.feitos);
    return { feitos: total - pendentes, total };
  }

  async iniciar() {
    if ((await bd.meta('esquema', 0)) !== ESQUEMA) {
      await bd.limpar();
      await bd.definirMeta('esquema', ESQUEMA);
    }
    const todos = await bd.todos();
    if (!todos.length) await this.outros();
    // retoma o que ficou pela metade (aba fechada no meio)
    for (const r of todos.sort((a, b) => a.criado - b.criado)) if (r.status === 'gerando') this._enfileirar(r.id);
  }

  // Todos os desenhos guardados, em ordem de chegada.
  async lista() {
    return (await bd.todos()).sort((a, b) => a.criado - b.criado);
  }

  async favoritos() {
    return (await bd.todos()).filter((r) => r.favorito && r.status === 'pronto').sort((a, b) => b.favoritadoEm - a.favoritadoEm);
  }

  async contagem() {
    const todos = (await bd.todos()).filter(ativo);
    return {
      guardados: todos.filter((r) => !pintado(r)).length, // inclui os que estão sendo preparados
      prontos: todos.filter((r) => !pintado(r) && r.status === 'pronto').length,
      favoritos: todos.filter((r) => r.favorito).length,
    };
  }

  // Dá para pedir mais agora? Não, se: chegou a 100, ainda está preparando o lote anterior,
  // ou está sem internet (as mandalas funcionam offline, então nesse caso pode).
  async podeGerar() {
    if (this.fila.length || this.atual) return false;
    const { guardados } = await this.contagem();
    return guardados < LIMITE_GUARDADOS;
  }

  // Acrescenta um lote (se ainda não chegou ao limite de 100 não pintados).
  async outros() {
    for (const r of await bd.todos()) {
      if ((pintado(r) && !r.favorito) || r.status === 'erro') await bd.apagar(r.id);
    }
    const { guardados } = await this.contagem();
    const vagas = Math.min(LOTE, LIMITE_GUARDADOS - guardados);
    if (vagas <= 0) return { novos: 0 };

    // pinturas já usadas e sementes de mandala: do registro salvo E dos desenhos existentes,
    // para nunca recriar (e sobrescrever) um desenho que já está no acervo
    const todos = await bd.todos();
    const usadas = new Set([
      ...(await bd.meta('pinturasUsadas', [])),
      ...todos.filter((r) => r.origem === 'pintura').map((r) => r.arquivo),
    ]);
    let semente = Math.max(
      await bd.meta('semente', Math.floor(Math.random() * 1e6)),
      ...todos.filter((r) => r.origem === 'mandala').map((r) => r.semente),
    );
    const restantes = navigator.onLine ? this.pinturas.filter((p) => !usadas.has(p.arquivo)) : [];
    const nPinturas = Math.min(restantes.length, PINTURAS_POR_LOTE, vagas);
    const novos = [];
    const base = Date.now();

    // intercala pinturas e mandalas no lote
    for (let i = 0, ip = 0; i < vagas; i++) {
      const querPintura = ip < nPinturas && (i % 2 === 0 || vagas - i <= nPinturas - ip);
      let rec;
      if (querPintura) {
        const p = restantes[ip++];
        usadas.add(p.arquivo);
        rec = { id: `pint:${p.arquivo}`, origem: 'pintura', arquivo: p.arquivo, titulo: p.titulo, autor: `${p.autor}, ${p.ano}`, cores: 16 };
      } else {
        semente++;
        rec = { id: `mand:${semente}`, origem: 'mandala', semente, titulo: 'Mandala' };
      }
      novos.push(Object.assign(rec, { modo: 'numeros', status: 'gerando', favorito: false, pct: 0, criado: base + i }));
    }
    // grava primeiro o que já foi usado, depois os desenhos (se a página fechar no meio, nada se repete)
    await bd.definirMeta('pinturasUsadas', [...usadas]);
    await bd.definirMeta('semente', semente);
    for (const rec of novos) if (!(await bd.obter(rec.id))) await bd.salvar(rec);
    this.lote = { total: novos.length, feitos: 0 };
    novos.forEach((r) => this._enfileirar(r.id));
    return { novos: novos.length };
  }

  _enfileirar(id) {
    if (!this.fila.includes(id) && this.atual !== id) this.fila.push(id);
    this._processar();
  }

  // Um por vez: cada desenho aparece assim que fica pronto.
  async _processar() {
    if (this.processando) return;
    this.processando = true;
    try {
      while (this.fila.length) {
        this.atual = this.fila.shift();
        await this._preparar(this.atual);
        this.atual = null;
        this.lote.feitos++;
        this.aoMudar();
      }
    } finally {
      this.processando = false;
      this.lote = { total: 0, feitos: 0 };
    }
  }

  async _preparar(id) {
    const rec = await bd.obter(id);
    if (!rec || rec.status !== 'gerando') return;
    try {
      let imagem, mudancas = {};
      if (rec.origem === 'pintura') imagem = await baixarPintura(rec.arquivo);
      else {
        const m = await gerarMandala(rec.semente);
        imagem = m.blob;
        mudancas = { titulo: m.titulo, cores: m.cores };
      }
      const cores = mudancas.cores || rec.cores;
      const contorno = await gerarContorno(imagem, cores);
      await bd.atualizar(id, { ...mudancas, imagem, contorno, hash: await resumo(imagem), status: 'pronto' });
    } catch (err) {
      console.warn('Falha ao preparar', id, err);
      const falhas = (rec.falhas || 0) + 1;
      if (falhas < 3 && navigator.onLine) {
        await bd.atualizar(id, { falhas }); // tenta de novo no fim da fila
        this.fila.push(id);
        return;
      }
      await bd.atualizar(id, { status: 'erro' }); // desiste: fica escondido e libera a vaga
    }
  }

  // Cada desenho entra uma vez só nos favoritos — nem cópias do mesmo desenho.
  // Retorna 'ok', 'cheio' (30 favoritos) ou 'repetido' (o mesmo desenho já está lá).
  async favoritar(id) {
    const todos = await bd.todos();
    const rec = todos.find((r) => r.id === id);
    if (!rec) return 'repetido';
    if (rec.favorito) return 'ok';
    const digital = digitalDe(rec);
    if (todos.some((r) => r.favorito && r.id !== id && digitalDe(r) === digital)) return 'repetido';
    if (todos.filter((r) => r.favorito && ativo(r)).length >= LIMITE_FAVORITOS) return 'cheio';
    await bd.atualizar(id, { favorito: true, favoritadoEm: Date.now() });
    navigator.storage?.persist?.(); // pede ao navegador para não apagar os dados
    return 'ok';
  }

  async desfavoritar(id) {
    await bd.atualizar(id, { favorito: false });
  }

  async salvarProgresso(id, { estado, pct, retrato }) {
    await bd.atualizar(id, { estado, pct, retrato, pintadoEm: Date.now() });
  }

  // Imagem do computador do usuário: entra no acervo. Se a mesma imagem já
  // estiver lá, abre a existente em vez de criar uma cópia.
  async adicionarArquivo(blob, titulo, modo) {
    const hash = await resumo(blob);
    const existente = (await bd.todos()).find((r) => r.hash === hash);
    if (existente) return existente;
    const rec = {
      id: `arq:${Date.now()}`, origem: 'arquivo', modo, titulo, imagem: blob, hash, cores: 16,
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
