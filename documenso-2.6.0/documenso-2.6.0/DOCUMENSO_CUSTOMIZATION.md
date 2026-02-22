# Documenso Customization: Direct Edit → Sign Flow

## Objetivo

Modificar o botão "Enviar Documento" na página de edição para ir **direto para assinatura** em vez de mostrar opções de email.

## Fluxo Final

```
1. WhatsApp: usuário envia documento + pede assinatura
2. JustX: cria envelope (DRAFT), envia link de edição
3. Documenso: usuário abre link, posiciona campo de assinatura
4. Documenso: clica "Enviar Documento" → vai direto para tela de assinar
5. Documenso: usuário assina
6. Webhook: DOCUMENT_COMPLETED → JustX recebe
7. WhatsApp: JustX envia PDF assinado para usuário
```

## Mudança Necessária

### Localizar o Botão

Procurar em:
```
apps/web/src/app/(dashboard)/t/[teamUrl]/documents/[id]/edit/
apps/web/src/components/document-send/
apps/web/src/components/(dashboard)/document-send-button.tsx
```

Procurar por:
- Botão "Send Document" / "Enviar Documento"
- Handler `handleSend`, `onSend`, `distributeDocument`

### Modificar o Handler

**DE:**
```typescript
const handleSend = async () => {
  // Mostra modal de email ou opções de envio
  setShowEmailModal(true);
};
```

**PARA:**
```typescript
const handleSend = async () => {
  try {
    // 1. Distribuir envelope (muda status para PENDING)
    await distributeEnvelope(envelopeId);

    // 2. Buscar token do recipient
    const envelope = await getEnvelope(envelopeId);
    const recipient = envelope.recipients[0];

    // 3. Redirecionar para página de assinatura
    if (recipient?.token) {
      window.location.href = `/sign/${recipient.token}`;
    }
  } catch (error) {
    toast.error('Erro ao preparar assinatura');
  }
};
```

### Opcional: Mudar Texto do Botão

```tsx
// DE
<Button>Enviar Documento</Button>

// PARA
<Button>Assinar Agora</Button>
```

## Como Funciona

1. `distributeEnvelope()` - Muda status do envelope de DRAFT para PENDING e cria token para o recipient

2. `/sign/{token}` - Página de assinatura do Documenso onde usuário desenha/digita assinatura

3. Após assinar, Documenso dispara webhook `DOCUMENT_COMPLETED`

4. JustX recebe webhook, baixa PDF assinado, envia via WhatsApp

## O que NÃO precisa mudar

- ❌ Não precisa criar novo endpoint no JustX
- ❌ Não precisa enviar link de assinatura via WhatsApp
- ❌ Não precisa callback entre edit e sign

## Contexto Técnico

O JustX já configura o envelope com:
- `external_id` = número WhatsApp do usuário
- `recipient` = dados do usuário (nome, email)

O webhook handler do JustX (`app/api/documenso/documenso.py`) já:
- Recebe evento `DOCUMENT_COMPLETED`
- Baixa PDF assinado via API
- Envia para WhatsApp do usuário (usando `external_id`)

## Teste

1. Enviar documento via WhatsApp para JustX
2. Clicar no link de edição recebido
3. Posicionar campo de assinatura
4. Clicar no botão (modificado)
5. Verificar: redireciona para `/sign/...`
6. Assinar
7. Verificar: recebe PDF assinado no WhatsApp
