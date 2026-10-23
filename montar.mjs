// montar.mjs — gera o portal estático do Arsenal.
// Uso: node montar.mjs   (rodar python3 empacotar.py antes: ele gera os zips, gerado/skills.json e gerado/relatorios.json)
// Estrutura de app (modelo: aitmpl.com): lateral com os tipos, busca no topo, catálogo unificado na home.
// Toda página de conteúdo sai em duas versões: build/publico (conteúdo trocado por esqueleto, data-protegido,
// modal de entrada que não fecha) e build/completo (conteúdo de verdade). O servidor (deploy/app/server.js)
// só entrega a completa e os downloads com sessão válida, então nada protegido aparece no código-fonte público.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const BUILD = path.join(AQUI, "build");
const DOWNLOADS = path.join(BUILD, "downloads");
let MODO = "publico";   // trocado pra "completo" na segunda passada das páginas protegidas
const ler = (f) => JSON.parse(fs.readFileSync(path.join(AQUI, f), "utf8"));
const cat = ler("catalogo.json");
const TITULOS = ler("titulos.json");
const AGENTES_DEF = ler("agentes.json").agentes;
const RELS_BRUTOS = fs.existsSync(path.join(AQUI, "gerado", "relatorios.json")) ? ler("gerado/relatorios.json").relatorios : [];
const DOMINIO = "https://arsenal.studioartemis.co";
const GITHUB = "https://github.com/helio-debug/arsenal-mktops";
const GTM = "GTM-WW4JRN7";

// ---------- dados ----------
// Descrição sai do SKILL.md já sanitizado; aqui só tira o que fala "da casa" pra quem está de fora e repõe acento.
const AJUSTES = [[/ pra clientes da Artemis/g, ""], [/ da casa/g, ""], [/\bestatistico\b/g, "estatístico"], [/\bhipotese\b/g, "hipótese"],
  [/\bmetrica\b/g, "métrica"], [/\banuncio\b/g, "anúncio"], [/\bdescricoes\b/g, "descrições"], [/\bvariacoes\b/g, "variações"],
  [/\bmidia\b/g, "mídia"], [/\balocacao\b/g, "alocação"], [/\bestrategia\b/g, "estratégia"], [/\binteligencia\b/g, "inteligência"],
  [/\bsaude\b/g, "saúde"], [/\batribuicao\b/g, "atribuição"], [/\bconversao\b/g, "conversão"]];
const ORDEM_AREA = ["anuncios", "copy", "pesquisa", "conteudo", "video", "email", "conversao", "seo", "estrategia", "ferramentas"];
const SKILLS = ler("gerado/skills.json").skills.map((s) => ({
  ...s,
  titulo: TITULOS[s.slug] || s.titulo,
  descricao: AJUSTES.reduce((t, [rx, r]) => t.replace(rx, r), s.descricao),
})).sort((a, b) => ORDEM_AREA.indexOf(a.area) - ORDEM_AREA.indexOf(b.area) || a.titulo.localeCompare(b.titulo, "pt-BR"));

const RELS = RELS_BRUTOS.map((r) => ({
  ...r,
  vitrine: r.titulo.replace(/^(SPY REPORT|SpyOps|SpyAds)\s*[—–-]\s*/i, "").replace(/\s*[—–-]\s*(SpyOps de Anúncios \+ Funil|SpyOps)$/i, "")
    .replace(/\s*[—–·-]\s*\d{2,4}[-/]\d{2}[-/]\d{2,4}$/, "").replace(/^Briefing Estratégico de Mercado\s*[—–-]\s*/i, ""),
  minutos: Math.max(2, Math.round(r.palavras / 220)),
})).sort((a, b) => b.data - a.data);

const esc = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const areaNome = (id) => (cat.areas.find((a) => a.id === id) || {}).nome || id;
const porSlug = Object.fromEntries(cat.itens.map((i) => [i.slug, i]));

function download(item) {
  if (!fs.existsSync(DOWNLOADS)) return null;
  const f = fs.readdirSync(DOWNLOADS).find((n) => n.replace(/\.[^.]+$/, "") === item.slug);
  return f ? `/downloads/${f}` : null;
}
const gratis = cat.itens.filter((i) => i.acesso === "gratis" && download(i));
const pagos = cat.itens.filter((i) => i.acesso !== "gratis");
const pacoteAgentes = gratis.find((i) => (i.agentes || []).length);
const AGENTES = AGENTES_DEF.filter(() => pacoteAgentes);

