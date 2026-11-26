import { Pintura } from './pintura.js';
import { Numeros } from './numeros.js';

const $ = (id) => document.getElementById(id);

const PALETA_LIVRE = [
  '#000000', '#5b5b5b', '#a3a3a3', '#ffffff',
  '#7f1d1d', '#dc2626', '#f87171', '#fecaca',
  '#9a3412', '#f97316', '#fdba74', '#ffedd5',
  '#a16207', '#facc15', '#fde047', '#fef9c3',
  '#14532d', '#16a34a', '#4ade80', '#bbf7d0',
  '#134e4a', '#0d9488', '#5eead4', '#ccfbf1',
  '#1e3a8a', '#2563eb', '#60a5fa', '#dbeafe',
  '#4c1d95', '#7c3aed', '#a78bfa', '#ede9fe',
  '#831843', '#db2777', '#f472b6', '#fce7f3',
  '#5c3a1e', '#8b5a2b', '#d2a679', '#f1dcc4',
];
const BORRACHA = '#ffffff';
const LIVRE = 'Pintura livre';

const hexParaInt = (h) => parseInt(h.slice(1), 16);
const chave = (d) => (d.modo === 'numeros' ? `colorir:n:${d.id}` : `colorir:${d.id}`);

let itens = [];
let atual = null; // item aberto: { id, modo, titulo, src, salvar, cores? }
let corLivre = '#f97316';
let recentes = JSON.parse(localStorage.getItem('colorir:recentes') || '[]');

const canvas = $('tela');
const sob = $('sobreposicao');
const livre = new Pintura(canvas);
const numeros = new Numeros(canvas, sob);
const motor = () => (atual?.modo === 'numeros' ? numeros : livre);

/* ---------------- Galeria ---------------- */

async function iniciar() {
  const [n, d] = await Promise.all([
    fetch('numeros/numeros.json').then((r) => r.json()),
    fetch('desenhos/desenhos.json').then((r) => r.json()),
  ]);
  itens = [
    ...n.map((x) => ({ ...x, modo: 'numeros', src: `numeros/${x.arquivo}`, mini: `numeros/${x.mini}`, rota: `n/${x.id}` })),
    ...d.map((x) => ({ ...x, modo: 'livre', categoria: LIVRE, src: `desenhos/${x.id}.png`, mini: `desenhos/mini/${x.id}.png`, rota: `d/${x.id}` })),
  ];
  montarFiltros();
  montarGaleria('Todos');
  window.addEventListener('hashchange', rotear);
  rotear();
}

function filtroAtivo() {
  return $('filtros').querySelector('[aria-pressed="true"]')?.textContent || 'Todos';
}

function montarFiltros() {
  const cats = ['Todos', ...new Set(itens.map((d) => d.categoria))];
  const nav = $('filtros');
  nav.replaceChildren(
    ...cats.map((c) => {
      const b = document.createElement('button');
      b.textContent = c;
      b.setAttribute('aria-pressed', c === 'Todos');
      b.onclick = () => {
        nav.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b));
        montarGaleria(c);
      };
      return b;
    }),
  );
}

function montarGaleria(categoria) {
  const lista = categoria === 'Todos' ? itens : itens.filter((d) => d.categoria === categoria);
  $('galeria').replaceChildren(
    ...lista.map((d) => {
      const a = document.createElement('a');
      a.className = 'cartao';
      a.href = `#/${d.rota}`;
      a.innerHTML = `<img loading="lazy" decoding="async" alt=""><span></span>`;
      a.querySelector('img').src = d.mini;
      a.querySelector('span').textContent = d.titulo;
      const salvo = localStorage.getItem(chave(d));
      if (salvo) {
        const selo = document.createElement('span');
        const pct = d.modo === 'numeros' ? JSON.parse(salvo).pct : null;
        selo.className = 'selo';
        selo.textContent = pct >= 100 ? '✓ pronto' : pct != null ? `${pct}%` : 'continuar';
        a.append(selo);
      }
      return a;
    }),
  );
}

