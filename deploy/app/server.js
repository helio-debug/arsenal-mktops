// Arsenal MktOps — servidor do portal (arsenal.studioartemis.co).
// Só biblioteca padrão do Node: roda na imagem node:22-alpine com este arquivo montado de um ConfigMap.
//
// Login sem banco: a sessão é um cookie assinado (HMAC-SHA256 com SESSION_SECRET). Quem se cadastra
// já sai logado; quem volta em outro aparelho pede o link mágico, que chega pelo Mautic e vale 30 min.
//
// O conteúdo vive no volume em SITE_DIR:
//   publico/    o que qualquer um vê (catálogo + páginas de item com o conteúdo trocado por esqueleto)
//   completo/   as mesmas páginas com o conteúdo de verdade — só sai com sessão válida
//   downloads/  os pacotes — só saem com sessão válida
"use strict";
const http = require("node:http");
const https = require("node:https");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT || 3000);
const SITE_DIR = process.env.SITE_DIR || "/data/site";
const ORIGEM = process.env.PUBLIC_ORIGIN || "https://arsenal.studioartemis.co";
const SEGREDO = process.env.SESSION_SECRET || "";
const MAUTIC_URL = (process.env.MAUTIC_URL || "").replace(/\/$/, "");
const MAUTIC_AUTH = Buffer.from(`${process.env.MAUTIC_USER || ""}:${process.env.MAUTIC_PASSWORD || ""}`).toString("base64");
const MAUTIC_FORM_ID = process.env.MAUTIC_FORM_ID || "9";
const MAUTIC_FORM_ALIAS = process.env.MAUTIC_FORM_ALIAS || "mktops__ar";
const MAUTIC_EMAIL_LINK = process.env.MAUTIC_EMAIL_LINK || "";      // e-mail do link mágico
const COOKIE = "arsenal_sessao";
const SESSAO_DIAS = 400;
const LINK_MIN = 30;
if (SEGREDO.length < 32) { console.error("SESSION_SECRET ausente ou curto"); process.exit(1); }

