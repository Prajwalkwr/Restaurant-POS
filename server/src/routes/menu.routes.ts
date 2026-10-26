import { Router } from 'express';
import { z } from 'zod';
import { v2 as cloudinary } from 'cloudinary';
import multer, { MulterError } from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole, AuthedRequest } from '../middleware/auth.js';
import { HttpError } from '../middleware/errorHandler.js';
import { validateBody } from '../middleware/validate.js';
import { audit } from '../services/audit.service.js';

const router = Router();
router.use(requireAuth);
const menuUploadDirectory = fileURLToPath(new URL('../../uploads/menu/', import.meta.url));
const imageExtensions: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};
const categoryIconNames = [
  'UtensilsCrossed',
  'Coffee',
  'Soup',
  'CakeSlice',
  'Salad',
  'CupSoda',
  'Fish',
  'Beef',
  'Pizza',
  'Sandwich',
] as const;
const categorySchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  displayOrder: z.number().int().nonnegative().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  icon: z.enum(categoryIconNames).optional(),
  active: z.boolean().optional(),
});
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      callback(new HttpError(400, 'Choose a JPEG, PNG, or WebP image.'));
      return;
    }
    callback(null, true);
  },
});

// Categories
router.get('/categories', async (req: AuthedRequest, res, next) => {
  try {
    const cats = await prisma.menuCategory.findMany({
      where: { restaurantId: req.user.restaurantId },
      orderBy: { displayOrder: 'asc' },
    });
    res.json({ categories: cats });
  } catch (e) { next(e); }
});

router.post('/categories', requireRole('ADMIN'), async (req: AuthedRequest, res, next) => {
  try {
    const category = categorySchema.extend({ name: z.string().trim().min(1) }).parse(req.body);
    const cat = await prisma.menuCategory.create({
      data: {
        restaurantId: req.user.restaurantId,
        name: category.name,
        description: category.description,
        displayOrder: category.displayOrder ?? 0,
        color: category.color ?? '#07856c',
        icon: category.icon ?? 'UtensilsCrossed',
      },
    });
    res.status(201).json({ category: cat });
  } catch (e) { next(e); }
});

router.patch('/categories/:id', requireRole('ADMIN'), async (req: AuthedRequest, res, next) => {
  try {
    const target = await prisma.menuCategory.findFirst({ where: { id: req.params.id as string, restaurantId: req.user.restaurantId } });
    if (!target) throw new HttpError(404, 'Category not found');
    const category = categorySchema.parse(req.body);
    const updated = await prisma.menuCategory.update({
      where: { id: target.id },
      data: {
        ...(category.name !== undefined && { name: category.name }),
        ...(category.description !== undefined && { description: category.description }),
        ...(category.displayOrder !== undefined && { displayOrder: category.displayOrder }),
        ...(category.color !== undefined && { color: category.color }),
        ...(category.icon !== undefined && { icon: category.icon }),
        ...(category.active !== undefined && { active: category.active }),
      },
    });
    await audit({
      restaurantId: req.user.restaurantId,
      actorId: req.user.id,
      action: 'MENU_CATEGORY_UPDATED',
      entityType: 'MenuCategory',
      entityId: target.id,
      before: target,
      after: updated,
    });
    res.json({ category: updated });
  } catch (e) { next(e); }
});

router.delete('/categories/:id', requireRole('ADMIN'), async (req: AuthedRequest, res, next) => {
  try {
    const target = await prisma.menuCategory.findFirst({
      where: { id: req.params.id as string, restaurantId: req.user.restaurantId },
    });
    if (!target) throw new HttpError(404, 'Category not found');
    const itemCount = await prisma.menuItem.count({
      where: { categoryId: target.id, restaurantId: req.user.restaurantId },
    });
    if (itemCount > 0) {
      throw new HttpError(409, `Move the ${itemCount} menu item${itemCount === 1 ? '' : 's'} to another category before deleting this category.`);
    }
    await prisma.menuCategory.delete({ where: { id: target.id } });
    await audit({
      restaurantId: req.user.restaurantId,
      actorId: req.user.id,
      action: 'MENU_CATEGORY_DELETED',
      entityType: 'MenuCategory',
      entityId: target.id,
      before: target,
    });
    res.json({ success: true });
  } catch (e) { next(e); }
});

