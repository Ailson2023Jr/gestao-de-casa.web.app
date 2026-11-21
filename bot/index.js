// Ponto de Entrada do Bot WhatsApp: Gestão de Casa
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');

const config = require('./config');
const { parseMessage } = require('./parser');
const database = require('./database');
const { startDailyScheduler } = require('./scheduler');

const AUTH_DIR = path.join(__dirname, 'auth_info');
if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

let sock = null;
let activeGroupJid = config.familyGroupId || null;

/**
 * Identifica o nome de quem enviou a mensagem (Junior, Bia ou Família)
 */
function getSenderName(participantJid, pushName) {
  if (!participantJid) return pushName || 'Família';
  const cleanPhone = participantJid.split('@')[0].replace(/\D/g, '');
  if (config.users[cleanPhone]) {
    return config.users[cleanPhone];
  }
  return pushName || 'Família';
}

/**
 * Salva o QR Code em HTML e imagem para facilitar o escaneamento
 */
async function saveQrVisuals(qr) {
  try {
    const qrPngPath = path.join(__dirname, 'qr.png');
    const qrHtmlPath = path.join(__dirname, 'qr.html');

    await QRCode.toFile(qrPngPath, qr, { width: 400 });

    const qrDataUrl = await QRCode.toDataURL(qr, { width: 350 });
    const htmlContent = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Conectar WhatsApp - Gestão de Casa</title>
        <style>
          body { font-family: system-ui, sans-serif; background: #0f172a; color: white; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; text-align: center; }
          .card { background: #1e293b; padding: 32px; border-radius: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); max-width: 420px; border: 1px solid #334155; }
          img { border-radius: 16px; margin: 20px 0; background: white; padding: 12px; }
          h2 { margin-top: 0; color: #38bdf8; }
          p { color: #94a3b8; font-size: 14px; line-height: 1.5; }
          .badge { background: #10b981; color: white; padding: 6px 14px; border-radius: 999px; font-size: 12px; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="card">
          <span class="badge">Gestão de Casa Bot</span>
          <h2>Conecte seu WhatsApp</h2>
          <p>Abra o WhatsApp no celular ➔ <strong>Aparelhos Conectados</strong> ➔ <strong>Conectar Aparelho</strong> e aponte a câmera para o QR Code abaixo:</p>
          <img src="${qrDataUrl}" alt="QR Code WhatsApp" />
          <p><em>Atualize a página se o QR Code expirar.</em></p>
        </div>
      </body>
      </html>
    `;
    fs.writeFileSync(qrHtmlPath, htmlContent, 'utf8');
  } catch (err) {
    console.error('Erro ao salvar QR Code visual:', err.message);
  }
}

/**
 * Inicializa a conexão com o WhatsApp via Baileys
 */
async function startBot() {
  console.log('🚀 Iniciando Assistente WhatsApp do Gestão de Casa...');

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    auth: state,
    printQRInTerminal: false, // Nós imprimimos customizado com mensagem amigável
    browser: ['Gestão de Casa', 'Desktop', '1.0.0']
  });

  sock.ev.on('creds.update', saveCreds);

  // Monitora mudanças de estado da conexão
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n=============================================================');
      console.log('📱 ESCANEIE O QR CODE ABAIXO NO SEU WHATSAPP:');
      console.log('=============================================================');
      qrcodeTerminal.generate(qr, { small: true });
      console.log('💡 Ou abra o arquivo no navegador: bot/qr.html');
      console.log('=============================================================\n');
      await saveQrVisuals(qr);
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('⚠️ Conexão encerrada. Reconectar?', shouldReconnect ? 'Sim' : 'Não');
      if (shouldReconnect) {
        setTimeout(startBot, 3000);
      }
    } else if (connection === 'open') {
      console.log('\n🎉 =======================================================');
      console.log('✅ Assistente Gestão de Casa CONECTADO COM SUCESSO!');
      console.log('🎉 =======================================================\n');

      // Procura o grupo da família
      try {
        const chats = await sock.groupFetchAllParticipating();
        const groups = Object.values(chats);
        console.log(`📋 Total de grupos em que o bot está participando: ${groups.length}`);

        const foundGroup = groups.find(g =>
          g.subject.toLowerCase().includes(config.familyGroupName.toLowerCase())
        );

        if (foundGroup) {
          activeGroupJid = foundGroup.id;
          console.log(`🏠 Grupo da família identificado: "${foundGroup.subject}" (ID: ${activeGroupJid})`);
        } else {
          console.log(`⚠️ Grupo "${config.familyGroupName}" não foi encontrado automaticamente.`);
          console.log('👉 Crie um grupo no WhatsApp com o nome "Finanças da Casa", adicione você, a Bia e o bot!');
          if (groups.length > 0) {
            console.log('Grupos disponíveis:', groups.map(g => `"${g.subject}"`).join(', '));
          }
        }
      } catch (err) {
        console.error('Erro ao listar grupos:', err.message);
      }

      // Inicia agendador diário de vencimentos
      startDailyScheduler(
        async (jid, text) => {
          if (sock) await sock.sendMessage(jid, { text });
        },
        () => activeGroupJid
      );
    }
  });

  // Escuta novas mensagens recebidas
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      // Ignora mensagens enviadas pelo próprio bot
      if (msg.key.fromMe) continue;

      const remoteJid = msg.key.remoteJid;
      const isGroup = remoteJid.endsWith('@g.us');

      // Se tiver grupo ativo configurado, foca no grupo ou permite chats diretos
      if (activeGroupJid && isGroup && remoteJid !== activeGroupJid) {
        // Ignora grupos aleatórios que não sejam o de finanças
        continue;
      }

      // Se ainda não temos o grupo configurado e a mensagem veio de um grupo cujo nome é "Finanças da Casa"
      if (!activeGroupJid && isGroup) {
        activeGroupJid = remoteJid;
        console.log(`🏠 Definindo grupo ativo automaticamente: ${activeGroupJid}`);
      }

      // Extrai texto da mensagem
      const rawText = msg.message?.conversation ||
                      msg.message?.extendedTextMessage?.text ||
                      msg.message?.imageMessage?.caption ||
                      '';

      if (!rawText || typeof rawText !== 'string') continue;

      const participantJid = isGroup ? msg.key.participant : remoteJid;
      const pushName = msg.pushName || '';
      const senderName = getSenderName(participantJid, pushName);

      console.log(`💬 Mensagem recebida de [${senderName}]: "${rawText}"`);

      // Analisa intenção
      const parsed = parseMessage(rawText);

      try {
        switch (parsed.type) {
          // 1. MARCAR CONTA COMO PAGA
          case 'mark_paid': {
            const res = await database.markExpenseAsPaid(parsed.accountQuery);
            if (res.success) {
              const summary = await database.getFinancialSummary();
              let reply = `🎉 *Boa, ${senderName}!* 👏\n\n`;
              reply += `✅ A conta *"${res.expense.description}"* (${database.formatMoney(res.expense.amount)}) foi marcada como *PAGA* no sistema!\n\n`;
              reply += `📊 *Saldo livre restante:* ${database.formatMoney(summary.balance)}\n`;
              reply += `⏳ *Contas pendentes restantes:* ${summary.pendingCount}`;
              await sock.sendMessage(remoteJid, { text: reply });
            } else {
              let reply = `⚠️ *${senderName}*, ${res.reason}\n`;
              if (res.availablePending && res.availablePending.length > 0) {
                reply += `\n📋 *Contas que estão pendentes no momento:*\n`;
                res.availablePending.forEach(p => {
                  reply += `• ${p}\n`;
                });
              }
              await sock.sendMessage(remoteJid, { text: reply });
            }
            break;
          }

          // 2. CADASTRAR NOVA CONTA
          case 'add_expense': {
            const res = await database.addExpense(parsed.data);
            if (res.success) {
              let reply = `✅ *Conta cadastrada com sucesso por ${senderName}!* 📝\n\n`;
              reply += `📌 *Descrição:* ${res.expense.description}\n`;
              reply += `💰 *Valor:* ${database.formatMoney(res.expense.amount)}\n`;
              reply += `📅 *Vencimento:* ${res.expense.dueDate}\n`;
              reply += `🏷️ *Categoria:* ${res.expense.category}\n\n`;
              reply += `Já está sincronizada no painel da família! 🚀`;
              await sock.sendMessage(remoteJid, { text: reply });
            }
            break;
          }

          // 3. FALTOU VALOR NO CADASTRO
          case 'add_expense_missing_amount': {
            let reply = `⚠️ *${senderName}*, não consegui identificar o valor em reais da conta.\n`;
            reply += `👉 *Exemplo:* _"conta internet 120 dia 28"_ ou _"cadastrar luz 180 hoje"_`;
            await sock.sendMessage(remoteJid, { text: reply });
            break;
          }

          // 4. CONSULTAR CONTAS PENDENTES
          case 'list_pending': {
            const pending = await database.getPendingExpenses();
            if (pending.length === 0) {
              await sock.sendMessage(remoteJid, { text: `🎉 *Tudo em dia, ${senderName}!* Não há nenhuma conta pendente no momento!` });
              break;
            }

            let reply = `📋 *Contas Pendentes - Gestão de Casa* 🏠\n`;
            pending.slice(0, 8).forEach(exp => {
              reply += `\n• *${exp.description}*: ${database.formatMoney(exp.amount)}\n`;
              reply += `  📅 Vencimento: ${exp.dueDate} (${exp.category || 'Geral'})\n`;
              if (exp.paymentUrl) {
                reply += `  🔗 Link: ${exp.paymentUrl}\n`;
              }
            });

            reply += `\n💡 Para pagar alguma conta, mande: *"paguei a [nome]"*`;
            await sock.sendMessage(remoteJid, { text: reply });
            break;
          }

          // 5. CONSULTAR RESUMO / SALDO
          case 'summary': {
            const sum = await database.getFinancialSummary();
            let reply = `📊 *Resumo Financeiro da Família* 🏠\n\n`;
            reply += `💰 *Receita Total:* ${database.formatMoney(sum.totalIncome)}\n`;
            reply += `📉 *Débitos Totais:* ${database.formatMoney(sum.totalExpense)} (${sum.expensePercent.toFixed(1)}% da renda)\n`;
            reply += `✅ *Já Pago:* ${database.formatMoney(sum.totalPaid)}\n`;
            reply += `⏳ *A Pagar:* ${database.formatMoney(sum.totalPending)} (${sum.pendingCount} contas)\n`;
            reply += `💵 *Saldo Líquido Livre:* ${database.formatMoney(sum.balance)}\n\n`;

            if (sum.balance >= 0) {
              reply += `✨ *Situação saudável!* Restam ${database.formatMoney(sum.balance)} limpos.`;
            } else {
              reply += `⚠️ *Atenção:* Despesas superam as receitas em ${database.formatMoney(Math.abs(sum.balance))}!`;
            }

            await sock.sendMessage(remoteJid, { text: reply });
            break;
          }

          // 6. AJUDA / MENU
          case 'help': {
            let reply = `👋 *Olá, ${senderName}! Sou o Assistente do Gestão de Casa.* 🤖\n\n`;
            reply += `Vocês podem interagir comigo enviando frases naturais aqui no grupo:\n\n`;
            reply += `👉 *Dar baixa em conta paga:*\n`;
            reply += `  _"paguei a luz"_\n`;
            reply += `  _"condomínio pago"_\n\n`;
            reply += `👉 *Cadastrar nova despesa:*\n`;
            reply += `  _"conta internet 120 dia 28"_\n`;
            reply += `  _"nova conta mercado 450 hoje"_\n\n`;
            reply += `👉 *Consultas rápidas:*\n`;
            reply += `  _"contas"_ ➔ Lista as próximas contas a vencer\n`;
            reply += `  _"saldo"_ ➔ Exibe o resumo de receitas, gastos e saldo livre\n\n`;
            reply += `Todo dia de manhã também envio o alerta automático das contas que vencem no dia ou no dia seguinte! 🔔`;
            await sock.sendMessage(remoteJid, { text: reply });
            break;
          }

          default:
            // Não responde mensagens aleatórias em grupo para não poluir a conversa
            break;
        }
      } catch (err) {
        console.error('Erro ao processar mensagem do WhatsApp:', err);
      }
    }
  });
}

// Inicia o bot
startBot().catch(err => {
  console.error('Falha fatal ao iniciar bot WhatsApp:', err);
});