// Imagem do computador: colorida → por números; preto e branco → pintura livre.
$('arquivo').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const src = URL.createObjectURL(f);
  const modo = (await ehColorida(src)) ? 'numeros' : 'livre';
  history.pushState(null, '', '#/arquivo');
  abrir({ id: null, modo, titulo: f.name.replace(/\.[^.]+$/, ''), src, salvar: false });
});

async function ehColorida(src) {
  const img = new Image();
  img.src = src;
  await img.decode();
  const c = new OffscreenCanvas(64, 64);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, 64, 64);
  const d = ctx.getImageData(0, 0, 64, 64).data;
  let sat = 0;
  for (let i = 0; i < d.length; i += 4) {
    const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
    sat += mx ? (mx - mn) / mx : 0;
  }
  return sat / 4096 > 0.12;
}

/* ---------------- Navegação ---------------- */

function rotear() {
  const rota = location.hash.slice(2);
  const item = itens.find((x) => x.rota === decodeURIComponent(rota));
  if (item) abrir({ ...item, salvar: true });
  else if (rota === 'arquivo' && atual && !atual.salvar) {
    /* continua no arquivo enviado */
  } else mostrarGaleria();
}

function mostrarGaleria() {
  salvarAgora();
  atual = null;
  $('tela-pintura').hidden = true;
  $('tela-galeria').hidden = false;
  document.title = 'Colorir';
  montarGaleria(filtroAtivo());
}

async function abrir(item) {
  if (atual && atual.src === item.src) return;
  salvarAgora();
  atual = item;
  const tela = $('tela-pintura');
  tela.classList.toggle('modo-numeros', item.modo === 'numeros');
  tela.classList.toggle('modo-livre', item.modo === 'livre');
  $('tela-galeria').hidden = true;
  tela.hidden = false;
  $('fim').hidden = true;
  $('titulo').textContent = item.titulo;
  document.title = `${item.titulo} · Colorir`;
  $('carregando').hidden = false;
  $('cores').replaceChildren();
  limparSobreposicao();
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r)));
  try {
    if (item.modo === 'numeros') await numeros.carregar(item.src, { cores: item.cores, minimo: item.minimo });
    else await livre.carregar(item.src);
    if (atual !== item) return; // usuário saiu durante o carregamento
    const salvo = item.salvar && localStorage.getItem(chave(item));
    if (salvo) motor().importarEstado(JSON.parse(salvo));
  } catch (err) {
    console.error(err);
    alert('Não consegui abrir essa imagem.');
    location.hash = '';
    return;
  } finally {
    if (item.salvar === false) URL.revokeObjectURL(item.src);
    $('carregando').hidden = true;
  }
  if (item.modo === 'numeros') montarPaletaNumerada();
  else montarPaletaLivre();
  ajustarZoom();
  atualizarBotoes();
}

$('voltar').onclick = () => {
  if (history.length > 1 && location.hash) history.back();
  else location.hash = '';
};

/* ---------------- Salvar progresso ---------------- */

let timerSalvar = 0;
livre.aoMudar = numeros.aoMudar = () => {
  atualizarBotoes();
  clearTimeout(timerSalvar);
  timerSalvar = setTimeout(salvarAgora, 400);
};

function salvarAgora() {
  clearTimeout(timerSalvar);
  if (!atual || !atual.salvar) return;
  const m = motor();
  if (!m.rot) return;
  const k = chave(atual);
  if (atual.modo === 'numeros') {
    const p = numeros.progresso;
    if (p > 0) localStorage.setItem(k, JSON.stringify({ ...numeros.exportarEstado(), pct: Math.floor(p * 100) }));
    else localStorage.removeItem(k);
  } else if (livre.temPintura) localStorage.setItem(k, JSON.stringify(livre.exportarEstado()));
  else localStorage.removeItem(k);
}
window.addEventListener('pagehide', salvarAgora);

