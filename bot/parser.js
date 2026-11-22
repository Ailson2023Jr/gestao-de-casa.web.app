// Parser de Mensagens em Linguagem Natural para o Bot de WhatsApp
const config = require('./config');

/**
 * Remove acentos e converte para minúsculas para comparações tolerantes
 */
function normalizeText(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Detecta a categoria mais provável a partir do nome da conta
 */
function detectCategory(description) {
  const normDesc = normalizeText(description);
  for (const [catName, keywords] of Object.entries(config.categoryKeywords)) {
    for (const kw of keywords) {
      if (normDesc.includes(normalizeText(kw))) {
        return catName;
      }
    }
  }
  return 'Outros';
}

/**
 * Extrai valor monetário de um texto (ex: "R$ 150,50", "150.50", "150", "150,00", "R$2400")
 * Ignora números ordinais como 1°, 2°, 1ª, etc.
 */
function extractAmount(text) {
  if (!text) return null;

  // 1. Remove números ordinais para não confundir com valores (ex: "2° parcela", "1ª prestação")
  const clean = text.replace(/\b\d+\s*[°ºª]/gi, ' ');

  // 2. Busca com prioridade valores acompanhados de 'R$' ou 'reais'
  const currencyMatch = clean.match(/r\$\s*(\d+(?:[.,]\d{1,2})?)/i) ||
                        clean.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:reais|real)/i);
  if (currencyMatch) {
    const val = parseFloat(currencyMatch[1].replace(',', '.'));
    if (!isNaN(val) && val > 0) return val;
  }

  // 3. Se não tiver 'R$', remove datas no formato DD/MM/AAAA ou DD/MM e 'dia X' antes de procurar números
  const noDates = clean
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, ' ')
    .replace(/(?:dia|vencimento|vence)\s*\d{1,2}/gi, ' ');

  // 4. Procura qualquer número restante
  const numberMatch = noDates.match(/\b(\d+(?:[.,]\d{1,2})?)\b/);
  if (numberMatch) {
    const val = parseFloat(numberMatch[1].replace(',', '.'));
    if (!isNaN(val) && val > 0) return val;
  }

  return null;
}

/**
 * Extrai data de vencimento a partir do texto
 * Suporta:
 * - "dia 25" -> 2026-11-25 (se o dia for no mês atual ou próximo)
 * - "25/11" ou "25/11/2026"
 * - "amanha" / "amanhã"
 * - "hoje"
 */
function extractDueDate(text) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-based

  const norm = normalizeText(text);

  if (norm.includes('hoje')) {
    return now.toISOString().substring(0, 10);
  }

  if (norm.includes('amanha')) {
    const tmrw = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return tmrw.toISOString().substring(0, 10);
  }

  // Formato DD/MM/AAAA ou DD/MM
  const dateMatch = text.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (dateMatch) {
    const day = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10) - 1;
    let year = dateMatch[3] ? parseInt(dateMatch[3], 10) : currentYear;
    if (year < 100) year += 2000;
    const d = new Date(year, month, day);
    return d.toISOString().substring(0, 10);
  }

  // Formato "dia X" ou "vencimento X" ou "vence X"
  const dayMatch = text.match(/(?:dia|vencimento|vence)\s*(\d{1,2})/i);
  if (dayMatch) {
    const day = parseInt(dayMatch[1], 10);
    if (day >= 1 && day <= 31) {
      // Se o dia informado já passou muito neste mês, agenda para o próximo mês
      let targetMonth = currentMonth;
      let targetYear = currentYear;
      if (day < now.getDate() - 3) {
        targetMonth += 1;
        if (targetMonth > 11) {
          targetMonth = 0;
          targetYear += 1;
        }
      }
      const d = new Date(targetYear, targetMonth, day);
      return d.toISOString().substring(0, 10);
    }
  }

  // Padrão: vence no final do mês atual se não especificado
  const endOfMonth = new Date(currentYear, currentMonth + 1, 0);
  return endOfMonth.toISOString().substring(0, 10);
}

/**
 * Analisa a mensagem recebida e retorna a intenção e os parâmetros
 */
