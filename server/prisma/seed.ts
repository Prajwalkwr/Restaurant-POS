import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
  throw new Error('The demo seed is restricted to development and test environments.');
}

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.restaurant.findFirst();
  if (existing) {
    console.log('Seed already present, skipping.');
    return;
  }

  const restaurant = await prisma.restaurant.create({
    data: {
      name: 'Himalayan Bites Restaurant',
      address: 'Thamel, Kathmandu, Nepal',
      phone: '+977-1-4000000',
      email: 'info@himalayanbites.example',
      timeZone: 'Asia/Kathmandu',
      currency: 'NPR',
      taxRateBps: 1300,
      serviceChargeBps: 1000,
      receiptFooter: 'Thank you for dining with us!',
      panNumber: '123456789',
      taxRegistrationNumber: 'VAT-987654',
    },
  });

  const adminPassword = await bcrypt.hash('Admin@123', 12);
  const admin = await prisma.user.create({
    data: { restaurantId: restaurant.id, name: 'Admin User', email: 'admin@restaurant.local', passwordHash: adminPassword, role: 'ADMIN', active: true },
  });

  const waiterPassword = await bcrypt.hash('Waiter@123', 12);
  await prisma.user.createMany({
    data: [
      { restaurantId: restaurant.id, name: 'Waiter A', email: 'waiterA@restaurant.local', passwordHash: waiterPassword, role: 'WAITER', active: true },
      { restaurantId: restaurant.id, name: 'Waiter B', email: 'waiterB@restaurant.local', passwordHash: waiterPassword, role: 'WAITER', active: true },
    ],
  });

  const billerPassword = await bcrypt.hash('Biller@123', 12);
  await prisma.user.create({
    data: { restaurantId: restaurant.id, name: 'Biller User', email: 'biller@restaurant.local', passwordHash: billerPassword, role: 'BILLER', active: true },
  });

  const kitchenPassword = await bcrypt.hash('Kitchen@123', 12);
  await prisma.user.create({
    data: { restaurantId: restaurant.id, name: 'Kitchen User', email: 'kitchen@restaurant.local', passwordHash: kitchenPassword, role: 'KITCHEN', active: true },
  });

  // Categories
  const cats = await Promise.all([
    prisma.menuCategory.create({ data: { restaurantId: restaurant.id, name: 'Momo', description: 'Nepali dumplings', displayOrder: 1 } }),
    prisma.menuCategory.create({ data: { restaurantId: restaurant.id, name: 'Noodles', description: 'Chowmein and more', displayOrder: 2 } }),
    prisma.menuCategory.create({ data: { restaurantId: restaurant.id, name: 'Drinks', description: 'Beverages', displayOrder: 3 } }),
    prisma.menuCategory.create({ data: { restaurantId: restaurant.id, name: 'Desserts', description: 'Sweet treats', displayOrder: 4 } }),
  ]);
  const [momoCat, noodleCat, drinkCat, dessertCat] = cats;

  // Menu items (prices in paisa)
  const items = [
    { categoryId: momoCat.id, name: 'Chicken Momo', description: 'Steamed chicken dumplings', priceMinor: 18000, prepNotes: 'Serve with achar' },
    { categoryId: momoCat.id, name: 'Veg Momo', description: 'Steamed vegetable dumplings', priceMinor: 15000 },
    { categoryId: noodleCat.id, name: 'Veg Chowmein', description: 'Stir-fried noodles with vegetables', priceMinor: 15000 },
    { categoryId: noodleCat.id, name: 'Chicken Chowmein', description: 'Stir-fried noodles with chicken', priceMinor: 20000 },
    { categoryId: drinkCat.id, name: 'Coke', description: '330ml can', priceMinor: 6000 },
    { categoryId: drinkCat.id, name: 'Tea', description: 'Milk tea', priceMinor: 4000 },
    { categoryId: dessertCat.id, name: 'Kheer', description: 'Rice pudding', priceMinor: 12000 },
  ];
  for (const it of items) {
    await prisma.menuItem.create({ data: { restaurantId: restaurant.id, ...it, available: true } });
  }

  // Tables
  for (let i = 1; i <= 8; i++) {
    await prisma.restaurantTable.create({
      data: { restaurantId: restaurant.id, number: String(i).padStart(2, '0'), capacity: i <= 4 ? 4 : 6, section: i <= 4 ? 'Main Hall' : 'Patio', status: 'AVAILABLE' },
    });
  }

  console.log('Seed complete. Admin:', admin.email);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
