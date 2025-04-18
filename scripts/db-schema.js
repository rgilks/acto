#!/usr/bin/env node

const sqlite3 = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'data', 'acto.sqlite');
console.log(`Connecting to database at ${dbPath}`);
const db = sqlite3(dbPath);

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
  .all();

console.log(`\nDatabase has ${tables.length} tables:`);
tables.forEach((table) => {
  console.log(`\n===== TABLE: ${table.name} =====`);

  const columns = db.prepare(`PRAGMA table_info(${table.name})`).all();
  console.log('Column structure:');
  columns.forEach((col) => {
    const nullable = col.notnull === 0 ? 'NULL' : 'NOT NULL';
    const defaultVal = col.dflt_value ? `DEFAULT ${col.dflt_value}` : '';
    const pk = col.pk === 1 ? 'PRIMARY KEY' : '';
    console.log(`  ${col.name} ${col.type} ${nullable} ${defaultVal} ${pk}`.trim());
  });

  try {
    const sampleRow = db.prepare(`SELECT * FROM ${table.name} LIMIT 1`).get();
    if (sampleRow) {
      console.log('\nSample row:');
      Object.entries(sampleRow).forEach(([key, value]) => {
        console.log(`  ${key}: ${value}`);
      });
    } else {
      console.log('\nTable is empty');
    }
  } catch (error) {
    console.error(`Error getting sample data: ${error.message}`);
  }

  const count = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get();
  console.log(`\nTotal rows: ${count.count}`);
});

db.close();
console.log('\nDatabase connection closed.');