function parseMessage(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return { type: 'unknown' };
  }

  const text = rawText.trim();
  const norm = normalizeText(text);

  // 1. INTENÇÃO: AJUDA / MENU
  if (['ajuda', 'menu', 'oi', 'ola', 'ola bot', 'start', 'comandos'].includes(norm)) {
    return { type: 'help' };
  }

  // 1.1 INTENÇÃO: ENVIAR LINK DO SISTEMA
  if (['link', 'site', 'painel', 'sistema', 'app', 'web', 'url'].includes(norm) || norm === 'mandar o link' || norm === 'manda o link') {
    return { type: 'link' };
  }

  // 2. INTENÇÃO: CONSULTAR SALDO OU RESUMO
  if (['saldo', 'resumo', 'como estamos', 'status', 'relatorio'].includes(norm)) {
    return { type: 'summary' };
  }

  // 3. INTENÇÃO: CONSULTAR CONTAS A VENCER
  if (
    norm.includes('contas') ||
    norm.includes('vencem') ||
    norm.includes('vencendo') ||
    norm.includes('pendentes') ||
    norm.includes('o que falta')
  ) {
    return { type: 'list_pending' };
  }

  // 4. INTENÇÃO: MARCAR CONTA COMO PAGA
  // Padrões:
  // "paguei a luz", "paguei o condominio", "paguei conta x", "paguei x"
  // "luz paga", "condominio pago", "cartão pago", "conta x paga"
  const payRegex1 = /^paguei(?:\s+a|\s+o|\s+minha|\s+a\s+conta|\s+o\s+boleto|\s+conta)?\s+(.+)$/i;
  const payRegex2 = /^(.+?)\s+(?:pago|paga|liquidado|quitado|liquidada|quitada)$/i;

  const matchPay1 = text.match(payRegex1);
  const matchPay2 = text.match(payRegex2);

  if (matchPay1 && matchPay1[1]) {
    return {
      type: 'mark_paid',
      accountQuery: matchPay1[1].trim()
    };
  }

  if (matchPay2 && matchPay2[1]) {
    // Evita falsos positivos com frases genéricas
    const query = matchPay2[1].replace(/^(a\s+|o\s+|conta\s+(?:de\s+|da\s+|do\s+)?)/i, '').trim();
    if (query.length >= 2) {
      return {
        type: 'mark_paid',
        accountQuery: query
      };
    }
  }

  // 5. INTENÇÃO: CADASTRAR NOVA RECEITA
  // Padrões: "adicionar receita...", "nova receita...", "receita...", "recebi...", "salario...", "ganhei..."
  const isIncomeCommand = norm.includes('receita') ||
                          norm.startsWith('adicionar receita') ||
                          norm.startsWith('nova receita') ||
                          norm.startsWith('recebi') ||
                          norm.startsWith('salario') ||
                          norm.startsWith('ganhei') ||
                          norm.startsWith('renda');

  if (isIncomeCommand) {
    let cleanText = text
      .replace(/^(adicionar\s+receita|nova\s+receita|receita|recebi|salario|ganhei|adicionar|nova)\s*[.:-]?\s*/i, '')
      .trim();

    const amount = extractAmount(cleanText) || extractAmount(text);
    if (!amount) {
      return {
        type: 'add_income_missing_amount',
        rawText: text
      };
    }

    const incomeDate = extractDueDate(cleanText);

    // Isola descrição da receita
    let description = cleanText
      .replace(/r\$\s*(\d+(?:[.,]\d{1,2})?)/gi, '')
      .replace(/\b(\d+(?:[.,]\d{1,2})?)\s*(?:reais|real)\b/gi, '')
      .replace(/(?:dia|vencimento|vence)\s*\d{1,2}(?:\/\d{1,2}(?:\/\d{2,4})?)?/gi, '')
      .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, '')
      .replace(/\b(hoje|amanha|amanhã)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!description || description.length < 2) {
      description = 'Receita cadastrada via WhatsApp';
    } else {
      description = description.charAt(0).toUpperCase() + description.slice(1);
    }

    // Categoria da receita: Salário vs Extra
    let category = 'Salário';
    const normDesc = normalizeText(description);
    if (normDesc.includes('extra') || normDesc.includes('venda') || normDesc.includes('freela') || normDesc.includes('3d') || normDesc.includes('bico')) {
      category = 'Extra';
    }

    return {
      type: 'add_income',
      data: {
        description,
        amount,
        date: incomeDate,
        category,
        recurring: false
      }
    };
  }

  // 6. INTENÇÃO: CADASTRAR NOVA CONTA / DESPESA
  // Padrões:
  // "cadastrar conta luz 150 dia 25"
  // "nova conta internet 120 28/11"
  // "conta mercado 350 dia 22"
  const isAddCommand = norm.startsWith('cadastrar') || norm.startsWith('nova conta') || norm.startsWith('adicionar conta') || norm.startsWith('adicionar despesa') || norm.startsWith('conta') || norm.startsWith('gastei') || norm.startsWith('comprei');

  if (isAddCommand) {
    // Limpa prefixos
    let cleanText = text
      .replace(/^(cadastrar\s+conta|cadastrar\s+despesa|cadastrar|nova\s+conta|nova\s+despesa|adicionar\s+conta|adicionar\s+despesa|adicionar|conta|gastei|comprei)\s*[.:-]?\s*/i, '')
      .trim();

    // Extrai valor
    const amount = extractAmount(cleanText) || extractAmount(text);
    if (!amount) {
      return {
        type: 'add_expense_missing_amount',
        rawText: text
      };
    }

    // Extrai data
    const dueDate = extractDueDate(cleanText);

    // Remove do texto o valor e a data para isolar a descrição da conta
    let description = cleanText
      .replace(/r\$\s*(\d+(?:[.,]\d{1,2})?)/gi, '')
      .replace(/\b(\d+(?:[.,]\d{1,2})?)\s*(?:reais|real)\b/gi, '')
      .replace(/(?:dia|vencimento|vence)\s*\d{1,2}(?:\/\d{1,2}(?:\/\d{2,4})?)?/gi, '')
      .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, '')
      .replace(/\b(hoje|amanha|amanhã)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!description || description.length < 2) {
      description = 'Despesa cadastrada via WhatsApp';
    } else {
      // Capitaliza primeira letra
      description = description.charAt(0).toUpperCase() + description.slice(1);
    }

    const category = detectCategory(description);

    return {
      type: 'add_expense',
      data: {
        description,
        amount,
        dueDate,
        category,
        paid: false
      }
    };
  }

  // Não reconhecido
  return {
    type: 'unknown',
    rawText: text
  };
}

module.exports = {
  parseMessage,
  normalizeText,
  detectCategory,
  extractAmount,
  extractDueDate
};