// ---------- ícones (traço de 1,75, 18px) ----------
const svg = (d, t = 18) => `<svg width="${t}" height="${t}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONE = {
  ferramenta: svg('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>'),
  agente: svg('<rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 7V4M9 12h.01M15 12h.01M9 16h6"/>'),
  sistema: svg('<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>'),
  relatorio: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>'),
  aula: svg('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3z"/>'),
  material: svg('<path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2z"/><path d="M8 7h6"/>'),
  workflow: svg('<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.5 6H14a4 4 0 0 1 4 4v5.5"/>'),
  produto: svg('<path d="M20 12 12 20l-8-8V4h8z"/><circle cx="8.5" cy="8.5" r="1.2"/>'),
  inicio: svg('<path d="m3 11 9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
  github: svg('<path d="M9 19c-4 1.5-4-2-6-2.5m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>'),
  busca: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', 16),
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  cadeado: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', 15),
  play: svg('<path d="m8 5 11 7-11 7z"/>', 12),
};
const TIPO_NOME = { ferramenta: "Ferramenta", agente: "Agente", sistema: "Sistema", relatorio: "Relatório", aula: "Aula", material: "Material", produto: "Produto" };
const TIPO_PLURAL = { ferramenta: "Ferramentas", agente: "Agentes", sistema: "Sistemas", relatorio: "Relatórios", aula: "Aulas", material: "Materiais" };

// Catálogo unificado: tudo que se acessa com login
const ITENS = [
  ...SKILLS.map((s) => ({ tipo: "ferramenta", slug: s.slug, titulo: s.titulo, desc: s.descricao, area: s.area, url: `/ferramentas/${s.slug}/`, isca: `skill-${s.slug}` })),
  ...AGENTES.map((a) => ({ tipo: "agente", slug: a.slug, titulo: a.titulo, desc: a.descricao, area: a.area, url: `/agentes/${a.slug}/`, isca: `agente-${a.slug}` })),
  ...gratis.filter((i) => i.tipo !== "material").map((i) => ({ tipo: "sistema", slug: i.slug, titulo: i.titulo, desc: i.promessa, area: i.area, url: `/${i.slug}/`, isca: i.slug, extra: i.formato })),
  ...RELS.map((r) => ({ tipo: "relatorio", slug: r.slug, titulo: r.vitrine, desc: r.tipo === "spyops" ? "Todos os anúncios ativos, copy literal, funil até o checkout e o que vale copiar." : "Pesquisa de mercado com fonte citada.", area: "pesquisa", url: `/relatorios/${r.slug}/`, isca: `relatorio-${r.slug}`, extra: `${r.minutos} min` })),
  ...(cat.aulas || []).map((a) => ({ tipo: "aula", slug: a.id, titulo: a.titulo, desc: `Aula de ${a.min} min do canal da Studio Artemis, com as ferramentas usadas nela.`, area: (porSlug[(a.itens || [])[0]] || {}).area || "estrategia", url: `/aulas/${a.id}/`, isca: `aula-${a.id}`, extra: `${a.min} min` })),
  ...gratis.filter((i) => i.tipo === "material").map((i) => ({ tipo: "material", slug: i.slug, titulo: i.titulo, desc: i.promessa, area: i.area, url: `/${i.slug}/`, isca: i.slug, extra: i.formato })),
];
// Vitrine "Tudo" abre pelo que mais impressiona: sistemas, agentes, relatórios, aulas; as ferramentas soltas vêm depois.
const ORDEM_TIPO = ["sistema", "agente", "relatorio", "aula", "material", "ferramenta"];
ITENS.sort((a, b) => ORDEM_TIPO.indexOf(a.tipo) - ORDEM_TIPO.indexOf(b.tipo));
const conta = (t) => ITENS.filter((i) => i.tipo === t).length;
const TOTAL = ITENS.length;

// ---------- peças ----------
function formulario(isca, rotulo = "Entrar grátis") {
  return `<form class="captura" novalidate data-isca="${esc(isca)}">
  <div class="campo" data-campo="nome"><label>Nome<input name="nome" autocomplete="given-name"></label><span class="msg">Escreva seu nome.</span></div>
  <div class="campo" data-campo="email"><label>E-mail<input name="email" type="email" autocomplete="email" inputmode="email"></label><span class="msg">Confira o e-mail.</span></div>
  <div class="campo" data-campo="telefone"><label>WhatsApp<input name="telefone" type="tel" autocomplete="tel" inputmode="tel" placeholder="(11) 91234-5678"></label><span class="msg">DDD + número.</span></div>
  <div class="campo" data-campo="perfil"><label>O que você faz
    <select name="perfil"><option value="">Escolha</option>
      <option>Dono ou sócio de negócio</option><option>Gestor de tráfego</option><option>Copy, conteúdo ou social media</option>
      <option>Agência de marketing</option><option>Time de marketing de empresa</option><option>Outro</option>
    </select></label><span class="msg">Escolha uma opção.</span></div>
  <div class="armadilha" aria-hidden="true"><label>Site da empresa<input name="empresa_site" tabindex="-1" autocomplete="off"></label></div>
  <button class="btn cheio" type="submit">${esc(rotulo)}</button>
  <p class="erro-envio">Não deu pra entrar agora. Confira a conexão e tente de novo.</p>
