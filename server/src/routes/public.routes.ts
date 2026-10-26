import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

const router = Router();

// default restaurant: first restaurant
async function defaultRestaurant() {
  return prisma.restaurant.findFirst();
}

router.get('/menu', async (req, res, next) => {
  try {
    const r = await defaultRestaurant();
    if (!r) return res.json({ categories: [], items: [] });
    const categories = await prisma.menuCategory.findMany({ where: { restaurantId: r.id, active: true }, orderBy: { displayOrder: 'asc' } });
    const items = await prisma.menuItem.findMany({
      where: { restaurantId: r.id, category: { active: true } },
      select: {
        id: true,
        categoryId: true,
        name: true,
        description: true,
        priceMinor: true,
        discountPercent: true,
        imageUrl: true,
        available: true,
        soldOut: true,
      },
      orderBy: { name: 'asc' },
    });
    res.json({ restaurant: { name: r.name, address: r.address, phone: r.phone }, categories, items });
  } catch (e) { next(e); }
});

export default router;
