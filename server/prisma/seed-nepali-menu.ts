import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const categorySeeds = [
  { name: 'Nepali Meals', description: 'Traditional Nepali meals and set plates', displayOrder: 5 },
  { name: 'Nepali Snacks', description: 'Popular Nepali snacks and grilled bites', displayOrder: 6 },
];

const menuItems = [
  { name: 'Buff Momo', category: 'Momo', description: 'Steamed buffalo dumplings served with tomato achar', priceMinor: 19000, image: 'photos/buff-momo.jpg' },
  { name: 'Jhol Momo', category: 'Momo', description: 'Steamed chicken dumplings in a warm sesame-tomato broth', priceMinor: 22000, image: 'photos/jhol-momo.jpg' },
  { name: 'Kothey Momo', category: 'Momo', description: 'Pan-fried chicken dumplings with a crisp golden base', priceMinor: 22000, image: 'photos/kothey-momo.jpg' },
  { name: 'C-Momo', category: 'Momo', description: 'Chicken dumplings tossed in a spicy tomato sauce', priceMinor: 24000, image: 'photos/c-momo.jpg' },
  { name: 'Sadheko Momo', category: 'Momo', description: 'Chilled chicken dumplings tossed with Nepali spices and herbs', priceMinor: 24000, image: 'photos/sadheko-momo.jpg' },
  { name: 'Chicken Thukpa', category: 'Noodles', description: 'Tibetan-style noodle soup with chicken and vegetables', priceMinor: 22000, image: 'photos/chicken-thukpa.jpg' },
  { name: 'Buff Chowmein', category: 'Noodles', description: 'Wok-tossed noodles with buffalo, cabbage, and spring onion', priceMinor: 22000, image: 'photos/buff-chowmein.jpg' },
  { name: 'Chicken Thakali Set', category: 'Nepali Meals', description: 'Rice, chicken curry, lentils, greens, and tomato achar', priceMinor: 42000, image: 'photos/chicken-thakali-set.jpg' },
  { name: 'Veg Dal Bhat Set', category: 'Nepali Meals', description: 'Steamed rice, lentil soup, seasonal vegetables, and achar', priceMinor: 32000, image: 'photos/veg-dal-bhat.jpg' },
  { name: 'Gundruk Bhat Set', category: 'Nepali Meals', description: 'Rice with tangy fermented greens, lentils, and potato curry', priceMinor: 34000, image: 'photos/gundruk-bhat.jpg' },
  { name: 'Chicken Sekuwa', category: 'Nepali Snacks', description: 'Char-grilled Nepali-spiced chicken skewers with onion', priceMinor: 28000, image: 'photos/chicken-sekuwa.jpg' },
  { name: 'Chatamari', category: 'Nepali Snacks', description: 'Newari rice-flour crepe topped with egg and herbs', priceMinor: 20000, image: 'photos/chatamari.jpg' },
  { name: 'Sel Roti', category: 'Desserts', description: 'Traditional sweet rice bread, crisp outside and soft inside', priceMinor: 10000, image: 'photos/sel-roti.jpg' },
  { name: 'Juju Dhau', category: 'Desserts', description: 'Rich, creamy Bhaktapur-style sweet yogurt', priceMinor: 14000, image: 'photos/juju-dhau.jpg' },
  { name: 'Masala Chiya', category: 'Drinks', description: 'Nepali milk tea simmered with warming spices', priceMinor: 6000, image: 'photos/masala-chiya.jpg' },
];

async function main() {
  const restaurant = await prisma.restaurant.findFirst();
  if (!restaurant) {
    throw new Error('No restaurant found. Run prisma:seed first.');
  }

  const categories = await prisma.menuCategory.findMany({
    where: { restaurantId: restaurant.id },
  });
  const categoryIds = new Map(categories.map(({ name, id }) => [name, id]));

  for (const category of categorySeeds) {
    if (categoryIds.has(category.name)) continue;
    const created = await prisma.menuCategory.create({
      data: { restaurantId: restaurant.id, ...category },
    });
    categoryIds.set(created.name, created.id);
  }

  for (const item of menuItems) {
    let categoryId = categoryIds.get(item.category);
    if (!categoryId) {
      throw new Error(`Menu category "${item.category}" was not found.`);
    }

    const existing = await prisma.menuItem.findFirst({
      where: { restaurantId: restaurant.id, name: item.name },
    });
    const data = {
      categoryId,
      description: item.description,
      priceMinor: item.priceMinor,
      imageUrl: `/menu-images/${item.image}`,
      available: true,
    };

    if (existing) {
      await prisma.menuItem.update({ where: { id: existing.id }, data });
    } else {
      await prisma.menuItem.create({
        data: { restaurantId: restaurant.id, name: item.name, ...data },
      });
    }
  }

  const verifiedItems = await prisma.menuItem.findMany({
    where: {
      restaurantId: restaurant.id,
      name: { in: menuItems.map(({ name }) => name) },
    },
    select: { name: true, imageUrl: true },
  });
  if (verifiedItems.length !== menuItems.length || verifiedItems.some(({ imageUrl }) => !imageUrl)) {
    throw new Error('Nepali menu seed verification failed: expected 15 items with images.');
  }

  console.log(`Added or updated ${menuItems.length} Nepali menu items for ${restaurant.name}.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
