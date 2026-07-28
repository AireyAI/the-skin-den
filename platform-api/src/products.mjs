import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

let cache = null;

function loadDoc() {
  if (cache) return cache;
  const path = join(apiRoot, "seed/products.json");
  cache = JSON.parse(readFileSync(path, "utf8"));
  return cache;
}

export function listPublishedProducts() {
  return (loadDoc().products || []).filter((p) => p.published !== false);
}

export function getProduct(productId) {
  return listPublishedProducts().find((p) => p.id === productId) || null;
}