function atualizarBotoes() {
  if (atual?.modo === 'numeros') {
    $('progresso').firstElementChild.style.width = `${numeros.progresso * 100}%`;
  } else {
    $('desfazer').disabled = !livre.desfazerPilha.length;
    $('refazer').disabled = !livre.refazerPilha.length;
  }
}

/* ---------------- Paleta: por números ---------------- */

function montarPaletaNumerada() {
  const cont = $('cores');
  cont.className = 'cores numerada';
  const totais = numeros.porCor.map((l) => l.length);
  cont.replaceChildren(
    ...numeros.paleta.map(([r, g, b], i) => {
      const bt = document.createElement('button');
      bt.className = 'num';
      bt.dataset.i = i;
      bt.setAttribute('aria-label', `Cor ${i + 1}`);
      const claro = 0.299 * r + 0.587 * g + 0.114 * b > 150;
      bt.innerHTML = `<b style="background:rgb(${r},${g},${b});color:${claro ? '#222' : '#fff'}"><span>${i + 1}</span></b>`;
      bt.onclick = () => selecionarNumero(i);
      bt.total = totais[i];
      return bt;
    }),
  );
  numeros.porCor.forEach((_, i) => atualizarCor(i));
  const primeira = numeros.faltam.findIndex((n) => n > 0);
  selecionarNumero(primeira < 0 ? 0 : primeira, true);
  if (numeros.completo) $('fim').hidden = false;
}

function atualizarCor(i) {
  const bt = $('cores').children[i];
  if (!bt) return;
  const feitas = bt.total - numeros.faltam[i];
  bt.style.setProperty('--p', bt.total ? (feitas / bt.total) * 100 : 100);
  bt.classList.toggle('completa', numeros.faltam[i] === 0);
}

function selecionarNumero(i, forcar) {
  if (!forcar && numeros.selecionada === i) return;
  numeros.selecionar(i);
  for (const b of $('cores').children) b.setAttribute('aria-pressed', String(b.dataset.i == i));
  $('cores').children[i]?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  agendarNumeros();
}

numeros.aoAcertar = (cor) => {
  atualizarCor(cor);
  if (numeros.faltam[cor] === 0) {
    if (numeros.completo) {
      salvarAgora();
      ajustarZoom();
      setTimeout(() => ($('fim').hidden = false), 300);
    } else {
      // passa para a próxima cor que ainda falta
      const n = numeros.paleta.length;
      for (let k = 1; k <= n; k++) {
        const j = (cor + k) % n;
        if (numeros.faltam[j] > 0) { selecionarNumero(j); break; }
      }
    }
  }
};

$('dica').onclick = () => {
  const d = numeros.acharDica();
  if (!d) return;
  if (numeros.corDaRegiao[d.r] !== numeros.selecionada) selecionarNumero(numeros.corDaRegiao[d.r]);
  const r = visor.getBoundingClientRect();
  const raio = numeros.rotulos[d.r * 3 + 2];
  const s = Math.min(vista.max, Math.max(vista.s, 22 / Math.max(raio, 1)));
  vista.s = s;
  vista.x = r.width / 2 - d.x * s;
  vista.y = r.height / 2 - d.y * s;
  aplicarVista();
};

$('fim-fechar').onclick = () => ($('fim').hidden = true);
$('fim-baixar').onclick = () => $('baixar').click();

/* ---------------- Paleta: livre ---------------- */

function botaoCor(hex, borracha) {
  const b = document.createElement('button');
  b.className = 'cor' + (borracha ? ' borracha' : '');
  if (!borracha) b.style.background = hex;
  b.dataset.cor = hex;
  b.title = borracha ? 'Borracha' : hex;
  b.setAttribute('aria-label', b.title);
  b.onclick = () => escolherCorLivre(hex, b);
  return b;
}

function montarPaletaLivre() {
  const cont = $('cores');
  cont.className = 'cores';
  cont.replaceChildren(...PALETA_LIVRE.map((h) => botaoCor(h)), botaoCor(BORRACHA, true));
  montarRecentes();
  escolherCorLivre(corLivre);
}

