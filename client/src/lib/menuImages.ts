const nepaliMenuPhotos: Record<string, string> = {
  'buff momo': '/menu-images/photos/buff-momo.webp',
  'chicken momo': '/menu-images/photos/buff-momo.webp',
  'steamed chicken momo': '/menu-images/photos/buff-momo.webp',
  'veg momo': '/menu-images/photos/jhol-momo.webp',
  'jhol momo': '/menu-images/photos/jhol-momo.webp',
  'kothey momo': '/menu-images/photos/kothey-momo.webp',
  'c-momo': '/menu-images/photos/c-momo.webp',
  'sadheko momo': '/menu-images/photos/sadheko-momo.webp',
  'chicken thukpa': '/menu-images/photos/chicken-thukpa.webp',
  'buff chowmein': '/menu-images/photos/buff-chowmein.webp',
  'chicken thakali set': '/menu-images/photos/chicken-thakali-set.webp',
  'nepali thakali set': '/menu-images/photos/chicken-thakali-set.webp',
  'veg dal bhat set': '/menu-images/photos/veg-dal-bhat.webp',
  'gundruk bhat set': '/menu-images/photos/gundruk-bhat.webp',
  'chicken sekuwa': '/menu-images/photos/chicken-sekuwa.webp',
  chatamari: '/menu-images/photos/chatamari.webp',
  'sel roti': '/menu-images/photos/sel-roti.webp',
  'juju dhau': '/menu-images/photos/juju-dhau.webp',
  'masala chiya': '/menu-images/photos/masala-chiya.webp',
};

export function getMenuImageUrl(name: string, imageUrl?: string | null) {
  const photo = nepaliMenuPhotos[name.trim().toLocaleLowerCase()];
  const isBundledIllustration = imageUrl?.startsWith('/menu-images/') && imageUrl.endsWith('.svg');
  if (photo && (!imageUrl || isBundledIllustration)) return photo;
  return imageUrl || null;
}
