import { Pintura } from './pintura.js';
import { Numeros } from './numeros.js';
import { Acervo, LIMITE_GUARDADOS, LIMITE_FAVORITOS } from './acervo.js';

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

const hexParaInt = (h) => parseInt(h.slice(1), 16);

let acervo;
let atual = null; // registro do desenho aberto
let aba = 'pintar';
let corLivre = '#f97316';
let recentes = JSON.parse(localStorage.getItem('colorir:recentes') || '[]');

const canvas = $('tela');
const sob = $('sobreposicao');
const livre = new Pintura(canvas);
const numeros = new Numeros(canvas, sob);
const motor = () => (atual?.modo === 'numeros' ? numeros : livre);

/* ---------------- Imagens dos registros ---------------- */

// URLs de Blobs guardados no banco (criadas uma vez por sessão)
const urls = new Map();
function urlDe(rec, campo) {
  const blob = rec[campo];
  if (!blob) return '';
  const k = `${rec.id}:${campo}`;
  if (!urls.has(k)) urls.set(k, URL.createObjectURL(blob));
  return urls.get(k);
}
const fonteDe = (rec) => urlDe(rec, 'imagem');

// Galeria: por números aparece sem cor até começar; depois como você deixou; colorida quando pronta.
function miniaturaDe(rec) {
  if (rec.status !== 'pronto') return '';
  if (rec.pct >= 100) return rec.modo === 'numeros' ? urlDe(rec, 'imagem') : rec.retrato || urlDe(rec, 'imagem');
  if (rec.retrato) return rec.retrato;
  if (rec.modo === 'numeros') return urlDe(rec, 'contorno');
  return urlDe(rec, 'imagem');
}

/* ---------------- Início ---------------- */

async function iniciar() {
  const pinturas = await fetch('pinturas/pinturas.json').then((r) => r.json());
  acervo = new Acervo(pinturas);
  let timer = 0;
  acervo.aoMudar = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { if (!$('tela-galeria').hidden) montarGaleria(); }, 150);
  };
  await acervo.iniciar();
  window.addEventListener('hashchange', rotear);
  rotear();
}

/* ---------------- Galeria ---------------- */

$('aba-pintar').onclick = () => trocarAba('pintar');
$('aba-favoritos').onclick = () => trocarAba('favoritos');

function trocarAba(a) {
  aba = a;
  $('aba-pintar').setAttribute('aria-pressed', a === 'pintar');
  $('aba-favoritos').setAttribute('aria-pressed', a === 'favoritos');
  montarGaleria();
}

async function montarGaleria() {
  const [recs, conta, pode] = await Promise.all([
    aba === 'pintar' ? acervo.lista() : acervo.favoritos(),
    acervo.contagem(),
    acervo.podeGerar(),
  ]);
  $('conta-favoritos').textContent = `${conta.favoritos}/${LIMITE_FAVORITOS}`;
  $('barra-lote').hidden = aba !== 'pintar';
  $('conta-guardados').textContent = `${conta.prontos}/${LIMITE_GUARDADOS} desenhos sem pintar`;

  // botão: disponível só quando dá para gerar; enquanto carrega, mostra o progresso
  const { feitos, total } = acervo.progressoLote();
  const carregando = total > 0;
  const bt = $('outros');
  bt.disabled = !pode;
  bt.classList.toggle('ocupado', carregando);
  bt.textContent = carregando ? `Carregando desenhos… ${feitos}/${total}` : '✨ Mais desenhos';
  $('galeria').setAttribute('aria-busy', String(carregando));

  // prontos viram cartões; os que estão carregando aparecem como "esqueleto" animado
  const cartoes = recs
    .filter((r) => r.status === 'pronto' || (r.status === 'gerando' && aba === 'pintar'))
    .map((r) => (r.status === 'pronto' ? cartao(r) : esqueleto()));
  if (!cartoes.length) {
    const v = document.createElement('p');
    v.className = 'vazio';
    v.textContent = aba === 'favoritos'
      ? 'Nenhum favorito ainda. Toque na ☆ de um desenho para guardá-lo aqui.'
      : 'Nenhum desenho por aqui ainda.';
    cartoes.push(v);
  }
  $('galeria').replaceChildren(...cartoes);
}

