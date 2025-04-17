// controllers/postController.ts
import { Request, Response } from 'express';
import { postService, PostService } from '@src/services/postService';
import { hotPostService, HotPostService } from '@src/services/hotPostService';
import { Types } from 'mongoose';
import { IUserDocument, User } from '@src/models/user';
import { Redis } from "ioredis";
import redisClient from "@src/config/redis";
import { Like } from '@src/models/like';
import { Follow } from '@src/models/follow';
export class PostController {
    constructor(private postService: PostService = new PostService(), private hotPostsService: HotPostService = new HotPostService(), private redisClient: Redis) { }

    /**
     * 獲取所有貼文列表
     * GET /api/post
     *
     * @param {string} [req.query.cursor] - 時間戳記，用於實現無限捲動分頁
     * @param {number} [req.query.limit] - 每頁返回的貼文數量，預設值為 10
     * @returns {Promise<void>} 回傳貼文列表、下一頁游標及是否還有更多資料
     *
     * 功能說明：
     * - 採用游標分頁機制實現無限捲動
     * - 只回傳公開用戶的貼文和當前用戶自己的貼文
     * - 優化回傳資料結構，減少不必要的資料傳輸
     */
    getAllPosts = async (req: Request, res: Response): Promise<void> => {
        try {
            const limit = parseInt(req.query.limit as string) || 10;
            const cursor = req.query.cursor as string;  // 上一次請求的最後一篇貼文的 _id
            let currentUserId = undefined;
            if (req.user !== undefined) {
                currentUserId = (req.user as IUserDocument)._id;  // currentUserId 由 authenticateJWT 中間件注入
            }

            if (limit < 1) {
                res.status(400).json({ msg: '無效的參數' });
                return;
            }

            const [allPosts, hotPosts, followPosts] = await Promise.all([
                this.postService.getAllPosts(limit, cursor, currentUserId),
                this.hotPostsService.getHotPosts(),
                currentUserId ? this.postService.getFollowPosts(currentUserId, 10) : Promise.resolve([]),
            ]);

            // Shuffle the combined posts
            const shuffledPosts = this.shuffleArray([...allPosts, ...followPosts, ...hotPosts]);
            // 取得所有貼文的 `_id`
            if (shuffledPosts.length === 0) {
                res.status(200).json({ posts: [], nextCursor: null });
                return;
            }
            const postIds = shuffledPosts.map(post => post._id);

            // 查詢目前使用者對這些貼文的按讚狀態
            const likeStatuses = await Like.find({
                user: currentUserId,
                targetModel: 'Post',
                target: { $in: postIds },
            }).select('target').lean();

            // 將按讚的貼文 ID 放入集合
            const likedPostIds = new Set(likeStatuses.map(like => like.target.toString()));

            // 如果有貼文，取得最後一篇的_id作為下一個 cursor）
            const nextCursor = shuffledPosts.length > 0
                ? shuffledPosts[shuffledPosts.length - 1]._id
                : null;
            // 重新整理回傳資料結構
            res.status(200).json({
                posts: shuffledPosts.map(post => ({
                    postId: post._id,
                    author: {
                        id: post.user._id,
                        userName: (post.user as unknown as IUserDocument).userName,
                        accountName: (post.user as unknown as IUserDocument).accountName,
                        avatarUrl: (post.user as unknown as IUserDocument).avatarUrl
                    },
                    content: post.content,
                    likesCount: post.likesCount,
                    commentCount: post.comments.length || 0,
                    createdAt: post.createdAt,
                    images: post.images,
                    isLiked: likedPostIds.has(post._id.toString()), // 判斷是否按讚
                })),
                nextCursor,  // 提供給前端下次請求使用
            });
        } catch (error) {
            console.error('Error in getAllPosts:', error);
            res.status(500).json({ msg: '伺服器錯誤' });
        }
    }
    getPersonalPosts = async (req: Request, res: Response): Promise<void> => {
        try {
            const limit = parseInt(req.query.limit as string) || 10;
            const cursorStr = req.query.cursor as string;  // 上一次請求的最後一篇貼文的 _id
            const currentUserId = (req.user as IUserDocument)._id;  // currentUserId 由 authenticateJWT 中間件注入
            const targetUserId = req.params.userId;

            const targetUser = await User.findById(targetUserId);
            if (targetUser === null) {
                res.status(404).json({ msg: '找不到使用者' });
                return;
            }
            const isFollowing = await Follow.exists({ follower: currentUserId, following: targetUserId, status: "accepted" });
            if (currentUserId.toString() !== targetUserId && !targetUser.isPublic && !isFollowing) {
                res.status(401).json({ msg: '該使用者未公開個人貼文' });
                return;
            }

            let start: number = 0;
            if (cursorStr) {
                const cursor = parseInt(cursorStr);
                if (isNaN(cursor) || cursor < 0) {
                    res.status(400).json({ msg: '無效的游標' });
                    return;
                }
                // 例如：游標表示「上次拿到第 cursor 筆」，那就從下一筆開始取
                start = cursor + 1;
            }

            const posts = await this.postService.getPersonalPosts(
                new Types.ObjectId(targetUserId),
                start,
                limit
            );
            const postIds = posts.map(post => post._id);
            const nextCursor = posts.length > 0 ? start + posts.length - 1 : null;

            // 查詢目前使用者對這些貼文的按讚狀態
            const likeStatuses = await Like.find({
                user: currentUserId,
                targetModel: 'Post',
                target: { $in: postIds },
            }).select('target').lean();

            // 將按讚的貼文 ID 放入集合
            const likedPostIds = new Set(likeStatuses.map(like => like.target.toString()));
            // 組織回傳資料結構
            const responseData = {
                posts: posts.map((post) => ({
                    postId: post._id.toString(),
                    author: {
                        id: targetUser._id.toString(),
                        userName: targetUser.userName,
                        accountName: targetUser.accountName,
                        avatarUrl: targetUser.avatarUrl
                    },
                    content: post.content,
                    likesCount: post.likesCount,
                    commentCount: post.comments?.length || 0,
                    createdAt: post.createdAt.toISOString(),
                    images: post.images,
                    isLiked: likedPostIds.has(post._id.toString()), // 判斷是否按讚
                })),
                nextCursor,  // 提供給前端下次請求使用
            };

            res.status(200).json(responseData);

        } catch (error) {
            console.error('Error in getPersonalPosts:', error);
            res.status(500).json({ msg: '伺服器錯誤' });
        }
    };

