import {
  Beef,
  CakeSlice,
  Coffee,
  CupSoda,
  Fish,
  Pizza,
  Salad,
  Sandwich,
  Soup,
  UtensilsCrossed,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface MenuCategory {
  id: string;
  name: string;
  color?: string | null;
  icon?: string | null;
  displayOrder?: number;
  active?: boolean;
}

export const categoryIcons: Record<string, LucideIcon> = {
  UtensilsCrossed,
  Coffee,
  Soup,
  CakeSlice,
  Salad,
  CupSoda,
  Fish,
  Beef,
  Pizza,
  Sandwich,
};

export const categoryIconOptions = Object.keys(categoryIcons);
export const defaultCategoryColor = '#07856c';

export function getMenuCategoryColor(category?: Pick<MenuCategory, 'color'> | null) {
  return category?.color || defaultCategoryColor;
}
