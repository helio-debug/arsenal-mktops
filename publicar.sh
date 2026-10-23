#!/usr/bin/env bash
# publicar.sh — gera o portal e sobe pro cluster (arsenal.studioartemis.co).
#
#   ./publicar.sh            gera as páginas (montar.mjs) e sobe
#   ./publicar.sh --tudo     reempacota os downloads (empacotar.py) antes
#   ./publicar.sh --servidor também aplica o chart (mudou server.js ou deploy/)
#
# O conteúdo vai pro PVC do pod numa pasta nova e troca com a antiga num mv: quem está navegando
# não pega o portal pela metade.
set -euo pipefail
cd "$(dirname "$0")"

[[ " $* " == *" --tudo "* ]] && python3 empacotar.py
node montar.mjs
[[ " $* " == *" --servidor "* ]] && helm upgrade --install arsenal ./deploy && kubectl rollout status deploy/arsenal --timeout=120s

echo "→ subindo build/ ($(du -sh build | cut -f1))"
tar -C build -czf - publico completo downloads | kubectl exec -i deploy/arsenal -- sh -c '
  set -e
  rm -rf /data/novo && mkdir -p /data/novo
  tar -xzf - -C /data/novo
  rm -rf /data/velho
  [ -d /data/site ] && mv /data/site /data/velho
  mv /data/novo /data/site
  rm -rf /data/velho
  echo "  $(find /data/site -type f | wc -l) arquivos no ar"'

curl -fsS -o /dev/null -w "→ https://arsenal.studioartemis.co/ respondeu %{http_code}\n" https://arsenal.studioartemis.co/ || echo "→ (ainda sem DNS/TLS no domínio)"