</form>`;
}

const MODAL = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-titulo"><div class="janela">
  <button class="fechar" type="button" aria-label="Fechar">×</button>
  <div class="tranca">${ICONE.cadeado}</div>
  <h2 id="modal-titulo"><span data-modal-titulo>Entrar no portal</span></h2>
  <div class="aviso" data-aviso></div>
  <div class="modo-cadastro">
    <p class="nota">Este conteúdo é aberto pra quem entra no portal. Um cadastro libera os ${TOTAL} itens: ${conta("ferramenta")} ferramentas, ${conta("agente")} agentes, ${conta("relatorio")} relatórios e as aulas. Grátis e sem prazo.</p>
    ${formulario("portal")}
    <p class="rodape-modal">Já tem cadastro? <button type="button" class="trocar" data-modo="link">Receber link de acesso no e-mail</button></p>
  </div>
  <div class="modo-link">
    <p class="nota">Digite o e-mail do seu cadastro. Mandamos um link que entra direto, válido por 30 minutos.</p>
    <form class="pedir-link" novalidate>
      <div class="campo" data-campo="email"><label>E-mail<input name="email" type="email" autocomplete="email" inputmode="email"></label><span class="msg">Confira o e-mail.</span></div>
      <button class="btn cheio" type="submit">Mandar o link</button>
    </form>
    <p class="rodape-modal">Primeira vez aqui? <button type="button" class="trocar" data-modo="cadastro">Fazer o cadastro grátis</button></p>
  </div>
  <a class="voltar-modal" href="/">← Voltar ao catálogo</a>
</div></div>`;

function lateral(ativo) {
  const nav = (href, icone, nome, n, attrs = "") => `<a class="nav${ativo === nome ? " ativo" : ""}" href="${href}"${attrs}>${icone}<span>${nome}</span>${n !== undefined ? `<span class="n">${n}</span>` : ""}</a>`;
  const areas = cat.areas.filter((a) => ITENS.some((i) => i.area === a.id)).sort((a, b) => ORDEM_AREA.indexOf(a.id) - ORDEM_AREA.indexOf(b.id));
  return `<aside class="lateral" aria-label="Navegação">
  <a class="marca" href="/"><span class="glyph"></span>MktOps<span class="mono">Arsenal</span></a>
  <nav>
    <h4 class="label">Explorar</h4>
    ${nav("/", ICONE.inicio, "Início")}
    ${["ferramenta", "agente", "sistema", "relatorio", "aula", "material"].filter(conta).map((t) => nav(`/?tipo=${t}#catalogo`, ICONE[t], TIPO_PLURAL[t], conta(t), ` data-tipo="${t}"`)).join("")}
    ${nav("/#workflows", ICONE.workflow, "Workflows", cat.workflows.length)}
    <h4 class="label">Áreas</h4>
    ${areas.map((a) => nav(`/?area=${a.id}#catalogo`, "", a.nome, ITENS.filter((i) => i.area === a.id).length, ` data-area-link="${a.id}"`)).join("")}
    <h4 class="label">Projeto</h4>
    ${nav("/#aberto", ICONE.material, "Por que é aberto")}
    ${nav(GITHUB, ICONE.github, "Código no GitHub", undefined, ' target="_blank" rel="noopener"')}
    ${nav("/#produtos", ICONE.produto, "Pra ir mais fundo")}
  </nav>
  <div class="pe-lateral">
    <div class="conta so-logado"><span class="avatar" data-inicial></span><span data-nome></span><button type="button" data-sair>Sair</button></div>
    <a class="btn cheio so-deslogado" href="#" data-entrar>Entrar grátis</a>
  </div>
</aside>`;
}

function pagina({ titulo, descricao, url, noindex, protegido, tituloModal, ativo, corpo }) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM}');</script>
<!-- End Google Tag Manager -->
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descricao)}">
<link rel="canonical" href="${DOMINIO}${url}">
${noindex ? '<meta name="robots" content="noindex">\n' : ""}<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descricao)}">
<meta property="og:type" content="website">
<meta name="theme-color" content="#FFFFFF">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'%3E%3Cpath d='M0 0H10V6H6V10H0Z' fill='%230A0A0A'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=JetBrains+Mono:wght@500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/arsenal.css">
</head>
<body${protegido && MODO === "publico" ? ` data-protegido="${esc(protegido)}" data-titulo="${esc(tituloModal || "Entrar no portal")}"` : ""}>
<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${GTM}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->
${lateral(ativo)}
<div class="principal">
  <header class="topo">
    <button class="menu-btn" type="button" aria-label="Abrir menu">${ICONE.menu}</button>
    <div class="busca-topo">${ICONE.busca}<input type="search" placeholder="Buscar ferramenta, agente, relatório…" aria-label="Buscar no portal"><kbd>⌘K</kbd></div>
    <div class="acoes">
      <a class="btn leve mini github" href="${GITHUB}" target="_blank" rel="noopener">${ICONE.github}GitHub</a>
      <a class="btn mini so-deslogado" href="#" data-entrar>Entrar grátis</a>
    </div>
  </header>
  <main class="conteudo">
${corpo}
  </main>
  <footer><div class="conteudo">
    <span>© 2026 MktOps · Studio Artemis. Portal open source de conhecimento e ferramentas de IA. <a href="${GITHUB}" target="_blank" rel="noopener">Código no GitHub</a>.</span>
    <span>Este site não faz parte da Meta, do Google ou da Anthropic, nem é endossado por eles.</span>
  </div></footer>
</div>
${MODAL}
<script src="/assets/arsenal.js"></script>
</body></html>`;
}

