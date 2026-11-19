# Proxy do Palpiteiro

## Por que isso existe

A API-Football exige uma chave em toda chamada. O Palpiteiro é um site
estático: o código roda no celular de quem abre. Se a chave fosse para lá,
qualquer pessoa abriria o app, leria a chave e gastaria a sua cota — e você
só descobriria quando o app parasse de carregar.

Então a chave fica **aqui**, num programinha que roda na Cloudflare. O app
fala com este endereço, este endereço fala com a API-Football.

De quebra, ele guarda as respostas por um tempo. A mesma tabela pedida por
cem pessoas gasta **uma** consulta da sua cota, não cem. Com o plano grátis
da API-Football (100 consultas por dia) isso é a diferença entre dar e não
dar.

## O que custa

Nada. O plano grátis da Cloudflare dá 100 mil chamadas por dia, muito mais
do que o app vai usar.

## Como colocar no ar

Precisa de uma conta na Cloudflare e da chave da API-Football. As duas são
suas: eu não crio conta nem manuseio chave.

```
cd proxy
npx wrangler login
npx wrangler secret put API_FOOTBALL_KEY     # cola a chave quando ele pedir
npx wrangler deploy
```

No fim ele mostra o endereço, algo como
`https://palpiteiro-api.SEU-NOME.workers.dev`. É esse endereço que entra no
app no lugar da SportScore.

Para conferir se subiu: abra `SEU-ENDEREÇO/saude` no navegador. Tem que
responder `{"ok":true,"chave":true}`. Se vier `"chave":false`, o segredo não
foi guardado.

## O que ele deixa passar

Só estes caminhos: `fixtures`, `fixtures/headtohead`, `fixtures/statistics`,
`fixtures/events`, `fixtures/lineups`, `standings`, `teams`,
`teams/statistics`, `leagues`, `players/squads`, `injuries`, `predictions`,
`odds`. Qualquer outro leva 404.

E só aceita chamada vinda de `opalpiteiro.online` (e de `localhost`, para
você testar). Isso não é blindagem — dá para forjar — mas corta o uso casual
por fora.

## Quanto tempo cada coisa fica guardada

| o quê | tempo |
|---|---|
| jogo ao vivo | 1 minuto |
| jogos do dia | 10 minutos |
| lances e estatísticas | 5 minutos |
| tabela | 1 hora |
| confronto direto, times | 6 horas |
| elenco | 12 horas |
| lista de campeonatos | 1 dia |

## O que ainda falta para trocar a API de verdade

Este proxy é a **parte da chave**, que era o que travava. A outra metade é
maior: a API-Football devolve os dados num formato diferente da SportScore
(outros nomes de campo, outra forma de pedir). O app inteiro lê o formato da
SportScore hoje. Trocar é reescrever a parte que busca e interpreta os dados,
com a suíte de testes acompanhando para nada quebrar no caminho.

Vale fazer quando: você quiser escanteios (que a SportScore não tem), ou
quando a SportScore começar a falhar.
