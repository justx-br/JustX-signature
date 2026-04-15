# Exclusão de conta (JustX → Documenso): fluxo e detalhes

Este documento descreve **como a exclusão de conta do usuário JustX aciona o “delete/disable” no Documenso (fork `JustX-signature`)**, com os detalhes de cada etapa: autenticação, payloads, idempotência, efeitos colaterais e o que **não** acontece (ex.: hard delete).

## Visão geral (1 linha)

No **JustX**, a exclusão é principalmente **soft delete + limpeza de identidade/perfil**; no **Documenso**, o correspondente é **desativar o usuário (`disabled=true`)** via endpoint interno **`POST /api/internal/justx/delete-user`**, executando `disableUser()` (transação Prisma) que invalida tokens/webhooks e remove passkeys.

## Parte 1 — JustX (backend FastAPI)

### Endpoint HTTP

- **Rota**: `DELETE /api/user/account`
- **Handler**: `delete_account` em `JustX/app/api/user/router.py`
- **Serviço**: `UserService.delete_account` em `JustX/app/api/user/service.py`

### O que o JustX faz no banco (comportamento “delete”)

`delete_account` valida a senha e então:

1. **Soft delete** do registro em `users` via `delete_user_by_id` (`User.status = "DELETED"` + `deleted_at`).
2. **Remove imediatamente** `user_identity` e `user_profile` para liberar slots únicos (email/celular) sem esperar re-registro.
3. **Commit** dessas mudanças.
4. Em seguida, chama **best-effort** o Documenso via `_disable_documenso_user`.

> Observação importante: o comentário no serviço explica que o `users` row é mantido por **FK/histórico**, enquanto identidade/perfil são limpos para liberar cadastro.

### Chamada ao Documenso (HTTP interno)

Método: `UserService._disable_documenso_user`

- **Autenticação**:
  - Header `Authorization: Bearer <secret>`
  - Alternativa aceita no Documenso: `x-justx-provisioning-secret` (ver Parte 2)
- **Secret no JustX**: `DOCUMENSO_PROVISIONING_SECRET` (carregado via `app/config.py`)
- **URL**:
  - Preferência: `DOCUMENSO_INTERNAL_API_URL_DELETE`
  - Fallback: `{DOCUMENSO_BASE_URL}/api/internal/justx/delete-user`

#### Payload JSON enviado pelo JustX

O JustX monta um objeto com **um** dos campos:

- `{"user_id": <number>}` **se** existir mapeamento Documenso no Postgres do JustX (`get_documenso_user_id`)
- caso contrário, fallback: `{"email": "<email>"}`

Se não houver `user_id` nem `email`, o JustX **não chama** o Documenso (log de warning).

#### Semântica de sucesso no JustX

O JustX considera sucesso principalmente por **HTTP 200** na resposta do Documenso; caso contrário, loga warning, mas **não reverte** o soft delete local (é “best-effort”).

## Parte 2 — Documenso (`JustX-signature`, Remix/Hono)

### Onde a rota é registrada

Em `JustX-signature/apps/remix/server/router.ts`:

- `app.route('/api/internal/justx', justxDeleteUserRoute);`

Isso compõe a URL final:

- `POST /api/internal/justx/delete-user`

### Handler interno: `justxDeleteUserRoute`

Arquivo: `JustX-signature/apps/remix/server/api/justx/delete-user.ts`

#### Autenticação do endpoint

O secret esperado no Documenso é:

- `NEXT_PRIVATE_JUSTX_PROVISIONING_SECRET` (via `env('NEXT_PRIVATE_JUSTX_PROVISIONING_SECRET')`)

O handler aceita secret de duas formas:

- `Authorization: Bearer <secret>`
- **ou** header `x-justx-provisioning-secret: <secret>`

Se o secret não bater: **401** `{ error: 'Unauthorized' }`.

#### Body esperado

JSON:

- `{ "user_id": number }` **ou**
- `{ "email": string }`

Se JSON inválido: **400**.

Se faltar `user_id` e `email`: **400**.