// ---------- assinatura ----------
const b64 = (s) => Buffer.from(s).toString("base64url");
const assinar = (dados) => { const p = b64(JSON.stringify(dados)); return `${p}.${crypto.createHmac("sha256", SEGREDO).update(p).digest("base64url")}`; };
function conferir(token) {
  if (!token || token.indexOf(".") < 0) return null;
  const [p, s] = token.split(".");
  const esperado = crypto.createHmac("sha256", SEGREDO).update(p).digest("base64url");
  if (s.length !== esperado.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(esperado))) return null;
  try {
    const d = JSON.parse(Buffer.from(p, "base64url").toString());
    if (d.x && Date.now() > d.x) return null;
    return d;
  } catch { return null; }
}
function sessaoDe(req) {
  const m = (req.headers.cookie || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  const d = m && conferir(m[1]);
  return d && d.k === "s" ? d : null;
}
function abrirSessao(res, nome, email) {
  const v = assinar({ k: "s", n: nome, e: email, x: Date.now() + SESSAO_DIAS * 864e5 });
  res.setHeader("Set-Cookie", `${COOKIE}=${v}; Path=/; Max-Age=${SESSAO_DIAS * 86400}; HttpOnly; Secure; SameSite=Lax`);
}

// ---------- utilidades ----------
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function json(res, status, corpo) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(corpo));
}
function lerCorpo(req, limite = 16 * 1024) {
  return new Promise((ok, erro) => {
    let t = "";
    req.on("data", (c) => { t += c; if (t.length > limite) { erro(new Error("grande")); req.destroy(); } });
    req.on("end", () => { try { ok(t ? JSON.parse(t) : {}); } catch (e) { erro(e); } });
    req.on("error", erro);
  });
}
const txt = (v, max = 200) => String(v || "").trim().slice(0, max);
// Só caminho interno: nada de //host nem esquema, pra o link mágico não virar redirecionamento aberto.
const proximoSeguro = (p) => (typeof p === "string" && /^\/(?!\/)[\w\-./?=&%#]*$/.test(p) ? p : "/");

function mautic(metodo, caminho, corpo, tipo = "json") {
  return new Promise((ok) => {
    const url = new URL(MAUTIC_URL + caminho);
    const dados = corpo == null ? null : (tipo === "json" ? JSON.stringify(corpo) : corpo);
    const req = https.request(url, {
      method: metodo, timeout: 10000,
      headers: {
        Authorization: `Basic ${MAUTIC_AUTH}`,
        ...(dados ? { "Content-Type": tipo === "json" ? "application/json" : "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(dados) } : {}),
      },
    }, (res) => { let t = ""; res.on("data", (c) => (t += c)); res.on("end", () => { let j = null; try { j = JSON.parse(t); } catch {} ok({ status: res.statusCode, json: j }); }); });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (e) => { console.error("mautic", metodo, caminho, e.message); ok({ status: 0, json: null }); });
    if (dados) req.write(dados);
    req.end();
  });
}

// Limite simples por IP pro pedido de link (evita usar o portal pra disparar e-mail em massa).
const pedidos = new Map();
function estourou(ip, max = 5, janelaMs = 10 * 60e3) {
  const agora = Date.now();
  const lista = (pedidos.get(ip) || []).filter((t) => agora - t < janelaMs);
  lista.push(agora);
  pedidos.set(ip, lista);
  if (pedidos.size > 5000) pedidos.clear();
  return lista.length > max;
}
const ipDe = (req) => String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();

// ---------- API ----------
async function cadastro(req, res) {
  let b;
  try { b = await lerCorpo(req); } catch { return json(res, 400, { ok: false }); }
  const d = {
    nome: txt(b.nome, 120), email: txt(b.email, 160).toLowerCase(), telefone: txt(b.telefone, 20).replace(/\D/g, ""),
    perfil: txt(b.perfil, 80), isca: txt(b.isca, 120),
    utm_source: txt(b.utm_source), utm_medium: txt(b.utm_medium), utm_campaign: txt(b.utm_campaign), utm_content: txt(b.utm_content),
  };
  const erros = [];
  if (d.nome.length < 2) erros.push("nome");
  if (!EMAIL_OK.test(d.email)) erros.push("email");
  if (!/^\d{10,11}$/.test(d.telefone)) erros.push("telefone");
  if (!d.perfil) erros.push("perfil");
  if (erros.length) return json(res, 422, { ok: false, erros });
  abrirSessao(res, d.nome, d.email);
  json(res, 200, { ok: true, nome: d.nome });
  if (txt(b.empresa_site)) return;                     // armadilha de robô: entra, mas não vira lead
  // Lead no Mautic depois de responder: a entrada nunca espera o CRM.
  const f = new URLSearchParams();
  f.set("mauticform[formId]", MAUTIC_FORM_ID);
  f.set("mauticform[formName]", MAUTIC_FORM_ALIAS);
  for (const [k, v] of Object.entries({ nome: d.nome, email: d.email, telefone: d.telefone, perfil: d.perfil, isca: d.isca,
    lead_utm_source: d.utm_source, lead_utm_medium: d.utm_medium, lead_utm_campaign: d.utm_campaign, lead_utm_content: d.utm_content })) f.set(`mauticform[${k}]`, v);
  f.set("mauticform[return]", "");
  f.set("mauticform[messenger]", "1");
  const r = await mautic("POST", `/form/submit?formId=${MAUTIC_FORM_ID}`, f.toString(), "form");
  console.log("cadastro", d.isca, r.status);
}

async function pedirLink(req, res) {
  let b;
  try { b = await lerCorpo(req); } catch { return json(res, 400, { ok: false }); }
  const email = txt(b.email, 160).toLowerCase();
  if (!EMAIL_OK.test(email)) return json(res, 422, { ok: false, erros: ["email"] });
  if (estourou(ipDe(req))) return json(res, 429, { ok: false });
  json(res, 200, { ok: true });                       // mesma resposta com ou sem cadastro: não revela quem está na base
  if (!MAUTIC_EMAIL_LINK) return console.error("MAUTIC_EMAIL_LINK ausente");
  const busca = await mautic("GET", `/api/contacts?search=${encodeURIComponent(`email:${email}`)}&limit=1&minimal=true`);
  const contatos = busca.json && busca.json.contacts ? Object.values(busca.json.contacts) : [];
  const c = contatos[0];
  if (!c) return console.log("link: e-mail sem cadastro");
  const f = (c.fields && c.fields.all) || {};
  const token = assinar({ k: "l", n: f.firstname || "", e: email, x: Date.now() + LINK_MIN * 60e3 });
  const link = `${ORIGEM}/entrar?t=${encodeURIComponent(token)}&proximo=${encodeURIComponent(proximoSeguro(b.proximo))}`;
  const r = await mautic("POST", `/api/emails/${MAUTIC_EMAIL_LINK}/contact/${c.id}/send`, { tokens: { "{arsenal_link}": link } });
  console.log("link enviado", c.id, r.status);
}

function entrarPorLink(req, res, url) {
  const d = conferir(url.searchParams.get("t"));
  if (!d || d.k !== "l") {
    res.writeHead(302, { Location: "/?link=expirado", "Cache-Control": "no-store" });
    return res.end();
  }
  abrirSessao(res, d.n, d.e);
  res.writeHead(302, { Location: proximoSeguro(url.searchParams.get("proximo")), "Cache-Control": "no-store" });
  res.end();
}

// ---------- arquivos ----------
const TIPOS = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json", ".xml": "application/xml", ".txt": "text/plain; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".pdf": "application/pdf", ".zip": "application/zip", ".ico": "image/x-icon" };

function resolver(raiz, caminho) {
  const alvo = path.normalize(path.join(raiz, caminho));
  if (!alvo.startsWith(raiz + path.sep) && alvo !== raiz) return null;      // ../ não sai da pasta
  try {
    const st = fs.statSync(alvo);
    if (st.isDirectory()) { const idx = path.join(alvo, "index.html"); return fs.existsSync(idx) ? idx : null; }
    return st.isFile() ? alvo : null;
  } catch { return null; }
}

function enviarArquivo(req, res, arquivo, privado) {
  const ext = path.extname(arquivo).toLowerCase();
  const st = fs.statSync(arquivo);
  const cabecalhos = {
    "Content-Type": TIPOS[ext] || "application/octet-stream",
    "Content-Length": st.size,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": privado ? "private, no-store" : (ext === ".html" ? "no-cache" : "public, max-age=3600"),
  };
  if (privado && ext !== ".html") cabecalhos["Content-Disposition"] = `attachment; filename="${path.basename(arquivo)}"`;
  if (ext === ".html") cabecalhos.Vary = "Cookie";
  res.writeHead(200, cabecalhos);
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(arquivo).pipe(res);
}

function servir(req, res, url) {
  let caminho;
  try { caminho = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end(); }
  // endereço sem barra final que é pasta → com barra (os links relativos dependem disso)
  if (!path.extname(caminho) && !caminho.endsWith("/")) {
    res.writeHead(301, { Location: caminho + "/" + url.search });
    return res.end();
  }
  const sessao = sessaoDe(req);
  if (caminho.startsWith("/downloads/")) {
    if (!sessao) {
      res.writeHead(302, { Location: `/?entrar=1&proximo=${encodeURIComponent(caminho)}`, "Cache-Control": "no-store" });
      return res.end();
    }
    const f = resolver(path.join(SITE_DIR, "downloads"), caminho.slice("/downloads".length));
    if (f) return enviarArquivo(req, res, f, true);
  } else {
    const completo = sessao && resolver(path.join(SITE_DIR, "completo"), caminho);
    if (completo) return enviarArquivo(req, res, completo, true);
    const publico = resolver(path.join(SITE_DIR, "publico"), caminho);
    if (publico) return enviarArquivo(req, res, publico, false);
  }
  const nf = resolver(path.join(SITE_DIR, "publico"), "/404.html");
  res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
  res.end(nf ? fs.readFileSync(nf) : "Não encontrado");
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, ORIGEM);
  try {
    if (url.pathname === "/api/health") return json(res, 200, { ok: true });
    if (url.pathname === "/api/sessao") {
      const s = sessaoDe(req);
      return json(res, 200, s ? { logado: true, nome: s.n, email: s.e } : { logado: false });
    }
    if (req.method === "POST" && url.pathname === "/api/cadastro") return await cadastro(req, res);
    if (req.method === "POST" && url.pathname === "/api/entrar") return await pedirLink(req, res);
    if (req.method === "POST" && url.pathname === "/api/sair") {
      res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
      return json(res, 200, { ok: true });
    }
    if (url.pathname === "/entrar") return entrarPorLink(req, res, url);
    if (req.method === "GET" || req.method === "HEAD") return servir(req, res, url);
    res.writeHead(405); res.end();
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, 500, { ok: false });
  }
}).listen(PORT, () => console.log(`arsenal na porta ${PORT}, conteúdo em ${SITE_DIR}`));