function esqueleto() {
  const d = document.createElement('div');
  d.className = 'cartao esqueleto';
  d.setAttribute('aria-hidden', 'true');
  d.innerHTML = '<div class="esq-img"></div><div class="esq-linha"></div><div class="esq-linha curta"></div>';
  return d;
}

function cartao(rec) {
  const a = document.createElement('a');
  a.className = 'cartao';
  a.href = `#/p/${encodeURIComponent(rec.id)}`;
  a.innerHTML = '<img alt="" loading="lazy" decoding="async"><span class="nome"></span>';
  const src = miniaturaDe(rec);
  if (src) a.querySelector('img').src = src;
  a.querySelector('.nome').textContent = rec.titulo;
  if (rec.autor) {
    const autor = document.createElement('small');
    autor.className = 'autor';
    autor.textContent = rec.autor;
    a.querySelector('.nome').after(autor);
  }
  if (rec.pct > 0) {
    const selo = document.createElement('span');
    selo.className = 'selo';
    selo.textContent = rec.pct >= 100 ? '✓ pronto' : rec.modo === 'numeros' ? `${rec.pct}%` : 'continuar';
    a.append(selo);
  }
  const est = document.createElement('button');
  est.className = 'estrela';
  est.setAttribute('aria-pressed', String(!!rec.favorito));
  est.setAttribute('aria-label', rec.favorito ? 'Remover dos favoritos' : 'Favoritar');
  est.textContent = rec.favorito ? '★' : '☆';
  est.onclick = async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    await alternarFavorito(rec.id);
    montarGaleria();
  };
  a.append(est);
  return a;
}

$('outros').onclick = async () => {
  $('outros').disabled = true;
  await acervo.outros();
  await montarGaleria();
};
// sem internet / internet de volta: atualiza se o botão pode ser usado
window.addEventListener('online', () => !$('tela-galeria').hidden && montarGaleria());
window.addEventListener('offline', () => !$('tela-galeria').hidden && montarGaleria());

// Imagem do computador: colorida → por números; preto e branco → pintura livre.
$('arquivo').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const modo = (await ehColorida(f)) ? 'numeros' : 'livre';
    const rec = await acervo.adicionarArquivo(f, f.name.replace(/\.[^.]+$/, ''), modo);
    location.hash = `#/p/${encodeURIComponent(rec.id)}`;
  } catch (err) {
    console.error(err);
    aviso('Não consegui abrir essa imagem.');
  }
});

async function ehColorida(blob) {
  const bmp = await createImageBitmap(blob);
  const c = new OffscreenCanvas(64, 64);
  const ctx = c.getContext('2d');
  ctx.drawImage(bmp, 0, 0, 64, 64);
  bmp.close();
  const d = ctx.getImageData(0, 0, 64, 64).data;
  let sat = 0;
  for (let i = 0; i < d.length; i += 4) {
    const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
    sat += mx ? (mx - mn) / mx : 0;
  }
  return sat / 4096 > 0.12;
}

/* ---------------- Favoritos ---------------- */

async function alternarFavorito(id) {
  const rec = await acervo.obter(id);
  if (!rec) return;
  if (rec.favorito) await acervo.desfavoritar(id);
  else {
    const r = await acervo.favoritar(id);
    if (r === 'cheio') await dialogoFavoritosCheios(id);
    else if (r === 'repetido') aviso('Esse desenho já está nos seus favoritos.');
  }
  if (atual?.id === id) atualizarEstrela();
}

async function atualizarEstrela() {
  const rec = atual && (await acervo.obter(atual.id));
  const fav = !!rec?.favorito;
  $('favorito').setAttribute('aria-pressed', String(fav));
  $('favorito').textContent = fav ? '★' : '☆';
  $('fim-favoritar').hidden = fav;
}

$('favorito').onclick = () => atual && alternarFavorito(atual.id);
$('fim-favoritar').onclick = async () => {
  await alternarFavorito(atual.id);
  const rec = await acervo.obter(atual.id);
  if (rec?.favorito) aviso('Guardado nos favoritos ⭐');
};

