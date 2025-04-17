import { FilterQuery, Types } from 'mongoose';
import { Post, IPost, IPostDocument } from '@src/models/post';
import { Comment } from '@src/models/comment';
import { Like } from '@src/models/like';
import { Event } from '@src/models/event';
import { User } from '@src/models/user';
import { MongoServerError } from "mongodb";
import { Follow } from '@src/models/follow';
import redisClient from '@src/config/redis';

export class PostService {
    async getPersonalPosts(userId: Types.ObjectId, skip: number, limit: number): Promise<IPostDocument[]> {
        try {
            const query: FilterQuery<IPostDocument> = {};

            // 構建訪問權限查詢條件
            query.$or = [
                { user: userId },
            ];

            const posts = await Post.find(query)
                .sort({ createdAt: -1 }) // 按 createdAt 排序
                .skip(skip)                 // 從第幾筆開始
                .limit(limit)
                .exec();

            return posts;
        } catch (error) {
            console.error('Error in getPersonalPosts:', error);
            throw error;
        }
    }
    getFollowPosts = async (userId: Types.ObjectId, limit: number): Promise<IPostDocument[]> => {
        try {
            const feedKey = `user:${userId.toString()}:feed`;

            // 嘗試從 Redis 獲取快取
            const cachedFeed = await redisClient.get(feedKey);
            if (cachedFeed) {
                const posts: IPostDocument[] = JSON.parse(cachedFeed);
                return posts;
            }

            const following = await Follow.find({ follower: userId }).select('following').lean();
            const followingIds = following.map(f => f.following);
            if (followingIds.length === 0) {
                return [];
            }

            // 為了避免過多數據，只獲取七天內的貼文
            const sevenDayAgo = new Date();
            sevenDayAgo.setDate(sevenDayAgo.getDate() - 7);

            const aggregatedPosts = await Post.aggregate([
                { $match: { user: { $in: followingIds }, createdAt: { $gte: sevenDayAgo } } },
                { $addFields: { random: { $rand: {} } } },
                { $sort: { user: 1, random: 1 } },
                { $group: { _id: "$user", post: { $first: "$$ROOT" } } },
                { $replaceRoot: { newRoot: "$post" } },
                { $sort: { createdAt: -1 } },
                { $limit: limit }
            ]);

            // 隨機打亂貼文順序
            const shuffledPosts = this.shuffleArray(aggregatedPosts);

            // 將結果存入 Redis 快取，設定過期時間為 10 分鐘
            await redisClient.setex(feedKey, 600, JSON.stringify(shuffledPosts));

            return shuffledPosts;
        }
        catch (error) {
            console.error('Error in getFollowPosts:', error);
            throw error;
        }
    }
    /**
     * 隨機打亂陣列順序
     * @param {Array<*>} array - 需要打亂的陣列
     * @returns 打亂後的陣列
     */
    private shuffleArray = <T>(array: T[]): T[] => {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }
    /**
     * 獲取所有貼文，支援無限捲動分頁
     * 
     * @param {number} limit - 每頁返回的貼文數量
     * @param {string} cursor - 分頁游標，為上一頁最後一篇貼文的時間戳
     * @param {string} userId - 當前用戶ID，用於獲取私密貼文
     * 
     * 實現要點：
     * 1. 使用 lean() 提升查詢效能，因為不需要完整的 Mongoose 文檔
     * 2. 只選擇必要的欄位，減少資料傳輸量
     * 3. 同時獲取公開用戶的貼文和用戶自己的貼文
     */
    async getAllPosts(limit: number, cursor?: string, userId?: Types.ObjectId): Promise<IPostDocument[]> {
        try {
            const query: FilterQuery<IPostDocument> = {};

            // 添加游標條件，實現分頁
            if (cursor) {
                query._id = { $lt: cursor }; // _id 必須小於游標
            }

            // 限制只回傳一天內的貼文
            const oneDayAgo = new Date();
            oneDayAgo.setDate(oneDayAgo.getDate() - 365);
            query.createdAt = {
                ...query.createdAt,
                $gte: oneDayAgo // createdAt 必須在一天以內
            };

            // 構建訪問權限查詢條件
            query.$or = [
                { user: userId }, // 用戶自己的貼文
                { user: { $in: await User.find({ isPublic: true }).select('_id') } } // 公開用戶的貼文
            ];

            const posts = await Post.find(query)
                .sort({ createdAt: -1, _id: -1 }) // 按 createdAt 和 _id 排序
                .limit(limit)
                .populate('user', 'userName accountName avatarUrl isPublic')
                .lean(); // 使用 lean() 提升效能

            return posts;
        } catch (error) {
            console.error('Error in getAllPosts:', error);
            throw error;
        }
    }

