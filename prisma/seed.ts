import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

// =============================================================================
// Seed — PedidoLocal
// =============================================================================

const prisma = new PrismaClient();

async function hash(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
}

async function main() {
  console.log('🌱 Iniciando seed...\n');

  // 1. Super Admin
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL ?? 'admin@pedidolocal.com.br';
  const superAdminPassword = 'SuperAdmin123!';

  const superAdmin = await prisma.user.upsert({
    where: { email: superAdminEmail },
    update: {},
    create: {
      email: superAdminEmail,
      name: 'Administrador',
      passwordHash: await hash(superAdminPassword),
      isActive: true,
      emailVerified: true,
    },
  });
  console.log(`✅ Super Admin: ${superAdmin.email}`);

  // 2. Tenant
  const tenant = await prisma.tenant.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Burger do Zé',
      document: '12.345.678/0001-90',
      status: 'ACTIVE',
    },
  });
  console.log(`✅ Tenant: ${tenant.name}`);

  // 3. Owner
  const ownerEmail = process.env.SEED_OWNER_EMAIL ?? 'dono@demo.com';
  const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? 'SenhaDemo123!';

  const owner = await prisma.user.upsert({
    where: { email: ownerEmail },
    update: {},
    create: {
      email: ownerEmail,
      name: 'Zé da Lanchonete',
      passwordHash: await hash(ownerPassword),
      isActive: true,
      emailVerified: true,
    },
  });

  await prisma.tenantMember.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: owner.id } },
    update: {},
    create: { tenantId: tenant.id, userId: owner.id, role: 'OWNER' },
  });
  console.log(`✅ Owner: ${owner.email}`);

  // 4. Manager
  const manager = await prisma.user.upsert({
    where: { email: 'gerente@demo.com' },
    update: {},
    create: {
      email: 'gerente@demo.com',
      name: 'Maria Gerente',
      passwordHash: await hash('SenhaDemo123!'),
      isActive: true,
    },
  });

  await prisma.tenantMember.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: manager.id } },
    update: {},
    create: { tenantId: tenant.id, userId: manager.id, role: 'MANAGER' },
  });
  console.log(`✅ Manager: ${manager.email}`);

  // 5. Attendant
  const attendant = await prisma.user.upsert({
    where: { email: 'atendente@demo.com' },
    update: {},
    create: {
      email: 'atendente@demo.com',
      name: 'João Atendente',
      passwordHash: await hash('SenhaDemo123!'),
      isActive: true,
    },
  });

  await prisma.tenantMember.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: attendant.id } },
    update: {},
    create: { tenantId: tenant.id, userId: attendant.id, role: 'ATTENDANT' },
  });
  console.log(`✅ Attendant: ${attendant.email}`);

  // 6. Store
  const store = await prisma.store.upsert({
    where: { slug: 'burger-do-ze' },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Burger do Zé',
      slug: 'burger-do-ze',
      description: 'Os melhores hambúrgueres artesanais da cidade.',
      status: 'OPEN',
      isActive: true,
    },
  });

  await prisma.storeSettings.upsert({
    where: { storeId: store.id },
    update: {},
    create: {
      storeId: store.id,
      minOrderValue: 2000,
      estimatedTime: '30-50 min',
      deliveryEnabled: true,
      pickupEnabled: true,
      pixKeyType: 'PHONE',
      pixKey: '(11) 99999-9999',
      pixRecipient: 'José da Silva',
    },
  });

  await prisma.storeAddress.upsert({
    where: { storeId: store.id },
    update: {},
    create: {
      storeId: store.id,
      street: 'Rua das Flores',
      number: '123',
      neighborhood: 'Centro',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01001-000',
    },
  });
  console.log(`✅ Store: ${store.name} (/${store.slug})`);

  // 7. Opening Hours
  const days = [
    { day: 'MONDAY' as const, open: '11:00', close: '23:00' },
    { day: 'TUESDAY' as const, open: '11:00', close: '23:00' },
    { day: 'WEDNESDAY' as const, open: '11:00', close: '23:00' },
    { day: 'THURSDAY' as const, open: '11:00', close: '23:00' },
    { day: 'FRIDAY' as const, open: '11:00', close: '00:00' },
    { day: 'SATURDAY' as const, open: '11:00', close: '00:00' },
    { day: 'SUNDAY' as const, open: '16:00', close: '22:00' },
  ];

  for (const d of days) {
    await prisma.openingHour.upsert({
      where: { storeId_dayOfWeek: { storeId: store.id, dayOfWeek: d.day } },
      update: {},
      create: { storeId: store.id, dayOfWeek: d.day, openTime: d.open, closeTime: d.close },
    });
  }
  console.log('✅ Horários configurados');

  // 8. Categories
  const catBurger = await prisma.category.upsert({
    where: { id: '00000000-0000-0000-0001-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0001-000000000001',
      tenantId: tenant.id,
      storeId: store.id,
      name: 'Hambúrgueres',
      sortOrder: 1,
    },
  });

  const catPorcoes = await prisma.category.upsert({
    where: { id: '00000000-0000-0000-0001-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-0000-0001-000000000002',
      tenantId: tenant.id,
      storeId: store.id,
      name: 'Porções',
      sortOrder: 2,
    },
  });

  const catBebidas = await prisma.category.upsert({
    where: { id: '00000000-0000-0000-0001-000000000003' },
    update: {},
    create: {
      id: '00000000-0000-0000-0001-000000000003',
      tenantId: tenant.id,
      storeId: store.id,
      name: 'Bebidas',
      sortOrder: 3,
    },
  });
  console.log('✅ 3 categorias criadas');

  // 9. Products (basePrice = centavos, storeId obrigatório)
  const xBurguer = await prisma.product.upsert({
    where: { id: '00000000-0000-0000-0002-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0002-000000000001',
      tenantId: tenant.id,
      storeId: store.id,
      categoryId: catBurger.id,
      name: 'X-Burguer Clássico',
      description: 'Hambúrguer 180g, queijo cheddar, alface, tomate e molho especial.',
      basePrice: 2490,
      sortOrder: 1,
    },
  });

  await prisma.product.upsert({
    where: { id: '00000000-0000-0000-0002-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-0000-0002-000000000002',
      tenantId: tenant.id,
      storeId: store.id,
      categoryId: catBurger.id,
      name: 'X-Bacon',
      description: 'Hambúrguer 180g, bacon crocante, queijo prato e molho barbecue.',
      basePrice: 2990,
      sortOrder: 2,
    },
  });

  await prisma.product.upsert({
    where: { id: '00000000-0000-0000-0002-000000000003' },
    update: {},
    create: {
      id: '00000000-0000-0000-0002-000000000003',
      tenantId: tenant.id,
      storeId: store.id,
      categoryId: catBurger.id,
      name: 'X-Salada',
      description: 'Hambúrguer 180g, queijo mussarela, alface, tomate, milho e ervilha.',
      basePrice: 2290,
      sortOrder: 3,
    },
  });

  await prisma.product.upsert({
    where: { id: '00000000-0000-0000-0002-000000000004' },
    update: {},
    create: {
      id: '00000000-0000-0000-0002-000000000004',
      tenantId: tenant.id,
      storeId: store.id,
      categoryId: catPorcoes.id,
      name: 'Batata Frita',
      description: 'Porção de batata frita crocante com sal e orégano.',
      basePrice: 1590,
      sortOrder: 1,
    },
  });

  await prisma.product.upsert({
    where: { id: '00000000-0000-0000-0002-000000000005' },
    update: {},
    create: {
      id: '00000000-0000-0000-0002-000000000005',
      tenantId: tenant.id,
      storeId: store.id,
      categoryId: catBebidas.id,
      name: 'Coca-Cola 350ml',
      description: 'Coca-Cola lata 350ml gelada.',
      basePrice: 690,
      sortOrder: 1,
    },
  });

  await prisma.product.upsert({
    where: { id: '00000000-0000-0000-0002-000000000006' },
    update: {},
    create: {
      id: '00000000-0000-0000-0002-000000000006',
      tenantId: tenant.id,
      storeId: store.id,
      categoryId: catBebidas.id,
      name: 'Suco Natural 500ml',
      description: 'Suco natural de laranja ou limão.',
      basePrice: 890,
      sortOrder: 2,
    },
  });
  console.log('✅ 6 produtos criados');

  // 10. Option Group + Options (use schema field names: title, minSelections, maxSelections, price)
  const adicionaisGroup = await prisma.productOptionGroup.upsert({
    where: { id: '00000000-0000-0000-0003-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0003-000000000001',
      productId: xBurguer.id,
      title: 'Adicionais',
      minSelections: 0,
      maxSelections: 5,
      isMultiple: true,
      sortOrder: 1,
    },
  });

  await prisma.productOption.upsert({
    where: { id: '00000000-0000-0000-0004-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0004-000000000001',
      groupId: adicionaisGroup.id,
      name: 'Bacon extra',
      price: 400,
      sortOrder: 1,
    },
  });

  await prisma.productOption.upsert({
    where: { id: '00000000-0000-0000-0004-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-0000-0004-000000000002',
      groupId: adicionaisGroup.id,
      name: 'Queijo extra',
      price: 300,
      sortOrder: 2,
    },
  });

  await prisma.productOption.upsert({
    where: { id: '00000000-0000-0000-0004-000000000003' },
    update: {},
    create: {
      id: '00000000-0000-0000-0004-000000000003',
      groupId: adicionaisGroup.id,
      name: 'Ovo',
      price: 250,
      sortOrder: 3,
    },
  });
  console.log('✅ Adicionais criados');

  // 11. Delivery Zones (field: fee, estimatedTime)
  await prisma.deliveryZone.upsert({
    where: { id: '00000000-0000-0000-0005-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0005-000000000001',
      tenantId: tenant.id,
      storeId: store.id,
      name: 'Centro (até 3km)',
      fee: 500,
      estimatedTime: '25-35 min',
      sortOrder: 1,
    },
  });

  await prisma.deliveryZone.upsert({
    where: { id: '00000000-0000-0000-0005-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-0000-0005-000000000002',
      tenantId: tenant.id,
      storeId: store.id,
      name: 'Bairros próximos (3-6km)',
      fee: 800,
      estimatedTime: '35-50 min',
      sortOrder: 2,
    },
  });
  console.log('✅ Zonas de entrega criadas');

  console.log('\n🎉 Seed concluído!\n');
  console.log('Credenciais:');
  console.log(`  Super Admin:  ${superAdminEmail} / ${superAdminPassword}`);
  console.log(`  Owner:        ${ownerEmail} / ${ownerPassword}`);
  console.log('  Manager:      gerente@demo.com / SenhaDemo123!');
  console.log('  Attendant:    atendente@demo.com / SenhaDemo123!');
  console.log(`\n  Loja: http://localhost:3000/${store.slug}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('❌ Erro no seed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