    /**
     * 建立新貼文
     * POST /api/post
     * 
     * 特點：
     * - 從 req.user 取得已認證的使用者資訊，確保安全性
     * - 簡單的錯誤處理，確保系統穩定性
     */
    createPost = async (req: Request, res: Response): Promise<void> => {
        try {
            const { content } = req.body;
            // 透過 req.user 取得已認證的使用者資訊，這裡的型別斷言是必要的
            const user = req.user as IUserDocument;
            // 獲取多張圖片的 URL
            const images = req.files
                ? (req.files as Express.MulterS3.File[]).map(file => file.location)
                : [];

            const newPost = await this.postService.createPost(user._id, content, images);

            // 這樣可以讓前端立即獲得新建立的貼文資料，不需要再次請求。
            res.status(201).json({
                msg: "Post created successfully",
                post: {
                    postId: newPost._id,
                    content: newPost.content,
                    images: newPost.images,
                    createdAt: newPost.createdAt,
                    likesCount: 0,
                    commentCount: 0
                }
            });
        } catch (error) {
            console.error('Error in createPost:', error);
            res.status(500).json({ msg: '伺服器錯誤' });
        }
    }

    /**
     * 更新貼文
     * PATCH /api/post/:postId
     * 
     * 實作重點：
     * 1. 使用 Types.ObjectId 確保 ID 格式正確
     * 2. 回傳 boolean 值判斷是否更新成功
     * 3. 區分 404 (找不到) 和 500 (伺服器錯誤) 的情況
     */
    updatePost = async (req: Request, res: Response): Promise<void> => {
        try {
            const { postId } = req.params;
            const { content } = req.body;
            const images = req.files
                ? (req.files as Express.MulterS3.File[]).map(file => file.location)
                : [];
            const userId = (req.user as IUserDocument)._id;
            // 驗證 postId 是否為有效的 ObjectId
            if (!Types.ObjectId.isValid(postId)) {
                res.status(400).json({ msg: '無效的 postId' });
                return;
            }

            // 使用 Types.ObjectId 轉換字串 ID，確保格式正確
            const result = await this.postService.updatePost(
                new Types.ObjectId(postId),
                userId,
                content,
                images
            );

            // 根據更新結果回傳適當的狀態碼
            if (!result) {
                res.status(404).json({ msg: "Post not found or unauthorized" });
                return;
            }

            res.status(200).json({ msg: "Post updated successfully" });
        } catch (error) {
            console.error('Error in updatePost:', error);
            res.status(500).json({ msg: '伺服器錯誤' });
        }
    }

