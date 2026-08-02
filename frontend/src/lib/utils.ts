import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind class names, with later classes winning conflicts.
 * clsx flattens conditionals/arrays/objects; twMerge resolves collisions
 * (e.g. cn("px-2", "px-4") -> "px-4").
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
