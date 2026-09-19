import {
  Baby,
  BedDouble,
  Bike,
  BookOpen,
  Bus,
  Cake,
  Car,
  CircleParking,
  Coins,
  Dumbbell,
  Flame,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  Heart,
  House,
  Landmark,
  Music,
  PawPrint,
  Plane,
  Receipt,
  Repeat,
  Shirt,
  ShoppingBasket,
  Smartphone,
  Sofa,
  Sparkles,
  Stethoscope,
  Train,
  Tv,
  Umbrella,
  Utensils,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type {
  ExpenseCategory,
  ExpenseTag,
  GoalKind,
  OnboardingStep,
} from "@/engine/types";
import type { AccountKind } from "@/engine/types";
import type { Accent } from "./accent";
import type { IconSource } from "./Icon";
import type { PictureName } from "./pictures";

export const CATEGORY_ICON: Record<ExpenseCategory, IconSource> = {
  home: "nav-home-bills",
  living: "nav-living",
  transport: "nav-transport",
  finance: "nav-finance",
  leisure: "nav-leisure",
  planned: "nav-planned",
};

const TAG_ICON: Partial<Record<ExpenseTag, LucideIcon>> = {
  car: Car,
  subscription: Repeat,
  debt: Landmark,
  insurance: Umbrella,
  utility: Zap,
  public_transport: Bus,
};

/** What the name says the money is for, in either language. First match wins, so the specific comes before the general. */
const NAME_ICON: [RegExp, LucideIcon][] = [
  [/gift|present|julklapp/i, Gift],
  [/birthday|födelsedag/i, Cake],
  [/wedding|bröllop|valentine|alla hjärtan/i, Heart],
  [
    /flight|flyg|\btrip\b|travel|\bresa\b|resor|holiday|semester|vacation/i,
    Plane,
  ],
  [/hotel|hotell|airbnb/i, BedDouble],
  [/concert|konsert|festival|spotify|\bmusic\b|musik/i, Music],
  [/netflix|hbo|disney|viaplay|streaming|\btv\b/i, Tv],
  [/\bgym\b|träning|\bsats\b|fitness/i, Dumbbell],
  [/dentist|tandläkare|doctor|läkare|medicin|apotek|pharmacy/i, Stethoscope],
  [/clothes|kläder|shoes|\bskor\b/i, Shirt],
  [/restaurant|restaurang|\blunch|dinner|middag|takeaway|foodora/i, Utensils],
  [/grocer|livsmedel|\bmat\b|\bica\b|\bcoop\b|willys|hemköp/i, ShoppingBasket],
  [/furniture|möbler|ikea|\bsofa\b|soffa/i, Sofa],
  [
    /\bpets?\b|husdjur|veterinär|\bvet\b|\bhund|\bkatt|\bdog\b|\bcat\b/i,
    PawPrint,
  ],
  [/\bkids?\b|\bbarn|daycare|förskola|dagis|\bbaby\b/i, Baby],
  [/course|\bkurs|school|skola|tuition|\bbooks?\b|böcker/i, BookOpen],
  [/\bcsn\b|student loan|studielån/i, GraduationCap],
  [/\bgames?\b|\bspel\b|playstation|xbox|nintendo|steam/i, Gamepad2],
  [/\bphone|mobil|telefon|iphone/i, Smartphone],
  [/internet|broadband|bredband|wifi|fiber/i, Wifi],
  [/electricity|\bel\b|elnät|elhandel|elavtal|\bpower\b/i, Zap],
  [/heating|värme|\bgas\b/i, Flame],
  [/\brent\b|\bhyra\b|mortgage|bolån|housing/i, House],
  [/parking|parkering/i, CircleParking],
  [/\bfuel\b|bensin|diesel|petrol|laddning|charging/i, Fuel],
  [/\btrain\b|\btåg\b|\bsj\b/i, Train],
  [/\bbike\b|cykel|bicycle/i, Bike],
  [/\bcar\b|\bbil\b|bilen|vehicle|fordon|\btyres?\b|\bdäck\b/i, Car],
  [/insurance|försäkring/i, Umbrella],
  [/\btax\b|skatt/i, Landmark],
];

/** Line icons for expense rows, one per category; the illustrated set stays out of list rows. */
const CATEGORY_GLYPH: Record<ExpenseCategory, LucideIcon> = {
  home: House,
  living: ShoppingBasket,
  transport: Car,
  finance: Coins,
  leisure: Sparkles,
  planned: Receipt,
};

/** Icons a user can pick for an expense. Keys are stored on the item, so keep them stable. */
export const EXPENSE_ICONS: Record<string, LucideIcon> = {
  house: House,
  zap: Zap,
  flame: Flame,
  wifi: Wifi,
  phone: Smartphone,
  tv: Tv,
  music: Music,
  games: Gamepad2,
  basket: ShoppingBasket,
  utensils: Utensils,
  shirt: Shirt,
  sofa: Sofa,
  dumbbell: Dumbbell,
  stethoscope: Stethoscope,
  sparkles: Sparkles,
  car: Car,
  fuel: Fuel,
  parking: CircleParking,
  bus: Bus,
  train: Train,
  bike: Bike,
  plane: Plane,
  hotel: BedDouble,
  umbrella: Umbrella,
  landmark: Landmark,
  coins: Coins,
  receipt: Receipt,
  repeat: Repeat,
  graduation: GraduationCap,
  book: BookOpen,
  baby: Baby,
  paw: PawPrint,
  gift: Gift,
  cake: Cake,
  heart: Heart,
};

/** The user's pick; otherwise the most specific guess: what the name says, then the tag, then the category. */
export function expenseIcon(e: {
  name: string;
  category: ExpenseCategory;
  tags?: ExpenseTag[];
  icon?: string;
}): LucideIcon {
  const picked = e.icon ? EXPENSE_ICONS[e.icon] : undefined;
  if (picked) return picked;
  const byName = NAME_ICON.find(([re]) => re.test(e.name))?.[1];
  if (byName) return byName;
  const byTag = e.tags?.map((t) => TAG_ICON[t]).find(Boolean);
  return byTag ?? CATEGORY_GLYPH[e.category];
}

export const STEP_ICON: Record<OnboardingStep, IconSource> = {
  income: "nav-income",
  home: "nav-home-bills",
  living: "nav-living",
  transport: "nav-transport",
  finance: "nav-finance",
  leisure: "nav-leisure",
  planned: "nav-planned",
  savings: "nav-savings",
  accounts: "nav-accounts",
  summary: "state-celebrate",
};

export const ACCOUNT_ICON: Record<AccountKind, IconSource> = {
  everyday: "account-everyday",
  salary: "account-salary",
  savings: "account-savings",
  emergency: "account-emergency",
  joint: "account-joint",
  cash: "account-cash",
  isk: "account-investment",
  kf: "account-investment",
  af: "account-investment",
  investment: "account-investment",
  other: "account-other",
};

export const ACCOUNT_ACCENT: Record<AccountKind, Accent> = {
  everyday: "blue",
  salary: "green",
  savings: "purple",
  emergency: "yellow",
  joint: "red",
  cash: "orange",
  isk: "green",
  kf: "brand",
  af: "blue",
  investment: "green",
  other: "indigo",
};

export const GOAL_KIND_ICON: Record<GoalKind, IconSource> = {
  emergency: "goal-shield",
  general: "goal-piggy",
  investment: "goal-trending",
  purchase: "goal-target",
  pension: "goal-leaf",
  custom: "goal-target",
};

/** Icons a user can pick for a goal. Keys are stored on the goal, so keep them stable. */
export const GOAL_ICONS: Record<string, PictureName> = {
  shield: "goal-shield",
  home: "goal-home",
  palmtree: "goal-palmtree",
  car: "goal-car",
  laptop: "goal-laptop",
  plane: "goal-plane",
  gift: "goal-gift",
  heart: "goal-heart",
  graduation: "goal-graduation",
  wrench: "goal-wrench",
  piggy: "goal-piggy",
  trending: "goal-trending",
  target: "goal-target",
  leaf: "goal-leaf",
};

export const GOAL_ICON_ACCENT: Record<string, Accent> = {
  shield: "green",
  home: "red",
  palmtree: "blue",
  car: "red",
  laptop: "purple",
  plane: "blue",
  gift: "orange",
  heart: "red",
  graduation: "indigo",
  wrench: "orange",
  piggy: "purple",
  trending: "green",
  target: "yellow",
  leaf: "brand",
};

export const NAV_ICON = {
  home: "nav-home",
  income: "nav-income",
  savings: "nav-savings",
  accounts: "nav-accounts",
  planning: "nav-planning",
  insights: "nav-insights",
  settings: "nav-settings",
} as const satisfies Record<string, PictureName>;

export function goalIcon(name?: string, kind?: GoalKind): IconSource {
  if (name && GOAL_ICONS[name]) return GOAL_ICONS[name];
  return kind ? GOAL_KIND_ICON[kind] : "goal-target";
}

export function goalAccent(name?: string, kind?: GoalKind): Accent {
  if (name && GOAL_ICON_ACCENT[name]) return GOAL_ICON_ACCENT[name];
  switch (kind) {
    case "emergency":
      return "green";
    case "investment":
      return "green";
    case "pension":
      return "brand";
    case "general":
      return "purple";
    default:
      return "blue";
  }
}
