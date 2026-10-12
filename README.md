# Vendra × Ki Delícia — laboratório de atendimento

**Interface:** somente uma tela no estilo WhatsApp, responsiva para iPhone e computador, com conversa real por IA.

O laboratório simula clientes perguntando sobre salgados, sabores, valores, encomendas, fritos/congelados, entrega e retirada. Suporta texto, imagem e áudio (áudio é transcrito e inserido no campo de mensagem para conferência antes de enviar). O botão de reiniciar limpa conversa e carrinho locais.

## Deploy Vercel

1. Importe o repositório `pedrolean/Vendra-Kidelicia` em https://vercel.com/new.
2. Framework Preset: Next.js. Root Directory: padrão.
3. Em **Environment Variables**, configure:

| Chave | O que inserir |
| --- | --- |
| `LAB_ACCESS_PIN` | Seu PIN numérico; por exemplo `2026` |
| `LAB_SESSION_SECRET` | Texto aleatório com 32+ caracteres; gere localmente com `openssl rand -hex 32` |
| `OPENAI_API_KEY` | Chave da API da OpenAI (segredo) |
| `OPENAI_MODEL` | `gpt-4o-mini` (ou outro modelo compatível com imagem + JSON) |
| `SUPABASE_URL` | URL do projeto Supabase de produção da Ki Delícia |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave service-role do MESMO Supabase da Ki Delícia (segredo) |

4. Clique **Deploy**. Node.js 22 ou superior. Não é necessário SQL: usa tabelas já existentes no PedidoPro.
5. Faça login com o `LAB_ACCESS_PIN` escolhido.

## Segurança e limites

- **NÃO há integração com WhatsApp real.** É simulação no navegador.
- O backend apenas **consulta** as tabelas `settings`, `products`, `extra_groups`, `extras`, `product_extra_groups` e `delivery_zones` do PedidoPro. Não há operações de escrita, rotas de pedido, Pix ou webhook.
- A chave do Supabase e da OpenAI permanecem no servidor, nunca no navegador. Não configure segredo com prefixo `NEXT_PUBLIC_`.
- A chave service-role contorna RLS e exige proteção cuidadosa; mantenha-a exclusivamente nas configurações de ambiente da Vercel e considere futuramente uma API somente de leitura específica para o laboratório.
- PIN é protegido por cookie assinado e HttpOnly de oito horas. A conversa fica no localStorage **deste navegador** e pode ser eliminada em **Reiniciar conversa**. Não use dados pessoais reais de terceiros nos testes.
- Imagens JPG, PNG e WEBP: até 1,9 MB. Áudio: até 3 MB. Transcrição usa Whisper.
- Se o banco, preços ou chave IA estiverem indisponíveis, o chat informa claramente, sem inventar cardápio.
- Kits SALGADOS N UNIDADES com grupo SABORES DOS SALGADOS exigem seleção exata de N × quantidade.
- O valor do carrinho é recalculado no servidor a partir do catálogo, sem confiar em preços que a IA sugeriu. Frete só deve ser informado quando constar nas regiões cadastradas.
- O laboratório não faz cobrança real, não envia pedidos e não confirma Pix.

## Desenvolvimento local

```bash
cp .env.example .env.local
npm install
npm run dev
```

Abra http://localhost:3000. Build: `npm run build`.

## Caso o catálogo não carregue

Confira se as seis variáveis estão corretas (incluindo SUPABASE_URL e SERVICE_ROLE_KEY da Ki Delícia) e se as tabelas estão disponíveis. Verifique os logs da Vercel para erros das consultas. Não utilize credenciais de outro estabelecimento.

## Observação do GitHub

Este repositório estava público durante a implementação. Recomenda-se torná-lo **privado** nas configurações do GitHub. Segredos nunca devem ser publicados no código.
