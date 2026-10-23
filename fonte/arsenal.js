(function () {
  "use strict";
  // Login do portal: o servidor guarda a sessão num cookie assinado (deploy/app/server.js).
  // Cadastro → POST /api/cadastro (abre a sessão e manda o lead pro Mautic, formulário 9).
  // Já tem cadastro → POST /api/entrar (link mágico por e-mail, 30 min).
  // A conversão (lead_gerado) dispara uma vez, quando o cadastro é aceito, antes do redirecionamento.
  var FORM_ID = "arsenal-mktops";
  var EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var params = new URLSearchParams(location.search);
  function utm(k) { return params.get(k) || ""; }
  function postar(url, dados, timeoutMs) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var t = ctrl && setTimeout(function () { ctrl.abort(); }, timeoutMs || 8000);
    return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
      body: JSON.stringify(dados), signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { if (t) clearTimeout(t); return r.json().catch(function () { return {}; }).then(function (j) { j.status = r.status; return j; }); });
  }

  // ---------- sessão ----------
  var logado = false;
  function marcarSessao(s) {
    logado = !!(s && s.logado);
    document.body.classList.toggle("logado", logado);
    if (!logado) return;
    document.querySelectorAll("[data-nome]").forEach(function (el) { el.textContent = s.nome || s.email; });
    document.querySelectorAll("[data-inicial]").forEach(function (el) { el.textContent = (s.nome || s.email || "?").charAt(0).toUpperCase(); });
  }
  fetch("/api/sessao", { credentials: "same-origin", cache: "no-store" })
    .then(function (r) { return r.json(); }).then(marcarSessao).catch(function () {});
  document.querySelectorAll("[data-sair]").forEach(function (b) {
    b.addEventListener("click", function () { postar("/api/sair", {}).finally(function () { location.href = "/"; }); });
  });

  // ---------- modal de entrada ----------
  var modal = document.querySelector(".modal");
  var formModal = modal && modal.querySelector("form.captura");
  function modo(m) { if (modal) modal.classList.toggle("link", m === "link"); }
  function aviso(texto) {
    var el = modal && modal.querySelector("[data-aviso]");
    if (!el) return;
    el.textContent = texto || "";
    el.classList.toggle("visivel", !!texto);
  }
  function abrirModal(o) {
    if (!modal) return;
    formModal.setAttribute("data-isca", o.isca || "portal");
    formModal.setAttribute("data-destino", o.destino || (location.pathname + location.search));
    modal.setAttribute("data-proximo", o.destino || (location.pathname + location.search));
    if (o.titulo) modal.querySelector("[data-modal-titulo]").textContent = o.titulo;
    modal.classList.toggle("fixo", !!o.fixo);
    modo(o.modo || "cadastro");
    aviso(o.aviso || "");
    modal.classList.add("aberto");
    if (!o.fixo) setTimeout(function () { var el = modal.querySelector(o.modo === "link" ? ".pedir-link input" : "form.captura input"); if (el) el.focus(); }, 60);
  }
  function fecharModal() { if (modal && !modal.classList.contains("fixo")) modal.classList.remove("aberto"); }
  if (modal) {
    modal.addEventListener("click", function (ev) {
      if (ev.target === modal || ev.target.closest(".fechar")) fecharModal();
      var t = ev.target.closest("[data-modo]");
      if (t) { modo(t.getAttribute("data-modo")); aviso(""); }
    });
    document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") fecharModal(); });
  }
  document.querySelectorAll("[data-entrar]").forEach(function (b) {
    b.addEventListener("click", function (ev) { ev.preventDefault(); abrirModal({ isca: "portal", titulo: "Entrar no portal", destino: "/obrigado/" }); });
  });

  // Página de conteúdo servida na versão pública = sem sessão: borra e abre o modal sem botão de fechar.
  var protegida = document.body.getAttribute("data-protegido");
  if (protegida) {
    document.body.classList.add("bloqueado");
    abrirModal({ isca: protegida, titulo: document.body.getAttribute("data-titulo") || "Entrar no portal", fixo: true });
  }
  // Vindo de um download sem sessão (/?entrar=1) ou de um link mágico vencido (/?link=expirado)
  if (params.get("entrar") === "1") abrirModal({ isca: "download", titulo: "Entre pra baixar", destino: params.get("proximo") || "/" });
  if (params.get("link") === "expirado") abrirModal({ titulo: "Esse link venceu", modo: "link", aviso: "O link de acesso vale 30 minutos. Peça outro abaixo." });

  // Card do catálogo sem sessão: abre o modal ali mesmo e, depois do cadastro, segue pro conteúdo.
  document.querySelectorAll("a.card[data-isca]").forEach(function (a) {
    a.addEventListener("click", function (ev) {
      if (logado) return;
      ev.preventDefault();
      abrirModal({ isca: a.getAttribute("data-isca"), titulo: a.getAttribute("data-titulo"), destino: a.getAttribute("href") });
    });
  });

  document.querySelectorAll("a[data-baixar]").forEach(function (a) {
    a.addEventListener("click", function () {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: "download_isca", isca: a.getAttribute("data-baixar") });
    });
  });

  // ---------- aula: o player só existe na versão completa ----------
  var player = document.querySelector(".player[data-video]");
  if (player) {
    player.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + player.getAttribute("data-video") +
      '?rel=0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen title="Aula"></iframe>';
  }

  // ---------- catálogo: tipo × área × busca ----------
  var cards = document.querySelectorAll(".catalogo .card");
  var abas = document.querySelectorAll(".chip[data-tipo]");
  var selArea = document.querySelector("select[data-area]");
  var busca = document.querySelector(".catalogo .busca input");
  var estado = { tipo: params.get("tipo") || "todos", area: params.get("area") || "todas", q: params.get("q") || "" };
  function semAcento(t) { return (t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function filtrar() {
    var q = semAcento(estado.q), n = 0;
    cards.forEach(function (c) {
      var ok = (estado.tipo === "todos" || c.getAttribute("data-tipo") === estado.tipo) &&
        (estado.area === "todas" || c.getAttribute("data-area") === estado.area) &&
        (!q || semAcento(c.textContent).indexOf(q) !== -1);
      c.hidden = !ok;
      if (ok) n++;
    });
    abas.forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-tipo") === estado.tipo ? "true" : "false"); });
    var cont = document.querySelector("[data-contagem]");
    if (cont) cont.textContent = n + (n === 1 ? " item" : " itens");
    var vazio = document.querySelector(".vazio");
    if (vazio) vazio.style.display = n ? "none" : "block";
    document.querySelectorAll(".lateral a.nav[data-tipo]").forEach(function (a) {
      a.classList.toggle("ativo", a.getAttribute("data-tipo") === estado.tipo);
    });
  }
  if (cards.length) {
    abas.forEach(function (b) { b.addEventListener("click", function () { estado.tipo = b.getAttribute("data-tipo"); filtrar(); }); });
    if (selArea) { selArea.value = estado.area; selArea.addEventListener("change", function () { estado.area = selArea.value; filtrar(); }); }
    if (busca) { busca.value = estado.q; busca.addEventListener("input", function () { estado.q = busca.value; filtrar(); }); }
    document.querySelectorAll(".lateral a.nav[data-tipo], .lateral a.nav[data-area-link]").forEach(function (a) {
      a.addEventListener("click", function (ev) {
        ev.preventDefault();
        if (a.hasAttribute("data-tipo")) estado.tipo = a.getAttribute("data-tipo");
        if (a.hasAttribute("data-area-link")) { estado.area = a.getAttribute("data-area-link"); if (selArea) selArea.value = estado.area; }
        filtrar();
        document.querySelector(".lateral").classList.remove("aberta");
        document.querySelector(".catalogo").scrollIntoView({ behavior: "smooth" });
      });
    });
    filtrar();
    if (params.get("tipo") || params.get("area") || params.get("q")) document.querySelector(".catalogo").scrollIntoView();
  }

  var buscaTopo = document.querySelector(".busca-topo input");
  if (buscaTopo) {
    buscaTopo.addEventListener("keydown", function (ev) {
      if (ev.key !== "Enter") return;
      if (busca) { estado.q = buscaTopo.value; busca.value = buscaTopo.value; filtrar(); document.querySelector(".catalogo").scrollIntoView({ behavior: "smooth" }); }
      else location.href = "/?q=" + encodeURIComponent(buscaTopo.value) + "#catalogo";
    });
    document.addEventListener("keydown", function (ev) {
      if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === "k") { ev.preventDefault(); buscaTopo.focus(); }
    });
  }

  var lateral = document.querySelector(".lateral");
  document.querySelectorAll(".menu-btn").forEach(function (b) {
    b.addEventListener("click", function (ev) { ev.stopPropagation(); lateral.classList.toggle("aberta"); });
  });
  document.addEventListener("click", function (ev) {
    if (lateral && lateral.classList.contains("aberta") && !ev.target.closest(".lateral")) lateral.classList.remove("aberta");
  });

  // ---------- cadastro ----------
  function valor(form, nome) { var el = form.elements[nome]; return el ? (el.value || "").trim() : ""; }
  function valida(form) {
    var ok = true, primeiro = null;
    form.querySelectorAll(".campo").forEach(function (c) {
      var nome = c.getAttribute("data-campo"), v = valor(form, nome), invalido;
      if (nome === "email") invalido = !EMAIL_OK.test(v);
      else if (nome === "telefone") invalido = !/^\d{10,11}$/.test(v.replace(/\D/g, ""));
      else if (nome === "perfil") invalido = !v;
      else invalido = v.length < 2;
      c.classList.toggle("invalido", invalido);
      if (invalido) { ok = false; if (!primeiro) primeiro = c; }
    });
    if (primeiro) { var foco = primeiro.querySelector("input, select"); if (foco) foco.focus(); }
    return ok;
  }

  var enviando = false;
  function enviar(form) {
    if (!valida(form)) return;                       // formulário inválido: nenhum evento, nenhum redirect
    if (enviando) return;
    enviando = true;
    var btn = form.querySelector(".btn"), rotulo = btn.textContent;
    var erro = form.querySelector(".erro-envio");
    if (erro) erro.classList.remove("visivel");
    btn.disabled = true; btn.textContent = "Entrando…";

    var isca = form.getAttribute("data-isca") || "portal";
    var destino = form.getAttribute("data-destino") || (location.pathname + location.search);
    var payload = {
      nome: valor(form, "nome"), email: valor(form, "email").toLowerCase(),
      telefone: valor(form, "telefone").replace(/\D/g, ""), perfil: valor(form, "perfil"), isca: isca,
      utm_source: utm("utm_source"), utm_medium: utm("utm_medium"), utm_campaign: utm("utm_campaign"), utm_content: utm("utm_content"),
      empresa_site: valor(form, "empresa_site")      // robô preenche, gente deixa vazio
    };

    // O cadastro É o login: a sessão só existe depois que o servidor responde, então aqui se espera a resposta.
    // O lead no Mautic sai do servidor depois disso e nunca segura a entrada.
    postar("/api/cadastro", payload, 8000).then(function (r) {
      if (!r.ok) throw new Error("cadastro " + r.status);
      var redirecionou = false;
      function go() {
        if (redirecionou) return;
        redirecionou = true;
        var url = new URL(destino, location.origin);
        params.forEach(function (v, k) { if (!url.searchParams.has(k) && k !== "entrar" && k !== "proximo") url.searchParams.set(k, v); });
        location.href = url.pathname + url.search + url.hash;
      }
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        event: "lead_gerado",
        form_id: FORM_ID,
        isca: isca,
        perfil: payload.perfil,
        pagina: location.pathname,
        utm_source: payload.utm_source,
        utm_medium: payload.utm_medium,
        utm_campaign: payload.utm_campaign,
        eventCallback: go,                           // segue assim que as tags dispararem
        eventTimeout: 1500                           // ...ou em 1,5s, se o GTM travar
      });
      setTimeout(go, 1800);                          // GTM bloqueado nunca segura a entrada
    }).catch(function () {
      enviando = false;
      btn.disabled = false; btn.textContent = rotulo;
      if (erro) erro.classList.add("visivel");
    });
  }

  // ---------- link mágico ----------
  document.querySelectorAll("form.pedir-link").forEach(function (form) {
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!valida(form)) return;
      var btn = form.querySelector(".btn");
      btn.disabled = true; btn.textContent = "Mandando…";
      postar("/api/entrar", { email: valor(form, "email").toLowerCase(), proximo: (modal && modal.getAttribute("data-proximo")) || location.pathname })
        .then(function (r) {
          aviso(r.status === 429 ? "Muitos pedidos seguidos. Espere alguns minutos e tente de novo."
            : "Se esse e-mail tiver cadastro, o link chega em até 2 minutos. Confira também o spam.");
        })
        .catch(function () { aviso("Não deu pra mandar agora. Tente de novo em instantes."); })
        .finally(function () { btn.disabled = false; btn.textContent = "Mandar o link"; });
    });
  });

  function mascaraTelefone(el) {
    var d = el.value.replace(/\D/g, "").slice(0, 11);
    if (d.length > 10) el.value = "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
    else if (d.length > 6) el.value = "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
    else if (d.length > 2) el.value = "(" + d.slice(0, 2) + ") " + d.slice(2);
    else el.value = d.length ? "(" + d : "";
  }
  document.querySelectorAll('input[name="telefone"]').forEach(function (el) {
    el.addEventListener("input", function (ev) { if (!/^delete/.test(ev.inputType || "")) mascaraTelefone(el); });
    el.addEventListener("blur", function () { mascaraTelefone(el); });
  });
  document.querySelectorAll("form.captura").forEach(function (form) {
    form.addEventListener("submit", function (ev) { ev.preventDefault(); enviar(form); });
  });
  document.querySelectorAll("form.captura input, form.captura select, form.pedir-link input").forEach(function (el) {
    function limpa() { var c = el.closest(".campo"); if (c) c.classList.remove("invalido"); }
    el.addEventListener("input", limpa);
    el.addEventListener("change", limpa);
  });
})();
