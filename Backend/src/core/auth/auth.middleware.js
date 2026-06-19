import { verifyAccessToken } from './token.util.js';
import { sendError } from '../../utils/response.js';
import { FoodUser } from '../users/user.model.js';
import { FoodRefreshToken } from '../refreshTokens/refreshToken.model.js';
import { FoodRestaurant } from '../../modules/food/restaurant/models/restaurant.model.js';
import mongoose from 'mongoose';

export const requireAdmin = (req, res, next) => {
    if (req.user?.role !== 'ADMIN') {
        return sendError(res, 403, 'Admin access required');
    }
    next();
};

export const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

    if (!token) {
        return sendError(res, 401, 'Authentication token missing');
    }

    try {
        const decoded = verifyAccessToken(token);
        req.user = {
            userId: decoded.userId,
            role: decoded.role
        };

        // Globally enforce that the user has at least one active refresh token session.
        // If "logout from all devices" was triggered, ALL refresh tokens are deleted,
        // and this explicitly and instantly invalidates any lingering access tokens across all devices.
        const userObjectId = new mongoose.Types.ObjectId(decoded.userId);
        FoodRefreshToken.exists({ userId: userObjectId }).then((hasSession) => {
            if (!hasSession) {
                return sendError(res, 401, 'Session forcefully terminated on all devices');
            }

            if (decoded.role === 'USER') {
                // Enforce active status in real-time - deactivated users are logged out on next request.
                FoodUser.findById(decoded.userId).select('isActive').lean().then((doc) => {
                    if (!doc || doc.isActive === false) {
                        return sendError(res, 401, 'User account is deactivated');
                    }
                    next();
                }).catch(() => sendError(res, 401, 'Authentication failed'));
                return;
            }

            if (decoded.role === 'RESTAURANT') {
                // Enforce approved/onboarding status checks
                FoodRestaurant.findById(decoded.userId).select('status').lean().then((doc) => {
                    if (!doc) {
                        return sendError(res, 401, 'Restaurant account not found');
                    }
                    if (doc.status === 'banned' || doc.status === 'deleted') {
                        return sendError(res, 401, 'Restaurant account is disabled');
                    }
                    if (doc.status !== 'approved') {
                        const url = req.originalUrl || '';
                        const isAllowedRoute =
                            url.endsWith('/current') ||
                            url.includes('/profile') ||
                            url.endsWith('/me') ||
                            url.includes('/delete-account');

                        if (!isAllowedRoute) {
                            return sendError(res, 403, 'Restaurant is not approved yet');
                        }
                    }
                    next();
                }).catch(() => sendError(res, 401, 'Authentication failed'));
                return;
            }

            return next();
        }).catch(() => sendError(res, 401, 'Authentication failed'));
        return;
    } catch (error) {
        return sendError(res, 401, 'Invalid or expired token');
    }
};