function card(i) {
  const etqs = [`<span class="etq">${TIPO_NOME[i.tipo]}</span>`, `<span class="etq">${esc(areaNome(i.area))}</span>`];
  if (i.extra) etqs.push(`<span class="etq">${esc(i.extra)}</span>`);
  return `<a class="card" href="${i.url}" data-tipo="${i.tipo}" data-area="${i.area}" data-isca="${esc(i.isca)}" data-titulo="${esc(i.titulo)}">
  <span class="icone">${ICONE[i.tipo]}</span>
  <span class="txt"><h3>${esc(i.titulo)}</h3><p>${esc(i.desc)}</p><span class="etqs">${etqs.join("")}</span></span>
  <span class="cadeado" title="Entre pra acessar">${ICONE.cadeado}</span>
</a>`;
}

function cardProduto(i) {
  const href = i.link || `/${i.slug}/`;
  const ext = href.startsWith("http") ? ' target="_blank" rel="noopener"' : "";
  const preco = i.acesso === "pago" ? (i.preco || "Pago") : "Em breve";
  return `<a class="card" href="${href}"${ext}>
  <span class="icone">${ICONE.produto}</span>
  <span class="txt"><h3>${esc(i.titulo)}</h3><p>${esc(i.promessa)}</p><span class="etqs"><span class="etq escura">${esc(preco)}</span><span class="etq">${esc(areaNome(i.area))}</span></span></span>
</a>`;
}

function fluxo(w) {
  const links = (w.itens || []).map((s) => porSlug[s]).filter((i) => i && i.acesso === "gratis")
    .map((i) => `<a href="/${i.slug}/">${esc(i.titulo)} →</a>`).join("");
  return `<article class="fluxo">
  <h3>${esc(w.titulo)}</h3>
  <p class="quando">${esc(w.quando)}</p>
  <ol>${w.passos.map((p) => `<li><span><code>${esc(p.skill)}</code> ${esc(p.faz)}</span></li>`).join("")}</ol>
  ${links ? `<div class="baixar">${links}</div>` : ""}
</article>`;
}

function migalha(tipo, titulo) {
  return `<div class="migalha"><a href="/">Início</a><span>/</span><a href="/?tipo=${tipo}#catalogo">${TIPO_PLURAL[tipo] || "Catálogo"}</a><span>/</span><span>${esc(titulo)}</span></div>`;
}

// Página de item: título e promessa à vista; o resto fica em .protegido (borra sem login).
function detalhe({ tipo, titulo, promessa, area, principal, lado, extras = "" }) {
  return `${migalha(tipo, titulo)}
  <div class="item">
    <div>
      <div class="item-cab"><span class="icone">${ICONE[tipo]}</span><div><p class="label">${TIPO_NOME[tipo]} · ${esc(areaNome(area))}</p><h1>${esc(titulo)}</h1></div></div>
      <p class="promessa">${esc(promessa)}</p>
      ${prot(principal)}
    </div>
    ${prot(lado, "lado")}
  </div>
  ${MODO === "completo" ? extras : ""}`;
}

// Bloco protegido: na versão pública vira esqueleto (barras cinza), na completa é o conteúdo.
const ESQUELETO = `<div class="esqueleto" aria-hidden="true">${[92, 78, 85, 64, 88, 71, 80, 58].map((w) => `<span style="width:${w}%"></span>`).join("")}</div>`;
const prot = (html, cls = "") => MODO === "completo" ? `<div class="${cls}">${html}</div>` : `<div class="protegido ${cls}">${ESQUELETO}</div>`;

const relacionadosGrade = (titulo, itens) => itens.length ? `<section class="relacionados"><h2>${titulo}</h2><div class="grade">${itens.map(card).join("")}</div></section>` : "";

