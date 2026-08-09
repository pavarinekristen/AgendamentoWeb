# AgendamentoWeb — SparkCore Mobile

App web mobile-first de **acesso rápido na rua** para a diretoria: login + busca
instantânea de clientes (estilo Spotlight). **Não tem back-end próprio** — consome
a mesma RetaguardaAgendamentoAPI (`http://45.56.77.43:9090`) do SparkCore desktop.

## Rodar

```
cd C:\AgendamentoWeb
npm install   (primeira vez)
npm run dev
```

Abra `http://localhost:5000`. Para usar no celular na mesma rede Wi-Fi, use o
endereço "Network" que o Vite imprime no terminal (ex.: `http://192.168.x.x:5000`).

## Endpoints consumidos (mapeados do sistema atual)

| Uso            | Rota                                     | Detalhe                                            |
| -------------- | ---------------------------------------- | -------------------------------------------------- |
| Login          | `POST /auth/login`                       | body `{ email, senha }` → `{ token, usuario, ... }` |
| Sessão         | `GET /auth/me`                           | valida o Bearer token ao abrir o app               |
| Busca (Ctrl+K) | `GET /portal/clientes?nome=...&limite=20`| Bearer token; `nome` casa também com telefone/CPF via `DADOS_JSON` |
| Detalhe        | `GET /portal/clientes/{idLocal}`         | cadastro completo + histórico de consultas         |

Obs.: o Ctrl+K do desktop busca no SQLite local sincronizado; o equivalente
servidor é a rota `portal/clientes`, que consulta os mesmos dados no Postgres.

## Quem pode entrar

Quem autoriza é a API: entra qualquer conta ativa e confirmada em `RET_USUARIO`
(hoje `kristenpp2003@gmail.com`, com 2FA por e-mail, e `clinica.ideia@gmail.com`).

A antiga `VITE_ALLOWED_EMAILS` foi removida: a lista era compilada dentro do
bundle, então celular/PC com versão antiga em cache continuava mostrando
"Este acesso é exclusivo da diretoria" para uma conta já liberada. Para
restringir de verdade, a validação tem que ser no servidor (M3 em
`docs/PENDENCIAS_SEGURANCA.txt`).

## Publicar em produção (opcional, futuro)

`npm run build` gera `dist/` estático. Ao hospedar fora do Vite dev:

1. Defina `VITE_API_BASE_URL=http://45.56.77.43:9090` no `.env` antes do build.
2. Adicione a origem do site em `Cors:AllowedOrigins` no `appsettings` da
   RetaguardaAgendamentoAPI (mudança só de configuração, sem código novo).
