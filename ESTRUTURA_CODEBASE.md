# Estrutura do Codebase e Padrões de Implementação

## 📁 Arquitetura do Projeto

Este projeto segue uma **arquitetura monorepo** usando **npm workspaces** e **Turborepo** para gerenciamento de build e dependências.

### ⚠️ Importante: Packages são Código Fonte, Não Pacotes NPM Externos

**Os packages são parte do código construído (built code) do projeto**, não são pacotes npm externos. Eles são:

- ✅ **Código TypeScript fonte** que você escreve e edita
- ✅ **Compilados junto com as apps** durante o build
- ✅ **Importados como se fossem pacotes npm**, mas são código local
- ✅ **Gerenciados pelo npm workspaces** para compartilhamento interno

**Exemplo prático:**

```typescript
// Em apps/remix/app/components/algum-componente.tsx
import { trpc } from '@documenso/trpc/client';  // ← Package local!
import { Button } from '@documenso/ui/primitives/button';  // ← Package local!
import { prisma } from '@documenso/prisma';  // ← Package local!
```

Esses imports funcionam porque no `package.json` da app:

```json
{
  "dependencies": {
    "@documenso/trpc": "*",    // ← O "*" significa "workspace local"
    "@documenso/ui": "*",      // ← Não é do npm, é do monorepo!
    "@documenso/lib": "*"
  }
}
```

O `"*"` indica que o npm deve usar a versão do workspace local, não buscar no npm registry.

### Estrutura Principal

```
JustX-signature/
├── apps/                    # Aplicações principais
│   ├── remix/              # Aplicação principal (React Router/Remix)
│   ├── documentation/      # Documentação (Nextra)
│   └── openpage-api/       # API externa
│
├── packages/               # Pacotes compartilhados (monorepo)
│   ├── api/                # Configuração Hono API
│   ├── auth/               # Lógica de autenticação
│   ├── lib/                # Utilitários e lógica de negócio
│   ├── prisma/             # Schema e migrations do banco
│   ├── trpc/               # Rotas tRPC (API type-safe)
│   ├── ui/                 # Componentes UI (Shadcn)
│   └── ...                 # Outros pacotes
│
└── docker/                 # Configurações Docker
```

## 🏗️ Padrão de Arquitetura

### 1. **Monorepo com Workspaces**

O projeto usa **npm workspaces** para compartilhar código entre pacotes:

```json
{
  "workspaces": [
    "apps/*",
    "packages/*"
  ]
}
```

**Vantagens:**
- Código compartilhado sem publicar no npm
- Type-safety entre pacotes
- Build otimizado com Turborepo

### 2. **Separação de Responsabilidades**

#### `apps/remix/` - Aplicação Frontend
- **Rotas**: `app/routes/` - Sistema de roteamento do React Router
- **Componentes**: `app/components/` - Componentes React reutilizáveis
- **Server**: `server/` - Lógica server-side

