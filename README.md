# Arsenal MktOps

Portal open source de conhecimento e ferramentas de IA, mantido pela [Studio Artemis](https://studioartemis.co).
No ar em **https://arsenal.studioartemis.co**.

Os cursos de IA cobram caro pra ensinar o que deveria ser aberto. O Arsenal publica o que a operação da
Artemis usa todo dia: ferramentas (skills do Claude Code), agentes, sistemas prontos, aulas e análises de
anúncios de concorrentes. Entra com um cadastro grátis, sem prazo.

## O que tem neste repositório

O código do portal:

| | |
|---|---|
| `montar.mjs` | gera o site a partir de `catalogo.json`, `titulos.json` e `agentes.json`: catálogo, uma página por item, versão pública e versão completa |
| `fonte/` | CSS e JavaScript do front (catálogo, busca ⌘K, modal de entrada) |
| `deploy/app/server.js` | servidor em Node puro, sem dependências: sessão em cookie assinado (HMAC), cadastro, link mágico por e-mail, entrega protegida das páginas e dos downloads |
| `deploy/` | chart Helm (imagem `node:22-alpine` + servidor montado de um ConfigMap + volume com o conteúdo) |
| `publicar.sh` | gera e sobe o conteúdo pro volume trocando a pasta inteira de uma vez |

O conteúdo (as ferramentas, os agentes e os relatórios) sai pelo próprio portal, depois do cadastro.

## Rodar localmente

```bash
npm install
node montar.mjs            # precisa de gerado/skills.json e gerado/relatorios.json
SESSION_SECRET=$(openssl rand -base64 48) SITE_DIR=$PWD/build PORT=3000 node deploy/app/server.js
```
