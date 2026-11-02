# 🏠 Gestão de Casa - Controle Inteligente de Contas & Finanças

Sistema Full Stack moderno, responsivo e intuitivo para controle e gestão financeira doméstica.

---

## ✨ Principais Funcionalidades

1. **💰 Controle de Receitas:**
   - Adicione suas fontes de renda mensais (Salário, Freelance, Renda Extra, etc.).
   - Listagem com data, categoria e valor formatado em Real (R$).
   - Opção de exclusão individual com confirmação de segurança.

2. **🧾 Cadastro e Gestão de Contas a Pagar:**
   - Cadastre contas (Aluguel, Luz, Internet, Supermercado, Cartão, etc.).
   - Defina valor, data de vencimento e categoria.
   - **Alternância rápida:** Marque como "PAGA" ou "PENDENTE" com apenas 1 clique no ícone de checagem.
   - **Exclusão de contas:** Botão de lixeira para excluir qualquer conta indesejada.
   - **Filtros rápidos:** Visualize todas as contas, somente pendentes ou somente pagas.
   - Alerta visual para contas vencidas ou que vencem no dia.

3. **📊 Barra de Porcentagem dos Gastos em Relação à Receita:**
   - **Barra de progresso dinâmica** com gradiente adaptativo e escala (0% a 100%+):
     - **Excelente (< 50%):** Verde esmeralda (sobrando mais da metade da renda).
     - **Equilibrado (50% a 74%):** Azul vibrante (contas sob controle).
     - **Atenção (75% a 89%):** Amarelo âmbar (alerta para economizar).
     - **Alerta Máximo (90% a 100%):** Laranja intenso (muito próximo do limite).
     - **Orçamento Estourado (> 100%):** Vermelho pulsante com aviso do valor exato do déficit.
   - **Diagnóstico Inteligente:** Exibe em tempo real o valor total gasto, percentual exato comprometido e quanto resta livre para guardar ou investir.

4. **🚀 Arquitetura Full Stack Resiliente:**
   - **Backend:** Servidor Node.js nativo (sem dependências pesadas externas), com API RESTful rápida e persistência em arquivo JSON (`data/db.json`).
   - **Frontend:** HTML5 semântico, Tailwind CSS moderno, JavaScript reativo.
   - **Modo Híbrido:** Funciona perfeitamente conectado ao servidor Node.js ou em modo offline direto pelo navegador via `localStorage`.

---

## 🛠️ Como Iniciar o Sistema

### Opção 1: Via Servidor Node.js (Recomendado)
No terminal, dentro da pasta do projeto (`GestaoDeCasa`), execute:

```bash
npm start
```
ou:
```bash
node server.js
```

Em seguida, abra o navegador no endereço:
👉 **[http://localhost:3000](http://localhost:3000)**

---

### Opção 2: Abertura Direta no Navegador (Offline)
Você também pode abrir o arquivo `public/index.html` com um clique duplo no seu navegador padrão. O sistema detectará automaticamente o ambiente e usará o armazenamento local (`localStorage`).

---

## 📡 Rotas da API RESTful

- `GET /api/finances`: Retorna receitas, despesas e resumo consolidado com a porcentagem.
- `POST /api/incomes`: Cadastra nova receita.
- `DELETE /api/incomes/:id`: Exclui uma receita.
- `POST /api/expenses`: Cadastra nova conta/despesa.
- `PATCH /api/expenses/:id/toggle`: Alterna status entre pago e pendente.
- `DELETE /api/expenses/:id`: Exclui uma conta/despesa.

