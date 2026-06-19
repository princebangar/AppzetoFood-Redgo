import mongoose from 'mongoose';
import { ValidationError } from '../../../../core/auth/errors.js';
import { FoodRestaurant } from '../models/restaurant.model.js';
import { FoodItem } from '../../admin/models/food.model.js';
import { FoodCategory } from '../../admin/models/category.model.js';
import { getFoodDisplayPrice, serializeFoodVariants } from '../../admin/services/foodVariant.service.js';

const buildMenuFromFoods = async (foods = []) => {
    const categoryIds = Array.from(
        new Set(
            (foods || [])
                .map((food) => {
                    const raw = food?.categoryId;
                    if (!raw) return '';
                    return String(raw);
                })
                .filter((value) => mongoose.Types.ObjectId.isValid(value))
        )
    );

    const categoryDocs = categoryIds.length
        ? await FoodCategory.find({ _id: { $in: categoryIds } })
            .select('name image sortOrder')
            .lean()
        : [];
    const categoryMap = new Map(categoryDocs.map((doc) => [String(doc._id), doc]));

    const nameToDocMap = new Map();
    for (const doc of categoryDocs) {
        const nameKey = String(doc.name || '').toLowerCase().trim();
        if (!nameKey) continue;
        const existing = nameToDocMap.get(nameKey);
        if (!existing) {
            nameToDocMap.set(nameKey, doc);
        } else {
            const existingHasImg = !!existing.image;
            const docHasImg = !!doc.image;
            if (docHasImg && !existingHasImg) {
                nameToDocMap.set(nameKey, doc);
            } else if (existingHasImg === docHasImg) {
                const existingOrder = typeof existing.sortOrder === 'number' ? existing.sortOrder : 0;
                const docOrder = typeof doc.sortOrder === 'number' ? doc.sortOrder : 0;
                if (docOrder < existingOrder) {
                    nameToDocMap.set(nameKey, doc);
                }
            }
        }
    }

    const recommendedDishes = [];
    const byCategory = new Map();
    for (const food of foods) {
        const foodCategoryName = (food?.categoryName || food?.category || '').trim();
        const categoryId = food?.categoryId ? String(food.categoryId) : '';
        const categoryDocFromId = categoryMap.get(categoryId) || null;
        
        const sectionName = (categoryDocFromId?.name || foodCategoryName || 'Menu').trim() || 'Menu';
        const nameKey = sectionName.toLowerCase();
        const categoryDoc = nameToDocMap.get(nameKey) || categoryDocFromId;

        const groupKey = `name:${nameKey}`;

        if (!byCategory.has(groupKey)) {
            byCategory.set(groupKey, {
                id: categoryDoc ? String(categoryDoc._id) : (categoryId || null),
                name: sectionName,
                image: categoryDoc?.image || '',
                sortOrder: categoryDoc && Number.isFinite(Number(categoryDoc.sortOrder)) ? Number(categoryDoc.sortOrder) : Number.MAX_SAFE_INTEGER,
                items: []
            });
        }

        const resolvedCategoryId = categoryDoc ? String(categoryDoc._id) : (categoryId || null);

        const item = {
            id: String(food._id),
            _id: food._id,
            categoryId: resolvedCategoryId,
            categoryName: sectionName,
            category: sectionName,
            name: food.name,
            description: food.description || '',
            price: getFoodDisplayPrice(food),
            priceOnOtherPlatforms: food.priceOnOtherPlatforms || null,
            otherPlatformGst: food.otherPlatformGst ?? null,
            variants: serializeFoodVariants(food.variants),
            variations: serializeFoodVariants(food.variants),
            image: food.image || '',
            foodType: food.foodType || 'Non-Veg',
            isAvailable: food.isAvailable !== false,
            approvalStatus: food.approvalStatus || 'approved',
            rejectionReason: food.rejectionReason || '',
            requestedAt: food.requestedAt,
            approvedAt: food.approvedAt,
            rejectedAt: food.rejectedAt,
            preparationTime: food.preparationTime || '',
            isRecommended: food.isRecommended === true,
            createdAt: food.createdAt,
            updatedAt: food.updatedAt
        };

        if (food.isRecommended === true && food.isAvailable !== false && food.approvalStatus === 'approved') {
            recommendedDishes.push(item);
        }

        byCategory.get(groupKey).items.push(item);
    }

    const orderedGroups = Array.from(byCategory.values()).sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return String(a.name || '').localeCompare(String(b.name || ''));
    });

    const sections = orderedGroups.map((group, idx) => ({
        id: group.id || `section-${idx}`,
        categoryId: group.id || null,
        name: group.name,
        image: group.image || '',
        sortOrder: Number.isFinite(Number(group.sortOrder)) ? Number(group.sortOrder) : 0,
        itemCount: group.items.length,
        items: group.items.sort((a, b) => {
            const at = new Date(a.createdAt || a.requestedAt || 0).getTime();
            const bt = new Date(b.createdAt || b.requestedAt || 0).getTime();
            return bt - at;
        }),
        subsections: []
    }));

    const categories = sections.map((section) => ({
        id: section.categoryId || section.id,
        categoryId: section.categoryId || null,
        name: section.name,
        image: section.image || '',
        sortOrder: section.sortOrder || 0,
        itemCount: section.itemCount || 0
    }));

    return { sections, categories, recommendedDishes };
};

export async function getRestaurantMenu(restaurantId) {
    if (!restaurantId || !mongoose.Types.ObjectId.isValid(String(restaurantId))) {
        throw new ValidationError('Invalid restaurant id');
    }
    const foods = await FoodItem.find({ restaurantId })
        .sort({ createdAt: -1 })
        .limit(5000)
        .select('-oldData -newData')
        .lean();
    return buildMenuFromFoods(foods);
}

export async function updateRestaurantMenu(restaurantId, body = {}) {
    // Option A: single source of truth (food_items). Menu layout snapshots are disabled.
    // Keep endpoint for backward compatibility, but make it explicit.
    throw new ValidationError('Menu editing is disabled. Menu is generated from food items.');
}

export async function getPublicApprovedRestaurantMenu(restaurantIdOrSlug) {
    const value = String(restaurantIdOrSlug || '').trim();
    if (!value) throw new ValidationError('Restaurant id is required');

    let restaurant = null;
    if (/^[0-9a-fA-F]{24}$/.test(value)) {
        restaurant = await FoodRestaurant.findOne({ _id: value, status: 'approved' })
            .select('_id status')
            .lean();
    } else {
        const normalized = value.trim().toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ');
        restaurant = await FoodRestaurant.findOne({ restaurantNameNormalized: normalized, status: 'approved' })
            .select('_id status')
            .lean();
    }

    if (!restaurant?._id) {
        return null;
    }
    const foods = await FoodItem.find({ restaurantId: restaurant._id, approvalStatus: 'approved' })
        .sort({ createdAt: -1 })
        .limit(2000)
        .select('-oldData -newData')
        .lean();
    return buildMenuFromFoods(foods);
}

export async function syncMenuItemApprovalStatus(restaurantId, itemId, status, rejectionReason = '') {
    // No-op in Option A (menu snapshots removed). Approval status lives only in food_items.
    // Kept to avoid breaking admin approval flows that call this helper.
    return;
}
