-- 0011: Ontology cache tables for Alethia Phase O1
-- 本体论缓存表：存储从 Markdown 解析出的本体类、属性、超边签名和推理规则

CREATE TABLE IF NOT EXISTS ontology_classes (
  id SERIAL PRIMARY KEY,
  name VARCHAR(256) NOT NULL,
  parent VARCHAR(256),
  description TEXT,
  source_slug VARCHAR(512) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ontology_properties (
  id SERIAL PRIMARY KEY,
  name VARCHAR(256) NOT NULL,
  domain_class VARCHAR(256) NOT NULL,
  range_class VARCHAR(256) NOT NULL,
  inverse_of VARCHAR(256),
  source_slug VARCHAR(512) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ontology_hyperedge_signatures (
  id SERIAL PRIMARY KEY,
  type_name VARCHAR(256) NOT NULL UNIQUE,
  signature TEXT NOT NULL,
  domain_classes TEXT[] NOT NULL DEFAULT '{}',
  range_classes TEXT[] NOT NULL DEFAULT '{}',
  source_slug VARCHAR(512) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ontology_rules (
  id SERIAL PRIMARY KEY,
  rule_type VARCHAR(128) NOT NULL,
  description TEXT NOT NULL,
  body TEXT NOT NULL,
  source_slug VARCHAR(512) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ontology_classes_parent ON ontology_classes(parent);
CREATE INDEX IF NOT EXISTS idx_ontology_properties_domain ON ontology_properties(domain_class);
CREATE INDEX IF NOT EXISTS idx_ontology_hyperedge_type ON ontology_hyperedge_signatures(type_name);