-- Adicionar coluna frequency para assinaturas (diária, semanal, quinzenal, mensal)
CREATE TYPE subscription_frequency AS ENUM ('diaria', 'semanal', 'quinzenal', 'mensal');

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS frequency subscription_frequency DEFAULT 'semanal';

-- Inserir configurações padrão do sistema (singleton)
INSERT INTO system_settings (key, value, description) VALUES
  ('min_qtd_kit_preco', '3', 'Quantidade mínima de itens para aplicar preço de kit'),
  ('hora_limite_entrega_dia', '"12:00"', 'Horário limite para agendamento de entrega no mesmo dia'),
  ('janelas_horario_entregas_avulsas', '["08:00-09:00", "09:00-10:00", "10:00-11:00", "11:00-12:00", "14:00-15:00", "15:00-16:00", "16:00-17:00"]', 'Janelas de horário para entregas avulsas'),
  ('min_itens_assinatura', '1', 'Quantidade mínima de itens para contratação de assinatura'),
  ('janelas_horario_entregas_assinaturas', '["08:00-09:00", "09:00-10:00", "10:00-11:00", "11:00-12:00", "14:00-15:00", "15:00-16:00", "16:00-17:00"]', 'Janelas de horário para entregas de assinaturas'),
  ('recorrencia_pj', '["diaria", "semanal", "quinzenal", "mensal"]', 'Frequências de recorrência permitidas para PJ'),
  ('recorrencia_pf', '["semanal", "quinzenal", "mensal"]', 'Frequências de recorrência permitidas para PF'),
  ('dias_funcionamento', '["segunda", "terca", "quarta", "quinta", "sexta"]', 'Dias da semana com operação ativa'),
  ('hora_abertura', '"08:00"', 'Horário de abertura da empresa'),
  ('hora_fechamento', '"18:00"', 'Horário de fechamento da empresa'),
  ('entregas_por_recorrencia', '{"diaria": 20, "semanal": 4, "quinzenal": 2, "mensal": 1}', 'Número de entregas mensais por tipo de recorrência')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;