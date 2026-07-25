# Plano Passkeys / WebAuthn — SparkCore Agendamento

Objetivo: login por **passkey** (digital no celular / PIN do Windows no PC / QR num PC
de fora), mantendo o **OTP por e-mail atual só como recuperação**. Modelo híbrido, que
é o padrão recomendado em 2025/2026.

Repositórios envolvidos:
- **Front (este repo):** `src/lib/api.ts`, `src/screens/LoginScreen.tsx` + 1 tela nova de gestão.
- **API .NET (`RetaguardaAgendamentoAPI`, outro projeto):** 4 rotas novas + tabela nova.

---

## 1. Decisões de configuração (definir ANTES de codar)

| Item | Valor | Porquê |
|---|---|---|
| **RP ID** (domínio da passkey) | o domínio de produção, ex. `agendamento.suaclinica.com.br` | A passkey é amarrada ao domínio. Tem que ser o domínio real, sem `https://` e sem porta. |
| **Origin** aceito | `https://<RP_ID>` (prod) e `http://localhost:5173` (dev) | WebAuthn exige HTTPS (localhost é exceção). |
| **userVerification** | `required` | Força digital/PIN sempre (não deixa passar só "presença"). |
| **residentKey / discoverable** | `required` | Permite login **sem digitar e-mail** ("Entrar com passkey" direto). |
| **authenticatorAttachment** no cadastro | não travar (deixar escolher) | Assim o mesmo botão cadastra Windows Hello no PC **e** aceita celular. QR (cross-device) funciona sozinho. |
| Fallback | OTP por e-mail (já existe: `/auth/login/2fa`) | Só aparece para cadastrar aparelho novo ou recuperar. |

> Se um dia quiser travar em "só aparelho físico deste dono" (sem QR de PC estranho),
> muda `authenticatorAttachment: "platform"` no `register/begin`. Fica anotado, mas o
> padrão recomendado é não travar.

---

## 2. API .NET — o que precisa existir (contrato)

Biblioteca sugerida: **`Fido2` (fido2-net-lib / passwordless-lib)** — é a lib de facto
pra WebAuthn em .NET. Evita implementar validação de atestação/asserção na mão.

### 2.1 Tabela nova: `PasskeyCredentials`
```
Id            (PK)
UsuarioId     (FK do dono)
CredentialId  byte[]   -- único, indexado
PublicKey     byte[]
SignCount     long
AaGuid        Guid
Transports    text     -- ex.: "internal,hybrid"
Apelido       text     -- "Celular do dono", "PC da clínica"
CriadoEm      timestamptz
UltimoUsoEm   timestamptz (nullable)
```

### 2.2 Rotas

**Cadastro (exige estar logado — o portão é o login atual com OTP):**
- `POST /auth/passkey/register/begin`
  - Auth: Bearer obrigatório.
  - Retorna `PublicKeyCredentialCreationOptions` (challenge, rp, user, pubKeyCredParams,
    excludeCredentials das já cadastradas, authenticatorSelection).
  - Guarda o challenge na sessão/cache por ~2 min.
- `POST /auth/passkey/register/finish`
  - Auth: Bearer obrigatório. Body: resposta de atestação + `apelido`.
  - Valida com a lib, grava a credencial na tabela. Retorna `{ sucesso, id, apelido }`.

**Login (sem estar logado):**
- `POST /auth/passkey/login/begin`
  - Body: `{ email? }` (opcional — com discoverable dá pra omitir).
  - Retorna `PublicKeyCredentialRequestOptions` (challenge, allowCredentials, userVerification).
  - Guarda o challenge por ~2 min.
- `POST /auth/passkey/login/finish`
  - Body: resposta de asserção.
  - Valida assinatura + **incrementa/checa SignCount** (anti-clonagem), atualiza `UltimoUsoEm`.
  - Retorna **o mesmo shape do `/auth/login/2fa`**: `{ token, expiraEm, usuario, empresa }`.

**Gestão (opcional, mas recomendado):**
- `GET /auth/passkey` → lista credenciais (id, apelido, criadoEm, ultimoUsoEm).
- `DELETE /auth/passkey/{id}` → revoga um aparelho perdido.

### 2.3 Regras de segurança
- Challenge de uso único, expira em ~2 min, amarrado à sessão.
- Validar `origin` e `rpIdHash` contra a lista permitida.
- Rejeitar se `SignCount` retroceder (sinal de credencial clonada).
- Manter o **lockout/rate-limit** que já existe no login atual também nessas rotas.
- Nunca apagar o caminho do OTP: é a recuperação.

---

## 3. Front (este repo) — o que eu implemento