    /**
     * 建立新貼文
     * 
     * @param {string} userId - 發文用戶ID
     * @param {string} content - 貼文內容
     * 
     * 實現要點：
     * 1. 驗證內容長度限制
     * 2. 初始化必要欄位，確保資料完整性
     */
    async createPost(userId: Types.ObjectId, content: string, images: string[]): Promise<IPostDocument> {
        try {
            if (content.length > 280) {
                throw new Error('貼文內容超過長度限制');
            }
            const post = new Post({
                user: userId,
                content,
                images,
            });

            return await post.save();
        } catch (error) {
            console.error('Error in createPost:', error);
            throw error;
        }
    }

    /**
     * 更新貼文內容
     * 
     * @param {string} postId - 貼文ID
     * @param {string} userId - 當前用戶ID
     * @param {string} content - 新的貼文內容
     * 
     * 實現要點：
     * 1. 使用 updateOne 而非 findOneAndUpdate，因為不需要返回更新後的文檔
     * 2. 通過 modifiedCount 判斷更新是否成功
     * 3. 確保只有貼文作者可以更新內容
     */
    async updatePost(
        postId: Types.ObjectId,
        userId: Types.ObjectId,
        content?: string,
        images?: string[]
    ): Promise<boolean> {
        try {
            if (!content && images?.length === 0) {
                throw new Error('請提供新的貼文內容或圖片');
            }
            const updateData: { content?: string; images?: string[] } = {};

            if (content !== undefined) {
                updateData.content = content;
            }

            if (images?.length !== 0) {
                updateData.images = images;
            }
            const result = await Post.updateOne(
                { _id: postId, user: userId }, // 確保只有作者可以更新
                { $set: updateData }
            );

            return result.modifiedCount > 0; // 根據實際修改數判斷是否成功
        } catch (error) {
            console.error('Error in updatePost:', error);
            throw error;
        }
    }

    /**
     * 刪除貼文及相關資料
     * 
     * @param {string} postId - 貼文ID
     * @param {string} userId - 當前用戶ID
     * 
     * 實現要點：
     * 1. 使用事務確保資料一致性
     * 2. 同時刪除貼文相關的所有資料（評論、按讚、通知）
     * 3. 確保只有作者可以刪除貼文
     */
    async deletePost(postId: Types.ObjectId, userId: Types.ObjectId): Promise<boolean> {
        try {
            // 刪除指定的貼文，並確認該貼文屬於指定的使用者
            const post = await Post.findOneAndDelete(
                { _id: postId, user: userId }
            );

            if (!post) {
                // 如果未找到貼文或使用者不匹配，返回 false
                return false;
            }

            // 同時刪除相關的評論、按讚記錄和通知
            await Promise.all([
                // 刪除所有相關評論
                Comment.deleteMany({ post: postId }),
                // 刪除所有相關按讚記錄
                Like.deleteMany({
                    target: postId,
                    targetModel: 'Post'
                }),
                // 刪除所有相關通知
                Event.deleteMany({
                    'details.postId': postId.toString(),
                    eventType: { $in: ['like', 'comment'] }
                })
            ]);

            // 所有操作成功，返回 true
            return true;
        } catch (error) {
            console.error('Error in deletePost service:', error);
            throw error;
        }
    }