// ---------- páginas ----------
function paginaIndex() {
  const areas = cat.areas.filter((a) => ITENS.some((i) => i.area === a.id)).sort((a, b) => ORDEM_AREA.indexOf(a.id) - ORDEM_AREA.indexOf(b.id));
  const tipos = ["ferramenta", "agente", "sistema", "relatorio", "aula", "material"].filter(conta);
  return pagina({
    titulo: "Arsenal MktOps · portal open source de conhecimento e ferramentas de IA",
    descricao: `Portal aberto da Studio Artemis: ${conta("ferramenta")} ferramentas e ${conta("agente")} agentes de IA, aulas e ${conta("relatorio")} análises de concorrente. O que os cursos de IA cobram R$ 20 mil por ano pra ensinar, aberto pra todo empreendedor.`,
    url: "/", ativo: "Início",
    corpo: `
  <section class="hero">
    <span class="pilula"><i></i>Projeto open source · atualizado toda semana</span>
    <h1>Curso de IA cobra R$&nbsp;20&nbsp;mil por ano pelo que deveria ser de todo mundo. <em>Aqui está aberto.</em></h1>
    <p class="sub">O Arsenal é o portal open source onde a Studio Artemis publica o que usa todo dia com IA: as ferramentas, os agentes, as aulas e a análise dos anúncios de quem está vendendo. Sem matrícula, sem turma, sem mensalidade.</p>
    <div class="ctas"><a class="btn so-deslogado" href="#" data-entrar>Entrar grátis</a><a class="btn leve" href="#catalogo">Explorar o catálogo</a></div>
    <div class="numeros">
      <div><b>${conta("ferramenta")}</b><span>ferramentas</span></div>
      <div><b>${conta("agente")}</b><span>agentes</span></div>
      <div><b>${conta("relatorio")}</b><span>relatórios</span></div>
      <div><b>R$0</b><span>matrícula</span></div>
    </div>
  </section>

  <section class="secao" id="catalogo">
    <div class="cab"><div><span class="label">Catálogo</span><h2>Tudo que está aberto</h2>
      <p>Cada item tem página própria. Entre uma vez e acesse todos, sem prazo.</p></div></div>
    <div class="catalogo">
      <div class="abas" role="toolbar" aria-label="Tipo">
        <button class="chip" data-tipo="todos" aria-pressed="true">Tudo<span>${TOTAL}</span></button>
        ${tipos.map((t) => `<button class="chip" data-tipo="${t}" aria-pressed="false">${TIPO_PLURAL[t]}<span>${conta(t)}</span></button>`).join("")}
      </div>
      <div class="barra">
        <div class="busca">${ICONE.busca}<input type="search" placeholder="O que você precisa fazer? anúncio, SEO, e-mail, VSL…" aria-label="Buscar no catálogo"></div>
        <select data-area aria-label="Área"><option value="todas">Todas as áreas</option>${areas.map((a) => `<option value="${a.id}">${esc(a.nome)}</option>`).join("")}</select>
      </div>
      <p class="contagem" data-contagem>${TOTAL} itens</p>
      <div class="grade">${ITENS.map(card).join("\n")}</div>
      <p class="vazio">Nada com esse termo. Tente outra palavra.</p>
    </div>
  </section>

  <section class="secao" id="aberto">
    <div class="cab"><div><span class="label">Curso de IA × portal aberto</span><h2>O que o curso guarda atrás da matrícula, publicado aqui</h2></div></div>
    <div class="troca">
      <div class="tabela-troca">
        <div class="linha-t cabeca-t"><span>Curso de IA</span><b>Arsenal</b></div>
        <div class="linha-t"><span>Aula gravada mostrando a ferramenta</span><b>A ferramenta pronta pra instalar, com a aula junto</b></div>
        <div class="linha-t"><span>Turma com data pra começar</span><b>Você entra hoje e usa hoje</b></div>
        <div class="linha-t"><span>Acesso que vence em 12 meses</span><b>Acesso sem prazo</b></div>
        <div class="linha-t"><span>Material fechado, proibido compartilhar</span><b>Código aberto no GitHub</b></div>
        <div class="linha-t"><span>Conteúdo que envelhece desde a gravação</span><b>Item novo toda semana, tirado da operação</b></div>
        <div class="linha-t"><span>R$&nbsp;20&nbsp;mil por ano</span><b>R$&nbsp;0</b></div>
      </div>
      <div class="porque">
        <span class="label">Por que é aberto</span>
        <h3>IA aplicada muda todo mês</h3>
        <p>Quem tranca esse conhecimento numa turma com matrícula anual atrasa justo quem mais precisa dele: o empreendedor que toca o negócio e não tem R$&nbsp;20&nbsp;mil sobrando pra aprender o que já existe.</p>
        <p>A Studio Artemis já atendeu mais de 200 empresas com estas ferramentas. Cada uma nasceu de um projeto real, e o que a gente aprende no próximo entra aqui também. Use no seu negócio, adapte, passe adiante.</p>
        <a class="btn leve" href="${GITHUB}" target="_blank" rel="noopener">${ICONE.github}Ver o código no GitHub</a>
      </div>
    </div>
  </section>

  <section class="secao" id="workflows">
    <div class="cab"><div><span class="label">Workflows</span><h2>Como a operação encadeia as ferramentas</h2>
      <p>As sequências que rodam toda semana dentro da Artemis. Cada passo é um item do catálogo.</p></div></div>
    <div class="fluxos">${cat.workflows.map(fluxo).join("\n")}</div>
  </section>

  <section class="secao" id="produtos">
    <div class="cab"><div><span class="label">Produtos</span><h2>Pra ir mais fundo</h2></div></div>
    <div class="grade">${pagos.map(cardProduto).join("\n")}</div>
  </section>`,
  });
}

