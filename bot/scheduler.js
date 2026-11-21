// Agendador de Lembretes Diários de Contas (WhatsApp)
const cron = require('node-cron');
const config = require('./config');
const database = require('./database');

/**
 * Monta o texto do lembrete matinal
 */
function buildDailyAlertMessage(dueToday, dueTomorrow, overdue) {
  let msg = `🔔 *Bom dia, família! Lembrete do Gestão de Casa* 🏠\n`;

  if (dueToday.length === 0 && dueTomorrow.length === 0 && overdue.length === 0) {
    return null; // Nada vencendo hoje nem amanhã
  }

  if (dueToday.length > 0) {
    msg += `\n🚨 *VENCEM HOJE:*\n`;
    dueToday.forEach(exp => {
      msg += `• *${exp.description}*: ${database.formatMoney(exp.amount)} (${exp.category || 'Geral'})\n`;
      if (exp.paymentUrl) {
        msg += `  🔗 Link: ${exp.paymentUrl}\n`;
      }
    });
  }

  if (dueTomorrow.length > 0) {
    msg += `\n⚠️ *VENCEM AMANHÃ:*\n`;
    dueTomorrow.forEach(exp => {
      msg += `• *${exp.description}*: ${database.formatMoney(exp.amount)} (${exp.category || 'Geral'})\n`;
      if (exp.paymentUrl) {
        msg += `  🔗 Link: ${exp.paymentUrl}\n`;
      }
    });
  }

  if (overdue.length > 0) {
    msg += `\n❗ *ATENÇÃO: Contas pendentes anteriores:*\n`;
    overdue.slice(0, 3).forEach(exp => {
      msg += `• *${exp.description}*: ${database.formatMoney(exp.amount)} (venceu ${exp.dueDate})\n`;
    });
  }

  msg += `\n💡 *Dica:* Quando pagarem alguma conta, basta mandar aqui no grupo:\n`;
  msg += `👉 *"paguei a luz"* ou *"condomínio pago"* para dar baixa no sistema!`;

  return msg;
}

/**
 * Inicia o cron agendador
 * @param {Function} sendMessageFn - Função para envio de mensagem via WhatsApp (jid, text)
 * @param {Function} getTargetJidFn - Retorna o JID do grupo familiar
 */
function startDailyScheduler(sendMessageFn, getTargetJidFn) {
  console.log(`⏰ Agendador de lembretes ativado com cron: "${config.alertCronSchedule}"`);

  cron.schedule(config.alertCronSchedule, async () => {
    try {
      const targetJid = getTargetJidFn();
      if (!targetJid) {
        console.warn('⚠️ Alerta matinal não disparado: grupo familiar ainda não identificado.');
        return;
      }

      console.log('⏰ Executando verificação de vencimentos para envio de alerta...');
      const { dueToday, dueTomorrow, overdue } = await database.getExpensesDueSoon();
      const message = buildDailyAlertMessage(dueToday, dueTomorrow, overdue);

      if (message) {
        await sendMessageFn(targetJid, message);
        console.log(`✅ Alerta de vencimento enviado com sucesso para o grupo ${targetJid}!`);
      } else {
        console.log('✨ Nenhuma conta vence hoje ou amanhã. Nenhum alerta necessário.');
      }
    } catch (err) {
      console.error('❌ Erro no agendador de lembretes matinais:', err);
    }
  });
}

module.exports = {
  buildDailyAlertMessage,
  startDailyScheduler
};