    /**
     * 處理貼文按讚功能
     * 
     * @param {string} postId - 要按讚的貼文ID
     * @param {string} userId - 執行按讚的使用者ID
     * @returns Promise<boolean> - 按讚處理結果
     * 
     * 使用場景：
     * - 當用戶點擊空心愛心時調用此 API
     * - 前端需要維護愛心的狀態
     * - 只在未按讚狀態下調用此 API
     * 
     * 實作重點：
     * 1. 使用 MongoDB 事務確保資料一致性
     * 2. 不檢查重複按讚（由前端控制）
     * 3. 同時處理：
     *    - 建立按讚記錄
     *    - 更新貼文的按讚計數
     *    - 建立通知（若非自己的貼文）
     */
    async likePost(postId: Types.ObjectId, userId: Types.ObjectId): Promise<boolean> {
        try {
            // 檢查貼文是否存在
            const post = await Post.findById(postId);
            if (!post) {
                throw new Error("Post not found");
            }

            // 檢查是否已按讚
            const existingLike = await Like.findOne({
                user: userId,
                target: postId,
                targetModel: 'Post',
            });

            if (existingLike) {
                return true; // 已經按讚，直接返回成功
            }

            // 嘗試插入按讚記錄
            await Like.create({
                user: userId,
                target: postId,
                targetModel: 'Post'
            });

            // 更新貼文按讚計數
            const postUpdateResult = await Post.updateOne(
                { _id: postId },
                { $inc: { likesCount: 1 } }
            );

            if (postUpdateResult.modifiedCount === 0) {
                // 如果更新失敗，移除剛剛建立的按讚記錄以維持一致性
                await Like.deleteOne({
                    user: userId,
                    target: postId,
                    targetModel: 'Post'
                });
                throw new Error("Failed to increment like count");
            }

            // 如果不是自己的貼文，建立通知
            if (!post.user._id.equals(userId)) {
                await Event.create({
                    sender: userId,
                    receiver: post.user,
                    eventType: 'like',
                    details: {
                        postId: postId.toString(),
                        type: 'post',
                        postText: post.content.slice(0, 50) // 只保留部分內容
                    }
                });
            }

            // 所有操作成功，返回 true
            return true;
        } catch (error: unknown) {
            if (error instanceof MongoServerError && error.code === 11000) {
                // 重複點讚，返回 false
                return false;
            }
            // 其他錯誤
            console.error('Error in likePost service:', error);
            throw error;
        }
    }

    /**
     * 處理取消貼文按讚功能
     * 
     * @param {string} postId - 要取消按讚的貼文ID
     * @param {string} userId - 執行取消按讚的使用者ID
     * @returns Promise<boolean> - 取消按讚處理結果
     * 
     * 使用場景：
     * - 當用戶點擊紅色愛心時調用此 API
     * - 前端需要維護愛心的狀態
     * - 只在已按讚狀態下調用此 API
     * 
     * 實作重點：
     * 1. 使用 MongoDB 事務確保資料一致性
     * 2. 使用 deleteOne 直接刪除按讚記錄
     * 3. 同時處理：
     *    - 刪除按讚記錄
     *    - 更新貼文的按讚計數
     *    - 刪除相關通知
     */
    async unlikePost(postId: Types.ObjectId, userId: Types.ObjectId): Promise<boolean> {
        try {
            // 檢查按讚記錄是否存在
            const likeRecord = await Like.findOne({
                user: userId,
                target: postId,
                targetModel: 'Post'
            });

            // 如果按讚記錄不存在，直接返回 false
            if (!likeRecord) {
                return false;
            }

            // 刪除按讚記錄
            const deleteResult = await Like.deleteOne({
                _id: likeRecord._id
            });

            if (deleteResult.deletedCount === 0) {
                // 如果刪除失敗，返回 false
                return false;
            }

            // 更新貼文按讚計數
            const postUpdateResult = await Post.updateOne(
                { _id: postId },
                { $inc: { likesCount: -1 } }
            );

            if (postUpdateResult.modifiedCount === 0) {
                // 如果更新失敗，重新建立被刪除的按讚記錄以維持一致性
                await Like.create({
                    _id: likeRecord._id, // 保持原有的 _id
                    user: userId,
                    target: postId,
                    targetModel: 'Post'
                });
                throw new Error('Failed to decrement like count');
            }

            // 刪除相關的通知
            await Event.deleteOne({
                sender: userId,
                'details.postId': postId.toString(),
                eventType: 'like'
            });

            return true;
        } catch (error: unknown) {
            if (error instanceof MongoServerError && error.code === 11000) {
                // 處理重複鍵錯誤（例如重複建立相同的按讚記錄）
                return false;
            }
            console.error('Error in unlikePost service:', error);
            throw error;
        }
    }