#### Resolução de usuário e idempotência

O endpoint foi desenhado para ser **idempotente** e “à prova de duplo clique”:

- Se buscar por `email` e **não existir usuário**: retorna **200** com:
  - `{ success: true, disabled: true, note: 'user not found — already deleted or never existed' }`
- Se usuário existe e **`disabled` já é true**: retorna **200** com nota `already disabled`
- Se `user_id` não existe: **200** com nota equivalente a “não existe”
- Se `user_id` existe e `disabled=false`: prossegue

> Em outras palavras: “não encontrado” ou “já desativado” **não** é tratado como erro 404/409 — retorna 200 com `success:true` para simplificar o lado JustX.

#### Ação principal no Documenso

Se precisa desativar:

- chama `await disableUser({ id: resolvedUserId })`

Sucesso: **200** `{ success: true, disabled: true }`

Erro inesperado: **500** `{ error: 'Failed to disable user', details?: ... }` (details só em `NODE_ENV=development`).

## Parte 3 — O que `disableUser` realmente altera no banco Documenso

Arquivo: `JustX-signature/packages/lib/server-only/user/disable-user.ts`

Dentro de uma transação Prisma:

1. **`User.disabled = true`**
2. **`ApiToken`**: `updateMany` com `expires = new Date()` (expira tokens do usuário)
3. **`Webhook`**: `enabled = false`
4. **`VerificationToken`**: `expires = new Date()`
5. **`PasswordResetToken`**: `expiry = new Date()`
6. **`Passkey`**: `deleteMany` (remove passkeys do usuário)

### O que isso **não** garante por si só

Dependendo do restante do produto/sessões, pode haver comportamentos adicionais fora deste arquivo (ex.: invalidação de sessões) — **este módulo** explicitamente cobre o “disable user” no modelo de dados acima.

## Tabela-resumo (JustX vs Documenso)

| Aspecto | JustX (`DELETE /api/user/account`) | Documenso (`POST /api/internal/justx/delete-user`) |
|---|---|---|
| Tipo de “delete” | Soft delete (`DELETED`) + remove identity/profile | “Disable” (`disabled=true`) + invalidações |
| Remove linha `users` do JustX? | **Não** (mantém por FK/histórico) | N/A |
| Libera email/telefone no JustX? | **Sim** (apaga `user_identity`/`user_profile`) | N/A |
| Remove usuário do banco Documenso? | N/A | **Não** (não há `delete` do `User`) |
| Tokens/integrações | N/A (lado Documenso) | Expira API tokens; desliga webhooks |
| WebAuthn/Passkeys | N/A | Remove passkeys |
| Idempotência | Soft delete local é repetível com regras de erro próprias | 200 “ok” mesmo se já desativado / não existir |

## Checklist de configuração (pontos comuns de falha)

- **Secrets alinhados**:
  - JustX: `DOCUMENSO_PROVISIONING_SECRET`
  - Documenso: `NEXT_PRIVATE_JUSTX_PROVISIONING_SECRET`
  - Precisam ser o **mesmo valor**, senão 401 no Documenso.
- **URLs alinhadas**:
  - `DOCUMENSO_BASE_URL` no JustX deve apontar para a instância que realmente expõe `/api/internal/justx/delete-user`.
  - Se usar reverse proxy/path, validar que não “dobra” `/web` etc.
- **Payload**:
  - Preferível `user_id` (mais determinístico).
  - `email` funciona como fallback (normalizado para lowercase no Documenso).

## Referências de código (arquivos)

- JustX API rota: `JustX/app/api/user/router.py`
- JustX serviço: `JustX/app/api/user/service.py` (`delete_account`, `_disable_documenso_user`)
- JustX soft delete util: `JustX/app/services/database/postgres/utils/user.py` (`delete_user_by_id`)
- Documenso router: `JustX-signature/apps/remix/server/router.ts`
- Documenso endpoint: `JustX-signature/apps/remix/server/api/justx/delete-user.ts`
- Documenso disable: `JustX-signature/packages/lib/server-only/user/disable-user.ts`
