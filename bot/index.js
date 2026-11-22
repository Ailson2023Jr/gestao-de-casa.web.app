// Ponto de Entrada do Bot WhatsApp: Gestão de Casa
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers
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
const botStartTime = Math.floor(Date.now() / 1000);

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
 * Extrai recursivamente o texto de qualquer tipo de mensagem do WhatsApp
 * Suporta texto direto, extendedTextMessage, mensagens efêmeras (temporárias),
 * view-once, legendas de imagens/vídeos/documentos.
 */
function extractMessageText(m) {
  if (!m) return '';
  if (typeof m === 'string') return m;
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.imageMessage?.caption) return m.imageMessage.caption;
  if (m.videoMessage?.caption) return m.videoMessage.caption;
  if (m.documentMessage?.caption) return m.documentMessage.caption;
  if (m.ephemeralMessage?.message) return extractMessageText(m.ephemeralMessage.message);
  if (m.viewOnceMessage?.message) return extractMessageText(m.viewOnceMessage.message);
  if (m.viewOnceMessageV2?.message) return extractMessageText(m.viewOnceMessageV2.message);
  if (m.documentWithCaptionMessage?.message) return extractMessageText(m.documentWithCaptionMessage.message);
  return '';
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

  let isReconnecting = false;
  let schedulerStarted = false;

  sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    auth: state,
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'),
    syncFullHistory: false,
    markOnlineOnConnect: false,
    defaultQueryTimeoutMs: 60000
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
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`⚠️ Conexão encerrada (Status: ${statusCode || 'desconhecido'}). Reconectar? ${shouldReconnect ? 'Sim' : 'Não'}`);

      if (shouldReconnect && !isReconnecting) {
        isReconnecting = true;
        setTimeout(() => {
          isReconnecting = false;
          startBot();
        }, 5000);
      }
    } else if (connection === 'open') {
      console.log('\n🎉 =======================================================');
      console.log('✅ Assistente Gestão de Casa CONECTADO COM SUCESSO!');
      console.log(`🏠 Grupo ativo: "${config.familyGroupName}" (${config.familyGroupId})`);
      console.log('🎉 =======================================================\n');

      activeGroupJid = config.familyGroupId;

      // Inicia agendador diário de vencimentos uma única vez
      if (!schedulerStarted) {
        schedulerStarted = true;
        startDailyScheduler(
          async (jid, text) => {
            if (sock) await sock.sendMessage(jid, { text });
          },
          () => activeGroupJid
        );
      }

      // Envia confirmação visual no grupo para que os usuários saibam que está pronto
      if (activeGroupJid) {
        try {
          await sock.sendMessage(activeGroupJid, {
            text: `🤖 *[Gestão de Casa]*\n\n✅ Assistente online e pronto para receber comandos aqui no grupo!\n\n💡 Mande *saldo*, *contas*, *link* ou *ajuda* para ver as informações.`
          });
          console.log('📢 Mensagem de ativação enviada com sucesso no grupo familiar!');
        } catch (err) {
          console.error('Aviso ao enviar mensagem de ativação:', err.message);
        }
      }
    }
  });

  // Escuta todas as mensagens recebidas
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (!messages || !Array.isArray(messages)) return;

    for (const msg of messages) {
      // Extrai texto de qualquer estrutura de mensagem
      const rawText = extractMessageText(msg.message);
      if (!rawText || typeof rawText !== 'string') continue;

      // Se a mensagem começar com o prefixo do próprio bot, ignora para nunca entrar em loop
      if (rawText.startsWith('🤖')) {
        continue;
      }

      // Ignora mensagens enviadas há mais de 2 minutos antes do bot iniciar
      const msgTimestamp = Number(msg.messageTimestamp) || 0;
      if (msgTimestamp > 0 && msgTimestamp < (botStartTime - 120)) {
        continue;
      }

      const remoteJid = msg.key?.remoteJid || '';
      const isGroup = remoteJid.endsWith('@g.us');
      const isFamilyGroup = isGroup && (remoteJid === config.familyGroupId || remoteJid.includes('120363430925230357'));

      // Se for mensagem em grupo e NÃO for o grupo de Finanças da Casa, ignora
      if (isGroup && !isFamilyGroup) {
        continue;
      }

      // Identifica quem enviou a mensagem
      let senderName = 'Família';
      if (msg.key.fromMe) {
        senderName = 'Junior';
      } else {
        const participantJid = isGroup ? (msg.key.participant || '') : remoteJid;
        const pushName = msg.pushName || '';
        senderName = getSenderName(participantJid, pushName);
      }

      console.log(`💬 [${new Date().toLocaleTimeString('pt-BR')}] Mensagem de [${senderName}] em [${isGroup ? 'Grupo' : 'Privado'}] (tipo: ${type}, fromMe: ${Boolean(msg.key.fromMe)}): "${rawText}"`);

      // Analisa intenção da mensagem
      const parsed = parseMessage(rawText);
      if (parsed.type === 'unknown') {
        // Se não for um comando ou intenção válida, ignora silenciosamente para não poluir
        continue;
      }

      try {
        const botPrefix = `🤖 *[Gestão de Casa]*\n\n`;

        switch (parsed.type) {
          // 1. MARCAR CONTA COMO PAGA
          case 'mark_paid': {
            const res = await database.markExpenseAsPaid(parsed.accountQuery);
            if (res.success) {
              const summary = await database.getFinancialSummary();
              let reply = `${botPrefix}🎉 *Boa, ${senderName}!* 👏\n\n`;
              reply += `✅ A conta *"${res.expense.description}"* (${database.formatMoney(res.expense.amount)}) foi marcada como *PAGA* no sistema!\n\n`;
              reply += `📊 *Saldo livre restante:* ${database.formatMoney(summary.balance)}\n`;
              reply += `⏳ *Contas pendentes restantes:* ${summary.pendingCount}`;
              await sock.sendMessage(remoteJid, { text: reply });
              console.log(`🤖 [Gestão de Casa] Conta paga respondida para [${senderName}]`);
            } else {
              let reply = `${botPrefix}⚠️ *${senderName}*, ${res.reason}\n`;
              if (res.availablePending && res.availablePending.length > 0) {
                reply += `\n📋 *Contas que estão pendentes no momento:*\n`;
                res.availablePending.forEach(p => {
                  reply += `• ${p}\n`;
                });
              }
              await sock.sendMessage(remoteJid, { text: reply });
              console.log(`🤖 [Gestão de Casa] Conta não encontrada respondida para [${senderName}]`);
            }
            break;
          }

          // 2. CADASTRAR NOVA RECEITA
          case 'add_income': {
            const res = await database.addIncome(parsed.data);
            if (res.success) {
              const summary = await database.getFinancialSummary();
              let reply = `${botPrefix}✅ *Receita cadastrada com sucesso por ${senderName}!* 💰\n\n`;
              reply += `📌 *Descrição:* ${res.income.description}\n`;
              reply += `💵 *Valor:* ${database.formatMoney(res.income.amount)}\n`;
              reply += `📅 *Data:* ${res.income.date}\n`;
              reply += `🏷️ *Categoria:* ${res.income.category}\n\n`;
              reply += `📊 *Receita total da casa:* ${database.formatMoney(summary.totalIncome)}\n`;
              reply += `💵 *Saldo líquido livre:* ${database.formatMoney(summary.balance)}\n\n`;
              reply += `Já está sincronizada em Receitas no painel! 🚀`;
              await sock.sendMessage(remoteJid, { text: reply });
              console.log(`🤖 [Gestão de Casa] Receita cadastrada respondida para [${senderName}]`);
            }
            break;
          }

          case 'add_income_missing_amount': {
            let reply = `${botPrefix}⚠️ *${senderName}*, não consegui identificar o valor em reais da receita.\n`;
            reply += `👉 *Exemplo:* _"receita décimo terceiro 2400"_ ou _"adicionar receita freelance 500"_`;
            await sock.sendMessage(remoteJid, { text: reply });
            break;
          }

          // 3. CADASTRAR NOVA CONTA / DESPESA
          case 'add_expense': {
            const res = await database.addExpense(parsed.data);
            if (res.success) {
              let reply = `${botPrefix}✅ *Conta cadastrada com sucesso por ${senderName}!* 📝\n\n`;
              reply += `📌 *Descrição:* ${res.expense.description}\n`;
              reply += `💰 *Valor:* ${database.formatMoney(res.expense.amount)}\n`;
              reply += `📅 *Vencimento:* ${res.expense.dueDate}\n`;
              reply += `🏷️ *Categoria:* ${res.expense.category}\n\n`;
              reply += `Já está sincronizada no painel da família! 🚀`;
              await sock.sendMessage(remoteJid, { text: reply });
              console.log(`🤖 [Gestão de Casa] Despesa cadastrada respondida para [${senderName}]`);
            }
            break;
          }

          case 'add_expense_missing_amount': {
            let reply = `${botPrefix}⚠️ *${senderName}*, não consegui identificar o valor em reais da conta.\n`;
            reply += `👉 *Exemplo:* _"conta internet 120 dia 28"_ ou _"cadastrar luz 180 hoje"_`;
            await sock.sendMessage(remoteJid, { text: reply });
            break;
          }

          // 4. CONSULTAR CONTAS PENDENTES
          case 'list_pending': {
            const pending = await database.getPendingExpenses();
            if (pending.length === 0) {
              await sock.sendMessage(remoteJid, { text: `${botPrefix}🎉 *Tudo em dia, ${senderName}!* Não há nenhuma conta pendente no momento!` });
              break;
            }

            let reply = `${botPrefix}📋 *Contas Pendentes - Gestão de Casa* 🏠\n`;
            pending.slice(0, 8).forEach(exp => {
              reply += `\n• *${exp.description}*: ${database.formatMoney(exp.amount)}\n`;
              reply += `  📅 Vencimento: ${exp.dueDate} (${exp.category || 'Geral'})\n`;
              if (exp.paymentUrl) {
                reply += `  🔗 Link: ${exp.paymentUrl}\n`;
              }
            });

            reply += `\n💡 Para pagar alguma conta, mande: *"paguei a [nome]"*`;
            await sock.sendMessage(remoteJid, { text: reply });
            console.log(`🤖 [Gestão de Casa] Lista de contas enviada para [${senderName}]`);
            break;
          }

          // 5. CONSULTAR RESUMO / SALDO
          case 'summary': {
            const sum = await database.getFinancialSummary();
            let reply = `${botPrefix}📊 *Resumo Financeiro da Família* 🏠\n\n`;
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
            console.log(`🤖 [Gestão de Casa] Resumo de saldo enviado para [${senderName}]`);
            break;
          }

          // 6. ENVIAR LINK DO SISTEMA
          case 'link': {
            let reply = `${botPrefix}🌐 *Painel do Gestão de Casa:*\n\n`;
            reply += `👉 Acesse pelo link:\nhttps://gestao-de-casa.web.app/\n\n`;
            reply += `💡 *Dica:* Salve nos favoritos do navegador do seu celular para acesso rápido! 📱`;
            await sock.sendMessage(remoteJid, { text: reply });
            console.log(`🤖 [Gestão de Casa] Link enviado para [${senderName}]`);
            break;
          }

          // 7. AJUDA / MENU
          case 'help': {
            let reply = `${botPrefix}👋 *Olá, ${senderName}! Sou o Assistente do Gestão de Casa.* 🤖\n\n`;
            reply += `Vocês podem interagir comigo enviando frases naturais aqui no grupo:\n\n`;
            reply += `👉 *Dar baixa em conta paga:*\n`;
            reply += `  _"paguei a luz"_\n`;
            reply += `  _"condomínio pago"_\n\n`;
            reply += `👉 *Cadastrar nova receita:*\n`;
            reply += `  _"receita décimo terceiro 2400"_\n`;
            reply += `  _"adicionar receita freela 500"_\n\n`;
            reply += `👉 *Cadastrar nova conta/despesa:*\n`;
            reply += `  _"conta internet 120 dia 28"_\n`;
            reply += `  _"nova conta mercado 450 hoje"_\n\n`;
            reply += `👉 *Consultas rápidas:*\n`;
            reply += `  _"link"_ ➔ Envia o link de acesso ao sistema web\n`;
            reply += `  _"contas"_ ➔ Lista as próximas contas a vencer\n`;
            reply += `  _"saldo"_ ➔ Exibe o resumo de receitas, gastos e saldo livre\n\n`;
            reply += `Todo dia de manhã também envio o alerta automático das contas que vencem no dia ou no dia seguinte! 🔔`;
            await sock.sendMessage(remoteJid, { text: reply });
            console.log(`🤖 [Gestão de Casa] Ajuda enviada para [${senderName}]`);
            break;
          }

          default:
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