    /**
     * 刪除貼文
     * DELETE /api/post/:postId
     * 
     * 特點：
     * - 同樣使用 Types.ObjectId 確保 ID 格式正確
     * - 遵循 RESTful API 的設計原則
     */
    deletePost = async (req: Request, res: Response): Promise<void> => {
        try {
            const { postId } = req.params;
            const userId = (req.user as IUserDocument)._id;

            const result = await this.postService.deletePost(
                new Types.ObjectId(postId),
                userId
            );

            if (!result) {
                res.status(404).json({ msg: "Post not found or unauthorized" });
                return;
            }
            await this.redisClient.del(`user:${userId.toString()}:posts`);
            res.status(200).json({ msg: "Post deleted successfully" });
        } catch (error) {
            console.error('Error in deletePost:', error);
            res.status(500).json({ msg: '伺服器錯誤' });
        }
    }

    /**
     * 處理貼文按讚
     * POST /api/posts/:postId/like
     * 
     * 使用場景：
     * - 當用戶點擊空心愛心時調用
     * - 前端需確保只在未按讚狀態下調用
     * 
     * @param {Request} req - 請求物件，需包含 postId 參數和認證用戶資訊
     * @param {Response} res - 回應物件
     */
    likePost = async (req: Request, res: Response): Promise<void> => {
        try {
            const { postId } = req.params;
            const userId = (req.user as IUserDocument)._id;

            const success = await this.postService.likePost(
                new Types.ObjectId(postId),
                userId
            );

            if (!success) {
                res.status(404).json({
                    success: false,
                    message: "貼文不存在"
                });
                return;
            }

            res.status(200).json({
                success: true,
                message: "已按讚"
            });
        } catch (error) {
            console.error('Error in likePost controller:', error);
            res.status(500).json({
                success: false,
                message: '伺服器錯誤'
            });
        }
    }

    /**
     * 處理取消貼文按讚
     * DELETE /api/posts/:postId/like
     * 
     * 使用場景：
     * - 當用戶點擊紅色愛心時調用
     * - 前端需確保只在已按讚狀態下調用
     * 
     * @param {Request} req - 請求物件，需包含 postId 參數和認證用戶資訊
     * @param {Response} res - 回應物件
     */
    unlikePost = async (req: Request, res: Response): Promise<void> => {
        try {
            const { postId } = req.params;
            const userId = (req.user as IUserDocument)._id;

            const success = await this.postService.unlikePost(
                new Types.ObjectId(postId),
                userId
            );

            if (!success) {
                res.status(404).json({
                    success: false,
                    message: "找不到按讚記錄"
                });
                return;
            }

            res.status(200).json({
                success: true,
                message: "已取消按讚"
            });
        } catch (error) {
            console.error('Error in unlikePost controller:', error);
            res.status(500).json({
                success: false,
                message: '伺服器錯誤'
            });
        }
    }

    /**
     * 新增評論到貼文
     * POST /api/post/:postId/comments
     * 
     * 特點：
     * - 使用 201 Created 狀態碼表示成功建立資源
     * - 錯誤處理區分找不到貼文和伺服器錯誤兩種情況
     */
    addComment = async (req: Request, res: Response): Promise<void> => {
        try {
            const { postId } = req.params;
            const { content } = req.body;
            const userId = (req.user as IUserDocument)._id;

            const result = await this.postService.addComment(
                new Types.ObjectId(postId),
                userId,
                content
            );

            if (!result) {
                res.status(404).json({ msg: "Post not found" });
                return;
            }

            res.status(201).json({ msg: "Comment added successfully" });
        } catch (error) {
            console.error('Error in addComment:', error);
            res.status(500).json({ msg: '伺服器錯誤' });
        }
    }
    private shuffleArray = <T>(array: T[]): T[] => {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    };

    getPostComments = async (req: Request, res: Response): Promise<void> => {
        try {
            const { postId } = req.params;
            let currentUserId = undefined;

            const postWithComments = await this.postService.getPostComments(new Types.ObjectId(postId));
            if (!postWithComments) {
                res.status(404).json({ msg: '找不到貼文' });
                return;
            }

            if (req.user) {
                currentUserId = (req.user as IUserDocument)._id;  // currentUserId 由 authenticateJWT 中間件注入
                const likeStatus = await Like.findOne({
                    user: currentUserId,
                    targetModel: 'Post',
                    target: new Types.ObjectId(postId), // 應該是單一目標的查詢
                }).lean();

                // 加入是否按讚的資訊
                postWithComments.isLiked = Boolean(likeStatus);
            }

            res.status(200).json({ postWithComments });
        } catch (error) {
            console.error('Error in getPostComments:', error);
            res.status(500).json({ msg: '伺服器錯誤' });
        }
    }
}

export const postController = new PostController(postService, hotPostService, redisClient);