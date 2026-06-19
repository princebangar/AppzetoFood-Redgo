import { FoodSystemConfig } from '../models/systemConfig.model.js';
import { ValidationError, NotFoundError } from '../../../../core/auth/errors.js';

// Customization toggles live in FoodSystemConfig as individual keys.
const CUSTOMIZATION_TOGGLES = [
    {
        key: 'cod_enabled',
        defaultValue: true,
        description: 'Global toggle for COD visibility (Excludes Takeaway)'
    },
    {
        key: 'takeaway_cod_enabled',
        defaultValue: true,
        description: 'Global toggle for takeaway COD visibility'
    },
    {
        key: 'delivery_cod_enabled',
        defaultValue: true,
        description: 'Global toggle for delivery COD visibility'
    },
    {
        key: 'dining_cod_enabled',
        defaultValue: true,
        description: 'Global toggle for dining COD visibility'
    },
    {
        key: 'wallet_payment_enabled',
        defaultValue: true,
        description: 'Global toggle for wallet payment availability'
    },
    {
        key: 'online_payment_enabled',
        defaultValue: true,
        description: 'Global toggle for online payment availability'
    },
    {
        key: 'default_location_enabled',
        defaultValue: false,
        description: 'Enforce default Indore location and disable auto-prompt for new users/guests (App Store mode)'
    }
];

function resolveToggleValue(configDoc, defaultValue) {
    if (!configDoc) return defaultValue;
    return configDoc.value === true;
}

function getCustomizationAllowlist() {
    return CUSTOMIZATION_TOGGLES.map(t => t.key);
}

export async function getCustomizationSettings(req, res) {
    const keys = getCustomizationAllowlist();
    const docs = await FoodSystemConfig.find({ key: { $in: keys } }).lean();
    const map = new Map(docs.map(d => [d.key, d]));

    const data = {};
    for (const t of CUSTOMIZATION_TOGGLES) {
        data[t.key] = resolveToggleValue(map.get(t.key) || null, t.defaultValue);
    }

    res.json({ success: true, data });
}

export async function updateCustomizationSettings(req, res) {
    const body = req.body ?? {};
    const allowlist = new Set(getCustomizationAllowlist());

    const updates = [];
    for (const [key, value] of Object.entries(body)) {
        if (!allowlist.has(key)) continue;
        if (typeof value !== 'boolean') {
            throw new ValidationError(`${key} must be a boolean`);
        }
        const meta = CUSTOMIZATION_TOGGLES.find(t => t.key === key);
        updates.push({ key, value, description: meta?.description });
    }

    if (updates.length === 0) {
        throw new ValidationError(`No valid customization keys provided. Allowed: ${getCustomizationAllowlist().join(', ')}`);
    }

    await Promise.all(
        updates.map(u =>
            FoodSystemConfig.findOneAndUpdate(
                { key: u.key },
                {
                    $set: {
                        key: u.key,
                        value: u.value,
                        description: u.description,
                        updatedBy: {
                            role: req.user?.role || 'ADMIN',
                            adminId: req.user?._id,
                            at: new Date()
                        }
                    }
                },
                { upsert: true, new: true }
            )
        )
    );

    const keys = getCustomizationAllowlist();
    const docs = await FoodSystemConfig.find({ key: { $in: keys } }).lean();
    const map = new Map(docs.map(d => [d.key, d]));

    const data = {};
    for (const t of CUSTOMIZATION_TOGGLES) {
        data[t.key] = resolveToggleValue(map.get(t.key) || null, t.defaultValue);
    }

    res.json({ success: true, data });
}

export async function getTakeawayCodStatus(req, res) {
    const toggleMeta = CUSTOMIZATION_TOGGLES.find(t => t.key === 'takeaway_cod_enabled');
    const config = await FoodSystemConfig.findOne({ key: 'takeaway_cod_enabled' }).lean();
    const takeawayCodEnabled = resolveToggleValue(config, toggleMeta?.defaultValue ?? true);
    
    res.json({
        success: true,
        enabled: takeawayCodEnabled,
        data: { takeaway_cod_enabled: takeawayCodEnabled }
    });
}