// 30 favoritos: o usuário escolhe qual liberar (podendo baixar antes).
async function dialogoFavoritosCheios(pendente) {
  const dlg = $('dlg-favoritos');
  const favs = await acervo.favoritos();
  $('lista-favoritos').replaceChildren(
    ...favs.map((f) => {
      const li = document.createElement('li');
      li.innerHTML = '<img alt=""><span></span><button class="botao secundario">⬇ Baixar</button><button class="botao">Remover</button>';
      const src = miniaturaDe(f);
      if (src) li.querySelector('img').src = src;
      li.querySelector('span').textContent = `${f.titulo}${f.pct >= 100 ? ' ✓' : f.pct ? ` · ${f.pct}%` : ''}`;
      const [baixar, remover] = li.querySelectorAll('button');
      baixar.onclick = () => baixarDesenho(f);
      remover.onclick = async () => {
        await acervo.desfavoritar(f.id);
        await acervo.favoritar(pendente);
        dlg.close();
        aviso(`“${f.titulo}” saiu dos favoritos; o novo foi guardado ⭐`);
        if (atual) atualizarEstrela();
        if (!$('tela-galeria').hidden) montarGaleria();
      };
      return li;
    }),
  );
  dlg.showModal();
  await new Promise((ok) => dlg.addEventListener('close', ok, { once: true }));
}

/* ---------------- Navegação ---------------- */

async function rotear() {
  const m = location.hash.match(/^#\/p\/(.+)$/);
  const rec = m && (await acervo.obter(decodeURIComponent(m[1])));
  if (rec && rec.status === 'pronto') abrir(rec);
  else mostrarGaleria();
}

function mostrarGaleria() {
  salvarAgora();
  atual = null;
  $('tela-pintura').hidden = true;
  $('tela-galeria').hidden = false;
  document.title = 'Colorir';
  montarGaleria();
}

async function abrir(rec) {
  if (atual && atual.id === rec.id) return;
  salvarAgora();
  atual = rec;
  const tela = $('tela-pintura');
  tela.classList.toggle('modo-numeros', rec.modo === 'numeros');
  tela.classList.toggle('modo-livre', rec.modo === 'livre');
  $('tela-galeria').hidden = true;
  tela.hidden = false;
  $('fim').hidden = true;
  $('titulo').textContent = rec.titulo;
  document.title = `${rec.titulo} · Colorir`;
  $('carregando').hidden = false;
  $('cores').replaceChildren();
  limparSobreposicao();
  atualizarEstrela();
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r)));
  try {
    if (rec.modo === 'numeros') await numeros.carregar(fonteDe(rec), { cores: rec.cores, minimo: rec.minimo });
    else await livre.carregar(fonteDe(rec));
    if (atual !== rec) return; // saiu durante o carregamento
    if (rec.estado) motor().importarEstado(rec.estado);
  } catch (err) {
    console.error(err);
    aviso('Não consegui abrir esse desenho.');
    location.hash = '';
    return;
  } finally {
    $('carregando').hidden = true;
  }
  if (rec.modo === 'numeros') montarPaletaNumerada();
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

function salvarAgora(pctForcado) {
  clearTimeout(timerSalvar);
  if (!atual) return;
  const m = motor();
  if (!m.rot) return;
  let estado, pct;
  if (atual.modo === 'numeros') {
    const p = numeros.progresso;
    pct = Math.floor(p * 100);
    estado = p > 0 ? numeros.exportarEstado() : null;
  } else {
    estado = livre.temPintura ? livre.exportarEstado() : null;
    pct = typeof pctForcado === 'number' ? pctForcado : atual.pct || 0;
  }
  const retrato = estado ? fazerRetrato() : null;
  Object.assign(atual, { estado, pct, retrato });
  acervo.salvarProgresso(atual.id, { estado, pct, retrato }).catch((err) => {
    console.warn('Não foi possível salvar o progresso', err);
    aviso('Não consegui salvar: o armazenamento do navegador está cheio.');
  });
}
window.addEventListener('pagehide', () => salvarAgora());
document.addEventListener('visibilitychange', () => { if (document.hidden) salvarAgora(); });

