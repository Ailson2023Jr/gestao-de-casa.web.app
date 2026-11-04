const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');

const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// MIME types suportados para arquivos estáticos
const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

// Funções auxiliares para leitura/escrita do banco JSON
function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      const initial = { incomes: [], expenses: [] };
      fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2), 'utf8');
      return initial;
    }
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Erro ao ler DB:', err);
    return { incomes: [], expenses: [] };
  }
}

function writeDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Erro ao salvar DB:', err);
    return false;
  }
}

function computeSummary(db) {
  const incomes = db.incomes || [];
  const expenses = db.expenses || [];
  const budgets = db.budgets || {
    "Moradia": 2500,
    "Serviços": 500,
    "Alimentação": 1500,
    "Cartão": 7500,
    "Transporte": 1000,
    "Saúde": 500,
    "Lazer": 300,
    "Investimentos / Reserva": 1000,
    "Outros": 500
  };
  const savingsGoal = db.savingsGoal || {
    monthlyTarget: 1000,
    initialReserve: 2500,
    priorityMode: true
  };

  const totalIncome = incomes.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  const totalExpense = expenses.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  const totalPaid = expenses
    .filter(e => e.paid)
    .reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  const totalPending = totalExpense - totalPaid;
  const balance = totalIncome - totalExpense;
  const expensePercentage = totalIncome > 0 ? (totalExpense / totalIncome) * 100 : (totalExpense > 0 ? 100 : 0);

  // Identificação do mês mais recente e do mês anterior para MoM (Month over Month)
  const monthsFound = [...new Set([
    ...incomes.map(i => (i.date ? i.date.substring(0, 7) : '')),
    ...expenses.map(e => (e.dueDate ? e.dueDate.substring(0, 7) : ''))
  ])].filter(Boolean).sort();

  const currentMonth = monthsFound[monthsFound.length - 1] || new Date().toISOString().substring(0, 7);
  const prevMonthIndex = monthsFound.indexOf(currentMonth) - 1;
  const prevMonth = prevMonthIndex >= 0 ? monthsFound[prevMonthIndex] : null;

  // Cálculos do Mês Corrente
  const currMonthExpenses = expenses.filter(e => e.dueDate && e.dueDate.startsWith(currentMonth));
  const currMonthIncomes = incomes.filter(i => i.date && i.date.startsWith(currentMonth));
  const currMonthExpenseTotal = currMonthExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const currMonthIncomeTotal = currMonthIncomes.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);

  // Análise MoM (Month over Month)
  let mom = null;
  if (prevMonth) {
    const prevMonthExpenses = expenses.filter(e => e.dueDate && e.dueDate.startsWith(prevMonth));
    const prevMonthIncomes = incomes.filter(i => i.date && i.date.startsWith(prevMonth));
    const prevExpTotal = prevMonthExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const prevIncTotal = prevMonthIncomes.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);

    const expenseDiff = currMonthExpenseTotal - prevExpTotal;
    const expenseChangePct = prevExpTotal > 0 ? (expenseDiff / prevExpTotal) * 100 : 0;
    const incomeDiff = currMonthIncomeTotal - prevIncTotal;
    const incomeChangePct = prevIncTotal > 0 ? (incomeDiff / prevIncTotal) * 100 : 0;

    mom = {
      currentMonth,
      prevMonth,
      prevExpTotal,
      prevIncTotal,
      currMonthExpenseTotal,
      currMonthIncomeTotal,
      expenseDiff,
      expenseChangePct: Number(expenseChangePct.toFixed(1)),
      incomeDiff,
      incomeChangePct: Number(incomeChangePct.toFixed(1))
    };
  }

  // Gestão de Metas de Economia ("Pague-se Primeiro")
  const reservedSavingsInExpenses = currMonthExpenses
    .filter(e => e.category === 'Investimentos / Reserva' || e.category === 'Investimentos')
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  const monthlySavingsTarget = Number(savingsGoal.monthlyTarget) || 1000;
  const savingsProgressPct = monthlySavingsTarget > 0
    ? Math.min(100, Number(((reservedSavingsInExpenses / monthlySavingsTarget) * 100).toFixed(1)))
    : 0;

  // Saldo Líquido "Livre para Gastos" (descontando o valor reservado ou a meta)
  const effectiveSpendableBalance = savingsGoal.priorityMode
    ? balance - Math.max(0, monthlySavingsTarget - reservedSavingsInExpenses)
    : balance;

  // Orçamentos por Categoria (Budgets)
  const categoryBudgets = {};
  Object.keys(budgets).forEach(cat => {
    const limit = Number(budgets[cat]) || 0;
    const spent = currMonthExpenses
      .filter(e => e.category === cat)
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const percentage = limit > 0 ? Number(((spent / limit) * 100).toFixed(1)) : 0;
    const remaining = limit - spent;
    let status = 'ok';
    if (percentage > 100) status = 'exceeded';
    else if (percentage >= 80) status = 'warning';

    categoryBudgets[cat] = {
      limit,
      spent,
      remaining,
      percentage,
      status
    };
  });

  return {
    totalIncome,
    totalExpense,
    totalPaid,
    totalPending,
    balance,
    effectiveSpendableBalance,
    expensePercentage: Number(expensePercentage.toFixed(1)),
    currentMonth,
    mom,
    savings: {
      monthlyTarget: monthlySavingsTarget,
      reservedAmount: reservedSavingsInExpenses,
      progressPct: savingsProgressPct,
      priorityMode: Boolean(savingsGoal.priorityMode)
    },
    categoryBudgets
  };
}

