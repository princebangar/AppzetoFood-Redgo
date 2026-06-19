import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { FoodItem } from '../../admin/models/food.model.js';
import { FoodCategory } from '../../admin/models/category.model.js';
import mongoose from 'mongoose';

/**
 * Unified Search Service
 * Searches for restaurants by name and also searches for food items, 
 * returning matched restaurants with potential dish highlights.
 */
export const searchUnified = async (query = {}, options = {}) => {
    const { 
        q, 
        lat, 
        lng, 
        radiusKm = 20, 
        categoryId, 
        minRating, 
        maxDeliveryTime, 
        isVeg,
        page = 1,
        limit = 20,
        zoneId
    } = query;

    const skip = (page - 1) * limit;
    const term = String(q || '').trim();
    const regex = term ? new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;

    // 1. Initial Filter (approved status and basic conditions)
    const restaurantFilter = { status: 'approved' };
    
    console.log(`[Search-Service] Querying with term: "${term}", categoryId: "${categoryId}", zoneId: "${zoneId}"`);

    if (zoneId && mongoose.Types.ObjectId.isValid(zoneId)) {
        restaurantFilter.zoneId = new mongoose.Types.ObjectId(zoneId);
    }

    if (isVeg === 'true') {
        restaurantFilter.pureVegRestaurant = true;
    }

    if (minRating) {
        restaurantFilter.rating = { $gte: parseFloat(minRating) };
    }

    if (maxDeliveryTime) {
        restaurantFilter.estimatedDeliveryTimeMinutes = { $lte: parseInt(maxDeliveryTime) };
    }
    
    console.log(`[Search-Service] Final Restaurant Filter:`, JSON.stringify(restaurantFilter));

    let restaurantIds = new Set();
    let restaurantDetailsMap = new Map();

    // 2. Handle Category Filtering (Restaurants don't have categoryId, FoodItems do)
    if (categoryId && mongoose.Types.ObjectId.isValid(categoryId)) {
        const categoryDoc = await FoodCategory.findById(categoryId).select('name').lean();
        let categoryIdsToMatch = [new mongoose.Types.ObjectId(categoryId)];
        if (categoryDoc && categoryDoc.name) {
            const escapedName = categoryDoc.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const sameNamedCategories = await FoodCategory.find({
                name: { $regex: new RegExp('^' + escapedName + '$', 'i') }
            }).select('_id').lean();
            if (sameNamedCategories.length > 0) {
                categoryIdsToMatch = sameNamedCategories.map(c => c._id);
            }
        }

        const catFoodItems = await FoodItem.find({ 
            categoryId: { $in: categoryIdsToMatch },
            approvalStatus: 'approved' 
        }).select('restaurantId').lean();
        
        const catRestaurantIds = [...new Set(catFoodItems.map(f => f.restaurantId.toString()))];
        if (catRestaurantIds.length > 0) {
            restaurantFilter._id = { $in: catRestaurantIds.map(id => new mongoose.Types.ObjectId(id)) };
        } else {
            // No food items in this category -> No restaurants
            return {
                success: true,
                data: { restaurants: [], total: 0, page: parseInt(page), limit: parseInt(limit) }
            };
        }
    }

    // 3. Search Matching
    if (regex) {
        // A. Search by Restaurant Name / Cuisine
        const matchedRestaurants = await FoodRestaurant.find({
            ...restaurantFilter,
            $or: [
                { restaurantName: { $regex: regex } },
                { cuisines: { $regex: regex } }
            ]
        }).limit(limit * 2).lean();

        matchedRestaurants.forEach(r => {
            restaurantIds.add(r._id.toString());
            restaurantDetailsMap.set(r._id.toString(), { ...r, matchType: 'restaurant' });
        });

        // B. Search by Food Item Name
        const foodFilters = { approvalStatus: 'approved' };
        if (isVeg === 'true') foodFilters.foodType = 'Veg';
        
        const matchedFoods = await FoodItem.find({
            ...foodFilters,
            name: { $regex: regex }
        }).limit(limit * 2).lean();

        const foodRestaurantIds = matchedFoods.map(f => f.restaurantId.toString());
        
        if (foodRestaurantIds.length > 0) {
            const unmatchedIds = foodRestaurantIds.filter(id => !restaurantIds.has(id));
            if (unmatchedIds.length > 0) {
                const rsForFoods = await FoodRestaurant.find({
                    ...restaurantFilter,
                    _id: { $in: unmatchedIds.map(id => new mongoose.Types.ObjectId(id)) }
                }).lean();

                rsForFoods.forEach(r => {
                    restaurantIds.add(r._id.toString());
                    restaurantDetailsMap.set(r._id.toString(), { 
                        ...r, 
                        matchType: 'food',
                        matchedDish: matchedFoods.find(f => f.restaurantId.toString() === r._id.toString())?.name,
                        matchedDishImage: matchedFoods.find(f => f.restaurantId.toString() === r._id.toString())?.image,
                        matchedDishId: matchedFoods.find(f => f.restaurantId.toString() === r._id.toString())?._id
                    });
                });
            }
        }
    } else {
        // No search text -> List all restaurants matching filters (category/zone)
        const allMatching = await FoodRestaurant.find(restaurantFilter)
            .sort({ rating: -1, createdAt: -1 })
            .limit(limit * 2)
            .lean();
            
        allMatching.forEach(r => {
            restaurantIds.add(r._id.toString());
            restaurantDetailsMap.set(r._id.toString(), r);
        });
    }

    // 4. Final Result Formatting
    let results = Array.from(restaurantDetailsMap.values());

    // Simple distance sorting if lat/lng are provided
    if (lat && lng && results.length > 0) {
        results.forEach(res => {
            if (res.location && res.location.latitude && res.location.longitude) {
                const dLat = (res.location.latitude - lat) * Math.PI / 180;
                const dLon = (res.location.longitude - lng) * Math.PI / 180;
                const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                          Math.cos(lat * Math.PI / 180) * Math.cos(res.location.latitude * Math.PI / 180) *
                          Math.sin(dLon/2) * Math.sin(dLon/2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                res.distanceScore = 6371 * c; // Km
            } else {
                res.distanceScore = 999;
            }
        });
        results.sort((a, b) => (a.distanceScore || 999) - (b.distanceScore || 999));
    }

    // ... (rest of logic up to result formation)
    const finalResult = {
        success: true,
        data: {
            restaurants: results.slice(skip, skip + limit),
            total: results.length,
            page: parseInt(page),
            limit: parseInt(limit),
            zoneFiltered: !!(zoneId && mongoose.Types.ObjectId.isValid(zoneId))
        }
    };

    return finalResult;
};

/**
 * Fetch Admin-only categories
 */
export const getAdminCategories = async (query = {}) => {
    const zoneId = query.zoneId;

    let approvedCategoryIds = [];
    if (zoneId && mongoose.Types.ObjectId.isValid(zoneId)) {
        const zoneRestaurants = await FoodRestaurant.find({
            zoneId: new mongoose.Types.ObjectId(zoneId),
            status: 'approved'
        }).select('_id').lean();
        const zoneRestaurantIds = zoneRestaurants.map(r => r._id);
        
        approvedCategoryIds = await FoodItem.distinct('categoryId', {
            approvalStatus: 'approved',
            restaurantId: { $in: zoneRestaurantIds },
            categoryId: { $ne: null }
        });
    } else {
        approvedCategoryIds = await FoodItem.distinct('categoryId', {
            approvalStatus: 'approved',
            categoryId: { $ne: null }
        });
    }

    if (!approvedCategoryIds.length) {
        return [];
    }

    const filter = { 
        _id: { $in: approvedCategoryIds },
        isActive: true, 
        isApproved: true,
        $and: [
            {
                $or: [
                    { restaurantId: { $exists: false } },
                    { restaurantId: null },
                    { restaurantId: { $eq: undefined } }
                ]
            }
        ]
    };

    if (zoneId && mongoose.Types.ObjectId.isValid(zoneId)) {
        filter.$and.push({
            $or: [
                { zoneId: new mongoose.Types.ObjectId(zoneId) },
                { zoneId: { $exists: false } },
                { zoneId: null }
            ]
        });
    } else {
        filter.$and.push({
            $or: [
                { zoneId: { $exists: false } },
                { zoneId: null }
            ]
        });
    }

    const list = await FoodCategory.find(filter).sort({ sortOrder: 1, name: 1 }).lean();

    // Deduplicate in memory
    const groups = {};
    for (const cat of list) {
        const key = String(cat.name || '').toLowerCase().trim();
        if (!key) continue;
        if (!groups[key]) {
            groups[key] = [];
        }
        groups[key].push(cat);
    }

    const deduplicated = [];
    for (const key of Object.keys(groups)) {
        const group = groups[key];
        if (group.length === 1) {
            deduplicated.push(group[0]);
            continue;
        }

        group.sort((a, b) => {
            const aZoneMatch = zoneId && String(a.zoneId) === String(zoneId);
            const bZoneMatch = zoneId && String(b.zoneId) === String(zoneId);
            if (aZoneMatch && !bZoneMatch) return -1;
            if (!aZoneMatch && bZoneMatch) return 1;

            const aGlobal = !a.zoneId;
            const bGlobal = !b.zoneId;
            if (aGlobal && !bGlobal) return -1;
            if (!aGlobal && bGlobal) return 1;

            const aHasImg = !!a.image;
            const bHasImg = !!b.image;
            if (aHasImg && !bHasImg) return -1;
            if (!aHasImg && bHasImg) return 1;

            const aOrder = typeof a.sortOrder === 'number' ? a.sortOrder : 0;
            const bOrder = typeof b.sortOrder === 'number' ? b.sortOrder : 0;
            if (aOrder !== bOrder) return aOrder - bOrder;

            const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
            const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
            return bTime - aTime;
        });

        deduplicated.push(group[0]);
    }

    deduplicated.sort((a, b) => {
        const aOrder = typeof a.sortOrder === 'number' ? a.sortOrder : 0;
        const bOrder = typeof b.sortOrder === 'number' ? b.sortOrder : 0;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return String(a.name || '').localeCompare(String(b.name || ''));
    });

    return deduplicated;
};
