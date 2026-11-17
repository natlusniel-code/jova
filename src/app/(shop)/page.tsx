import Link from "next/link";
import { headers } from "next/headers";
import { getSession } from "@/lib/supabase/server";
import {
  getCategories,
  getNearbyShops,
  getStorefrontFeed,
  getPlaces,
  resolveCity,
  getWishlistIds,
  ALL_CITIES,
} from "@/lib/queries";
import { anonymousSeed } from "@/lib/stable-random";
import { ListingCard, ShopCard, placeLabel } from "@/components/cards";
import { SellerCarousel } from "@/components/seller-carousel";
import { GigCard } from "@/components/gig-card";
import { ListingTabs } from "@/components/listing-tabs";
import { LocationFilter } from "@/components/location-filter";
import { RecommendationRail } from "@/components/recommendation-rail";
import { SectionHead, EmptyState, Badge } from "@/components/ui";
import { naira } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SP = { city?: string; tab?: string };
