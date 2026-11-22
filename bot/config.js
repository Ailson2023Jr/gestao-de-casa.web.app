// Configurações do Bot WhatsApp do Gestão de Casa
module.exports = {
  // Nome padrão do grupo no WhatsApp onde o bot deve atuar
  familyGroupName: 'Finanças da Casa',

  // ID exato do grupo no WhatsApp (identificado automaticamente)
  familyGroupId: '120363430925230357@g.us',

  // Mapeamento de telefones e LIDs para nomes amigáveis
  users: {
    '5515996463522': 'Junior',
    '92049789472775': 'Junior',
    '5515996547755': 'Bia',
    '132358107881475': 'Bia',
    ...(process.env.WHATSAPP_JUNIOR_PHONE ? { [process.env.WHATSAPP_JUNIOR_PHONE.replace(/\D/g, '')]: 'Junior' } : {}),
    ...(process.env.WHATSAPP_BIA_PHONE ? { [process.env.WHATSAPP_BIA_PHONE.replace(/\D/g, '')]: 'Bia' } : {})
  },

  // Horário do alerta diário de vencimento (formato cron: minuto hora * * *)
  // Padrão: Todos os dias às 08:30 da manhã
  alertCronSchedule: process.env.ALERT_CRON || '30 8 * * *',

  // Configuração do Firebase Firestore
  firebaseConfig: {
    apiKey: "AIzaSyBGNhFpku1g9chwxllMa64-dUnZSNyOL0I",
    authDomain: "gestao-de-casa.firebaseapp.com",
    projectId: "gestao-de-casa",
    storageBucket: "gestao-de-casa.firebasestorage.app",
    messagingSenderId: "654288457597",
    appId: "1:654288457597:web:22d730ce4b75ca4eb40614"
  },

  // Categorias disponíveis no sistema e palavras-chave para auto-classificação
  categoryKeywords: {
    'Moradia': ['aluguel', 'condomínio', 'condominio', 'iptu', 'terreno', 'reforma', 'imovel'],
    'Serviços': ['luz', 'energia', 'celec', 'enel', 'água', 'agua', 'casan', 'sabesp', 'internet', 'fibra', 'gás', 'gas', 'celular', 'telefone', 'netflix', 'spotify'],
    'Alimentação': ['mercado', 'supermercado', 'compras', 'padaria', 'açougue', 'feira', 'ifood', 'almoço', 'jantar', 'lanche'],
    'Cartão': ['cartão', 'cartao', 'fatura', 'nubank', 'inter', 'c6', 'itau', 'bradesco', 'santander'],
    'Transporte': ['gasolina', 'combustível', 'combustivel', 'uber', '99', 'estacionamento', 'pedagio', 'oficina', 'mecanico', 'troca de oleo', 'ipva', 'seguro auto'],
    'Saúde': ['farmácia', 'farmacia', 'remedio', 'remédio', 'médico', 'medico', 'dentista', 'consulta', 'exame', 'terapia', 'psicologo', 'plano de saude'],
    'Lazer': ['cinema', 'show', 'restaurante', 'viagem', 'hotel', 'praia', 'passeio'],
    'Investimentos / Reserva': ['investimento', 'reserva', 'cdb', 'tesouro', 'poupanca', 'poupança', 'ações', 'fii'],
    'Outros': []
  }
};
