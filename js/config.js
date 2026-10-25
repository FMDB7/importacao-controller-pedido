/* ══════════════════════════════════════════════════════════
   TopImport Pro — Configuração de Backend (Neon)
   Chaves abaixo são públicas por design (publishable client key
   do Stack Auth + URL da Data API). Nunca coloque aqui a service
   key / connection string do banco.
   ══════════════════════════════════════════════════════════ */
window.TOPIMPORT_CONFIG = {
  // Neon Data API (REST / PostgREST) — leitura e escrita nas tabelas
  DATA_API_URL: 'https://ep-floral-shape-b6ctsiwl.apirest.c-2.sa-east-1.aws.neon.tech/topimport/rest/v1',

  // Neon Auth (Stack Auth) — login de colaboradores
  STACK_PROJECT_ID: '205aa01b-2fee-467b-b54a-7631559a06b9',
  STACK_PUBLISHABLE_CLIENT_KEY: 'pck_e229papsyp79wbpe23xpqhvxzwamp7d9b4z2ckp87dzxr',
  STACK_API_URL: 'https://api.stack-auth.com/api/v1',

  // Supabase Storage — apenas para anexos (PI, NF, BL, comprovantes de câmbio).
  // Não é usado para dados/autenticação — isso continua 100% no Neon acima.
  // A LEITURA (download/visualização) continua direto no bucket, que é
  // público para leitura por design. O UPLOAD e a EXCLUSÃO, porém, não vão
  // mais direto pro bucket com a anon key — isso bastava pra qualquer pessoa
  // com essa chave escrever/apagar qualquer anexo, sem nunca ter logado no
  // app (ver Fase 12 e Fase 17 no histórico do projeto). Agora passam pela
  // Edge Function STORAGE_GATEWAY_URL, que confirma o login da pessoa no
  // Neon Auth antes de gravar no bucket (com uma chave que só existe no
  // servidor, nunca enviada ao navegador).
  STORAGE_URL: 'https://xgzhvsovzxtcdhfkesgd.supabase.co',
  STORAGE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhnemh2c292enh0Y2RoZmtlc2dkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNTY5NTksImV4cCI6MjA5NzczMjk1OX0.o3NXqGskkOTaWw8Zn7ofGeLKAXB7mNK5IzhNVuhZiUY',
  STORAGE_BUCKET: 'importacao-anexos',
  STORAGE_GATEWAY_URL: 'https://xgzhvsovzxtcdhfkesgd.supabase.co/functions/v1/anexos-gateway'
};