function montarRecentes() {
  $('recentes').replaceChildren(...recentes.map((h) => botaoCor(h)));
}

function escolherCorLivre(hex, botao) {
  corLivre = hex;
  document.querySelectorAll('.cor').forEach((b) => b.setAttribute('aria-pressed', 'false'));
  (botao || document.querySelector(`#cores .cor[data-cor="${hex}"]:not(.borracha)`))?.setAttribute('aria-pressed', 'true');
}

$('cor-livre').addEventListener('input', (e) => escolherCorLivre(e.target.value));
$('cor-livre').addEventListener('change', (e) => {
  const h = e.target.value;
  if (PALETA_LIVRE.includes(h)) return;
  recentes = [h, ...recentes.filter((x) => x !== h)].slice(0, 10);
  localStorage.setItem('colorir:recentes', JSON.stringify(recentes));
  montarRecentes();
  escolherCorLivre(h, $('recentes').firstChild);
});

/* ---------------- Ações ---------------- */

$('desfazer').onclick = () => livre.desfazer();
$('refazer').onclick = () => livre.refazer();
$('limpar').onclick = () => {
  if (!confirm('Recomeçar este desenho do zero?')) return;
  if (atual?.modo === 'numeros') {
    numeros.reiniciar();
    montarPaletaNumerada();
    agendarNumeros();
  } else livre.limpar();
};
$('baixar').onclick = () => {
  canvas.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(atual?.titulo || 'desenho').replace(/[^\p{L}\p{N}-]+/gu, '-')}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, 'image/png');
};

document.addEventListener('keydown', (e) => {
  if ($('tela-pintura').hidden) return;
  const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (atual?.modo === 'livre' && ctrl && k === 'z' && !e.shiftKey) { e.preventDefault(); livre.desfazer(); }
  else if (atual?.modo === 'livre' && ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); livre.refazer(); }
  else if (k === '+' || k === '=') zoomNoCentro(1.25);
  else if (k === '-') zoomNoCentro(0.8);
  else if (k === '0') ajustarZoom();
  else if (k === 'escape') $('voltar').click();
});

/* ---------------- Zoom e arrastar ---------------- */
// O canvas fica no tamanho real da imagem; a visualização usa transform CSS.
// Os números são desenhados numa camada separada, no tamanho da tela.

const visor = $('visor');
const vista = { s: 1, x: 0, y: 0, min: 0.1, max: 8 };
let quadro = 0;

function agendarNumeros() {
  if (quadro || atual?.modo !== 'numeros') return;
  quadro = requestAnimationFrame(() => {
    quadro = 0;
    const animando = numeros.desenharNumeros(vista, devicePixelRatio || 1);
    if (animando) agendarNumeros();
  });
}

function limparSobreposicao() {
  sob.getContext('2d').clearRect(0, 0, sob.width, sob.height);
}

function aplicarVista() {
  canvas.style.transform = `translate(${vista.x}px, ${vista.y}px) scale(${vista.s})`;
  agendarNumeros();
}

function ajustarZoom() {
  const m = motor();
  if (!m.W) return;
  const r = visor.getBoundingClientRect();
  const dpr = devicePixelRatio || 1;
  sob.width = Math.round(r.width * dpr);
  sob.height = Math.round(r.height * dpr);
  const margem = 16;
  const s = Math.min((r.width - margem * 2) / m.W, (r.height - margem * 2) / m.H);
  vista.s = s;
  vista.min = s * 0.5;
  vista.max = Math.max(8, s * 20);
  vista.x = (r.width - m.W * s) / 2;
  vista.y = (r.height - m.H * s) / 2;
  aplicarVista();
}

function zoomEm(px, py, fator) {
  const s = Math.min(vista.max, Math.max(vista.min, vista.s * fator));
  vista.x = px - ((px - vista.x) * s) / vista.s;
  vista.y = py - ((py - vista.y) * s) / vista.s;
  vista.s = s;
  aplicarVista();
}

