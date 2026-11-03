# My House Mx (Windows)

Controle remoto para mesas de som digitais, por rede (OSC, UDP 10023).
Compatível com Behringer X32 e M32.

Projeto independente. Não é afiliado, patrocinado nem aprovado pela Behringer ou pela Music Tribe.
Os nomes X32 e M32 são marcas de seus respectivos donos e aparecem aqui apenas para indicar compatibilidade.

## Recursos
- Faders, mute, solo, pan e medidores de todos os canais, aux, FX, buses, matrix, DCA e main
- Páginas por canal: config, preamp, gate, dinâmica, EQ com curva, sends
- Sends no fader, links estéreo, grupos de mute, atribuição de DCA
- Routing (blocos de entrada, patch de canais, saídas), efeitos, monitor, solo e talkback
- Gráficos de gate e compressor, EQ com pontos arrastáveis, grade de frequências e RTA (experimental)
- Cenas da mesa e snapshots locais
- Modo demo (mesa simulada, para testar sem a mesa real)
- Bancos do usuário (User 1/2/3) e canal fixo sempre visível
- Reconexão automática, com indicador de conexão e aviso quando a mesa some da rede
- Botão "Procurar mesa" (descobre o IP na rede) e botão de atualização via GitHub

## Rodar no PC
    npm install
    npm start

## Gerar o .exe e publicar atualizações (sem instalar nada)
1. Crie um repositório PÚBLICO no GitHub e envie estes arquivos.
2. Em package.json, troque SEU_USUARIO e SEU_REPOSITORIO.
3. A cada envio que altera o package.json (por exemplo, aumentando "version"), o GitHub Actions compila
   e publica sozinho o instalador e a versão portátil em Releases. Não é preciso criar tag.
4. Também dá para rodar manualmente: aba Actions, Build Windows, Run workflow.

O botão "Verificar atualização" do app instalado baixa a versão nova publicada em Releases.

## Histórico
- 1.10.0: clique nos mini-gráficos abre Gate/Dyn/EQ; gráficos de gate e compressor; EQ com grade, pontos arrastáveis e RTA
- 1.9.1: corrige erro "Object has been destroyed" ao fechar o app
- 1.9.0: modo demo, bancos do usuário, canal fixo, reconexão automática
- 1.8.2: nome My House Mx
- 1.8.1: nome House Mix Remote
- 1.8.0: nome Station Mix Remote
- 1.7.0: nome neutro; ícone e logo originais
- 1.6.x: layout com abas, bancos, mini-gráficos e painel direito; ícone
- 1.5.0 e anteriores: base do app (faders, EQ, dinâmica, sends, routing, FX, grupos, monitor, cenas, descoberta de IP)
