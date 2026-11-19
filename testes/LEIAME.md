# Testes do Palpiteiro

Abrem o app num Chromium de verdade, com o Firebase e a API de jogos
simulados, e conferem o que o usuário vê na tela.

## Rodar na sua máquina

```
cd testes
npm install
npx playwright install chromium
npm test
```

`npm test` roda todos os arquivos `test_*.js` e só termina bem se tudo passar.
Para rodar um só: `node test_motor.js`.

## O que cada arquivo cobre

| arquivo | assunto |
|---|---|
| `test_novo.js` | motor de palpites, odds, bilhete, sequência de dias |
| `test_motor.js` | peso por competição, handicap, cartões e primeiro tempo |
| `test_mais.js` | campeonatos, palpite do dia, Zé Tabela, boas-vindas, prévia |
| `test_cal.js` | medição de acertos e geração automática dos bilhetes |
| `test_cod.js` | códigos de reserva colados no painel |
| `test_perfil.js` | ícone do perfil e dados do cadastro |
| `test_favs.js` | escolha de times favoritos |
| `test_times.js` | aba Meus times e próximos jogos |
| `test_risco.js` | os cinco níveis de risco dos bilhetes |
| `test_painel.js` | painel do administrador |
| `test_zelo.js` | aviso +18, preview de link, cota e modo manutenção |
| `test_imagem.js` | QR code e o bilhete virando imagem |
| `test_retro.js` | retrospecto green e red |

O `base.js` monta o servidor, o navegador e os dados falsos.
O `stubs.js` finge ser o Firebase. O `qr/` tem um leitor de QR usado só
para conferir que o QR gerado pelo app é mesmo legível.