function zoomNoCentro(fator) {
  const r = visor.getBoundingClientRect();
  zoomEm(r.width / 2, r.height / 2, fator);
}

$('zoom-mais').onclick = () => zoomNoCentro(1.4);
$('zoom-menos').onclick = () => zoomNoCentro(1 / 1.4);
$('zoom-ajustar').onclick = ajustarZoom;
window.addEventListener('resize', () => { if (!$('tela-pintura').hidden) ajustarZoom(); });

visor.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = visor.getBoundingClientRect();
  zoomEm(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
}, { passive: false });

// Ponteiros: 1 dedo/mouse = toque (pinta) ou arrastar (move); 2 dedos = pinça.
const ponteiros = new Map();
let gesto = null;

visor.addEventListener('pointerdown', (e) => {
  if (!$('fim').hidden) return;
  try { visor.setPointerCapture(e.pointerId); } catch { /* ponteiro já encerrado */ }
  ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ponteiros.size === 1) {
    gesto = { tipo: 'toque', x0: e.clientX, y0: e.clientY, vx: vista.x, vy: vista.y, outroBotao: e.button !== 0 };
  } else if (ponteiros.size === 2) {
    const [a, b] = [...ponteiros.values()];
    gesto = { tipo: 'pinca', dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  }
});

visor.addEventListener('pointermove', (e) => {
  if (!ponteiros.has(e.pointerId) || !gesto) return;
  ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (gesto.tipo === 'pinca' && ponteiros.size >= 2) {
    const [a, b] = [...ponteiros.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    const r = visor.getBoundingClientRect();
    vista.x += cx - gesto.cx;
    vista.y += cy - gesto.cy;
    zoomEm(cx - r.left, cy - r.top, dist / gesto.dist);
    gesto.dist = dist; gesto.cx = cx; gesto.cy = cy;
  } else if (gesto.tipo === 'toque' || gesto.tipo === 'mover') {
    const dx = e.clientX - gesto.x0, dy = e.clientY - gesto.y0;
    if (gesto.tipo === 'toque' && Math.hypot(dx, dy) > 8) gesto.tipo = 'mover';
    if (gesto.tipo === 'mover') {
      vista.x = gesto.vx + dx;
      vista.y = gesto.vy + dy;
      aplicarVista();
    }
  }
});

function tocar(clientX, clientY) {
  const m = motor();
  const r = canvas.getBoundingClientRect();
  const x = ((clientX - r.left) / r.width) * m.W;
  const y = ((clientY - r.top) / r.height) * m.H;
  if (x < 0 || y < 0 || x >= m.W || y >= m.H) return;
  if (atual.modo === 'numeros') {
    const res = numeros.tocar(x, y);
    if (res === 'certo') agendarNumeros();
    else if (res === 'errado') {
      navigator.vibrate?.(40);
      const bt = $('cores').children[numeros.selecionada];
      bt?.classList.remove('tremer');
      void bt?.offsetWidth;
      bt?.classList.add('tremer');
    }
  } else livre.pintar(x, y, hexParaInt(corLivre));
}

function soltar(e) {
  if (!ponteiros.has(e.pointerId)) return;
  ponteiros.delete(e.pointerId);
  if (gesto?.tipo === 'toque' && !gesto.outroBotao && e.type === 'pointerup') tocar(e.clientX, e.clientY);
  if (ponteiros.size === 0) gesto = null;
  else if (gesto?.tipo === 'pinca') {
    const p = [...ponteiros.values()][0];
    gesto = { tipo: 'mover', x0: p.x, y0: p.y, vx: vista.x, vy: vista.y };
  }
}
visor.addEventListener('pointerup', soltar);
visor.addEventListener('pointercancel', soltar);
visor.addEventListener('contextmenu', (e) => e.preventDefault());

// ?debug expõe os motores no console, para testes
if (location.search.includes('debug')) Object.assign(globalThis, { numeros, livre, vista });

iniciar();
