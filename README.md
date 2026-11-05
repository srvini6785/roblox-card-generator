# Vela Studio — Roblox Cards

Estúdio web responsivo para preparar cards Roblox no celular ou computador. Os arquivos e imagens são processados localmente no navegador; apenas a consulta dos UserIds passa pelo endpoint do Cloudflare Pages.

## Direção visual

A interface foi reorganizada com foco na prévia do card, controles agrupados e áreas de toque maiores para celular. A referência de fluxo e hierarquia foi o [Photofy — AI Photo Editor App UI Kit na comunidade do Figma](https://www.figma.com/pt-br/comunidade/file/1253148743960210201/photofy-ai-photo-editor-app-ui-kit). O layout deste projeto é próprio; nenhum componente ou asset do kit pago é distribuído aqui.

## Configurações atuais

- Chroma padrão `#005A00`.
- Área do par: X=70, Y=40, 500 × 490 na escala de referência 640 × 640; escala automaticamente em templates maiores.
- Texto feminino: X=105, Y=397; área 80 × 52 na escala 640.
- Texto masculino: X=1260, Y=1110; área 80 × 52 na escala 640.
- A área que cobre o placeholder segue automaticamente a posição do texto.
- Os códigos completos são impressos como digitados. Por exemplo, `F24242` mantém o `F`. Quando o código termina em um ID numérico (com ou sem prefixo de letras), o site também pode consultar esse ID no Roblox; códigos alfanuméricos como `F0FD59` são conferidos pela imagem e pela ordem do ZIP.
- O formato numerado `01-`, `F24244 (M)`, `F24242 (F)` associa cada par diretamente à imagem de mesmo número na ordem em que aparece dentro do ZIP. (M) e (F) são apenas marcadores de organização; no card aparece só o código completo. Numeração duplicada, código M/F faltando, imagens a mais/menos e números fora de sequência são apontados antes da conferência.
- Os códigos passam a usar **Realistic Nature** quando você carrega o arquivo OTF/TTF/WOFF/WOFF2 na seção de fonte. O arquivo é lido localmente no aparelho, não é enviado nem incluído no site; até carregar, o navegador usa uma serifada de fallback.
- Realce local com suavização de alta qualidade, contraste leve e nitidez configurável. Isso reduz serrilhado ao ampliar, sem enviar imagens para um serviço de IA ou inventar detalhes ausentes da imagem original.

Para servir o arquivo de fonte diretamente do site para todos os visitantes, adquira e respeite a licença Webfont do criador. A fonte não é distribuída junto deste projeto.

## Publicar no Cloudflare Pages

O site não precisa de compilação nem de dependências de frontend. Para incluir também a função que consulta o Roblox, publique pela CLI Wrangler, que carrega a pasta `functions` junto dos arquivos estáticos.

1. Instale o Node.js no computador, se ainda não tiver.
2. Abra um terminal nesta pasta `cloudflare_site` e entre na sua conta:

   ```powershell
   npx wrangler login
   ```

3. Crie o projeto Pages uma vez:

   ```powershell
   npx wrangler pages project create vela-roblox-card-studio
   ```

4. Publique (e repita este comando para atualizar o site):

   ```powershell
   npx wrangler pages deploy . --project-name vela-roblox-card-studio
   ```

O endereço será `https://vela-roblox-card-studio.pages.dev`, se esse nome estiver disponível. O primeiro comando pode pedir para escolher a branch de produção. Para rodar uma prévia local, use `npx wrangler pages dev .`.

Também é possível conectar esta pasta a um repositório Git no Cloudflare Pages. Configure **Root directory** como `cloudflare_site` (ou a pasta que contém `index.html` e `functions`), **Build command** como `npm run build:pages` e **Build output directory** como `.`. O script é intencionalmente sem compilação: ele permite que o Pages publique os arquivos estáticos e carregue a pasta `functions` na raiz do projeto.

Você também pode abrir `index.html` diretamente no navegador para conferir o layout e usar o processamento local. Ao abrir como arquivo (`file://`), alguns navegadores bloqueiam a consulta direta das miniaturas do Roblox; para verificação automática completa, rode com Wrangler ou publique no Pages.

## Uso

1. Envie um ZIP com uma imagem por par, cole os códigos no formato numerado com (M) e (F) (ou use duas colunas por linha no formato antigo) e envie o template. No formato numerado, a primeira imagem listada no ZIP é `01`, a próxima é `02`, e assim por diante.
2. Confira cada par usando a imagem e as duas miniaturas consultadas no Roblox. Confirme todos para liberar a geração.
3. Ajuste o chroma, posições e realce na seção **Ajustes do estúdio**. A prévia acompanha as mudanças.
4. Gere e baixe o ZIP com os PNGs em resolução original e o `conferencia.csv`.

Para instalar como atalho no celular, abra o site publicado no Chrome/Edge e use **Instalar app**; no Safari, use **Adicionar à Tela de Início**.

Se o navegador não conseguir consultar o Roblox, ainda dá para revisar o par manualmente, mas a miniatura de referência pode não aparecer. A consulta por Pages Function está incluída para evitar depender do CORS direto do Roblox.