// Items
router.post('/items/image', requireRole('ADMIN'), (req, res, next) => {
  imageUpload.single('image')(req, res, (error) => {
    if (error instanceof MulterError) {
      next(new HttpError(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400, error.code === 'LIMIT_FILE_SIZE' ? 'Image must be 5 MB or smaller.' : error.message));
      return;
    }
    if (error) {
      next(error);
      return;
    }
    next();
  });
}, async (req: AuthedRequest, res, next) => {
  try {
    const file = req.file;
    if (!file) throw new HttpError(400, 'Choose an image to upload.');

    const credentials = cloudinary.config();
    if (credentials.cloud_name && credentials.api_key && credentials.api_secret) {
      const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
        const upload = cloudinary.uploader.upload_stream(
          { folder: 'restaurant-pos/menu', resource_type: 'image' },
          (error, uploaded) => {
            if (error) {
              reject(error);
              return;
            }
            if (!uploaded?.secure_url) {
              reject(new Error('Cloudinary did not return an image URL.'));
              return;
            }
            resolve(uploaded);
          },
        );
        upload.end(file.buffer);
      });
      res.status(201).json({ imageUrl: result.secure_url });
      return;
    }

    await mkdir(menuUploadDirectory, { recursive: true });
    const filename = `${randomUUID()}${imageExtensions[file.mimetype]}`;
    await writeFile(path.join(menuUploadDirectory, filename), file.buffer, { flag: 'wx' });
    res.status(201).json({ imageUrl: `/uploads/menu/${filename}` });
  } catch (error) {
    next(error);
  }
});

