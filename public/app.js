// Gestão de Casa - Lógica Full Stack com Firebase Cloud Firestore & Fallback LocalStorage
document.addEventListener('DOMContentLoaded', () => {
  // Configuração do Google Firebase Firestore (Nuvem 24/7)
  const firebaseConfig = {
    apiKey: "AIzaSyBGNhFpku1g9chwxllMa64-dUnZSNyOL0I",
    authDomain: "gestao-de-casa.firebaseapp.com",
    projectId: "gestao-de-casa",
    storageBucket: "gestao-de-casa.firebasestorage.app",
    messagingSenderId: "654288457597",
    appId: "1:654288457597:web:22d730ce4b75ca4eb40614",
    measurementId: "G-NJ5E0F81R3"
  };

  let firestoreDb = null;
  let useFirestore = false;

  try {
    if (typeof firebase !== 'undefined') {
      if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
      }
      firestoreDb = firebase.firestore();
      useFirestore = true;
      console.log('☁️ Firebase Firestore conectado com sucesso!');
    }
  } catch (err) {
    console.warn('Firebase indisponível ou offline:', err);
  }

  // Estado da Aplicação
  let state = {
    isOnline: false,
    currentFilter: 'all',
    incomes: [],
    expenses: [],
    pendingDelete: null, // { type: 'income' | 'expense', id: string, name: string }
    chartInstance: null,
    monthlyChartInstance: null,
    currentChartTab: 'overview'
  };

  // Elementos do DOM
  const elements = {
    connectionBadge: document.getElementById('connectionBadge'),
    connectionText: document.getElementById('connectionText'),
    currentDateDisplay: document.getElementById('currentDateDisplay'),

    // Botão de Abrir Gráfico
    openChartBtn: document.getElementById('openChartBtn'),

    // Modal de Gráfico
    chartModal: document.getElementById('chartModal'),
    closeChartModalBtn: document.getElementById('closeChartModalBtn'),
    closeChartBottomBtn: document.getElementById('closeChartBottomBtn'),
    chartModalIncome: document.getElementById('chartModalIncome'),
    chartModalExpense: document.getElementById('chartModalExpense'),
    chartModalExpensePercent: document.getElementById('chartModalExpensePercent'),
    chartModalBalance: document.getElementById('chartModalBalance'),
    chartModalBalancePercent: document.getElementById('chartModalBalancePercent'),
    tabOverviewBtn: document.getElementById('tabOverviewBtn'),
    tabCategoriesBtn: document.getElementById('tabCategoriesBtn'),
    tabMonthlyBtn: document.getElementById('tabMonthlyBtn'),
    chartViewOverview: document.getElementById('chartViewOverview'),
    chartViewCategories: document.getElementById('chartViewCategories'),
    chartViewMonthly: document.getElementById('chartViewMonthly'),
    categoryBarsContainer: document.getElementById('categoryBarsContainer'),
    chartModalFooterNote: document.getElementById('chartModalFooterNote'),
    mainBarChartCanvas: document.getElementById('mainBarChartCanvas'),
    monthlyBarChartCanvas: document.getElementById('monthlyBarChartCanvas'),
    monthlyBreakdownContainer: document.getElementById('monthlyBreakdownContainer'),

    // Cards
    cardTotalIncome: document.getElementById('cardTotalIncome'),
    cardTotalExpenses: document.getElementById('cardTotalExpenses'),
    cardBalance: document.getElementById('cardBalance'),
    balanceStatusText: document.getElementById('balanceStatusText'),
    cardPaidAmount: document.getElementById('cardPaidAmount'),
    cardPendingAmount: document.getElementById('cardPendingAmount'),
    countIncomes: document.getElementById('countIncomes'),
    countExpenses: document.getElementById('countExpenses'),

    // Barra de Porcentagem & Diagnóstico
    percentageDisplay: document.getElementById('percentageDisplay'),
    percentageBadge: document.getElementById('percentageBadge'),
    progressBar: document.getElementById('progressBar'),
    progressBarInsideText: document.getElementById('progressBarInsideText'),
    analysisText: document.getElementById('analysisText'),
    analysisIcon: document.getElementById('analysisIcon'),
    percentageContainer: document.getElementById('percentageContainer'),

    // Formulários
    incomeForm: document.getElementById('incomeForm'),
    incomeDescription: document.getElementById('incomeDescription'),
    incomeAmount: document.getElementById('incomeAmount'),
    incomeCategory: document.getElementById('incomeCategory'),
    incomeDate: document.getElementById('incomeDate'),
    incomeList: document.getElementById('incomeList'),
    incomeCountBadge: document.getElementById('incomeCountBadge'),

    expenseForm: document.getElementById('expenseForm'),
    expenseDescription: document.getElementById('expenseDescription'),
    expenseAmount: document.getElementById('expenseAmount'),
    expenseDueDate: document.getElementById('expenseDueDate'),
    expenseCategory: document.getElementById('expenseCategory'),
    expensePaymentUrl: document.getElementById('expensePaymentUrl'),
    expensePaid: document.getElementById('expensePaid'),
    expenseList: document.getElementById('expenseList'),

    // Modal de Edição de Conta
    editExpenseModal: document.getElementById('editExpenseModal'),
    editExpenseForm: document.getElementById('editExpenseForm'),
    editExpenseId: document.getElementById('editExpenseId'),
    editExpenseDescription: document.getElementById('editExpenseDescription'),
    editExpenseAmount: document.getElementById('editExpenseAmount'),
    editExpenseDueDate: document.getElementById('editExpenseDueDate'),
    editExpenseCategory: document.getElementById('editExpenseCategory'),
    editExpensePaymentUrl: document.getElementById('editExpensePaymentUrl'),
    editExpensePaid: document.getElementById('editExpensePaid'),
    closeEditModalBtn: document.getElementById('closeEditModalBtn'),
    cancelEditModalBtn: document.getElementById('cancelEditModalBtn'),

    // Filtros
    filterButtons: document.querySelectorAll('.filter-btn'),

    // Modal
    deleteModal: document.getElementById('deleteModal'),
    modalTitle: document.getElementById('modalTitle'),
    modalDescription: document.getElementById('modalDescription'),
    modalCancelBtn: document.getElementById('modalCancelBtn'),
    modalConfirmBtn: document.getElementById('modalConfirmBtn'),

    toastContainer: document.getElementById('toastContainer')
  };

  // Funções Utilitárias de Formatação
  const formatPaymentUrl = (url) => {
    if (!url) return '';
    let trimmed = String(url).trim();
    if (!trimmed) return '';
    if (!/^https?:\/\//i.test(trimmed)) {
      trimmed = 'https://' + trimmed;
    }
    return trimmed;
  };
  const formatMoney = (val) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(Number(val) || 0);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '--';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  // Exibir Toast
  const showToast = (message, type = 'success') => {
    const toast = document.createElement('div');
    const isSuccess = type === 'success';
    const isError = type === 'error';

    toast.className = `pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl border text-sm transition-all transform translate-y-2 opacity-0 duration-300 ${
      isSuccess ? 'bg-slate-900 border-emerald-500/50 text-emerald-300' :
      isError ? 'bg-slate-900 border-rose-500/50 text-rose-300' :
      'bg-slate-900 border-blue-500/50 text-blue-300'
    }`;

    toast.innerHTML = `
      <span class="w-2 h-2 rounded-full ${isSuccess ? 'bg-emerald-400' : isError ? 'bg-rose-400' : 'bg-blue-400'}"></span>
      <span class="font-medium">${message}</span>
    `;

    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.remove('translate-y-2', 'opacity-0');
    }, 10);

    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  };

  // Atualizar data atual no cabeçalho e nos inputs
  const setupDates = () => {
    const today = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    elements.currentDateDisplay.textContent = today.toLocaleDateString('pt-BR', options);

    const isoDate = today.toISOString().split('T')[0];
    elements.incomeDate.value = isoDate;
    elements.expenseDueDate.value = isoDate;
  };

  // Inicializar dados do LocalStorage se a API estiver indisponível
  const getLocalData = () => {
    const defaultData = {
      incomes: [
        { id: 'inc-1', description: 'Salário Mensal', amount: 5500, category: 'Salário', date: '2026-10-05' },
        { id: 'inc-2', description: 'Renda Extra / Freelance', amount: 1200, category: 'Extra', date: '2026-10-18' }
      ],
      expenses: [
        { id: 'exp-1', description: 'Aluguel & Condomínio', amount: 1800, dueDate: '2026-11-10', category: 'Moradia', paid: true },
        { id: 'exp-2', description: 'Energia Elétrica (Enel)', amount: 230.50, dueDate: '2026-11-15', category: 'Serviços', paid: false },
        { id: 'exp-3', description: 'Internet Fibra 500MB', amount: 119.90, dueDate: '2026-11-12', category: 'Serviços', paid: true },
        { id: 'exp-4', description: 'Supermercado Mensal', amount: 1150, dueDate: '2026-11-08', category: 'Alimentação', paid: false },
        { id: 'exp-5', description: 'Fatura do Cartão', amount: 840, dueDate: '2026-11-20', category: 'Cartão', paid: false }
      ]
    };

    try {
      const stored = localStorage.getItem('gestao_de_casa_data');
      if (stored) {
        return JSON.parse(stored);
      }
      localStorage.setItem('gestao_de_casa_data', JSON.stringify(defaultData));
      return defaultData;
    } catch (e) {
      return defaultData;
    }
  };

  const saveLocalData = () => {
    try {
      localStorage.setItem('gestao_de_casa_data', JSON.stringify({
        incomes: state.incomes,
        expenses: state.expenses
      }));
    } catch (e) {
      console.error('Falha ao salvar localmente:', e);
    }
  };

  // Sincronizar com a Nuvem (Firestore) ou Servidor/LocalStorage
  const loadData = async () => {
    // 1. Conexão Primária: Firebase Firestore (Nuvem em Tempo Real 24/7)
    if (useFirestore && firestoreDb) {
      state.isOnline = true;
      elements.connectionText.textContent = 'Nuvem Conectada';
      elements.connectionBadge.className = 'hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium';

      let firstIncomeCheck = false;
      let firstExpenseCheck = false;

      // Escuta em tempo real da coleção de receitas
      firestoreDb.collection('incomes').orderBy('date', 'desc').onSnapshot(
        (snapshot) => {
          if (!firstIncomeCheck) {
            firstIncomeCheck = true;
            // Se o Firestore estiver vazio na primeira vez, migra dados locais para a nuvem
            if (snapshot.empty) {
              const local = getLocalData();
              if (local.incomes && local.incomes.length > 0) {
                local.incomes.forEach(inc => {
                  const { id, ...data } = inc;
                  firestoreDb.collection('incomes').add(data);
                });
                return;
              }
            }
          }

          state.incomes = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          renderAll();
        },
        (err) => {
          console.warn('Erro Firestore receitas, usando fallback local:', err);
          fallbackLocalLoad();
        }
      );

      // Escuta em tempo real da coleção de despesas
      firestoreDb.collection('expenses').orderBy('dueDate', 'asc').onSnapshot(
        (snapshot) => {
          if (!firstExpenseCheck) {
            firstExpenseCheck = true;
            if (snapshot.empty) {
              const local = getLocalData();
              if (local.expenses && local.expenses.length > 0) {
                local.expenses.forEach(exp => {
                  const { id, ...data } = exp;
                  firestoreDb.collection('expenses').add(data);
                });
                return;
              }
            }
          }

          state.expenses = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          renderAll();
        },
        (err) => {
          console.warn('Erro Firestore despesas, usando fallback local:', err);
          fallbackLocalLoad();
        }
      );

      return;
    }

    fallbackLocalLoad();
  };

  const fallbackLocalLoad = async () => {
    try {
      const res = await fetch('/api/finances');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          state.isOnline = true;
          state.incomes = json.data.incomes || [];
          state.expenses = json.data.expenses || [];
          elements.connectionText.textContent = 'Servidor Local';
          elements.connectionBadge.className = 'hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium';
          renderAll();
          return;
        }
      }
    } catch (err) {
      console.log('Servidor backend offline ou abrindo via arquivo estático, usando LocalStorage.');
    }

    // Fallback Offline
    state.isOnline = false;
    const local = getLocalData();
    state.incomes = local.incomes;
    state.expenses = local.expenses;
    elements.connectionText.textContent = 'Modo Local (Offline)';
    elements.connectionBadge.className = 'hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-medium';
    renderAll();
  };

  // Renderização Geral
  const renderAll = () => {
    renderSummaryAndBar();
    renderIncomes();
    renderExpenses();
    if (elements.chartModal && !elements.chartModal.classList.contains('hidden')) {
      updateChartModalContent();
    }
  };

  // Renderização da Barra de Porcentagem e dos Cards de Resumo
  const renderSummaryAndBar = () => {
    const totalIncome = state.incomes.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
    const totalExpense = state.expenses.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
    const totalPaid = state.expenses.filter(e => e.paid).reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
    const totalPending = totalExpense - totalPaid;
    const balance = totalIncome - totalExpense;

    const percentage = totalIncome > 0 
      ? (totalExpense / totalIncome) * 100 
      : (totalExpense > 0 ? 100 : 0);

    const roundedPercentage = Number(percentage.toFixed(1));

    // Cards Superiores
    elements.cardTotalIncome.textContent = formatMoney(totalIncome);
    elements.cardTotalExpenses.textContent = formatMoney(totalExpense);
    elements.cardBalance.textContent = formatMoney(balance);
    elements.cardPaidAmount.textContent = formatMoney(totalPaid);
    elements.cardPendingAmount.textContent = formatMoney(totalPending);
    elements.countIncomes.textContent = state.incomes.length;
    elements.countExpenses.textContent = state.expenses.length;

    // Customização do Saldo Líquido
    if (balance < 0) {
      elements.cardBalance.className = 'text-2xl font-extrabold text-rose-500';
      elements.balanceStatusText.textContent = 'Déficit (Orçamento Negativo)';
    } else {
      elements.cardBalance.className = 'text-2xl font-extrabold text-blue-400';
      elements.balanceStatusText.textContent = 'Disponível no mês';
    }

    // ==========================================
    // BARRA DE PORCENTAGEM (Destaque Principal)
    // ==========================================
    elements.percentageDisplay.textContent = `${roundedPercentage}%`;

    // Largura da barra com limite visual de 100%
    const barWidth = Math.min(Math.max(roundedPercentage, 0), 100);
    elements.progressBar.style.width = `${barWidth}%`;

    // Diagnóstico e Cores Dinâmicas
    if (roundedPercentage > 100) {
      // Estourado (> 100%)
      const excess = totalExpense - totalIncome;
      elements.progressBar.className = 'h-full rounded-xl progress-bar-fill bg-rose-600 shadow-lg shadow-rose-600/50 flex items-center justify-end pr-2 text-[10px] font-black text-white';
      elements.percentageDisplay.className = 'text-3xl sm:text-4xl font-black tracking-tight text-rose-500';
      elements.percentageBadge.textContent = 'Orçamento Estourado!';
      elements.percentageBadge.className = 'px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/40 alert-pulse';
      
      elements.analysisIcon.className = 'mt-0.5 text-rose-400 flex-shrink-0';
      elements.analysisText.innerHTML = `
        <strong class="text-rose-400 font-bold block mb-0.5">Atenção Crítica:</strong>
        Suas contas ultrapassaram sua receita total em <strong>${formatMoney(excess)}</strong> (${roundedPercentage}% da renda comprometida). Considere cortar ou renegociar despesas com urgência.
      `;
    } else if (roundedPercentage >= 90) {
      // Crítico (90% - 100%)
      elements.progressBar.className = 'h-full rounded-xl progress-bar-fill bg-orange-500 shadow-md shadow-orange-500/40 flex items-center justify-end pr-2 text-[10px] font-black text-slate-950';
      elements.percentageDisplay.className = 'text-3xl sm:text-4xl font-black tracking-tight text-orange-400';
      elements.percentageBadge.textContent = 'Alerta Máximo';
      elements.percentageBadge.className = 'px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-orange-500/20 text-orange-400 border border-orange-500/30';

      elements.analysisIcon.className = 'mt-0.5 text-orange-400 flex-shrink-0';
      elements.analysisText.innerHTML = `
        <strong class="text-orange-400 font-bold block mb-0.5">Alerta de Limite:</strong>
        Você está utilizando <strong>${roundedPercentage}%</strong> de todo o dinheiro que entra. Sobram apenas <strong>${formatMoney(balance)}</strong> livres para qualquer imprevisto.
      `;
    } else if (roundedPercentage >= 75) {
      // Atenção (75% - 89.9%)
      elements.progressBar.className = 'h-full rounded-xl progress-bar-fill bg-amber-400 shadow-md shadow-amber-400/40 flex items-center justify-end pr-2 text-[10px] font-black text-slate-950';
      elements.percentageDisplay.className = 'text-3xl sm:text-4xl font-black tracking-tight text-amber-400';
      elements.percentageBadge.textContent = 'Atenção';
      elements.percentageBadge.className = 'px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30';

      elements.analysisIcon.className = 'mt-0.5 text-amber-400 flex-shrink-0';
      elements.analysisText.innerHTML = `
        <strong class="text-amber-400 font-bold block mb-0.5">Zona de Cuidado:</strong>
        Cerca de 3/4 da sua renda está comprometida com contas (${roundedPercentage}%). Saldo restante disponível: <strong>${formatMoney(balance)}</strong>.
      `;
    } else if (roundedPercentage >= 50) {
      // Equilibrado (50% - 74.9%)
      elements.progressBar.className = 'h-full rounded-xl progress-bar-fill bg-blue-500 shadow-md shadow-blue-500/40 flex items-center justify-end pr-2 text-[10px] font-black text-slate-950';
      elements.percentageDisplay.className = 'text-3xl sm:text-4xl font-black tracking-tight text-blue-400';
      elements.percentageBadge.textContent = 'Equilibrado';
      elements.percentageBadge.className = 'px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-blue-500/20 text-blue-400 border border-blue-500/30';

      elements.analysisIcon.className = 'mt-0.5 text-blue-400 flex-shrink-0';
      elements.analysisText.innerHTML = `
        <strong class="text-blue-400 font-bold block mb-0.5">Finanças sob controle:</strong>
        Gastos moderados ocupando <strong>${roundedPercentage}%</strong> da renda. Você ainda possui <strong>${formatMoney(balance)}</strong> livres este mês.
      `;
    } else {
      // Excelente (< 50%)
      elements.progressBar.className = 'h-full rounded-xl progress-bar-fill bg-emerald-500 shadow-md shadow-emerald-500/40 flex items-center justify-end pr-2 text-[10px] font-black text-slate-950';
      elements.percentageDisplay.className = 'text-3xl sm:text-4xl font-black tracking-tight text-emerald-400';
      elements.percentageBadge.textContent = 'Excelente';
      elements.percentageBadge.className = 'px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';

      elements.analysisIcon.className = 'mt-0.5 text-emerald-400 flex-shrink-0';
      elements.analysisText.innerHTML = `
        <strong class="text-emerald-400 font-bold block mb-0.5">Situação Ideal:</strong>
        Parabéns! Seus custos fixos consom apenas <strong>${roundedPercentage}%</strong> da receita. Você tem <strong>${formatMoney(balance)}</strong> disponíveis para poupar ou investir!
      `;
    }
  };

  // Renderização da Lista de Receitas
  const renderIncomes = () => {
    elements.incomeCountBadge.textContent = state.incomes.length;
    elements.incomeList.innerHTML = '';

    if (state.incomes.length === 0) {
      elements.incomeList.innerHTML = `
        <div class="py-8 text-center text-slate-500 text-xs">
          Nenhuma receita cadastrada ainda.<br>Preencha o formulário acima para adicionar sua renda.
        </div>
      `;
      return;
    }

    state.incomes.forEach(income => {
      const item = document.createElement('div');
      item.className = 'p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800/80 flex items-center justify-between gap-3 hover:border-emerald-500/30 transition-smooth group';

      item.innerHTML = `
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center flex-shrink-0">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </div>
          <div class="min-w-0">
            <p class="text-sm font-semibold text-slate-200 truncate">${income.description}</p>
            <div class="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
              <span class="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-medium">${income.category || 'Geral'}</span>
              <span>•</span>
              <span>${formatDate(income.date)}</span>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-3 flex-shrink-0">
          <span class="text-sm font-bold text-emerald-400">${formatMoney(income.amount)}</span>
          <button 
            type="button" 
            data-delete-income="${income.id}" 
            title="Excluir Receita"
            class="w-7 h-7 rounded-lg bg-slate-800/80 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 flex items-center justify-center transition-colors"
          >
            <svg class="w-3.5 h-3.5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
            </svg>
          </button>
        </div>
      `;

      elements.incomeList.appendChild(item);
    });
  };

  // Renderização da Lista de Contas / Despesas
  const renderExpenses = () => {
    elements.expenseList.innerHTML = '';

    // Filtragem
    let filtered = state.expenses;
    if (state.currentFilter === 'pending') {
      filtered = state.expenses.filter(e => !e.paid);
    } else if (state.currentFilter === 'paid') {
      filtered = state.expenses.filter(e => e.paid);
    }

    if (filtered.length === 0) {
      elements.expenseList.innerHTML = `
        <div class="py-12 text-center text-slate-500 text-xs">
          Nenhuma conta encontrada com o filtro "${state.currentFilter}".<br>Adicione novas despesas no formulário acima.
        </div>
      `;
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];

    filtered.forEach(exp => {
      const isLate = !exp.paid && exp.dueDate < todayStr;
      const isToday = !exp.paid && exp.dueDate === todayStr;

      const item = document.createElement('div');
      item.className = `p-3.5 sm:p-4 rounded-2xl bg-slate-900/70 border transition-smooth flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 group ${
        exp.paid ? 'border-slate-800/50 opacity-75' : isLate ? 'border-rose-500/50 bg-rose-500/5' : 'border-slate-800 hover:border-slate-700'
      }`;

      // Cor do badge de categoria
      const catColorMap = {
        'Moradia': 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
        'Serviços': 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
        'Alimentação': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        'Cartão': 'bg-rose-500/10 text-rose-400 border-rose-500/20',
        'Transporte': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
        'Saúde': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        'Lazer': 'bg-pink-500/10 text-pink-400 border-pink-500/20',
        'Outros': 'bg-slate-500/10 text-slate-400 border-slate-500/20'
      };
      const catClass = catColorMap[exp.category] || catColorMap['Outros'];

      // Botão de Link de Pagamento Direto (Conforme desenho do usuário)
      let paymentLinkHtml = '';
      if (exp.paymentUrl && exp.paymentUrl.trim()) {
        const targetUrl = formatPaymentUrl(exp.paymentUrl);
        paymentLinkHtml = `
          <div class="order-3 sm:order-2 w-full sm:w-auto flex justify-start sm:justify-center">
            <a 
              href="${targetUrl}" 
              target="_blank" 
              rel="noopener noreferrer" 
              title="Acessar link direto para pagamento"
              class="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 hover:border-indigo-400/60 text-indigo-300 hover:text-white transition-all text-xs font-semibold shadow-sm group/paylink"
            >
              <span class="flex items-center gap-1 text-indigo-400 group-hover/paylink:scale-110 transition-transform">
                <!-- Ícone de celular com pay -->
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"></path>
                </svg>
                <!-- Ícone de link -->
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path>
                </svg>
              </span>
              <span>acesse o link de pagamento</span>
            </a>
          </div>
        `;
      }

      item.innerHTML = `
        <!-- Checkbox de Status & Descrição -->
        <div class="order-1 flex items-center gap-3 min-w-0 flex-1">
          <button 
            type="button" 
            data-toggle-expense="${exp.id}"
            title="${exp.paid ? 'Marcar como Pendente' : 'Marcar como Paga'}"
            class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${
              exp.paid 
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/30' 
                : 'border-2 border-slate-700 hover:border-emerald-500 text-transparent hover:text-emerald-500'
            }"
          >
            <svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path>
            </svg>
          </button>

          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <p class="text-sm font-semibold truncate ${exp.paid ? 'line-through text-slate-500' : 'text-slate-100'}">
                ${exp.description}
              </p>
              ${isLate ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 font-bold uppercase">Vencida</span>' : ''}
              ${isToday ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold uppercase">Vence Hoje</span>' : ''}
            </div>

            <div class="flex items-center gap-2 text-xs text-slate-400 mt-1 flex-wrap">
              <span class="px-2 py-0.5 rounded-md border text-[11px] font-medium ${catClass}">
                ${exp.category || 'Geral'}
              </span>
              <span>•</span>
              <span class="text-[11px] ${isLate ? 'text-rose-400 font-semibold' : ''}">
                Vencimento: ${formatDate(exp.dueDate)}
              </span>
            </div>
          </div>
        </div>

        <!-- Botão do Link de Pagamento (Se houver) -->
        ${paymentLinkHtml}

        <!-- Valor e Ações (Editar e Excluir) -->
        <div class="order-2 sm:order-3 flex items-center gap-3 flex-shrink-0">
          <div class="text-right">
            <span class="text-sm sm:text-base font-extrabold ${exp.paid ? 'text-slate-500 line-through' : 'text-rose-400'}">
              ${formatMoney(exp.amount)}
            </span>
            <div class="text-[10px] font-semibold ${exp.paid ? 'text-emerald-400' : 'text-amber-400'}">
              ${exp.paid ? 'PAGA' : 'PENDENTE'}
            </div>
          </div>

          <div class="flex items-center gap-1.5">
            <button 
              type="button" 
              data-edit-expense="${exp.id}" 
              title="Editar Conta"
              class="w-7 h-7 rounded-lg bg-slate-800/80 hover:bg-indigo-500/20 text-slate-400 hover:text-indigo-400 flex items-center justify-center transition-colors"
            >
              <svg class="w-3.5 h-3.5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
              </svg>
            </button>

            <button 
              type="button" 
              data-delete-expense="${exp.id}" 
              title="Excluir Conta"
              class="w-7 h-7 rounded-lg bg-slate-800/80 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 flex items-center justify-center transition-colors"
            >
              <svg class="w-3.5 h-3.5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
              </svg>
            </button>
          </div>
        </div>
      `;

      elements.expenseList.appendChild(item);
    });
  };

  // ==========================================
  // EVENT LISTENERS: ADIÇÃO DE RECEITAS
  // ==========================================
  elements.incomeForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const description = elements.incomeDescription.value.trim();
    const amount = parseFloat(elements.incomeAmount.value);
    const category = elements.incomeCategory.value;
    const date = elements.incomeDate.value;

    if (!description || isNaN(amount) || amount <= 0) {
      showToast('Preencha a descrição e um valor positivo válido.', 'error');
      return;
    }

    const newIncome = {
      description,
      amount,
      category,
      date,
      createdAt: new Date().toISOString()
    };

    if (useFirestore && firestoreDb) {
      try {
        await firestoreDb.collection('incomes').add(newIncome);
        showToast(`Receita "${description}" salva na nuvem!`, 'success');
      } catch (err) {
        console.error('Erro ao salvar no Firestore:', err);
        showToast('Erro ao salvar na nuvem: ' + err.message, 'error');
      }
    } else if (state.isOnline) {
      try {
        const res = await fetch('/api/incomes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: 'inc-' + Date.now(), ...newIncome })
        });
        const json = await res.json();
        if (json.success) {
          state.incomes.unshift(json.data);
          showToast(`Receita "${description}" adicionada!`, 'success');
        } else {
          throw new Error(json.error || 'Erro ao cadastrar');
        }
      } catch (err) {
        state.incomes.unshift({ id: 'inc-' + Date.now(), ...newIncome });
        saveLocalData();
        showToast(`Receita salva em modo local.`, 'success');
      }
    } else {
      state.incomes.unshift({ id: 'inc-' + Date.now(), ...newIncome });
      saveLocalData();
      showToast(`Receita "${description}" adicionada!`, 'success');
    }

    elements.incomeForm.reset();
    setupDates();
    if (!useFirestore) {
      renderAll();
    }
  });

  // ==========================================
  // EVENT LISTENERS: CADASTRO DE CONTAS
  // ==========================================
  elements.expenseForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const description = elements.expenseDescription.value.trim();
    const amount = parseFloat(elements.expenseAmount.value);
    const dueDate = elements.expenseDueDate.value;
    const category = elements.expenseCategory.value;
    const paymentUrl = elements.expensePaymentUrl ? elements.expensePaymentUrl.value.trim() : '';
    const paid = elements.expensePaid.checked;

    if (!description || isNaN(amount) || amount <= 0) {
      showToast('Preencha a descrição e um valor positivo para a conta.', 'error');
      return;
    }

    const newExpense = {
      description,
      amount,
      dueDate,
      category,
      paid,
      createdAt: new Date().toISOString()
    };
    if (paymentUrl) {
      newExpense.paymentUrl = paymentUrl;
    }

    if (useFirestore && firestoreDb) {
      try {
        await firestoreDb.collection('expenses').add(newExpense);
        showToast(`Conta "${description}" salva na nuvem!`, 'success');
      } catch (err) {
        console.error('Erro ao salvar no Firestore:', err);
        showToast('Erro ao salvar na nuvem: ' + err.message, 'error');
      }
    } else if (state.isOnline) {
      try {
        const res = await fetch('/api/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: 'exp-' + Date.now(), ...newExpense })
        });
        const json = await res.json();
        if (json.success) {
          state.expenses.unshift(json.data);
          showToast(`Conta "${description}" cadastrada!`, 'success');
        } else {
          throw new Error(json.error || 'Erro ao cadastrar');
        }
      } catch (err) {
        state.expenses.unshift({ id: 'exp-' + Date.now(), ...newExpense });
        saveLocalData();
        showToast(`Conta salva em modo local.`, 'success');
      }
    } else {
      state.expenses.unshift({ id: 'exp-' + Date.now(), ...newExpense });
      saveLocalData();
      showToast(`Conta "${description}" cadastrada!`, 'success');
    }

    elements.expenseForm.reset();
    setupDates();
    if (!useFirestore) {
      renderAll();
    }
  });

  // ==========================================
  // ALTERNAR STATUS (PAGO / PENDENTE) & EDIÇÃO
  // ==========================================
  elements.expenseList.addEventListener('click', async (e) => {
    // Clique para alternar status (Paga / Pendente)
    const toggleBtn = e.target.closest('[data-toggle-expense]');
    if (toggleBtn) {
      const id = toggleBtn.getAttribute('data-toggle-expense');
      const expense = state.expenses.find(x => x.id === id);
      if (!expense) return;

      if (useFirestore && firestoreDb) {
        try {
          await firestoreDb.collection('expenses').doc(id).update({
            paid: !expense.paid
          });
          showToast(`Conta "${expense.description}" marcada como ${!expense.paid ? 'PAGA' : 'PENDENTE'}!`, 'info');
        } catch (err) {
          console.error('Erro ao alternar status no Firestore:', err);
        }
        return;
      }

      if (state.isOnline) {
        try {
          const res = await fetch(`/api/expenses/${id}/toggle`, { method: 'PATCH' });
          const json = await res.json();
          if (json.success) {
            expense.paid = json.data.paid;
          }
        } catch (err) {
          expense.paid = !expense.paid;
          saveLocalData();
        }
      } else {
        expense.paid = !expense.paid;
        saveLocalData();
      }

      showToast(`Conta "${expense.description}" marcada como ${expense.paid ? 'PAGA' : 'PENDENTE'}!`, 'info');
      renderAll();
      return;
    }

    // Clique para abrir modal de edição da conta
    const editBtn = e.target.closest('[data-edit-expense]');
    if (editBtn) {
      const id = editBtn.getAttribute('data-edit-expense');
      const expense = state.expenses.find(x => x.id === id);
      if (!expense) return;

      openEditExpenseModal(expense);
      return;
    }

    // Clique para excluir despesa
    const deleteBtn = e.target.closest('[data-delete-expense]');
    if (deleteBtn) {
      const id = deleteBtn.getAttribute('data-delete-expense');
      const expense = state.expenses.find(x => x.id === id);
      if (!expense) return;

      openDeleteModal('expense', id, expense.description);
    }
  });

  // Clique para excluir receita
  elements.incomeList.addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('[data-delete-income]');
    if (deleteBtn) {
      const id = deleteBtn.getAttribute('data-delete-income');
      const income = state.incomes.find(x => x.id === id);
      if (!income) return;

      openDeleteModal('income', id, income.description);
    }
  });

  // ==========================================
  // FILTROS DE CONTAS
  // ==========================================
  elements.filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      elements.filterButtons.forEach(b => {
        b.className = 'filter-btn px-3 py-1 rounded-lg font-medium transition-colors text-slate-400 hover:text-white';
      });
      btn.className = 'filter-btn px-3 py-1 rounded-lg font-medium transition-colors bg-slate-800 text-white';
      state.currentFilter = btn.getAttribute('data-filter');
      renderExpenses();
    });
  });

  // ==========================================
  // MODAL DE CONFIRMAÇÃO DE EXCLUSÃO
  // ==========================================
  const openDeleteModal = (type, id, name) => {
    state.pendingDelete = { type, id, name };
    elements.modalTitle.textContent = type === 'income' ? 'Excluir Receita?' : 'Excluir Conta?';
    elements.modalDescription.textContent = `Tem certeza que deseja remover "${name}"? Esta ação recalculará a porcentagem de gastos.`;
    elements.deleteModal.classList.remove('hidden');
    elements.deleteModal.classList.add('flex');
  };

  const closeDeleteModal = () => {
    state.pendingDelete = null;
    elements.deleteModal.classList.add('hidden');
    elements.deleteModal.classList.remove('flex');
  };

  elements.modalCancelBtn.addEventListener('click', closeDeleteModal);

  elements.modalConfirmBtn.addEventListener('click', async () => {
    if (!state.pendingDelete) return;

    const { type, id, name } = state.pendingDelete;

    if (type === 'income') {
      if (useFirestore && firestoreDb) {
        try {
          await firestoreDb.collection('incomes').doc(id).delete();
          showToast(`Receita "${name}" removida da nuvem.`, 'info');
        } catch (err) {
          console.error('Erro ao excluir no Firestore:', err);
          showToast('Erro ao excluir na nuvem: ' + err.message, 'error');
        }
      } else if (state.isOnline) {
        try {
          await fetch(`/api/incomes/${id}`, { method: 'DELETE' });
        } catch (e) {
          console.error(e);
        }
        state.incomes = state.incomes.filter(i => i.id !== id);
        saveLocalData();
        showToast(`Receita "${name}" foi excluída.`, 'info');
      } else {
        state.incomes = state.incomes.filter(i => i.id !== id);
        saveLocalData();
        showToast(`Receita "${name}" foi excluída.`, 'info');
      }
    } else if (type === 'expense') {
      if (useFirestore && firestoreDb) {
        try {
          await firestoreDb.collection('expenses').doc(id).delete();
          showToast(`Conta "${name}" removida da nuvem.`, 'info');
        } catch (err) {
          console.error('Erro ao excluir no Firestore:', err);
          showToast('Erro ao excluir na nuvem: ' + err.message, 'error');
        }
      } else if (state.isOnline) {
        try {
          await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
        } catch (e) {
          console.error(e);
        }
        state.expenses = state.expenses.filter(e => e.id !== id);
        saveLocalData();
        showToast(`Conta "${name}" foi excluída.`, 'info');
      } else {
        state.expenses = state.expenses.filter(e => e.id !== id);
        saveLocalData();
        showToast(`Conta "${name}" foi excluída.`, 'info');
      }
    }

    closeDeleteModal();
    if (!useFirestore) {
      renderAll();
    }
  });

  // Fechar modal ao clicar fora
  elements.deleteModal.addEventListener('click', (e) => {
    if (e.target === elements.deleteModal) {
      closeDeleteModal();
    }
  });

  // ==========================================
  // MODAL DE EDIÇÃO DE CONTA
  // ==========================================
  const openEditExpenseModal = (expense) => {
    if (!elements.editExpenseModal) return;

    elements.editExpenseId.value = expense.id;
    elements.editExpenseDescription.value = expense.description || '';
    elements.editExpenseAmount.value = expense.amount || '';
    elements.editExpenseDueDate.value = expense.dueDate || '';
    elements.editExpenseCategory.value = expense.category || 'Moradia';
    elements.editExpensePaymentUrl.value = expense.paymentUrl || '';
    elements.editExpensePaid.checked = Boolean(expense.paid);

    elements.editExpenseModal.classList.remove('hidden');
    elements.editExpenseModal.classList.add('flex');
  };

  const closeEditExpenseModal = () => {
    if (!elements.editExpenseModal) return;
    elements.editExpenseModal.classList.add('hidden');
    elements.editExpenseModal.classList.remove('flex');
  };

  if (elements.closeEditModalBtn) {
    elements.closeEditModalBtn.addEventListener('click', closeEditExpenseModal);
  }
  if (elements.cancelEditModalBtn) {
    elements.cancelEditModalBtn.addEventListener('click', closeEditExpenseModal);
  }
  if (elements.editExpenseModal) {
    elements.editExpenseModal.addEventListener('click', (e) => {
      if (e.target === elements.editExpenseModal) {
        closeEditExpenseModal();
      }
    });
  }

  if (elements.editExpenseForm) {
    elements.editExpenseForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const id = elements.editExpenseId.value;
      const description = elements.editExpenseDescription.value.trim();
      const amount = parseFloat(elements.editExpenseAmount.value);
      const dueDate = elements.editExpenseDueDate.value;
      const category = elements.editExpenseCategory.value;
      const paymentUrl = elements.editExpensePaymentUrl ? elements.editExpensePaymentUrl.value.trim() : '';
      const paid = elements.editExpensePaid.checked;

      if (!description || isNaN(amount) || amount <= 0) {
        showToast('Preencha a descrição e um valor positivo válido.', 'error');
        return;
      }

      const updateData = {
        description,
        amount,
        dueDate,
        category,
        paymentUrl: paymentUrl || '',
        paid,
        updatedAt: new Date().toISOString()
      };

      if (useFirestore && firestoreDb) {
        try {
          await firestoreDb.collection('expenses').doc(id).update(updateData);
          showToast(`Conta "${description}" atualizada com sucesso na nuvem!`, 'success');
          closeEditExpenseModal();
        } catch (err) {
          console.error('Erro ao atualizar no Firestore:', err);
          showToast('Erro ao atualizar na nuvem: ' + err.message, 'error');
        }
      } else if (state.isOnline) {
        try {
          const res = await fetch(`/api/expenses/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData)
          });
          const json = await res.json();
          if (json.success) {
            const idx = state.expenses.findIndex(x => x.id === id);
            if (idx !== -1) {
              state.expenses[idx] = { ...state.expenses[idx], ...json.data };
            }
            showToast(`Conta "${description}" atualizada com sucesso!`, 'success');
            closeEditExpenseModal();
            renderAll();
          } else {
            throw new Error(json.error || 'Erro ao atualizar');
          }
        } catch (err) {
          const idx = state.expenses.findIndex(x => x.id === id);
          if (idx !== -1) {
            state.expenses[idx] = { ...state.expenses[idx], ...updateData };
          }
          saveLocalData();
          showToast(`Conta atualizada localmente.`, 'success');
          closeEditExpenseModal();
          renderAll();
        }
      } else {
        const idx = state.expenses.findIndex(x => x.id === id);
        if (idx !== -1) {
          state.expenses[idx] = { ...state.expenses[idx], ...updateData };
        }
        saveLocalData();
        showToast(`Conta "${description}" atualizada com sucesso!`, 'success');
        closeEditExpenseModal();
        renderAll();
      }
    });
  }

  // ==========================================
  // GRÁFICO EM BARRAS: DÉBITOS VS RECEITA
  // ==========================================
  const openChartModal = () => {
    elements.chartModal.classList.remove('hidden');
    elements.chartModal.classList.add('flex');
    updateChartModalContent();
  };

  const closeChartModal = () => {
    elements.chartModal.classList.add('hidden');
    elements.chartModal.classList.remove('flex');
    if (state.monthlyChartInstance) {
      state.monthlyChartInstance.destroy();
      state.monthlyChartInstance = null;
    }
  };

  const updateChartModalContent = () => {
    const totalIncome = state.incomes.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
    const totalExpense = state.expenses.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
    const balance = totalIncome - totalExpense;

    const expensePercent = totalIncome > 0 ? (totalExpense / totalIncome) * 100 : (totalExpense > 0 ? 100 : 0);
    const balancePercent = totalIncome > 0 ? (balance / totalIncome) * 100 : 0;

    // Atualiza KPIs no topo do modal
    elements.chartModalIncome.textContent = formatMoney(totalIncome);
    elements.chartModalExpense.textContent = formatMoney(totalExpense);
    elements.chartModalExpensePercent.textContent = `${expensePercent.toFixed(1)}% da renda`;
    elements.chartModalBalance.textContent = formatMoney(balance);
    elements.chartModalBalancePercent.textContent = `${Math.max(balancePercent, 0).toFixed(1)}% livre`;

    if (balance < 0) {
      elements.chartModalBalance.className = 'text-lg font-black text-rose-500 mt-1';
      elements.chartModalBalancePercent.className = 'text-xs font-bold text-rose-400';
    } else {
      elements.chartModalBalance.className = 'text-lg font-black text-blue-400 mt-1';
      elements.chartModalBalancePercent.className = 'text-xs font-bold text-blue-400';
    }

    // Atualiza nota do rodapé
    if (expensePercent > 100) {
      elements.chartModalFooterNote.innerHTML = `<span class="text-rose-400 font-semibold">⚠️ Seus débitos excedem sua receita em ${formatMoney(Math.abs(balance))} (${expensePercent.toFixed(1)}% da renda)!</span>`;
    } else {
      elements.chartModalFooterNote.innerHTML = `Suas contas comprometem <strong>${expensePercent.toFixed(1)}%</strong> da receita. Restam <strong>${formatMoney(balance)}</strong> livres.`;
    }

    // 1. Renderiza o Gráfico Canvas (Chart.js)
    renderMainChartCanvas(totalIncome, totalExpense, balance, expensePercent, balancePercent);

    // 2. Renderiza as Barras Detalhadas por Categoria
    renderCategoryBars(totalIncome);

    // 3. Renderiza o Comparativo Mensal (Evolução Mês a Mês)
    renderMonthlyComparison();
  };

  const renderMainChartCanvas = (totalIncome, totalExpense, balance, expensePercent, balancePercent) => {
    if (!elements.mainBarChartCanvas) return;
    const ctx = elements.mainBarChartCanvas.getContext('2d');

    // Destrói gráfico anterior se existir
    if (state.chartInstance) {
      state.chartInstance.destroy();
      state.chartInstance = null;
    }

    // Se Chart.js estiver disponível
    if (typeof Chart !== 'undefined') {
      const labels = ['Receita Total', 'Débitos Totais', 'Saldo Livre'];
      const dataValues = [totalIncome, totalExpense, Math.max(balance, 0)];
      const percentages = [
        100,
        expensePercent.toFixed(1),
        Math.max(balancePercent, 0).toFixed(1)
      ];

      state.chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Valor (R$)',
            data: dataValues,
            backgroundColor: [
              'rgba(16, 185, 129, 0.85)', // Verde esmeralda (Receita)
              expensePercent > 100 ? 'rgba(225, 29, 72, 0.85)' : 'rgba(244, 63, 94, 0.85)', // Vermelho/Rosa (Débitos)
              'rgba(59, 130, 246, 0.85)'  // Azul (Saldo)
            ],
            borderColor: [
              '#10b981',
              expensePercent > 100 ? '#e11d48' : '#f43f5e',
              '#3b82f6'
            ],
            borderWidth: 2,
            borderRadius: 12,
            barThickness: 48,
            maxBarThickness: 64
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: {
            duration: 600
          },
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              backgroundColor: 'rgba(15, 23, 42, 0.95)',
              titleColor: '#f8fafc',
              bodyColor: '#cbd5e1',
              borderColor: 'rgba(255, 255, 255, 0.1)',
              borderWidth: 1,
              padding: 12,
              cornerRadius: 12,
              callbacks: {
                label: function(context) {
                  const val = context.raw;
                  const idx = context.dataIndex;
                  const pct = percentages[idx];
                  return [
                    `Valor: ${formatMoney(val)}`,
                    `Proporção: ${pct}% da Receita`
                  ];
                }
              }
            }
          },
          scales: {
            x: {
              grid: {
                display: false,
                drawBorder: false
              },
              ticks: {
                color: '#94a3b8',
                font: {
                  family: 'Plus Jakarta Sans, sans-serif',
                  size: 12,
                  weight: '600'
                }
              }
            },
            y: {
              beginAtZero: true,
              grid: {
                color: 'rgba(255, 255, 255, 0.06)',
                drawBorder: false
              },
              ticks: {
                color: '#64748b',
                callback: function(value) {
                  return 'R$ ' + value.toLocaleString('pt-BR');
                }
              }
            }
          }
        }
      });
    }
  };

  const renderCategoryBars = (totalIncome) => {
    if (!elements.categoryBarsContainer) return;
    elements.categoryBarsContainer.innerHTML = '';

    if (state.expenses.length === 0) {
      elements.categoryBarsContainer.innerHTML = `
        <div class="py-8 text-center text-slate-500 text-xs">
          Nenhuma conta cadastrada para exibir o comparativo por categoria.
        </div>
      `;
      return;
    }

    // Agrupa despesas por categoria
    const categoryTotals = {};
    state.expenses.forEach(exp => {
      const cat = exp.category || 'Outros';
      categoryTotals[cat] = (categoryTotals[cat] || 0) + (Number(exp.amount) || 0);
    });

    // Converte para array e ordena do maior para o menor
    const sortedCategories = Object.keys(categoryTotals)
      .map(cat => ({
        name: cat,
        amount: categoryTotals[cat],
        percentOfIncome: totalIncome > 0 ? (categoryTotals[cat] / totalIncome) * 100 : 0
      }))
      .sort((a, b) => b.amount - a.amount);

    const catColorMap = {
      'Moradia': { bar: 'bg-indigo-500', text: 'text-indigo-400', badge: 'bg-indigo-500/10 border-indigo-500/20' },
      'Serviços': { bar: 'bg-cyan-500', text: 'text-cyan-400', badge: 'bg-cyan-500/10 border-cyan-500/20' },
      'Alimentação': { bar: 'bg-amber-500', text: 'text-amber-400', badge: 'bg-amber-500/10 border-amber-500/20' },
      'Cartão': { bar: 'bg-rose-500', text: 'text-rose-400', badge: 'bg-rose-500/10 border-rose-500/20' },
      'Transporte': { bar: 'bg-purple-500', text: 'text-purple-400', badge: 'bg-purple-500/10 border-purple-500/20' },
      'Saúde': { bar: 'bg-emerald-500', text: 'text-emerald-400', badge: 'bg-emerald-500/10 border-emerald-500/20' },
      'Lazer': { bar: 'bg-pink-500', text: 'text-pink-400', badge: 'bg-pink-500/10 border-pink-500/20' },
      'Outros': { bar: 'bg-slate-400', text: 'text-slate-300', badge: 'bg-slate-500/10 border-slate-500/20' }
    };

    sortedCategories.forEach(item => {
      const colors = catColorMap[item.name] || catColorMap['Outros'];
      const barWidth = Math.min(Math.max(item.percentOfIncome, 0), 100);

      const barElement = document.createElement('div');
      barElement.className = 'p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2';

      barElement.innerHTML = `
        <div class="flex items-center justify-between text-xs">
          <div class="flex items-center gap-2">
            <span class="px-2.5 py-0.5 rounded-lg border text-[11px] font-semibold ${colors.badge} ${colors.text}">
              ${item.name}
            </span>
            <span class="font-bold text-slate-200">${formatMoney(item.amount)}</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-xs font-black ${colors.text}">
              ${item.percentOfIncome.toFixed(1)}%
            </span>
            <span class="text-[10px] text-slate-500">da receita</span>
          </div>
        </div>

        <div class="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
          <div class="h-full rounded-full transition-all duration-700 ${colors.bar}" style="width: ${barWidth}%;"></div>
        </div>
      `;

      elements.categoryBarsContainer.appendChild(barElement);
    });
  };

  // ==========================================
  // ABA 3: COMPARAÇÃO MENSAL (RECEITA VS DÉBITOS)
  // ==========================================
  const renderMonthlyComparison = () => {
    if (!elements.monthlyBreakdownContainer) return;
    elements.monthlyBreakdownContainer.innerHTML = '';

    // Coleta todos os meses presentes em receitas e despesas
    const monthKeysSet = new Set();

    state.incomes.forEach(inc => {
      if (inc.date && inc.date.length >= 7) {
        monthKeysSet.add(inc.date.substring(0, 7)); // 'YYYY-MM'
      }
    });

    state.expenses.forEach(exp => {
      if (exp.dueDate && exp.dueDate.length >= 7) {
        monthKeysSet.add(exp.dueDate.substring(0, 7)); // 'YYYY-MM'
      }
    });

    // Garante que o mês atual esteja presente
    const now = new Date();
    const currentYM = now.toISOString().substring(0, 7);
    monthKeysSet.add(currentYM);

    // Se tiver menos de 3 meses, inclui meses adjacentes para dar contexto comparativo
    if (monthKeysSet.size < 3) {
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      monthKeysSet.add(prevMonth.toISOString().substring(0, 7));
      monthKeysSet.add(nextMonth.toISOString().substring(0, 7));
    }

    // Ordena cronologicamente
    const sortedMonths = Array.from(monthKeysSet).sort();

    const monthNames = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    const monthShortNames = [
      'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
      'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
    ];

    const formatMonthLabel = (ymStr) => {
      const parts = ymStr.split('-');
      const year = parts[0];
      const month = parseInt(parts[1], 10);
      return `${monthShortNames[month - 1]}/${year.slice(2)}`;
    };

    const formatMonthFullLabel = (ymStr) => {
      const parts = ymStr.split('-');
      const year = parts[0];
      const month = parseInt(parts[1], 10);
      return `${monthNames[month - 1]} de ${year}`;
    };

    // Receita base geral do sistema (caso um mês não tenha lançamento de salário específico)
    const baseTotalIncome = state.incomes.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);

    const monthlyStats = sortedMonths.map(ym => {
      const incTotal = state.incomes
        .filter(inc => inc.date && inc.date.startsWith(ym))
        .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

      const expTotal = state.expenses
        .filter(exp => exp.dueDate && exp.dueDate.startsWith(ym))
        .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

      // Se não houver receita lançada explicitamente neste mês mas houver débitos, usa a receita base
      const effectiveIncome = incTotal > 0 ? incTotal : (expTotal > 0 ? baseTotalIncome : incTotal);
      const balance = effectiveIncome - expTotal;
      const expensePercent = effectiveIncome > 0 ? (expTotal / effectiveIncome) * 100 : (expTotal > 0 ? 100 : 0);

      return {
        key: ym,
        label: formatMonthLabel(ym),
        fullLabel: formatMonthFullLabel(ym),
        income: effectiveIncome,
        isBaseIncome: incTotal === 0 && effectiveIncome > 0,
        expense: expTotal,
        balance,
        expensePercent
      };
    });

    // 1. Renderiza o Gráfico de Barras Agrupadas por Mês (Chart.js)
    if (elements.monthlyBarChartCanvas) {
      const ctx = elements.monthlyBarChartCanvas.getContext('2d');

      if (state.monthlyChartInstance) {
        state.monthlyChartInstance.destroy();
        state.monthlyChartInstance = null;
      }

      if (typeof Chart !== 'undefined') {
        const labels = monthlyStats.map(m => m.label);
        const incomeData = monthlyStats.map(m => m.income);
        const expenseData = monthlyStats.map(m => m.expense);

        state.monthlyChartInstance = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: labels,
            datasets: [
              {
                label: 'Receitas',
                data: incomeData,
                backgroundColor: 'rgba(16, 185, 129, 0.85)',
                borderColor: '#10b981',
                borderWidth: 2,
                borderRadius: 8,
                barPercentage: 0.7,
                categoryPercentage: 0.6
              },
              {
                label: 'Débitos',
                data: expenseData,
                backgroundColor: 'rgba(244, 63, 94, 0.85)',
                borderColor: '#f43f5e',
                borderWidth: 2,
                borderRadius: 8,
                barPercentage: 0.7,
                categoryPercentage: 0.6
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
              duration: 500
            },
            plugins: {
              legend: {
                display: true,
                position: 'top',
                align: 'end',
                labels: {
                  color: '#cbd5e1',
                  font: {
                    family: 'Plus Jakarta Sans, sans-serif',
                    size: 11,
                    weight: '600'
                  },
                  boxWidth: 12,
                  boxHeight: 12,
                  usePointStyle: true,
                  pointStyle: 'circle'
                }
              },
              tooltip: {
                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                titleColor: '#f8fafc',
                bodyColor: '#cbd5e1',
                borderColor: 'rgba(255, 255, 255, 0.1)',
                borderWidth: 1,
                padding: 12,
                cornerRadius: 12,
                callbacks: {
                  label: function(context) {
                    const val = context.raw;
                    return ` ${context.dataset.label}: ${formatMoney(val)}`;
                  },
                  afterBody: function(contexts) {
                    const idx = contexts[0].dataIndex;
                    const stat = monthlyStats[idx];
                    return [
                      `Saldo Líquido: ${formatMoney(stat.balance)}`,
                      `Comprometimento: ${stat.expensePercent.toFixed(1)}%`
                    ];
                  }
                }
              }
            },
            scales: {
              x: {
                grid: {
                  display: false,
                  drawBorder: false
                },
                ticks: {
                  color: '#94a3b8',
                  font: {
                    family: 'Plus Jakarta Sans, sans-serif',
                    size: 12,
                    weight: '600'
                  }
                }
              },
              y: {
                beginAtZero: true,
                grid: {
                  color: 'rgba(255, 255, 255, 0.06)',
                  drawBorder: false
                },
                ticks: {
                  color: '#64748b',
                  callback: function(value) {
                    return 'R$ ' + value.toLocaleString('pt-BR');
                  }
                }
              }
            }
          }
        });
      }
    }

    // 2. Renderiza os Cards de Detalhamento Mês a Mês
    monthlyStats.forEach((stat, index) => {
      const card = document.createElement('div');
      card.className = 'p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2 hover:border-slate-700 transition-colors';

      let badgeClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      let badgeText = 'Excelente';

      if (stat.expensePercent > 100) {
        badgeClass = 'bg-rose-500/20 text-rose-400 border-rose-500/30 font-bold';
        badgeText = 'Estourado';
      } else if (stat.expensePercent >= 85) {
        badgeClass = 'bg-orange-500/10 text-orange-400 border-orange-500/20';
        badgeText = 'Alerta';
      } else if (stat.expensePercent >= 50) {
        badgeClass = 'bg-blue-500/10 text-blue-400 border-blue-500/20';
        badgeText = 'Equilibrado';
      }

      // Comparação com mês anterior se existir
      let diffHtml = '';
      if (index > 0) {
        const prev = monthlyStats[index - 1];
        if (prev.expense > 0 && stat.expense > 0) {
          const diffPct = ((stat.expense - prev.expense) / prev.expense) * 100;
          if (diffPct > 0) {
            diffHtml = `<span class="text-[10px] text-rose-400">↑ +${diffPct.toFixed(1)}% gastos vs ${prev.label}</span>`;
          } else if (diffPct < 0) {
            diffHtml = `<span class="text-[10px] text-emerald-400">↓ ${Math.abs(diffPct).toFixed(1)}% economia vs ${prev.label}</span>`;
          }
        }
      }

      card.innerHTML = `
        <div class="flex items-center justify-between pb-1.5 border-b border-slate-800/80">
          <div>
            <span class="text-xs font-bold text-white capitalize">${stat.fullLabel}</span>
            <div class="mt-0.5">${diffHtml}</div>
          </div>
          <span class="px-2 py-0.5 rounded-md border text-[10px] font-semibold ${badgeClass}">
            ${stat.expensePercent.toFixed(1)}% (${badgeText})
          </span>
        </div>

        <div class="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span class="text-[10px] text-slate-500 block">Receitas:</span>
            <span class="font-bold text-emerald-400">${formatMoney(stat.income)}</span>
          </div>
          <div>
            <span class="text-[10px] text-slate-500 block">Débitos:</span>
            <span class="font-bold text-rose-400">${formatMoney(stat.expense)}</span>
          </div>
        </div>

        <div class="pt-1.5 border-t border-slate-800/60 flex items-center justify-between text-xs">
          <span class="text-[11px] text-slate-400">Saldo Líquido:</span>
          <span class="font-extrabold ${stat.balance < 0 ? 'text-rose-500' : 'text-blue-400'}">
            ${formatMoney(stat.balance)}
          </span>
        </div>
      `;

      elements.monthlyBreakdownContainer.appendChild(card);
    });
  };

  // Alternância de Abas dentro do Modal de Gráfico
  const switchChartTab = (tabName) => {
    state.currentChartTab = tabName;

    const activeClass = 'px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors bg-indigo-600 text-white shadow-md';
    const inactiveClass = 'px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors text-slate-400 hover:text-white hover:bg-slate-800';

    if (elements.tabOverviewBtn) elements.tabOverviewBtn.className = tabName === 'overview' ? activeClass : inactiveClass;
    if (elements.tabCategoriesBtn) elements.tabCategoriesBtn.className = tabName === 'categories' ? activeClass : inactiveClass;
    if (elements.tabMonthlyBtn) elements.tabMonthlyBtn.className = tabName === 'monthly' ? activeClass : inactiveClass;

    if (elements.chartViewOverview) elements.chartViewOverview.classList.toggle('hidden', tabName !== 'overview');
    if (elements.chartViewCategories) elements.chartViewCategories.classList.toggle('hidden', tabName !== 'categories');
    if (elements.chartViewMonthly) elements.chartViewMonthly.classList.toggle('hidden', tabName !== 'monthly');

    if (tabName === 'monthly') {
      renderMonthlyComparison();
    }
  };

  // Eventos do Modal de Gráfico
  if (elements.openChartBtn) {
    elements.openChartBtn.addEventListener('click', openChartModal);
  }

  if (elements.closeChartModalBtn) {
    elements.closeChartModalBtn.addEventListener('click', closeChartModal);
  }

  if (elements.closeChartBottomBtn) {
    elements.closeChartBottomBtn.addEventListener('click', closeChartModal);
  }

  // Cliques nas abas
  if (elements.tabOverviewBtn) {
    elements.tabOverviewBtn.addEventListener('click', () => switchChartTab('overview'));
  }
  if (elements.tabCategoriesBtn) {
    elements.tabCategoriesBtn.addEventListener('click', () => switchChartTab('categories'));
  }
  if (elements.tabMonthlyBtn) {
    elements.tabMonthlyBtn.addEventListener('click', () => switchChartTab('monthly'));
  }

  // Fechar modal ao clicar fora ou ao pressionar ESC
  elements.chartModal.addEventListener('click', (e) => {
    if (e.target === elements.chartModal) {
      closeChartModal();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (elements.chartModal && !elements.chartModal.classList.contains('hidden')) {
        closeChartModal();
      }
      if (elements.deleteModal && !elements.deleteModal.classList.contains('hidden')) {
        closeDeleteModal();
      }
      if (elements.editExpenseModal && !elements.editExpenseModal.classList.contains('hidden')) {
        closeEditExpenseModal();
      }
    }
  });

  // Inicialização
  setupDates();
  loadData();
});

