INSERT INTO departments (code, name, description)
VALUES
  ('ROADS', 'Roads and Public Works', 'Fictional department responsible for road and public infrastructure maintenance.'),
  ('WATER', 'Water Supply', 'Fictional department responsible for drinking water supply and water infrastructure.'),
  ('ELECTRICITY', 'Electricity', 'Fictional department responsible for local electricity distribution and outages.'),
  ('MUNICIPAL', 'Municipal Administration', 'Fictional department responsible for municipal services and civic maintenance.'),
  ('HEALTH', 'Public Health', 'Fictional department responsible for public health services and sanitation concerns.'),
  ('POLICE', 'Police', 'Fictional department responsible for public safety reports and local policing concerns.'),
  ('TRANSPORT', 'Transport', 'Fictional department responsible for public and road transport services.'),
  ('REVENUE', 'Revenue', 'Fictional department responsible for land and revenue administration.'),
  ('EDUCATION', 'Education', 'Fictional department responsible for public education services.')
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    updated_at = now();