const itemSchema = z.object({
  categoryId: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  priceMinor: z.number().int().positive(),
  discountPercent: z.number().finite().min(0).max(100).optional(),
  imageUrl: z.string().refine((value) => {
    if (/^\/(?:uploads\/menu\/[0-9a-f-]+\.(?:jpe?g|png|webp)|menu-images\/[a-z0-9/_-]+\.(?:jpe?g|png|webp|svg))$/i.test(value)) {
      return true;
    }
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Enter a valid HTTP(S) image URL or local menu image path.').nullable().optional(),
  available: z.boolean().optional(),
  soldOut: z.boolean().optional(),
  prepNotes: z.string().optional(),
});
const itemUpdateSchema = itemSchema.partial().refine((item) => Object.keys(item).length > 0);

router.get('/items', async (req: AuthedRequest, res, next) => {
  try {
    const { categoryId, search, available, sort } = req.query as any;
    const where: any = { restaurantId: req.user.restaurantId };
    if (categoryId) where.categoryId = categoryId;
    if (available !== undefined) where.available = available === 'true';
    if (search) where.name = { contains: search, mode: 'insensitive' };
    const items = await prisma.menuItem.findMany({
      where,
      include: { category: true, modifierGroups: { include: { options: true } } },
      orderBy: { name: 'asc' },
    });
    const soldQuantities = new Map<string, number>();
    if (sort === 'popular' && items.length) {
      const sales = await prisma.orderItem.findMany({
        where: {
          menuItemId: { in: items.map((item) => item.id) },
          status: { not: 'CANCELLED' },
          order: {
            is: {
              restaurantId: req.user.restaurantId,
              status: { in: ['SUBMITTED', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED'] },
            },
          },
        },
        select: { menuItemId: true, quantity: true },
      });
      for (const sale of sales) {
        if (!sale.menuItemId) continue;
        soldQuantities.set(sale.menuItemId, (soldQuantities.get(sale.menuItemId) ?? 0) + sale.quantity);
      }
    }
    const mapped = items.map((it: any) => ({
      ...it,
      isAvailable: it.available && !it.soldOut,
      price: it.priceMinor / 100,
      ...(sort === 'popular' && { soldQuantity: soldQuantities.get(it.id) ?? 0 }),
    }));
    if (sort === 'popular') {
      mapped.sort((left, right) => right.soldQuantity - left.soldQuantity || left.name.localeCompare(right.name));
    }
    res.json({ items: mapped });
  } catch (e) { next(e); }
});

router.post('/items', requireRole('ADMIN'), validateBody(itemSchema), async (req: AuthedRequest, res, next) => {
  try {
    const { categoryId, ...rest } = req.body;
    const cat = await prisma.menuCategory.findFirst({ where: { id: categoryId, restaurantId: req.user.restaurantId } });
    if (!cat) throw new HttpError(400, 'Invalid category');
    const item = await prisma.menuItem.create({
      data: { restaurantId: req.user.restaurantId, categoryId, ...rest },
      include: { category: true, modifierGroups: { include: { options: true } } },
    });
    await audit({ restaurantId: req.user.restaurantId, actorId: req.user.id, action: 'MENU_ITEM_CREATED', entityType: 'MenuItem', entityId: item.id, after: item });
    const { emitToRestaurant } = await import('../realtime/socket.js');
    emitToRestaurant(req.user.restaurantId, 'menu:item-updated', { itemId: item.id });
    res.status(201).json({ item });
  } catch (e) { next(e); }
});

router.patch('/items/:id', requireRole('ADMIN'), async (req: AuthedRequest, res, next) => {
  try {
    const target = await prisma.menuItem.findFirst({ where: { id: req.params.id as string, restaurantId: req.user.restaurantId } });
    if (!target) throw new HttpError(404, 'Item not found');
    const { categoryId, ...rest } = itemUpdateSchema.parse(req.body);
    if (categoryId !== undefined) {
      const cat = await prisma.menuCategory.findFirst({ where: { id: categoryId, restaurantId: req.user.restaurantId } });
      if (!cat) throw new HttpError(400, 'Invalid category');
    }
    const updated = await prisma.menuItem.update({
      where: { id: target.id },
      data: { ...(categoryId !== undefined && { categoryId }), ...rest },
      include: { category: true, modifierGroups: { include: { options: true } } },
    });
    await audit({ restaurantId: req.user.restaurantId, actorId: req.user.id, action: 'MENU_ITEM_UPDATED', entityType: 'MenuItem', entityId: target.id, before: target, after: updated });
    const { emitToRestaurant } = await import('../realtime/socket.js');
    emitToRestaurant(req.user.restaurantId, 'menu:item-updated', { itemId: updated.id });
    res.json({ item: updated });
  } catch (e) { next(e); }
});

router.patch('/items/:id/availability', requireRole('ADMIN', 'WAITER', 'KITCHEN'), async (req: AuthedRequest, res, next) => {
  try {
    const target = await prisma.menuItem.findFirst({ where: { id: req.params.id as string, restaurantId: req.user.restaurantId } });
    if (!target) throw new HttpError(404, 'Item not found');
    const { available, soldOut, isAvailable } = req.body;
    const data: any = {};
    if (typeof available === 'boolean') data.available = available;
    if (typeof soldOut === 'boolean') data.soldOut = soldOut;
    if (typeof isAvailable === 'boolean') { data.available = isAvailable; data.soldOut = !isAvailable; }
    const updated = await prisma.menuItem.update({ where: { id: target.id }, data });
    const { emitToRestaurant } = await import('../realtime/socket.js');
    emitToRestaurant(req.user.restaurantId, 'menu:item-availability-updated', { itemId: updated.id, available: updated.available, soldOut: updated.soldOut, isAvailable: updated.available && !updated.soldOut });
    res.json({ item: { ...updated, isAvailable: updated.available && !updated.soldOut } });
  } catch (e) { next(e); }
});

// Modifiers
router.post('/items/:id/modifier-groups', requireRole('ADMIN'), async (req: AuthedRequest, res, next) => {
  try {
    const target = await prisma.menuItem.findFirst({ where: { id: req.params.id as string, restaurantId: req.user.restaurantId } });
    if (!target) throw new HttpError(404, 'Item not found');
    const { name, required, multiSelect, displayOrder } = req.body;
    const g = await prisma.menuModifierGroup.create({
      data: { menuItemId: target.id, name, required: !!required, multiSelect: !!multiSelect, displayOrder: displayOrder ?? 0 },
      include: { options: true },
    });
    res.status(201).json({ group: g });
  } catch (e) { next(e); }
});

router.post('/modifier-groups/:id/options', requireRole('ADMIN'), async (req: AuthedRequest, res, next) => {
  try {
    const g = await prisma.menuModifierGroup.findUnique({ where: { id: req.params.id as string }, include: { menuItem: true } });
    if (!g || g.menuItem.restaurantId !== req.user.restaurantId) throw new HttpError(404, 'Group not found');
    const { name, priceMinor, available, displayOrder } = req.body;
    const opt = await prisma.menuModifierOption.create({
      data: { groupId: g.id, name, priceMinor: priceMinor ?? 0, available: available !== false, displayOrder: displayOrder ?? 0 },
    });
    res.status(201).json({ option: opt });
  } catch (e) { next(e); }
});

export default router;
