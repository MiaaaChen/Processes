import { Types } from 'mongoose';
import { Comment, ICommentDocument } from '@src/models/comment';
import { Like } from '@src/models/like';
import { Event } from '@src/models/event';

export class CommentService {
    /**
     * 建立新評論
     * 
     * @param {string} userId - 使用者ID
     * @param {string} content - 評論內容
     * 
     * 實作重點：
     * 1. 內容長度驗證
     * 2. 使用事務確保資料一致性
     */
    async createComment(
        userId: Types.ObjectId,
        content: string
    ): Promise<boolean> {
        try {
            if (content.length > 280) {
                throw new Error('評論內容超過長度限制');
            }

            const comment = await Comment.create([{
                user: userId,
                content,
                likesCount: 0,
                comments: []
            }]);

            return !!comment;
        } catch (error) {
            console.error('Error in createComment service:', error);
            throw error;
        }
    }

    /**
     * 更新評論
     * 
     * @param {string} commentId - 評論ID
     * @param {string} userId - 使用者ID
     * @param {string} content - 新的評論內容
     * 
     * 實作重點：
     * 1. 使用 updateOne 提高效能
     * 2. 確保只有作者可以更新評論
     */
    async updateComment(
        commentId: Types.ObjectId,
        userId: Types.ObjectId,
        content: string
    ): Promise<boolean> {
        try {
            if (content.length > 280) {
                throw new Error('評論內容超過長度限制');
            }

            const result = await Comment.updateOne(
                { _id: commentId, user: userId },
                {
                    $set: {
                        content,
                        updatedAt: new Date()
                    }
                }
            );

            return result.modifiedCount > 0;
        } catch (error) {
            console.error('Error in updateComment service:', error);
            throw error;
        }
    }

    /**
     * 刪除評論
     * 
     * @param {string} commentId - 評論ID
     * @param {string} userId - 使用者ID
     * 
     * 實作重點：
     * 1. 使用事務確保一致性
     * 2. 同時刪除相關的按讚和通知
     */
    async deleteComment(
        commentId: Types.ObjectId,
        userId: Types.ObjectId
    ): Promise<boolean> {
        try {
            // 刪除指定的評論，並確認該評論屬於指定的使用者
            const comment = await Comment.findOneAndDelete(
                { _id: commentId, user: userId }
            );

            if (!comment) {
                // 如果未找到評論或使用者不匹配，返回 false
                return false;
            }

            // 同時刪除相關的按讚記錄和通知
            await Promise.all([
                // 刪除相關的按讚記錄
                Like.deleteMany({
                    targetModel: "Comment",
                    target: commentId
                }),
                // 刪除相關的通知
                Event.deleteMany({
                    'details.commentId': commentId.toString(),
                    eventType: { $in: ['like', 'comment'] }
                })
            ]);

            // 所有操作成功，返回 true
            return true;
        } catch (error) {
            console.error('Error in deleteComment service:', error);
            throw error;
        }
    }


    /**
     * 處理評論按讚功能
     * 
     * @param {string} commentId - 要按讚的評論ID
     * @param {string} userId - 執行按讚的使用者ID
     * @returns Promise<boolean> - 按讚處理結果
     * 
     * 使用場景：
     * - 當用戶點擊空心愛心時調用
     * - 前端需要維護愛心的狀態，只在未按讚狀態下調用此API
     */
    async likeComment(commentId: Types.ObjectId, userId: Types.ObjectId): Promise<boolean> {
        try {
            // 檢查評論是否存在
            const comment = await Comment.findById(commentId);
            if (!comment) {
                return false;
            }

            // 建立按讚記錄
            const like = await Like.create({
                user: userId,
                target: commentId,
                targetModel: 'Comment'
            });

            // 更新評論的按讚計數
            const updateResult = await Comment.updateOne(
                { _id: commentId },
                { $inc: { likesCount: 1 } }
            );

            if (updateResult.modifiedCount === 0) {
                // 如果更新失敗，移除剛剛建立的按讚記錄以維持一致性
                await Like.deleteOne({ _id: like._id });
                return false;
            }

            // 如果評論不是自己的，建立通知
            if (!comment.user._id.equals(userId)) {
                await Event.create({
                    sender: userId,
                    receiver: comment.user,
                    eventType: 'like',
                    details: {
                        commentId: commentId.toString(),
                        type: 'comment',
                        commentText: comment.content
                    }
                });
            }

            return true;
        } catch (error) {
            console.error('Error in likeComment service:', error);
            if ((error as { code: number }).code === 11000) {
                return false;
            }
            throw error;
        }
    }


    /**
     * 處理取消評論按讚功能
     * 
     * @param {string} commentId - 要取消按讚的評論ID
     * @param {string} userId - 執行取消按讚的使用者ID
     * @returns Promise<boolean> - 取消按讚處理結果
     * 
     * 使用場景：
     * - 當用戶點擊紅色愛心時調用
     * - 前端需要維護愛心的狀態，只在已按讚狀態下調用此API
     */
    async unlikeComment(commentId: Types.ObjectId, userId: Types.ObjectId): Promise<boolean> {
        try {
            // 刪除按讚記錄
            const deleteResult = await Like.deleteOne({
                user: userId,
                target: commentId,
                targetModel: 'Comment'
            });

            if (deleteResult.deletedCount === 0) {
                // 如果沒有找到按讚記錄，返回 false
                return false;
            }

            // 更新評論的按讚計數
            const updateResult = await Comment.updateOne(
                { _id: commentId },
                { $inc: { likesCount: -1 } }
            );

            if (updateResult.modifiedCount === 0) {
                // 如果更新失敗，重新建立按讚記錄以維持一致性
                await Like.create({
                    user: userId,
                    target: commentId,
                    targetModel: 'Comment'
                });
                return false;
            }

            // 刪除相關的通知
            await Event.deleteOne({
                sender: userId,
                'details.commentId': commentId.toString(),
                eventType: 'like'
            });

            return true;
        } catch (error) {
            console.error('Error in unlikeComment:', error);
            throw error;
        }
    }


    /**
     * 根據ID獲取評論
     * 
     * @param {string} commentId - 評論ID
     * 
     * 實作重點：
     * 1. 使用 lean() 提升查詢效能
     * 2. 只選擇必要的欄位
     */
    async getCommentById(
        commentId: Types.ObjectId
    ): Promise<ICommentDocument | null> {
        try {
            return await Comment
                .findById(commentId)
                .populate('user', 'userName accountName avatarUrl')
                .lean();
        } catch (error) {
            console.error('Error in getCommentById service:', error);
            throw error;
        }
    }
}

export const commentService = new CommentService();