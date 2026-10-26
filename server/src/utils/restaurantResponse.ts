import type { Restaurant } from '@prisma/client';

export function serializeRestaurant(restaurant: Restaurant) {
  return {
    id: restaurant.id,
    name: restaurant.name,
    address: restaurant.address,
    phone: restaurant.phone,
    email: restaurant.email,
    timeZone: restaurant.timeZone,
    currency: restaurant.currency,
    taxRateBps: restaurant.taxRateBps,
    serviceChargeBps: restaurant.serviceChargeBps,
    receiptFooter: restaurant.receiptFooter,
    panNumber: restaurant.panNumber,
    taxRegistrationNumber: restaurant.taxRegistrationNumber,
    createdAt: restaurant.createdAt,
    updatedAt: restaurant.updatedAt,
  };
}