function paginaFerramenta(s) {
  const sistemas = gratis.filter((i) => (i.skills || []).includes(s.slug) || (i.contem || []).includes(s.slug));
  const irmas = ITENS.filter((k) => k.tipo === "ferramenta" && k.area === s.area && k.slug !== s.slug).slice(0, 6);
  return pagina({
    titulo: `${s.titulo} · ferramenta de IA aberta · Arsenal MktOps`, descricao: s.descricao, url: `/ferramentas/${s.slug}/`,
    protegido: `skill-${s.slug}`, tituloModal: `Entre pra usar: ${s.titulo}`, ativo: "Ferramentas",
    corpo: detalhe({
      tipo: "ferramenta", titulo: s.titulo, promessa: s.descricao, area: s.area,
      principal: `<ul class="marcas"><li><span>Roda no Claude Code (plano Pro ou Max), sem outra assinatura</span></li><li><span>Instala em 4 passos, com o guia em português dentro do pacote</span></li><li><span>Código aberto: leia, ajuste pro seu negócio, use quanto quiser</span></li></ul>`,
      lado: `<div class="caixa"><h2>Instalar</h2><p class="nota">Pacote com a ferramenta e o guia COMECE-AQUI.</p>
        <a class="btn cheio" href="${s.download}" download data-baixar="skill-${s.slug}">Baixar a ferramenta</a>
        <dl><dt>Tipo</dt><dd>Skill do Claude Code</dd><dt>Nome técnico</dt><dd>${s.slug}</dd><dt>Área</dt><dd>${esc(areaNome(s.area))}</dd></dl></div>`,
      extras: relacionadosGrade("Também vem nestes sistemas", sistemas.map((i) => ITENS.find((x) => x.slug === i.slug)).filter(Boolean)) + relacionadosGrade(`Mais ferramentas de ${esc(areaNome(s.area))}`, irmas),
    }),
  });
}

function paginaAgente(a) {
  const outros = ITENS.filter((k) => k.tipo === "agente" && k.slug !== a.slug).slice(0, 6);
  const dl = download(pacoteAgentes);
  return pagina({
    titulo: `${a.titulo} · agente de IA aberto · Arsenal MktOps`, descricao: a.descricao, url: `/agentes/${a.slug}/`,
    protegido: `agente-${a.slug}`, tituloModal: `Entre pra usar: ${a.titulo}`, ativo: "Agentes",
    corpo: detalhe({
      tipo: "agente", titulo: a.titulo, promessa: a.descricao, area: a.area,
      principal: `<ul class="marcas"><li><span>Roda como subagente do Claude Code, em paralelo com os outros</span></li><li><span>Vem no sistema ${esc(pacoteAgentes.titulo)}, com os orquestradores que distribuem o trabalho</span></li><li><span>Arquivo aberto em <code>.claude/agents/${a.slug}.md</code>: dá pra ler e ajustar</span></li></ul>`,
      lado: `<div class="caixa"><h2>Instalar</h2><p class="nota">O agente vem junto com os outros ${AGENTES.length - 1} e os orquestradores.</p>
        <a class="btn cheio" href="${dl}" download data-baixar="${pacoteAgentes.slug}">Baixar ${esc(pacoteAgentes.titulo)}</a>
        <dl><dt>Tipo</dt><dd>Subagente</dd><dt>Nome técnico</dt><dd>${a.slug}</dd><dt>Área</dt><dd>${esc(areaNome(a.area))}</dd></dl></div>`,
      extras: relacionadosGrade("Outros agentes", outros),
    }),
  });
}

function paginaSistema(i) {
  const dl = download(i);
  const dentro = (i.skills || []).map((s) => ITENS.find((k) => k.tipo === "ferramenta" && k.slug === s)).filter(Boolean)
    .concat((i.agentes || []).map((s) => ITENS.find((k) => k.tipo === "agente" && k.slug === s)).filter(Boolean));
  const fluxos = cat.workflows.filter((w) => (w.itens || []).includes(i.slug));
  const aulas = ITENS.filter((k) => k.tipo === "aula" && ((cat.aulas.find((a) => a.id === k.slug) || {}).itens || []).includes(i.slug));
  const tipo = i.tipo === "material" ? "material" : "sistema";
  return pagina({
    titulo: `${i.titulo} · Arsenal MktOps`, descricao: i.promessa, url: `/${i.slug}/`,
    protegido: i.slug, tituloModal: `Entre pra acessar: ${i.titulo}`, ativo: TIPO_PLURAL[tipo],
    corpo: detalhe({
      tipo, titulo: i.titulo, promessa: i.promessa, area: i.area,
      principal: `<p class="desc">${esc(i.descricao)}</p>${(i.entrega || []).length ? `<ul class="marcas">${i.entrega.map((e) => `<li><span>${esc(e)}</span></li>`).join("")}</ul>` : ""}`,
      lado: `<div class="caixa"><h2>Baixar</h2><p class="nota">${esc(i.formato || "")}</p>
        <a class="btn cheio" href="${dl}" download data-baixar="${i.slug}">Baixar ${esc(i.titulo)}</a></div>`,
      extras: relacionadosGrade("O que vem dentro", dentro) + relacionadosGrade("Aulas", aulas) +
        (fluxos.length ? `<section class="relacionados"><h2>Workflows que usam este sistema</h2><div class="fluxos">${fluxos.map(fluxo).join("")}</div></section>` : ""),
    }),
  });
}