// Miniatura pequena do estado atual, para a galeria.
function fazerRetrato() {
  const esc = 240 / Math.max(canvas.width, canvas.height);
  const c = document.createElement('canvas');
  c.width = Math.round(canvas.width * esc);
  c.height = Math.round(canvas.height * esc);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, c.width, c.height);
  return c.toDataURL('image/webp', 0.75);
}

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
  if (numeros.faltam[cor] !== 0) return;
  if (numeros.completo) {
    salvarAgora();
    ajustarZoom();
    setTimeout(() => ($('fim').hidden = false), 300);
    return;
  }
  const n = numeros.paleta.length;
  for (let k = 1; k <= n; k++) {
    const j = (cor + k) % n;
    if (numeros.faltam[j] > 0) { selecionarNumero(j); break; }
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
$('terminei').onclick = () => {
  salvarAgora(100);
  $('fim').hidden = false;
};

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
  } else {
    livre.limpar();
    salvarAgora(0);
  }
};

const nomeArquivo = (rec) => `${(rec?.titulo || 'desenho').replace(/[^\p{L}\p{N}-]+/gu, '-')}.png`;

function salvarBlob(blob, nome) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$('baixar').onclick = () => canvas.toBlob((b) => salvarBlob(b, nomeArquivo(atual)), 'image/png');

// Baixa um desenho que não está aberto: monta o estado dele numa tela invisível.
async function baixarDesenho(rec) {
  if (atual?.id === rec.id) return $('baixar').click();
  const c = document.createElement('canvas');
  const m = rec.modo === 'numeros' ? new Numeros(c, document.createElement('canvas')) : new Pintura(c);
  if (rec.modo === 'numeros') await m.carregar(fonteDe(rec), { cores: rec.cores, minimo: rec.minimo });
  else await m.carregar(fonteDe(rec));
  if (rec.estado) m.importarEstado(rec.estado);
  c.toBlob((b) => salvarBlob(b, nomeArquivo(rec)), 'image/png');
}

document.addEventListener('keydown', (e) => {
  if ($('tela-pintura').hidden || $('dlg-favoritos').open) return;
  const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (atual?.modo === 'livre' && ctrl && k === 'z' && !e.shiftKey) { e.preventDefault(); livre.desfazer(); }
  else if (atual?.modo === 'livre' && ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); livre.refazer(); }
  else if (k === '+' || k === '=') zoomNoCentro(1.25);
  else if (k === '-') zoomNoCentro(0.8);
  else if (k === '0') ajustarZoom();
  else if (k === 'escape') $('voltar').click();
});

/* ---------------- Avisos, instalação e modo offline (PWA) ---------------- */

let timerAviso = 0;
function aviso(texto, acao) {
  const el = $('aviso');
  el.replaceChildren(texto);
  if (acao) {
    const b = document.createElement('button');
    b.textContent = acao.rotulo;
    b.onclick = () => { el.hidden = true; acao.fn(); };
    el.append(b);
  }
  el.hidden = false;
  clearTimeout(timerAviso);
  if (!acao) timerAviso = setTimeout(() => (el.hidden = true), 4000);
}

let pedidoInstalar = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  pedidoInstalar = e;
  $('instalar').hidden = false;
});
$('instalar').onclick = async () => {
  if (!pedidoInstalar) return;
  pedidoInstalar.prompt();
  await pedidoInstalar.userChoice;
  pedidoInstalar = null;
  $('instalar').hidden = true;
};
window.addEventListener('appinstalled', () => ($('instalar').hidden = true));

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const oferecer = (sw) =>
      aviso('Nova versão disponível.', { rotulo: 'Atualizar', fn: () => sw.postMessage('atualizar') });
    if (reg.waiting && navigator.serviceWorker.controller) oferecer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      sw?.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) oferecer(sw);
      });
    });
  });
  // recarrega só numa atualização (não na primeira instalação, que não muda nada na página)
  const tinhaControlador = !!navigator.serviceWorker.controller;
  let recarregando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (recarregando || !tinhaControlador) return;
    recarregando = true;
    salvarAgora();
    location.reload();
  });
}

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
if (location.search.includes('debug')) Object.assign(globalThis, { numeros, livre, vista, obterAcervo: () => acervo });

iniciar();