    /**
     * 新增評論到貼文
     * 
     * @param {string} postId - 貼文ID
     * @param {string} userId - 當前用戶ID
     * @param {string} content - 評論內容
     * 
     * 實現要點：
     * 1. 使用 updateOne 高效更新貼文的評論列表
     * 2. 只在真正需要時建立通知
     * 3. 使用事務確保資料一致性
     */
    async addComment(
        postId: Types.ObjectId,
        userId: Types.ObjectId,
        content: string
    ): Promise<boolean> {
        try {
            // 檢查評論內容長度
            if (content.length > 280) {
                throw new Error('評論內容超過長度限制');
            }

            // 檢查貼文是否存在
            const post = await Post.findById(postId);
            if (!post) {
                return false;
            }

            // 建立新評論
            const comment = await Comment.create({
                user: userId,
                content,
                post: postId,
                comments: [],    // 支援巢狀評論
                likesCount: 0
            });

            // 更新貼文的評論列表
            const postUpdateResult = await Post.updateOne(
                { _id: postId },
                { $push: { comments: comment._id } }
            );

            if (postUpdateResult.modifiedCount === 0) {
                // 如果更新失敗，刪除剛建立的評論以維持一致性
                await Comment.deleteOne({ _id: comment._id });
                throw new Error('Failed to update post with new comment');
            }

            // 如果不是自己的貼文，建立通知
            if (!post.user._id.equals(userId)) {
                await Event.create({
                    sender: userId,
                    receiver: post.user,
                    eventType: 'comment',
                    details: {
                        postId: postId.toString(),
                        commentId: comment._id.toString(),
                        postText: post.content.slice(0, 50), // 只保留部分內容
                        commentText: content.slice(0, 50) // 只保留
                    }
                });
            }

            return true;
        } catch (error: unknown) {
            console.error('Error in addComment service:', error);
            throw error;
        }
    }

    async getPostComments(postId: Types.ObjectId): Promise<IPost | null> {
        try {
            // 验证 postId 是否为有效的 ObjectId
            if (!postId || !Types.ObjectId.isValid(postId)) {
                throw new Error("Invalid postId");
            }

            // 查找指定 postId 的贴文，并同时加载相关的评论和用户信息
            const post = await Post.findOne({ _id: postId })
                .populate({
                    path: "comments", // 加载评论
                    populate: {
                        path: "user", // 加载评论的用户信息
                        select: "userName accountName avatarUrl isPublic", // 选择必要的字段
                    },
                })
                .populate({
                    path: "user", // 貼文作者
                    select: "userName accountName avatarUrl isPublic", // 限制貼文作者字段
                })
                .select("content images likesCount commentCount createdAt user comments") // 限制字段返回
                .lean(); // 使用 lean() 提升查询性能

            if (!post) {
                console.error("Post not found for postId:", postId);
                return null;
            }

            return post;
        } catch (error) {
            console.error("Error in getPostComments:", error);
            throw error;
        }
    }
}

export const postService = new PostService();