function paginaProduto(i) {
  return pagina({
    titulo: `${i.titulo} · Arsenal MktOps`, descricao: i.promessa, url: `/${i.slug}/`, ativo: "Pra ir mais fundo",
    corpo: `${migalha("produto", i.titulo)}
  <div class="item"><div>
    <div class="item-cab"><span class="icone">${ICONE.produto}</span><div><p class="label">Produto · ${esc(areaNome(i.area))}</p><h1>${esc(i.titulo)}</h1></div></div>
    <p class="promessa">${esc(i.promessa)}</p><p class="desc">${esc(i.descricao)}</p>
    ${(i.entrega || []).length ? `<ul class="marcas">${i.entrega.map((e) => `<li><span>${esc(e)}</span></li>`).join("")}</ul>` : ""}
  </div><div class="lado"><div class="caixa"><h2>${esc(i.acesso === "pago" ? (i.preco || "Pago") : "Em breve")}</h2>
    <p class="nota">${i.link ? "Pagamento único." : "O link de compra sai em breve. Enquanto isso, o portal aberto está aí."}</p>
    ${i.link ? `<a class="btn cheio" href="${i.link}">Quero o ${esc(i.titulo)}</a>` : `<a class="btn cheio leve" href="/#catalogo">Ver o catálogo</a>`}</div></div></div>`,
  });
}

function paginaRelatorio(r) {
  const html = marked.parse(fs.readFileSync(path.join(AQUI, "gerado", "relatorios", r.slug + ".md"), "utf8"))
    .replace(/<h1[^>]*>.*?<\/h1>/s, "")
    .replace(/<thead>\s*<tr>(\s*<th[^>]*>\s*<\/th>)+\s*<\/tr>\s*<\/thead>/g, "")   // tabela "| | |" sem cabeçalho
    .replace(/<table>/g, '<div class="tabela"><table>').replace(/<\/table>/g, "</table></div>")
    .replace(/<img [^>]*src="(?!https?:)[^"]*"[^>]*>/g, "");   // imagem local do repo não existe no site
  const outros = ITENS.filter((o) => o.tipo === "relatorio" && o.slug !== r.slug).slice(0, 6);
  const fazer = [ITENS.find((k) => k.slug === "pesquisa-de-mercado"), ...pagos.filter((p) => p.slug === "spyops")].filter(Boolean);
  return pagina({
    titulo: `${r.vitrine} · análise de anúncios e funil · Arsenal MktOps`, descricao: `${r.tipo === "spyops" ? "Todos os anúncios ativos, copy literal e funil" : "Pesquisa de mercado"}: ${r.vitrine}. ${r.minutos} min de leitura.`,
    url: `/relatorios/${r.slug}/`, protegido: `relatorio-${r.slug}`, tituloModal: `Entre pra ler: ${r.vitrine}`, ativo: "Relatórios",
    corpo: `${migalha("relatorio", r.vitrine)}
  <article class="leitura" style="padding:20px 0 40px">
    <div class="item-cab"><span class="icone">${ICONE.relatorio}</span><div><p class="label">${r.tipo === "spyops" ? "SpyOps" : "Pesquisa de mercado"} · ${new Date(r.data * 1000).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}</p><h1 style="font-size:clamp(28px,3.8vw,42px);font-weight:600;letter-spacing:-.035em;line-height:1.08">${esc(r.vitrine)}</h1></div></div>
    <p class="meta-rel">${r.minutos} min de leitura · ${r.tipo === "spyops" ? "feito pelo agente SpyOps a partir da Biblioteca de Anúncios da Meta" : "feito com a ferramenta de pesquisa de mercado"}</p>
    ${prot(html, "prosa")}
  </article>
  ${MODO !== "completo" ? "" : `<div>${fazer.length ? `<section class="relacionados"><h2>Faça isso com o seu concorrente</h2><div class="grade">${fazer.map((f) => f.url ? card(f) : cardProduto(f)).join("")}</div></section>` : ""}
  ${relacionadosGrade("Mais relatórios", outros)}</div>`}`,
  });
}

function paginaAula(a) {
  const itens = (a.itens || []).map((s) => ITENS.find((k) => k.slug === s)).filter(Boolean);
  return pagina({
    titulo: `${a.titulo} · aula aberta · Arsenal MktOps`, descricao: `Aula de ${a.min} min: ${a.titulo}. Com as ferramentas usadas nela.`, url: `/aulas/${a.id}/`,
    protegido: `aula-${a.id}`, tituloModal: `Entre pra assistir: ${a.titulo}`, ativo: "Aulas",
    corpo: `${migalha("aula", a.titulo)}
  <div style="padding:20px 0 8px;max-width:960px">
    <div class="item-cab"><span class="icone">${ICONE.aula}</span><div><p class="label">Aula · ${a.min} min</p><h1 style="font-size:clamp(26px,3.4vw,38px);font-weight:600;letter-spacing:-.035em;line-height:1.1">${esc(a.titulo)}</h1></div></div>
    <div class="player${MODO === "completo" ? "" : " protegido"}"${MODO === "completo" ? ` data-video="${a.id}"` : ""}><img src="https://i.ytimg.com/vi/${a.id}/maxresdefault.jpg" alt=""></div>
  </div>
  ${MODO === "completo" ? relacionadosGrade("Ferramentas usadas na aula", itens) : ""}`,
  });
}

