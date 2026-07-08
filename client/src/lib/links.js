// Quick-commerce deep links. Each takes an ingredient name and returns a
// search URL with the name URL-encoded.

export const QUICK_COMMERCE = [
  {
    key: "zepto",
    label: "Zepto",
    color: "#5b1f9e",
    home: "https://www.zeptonow.com",
    url: (item) => `https://www.zeptonow.com/search?query=${encodeURIComponent(item)}`,
  },
  {
    key: "blinkit",
    label: "Blinkit",
    color: "#f8cb46",
    textColor: "#1a1a1a",
    home: "https://blinkit.com",
    url: (item) => `https://blinkit.com/s/?q=${encodeURIComponent(item)}`,
  },
  {
    key: "instamart",
    label: "Instamart",
    color: "#fc8019",
    home: "https://www.swiggy.com/instamart",
    url: (item) =>
      `https://www.swiggy.com/instamart/search?custom_back=true&query=${encodeURIComponent(
        item
      )}`,
  },
];

// Plain-text ingredient list for the "copy all" button.
export function ingredientsToText(ingredients) {
  return (ingredients || [])
    .map((i) => (i.quantity ? `${i.item} - ${i.quantity}` : i.item))
    .join("\n");
}