function sendJSON(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=UTF-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method.toUpperCase();

  // Tratamento de CORS Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  // API ROUTES
  if (pathname.startsWith('/api/')) {
    const db = readDB();

    // GET /api/finances
    if (pathname === '/api/finances' && method === 'GET') {
      const summary = computeSummary(db);
      return sendJSON(res, 200, {
        success: true,
        data: {
          incomes: db.incomes,
          expenses: db.expenses,
          budgets: db.budgets || {},
          savingsGoal: db.savingsGoal || {},
          summary
        }
      });
    }

    // PUT /api/budgets
    if (pathname === '/api/budgets' && (method === 'PUT' || method === 'POST')) {
      try {
        const body = await parseBody(req);
        if (!body.budgets || typeof body.budgets !== 'object') {
          return sendJSON(res, 400, { success: false, error: 'Objeto de orçamentos inválido.' });
        }
        db.budgets = { ...(db.budgets || {}), ...body.budgets };
        writeDB(db);
        return sendJSON(res, 200, {
          success: true,
          data: db.budgets,
          summary: computeSummary(db)
        });
      } catch (err) {
        return sendJSON(res, 400, { success: false, error: 'JSON inválido.' });
      }
    }

    // PUT /api/savings-goal
    if (pathname === '/api/savings-goal' && (method === 'PUT' || method === 'POST')) {
      try {
        const body = await parseBody(req);
        db.savingsGoal = {
          ...(db.savingsGoal || {}),
          ...body,
          updatedAt: new Date().toISOString()
        };
        writeDB(db);
        return sendJSON(res, 200, {
          success: true,
          data: db.savingsGoal,
          summary: computeSummary(db)
        });
      } catch (err) {
        return sendJSON(res, 400, { success: false, error: 'JSON inválido.' });
      }
    }

    // POST /api/recurrence/clone-month
    if (pathname === '/api/recurrence/clone-month' && method === 'POST') {
      try {
        const body = await parseBody(req);
        const { fromMonth, toMonth } = body;
        if (!fromMonth || !toMonth) {
          return sendJSON(res, 400, { success: false, error: 'fromMonth e toMonth são obrigatórios (ex: 2026-11).' });
        }

        let clonedExpenses = 0;
        let clonedIncomes = 0;

        // Clona despesas recorrentes
        const recurringExpenses = db.expenses.filter(e => e.recurring && e.dueDate && e.dueDate.startsWith(fromMonth));
        recurringExpenses.forEach(exp => {
          const day = exp.dueDate.split('-')[2] || '10';
          const newDueDate = `${toMonth}-${day}`;
          const exists = db.expenses.some(e => e.description === exp.description && e.dueDate && e.dueDate.startsWith(toMonth));
          if (!exists) {
            db.expenses.push({
              id: 'exp-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
              description: exp.description,
              amount: exp.amount,
              dueDate: newDueDate,
              category: exp.category,
              paymentUrl: exp.paymentUrl || '',
              paid: false,
              recurring: true
            });
            clonedExpenses++;
          }
        });

        // Clona receitas recorrentes
        const recurringIncomes = db.incomes.filter(i => i.recurring && i.date && i.date.startsWith(fromMonth));
        recurringIncomes.forEach(inc => {
          const day = inc.date.split('-')[2] || '05';
          const newDate = `${toMonth}-${day}`;
          const exists = db.incomes.some(i => i.description === inc.description && i.date && i.date.startsWith(toMonth));
          if (!exists) {
            db.incomes.push({
              id: 'inc-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
              description: inc.description,
              amount: inc.amount,
              category: inc.category,
              date: newDate,
              recurring: true
            });
            clonedIncomes++;
          }
        });

        writeDB(db);
        return sendJSON(res, 200, {
          success: true,
          message: `${clonedExpenses} contas e ${clonedIncomes} receitas recorrentes clonadas para ${toMonth}.`,
          cloned: { expenses: clonedExpenses, incomes: clonedIncomes },
          summary: computeSummary(db)
        });
      } catch (err) {
        return sendJSON(res, 400, { success: false, error: 'Erro ao clonar mês: ' + err.message });
      }
    }

    // POST /api/incomes
    if (pathname === '/api/incomes' && method === 'POST') {
      try {
        const body = await parseBody(req);
        if (!body.description || body.amount === undefined) {
          return sendJSON(res, 400, { success: false, error: 'Descrição e valor são obrigatórios.' });
        }

        const newIncome = {
          id: 'inc-' + Date.now(),
          description: String(body.description).trim(),
          amount: Math.abs(parseFloat(body.amount)) || 0,
          category: body.category || 'Geral',
          date: body.date || new Date().toISOString().split('T')[0],
          recurring: Boolean(body.recurring)
        };

        db.incomes.unshift(newIncome);
        writeDB(db);

        return sendJSON(res, 201, {
          success: true,
          data: newIncome,
          summary: computeSummary(db)
        });
      } catch (err) {
        return sendJSON(res, 400, { success: false, error: 'JSON inválido no corpo da requisição.' });
      }
    }

    // DELETE /api/incomes/:id
    if (pathname.startsWith('/api/incomes/') && method === 'DELETE') {
      const id = pathname.replace('/api/incomes/', '');
      const initialCount = db.incomes.length;
      db.incomes = db.incomes.filter(inc => inc.id !== id);

      if (db.incomes.length === initialCount) {
        return sendJSON(res, 404, { success: false, error: 'Receita não encontrada.' });
      }

      writeDB(db);
      return sendJSON(res, 200, {
        success: true,
        message: 'Receita excluída com sucesso.',
        summary: computeSummary(db)
      });
    }

    // POST /api/expenses
    if (pathname === '/api/expenses' && method === 'POST') {
      try {
        const body = await parseBody(req);
        if (!body.description || body.amount === undefined) {
          return sendJSON(res, 400, { success: false, error: 'Descrição e valor da conta são obrigatórios.' });
        }

        const newExpense = {
          id: 'exp-' + Date.now(),
          description: String(body.description).trim(),
          amount: Math.abs(parseFloat(body.amount)) || 0,
          dueDate: body.dueDate || new Date().toISOString().split('T')[0],
          category: body.category || 'Outros',
          paymentUrl: body.paymentUrl ? String(body.paymentUrl).trim() : '',
          paid: Boolean(body.paid),
          recurring: Boolean(body.recurring)
        };

        db.expenses.unshift(newExpense);
        writeDB(db);

        return sendJSON(res, 201, {
          success: true,
          data: newExpense,
          summary: computeSummary(db)
        });
      } catch (err) {
        return sendJSON(res, 400, { success: false, error: 'JSON inválido no corpo da requisição.' });
      }
    }

    // PUT /api/expenses/:id (Edição de Conta)
    if (pathname.startsWith('/api/expenses/') && !pathname.endsWith('/toggle') && (method === 'PUT' || method === 'PATCH')) {
      const id = pathname.replace('/api/expenses/', '');
      const expense = db.expenses.find(exp => exp.id === id);

      if (!expense) {
        return sendJSON(res, 404, { success: false, error: 'Conta não encontrada.' });
      }

      try {
        const body = await parseBody(req);
        if (body.description !== undefined) expense.description = String(body.description).trim();
        if (body.amount !== undefined) expense.amount = Math.abs(parseFloat(body.amount)) || 0;
        if (body.dueDate !== undefined) expense.dueDate = body.dueDate;
        if (body.category !== undefined) expense.category = body.category;
        if (body.paymentUrl !== undefined) expense.paymentUrl = String(body.paymentUrl).trim();
        if (body.paid !== undefined) expense.paid = Boolean(body.paid);
        if (body.recurring !== undefined) expense.recurring = Boolean(body.recurring);

        writeDB(db);

        return sendJSON(res, 200, {
          success: true,
          data: expense,
          summary: computeSummary(db)
        });
      } catch (err) {
        return sendJSON(res, 400, { success: false, error: 'JSON inválido no corpo da requisição.' });
      }
    }

    // PATCH /api/expenses/:id/toggle
    if (pathname.startsWith('/api/expenses/') && pathname.endsWith('/toggle') && method === 'PATCH') {
      const parts = pathname.split('/');
      const id = parts[3];
      const expense = db.expenses.find(exp => exp.id === id);

      if (!expense) {
        return sendJSON(res, 404, { success: false, error: 'Conta não encontrada.' });
      }

      expense.paid = !expense.paid;
      writeDB(db);

      return sendJSON(res, 200, {
        success: true,
        data: expense,
        summary: computeSummary(db)
      });
    }

    // DELETE /api/expenses/:id
    if (pathname.startsWith('/api/expenses/') && method === 'DELETE') {
      const id = pathname.replace('/api/expenses/', '');
      const initialCount = db.expenses.length;
      db.expenses = db.expenses.filter(exp => exp.id !== id);

      if (db.expenses.length === initialCount) {
        return sendJSON(res, 404, { success: false, error: 'Conta não encontrada.' });
      }

      writeDB(db);
      return sendJSON(res, 200, {
        success: true,
        message: 'Conta excluída com sucesso.',
        summary: computeSummary(db)
      });
    }

    // Rota não encontrada na API
    return sendJSON(res, 404, { success: false, error: 'Rota de API não encontrada.' });
  }

  // STATIC FILE SERVER
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') {
    safePath = '/index.html';
  }

  const filePath = path.join(PUBLIC_DIR, safePath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=UTF-8' });
        res.end('<h1>404 - Página Não Encontrada</h1>');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=UTF-8' });
        res.end('<h1>500 - Erro Interno do Servidor</h1>');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🏠 Sistema de Gestão de Contas de Casa rodando em:`);
  console.log(`👉 http://localhost:${PORT}`);
  console.log(`=======================================================`);
});