function paginaObrigado() {
  const comeco = ["kit-de-arranque", "os-15-agentes", "pesquisa-de-mercado"].map((s) => ITENS.find((k) => k.slug === s)).filter(Boolean)
    .concat(ITENS.filter((k) => k.tipo === "relatorio").slice(0, 3));
  return pagina({
    titulo: "Você está dentro · Arsenal MktOps", descricao: "Seu acesso ao Arsenal MktOps está liberado.", url: "/obrigado/", noindex: true,
    corpo: `<section class="ok">
    <span class="label">Acesso liberado</span>
    <h1>Você está dentro. O portal inteiro está aberto.</h1>
    <p>As ${conta("ferramenta")} ferramentas, os ${conta("agente")} agentes, os ${conta("relatorio")} relatórios e as aulas estão liberados neste navegador. Cada pacote traz um COMECE-AQUI.md com a instalação em português.</p>
    <a class="btn" href="/#catalogo">Explorar o catálogo</a>
  </section>
  ${relacionadosGrade("Por onde começar", comeco)}`,
  });
}

const redireciona = (para) => `<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=${para}"><link rel="canonical" href="${DOMINIO}${para}"><a href="${para}">${para}</a>`;

// ---------- escrita ----------
const PUB = path.join(BUILD, "publico"), COMP = path.join(BUILD, "completo");
fs.rmSync(PUB, { recursive: true, force: true });
fs.rmSync(COMP, { recursive: true, force: true });
function escrever(raiz, rel, html) {
  const f = path.join(raiz, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, html);
}
fs.mkdirSync(path.join(PUB, "assets"), { recursive: true });
for (const a of ["arsenal.css", "arsenal.js"]) fs.copyFileSync(path.join(AQUI, "fonte", a), path.join(PUB, "assets", a));

const urls = ["/"];
const aberta = (rel, gerar, url) => { MODO = "publico"; escrever(PUB, rel, gerar()); if (url) urls.push(url); };
// Página protegida: gera a pública (esqueleto) e a completa (conteúdo) com a mesma função.
const fechada = (rel, gerar, url) => {
  MODO = "publico"; escrever(PUB, rel, gerar());
  MODO = "completo"; escrever(COMP, rel, gerar());
  MODO = "publico"; if (url) urls.push(url);
};
aberta("index.html", paginaIndex);
aberta("obrigado/index.html", paginaObrigado);
aberta("404.html", () => pagina({ titulo: "Não encontrado · Arsenal MktOps", descricao: "Página não encontrada.", url: "/404.html", noindex: true,
  corpo: `<section class="ok"><span class="label">404</span><h1>Essa página não existe.</h1><p>O catálogo inteiro está no início.</p><a class="btn" href="/#catalogo">Ir pro catálogo</a></section>` }));
for (const s of SKILLS) {
  fechada(`ferramentas/${s.slug}/index.html`, () => paginaFerramenta(s), `/ferramentas/${s.slug}/`);
  aberta(`skills/${s.slug}/index.html`, () => redireciona(`/ferramentas/${s.slug}/`));      // endereço antigo
}
for (const a of AGENTES) fechada(`agentes/${a.slug}/index.html`, () => paginaAgente(a), `/agentes/${a.slug}/`);
for (const i of gratis) fechada(`${i.slug}/index.html`, () => paginaSistema(i), `/${i.slug}/`);
for (const i of pagos.filter((p) => !p.link)) aberta(`${i.slug}/index.html`, () => paginaProduto(i), `/${i.slug}/`);
for (const r of RELS) fechada(`relatorios/${r.slug}/index.html`, () => paginaRelatorio(r), `/relatorios/${r.slug}/`);
aberta("relatorios/index.html", () => redireciona("/?tipo=relatorio#catalogo"));
for (const a of cat.aulas || []) fechada(`aulas/${a.id}/index.html`, () => paginaAula(a), `/aulas/${a.id}/`);
escrever(PUB, "sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${DOMINIO}${u}</loc></url>`).join("")}</urlset>\n`);
escrever(PUB, "robots.txt", `User-agent: *\nDisallow: /obrigado/\nDisallow: /downloads/\nDisallow: /entrar\nDisallow: /api/\nSitemap: ${DOMINIO}/sitemap.xml\n`);
console.log(`✓ build/ — ${urls.length} páginas · catálogo com ${TOTAL} itens: ` +
  ["ferramenta", "agente", "sistema", "relatorio", "aula", "material"].map((t) => `${conta(t)} ${TIPO_PLURAL[t].toLowerCase()}`).join(" · "));
