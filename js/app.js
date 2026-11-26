import { Pintura } from './pintura.js';

const $ = (id) => document.getElementById(id);

const PALETA = [
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

const hexParaInt = (h) => parseInt(h.slice(1), 16);
const chave = (id) => `colorir:${id}`;

let desenhos = [];
let atual = null; // { id, titulo, salvar: bool }
let corAtual = '#f97316';
let recentes = JSON.parse(localStorage.getItem('colorir:recentes') || '[]');

const pintura = new Pintura($('tela'));

/* ---------------- Galeria ---------------- */

async function iniciar() {
  desenhos = await fetch('desenhos/desenhos.json').then((r) => r.json());
  montarFiltros();
  montarGaleria('Todos');
  montarPaleta();
  window.addEventListener('hashchange', rotear);
  rotear();
}

function montarFiltros() {
  const cats = ['Todos', ...new Set(desenhos.map((d) => d.categoria))];
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
  const lista = categoria === 'Todos' ? desenhos : desenhos.filter((d) => d.categoria === categoria);
  $('galeria').replaceChildren(
    ...lista.map((d) => {
      const a = document.createElement('a');
      a.className = 'cartao';
      a.href = `#/d/${d.id}`;
      a.innerHTML = `<img loading="lazy" decoding="async" alt="" src="desenhos/mini/${d.id}.png"><span></span>`;
      a.querySelector('span').textContent = d.titulo;
      if (localStorage.getItem(chave(d.id))) {
        const selo = document.createElement('span');
        selo.className = 'selo';
        selo.textContent = 'continuar';
        a.append(selo);
      }
      return a;
    }),
  );
}

$('arquivo').addEventListener('change', (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const url = URL.createObjectURL(f);
  abrir({ id: null, titulo: f.name.replace(/\.[^.]+$/, ''), src: url, salvar: false }).finally(() =>
    URL.revokeObjectURL(url),
  );
  history.pushState(null, '', '#/arquivo');
});

/* ---------------- Navegação ---------------- */

function rotear() {
  const m = location.hash.match(/^#\/d\/(.+)$/);
  const d = m && desenhos.find((x) => x.id === decodeURIComponent(m[1]));
  if (d) {
    abrir({ id: d.id, titulo: d.titulo, src: `desenhos/${d.id}.png`, salvar: true });
  } else if (location.hash === '#/arquivo' && atual && !atual.salvar) {
    // continua no desenho enviado
  } else {
    mostrarGaleria();
  }
}

function mostrarGaleria() {
  salvarAgora();
  atual = null;
  $('tela-pintura').hidden = true;
  $('tela-galeria').hidden = false;
  const ativo = $('filtros').querySelector('[aria-pressed="true"]');
  montarGaleria(ativo ? ativo.textContent : 'Todos');
}

async function abrir(desenho) {
  if (atual && atual.src === desenho.src) return;
  salvarAgora();
  atual = desenho;
  $('tela-galeria').hidden = true;
  $('tela-pintura').hidden = false;
  $('titulo').textContent = desenho.titulo;
  document.title = `${desenho.titulo} · Colorir`;
  $('carregando').hidden = false;
  // deixa o navegador pintar o aviso antes do processamento
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r)));
  try {
    await pintura.carregar(desenho.src);
    if (desenho.salvar) {
      const salvo = localStorage.getItem(chave(desenho.id));
      if (salvo) pintura.importarEstado(JSON.parse(salvo));
    }
  } catch (err) {
    console.error(err);
    alert('Não consegui abrir esse desenho.');
    location.hash = '';
    return;
  } finally {
    $('carregando').hidden = true;
  }
  ajustarZoom();
  atualizarBotoes();
}

$('voltar').onclick = () => {
  if (history.length > 1 && location.hash) history.back();
  else location.hash = '';
};

/* ---------------- Salvar progresso ---------------- */

let timerSalvar = 0;
pintura.aoMudar = () => {
  atualizarBotoes();
  clearTimeout(timerSalvar);
  timerSalvar = setTimeout(salvarAgora, 400);
};

function salvarAgora() {
  clearTimeout(timerSalvar);
  if (!atual || !atual.salvar || !pintura.cores) return;
  const k = chave(atual.id);
  if (pintura.temPintura) localStorage.setItem(k, JSON.stringify(pintura.exportarEstado()));
  else localStorage.removeItem(k);
}
window.addEventListener('pagehide', salvarAgora);

function atualizarBotoes() {
  $('desfazer').disabled = !pintura.desfazerPilha.length;
  $('refazer').disabled = !pintura.refazerPilha.length;
}

/* ---------------- Paleta ---------------- */