### 3.1 Dependência
Adicionar **`@github/webauthn-json`** (lib minúscula, ~3 KB, mantida pelo GitHub) que
converte o JSON da API ↔ os objetos binários do `navigator.credentials`. Evita mexer
com ArrayBuffer/base64url na mão.

```
npm i @github/webauthn-json
```

### 3.2 `src/lib/api.ts` — funções novas
```ts
import { create, get } from "@github/webauthn-json";

// checa suporte do navegador (esconde o botão onde não rola)
export function passkeySuportada(): boolean {
  return typeof window !== "undefined"
    && !!window.PublicKeyCredential
    && !!navigator.credentials;
}

// --- Cadastro (usuário já logado via OTP) ---
export async function cadastrarPasskey(apelido: string): Promise<void> {
  const options = await request<any>("/auth/passkey/register/begin", { method: "POST" });
  const credential = await create({ publicKey: options });
  await request("/auth/passkey/register/finish", {
    method: "POST",
    body: JSON.stringify({ ...credential, apelido }),
  });
}

// --- Login por passkey ---
export async function loginPasskey(email?: string): Promise<AuthResponse> {
  const options = await request<any>(
    "/auth/passkey/login/begin",
    { method: "POST", body: JSON.stringify({ email }) },
    false,
  );
  const assertion = await get({ publicKey: options });
  const auth = await request<AuthResponse>(
    "/auth/passkey/login/finish",
    { method: "POST", body: JSON.stringify(assertion) },
    false,
  );
  if (!auth?.token) throw new ApiError(auth?.mensagem ?? "Falha na passkey.", 401);
  return auth;
}

// --- Gestão ---
export async function listarPasskeys(): Promise<{id:string;apelido:string;criadoEm:string;ultimoUsoEm?:string}[]> {
  return request("/auth/passkey");
}
export async function revogarPasskey(id: string): Promise<void> {
  await request(`/auth/passkey/${encodeURIComponent(id)}`, { method: "DELETE" });
}
```

### 3.3 `src/screens/LoginScreen.tsx` — mudanças
- Botão principal **"Entrar com passkey"** (digital/PIN/QR) no topo do form, visível só
  se `passkeySuportada()`. Chama `loginPasskey()` → em sucesso, `concluirLogin`.
- Manter e-mail+senha+OTP **abaixo**, como "Entrar de outro jeito" (recuperação).
- Tratar cancelamento do usuário (`NotAllowedError`) sem mostrar erro feio.

### 3.4 Tela nova de gestão (dentro do app, já logado)
- "Meus dispositivos": lista `listarPasskeys()`, botão **"Cadastrar este dispositivo"**
  (`cadastrarPasskey`) e **"Remover"** (`revogarPasskey`).
- É onde o dono, logado via OTP num aparelho novo, promove aquele aparelho a passkey.

---

## 4. Fluxo completo (como fica na vida real)

1. **1ª vez, no celular:** loga com e-mail+senha+OTP → abre "Meus dispositivos" →
   "Cadastrar este dispositivo" → confirma com a digital. Pronto.
2. **Dia a dia, celular:** "Entrar com passkey" → digital → dentro.
3. **Seu PC:** cadastra uma vez (Windows Hello) → depois é só o **PIN do Windows**.
4. **PC de fora:** "Entrar com passkey" → aparece **QR** → escaneia com o celular →
   confirma digital → o PC entra. Nada fica salvo no PC.
5. **Perdeu celular + PC:** cai no **OTP por e-mail** de sempre → cadastra o aparelho novo →
   entra em "Meus dispositivos" e **remove** o aparelho perdido.

---

## 5. Ordem de execução

1. API: criar tabela + instalar `Fido2` + as 4 rotas (register/login begin+finish).
2. API: rotas de gestão (`GET`/`DELETE`).
3. Front: `npm i @github/webauthn-json` + funções no `api.ts`.
4. Front: tela "Meus dispositivos".
5. Front: botão "Entrar com passkey" no `LoginScreen`.
6. Testar em HTTPS real (passkey não roda em `http://` que não seja localhost).
7. Cadastrar celular + PC do dono; validar QR num PC de fora; validar recuperação por OTP.

## 6. Esforço estimado
- **API .NET:** o grosso do trabalho — ~1 a 1,5 sprint (tabela, lib, 6 rotas, validação, testes).
- **Front (este repo):** ~2 a 3 dias (funções + 1 tela + ajuste do login).
- **Pré-requisito de deploy:** já está em HTTPS na Hostinger, então ok.

## 7. Riscos / atenção
- **RP ID errado** = passkey "some" ao trocar de subdomínio. Fixar o domínio antes.
- **Dev x prod:** passkey cadastrada em `localhost` não vale em produção (origins diferentes) — normal, só testar em cada ambiente.
- **Não remover o OTP** enquanto não houver ao menos 1 passkey cadastrada e testada.
