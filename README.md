# EstoqueVet

Aplicativo web para consultar estoque, registrar compras e vendas, apropriar custos pelo método PEPS e gerar relatórios financeiros por dia, semana ou mês. Os dados ficam no Cloud Firestore e o acesso é protegido pelo Firebase Authentication.

## O que você precisa fazer no Firebase

1. Acesse [console.firebase.google.com](https://console.firebase.google.com/) com uma conta Google.
2. Clique em **Criar um projeto**, dê um nome como `estoque-vet` e mantenha o plano gratuito **Spark**. O Google Analytics é opcional e pode ser desativado.
3. Na página inicial do projeto, clique no ícone **Web** (`</>`), use o apelido `EstoqueVet` e registre o aplicativo. Não é necessário marcar a configuração do Hosting nessa tela.
4. Copie o objeto `firebaseConfig` mostrado pelo Firebase e substitua os valores do arquivo `firebase-config.js` deste projeto.
5. Abra **Criação > Authentication > Começar > E-mail/senha**, ative **E-mail/senha** e salve.
6. Em **Authentication > Users**, clique em **Adicionar usuário** e crie o primeiro e-mail e senha de acesso.
7. Abra **Criação > Firestore Database > Criar banco de dados**. Escolha o modo de produção e uma região próxima, como `southamerica-east1`, se ela estiver disponível.
8. Abra a aba **Regras** do Firestore, cole todo o conteúdo de `firestore.rules` e clique em **Publicar**.

Depois desses passos, abra o aplicativo, faça login e clique em **Importar produtos**. Isso inclui os 32 itens encontrados em `estoque_atual.md`.

## Testar no computador

O app precisa ser servido por HTTP; abrir o HTML diretamente não é suficiente. Na pasta do projeto, execute:

```sh
python3 -m http.server 8080
```

Depois, acesse `http://localhost:8080`.

## Publicar sem loja de aplicativos

Com Node.js instalado, execute na pasta do projeto:

```sh
npx firebase-tools login
npx firebase-tools use --add
npx firebase-tools deploy --only hosting,firestore:rules
```

No segundo comando, selecione o projeto criado. Ao final, o Firebase mostrará um endereço terminado em `.web.app`. No celular, abra esse endereço e use **Adicionar à tela de início** no menu do navegador.

## Segurança e dados

- Apenas usuários autenticados podem consultar ou movimentar o estoque.
- Cada compra ou venda atualiza o saldo, os lotes PEPS e o histórico na mesma transação.
- Valores monetários são armazenados em centavos para evitar erros de arredondamento.
- O custo do estoque anterior à funcionalidade financeira deve ser configurado em cada produto; enquanto isso, o relatório identifica o lucro como incompleto.
- O sistema não permite saída que deixe o estoque negativo.
- Produtos e movimentações não podem ser apagados pelo aplicativo.
- Use **Exportar CSV** periodicamente para manter uma cópia local do saldo.
