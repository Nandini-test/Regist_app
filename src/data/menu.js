// Happy Yummy menu and shop settings.
// Edit names, prices and descriptions here — prices are in rupees.
// To add a photo later, put it in public/images/ and set image: '/images/your-file.jpg'.
// Admins can also add dishes and photos from the Menu page (stored by src/models/dishStore.js).
const dishStore = require('../models/dishStore');

const categories = [
  { id: 'starters', name: 'Non-veg Starters', emoji: '🍗' },
  { id: 'sweets', name: 'Sweets', emoji: '🍮' },
];

const items = [
  {
    id: 'chicken-65',
    category: 'starters',
    name: 'Chicken 65',
    price: 220,
    unit: '250 g plate',
    description: 'Spicy, crispy deep-fried chicken with curry leaves and green chillies.',
    emoji: '🍗',
    nonVeg: true,
  },
  {
    id: 'pepper-chicken',
    category: 'starters',
    name: 'Pepper Chicken Fry',
    price: 240,
    unit: '250 g plate',
    description: 'Dry chicken roast with freshly crushed black pepper and onions.',
    emoji: '🌶️',
    nonVeg: true,
  },
  {
    id: 'apollo-fish',
    category: 'starters',
    name: 'Apollo Fish',
    price: 280,
    unit: '250 g plate',
    description: 'Boneless fish tossed in a tangy, spicy masala — a Hyderabad favourite.',
    emoji: '🐟',
    nonVeg: true,
  },
  {
    id: 'chicken-lollipop',
    category: 'starters',
    name: 'Chicken Lollipop',
    price: 230,
    unit: '6 pieces',
    description: 'Juicy frenched wings, crispy outside, served with spicy dip.',
    emoji: '🍖',
    nonVeg: true,
  },
  {
    id: 'prawns-fry',
    category: 'starters',
    name: 'Prawns Fry',
    price: 320,
    unit: '250 g plate',
    description: 'Fresh prawns pan-fried with home-ground masala.',
    emoji: '🍤',
    nonVeg: true,
    weekendOnly: true,
  },
  {
    id: 'double-ka-meetha',
    category: 'sweets',
    name: 'Double ka Meetha',
    price: 120,
    unit: '250 g box',
    description: 'Bread pudding soaked in saffron milk, topped with dry fruits.',
    emoji: '🍮',
  },
  {
    id: 'gulab-jamun',
    category: 'sweets',
    name: 'Gulab Jamun',
    price: 100,
    unit: '6 pieces',
    description: 'Soft khoya dumplings in cardamom sugar syrup.',
    emoji: '🍡',
  },
  {
    id: 'carrot-halwa',
    category: 'sweets',
    name: 'Carrot Halwa',
    price: 130,
    unit: '250 g box',
    description: 'Slow-cooked carrots with milk, ghee and cashews.',
    emoji: '🥕',
  },
];

const settings = {
  deliveryFee: 30, // ₹ for home delivery
  freeDeliveryAbove: 500, // ₹ subtotal for free delivery
  maxQtyPerItem: 10,
  // Evening delivery / pickup slots (India time)
  slots: ['6:00 – 7:00 PM', '7:00 – 8:00 PM', '8:00 – 9:00 PM'],
  sameDayCutoffHour: 14, // same-day orders must be placed before 2 PM
  maxDaysAhead: 3, // customers can pre-order up to 3 days ahead
};

// Built-in dishes above plus any the admin added from the Menu page.
function allItems() {
  return [...items, ...dishStore.listCustom()];
}

function findItem(id) {
  return allItems().find((i) => i.id === id) || null;
}

module.exports = { categories, items, settings, allItems, findItem };
