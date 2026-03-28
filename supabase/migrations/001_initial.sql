-- Meal Planner: initial schema
-- Run this in the Supabase SQL editor

-- Current week's plan (single shared row, id always = 'current')
CREATE TABLE IF NOT EXISTS meal_plan (
  id TEXT PRIMARY KEY DEFAULT 'current',
  cuisine_rotation_index INTEGER NOT NULL DEFAULT 0,
  week_data JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed the single row so upserts always hit an UPDATE (triggers realtime)
INSERT INTO meal_plan (id, cuisine_rotation_index)
VALUES ('current', 0)
ON CONFLICT (id) DO NOTHING;

-- All previously generated weeks
CREATE TABLE IF NOT EXISTS meal_history (
  id TEXT PRIMARY KEY,
  week_number INTEGER NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL,
  week_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Which shopping-list item IDs are ticked (keyed by item id)
CREATE TABLE IF NOT EXISTS shopping_checks (
  item_id TEXT PRIMARY KEY,
  checked BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Manually added shopping items
-- category IS NULL  → "My Extras" section
-- category = 'Fruit & Veg' etc → added inside that category
CREATE TABLE IF NOT EXISTS shopping_extras (
  id TEXT PRIMARY KEY,
  category TEXT,
  name TEXT NOT NULL,
  checked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Realtime for the tables that need live sync
ALTER PUBLICATION supabase_realtime ADD TABLE meal_plan;
ALTER PUBLICATION supabase_realtime ADD TABLE shopping_checks;
ALTER PUBLICATION supabase_realtime ADD TABLE shopping_extras;
