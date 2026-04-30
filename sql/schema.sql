-- ═══════════════════════════════════════════════════════════════════════════
-- RepairPro — SQL Schema за Supabase
-- Изпълни този код в Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Поръчки
CREATE TABLE IF NOT EXISTS orders (
  id            TEXT PRIMARY KEY,
  client_name   TEXT NOT NULL,
  phone         TEXT NOT NULL,
  email         TEXT,
  device_type   TEXT,
  brand         TEXT,
  model         TEXT,
  serial_number TEXT,
  problem       TEXT,
  description   TEXT,
  status        TEXT DEFAULT 'Приет',
  technician_id UUID,
  technician    TEXT,
  price         NUMERIC(10,2) DEFAULT 0,
  deposit       NUMERIC(10,2) DEFAULT 0,
  date_in       DATE DEFAULT CURRENT_DATE,
  date_out      DATE,
  warranty_days INT DEFAULT 90,
  parts         JSONB DEFAULT '[]',
  photos        JSONB DEFAULT '[]',
  notes         TEXT,
  email_sent    BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Склад
CREATE TABLE IF NOT EXISTS inventory (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  category    TEXT,
  sku         TEXT,
  quantity    INT DEFAULT 0,
  min_qty     INT DEFAULT 2,
  price       NUMERIC(10,2) DEFAULT 0,
  cost        NUMERIC(10,2) DEFAULT 0,
  supplier    TEXT,
  location    TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Техници
CREATE TABLE IF NOT EXISTS technicians (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  phone      TEXT,
  email      TEXT,
  color      TEXT DEFAULT '#38bdf8',
  active     BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Triggers за updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_updated_at    BEFORE UPDATE ON orders    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER inventory_updated_at BEFORE UPDATE ON inventory FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Индекси за бързо търсене
CREATE INDEX IF NOT EXISTS idx_orders_client  ON orders(client_name);
CREATE INDEX IF NOT EXISTS idx_orders_phone   ON orders(phone);
CREATE INDEX IF NOT EXISTS idx_orders_status  ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_tech    ON orders(technician);
CREATE INDEX IF NOT EXISTS idx_orders_date    ON orders(date_in);

-- Enable Realtime (изпълни в Supabase Dashboard → Database → Replication)
-- ALTER TABLE orders    REPLICA IDENTITY FULL;
-- ALTER TABLE inventory REPLICA IDENTITY FULL;

-- Демо данни (по желание)
INSERT INTO technicians (name, phone, color) VALUES
  ('Иван Петров',    '0888 100 200', '#38bdf8'),
  ('Георги Димитров','0877 200 300', '#10b981'),
  ('Мария Стоянова', '0899 300 400', '#f59e0b'),
  ('Никола Василев', '0866 400 500', '#8b5cf6')
ON CONFLICT DO NOTHING;

INSERT INTO inventory (name, category, quantity, min_qty, price, cost, supplier) VALUES
  ('Дисплей Samsung Galaxy S22',  'Дисплеи',  3, 2,  89.00, 55.00, 'TechParts BG'),
  ('Дисплей iPhone 14',           'Дисплеи',  5, 2,  99.00, 62.00, 'iRepair BG'),
  ('Батерия iPhone 13',           'Батерии',  1, 3,  35.00, 18.00, 'iRepair BG'),
  ('Батерия Samsung A52',         'Батерии',  0, 2,  25.00, 12.00, 'TechParts BG'),
  ('Зарядно USB-C 65W',           'Аксесоари',8, 3,  18.00,  8.00, 'Wholesale BG'),
  ('Конектор зареждане iPhone 12','Конектори', 4, 2,  12.00,  5.00, 'iRepair BG')
ON CONFLICT DO NOTHING;
