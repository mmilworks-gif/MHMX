# My House Mx (Windows)

Controle remoto para mesas de som digitais, por rede (OSC, UDP 10023).
Compatível com Behringer X32 e M32.

Projeto independente. Não é afiliado, patrocinado nem aprovado pela Behringer ou pela Music Tribe.
Os nomes X32 e M32 são marcas de seus respectivos donos e aparecem aqui apenas para indicar compatibilidade.

## Recursos
- Faders, mute, solo, pan e medidores de todos os canais, aux, FX, buses, matrix, DCA e main
- Páginas por canal: config, preamp, gate, dinâmica, EQ, sends; clique nos mini-gráficos da faixa para abrir
- Gráficos de gate e compressor, EQ com pontos arrastáveis, grade de frequências e RTA (experimental)
- Sends no fader, links estéreo, grupos de mute, atribuição de DCA
- Routing (blocos de entrada, patch de canais, saídas), efeitos, monitor, solo e talkback
- Aparência: temas de cores e tamanho da interface (botão "Aparência"): escuro, alto contraste preto/amarelo, alto contraste claro, azul noite, âmbar para palco e daltônico
- Painel Meter (ponte de medidores de todos os canais), que pode ser aberto em janela separada
- Cenas da mesa e snapshots locais
- Modo demo (mesa simulada), bancos do usuário (User 1/2/3), canal fixo e reconexão automática
- Botão "Procurar mesa" (descobre o IP na rede) e botão de atualização via GitHub

## Rodar no PC
    npm install
    npm start

## Publicar versões (sem instalar nada)
Repositório público: github.com/mmilworks-gif/MHMX.
Cada envio que altera o package.json (por exemplo, aumentando "version") faz o GitHub Actions compilar
e publicar o instalador e a versão portátil em Releases, sem precisar criar tag.
Envie primeiro os demais arquivos e, por último, o package.json.
O botão "Verificar atualização" do app instalado baixa a versão publicada.

## Histórico
- 1.13.0: corrige os medidores de aux, FX, buses e matrix; redução de ganho no gráfico do compressor e do gate; painel Meter (com janela separada); bancos 1-16 e 17-32; faixas mais largas; cores do VU por nível
- 1.12.0: botão Aparência: escolha do tamanho da interface (80% a 175%) e atalhos Ctrl + / Ctrl -
- 1.11.0: botão de temas de cores, incluindo alto contraste
- 1.10.2: o botão de atualização funciona também na versão portátil (consulta o GitHub e abre a página de download)
- 1.10.1: corrige pacote que não incluía demo.js
- 1.10.0: mini-gráficos clicáveis; gráficos de gate e compressor; EQ com grade, pontos arrastáveis e RTA
- 1.9.x: modo demo, bancos do usuário, canal fixo, reconexão automática, correção ao fechar
- 1.8.x e anteriores: base do app e nome