function botaoCor(hex, extraClasse) {
  const b = document.createElement('button');
  b.className = 'cor' + (extraClasse ? ' ' + extraClasse : '');
  b.style.background = extraClasse ? '' : hex;
  b.dataset.cor = hex;
  b.title = extraClasse ? 'Borracha' : hex;
  b.setAttribute('aria-label', b.title);
  b.onclick = () => escolherCor(hex, b);
  return b;
}

function montarPaleta() {
  const cores = PALETA.map((h) => botaoCor(h));
  cores.push(botaoCor(BORRACHA, 'borracha'));
  $('cores').replaceChildren(...cores);
  montarRecentes();
  escolherCor(corAtual);
}

function montarRecentes() {
  $('recentes').replaceChildren(...recentes.map((h) => botaoCor(h)));
}

function escolherCor(hex, botao) {
  corAtual = hex;
  document.querySelectorAll('.cor').forEach((b) => b.setAttribute('aria-pressed', 'false'));
  (botao || document.querySelector(`#cores .cor[data-cor="${hex}"]:not(.borracha)`))?.setAttribute(
    'aria-pressed',
    'true',
  );
}

$('cor-livre').addEventListener('input', (e) => escolherCor(e.target.value));
$('cor-livre').addEventListener('change', (e) => {
  const h = e.target.value;
  if (PALETA.includes(h)) return;
  recentes = [h, ...recentes.filter((x) => x !== h)].slice(0, 10);
  localStorage.setItem('colorir:recentes', JSON.stringify(recentes));
  montarRecentes();
  escolherCor(h, $('recentes').firstChild);
});

/* ---------------- Ações ---------------- */

$('desfazer').onclick = () => pintura.desfazer();
$('refazer').onclick = () => pintura.refazer();
$('limpar').onclick = () => {
  if (confirm('Apagar toda a pintura deste desenho?')) pintura.limpar();
};
$('baixar').onclick = () => {
  $('tela').toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(atual?.titulo || 'desenho').replace(/[^\p{L}\p{N}-]+/gu, '-')}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, 'image/png');
};

document.addEventListener('keydown', (e) => {
  if ($('tela-pintura').hidden) return;
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); pintura.desfazer(); }
  else if (ctrl && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); pintura.refazer(); }
  else if (e.key === '+' || e.key === '=') zoomNoCentro(1.25);
  else if (e.key === '-') zoomNoCentro(0.8);
  else if (e.key === '0') ajustarZoom();
  else if (e.key === 'Escape') $('voltar').click();
});

/* ---------------- Zoom e arrastar ---------------- */
// O canvas fica no tamanho real da imagem; a visualização é feita com
// transform CSS (barato, sem redesenhar nada).

const visor = $('visor');
const canvas = $('tela');
const vista = { s: 1, x: 0, y: 0, min: 0.1, max: 8 };

function aplicarVista() {
  canvas.style.transform = `translate(${vista.x}px, ${vista.y}px) scale(${vista.s})`;
}

function ajustarZoom() {
  if (!pintura.W) return;
  const r = visor.getBoundingClientRect();
  const m = 16;
  const s = Math.min((r.width - m * 2) / pintura.W, (r.height - m * 2) / pintura.H);
  vista.s = s;
  vista.min = s * 0.5;
  vista.max = Math.max(8, s * 12);
  vista.x = (r.width - pintura.W * s) / 2;
  vista.y = (r.height - pintura.H * s) / 2;
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
let gesto = null; // { tipo: 'toque'|'mover'|'pinca', ... }

visor.addEventListener('pointerdown', (e) => {
  visor.setPointerCapture(e.pointerId);
  ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ponteiros.size === 1) {
    gesto = { tipo: 'toque', x0: e.clientX, y0: e.clientY, vx: vista.x, vy: vista.y, botaoMeio: e.button !== 0 };
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

function soltar(e) {
  if (!ponteiros.has(e.pointerId)) return;
  ponteiros.delete(e.pointerId);
  if (gesto?.tipo === 'toque' && !gesto.botaoMeio && e.type === 'pointerup') {
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * pintura.W;
    const y = ((e.clientY - r.top) / r.height) * pintura.H;
    if (x >= 0 && y >= 0 && x < pintura.W && y < pintura.H) pintura.pintar(x, y, hexParaInt(corAtual));
  }
  // depois de uma pinça, o dedo que sobra só move (não pinta)
  if (ponteiros.size === 0) gesto = null;
  else if (gesto?.tipo === 'pinca') {
    const p = [...ponteiros.values()][0];
    gesto = { tipo: 'mover', x0: p.x, y0: p.y, vx: vista.x, vy: vista.y };
  }
}
visor.addEventListener('pointerup', soltar);
visor.addEventListener('pointercancel', soltar);
visor.addEventListener('contextmenu', (e) => e.preventDefault());

iniciar();
