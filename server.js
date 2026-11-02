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
  const totalIncome = db.incomes.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  const totalExpense = db.expenses.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  const totalPaid = db.expenses
    .filter(e => e.paid)
    .reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  const totalPending = totalExpense - totalPaid;
  const balance = totalIncome - totalExpense;
  const expensePercentage = totalIncome > 0 ? (totalExpense / totalIncome) * 100 : (totalExpense > 0 ? 100 : 0);

  return {
    totalIncome,
    totalExpense,
    totalPaid,
    totalPending,
    balance,
    expensePercentage: Number(expensePercentage.toFixed(1))
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
          summary
        }
      });
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
          date: body.date || new Date().toISOString().split('T')[0]
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
          paid: Boolean(body.paid)
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

