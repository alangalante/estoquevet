# Contexto de continuidade — EstoqueVet

Este arquivo preserva o contexto necessário para continuar o projeto em outra sessão. Não registrar aqui senhas, tokens, cookies, chaves de conta de serviço ou dados pessoais dos usuários.

## Objetivo

Aplicativo web simples para uma clínica veterinária consultar estoque e registrar entradas e saídas. Deve funcionar no navegador e poder ser adicionado à tela inicial do celular, sem publicação em lojas de aplicativos.

## Estado atual

- Site publicado: https://estoque-vet.web.app
- Repositório: https://github.com/alangalante/estoquevet
- Branch padrão: `main`
- Projeto Firebase: `estoque-vet`
- Plano pretendido: Firebase Spark (gratuito)
- Firebase Authentication por e-mail/senha: ativado
- Pelo menos um usuário de acesso foi criado pelo proprietário. Nunca solicitar nem registrar sua senha.
- Cloud Firestore: banco `(default)`, edição Standard, criado em modo de produção
- Regras em `firestore.rules`: compiladas e publicadas
- Firebase Hosting: configurado e publicado
- Código inicial enviado ao GitHub
- Ainda não foi confirmado na conversa se o proprietário entrou no app e clicou em **Importar produtos**. Antes de tentar importar novamente, verificar se a coleção `items` já contém dados. O botão de importação só aparece quando a coleção está vazia.

## Inventário inicial

- Fonte original: `estoque_atual.md`
- Itens distintos: 32
- Quantidade total inicial: 93 unidades
- Dados normalizados para importação em `initial-stock.js`
- O texto `Cloresten 500m` foi preservado exatamente como estava na fonte. Confirmar futuramente se deveria ser `500ml` antes de alterar.
- Limite padrão de estoque baixo: 2 unidades por produto.

## Arquitetura

- Aplicação estática em HTML, CSS e JavaScript, sem etapa de build.
- Firebase JavaScript SDK modular via CDN, versão `12.15.0`.
- `index.html`: interface e diálogos.
- `styles.css`: layout responsivo.
- `app.js`: autenticação, consultas em tempo real, importação, movimentações e CSV.
- `firebase-config.js`: configuração pública do aplicativo Web Firebase. Essa configuração não é uma credencial administrativa e pode ficar versionada.
- `initial-stock.js`: estoque inicial.
- `firestore.rules`: autorização e validação das movimentações.
- `firebase.json`: Hosting e regras.
- `manifest.webmanifest`, `service-worker.js` e `icon.svg`: instalação como app web/PWA.

## Modelo de dados

Coleção `items`:

- `name`: nome do produto
- `quantity`: saldo atual inteiro e não negativo
- `lowStockThreshold`: limite de estoque baixo
- `createdAt`, `updatedAt`: timestamps do servidor
- `lastMovementId`: incluído após uma movimentação

Coleção `movements`:

- `itemId`, `itemName`
- `kind`: `entrada` ou `saida`
- `quantity`, `before`, `after`
- `note`
- `uid`, `userEmail`
- `createdAt`

Entradas e saídas usam transação do Firestore. A atualização do item e a criação do histórico são atômicas, e uma saída que produziria saldo negativo é recusada.

## Segurança

- Somente usuários autenticados podem ler estoque e histórico.
- Criação do estoque inicial exige autenticação.
- Movimentações são imutáveis e precisam corresponder à atualização atômica do saldo.
- Exclusões são bloqueadas pelas regras atuais.
- Não adicionar arquivos de conta de serviço ao projeto. O `.gitignore` cobre padrões comuns.
- Não tratar a `apiKey` Web do Firebase como senha; a segurança real depende de Authentication e Firestore Rules.

## Validação local

```sh
node --check app.js
node --check firebase-config.js
node --check initial-stock.js
node --check service-worker.js
python3 -m json.tool firebase.json >/dev/null
python3 -m json.tool manifest.webmanifest >/dev/null
python3 -m http.server 8080
```

Abrir `http://localhost:8080`. O teste completo de login e banco usa o Firebase online.

## Publicação

O Firebase CLI e o GitHub CLI foram usados nesta máquina, mas uma sessão futura deve verificar novamente a autenticação.

```sh
npx firebase-tools deploy --only hosting,firestore:rules --project estoque-vet
gh auth status
git push origin main
```

Antes de publicar, validar o código e revisar `git status` para não incluir arquivos locais ou segredos.

## Próximos passos recomendados

1. Abrir https://estoque-vet.web.app e confirmar login.
2. Confirmar se os 32 produtos já foram importados e se o resumo mostra 93 unidades antes de qualquer movimentação.
3. Testar uma entrada e uma saída, conferindo saldo e histórico.
4. Verificar a interface em celular e computador.
5. Confirmar possíveis correções de nomes/unidades no inventário, principalmente `Cloresten 500m`.
6. Avaliar futuramente recuperação de senha, administração de produtos e exportação também do histórico, somente se o usuário solicitar.
