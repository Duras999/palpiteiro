# Rotina do Palpiteiro

Roda sozinha no GitHub, de hora em hora, e faz três coisas:

1. **Confere se o site está de pé** — abre a página inicial, o retrospecto e
   os termos e vê se carregaram de verdade. Se alguma cair, manda recado no
   WhatsApp e o GitHub marca a rodada em vermelho.
2. **Avisa quando sai bilhete novo** — uma vez por dia, só para quem ligou
   os avisos no app.
3. **Avisa quando o resultado fecha** — quantos green e quantos red deram.

Não precisa de servidor nem de plano pago: roda dentro do GitHub Actions.

## Os três segredos

Em **Settings → Secrets and variables → Actions → New repository secret**:

| Nome | O que é | Obrigatório |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | o JSON inteiro da conta de serviço do Firebase | para os avisos |
| `CALLMEBOT_FONE` | telefone com DDI, só números: `5511941767733` | para o WhatsApp |
| `CALLMEBOT_APIKEY` | a chave que o CallMeBot te manda | para o WhatsApp |

Sem o `FIREBASE_SERVICE_ACCOUNT`, ela só confere o site.
Sem os dois do CallMeBot, ela confere tudo e, se der problema, o GitHub te
manda e-mail em vez do WhatsApp.

### Como pegar o JSON do Firebase

Console do Firebase → engrenagem → **Configurações do projeto** →
**Contas de serviço** → **Gerar nova chave privada**. Baixa um arquivo `.json`.
Abra o arquivo, copie **tudo** e cole no valor do segredo.

Esse arquivo dá acesso total ao banco: não mande por WhatsApp, não suba no
repositório, não guarde em pasta compartilhada. Se vazar, volte nessa mesma
tela e apague a chave.

### Como pegar a chave do CallMeBot

É um serviço gratuito que entrega mensagem no seu WhatsApp:

1. Salve o número **+34 644 51 95 23** nos contatos.
2. Mande para ele, pelo WhatsApp: `I allow callmebot to send me messages`
3. Ele responde com a sua chave. É ela que vai no `CALLMEBOT_APIKEY`.

## Rodar na mão

Aba **Actions** → **Rotina** → **Run workflow**. Serve para testar sem
esperar a hora virar.
