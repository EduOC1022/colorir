// Banco local no navegador (IndexedDB) — sem servidor.
// "desenhos": cada desenho do usuário (imagem gerada fica guardada como Blob)
// "meta": pequenos valores (lote atual, cursor, catálogo já usado...)

const NOME = 'colorir';
const VERSAO = 1;
let conexao;

function abrir() {
  return (conexao ??= new Promise((ok, falha) => {
    const r = indexedDB.open(NOME, VERSAO);
    r.onupgradeneeded = () => {
      const db = r.result;
      db.createObjectStore('desenhos', { keyPath: 'id' });
      db.createObjectStore('meta', { keyPath: 'k' });
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => falha(r.error);
  }));
}

async function tx(loja, modo, fn) {
  const db = await abrir();
  return new Promise((ok, falha) => {
    const t = db.transaction(loja, modo);
    const req = fn(t.objectStore(loja));
    t.oncomplete = () => ok(req && 'result' in req ? req.result : undefined);
    t.onerror = () => falha(t.error);
    t.onabort = () => falha(t.error);
  });
}

export const bd = {
  obter: (id) => tx('desenhos', 'readonly', (s) => s.get(id)),
  todos: () => tx('desenhos', 'readonly', (s) => s.getAll()),
  salvar: (rec) => tx('desenhos', 'readwrite', (s) => void s.put(rec)),
  apagar: (id) => tx('desenhos', 'readwrite', (s) => void s.delete(id)),
  // lê e grava na mesma transação, para não sobrescrever mudanças de outro lugar
  atualizar: (id, mudancas) =>
    tx('desenhos', 'readwrite', (s) => {
      const r = s.get(id);
      r.onsuccess = () => r.result && s.put({ ...r.result, ...mudancas });
    }),
  meta: async (k, padrao) => (await tx('meta', 'readonly', (s) => s.get(k)))?.v ?? padrao,
  definirMeta: (k, v) => tx('meta', 'readwrite', (s) => void s.put({ k, v })),
};
