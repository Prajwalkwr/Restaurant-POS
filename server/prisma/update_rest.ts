import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
const prisma = new PrismaClient();
async function main() {
  const managerPin = process.env.MANAGER_PIN;
  if (!managerPin || !/^\d{8,12}$/.test(managerPin)) {
    throw new Error('Set MANAGER_PIN to a unique 8-12 digit PIN before updating the restaurant.');
  }

  const r = await prisma.restaurant.findFirst();
  if (!r) throw new Error('No restaurant found. Run the development seed or provision a restaurant first.');
  await prisma.restaurant.update({ where: { id: r.id }, data: {
    managerPinHash: await bcrypt.hash(managerPin, 12),
  }});
  console.log('Manager approval PIN updated.');
}
main().finally(()=>prisma.$disconnect());