#### `packages/lib/` - Lógica de Negócio
- **server-only/**: Código que só roda no servidor
- **client-only/**: Código que só roda no cliente
- **universal/**: Código que roda em ambos
- **constants/**: Constantes da aplicação
- **types/**: Definições de tipos TypeScript

#### `packages/trpc/` - API Type-Safe
- **server/**: Rotas da API
- **client/**: Cliente tRPC
- **react/**: Hooks React para tRPC

## 📝 Padrões de Código TypeScript

### 1. **Preferir `type` sobre `interface`**

```typescript
// ✅ CORRETO
type CreateDocumentOptions = {
  templateId: number;
  userId: number;
  recipients: Recipient[];
};

// ❌ EVITAR
interface CreateDocumentOptions {
  templateId: number;
}
```

### 2. **Arrow Functions Sempre**

```typescript
// ✅ CORRETO
export const createDocument = async ({
  userId,
  title,
}: CreateDocumentOptions) => {
  // ...
};

// ❌ EVITAR
function createDocument() {
  // ...
}
```

### 3. **Destructuring de Parâmetros**

```typescript
// ✅ CORRETO - Objeto desestruturado
export const findDocuments = async ({
  userId,
  teamId,
  status = ExtendedDocumentStatus.ALL,
  page = 1,
  perPage = 10,
}: FindDocumentsOptions) => {
  // ...
};

// ✅ CORRETO - Desestruturação em linha separada
const { user } = ctx;
const { templateId } = input;
```

### 4. **Nomenclatura**

```typescript
// Variáveis: camelCase
const documentId = 123;
const onSubmit = () => {};

// Tipos: PascalCase
type CreateDocumentOptions = {};

// Schemas Zod: Prefixo Z
const ZCreateDocumentSchema = z.object({});

// Tipos inferidos: Prefixo T
type TCreateDocument = z.infer<typeof ZCreateDocumentSchema>;

// Constantes: UPPER_SNAKE_CASE
const DEFAULT_DOCUMENT_DATE_FORMAT = 'dd/MM/yyyy';

// Booleanos: Verbo auxiliar
const isLoading = false;
const hasError = false;
const canEdit = true;
```

## ⚛️ Padrões React

### 1. **Componentes Funcionais**

```typescript
// ✅ CORRETO
export const SignUpForm = ({
  className,
  initialEmail,
}: SignUpFormProps) => {
  // ...
};

// ❌ NUNCA usar classes
class MyComponent extends React.Component {}
```

### 2. **Organização de Imports**

```typescript
// 1. React imports
import { useCallback, useEffect } from 'react';

// 2. Third-party libraries (alfabético)
import { zodResolver } from '@hookform/resolvers/zod';
import { Trans } from '@lingui/react/macro';
import type { Document } from '@prisma/client';

// 3. Internal packages (@documenso/*)
import { AppError } from '@documenso/lib/errors/app-error';
import { prisma } from '@documenso/prisma';
import { Button } from '@documenso/ui/primitives/button';

// 4. Relative imports
import { getTeamById } from '../team/get-team';
```

### 3. **Hooks e Estado**

```typescript
// ✅ Agrupar hooks relacionados
const { _ } = useLingui();
const { toast } = useToast();

const form = useForm<TFormSchema>({
  resolver: zodResolver(ZFormSchema),
  defaultValues: {
    // ...
  },
});

// ✅ Nomes descritivos com verbos auxiliares
const [isLoading, setIsLoading] = useState(false);
const [hasError, setHasError] = useState(false);
```

## 🔌 Padrões tRPC

### 1. **Estrutura de Rotas**

Cada rota tem **2 arquivos**:

```
team-router/
├── create-team.ts          # Implementação da rota
└── create-team.types.ts    # Schemas Zod e tipos
```

### 2. **Exemplo de Rota**

```typescript
// create-team.ts
import { authenticatedProcedure } from '../trpc';
import { ZCreateTeamRequestSchema, ZCreateTeamResponseSchema } from './create-team.types';

export const createTeamRoute = authenticatedProcedure
  .input(ZCreateTeamRequestSchema)
  .output(ZCreateTeamResponseSchema)
  .mutation(async ({ input, ctx }) => {
    const { teamName, teamUrl, organisationId } = input;
    const { user } = ctx;

    ctx.logger.info({
      input: { organisationId },
    });

    return await createTeam({
      userId: user.id,
      teamName,
      teamUrl,
      organisationId,
    });
  });
```

### 3. **Schemas Zod**

```typescript
// create-team.types.ts
export const ZCreateTeamRequestSchema = z.object({
  organisationId: z.string(),
  teamName: ZTeamNameSchema,
  teamUrl: ZTeamUrlSchema,
  inheritMembers: z.boolean(),
});

export const ZCreateTeamResponseSchema = z.void();

export type TCreateTeamRequest = z.infer<typeof ZCreateTeamRequestSchema>;
```

## 🗄️ Padrões Prisma/Database

### 1. **Queries**

```typescript
// ✅ Usar select para limitar campos
const user = await prisma.user.findFirst({
  where: { id: userId },
  select: {
    id: true,
    email: true,
    name: true,
  },
});

// ✅ Usar include para relações
const document = await prisma.document.findFirst({
  where: { id: documentId },
  include: {
    recipients: true,
    fields: true,
  },
});
```

### 2. **Transações**

```typescript
// ✅ Usar transações para operações relacionadas
return await prisma.$transaction(async (tx) => {
  const document = await tx.document.create({ data });
  await tx.field.createMany({ data: fieldsData });
  await tx.documentAuditLog.create({ data: auditData });
  return document;
});
```

## 🎨 Padrões de Organização de Arquivos

### Estrutura de um Package

```
packages/lib/
├── server-only/           # Código servidor
│   ├── team/
│   │   └── create-team.ts
│   └── document/
│
├── client-only/          # Código cliente
│   └── hooks/
│
├── universal/            # Código compartilhado
│   └── utils/
│
├── constants/            # Constantes
│   └── app.ts
│
├── types/                # Tipos TypeScript
│   └── document.ts
│
└── index.ts              # Exports principais
```

### Estrutura de Rotas tRPC

```
packages/trpc/server/
├── team-router/
│   ├── create-team.ts
│   ├── create-team.types.ts
│   ├── get-team.ts
│   ├── get-team.types.ts
│   ├── router.ts          # Agrega todas as rotas
│   └── schema.ts           # Schemas compartilhados
│
└── router.ts              # Router principal
```

## 🔨 Como os Packages são Compilados

### Processo de Build

Quando você executa `npm run build`, o **Turborepo** gerencia a ordem de compilação:

```json
// turbo.json
{
  "pipeline": {
    "build": {
      "dependsOn": ["prebuild", "^build"],  // ← "^build" = build das dependências primeiro
      "outputs": [".next/**"]
    }
  }
}
```

**O que acontece:**

1. **Turborepo detecta dependências** entre packages e apps
2. **Builda packages primeiro** (se tiverem script de build)
3. **Depois builda as apps** que dependem dos packages
4. **TypeScript resolve os imports** dos packages locais

### Exemplo Prático

```bash
# Quando você roda:
npm run build

# O Turborepo faz algo como:
1. Build @documenso/prisma (gera Prisma Client)
2. Build @documenso/lib (compila TypeScript)
3. Build @documenso/trpc (compila TypeScript)
4. Build @documenso/ui (compila TypeScript)
5. Build @documenso/remix (usa todos os packages acima)
```

### Durante o Desenvolvimento

No modo dev (`npm run dev`), os packages são **importados diretamente** sem build prévio:

- TypeScript resolve os imports em tempo real
- Hot reload funciona entre packages e apps
- Mudanças em packages refletem imediatamente nas apps

### Estrutura de um Package

```typescript
// packages/trpc/package.json
{
  "name": "@documenso/trpc",  // ← Nome usado nos imports
  "main": "./index.ts",        // ← Ponto de entrada (TypeScript direto!)
  "types": "./index.ts",       // ← Tipos TypeScript
  "dependencies": {
    "@documenso/lib": "*",     // ← Pode depender de outros packages locais
    "@trpc/server": "^11.8.1"  // ← Dependências externas do npm
  }
}
```

**Importante:** Muitos packages usam `"main": "./index.ts"` diretamente, sem build step. O TypeScript resolve isso automaticamente.

### Comparação: Packages Locais vs Pacotes NPM

| Aspecto | Packages Locais (`@documenso/*`) | Pacotes NPM Externos |
|---------|----------------------------------|----------------------|
| **Localização** | `packages/trpc/` (código fonte) | `node_modules/react/` (instalado) |
| **Versão** | `"*"` (workspace local) | `"^18.0.0"` (versão específica) |
| **Edição** | ✅ Você edita diretamente | ❌ Não edita (read-only) |
| **Build** | ✅ Compilado junto com apps | ❌ Já vem compilado |
| **TypeScript** | ✅ Type-safe entre packages | ⚠️ Depende de @types |
| **Hot Reload** | ✅ Funciona entre packages | ⚠️ Limitado |
| **Exemplo** | `@documenso/trpc` | `react`, `zod`, `@prisma/client` |

### Fluxo de Importação

```
apps/remix/app/components/meu-componente.tsx
    ↓ import { trpc } from '@documenso/trpc/client'
    ↓
npm workspaces resolve
    ↓
packages/trpc/client/index.ts  ← Código fonte TypeScript
    ↓
TypeScript compila junto com a app
    ↓
Código final compilado
```

**Resumo:** Os packages são **código fonte compartilhado** que você escreve, edita e compila junto com as apps. Não são pacotes npm externos!

## 🔧 Ferramentas e Tecnologias

### Build & Dev Tools
- **Turborepo**: Build system para monorepo
- **TypeScript**: Linguagem principal
- **Prisma**: ORM para banco de dados
- **Zod**: Validação de schemas

### Frontend
- **React Router (Remix)**: Framework web
- **tRPC**: API type-safe
- **React Hook Form**: Gerenciamento de formulários
- **Shadcn UI**: Componentes UI
- **Tailwind CSS**: Estilização

### Backend
- **Prisma**: ORM
- **PostgreSQL**: Banco de dados
- **Hono**: Framework HTTP (para APIs externas)

## 📋 Checklist para Novos Arquivos

Ao criar um novo arquivo, siga:

1. ✅ Usar arrow functions (`const fn = () => {}`)
2. ✅ Preferir `type` sobre `interface`
3. ✅ Organizar imports (React → Third-party → Internal → Relative)
4. ✅ Usar nomes descritivos com verbos auxiliares para booleanos
5. ✅ Destruturar parâmetros de objeto
6. ✅ Usar early returns para reduzir nesting
7. ✅ Separar lógica com linhas em branco
8. ✅ Prefixar schemas Zod com `Z` e tipos inferidos com `T`

## 🎯 Princípios Fundamentais

1. **Funcional sobre Orientado a Objetos**: Preferir funções sobre classes
2. **Explícito sobre Implícito**: Ser claro sobre tipos e retornos
3. **Early Returns**: Usar guard clauses para reduzir aninhamento
4. **Imutabilidade**: Preferir `const` sobre `let`
5. **Type Safety**: TypeScript em tudo, validação com Zod

## 📚 Recursos Adicionais

- **CODE_STYLE.md**: Guia completo de estilo de código
- **CONTRIBUTING.md**: Guia de contribuição
- **README.md**: Documentação geral do projeto
