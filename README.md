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
- Os códigos completos são impressos como digitados. Por exemplo, `F24242` mantém o `F`; o número dentro é usado só para consultar o avatar.
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

Também é possível conectar esta pasta a um repositório Git no Cloudflare Pages. Configure a raiz do projeto como `cloudflare_site`; não há comando de build e a saída é a própria pasta (`.`). A pasta `functions` precisa ficar na raiz do projeto.

Você também pode abrir `index.html` diretamente no navegador para conferir o layout e usar o processamento local. Ao abrir como arquivo (`file://`), alguns navegadores bloqueiam a consulta direta das miniaturas do Roblox; para verificação automática completa, rode com Wrangler ou publique no Pages.

## Uso

1. Envie um ZIP com uma imagem por par, cole dois códigos por linha (feminino, depois masculino) e envie o template.
2. Confira cada par usando a imagem e as duas miniaturas consultadas no Roblox. Confirme todos para liberar a geração.
3. Ajuste o chroma, posições e realce na seção **Ajustes do estúdio**. A prévia acompanha as mudanças.
4. Gere e baixe o ZIP com os PNGs em resolução original e o `conferencia.csv`.

Para instalar como atalho no celular, abra o site publicado no Chrome/Edge e use **Instalar app**; no Safari, use **Adicionar à Tela de Início**.

Se o navegador não conseguir consultar o Roblox, ainda dá para revisar o par manualmente, mas a miniatura de referência pode não aparecer. A consulta por Pages Function está incluída para evitar depender do CORS direto do Roblox.
