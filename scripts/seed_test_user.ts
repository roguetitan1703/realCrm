import { sql } from '../backend/src/services/db.js';
import bcrypt from 'bcryptjs';

async function seed() {
  console.log('[Seed] Inserting delpat tenant and test user...');
  
  await sql`
    INSERT INTO tenants (id, name, slug, subscription_plan, subscription_status, brand_config)
    VALUES ('delpat', 'Delpat Real Estate', 'delpat', 'ENTERPRISE', 'ACTIVE', ${sql.json({ primaryColor: '#1E6F52', firmName: 'Delpat Real Estate' })})
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, brand_config = EXCLUDED.brand_config;
  `;

  const hash = await bcrypt.hash('delpat-demo-1', 10);
  await sql`
    INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, metadata)
    VALUES ('u_akash', 'delpat', 'Akash Patel', 'akashpatelyo2@gmail.com', ${hash}, 'owner', 'ACTIVE', ${sql.json({ initials: 'AP' })})
    ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'owner', status = 'ACTIVE';
  `;

  await sql`
    INSERT INTO crm_leads (id, tenant_id, name, phone, stage, source, req, agent_id)
    VALUES ('l_delpat_1', 'delpat', 'Rajesh Sharma', '+91 98765 43210', 'New', 'Website', ${sql.json({ config: '3BHK', locality: 'Baner', budget: 12000000 })}, 'u_akash')
    ON CONFLICT (id) DO NOTHING;
  `;

  await sql`
    INSERT INTO crm_properties (id, tenant_id, title, society, locality, price, type, config, deal, status, tower, unit)
    VALUES ('p_delpat_1', 'delpat', 'Villa 402 Luxury Residency', 'Grand Riviera', 'Baner', '1.2 Cr', '3BHK', '3BHK', 'sale', 'Available', 'B', '402')
    ON CONFLICT (id) DO NOTHING;
  `;

  console.log('[Seed] Seeding completed successfully.');
  await sql.end();
  process.exit(0);
}

seed().catch(err => {
  console.error('[Seed Error]:', err);
  process.exit(1);
});
