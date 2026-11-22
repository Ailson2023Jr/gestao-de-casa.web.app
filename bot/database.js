// Camada de Banco de Dados para o Bot WhatsApp (Cloud Firestore)
const firebase = require('firebase/compat/app');
require('firebase/compat/firestore');
const config = require('./config');
const { normalizeText } = require('./parser');

let db = null;

function getDb() {
  if (!db) {
    if (!firebase.apps.length) {
      firebase.initializeApp(config.firebaseConfig);
    }
    db = firebase.firestore();
  }
  return db;
}

/**
 * Formata valor em moeda BRL
 */
function formatMoney(val) {
  const num = Number(val) || 0;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Busca todas as despesas pendentes (paid: false)
 */
async function getPendingExpenses() {
  const firestore = getDb();
  const snapshot = await firestore.collection('expenses').get();
  const expenses = [];

  snapshot.forEach(doc => {
    const data = doc.data();
    if (!data.paid) {
      expenses.push({ id: doc.id, ...data });
    }
  });

  // Ordena por proximidade da data de vencimento
  expenses.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
  return expenses;
}

/**
 * Busca despesas que vencem hoje (D-0) ou amanhã (D-1)
 */
async function getExpensesDueSoon() {
  const pending = await getPendingExpenses();
  const now = new Date();

  // YYYY-MM-DD local
  const todayStr = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().substring(0, 10);
  const tmrw = new Date(now.getTime() + 24 * 60 * 60 * 1000 - now.getTimezoneOffset() * 60000);
  const tmrwStr = tmrw.toISOString().substring(0, 10);

  const dueToday = [];
  const dueTomorrow = [];
  const overdue = [];

  pending.forEach(exp => {
    const due = (exp.dueDate || '').substring(0, 10);
    if (due === todayStr) {
      dueToday.push(exp);
    } else if (due === tmrwStr) {
      dueTomorrow.push(exp);
    } else if (due < todayStr) {
      overdue.push(exp);
    }
  });

  return { dueToday, dueTomorrow, overdue };
}

/**
 * Dá baixa em uma conta pelo nome/descrição informada
 */
async function markExpenseAsPaid(searchQuery) {
  const pending = await getPendingExpenses();
  if (pending.length === 0) {
    return { success: false, reason: 'Nenhuma conta pendente encontrada no sistema.' };
  }

  const queryNorm = normalizeText(searchQuery);

  // Procura por correspondência exata ou parcial
  let matches = pending.filter(exp => {
    const descNorm = normalizeText(exp.description);
    return descNorm.includes(queryNorm) || queryNorm.includes(descNorm);
  });

  // Se não achar por substring direta, divide em palavras
  if (matches.length === 0) {
    const queryWords = queryNorm.split(/\s+/).filter(w => w.length >= 3);
    matches = pending.filter(exp => {
      const descNorm = normalizeText(exp.description);
      return queryWords.some(w => descNorm.includes(w));
    });
  }

  if (matches.length === 0) {
    return {
      success: false,
      reason: `Não encontrei nenhuma conta pendente correspondente a "${searchQuery}".`,
      availablePending: pending.slice(0, 5).map(e => e.description)
    };
  }

  // Se houver mais de uma, pega a que tiver vencimento mais próximo
  const targetExpense = matches[0];

  const firestore = getDb();
  await firestore.collection('expenses').doc(targetExpense.id).update({
    paid: true,
    paidAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  return {
    success: true,
    expense: {
      ...targetExpense,
      paid: true
    }
  };
}

/**
 * Adiciona uma nova conta/despesa no Firestore
 */
async function addExpense(data) {
  const firestore = getDb();
  const newDoc = {
    description: data.description,
    amount: Number(data.amount),
    dueDate: data.dueDate,
    category: data.category || 'Outros',
    paid: Boolean(data.paid),
    recurring: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const docRef = await firestore.collection('expenses').add(newDoc);
  return {
    success: true,
    expense: {
      id: docRef.id,
      ...newDoc
    }
  };
}

/**
 * Adiciona uma nova receita no Firestore
 */
async function addIncome(data) {
  const firestore = getDb();
  const now = new Date();
  const todayStr = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().substring(0, 10);

  const newDoc = {
    description: data.description,
    amount: Number(data.amount),
    date: data.date || todayStr,
    category: data.category || 'Salário',
    recurring: Boolean(data.recurring),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const docRef = await firestore.collection('incomes').add(newDoc);
  return {
    success: true,
    income: {
      id: docRef.id,
      ...newDoc
    }
  };
}

/**
 * Obtém o resumo financeiro atualizado (Receitas, Despesas, Saldo)
 */
async function getFinancialSummary() {
  const firestore = getDb();
  const [incSnap, expSnap] = await Promise.all([
    firestore.collection('incomes').get(),
    firestore.collection('expenses').get()
  ]);

  let totalIncome = 0;
  let totalExpense = 0;
  let totalPaid = 0;
  let pendingCount = 0;

  incSnap.forEach(d => {
    totalIncome += Number(d.data().amount) || 0;
  });

  expSnap.forEach(d => {
    const val = Number(d.data().amount) || 0;
    totalExpense += val;
    if (d.data().paid) {
      totalPaid += val;
    } else {
      pendingCount++;
    }
  });

  const balance = totalIncome - totalExpense;
  const expensePercent = totalIncome > 0 ? (totalExpense / totalIncome) * 100 : 0;

  return {
    totalIncome,
    totalExpense,
    totalPaid,
    totalPending: totalExpense - totalPaid,
    pendingCount,
    balance,
    expensePercent
  };
}

module.exports = {
  getDb,
  formatMoney,
  getPendingExpenses,
  getExpensesDueSoon,
  markExpenseAsPaid,
  addExpense,
  addIncome,
  getFinancialSummary
};
